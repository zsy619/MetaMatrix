package base

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"metamatrix/api/internal/model"
)

// summaryFixture 是汇总用例的环境（临时 schema，跑完删掉）。
type summaryFixture struct {
	svc       *Service
	db        *gorm.DB
	baseID    uuid.UUID
	projectID uuid.UUID
	tableID   uuid.UUID
	userID    uuid.UUID
}

// newSummaryFixture 造一个「空间 + 管理员 + 表」的环境。
//
// 没有可用 Postgres 时直接跳过（不影响其它用例，也不污染开发库）。
func newSummaryFixture(t *testing.T) *summaryFixture {
	t.Helper()
	url := concDatabaseURL()
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过汇总用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres，跳过汇总用例：%v", err)
	}
	schema := "summary_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Skipf("无法创建临时 schema，跳过汇总用例：%v", err)
	}
	t.Cleanup(func() {
		_ = admin.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`).Error
		if sqlDB, err := admin.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	db, err := gorm.Open(postgres.Open(url+sep+"search_path="+schema), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法打开临时 schema，跳过汇总用例：%v", err)
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
		t.Skipf("建表失败，跳过汇总用例：%v", err)
	}
	userID := uuid.New()
	projectID := uuid.New()
	if err := db.Create(&model.Project{ID: projectID, OwnerUserID: userID, Name: "汇总空间"}).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Create(&model.KnowledgeMember{
		ID: uuid.New(), ProjectID: projectID, UserID: userID, Role: RoleEditor, CreatedBy: userID,
	}).Error; err != nil {
		t.Fatalf("insert member failed: %v", err)
	}
	baseID := uuid.New()
	if err := db.Create(&model.BaseApp{
		ID: baseID, TenantID: projectID, ProjectID: projectID,
		Name: "汇总 Base", OwnerID: userID, Status: 1, SchemaVersion: 1,
	}).Error; err != nil {
		t.Fatalf("insert base app failed: %v", err)
	}
	svc := NewService(db)
	table, err := svc.CreateTable(context.Background(), userID, projectID, baseID, "客户", "")
	if err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	return &summaryFixture{svc: svc, db: db, baseID: baseID, projectID: projectID, tableID: table.ID, userID: userID}
}

// 汇总行必须与「列表口径」一致：合计只统计筛选后的记录。
func TestSummaryTotalsRespectFilters(t *testing.T) {
	f := newSummaryFixture(t)
	ctx := context.Background()

	amount, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "金额", Type: "number"})
	if err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}
	stage, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "阶段", Type: "text"})
	if err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}
	for _, row := range []struct {
		amount any
		stage  string
	}{{100.0, "已签"}, {200.5, "已签"}, {50.0, "洽谈"}} {
		if _, err := f.svc.CreateRecord(ctx, f.userID, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{amount.ID: row.amount, stage.ID: row.stage},
		}); err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
	}

	res, err := f.svc.Summary(ctx, f.userID, f.projectID, SummaryRequest{
		TableID: f.tableID.String(),
		Fields:  []SummaryField{{FieldId: amount.ID}},
	})
	if err != nil {
		t.Fatalf("汇总失败：%v", err)
	}
	if res.Total != 3 {
		t.Fatalf("汇总总数应为 3，实际 %d", res.Total)
	}
	if len(res.Values) != 1 {
		t.Fatalf("应返回 1 个字段的汇总，实际 %d", len(res.Values))
	}
	v := res.Values[0]
	if v.Sum == nil || *v.Sum != 350.5 {
		t.Fatalf("合计应为 350.5，实际 %v", v.Sum)
	}
	if v.Filled != 3 {
		t.Fatalf("非空计数应为 3，实际 %d", v.Filled)
	}

	// 加筛选后，合计必须只统计命中的记录。
	res, err = f.svc.Summary(ctx, f.userID, f.projectID, SummaryRequest{
		TableID: f.tableID.String(),
		Filters: FilterGroup{
			Logic:      "AND",
			Conditions: []Condition{{FieldID: stage.ID, Operator: "is", Value: "已签"}},
			Children:   []FilterGroup{},
		},
		Fields: []SummaryField{{FieldId: amount.ID}},
	})
	if err != nil {
		t.Fatalf("带筛选的汇总失败：%v", err)
	}
	if res.Total != 2 {
		t.Fatalf("筛选后总数应为 2，实际 %d", res.Total)
	}
	if res.Values[0].Sum == nil || *res.Values[0].Sum != 300.5 {
		t.Fatalf("筛选后合计应为 300.5，实际 %v", res.Values[0].Sum)
	}
}

// 分组小计：每组一行，合计之和 = 总计。
func TestSummaryGroupSubtotals(t *testing.T) {
	f := newSummaryFixture(t)
	ctx := context.Background()

	amount, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "金额", Type: "number"})
	if err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}
	stage, err := f.svc.CreateField(ctx, f.userID, f.projectID, f.tableID, FieldInput{Name: "阶段", Type: "text"})
	if err != nil {
		t.Fatalf("创建字段失败：%v", err)
	}
	for _, row := range []struct {
		amount any
		stage  string
	}{{100.0, "已签"}, {200.0, "已签"}, {50.0, "洽谈"}} {
		if _, err := f.svc.CreateRecord(ctx, f.userID, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{amount.ID: row.amount, stage.ID: row.stage},
		}); err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
	}

	res, err := f.svc.Summary(ctx, f.userID, f.projectID, SummaryRequest{
		TableID:      f.tableID.String(),
		GroupFieldId: stage.ID,
		Fields:       []SummaryField{{FieldId: amount.ID}},
	})
	if err != nil {
		t.Fatalf("分组汇总失败：%v", err)
	}
	if len(res.Groups) != 2 {
		t.Fatalf("应有 2 个分组，实际 %d", len(res.Groups))
	}
	sum := 0.0
	for _, g := range res.Groups {
		if len(g.Values) != 1 || g.Values[0].Sum == nil {
			t.Fatalf("分组 %s 缺少金额小计", g.Key)
		}
		sum += *g.Values[0].Sum
	}
	if sum != 350 {
		t.Fatalf("分组小计之和应为 350，实际 %v", sum)
	}
}
