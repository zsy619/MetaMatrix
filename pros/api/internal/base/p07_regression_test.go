package base

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// P-07：批量更新 / 关键字检索的回归用例（本轮遗留项）。
//
// 这两个用例的作用是**锁住往返数**：
//   - 批量更新的 SELECT 次数不能随行数线性增长（N+1）；
//   - 关键字检索在没有 JSON 字段的表上不能出现 JSON 分支（最贵的一段）。

// countingLogger 统计执行过的 SQL 语句，按动词分类。
type countingLogger struct {
	logger.Interface
	mu     sync.Mutex
	counts map[string]int
}

func newCountingLogger() *countingLogger {
	return &countingLogger{
		Interface: logger.Default.LogMode(logger.Silent),
		counts:    map[string]int{},
	}
}

func (l *countingLogger) LogMode(level logger.LogLevel) logger.Interface {
	l.Interface = l.Interface.LogMode(level)
	return l
}

func (l *countingLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	sql, _ := fc()
	verb := "OTHER"
	trimmed := strings.TrimSpace(strings.ToUpper(sql))
	for _, v := range []string{"SELECT", "INSERT", "UPDATE", "DELETE"} {
		if strings.HasPrefix(trimmed, v) {
			verb = v
			break
		}
	}
	l.mu.Lock()
	l.counts[verb]++
	l.mu.Unlock()
}

func (l *countingLogger) snapshot() map[string]int {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make(map[string]int, len(l.counts))
	for k, v := range l.counts {
		out[k] = v
	}
	return out
}

func (l *countingLogger) reset() {
	l.mu.Lock()
	l.counts = map[string]int{}
	l.mu.Unlock()
}

// TestBatchUpdateSelectCountNotLinearInRows 锁住批量更新的 N+1。
//
// 旧实现逐行调 UpdateRecord：每一行都要重查目标记录、字段元数据、
// 公式定义、可见性策略 —— 100 行就是几百次 SELECT。
// 现在共享上下文一次取齐，SELECT 次数必须与行数**无关**。
//
// 断言方式：分别用 10 行和 40 行跑一次批量更新，比较 SELECT 次数。
// SELECT 次数的增长必须是常数级（<= 2），而不是随行数线性增长。
func TestBatchUpdateSelectCountNotLinearInRows(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	ids := make([]uuid.UUID, 0, 40)
	for i := 0; i < 40; i++ {
		row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "初值"},
		})
		if err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
		ids = append(ids, row.ID)
	}

	// 换一个带计数 logger 的会话（共用同一条连接池）。
	count := newCountingLogger()
	sess := f.db.Session(&gorm.Session{Logger: count})
	svc := NewService(sess)

	// 先跑 10 行，量一次 SELECT 次数。
	count.reset()
	if _, err := svc.BatchUpdate(ctx, f.userA, f.projectID, f.tableID, ids[:10],
		map[string]any{f.fieldA.String(): "十行"}); err != nil {
		t.Fatalf("批量更新（10 行）失败：%v", err)
	}
	small := count.snapshot()

	// 再跑 40 行，量一次。
	count.reset()
	if _, err := svc.BatchUpdate(ctx, f.userA, f.projectID, f.tableID, ids,
		map[string]any{f.fieldA.String(): "四十行"}); err != nil {
		t.Fatalf("批量更新（40 行）失败：%v", err)
	}
	large := count.snapshot()

	delta := large["SELECT"] - small["SELECT"]
	if delta > 2 {
		t.Fatalf("批量更新的 SELECT 次数不应随行数线性增长：10 行 %d 次，40 行 %d 次（多出 %d 次）",
			small["SELECT"], large["SELECT"], delta)
	}
	// UPDATEs 允许随行数增长（每行一次写），但不能多出别的一整套查询。
	// 这里只断言 SELECT，UPDATE 的增长是预期行为。
	t.Logf("批量更新往返数：10 行 %v，40 行 %v", small, large)
}

// TestKeywordSearchSkipsJSONBranchWhenNoJSONField 锁住关键字检索的分支裁剪。
//
// 关键字检索最贵的一段是 JSON 分支：`value_json::text ILIKE ?`
// 每行都要把 JSONB 序列化成文本，而且**走不了任何索引**。
// 所以表里没有 JSON 类字段时，这条分支必须整个消失。
func TestKeywordSearchSkipsJSONBranchWhenNoJSONField(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	idx, err := f.svc.loadFieldIndex(ctx, f.tableID)
	if err != nil {
		t.Fatalf("加载字段索引失败：%v", err)
	}
	cond, _, complete := f.svc.compileKeyword(ctx, f.projectID, f.tableID, idx, "关键字")
	if strings.Contains(cond, "value_json") {
		t.Fatalf("没有 JSON 字段的表不应拼出 JSON 检索分支，实际条件：%s", cond)
	}
	if complete == nil {
		t.Fatalf("纯文本表的关键字检索应能拿到完整命中集合")
	}

	// 加一个 JSON 字段（附件）后，JSON 分支必须出现。
	jsonMeta, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{
		Name: "附件字段", Type: string(FieldAttachment),
	})
	if err != nil {
		t.Fatalf("创建附件字段失败：%v", err)
	}
	idx2, err := f.svc.loadFieldIndex(ctx, f.tableID)
	if err != nil {
		t.Fatalf("重新加载字段索引失败：%v", err)
	}
	cond2, _, complete2 := f.svc.compileKeyword(ctx, f.projectID, f.tableID, idx2, "关键字")
	if !strings.Contains(cond2, "value_json") {
		t.Fatalf("有 JSON 字段时应拼出 JSON 检索分支，实际条件：%s", cond2)
	}
	if complete2 != nil {
		t.Fatalf("存在 JSON 字段时命中集合不完整，不应返回完整集合")
	}
	_ = jsonMeta
}

