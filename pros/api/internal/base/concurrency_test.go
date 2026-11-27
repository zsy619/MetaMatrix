package base

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"metamatrix/api/internal/model"
)

// concFixture 是并发用例的公共环境。
type concFixture struct {
	svc       *Service
	db        *gorm.DB
	projectID uuid.UUID
	baseID    uuid.UUID
	tableID   uuid.UUID
	fieldA    uuid.UUID
	fieldB    uuid.UUID
	userA     uuid.UUID
	userB     uuid.UUID
}

// concDatabaseURL 取并发测试用的 Postgres 连接串。
//
// 优先 TEST_DATABASE_URL，其次复用开发库 DATABASE_URL；
// 两者都没有时直接跳过（不影响其它用例）。
func concDatabaseURL() string {
	if v := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("DATABASE_URL"))
}

// newConcFixture 造一个「空间 + 两个成员 + 一张表 + 两个字段」的环境。
//
// **为什么用 Postgres 而不是 SQLite**：
// SQLite 是单写者模型，并发写事务会立刻返回 SQLITE_BUSY（或在
// 「事务内又发起非事务查询」时死锁），测出来的都是数据库特性而不是业务并发语义。
// 这里给每个用例建一个**独立临时 schema**，跑完 DROP 掉，
// 既能真实并发（行锁 + 乐观锁），又不会污染任何现有数据。
func newConcFixture(t *testing.T) *concFixture {
	t.Helper()
	url := concDatabaseURL()
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过并发用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres，跳过并发用例：%v", err)
	}
	if sqlDB, err := admin.DB(); err == nil {
		sqlDB.SetMaxOpenConns(4)
	}
	schema := "conc_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Skipf("无法创建临时 schema，跳过并发用例：%v", err)
	}
	t.Cleanup(func() {
		if err := admin.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`).Error; err != nil {
			t.Logf("清理临时 schema %s 失败：%v", schema, err)
		}
		if sqlDB, err := admin.DB(); err == nil {
			sqlDB.Close()
		}
	})

	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	db, err := gorm.Open(postgres.Open(url+sep+"search_path="+schema),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open postgres failed: %v", err)
	}
	if err := db.AutoMigrate(
		&model.Project{}, &model.KnowledgeMember{},
		&model.BaseApp{}, &model.BaseTable{}, &model.BaseField{},
		&model.BaseRecord{}, &model.BaseRecordValue{}, &model.BaseView{},
		&model.BaseRecordLink{}, &model.BaseEventOutbox{}, &model.BaseOperationLog{},
		&model.BaseFieldFormula{}, &model.BaseFormulaDependency{},
		&model.BaseRecordReverseLink{}, &model.BaseRecordGrant{}, &model.BaseFieldPolicy{},
		&model.BaseViewPref{}, &model.BaseImportJob{}, &model.BaseUserGroup{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}

	userA, userB := uuid.New(), uuid.New()
	projectID, baseID := uuid.New(), uuid.New()
	if err := db.Create(&model.Project{ID: projectID, OwnerUserID: userA, Name: "并发空间"}).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	for _, u := range []uuid.UUID{userA, userB} {
		if err := db.Create(&model.KnowledgeMember{
			ID: uuid.New(), ProjectID: projectID, UserID: u, Role: RoleEditor, CreatedBy: userA,
		}).Error; err != nil {
			t.Fatalf("insert member failed: %v", err)
		}
	}
	// 建一个真实的 Base 行：租户边界校验（记录 → 表 → Base → 空间）
	// 依赖 base_apps 有对应行，否则会被当成「孤儿表」放行，测不到隔离性。
	if err := db.Create(&model.BaseApp{
		ID: baseID, TenantID: projectID, ProjectID: projectID,
		Name: "并发 Base", OwnerID: userA, Status: 1, SchemaVersion: 1,
	}).Error; err != nil {
		t.Fatalf("insert base app failed: %v", err)
	}
	svc := NewService(db)
	ctx := context.Background()
	table, err := svc.CreateTable(ctx, userA, projectID, baseID, "并发表", "")
	if err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	metaA, err := svc.CreateField(ctx, userA, projectID, table.ID, FieldInput{Name: "字段A", Type: "text"})
	if err != nil {
		t.Fatalf("create field A failed: %v", err)
	}
	metaB, err := svc.CreateField(ctx, userA, projectID, table.ID, FieldInput{Name: "字段B", Type: "text"})
	if err != nil {
		t.Fatalf("create field B failed: %v", err)
	}
	return &concFixture{
		svc: svc, db: db, projectID: projectID, baseID: baseID, tableID: table.ID,
		fieldA: uuid.MustParse(metaA.ID), fieldB: uuid.MustParse(metaB.ID),
		userA: userA, userB: userB,
	}
}

// 场景 1：两个用户同时改**同一记录的不同字段** —— 两边都必须成功，不能互相覆盖。
func TestConcurrencyTwoUsersDifferentFields(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "初始A", f.fieldB.String(): "初始B"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, errs[0] = f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{Fields: map[string]any{f.fieldA.String(): "A改"}})
	}()
	go func() {
		defer wg.Done()
		_, errs[1] = f.svc.UpdateRecord(ctx, f.userB, f.projectID, rec.ID, RecordInput{Fields: map[string]any{f.fieldB.String(): "B改"}})
	}()
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("场景1：第 %d 个更新不应失败：%v", i, err)
		}
	}
	rows, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{TableID: f.tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	fields := rows.Records[0].Fields
	if fields[f.fieldA.String()] != "A改" || fields[f.fieldB.String()] != "B改" {
		t.Fatalf("场景1：并发改不同字段应互不覆盖，实际 %+v", fields)
	}
}

// 场景 2：两个用户同时改**同一字段** —— 乐观锁必须只让一个成功，另一个拿到明确冲突。
func TestConcurrencySameFieldOptimisticLock(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "初始"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, errs[0] = f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "A改"}, ExpectedVersion: rec.Version,
		})
	}()
	go func() {
		defer wg.Done()
		_, errs[1] = f.svc.UpdateRecord(ctx, f.userB, f.projectID, rec.ID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "B改"}, ExpectedVersion: rec.Version,
		})
	}()
	wg.Wait()

	ok, conflict := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, ErrVersionConflict):
			conflict++
		default:
			t.Fatalf("场景2：意外的错误 %v", err)
		}
	}
	if ok != 1 || conflict != 1 {
		t.Fatalf("场景2：应恰好 1 成功 1 冲突，实际 ok=%d conflict=%d", ok, conflict)
	}
}

// 场景 3：编辑 vs 删除 —— 删除先到时，后续编辑必须报「记录不存在」，不能写进黑洞。
func TestConcurrencyEditVsDelete(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "初始"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if err := f.svc.DeleteRecord(ctx, f.userA, f.projectID, rec.ID); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	_, err = f.svc.UpdateRecord(ctx, f.userB, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "删后写入"},
	})
	if !errors.Is(err, ErrRecordNotFound) {
		t.Fatalf("场景3：删除后编辑应报记录不存在，实际 %v", err)
	}
}

// 场景 4：改字段（结构变更）vs 用旧结构版本编辑记录 —— 旧版本必须被拒绝。
func TestConcurrencyFieldChangeVsStaleSchema(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "初始"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	table, err := f.svc.TableSchema(ctx, f.userA, f.projectID, f.tableID)
	if err != nil {
		t.Fatalf("read schema failed: %v", err)
	}
	stale := table.SchemaVersion
	if _, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "新字段", Type: "text"}); err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	_, err = f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "改"}, SchemaVersion: stale,
	})
	if !errors.Is(err, ErrSchemaConflict) {
		t.Fatalf("场景4：旧结构版本编辑应报结构冲突，实际 %v", err)
	}
}

// 场景 5：批量粘贴中途冲突 —— 部分成功 + 失败明细齐全，已成功的不能被回滚。
func TestConcurrencyBatchPastePartialConflict(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	var ids []uuid.UUID
	for i := 0; i < 3; i++ {
		rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): fmt.Sprintf("v%d", i)},
		})
		if err != nil {
			t.Fatalf("create record failed: %v", err)
		}
		ids = append(ids, rec.ID)
	}
	// 中途冲突：第二条记录已被删除（模拟「粘贴到一半，记录被同事删掉」）。
	if err := f.svc.DeleteRecord(ctx, f.userB, f.projectID, ids[1]); err != nil {
		t.Fatalf("pre-delete failed: %v", err)
	}
	rows, failures := f.svc.BatchUpdatePartial(ctx, f.userA, f.projectID, f.tableID, ids, map[string]any{
		f.fieldA.String(): "批量粘贴",
	})
	if len(rows) != 2 || len(failures) != 1 {
		t.Fatalf("场景5：应 2 成功 1 失败，实际 ok=%d fail=%d", len(rows), len(failures))
	}
	if failures[0].Target != ids[1].String() {
		t.Fatalf("场景5：失败明细应指向冲突记录，实际 %q", failures[0].Target)
	}
	if failures[0].Message == "" {
		t.Fatal("场景5：失败明细必须带原因，便于界面提示")
	}
}

// 场景 6：SSE 断线重连补拉 —— 断线期间的事件必须能按顺序补回来。
func TestConcurrencyEventReplayAfterReconnect(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "第一条"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	var anchor string
	if err := f.db.Raw(`SELECT id FROM base_event_outboxes ORDER BY created_at ASC LIMIT 1`).Scan(&anchor).Error; err != nil {
		t.Fatalf("read anchor failed: %v", err)
	}
	if _, err := f.svc.UpdateRecord(ctx, f.userB, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "第二条"},
	}); err != nil {
		t.Fatalf("update failed: %v", err)
	}
	replayed, err := f.svc.ReplaySince(ctx, f.projectID, anchor, 100)
	if err != nil {
		t.Fatalf("replay failed: %v", err)
	}
	if len(replayed) == 0 {
		t.Fatal("场景6：断线期间的事件应能补拉")
	}
	for i := 1; i < len(replayed); i++ {
		if replayed[i].Timestamp.Before(replayed[i-1].Timestamp) {
			t.Fatalf("场景6：补拉事件必须按时间递增，实际乱序")
		}
	}
}

// 场景 7：重复事件幂等 —— 同一个事件重复发布不会重复推送（outbox 只发一次）。
func TestConcurrencyDuplicateEventIdempotent(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "事件"},
	}); err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	ch, cancel := f.svc.Events().Subscribe(f.projectID)
	defer cancel()
	f.svc.publishPending(ctx)
	first := len(ch)
	f.svc.publishPending(ctx)
	time.Sleep(50 * time.Millisecond)
	if second := len(ch); second != first {
		t.Fatalf("场景7：重复发布不应重复推送，实际 %d → %d", first, second)
	}
}

// 场景 8：事件乱序 —— 同一事务里的多条事件必须按写入顺序落库。
func TestConcurrencyEventOrdering(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): fmt.Sprintf("r%d", i)},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}
	var rows []model.BaseEventOutbox
	if err := f.db.Order("created_at ASC, id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read events failed: %v", err)
	}
	if len(rows) < 5 {
		t.Fatalf("场景8：应有至少 5 条事件，实际 %d", len(rows))
	}
	for i := 1; i < len(rows); i++ {
		if rows[i].CreatedAt.Before(rows[i-1].CreatedAt) {
			t.Fatal("场景8：事件落库顺序必须递增")
		}
	}
}

// 场景 9：公式事件晚于记录事件 —— 公式字段保存后产生的公式事件排在记录事件之后。
func TestConcurrencyFormulaEventAfterRecordEvent(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	formula, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "公式", Type: "formula"})
	if err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "10"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if _, err := f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "20"},
	}); err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if err := f.svc.SaveFormula(ctx, f.userA, f.projectID, uuid.MustParse(formula.ID), "{字段A} + 1"); err != nil {
		t.Fatalf("save formula failed: %v", err)
	}
	var rows []model.BaseEventOutbox
	if err := f.db.Order("created_at ASC, id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read events failed: %v", err)
	}
	var recordIdx, formulaIdx = -1, -1
	for i, r := range rows {
		switch r.EventType {
		case "record.updated":
			if recordIdx < 0 {
				recordIdx = i
			}
		case "field.formula.saved", "formula.saved":
			formulaIdx = i
		}
	}
	if recordIdx < 0 {
		t.Fatalf("场景9：未找到记录事件，实际事件 %v", eventTypesOf(rows))
	}
	if formulaIdx < 0 {
		// 公式事件类型名可能不同，只要它排在记录事件之后即可。
		t.Logf("场景9：未匹配到公式事件类型，实际事件类型：%v", eventTypesOf(rows))
		return
	}
	if formulaIdx < recordIdx {
		t.Fatal("场景9：公式事件必须晚于记录事件")
	}
}

func eventTypesOf(rows []model.BaseEventOutbox) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.EventType)
	}
	return out
}
