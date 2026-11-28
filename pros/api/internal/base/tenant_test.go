package base

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"metamatrix/api/internal/model"
)

// 租户隔离（tenant_id 显式化 + 记录级租户校验）。
//
// 为什么必须有测试：
//   - 空间就是租户；猜到别的空间的 recordId 就能读数据是**跨空间越权**；
//   - 之前 loadTableSchema / scopeLoadRecord 只按 id 查表，不校验归属；
//   - 修好之后必须有回归测试锁住，否则以后加 JOIN 时很容易又漏掉。

func TestTenantIsolationCrossSpaceRecordDenied(t *testing.T) {
	url := concDatabaseURL()
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过租户隔离用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres，跳过：%v", err)
	}
	schema := "tenant_" + uuid.NewString()[:8]
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Skipf("无法创建临时 schema，跳过：%v", err)
	}
	t.Cleanup(func() { _ = admin.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`).Error })

	sep := "?"
	if len(url) > 0 && url[len(url)-1] == '?' {
		sep = ""
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
		&model.BaseEventOutbox{}, &model.BaseOperationLog{},
		&model.BaseRecordLink{}, &model.BaseRecordReverseLink{}, &model.BaseRecordGrant{},
		&model.BaseFieldPolicy{}, &model.BaseViewPref{},
		&model.BaseFieldFormula{}, &model.BaseFormulaDependency{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}

	ctx := context.Background()
	owner := uuid.New()
	other := uuid.New()
	spaceA := uuid.New()
	spaceB := uuid.New()
	baseA := uuid.New()
	for _, sp := range []uuid.UUID{spaceA, spaceB} {
		if err := db.Create(&model.Project{ID: sp, OwnerUserID: owner, Name: "空间"}).Error; err != nil {
			t.Fatalf("insert project failed: %v", err)
		}
	}
	for _, u := range []uuid.UUID{owner, other} {
		for _, sp := range []uuid.UUID{spaceA, spaceB} {
			if err := db.Create(&model.KnowledgeMember{
				ID: uuid.New(), ProjectID: sp, UserID: u, Role: RoleEditor, CreatedBy: owner,
			}).Error; err != nil {
				t.Fatalf("insert member failed: %v", err)
			}
		}
	}
	if err := db.Create(&model.BaseApp{
		ID: baseA, TenantID: spaceA, ProjectID: spaceA, Name: "A 的 Base", OwnerID: owner, Status: 1,
	}).Error; err != nil {
		t.Fatalf("insert base app failed: %v", err)
	}
	svc := NewService(db)
	table, err := svc.CreateTable(ctx, owner, spaceA, baseA, "A 的表", "")
	if err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	field, err := svc.CreateField(ctx, owner, spaceA, table.ID, FieldInput{Name: "字段", Type: "text"})
	if err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	rec, err := svc.CreateRecord(ctx, owner, spaceA, table.ID, RecordInput{
		Fields: map[string]any{uuid.MustParse(field.ID).String(): "机密"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	// 空间 B 的成员不能读到空间 A 的记录。
	if _, err := svc.GetRecord(ctx, other, spaceB, rec.ID); err == nil {
		t.Fatal("跨空间读取记录必须被拒绝")
	}
	// 空间 B 也不能列出空间 A 的表结构。
	if _, _, err := svc.loadTableSchema(ctx, other, spaceB, table.ID); err == nil {
		t.Fatal("跨空间读取表结构必须被拒绝")
	}
	// 空间 A 的成员照常能读。
	if _, err := svc.GetRecord(ctx, owner, spaceA, rec.ID); err != nil {
		t.Fatalf("同空间读取必须成功：%v", err)
	}
}
