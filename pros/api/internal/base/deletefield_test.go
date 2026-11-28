package base

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// newDeleteFieldFixture 造一个最小环境：一个空间 + 一个管理员 + 一张表。
func newDeleteFieldFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:deletefield?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseTableSQLite{}, &baseFieldSQLite{}, &baseRecordSQLite{},
		&baseRecordValueSQLite{}, &baseRecordLinkSQLite{}, &baseRecordReverseLinkSQLite{}, &baseRecordGrantSQLite{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
		`CREATE TABLE IF NOT EXISTS base_field_formulas (
			id uuid primary key, tenant_id uuid, field_id uuid, expression text, ast json,
			calculation_mode varchar(24), formula_version integer, status integer,
			created_at datetime, updated_at datetime)`,
		`CREATE TABLE IF NOT EXISTS base_formula_dependencies (
			id uuid primary key, tenant_id uuid, table_id uuid, formula_field_id uuid,
			dependency_field_id uuid, dependency_type varchar(24), dependency_table_id uuid)`,
		`CREATE TABLE IF NOT EXISTS base_operation_logs (
			id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
			operator_id uuid, operation varchar(32), before_data json, after_data json, change_set json,
			request_id varchar(64), created_at datetime)`,
		`CREATE TABLE IF NOT EXISTS core_users (id uuid primary key, display_name varchar(64), email varchar(128))`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("prepare table failed: %v", err)
		}
	}
	adminID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, adminID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, adminID, RoleAdmin).Error; err != nil {
		t.Fatalf("insert admin failed: %v", err)
	}
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "客户", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	return NewService(db), adminID, projectID, tableID
}

// 删除字段不能报错：公式依赖表没有 field_id 列，
// 按 field_id 删会直接 500（column field_id does not exist）。
func TestDeleteFieldRemovesFormulaArtifacts(t *testing.T) {
	svc, adminID, projectID, tableID := newDeleteFieldFixture(t)
	ctx := context.Background()

	base, err := svc.CreateField(ctx, adminID, projectID, tableID, FieldInput{
		Name: "预算", Type: "number",
	})
	if err != nil {
		t.Fatalf("create base field failed: %v", err)
	}
	formula, err := svc.CreateField(ctx, adminID, projectID, tableID, FieldInput{
		Name: "税额", Type: "formula",
	})
	if err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	astRaw, _ := json.Marshal(map[string]any{"type": "BinaryExpression"})
	if err := svc.db.Create(&BaseFieldFormula{
		ID: uuid.New(), FieldID: mustUUID(formula.ID), Expression: "{预算} * 0.1",
		AST: datatypes.JSON(astRaw), CalculationMode: "sync", FormulaVersion: 1, Status: 1,
	}).Error; err != nil {
		t.Fatalf("create formula row failed: %v", err)
	}
	if err := svc.db.Create(&BaseFormulaDependency{
		ID: uuid.New(), TableID: tableID, FormulaFieldID: mustUUID(formula.ID),
		DependencyFieldID: mustUUID(base.ID), DependencyType: "field", DependencyTableID: &tableID,
	}).Error; err != nil {
		t.Fatalf("create dependency row failed: %v", err)
	}

	if err := svc.DeleteField(ctx, adminID, projectID, mustUUID(formula.ID)); err != nil {
		t.Fatalf("delete formula field failed: %v", err)
	}
	var count int64
	if err := svc.db.Model(&BaseFieldFormula{}).Where("field_id = ?", mustUUID(formula.ID)).Count(&count).Error; err != nil {
		t.Fatalf("count formulas failed: %v", err)
	}
	if count != 0 {
		t.Fatalf("formula definition should be removed with the field, got %d rows", count)
	}
	if err := svc.db.Model(&BaseFormulaDependency{}).
		Where("formula_field_id = ? OR dependency_field_id = ?", mustUUID(formula.ID), mustUUID(formula.ID)).
		Count(&count).Error; err != nil {
		t.Fatalf("count dependencies failed: %v", err)
	}
	if count != 0 {
		t.Fatalf("formula dependencies should be removed with the field, got %d rows", count)
	}
}

// 字段名不能改成空：空名会让表头「没有标题」（只剩一个类型图标）。
func TestUpdateFieldRejectsEmptyName(t *testing.T) {
	svc, adminID, projectID, tableID := newDeleteFieldFixture(t)
	ctx := context.Background()

	field, err := svc.CreateField(ctx, adminID, projectID, tableID, FieldInput{Name: "预算", Type: "number"})
	if err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	empty := "  "
	if _, err := svc.UpdateField(ctx, adminID, projectID, mustUUID(field.ID), FieldUpdateInput{Name: &empty}); err == nil {
		t.Fatal("expected empty name to be rejected")
	}
	keep := "预算"
	meta, err := svc.UpdateField(ctx, adminID, projectID, mustUUID(field.ID), FieldUpdateInput{Name: &keep})
	if err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	if meta.Name != "预算" {
		t.Fatalf("unexpected name %q", meta.Name)
	}
}
