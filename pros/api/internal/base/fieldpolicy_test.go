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

// newPolicyFixture 造一个「空间 + 管理员 + 访客 + 编辑者 + 表 + 字段」的环境。
//
// 字段「密级」配置 permissions.hidden = [viewer]（访客看不到）；
// 字段「备注」配置 permissions.readOnly = [editor]（编辑者能看不能改）。
func newPolicyFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, string, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:fieldpolicy?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseTableSQLite{}, &baseFieldSQLite{},
		&baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseRecordLinkSQLite{}, &baseRecordGrantSQLite{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
		`CREATE TABLE IF NOT EXISTS base_field_formulas (id uuid primary key, table_id uuid, field_id uuid, status integer)`,
		`CREATE TABLE IF NOT EXISTS base_operation_logs (
			id uuid primary key, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
			operator_id uuid, operation varchar(32), before_data json, after_data json,
			request_id varchar(64), created_at datetime)`,
		`CREATE TABLE IF NOT EXISTS base_event_outboxes (
			id uuid primary key, project_id uuid, base_id uuid, table_id uuid,
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
	editorID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, adminID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, viewerID, RoleViewer).Error; err != nil {
		t.Fatalf("insert viewer failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, editorID, RoleEditor).Error; err != nil {
		t.Fatalf("insert editor failed: %v", err)
	}
	baseID := uuid.New()
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: baseID, Name: "客户", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	primary := uuid.New()
	if err := db.Create(&BaseField{
		ID: primary, TableID: tableID, Name: "名称", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create primary failed: %v", err)
	}
	hidden := uuid.New()
	hiddenCfg := `{"permissions":{"hidden":["viewer"]}}`
	if err := db.Create(&BaseField{
		ID: hidden, TableID: tableID, Name: "密级", Type: "text", Status: 1, SortOrder: 1,
		Config: datatypes.JSON([]byte(hiddenCfg)),
	}).Error; err != nil {
		t.Fatalf("create hidden field failed: %v", err)
	}
	readOnly := uuid.New()
	readOnlyCfg := `{"permissions":{"readOnly":["editor"]}}`
	if err := db.Create(&BaseField{
		ID: readOnly, TableID: tableID, Name: "备注", Type: "text", Status: 1, SortOrder: 2,
		Config: datatypes.JSON([]byte(readOnlyCfg)),
	}).Error; err != nil {
		t.Fatalf("create read-only field failed: %v", err)
	}
	return NewService(db), adminID, viewerID, editorID, projectID, tableID, hidden.String(), readOnly.String()
}

// 隐藏字段：访客既拿不到字段元信息，也拿不到字段的值。
func TestHiddenFieldInvisibleToViewer(t *testing.T) {
	svc, adminID, viewerID, _, projectID, tableID, hiddenField, _ := newPolicyFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{
		Fields: map[string]any{hiddenField: "机密"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if row.Fields[hiddenField] != "机密" {
		t.Fatalf("admin should see hidden field value, got %+v", row.Fields)
	}

	viewer, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	for _, meta := range viewer.Fields {
		if meta.ID == hiddenField {
			t.Fatal("hidden field metadata leaked to viewer")
		}
	}
	if len(viewer.Records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(viewer.Records))
	}
	if _, ok := viewer.Records[0].Fields[hiddenField]; ok {
		t.Fatal("hidden field value leaked to viewer")
	}

	// 字段列表同样不返回隐藏字段。
	metas, err := svc.ListFields(ctx, viewerID, projectID, tableID)
	if err != nil {
		t.Fatalf("list fields failed: %v", err)
	}
	for _, meta := range metas {
		if meta.ID == hiddenField {
			t.Fatal("hidden field leaked in field list")
		}
	}
}

// 只读字段：编辑者可以看，但不能写（管理员不受限制）。
func TestReadOnlyFieldRejectsEditorWrite(t *testing.T) {
	svc, adminID, _, editorID, projectID, tableID, _, readOnlyField := newPolicyFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{
		Fields: map[string]any{readOnlyField: "原始备注"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}

	// 编辑者读得到。
	editor, err := svc.Query(ctx, editorID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("editor query failed: %v", err)
	}
	if len(editor.Records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(editor.Records))
	}
	if editor.Records[0].Fields[readOnlyField] != "原始备注" {
		t.Fatalf("editor should read read-only field, got %+v", editor.Records[0].Fields)
	}
	// 元信息上带只读标记，前端据此禁用编辑。
	found := false
	for _, meta := range editor.Fields {
		if meta.ID == readOnlyField {
			found = true
			if !meta.ReadOnly {
				t.Fatal("read-only flag missing in field meta")
			}
		}
	}
	if !found {
		t.Fatal("read-only field missing in field list")
	}

	// 编辑者写入被拒（字段级只读优先于角色可写）。
	if _, err := svc.UpdateRecord(ctx, editorID, projectID, row.ID, RecordInput{
		Fields: map[string]any{readOnlyField: "编辑者改的"},
	}); err == nil {
		t.Fatal("expected error when editor writes read-only field")
	}

	// 管理员可以写。
	if _, err := svc.UpdateRecord(ctx, adminID, projectID, row.ID, RecordInput{
		Fields: map[string]any{readOnlyField: "管理员改的"},
	}); err != nil {
		t.Fatalf("admin write should succeed: %v", err)
	}
}

// 未配置权限的字段不受影响（保持既有行为）。
func TestNoPolicyKeepsFieldVisible(t *testing.T) {
	svc, adminID, viewerID, _, projectID, tableID, _, _ := newPolicyFixture(t)
	ctx := context.Background()
	if _, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{Fields: map[string]any{}}); err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	viewer, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	// 访客可见：名称 + 备注（密级对访客隐藏）。
	if len(viewer.Fields) != 2 {
		t.Fatalf("expected 2 visible fields for viewer, got %d", len(viewer.Fields))
	}
}

// 改字段的类型配置（maxLength 等）不能把字段级权限策略冲掉。
//
// config 是整体覆盖语义：前端改单选项 / 精度时只会提交相关键，
// 如果不做保留，permissions 会静默丢失，权限形同虚设。
func TestUpdateFieldKeepsPermissionPolicy(t *testing.T) {
	svc, adminID, _, _, projectID, _, hiddenField, _ := newPolicyFixture(t)
	ctx := context.Background()

	hiddenUUID, err := uuid.Parse(hiddenField)
	if err != nil {
		t.Fatalf("parse field id failed: %v", err)
	}
	// 只提交 maxLength（模拟前端改文本长度），不带 permissions。
	if _, err := svc.UpdateField(ctx, adminID, projectID, hiddenUUID, FieldUpdateInput{
		Config: map[string]any{"maxLength": 100},
	}); err != nil {
		t.Fatalf("update field failed: %v", err)
	}

	var field BaseField
	if err := svc.db.Where("id = ?", hiddenUUID).First(&field).Error; err != nil {
		t.Fatalf("reload field failed: %v", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(field.Config, &cfg); err != nil {
		t.Fatalf("unmarshal config failed: %v", err)
	}
	perm, ok := cfg["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("permission policy dropped on config update, config=%v", cfg)
	}
	hidden, ok := perm["hidden"].([]any)
	if !ok || len(hidden) != 1 || hidden[0] != RoleViewer {
		t.Fatalf("permission policy corrupted on config update: %v", perm)
	}
}
