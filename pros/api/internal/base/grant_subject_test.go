package base

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// newGrantFixture 造一个带 core_users（含部门）的空间环境。
func newGrantFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:grantsubject?mode=memory&cache=shared"), &gorm.Config{})
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
		`CREATE TABLE IF NOT EXISTS core_users (id uuid primary key, display_name varchar(64), email varchar(128), department varchar(128))`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
		`CREATE TABLE IF NOT EXISTS base_field_formulas (id uuid primary key, table_id uuid, field_id uuid, status integer)`,
		`CREATE TABLE IF NOT EXISTS base_operation_logs (
			id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
			operator_id uuid, operation varchar(32), before_data json, after_data json, change_set json,
			request_id varchar(64), created_at datetime)`,
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

	ownerID := uuid.New()
	viewerID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, ownerID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO core_users (id, display_name, email, department) VALUES (?, ?, ?, ?)`,
		viewerID, "访客", "viewer@example.com", "销售部").Error; err != nil {
		t.Fatalf("insert user failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, viewerID, RoleViewer).Error; err != nil {
		t.Fatalf("insert member failed: %v", err)
	}
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "客户", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	if err := db.Create(&BaseField{
		ID: uuid.New(), TableID: tableID, Name: "名称", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create primary failed: %v", err)
	}
	return NewService(db), ownerID, viewerID, projectID, tableID
}

// 授权有效期：过期后访客看不到记录。
func TestGrantSubjectExpires(t *testing.T) {
	svc, ownerID, viewerID, projectID, tableID := newGrantFixture(t)
	ctx := context.Background()

	visible := "custom"
	row, err := svc.CreateRecord(ctx, ownerID, projectID, tableID, RecordInput{
		Fields:     map[string]any{},
		Visibility: &visible,
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	expired := time.Now().Add(-time.Hour)
	if _, err := svc.UpdateRecord(ctx, ownerID, projectID, row.ID, RecordInput{
		Fields: map[string]any{},
		GrantSubjects: &[]GrantSubject{
			{Type: GrantSubjectUser, ID: viewerID.String(), ExpiresAt: &expired},
		},
	}); err != nil {
		t.Fatalf("update grants failed: %v", err)
	}
	res, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	if len(res.Records) != 0 {
		t.Fatalf("expired grant should not grant visibility, got %d records", len(res.Records))
	}
}

// 按部门授权：同部门成员可见。
func TestGrantSubjectDepartment(t *testing.T) {
	svc, ownerID, viewerID, projectID, tableID := newGrantFixture(t)
	ctx := context.Background()

	visible := "custom"
	row, err := svc.CreateRecord(ctx, ownerID, projectID, tableID, RecordInput{
		Fields:     map[string]any{},
		Visibility: &visible,
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if _, err := svc.UpdateRecord(ctx, ownerID, projectID, row.ID, RecordInput{
		Fields: map[string]any{},
		GrantSubjects: &[]GrantSubject{
			{Type: GrantSubjectDepartment, ID: "销售部"},
		},
	}); err != nil {
		t.Fatalf("update grants failed: %v", err)
	}
	res, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	if len(res.Records) != 1 {
		t.Fatalf("department grant should grant visibility, got %d records", len(res.Records))
	}
	depts, err := svc.ListSpaceDepartments(ctx, ownerID, projectID)
	if err != nil {
		t.Fatalf("list departments failed: %v", err)
	}
	if len(depts) != 1 || depts[0] != "销售部" {
		t.Fatalf("unexpected departments: %v", depts)
	}
}
