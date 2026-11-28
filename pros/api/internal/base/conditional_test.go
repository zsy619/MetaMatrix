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

// newCondFixture 造一个「空间 + 管理员 + 访客 + 编辑者 + 表」的环境，
// 字段「税额」配置了条件可见：预算 > 10000 的记录才看得到税额。
func newCondFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, string, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:condvis?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseTableSQLite{}, &baseFieldSQLite{},
		&baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseRecordLinkSQLite{}, &baseRecordReverseLinkSQLite{}, &baseRecordGrantSQLite{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
		`CREATE TABLE IF NOT EXISTS base_field_formulas (id uuid primary key, table_id uuid, field_id uuid, status integer)`,
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
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "客户", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	budgetID := uuid.New()
	if err := db.Create(&BaseField{
		ID: budgetID, TableID: tableID, Name: "预算", Type: "number", Status: 1, SortOrder: 0,
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
		ID: taxID, TableID: tableID, Name: "税额", Type: "number", Status: 1, SortOrder: 1,
		Config: datatypes.JSON(raw),
	}).Error; err != nil {
		t.Fatalf("create tax field failed: %v", err)
	}
	return NewService(db), adminID, viewerID, editorID, projectID, tableID, budgetID.String(), taxID.String()
}

// 条件可见：满足条件的记录能看到字段值，不满足的值不过网（并给出占位依据）。
func TestConditionalVisibilityHidesValue(t *testing.T) {
	svc, adminID, viewerID, _, projectID, tableID, budgetID, taxID := newCondFixture(t)
	ctx := context.Background()

	high, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{
		Fields: map[string]any{budgetID: 120000, taxID: 12000},
	})
	if err != nil {
		t.Fatalf("create high record failed: %v", err)
	}
	// 低预算记录：不满足条件的字段**根本写不进去**（服务端直接拒绝）。
	low, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{
		Fields: map[string]any{budgetID: 5000},
	})
	if err != nil {
		t.Fatalf("create low record failed: %v", err)
	}

	res, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	for _, meta := range res.Fields {
		if meta.ID == taxID && !meta.Conditional {
			t.Fatal("tax field should be flagged as conditional")
		}
	}
	for _, row := range res.Records {
		switch row.ID {
		case high.ID:
			if row.Fields[taxID] == nil {
				t.Fatal("high-budget record should expose tax value")
			}
			if len(row.ConditionalHidden) != 0 {
				t.Fatalf("high-budget record should not be conditionally hidden: %+v", row.ConditionalHidden)
			}
		case low.ID:
			if _, ok := row.Fields[taxID]; ok {
				t.Fatal("low-budget record must not expose tax value")
			}
			found := false
			for _, id := range row.ConditionalHidden {
				if id == taxID {
					found = true
				}
			}
			if !found {
				t.Fatalf("low-budget record should report conditional hidden field: %+v", row.ConditionalHidden)
			}
		}
	}
}

// 条件可见的字段：不满足条件时不允许写入。
func TestConditionalVisibilityBlocksWrite(t *testing.T) {
	svc, adminID, _, editorID, projectID, tableID, budgetID, taxID := newCondFixture(t)
	ctx := context.Background()

	low, err := svc.CreateRecord(ctx, adminID, projectID, tableID, RecordInput{
		Fields: map[string]any{budgetID: 5000},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if _, err := svc.UpdateRecord(ctx, editorID, projectID, low.ID, RecordInput{
		Fields: map[string]any{taxID: 999},
	}); err == nil {
		t.Fatal("writing a conditionally hidden field should be rejected")
	}
}
