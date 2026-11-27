package base

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// newBundleFixture 造一个「空间 + 管理员 + 访客 + 表」的环境。
// 表里有三个字段：客户名称（主字段）、预算、税额；
// 税额配置了条件可见：预算 > 10000 的记录才看得到税额。
func newBundleFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, string, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:cfgbundle?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseTableSQLite{}, &baseFieldSQLite{}, &baseViewSQLite{}, &baseViewPrefSQLite{},
		&baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseRecordLinkSQLite{}, &baseRecordReverseLinkSQLite{}, &baseRecordGrantSQLite{},
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
			operator_id uuid, operation varchar(32), before_data json, after_data json,
			request_id varchar(64), created_at datetime)`,
		`CREATE TABLE IF NOT EXISTS core_users (id uuid primary key, display_name varchar(64), email varchar(128))`,
		`CREATE TABLE IF NOT EXISTS base_event_outboxes (
			id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid,
			aggregate_type varchar(32), aggregate_id uuid, event_type varchar(64),
			payload json, status varchar(16), retry_count integer,
			created_at datetime, published_at datetime)`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("prepare table failed: %v", err)
		}
	}
	adminID := uuid.New()
	viewerID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, adminID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, viewerID, RoleViewer).Error; err != nil {
		t.Fatalf("insert viewer failed: %v", err)
	}
	baseID := uuid.New()
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: baseID, Name: "客户管理", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	nameID := uuid.New()
	if err := db.Create(&BaseField{
		ID: nameID, TableID: tableID, Name: "客户名称", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create name field failed: %v", err)
	}
	budgetID := uuid.New()
	if err := db.Create(&BaseField{
		ID: budgetID, TableID: tableID, Name: "预算", Type: "number", Status: 1, SortOrder: 1,
	}).Error; err != nil {
		t.Fatalf("create budget field failed: %v", err)
	}
	taxID := uuid.New()
	cond := map[string]any{
		"logic":      "AND",
		"conditions": []any{map[string]any{"fieldId": budgetID.String(), "operator": "gt", "value": 10000}},
	}
	raw, _ := json.Marshal(map[string]any{
		"permissions": map[string]any{"visibleWhen": cond},
	})
	if err := db.Create(&BaseField{
		ID: taxID, TableID: tableID, Name: "税额", Type: "number", Status: 1, SortOrder: 2,
		Config: datatypes.JSON(raw),
	}).Error; err != nil {
		t.Fatalf("create tax field failed: %v", err)
	}
	// 一个公式字段：税额合计 = 预算 * 0.1
	formulaID := uuid.New()
	if err := db.Create(&BaseField{
		ID: formulaID, TableID: tableID, Name: "税额合计", Type: "formula", Status: 1, SortOrder: 3,
	}).Error; err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	astRaw, _ := json.Marshal(map[string]any{"type": "BinaryExpression"})
	if err := db.Create(&BaseFieldFormula{
		ID: uuid.New(), FieldID: formulaID, Expression: "{预算} * 0.1",
		AST: datatypes.JSON(astRaw), CalculationMode: "sync", FormulaVersion: 1, Status: 1,
	}).Error; err != nil {
		t.Fatalf("create formula record failed: %v", err)
	}
	return NewService(db), adminID, viewerID, projectID, baseID, tableID, budgetID.String(), taxID.String()
}

// 导出 → 导入：字段结构与权限策略都要带过去，
// 且条件里的字段引用必须重映射到新表的字段 ID（否则策略静默失效）。
func TestConfigBundleRoundTripKeepsStrategy(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, budgetID, taxID := newBundleFixture(t)
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	if bundle.FormatVersion != ConfigBundleFormatVersion {
		t.Fatalf("unexpected bundle version %d", bundle.FormatVersion)
	}
	if len(bundle.Fields) != 4 {
		t.Fatalf("expect 4 fields in bundle, got %d", len(bundle.Fields))
	}
	// 导出的税额字段必须带着条件可见策略。
	var taxBundle *BundleField
	for i := range bundle.Fields {
		if bundle.Fields[i].Key == taxID {
			taxBundle = &bundle.Fields[i]
		}
	}
	if taxBundle == nil {
		t.Fatal("tax field missing in bundle")
	}
	if _, ok := taxBundle.Config["permissions"]; !ok {
		t.Fatal("tax field permissions missing in bundle")
	}

	res, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	if res == nil || res.Table == nil || res.Table.ID == uuid.Nil {
		t.Fatal("import returned empty table info")
	}
	fields, err := svc.ListFields(ctx, adminID, projectID, res.Table.ID)
	if err != nil {
		t.Fatalf("list imported fields failed: %v", err)
	}
	if len(fields) != 4 {
		t.Fatalf("expect 4 fields in imported table, got %d", len(fields))
	}
	byName := map[string]FieldMeta{}
	for _, f := range fields {
		byName[f.Name] = f
	}
	for _, want := range []string{"客户名称", "预算", "税额", "税额合计"} {
		if _, ok := byName[want]; !ok {
			t.Fatalf("field %q missing after import", want)
		}
	}
	// 公式必须被还原（公式在 base_field_formulas 表，不在字段 config 里）。
	newFormula := byName["税额合计"]
	var formulaRow BaseFieldFormula
	if err := svc.db.Where("field_id = ? AND status = 1", newFormula.ID).First(&formulaRow).Error; err != nil {
		t.Fatalf("imported formula not restored: %v", err)
	}
	if formulaRow.Expression != "{预算} * 0.1" {
		t.Fatalf("unexpected formula expression %q", formulaRow.Expression)
	}
	// 条件里的 fieldId 必须换成新表里的预算字段 ID，且不等于旧 ID。
	newTax := byName["税额"]
	perms, _ := newTax.Config["permissions"].(map[string]any)
	if perms == nil {
		t.Fatalf("imported tax field lost permissions: %v", newTax.Config)
	}
	group, _ := perms["visibleWhen"].(map[string]any)
	if group == nil {
		t.Fatalf("imported tax field lost visibleWhen: %v", perms)
	}
	conds, _ := group["conditions"].([]any)
	if len(conds) != 1 {
		t.Fatalf("expect 1 condition, got %d", len(conds))
	}
	cond, _ := conds[0].(map[string]any)
	gotField, _ := cond["fieldId"].(string)
	if gotField == "" {
		t.Fatalf("condition lost fieldId: %v", cond)
	}
	if gotField == budgetID {
		t.Fatal("condition fieldId was not remapped to the new table")
	}
	if gotField != byName["预算"].ID {
		t.Fatalf("condition fieldId %s != new budget field %s", gotField, byName["预算"].ID)
	}
}

// 条件引用的字段不在包里 → 该条件必须被丢弃（不能留一条永远不成立的假策略）。
func TestConfigBundleDropsCrossTableCondition(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, budgetID, _ := newBundleFixture(t)
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	// 把「预算」从包里删掉，税额的条件就引用不到字段了。
	kept := bundle.Fields[:0]
	for _, f := range bundle.Fields {
		if f.Key == budgetID {
			continue
		}
		kept = append(kept, f)
	}
	bundle.Fields = kept

	res, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	fields, err := svc.ListFields(ctx, adminID, projectID, res.Table.ID)
	if err != nil {
		t.Fatalf("list imported fields failed: %v", err)
	}
	for _, f := range fields {
		if f.Name != "税额" {
			continue
		}
		perms, _ := f.Config["permissions"].(map[string]any)
		if perms != nil {
			if group, ok := perms["visibleWhen"]; ok {
				t.Fatalf("cross-table condition should be dropped, got %v", group)
			}
		}
		return
	}
	t.Fatal("tax field missing after import")
}

// 公式引用了包外字段 → 公式跳过并给出提示（不能塞一个永远算错的公式）。
func TestConfigBundleSkipsFormulaWithMissingField(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, budgetID, _ := newBundleFixture(t)
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	// 把「预算」从包里删掉 → 公式「{预算} * 0.1」引用不到字段了。
	kept := bundle.Fields[:0]
	for _, f := range bundle.Fields {
		if f.Key == budgetID {
			continue
		}
		kept = append(kept, f)
	}
	bundle.Fields = kept

	res, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	if len(res.Warnings) == 0 {
		t.Fatal("expect a warning about skipped formula")
	}
	fields, err := svc.ListFields(ctx, adminID, projectID, res.Table.ID)
	if err != nil {
		t.Fatalf("list imported fields failed: %v", err)
	}
	for _, f := range fields {
		if f.Name != "税额合计" {
			continue
		}
		var formulaRow BaseFieldFormula
		err := svc.db.Where("field_id = ? AND status = 1", f.ID).First(&formulaRow).Error
		if err == nil {
			t.Fatalf("formula with missing field should be skipped, got %q", formulaRow.Expression)
		}
		return
	}
	t.Fatal("formula field missing after import")
}

// 合并到已有表：同名字段跳过、新字段补建、条件引用复用目标表已有字段 ID。
func TestConfigBundleMergeIntoExistingTable(t *testing.T) {
	svc, adminID, _, projectID, _, tableID, budgetID, taxID := newBundleFixture(t)
	ctx := context.Background()

	// 先导出原表（预算 / 税额 / 客户名称 / 税额合计）。
	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	// 模拟「目标表已有预算、但缺客户名称」：删掉客户名称再加一个新字段「来源」。
	kept := make([]BundleField, 0, len(bundle.Fields))
	for _, f := range bundle.Fields {
		if f.Name == "客户名称" {
			continue
		}
		kept = append(kept, f)
	}
	kept = append(kept, BundleField{Key: "new-source", Name: "来源", Type: "text", SortOrder: 9})
	bundle.Fields = kept

	res, err := svc.MergeTableConfig(ctx, adminID, projectID, tableID, bundle)
	if err != nil {
		t.Fatalf("merge failed: %v", err)
	}
	if res.Table == nil || res.Table.ID != tableID {
		t.Fatalf("merge should keep the target table, got %v", res.Table)
	}
	fields, err := svc.ListFields(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("list fields failed: %v", err)
	}
	byName := map[string]FieldMeta{}
	for _, f := range fields {
		byName[f.Name] = f
	}
	if _, ok := byName["来源"]; !ok {
		t.Fatal("merge should create the missing field 来源")
	}
	// 合并**不会删除**目标表已有字段（包没带的字段一律保留）。
	if _, ok := byName["客户名称"]; !ok {
		t.Fatal("merge must not delete existing fields")
	}
	// 已存在的字段被跳过要有提示。
	skipped := false
	for _, w := range res.Warnings {
		if strings.Contains(w, "预算") {
			skipped = true
		}
	}
	if !skipped {
		t.Fatalf("expect a warning about skipped existing field, got %v", res.Warnings)
	}
	// 条件引用（税额 → 预算）必须指向目标表里**已有**的预算字段 ID。
	tax := byName["税额"]
	perms, _ := tax.Config["permissions"].(map[string]any)
	if perms == nil {
		t.Fatalf("merged tax field lost permissions: %v", tax.Config)
	}
	group, _ := perms["visibleWhen"].(map[string]any)
	conds, _ := group["conditions"].([]any)
	if len(conds) != 1 {
		t.Fatalf("expect 1 condition, got %v", group)
	}
	cond, _ := conds[0].(map[string]any)
	if cond["fieldId"] != budgetID {
		t.Fatalf("condition should reuse the existing budget field id %s, got %v", budgetID, cond["fieldId"])
	}
	_ = taxID
}