// TestCrossTableDependencyEdgePersisted 锁住跨表依赖边（A-06）。
//
// 引用 / 汇总字段指向别的表这件事，过去只存在字段配置 JSON 里，
// 「谁依赖我」的反查没有索引可走。现在跨表依赖要写进依赖图，
// 并且字段被删时依赖边必须一起消失（不能留悬空边）。
func TestCrossTableDependencyEdgePersisted(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	tableB, err := f.svc.CreateTable(ctx, f.userA, f.projectID, f.baseID, "依赖表", "")
	if err != nil {
		t.Fatalf("建依赖表失败：%v", err)
	}
	lookupField, err := f.svc.CreateField(ctx, f.userA, f.projectID, tableB.ID, FieldInput{
		Name: "引用", Type: string(FieldLookup),
		Config: map[string]any{
			"targetTableId": f.tableID.String(),
			"targetFieldId": f.fieldA.String(),
		},
	})
	if err != nil {
		t.Fatalf("建引用字段失败：%v", err)
	}

	var edges []BaseFormulaDependency
	if err := f.db.Where("formula_field_id = ?", uuid.MustParse(lookupField.ID)).Find(&edges).Error; err != nil {
		t.Fatalf("查依赖边失败：%v", err)
	}
	if len(edges) != 1 {
		t.Fatalf("引用字段应写入 1 条跨表依赖边，实际 %d 条", len(edges))
	}
	if edges[0].DependencyTableID == nil || *edges[0].DependencyTableID != f.tableID {
		t.Fatalf("依赖边应指向目标表 %s，实际 %v", f.tableID, edges[0].DependencyTableID)
	}
	if edges[0].DependencyType != string(FieldLookup) {
		t.Fatalf("依赖类型应为 lookup，实际 %s", edges[0].DependencyType)
	}

	// 反查：目标表的依赖方里应包含表 B。
	depTables, err := f.svc.dependentTableIDs(ctx, f.tableID)
	if err != nil {
		t.Fatalf("反查依赖方失败：%v", err)
	}
	found := false
	for _, id := range depTables {
		if id == tableB.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("反查依赖方应命中表 B，实际 %v", depTables)
	}

	// 删字段 → 依赖边必须一起清掉。
	if err := f.svc.DeleteField(ctx, f.userA, f.projectID, uuid.MustParse(lookupField.ID)); err != nil {
		t.Fatalf("删字段失败：%v", err)
	}
	var left int64
	if err := f.db.Model(&BaseFormulaDependency{}).
		Where("formula_field_id = ?", uuid.MustParse(lookupField.ID)).Count(&left).Error; err != nil {
		t.Fatalf("统计残留依赖边失败：%v", err)
	}
	if left != 0 {
		t.Fatalf("删字段后不应残留依赖边，实际 %d 条", left)
	}
}

// TestAuditChangeSetRecordsFieldLevelDiff 锁住审计的字段级变更集（A-05）。
//
// 审计原来只存 before / after 两份完整快照：看不出「到底改了哪几个字段」。
// 现在每条审计额外记一份变更集，只包含真正变化的字段。
func TestAuditChangeSetRecordsFieldLevelDiff(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "初值", f.fieldB.String(): "另一个"},
	})
	if err != nil {
		t.Fatalf("创建记录失败：%v", err)
	}
	if _, err := f.svc.UpdateRecord(ctx, f.userA, f.projectID, row.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "新值"},
	}); err != nil {
		t.Fatalf("更新记录失败：%v", err)
	}

	var logs []BaseOperationLog
	if err := f.db.Where("record_id = ? AND operation = ?", row.ID, "record.updated").
		Order("created_at DESC").Find(&logs).Error; err != nil {
		t.Fatalf("查审计失败：%v", err)
	}
	if len(logs) == 0 {
		t.Fatalf("应存在一条 record.updated 审计")
	}
	changes := diffAuditValues(map[string]any{
		f.fieldA.String(): "初值",
		f.fieldB.String(): "另一个",
	}, map[string]any{
		f.fieldA.String(): "新值",
		f.fieldB.String(): "另一个",
	})
	if len(changes) != 1 {
		t.Fatalf("只改了一个字段，变更集应只有 1 条，实际 %d 条：%+v", len(changes), changes)
	}
	if changes[0].FieldID != f.fieldA.String() || changes[0].Kind != "modified" {
		t.Fatalf("变更集内容不对：%+v", changes[0])
	}

	// 审计行里要真的落了变更集。
	stored := logs[0].ChangeSet
	if len(stored) == 0 {
		t.Fatalf("审计行未落变更集")
	}
	var decoded []FieldChange
	if err := json.Unmarshal(stored, &decoded); err != nil {
		t.Fatalf("变更集反序列化失败：%v", err)
	}
	if len(decoded) != 1 || decoded[0].FieldID != f.fieldA.String() {
		t.Fatalf("审计里的变更集不对：%+v", decoded)
	}
}
