package base

import (
	"context"
	"errors"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// newVersionFixture 造一个「空间 + 表 + 文本字段 + 一条记录」的环境。
func newVersionFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:version-"+uuid.NewString()+"?mode=memory&cache=shared"), &gorm.Config{})
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
	userID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, userID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "版本表", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	fieldID := uuid.New()
	if err := db.Create(&BaseField{
		ID: fieldID, TableID: tableID, Name: "名称", Type: "text", Status: 1, SortOrder: 0,
	}).Error; err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	return NewService(db), userID, projectID, tableID, fieldID
}

// B6 / F-014：过期版本更新必须返回明确冲突（40901），而不是静默覆盖。
func TestUpdateRecordRejectsStaleVersion(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newVersionFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
		Fields: map[string]any{fieldID.String(): "第一版"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	// 正常改一次（版本 +1），再用旧版本号回写 → 必须报冲突。
	updated, err := svc.UpdateRecord(ctx, userID, projectID, row.ID, RecordInput{
		Fields:          map[string]any{fieldID.String(): "第二版"},
		ExpectedVersion: row.Version,
	})
	if err != nil {
		t.Fatalf("first update failed: %v", err)
	}
	_, err = svc.UpdateRecord(ctx, userID, projectID, row.ID, RecordInput{
		Fields:          map[string]any{fieldID.String(): "覆盖"},
		ExpectedVersion: updated.Version - 1,
	})
	if err == nil {
		t.Fatal("expected version conflict")
	}
	if !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("expected ErrVersionConflict, got %v", err)
	}
	// 冲突之后数据不能被改掉。
	var rec BaseRecord
	if err := svc.db.WithContext(ctx).Where("id = ?", row.ID).First(&rec).Error; err != nil {
		t.Fatalf("load record failed: %v", err)
	}
	if rec.Version != updated.Version {
		t.Fatalf("stale write must not bump version: %d -> %d", updated.Version, rec.Version)
	}
}

// B6 / F-014：结构版本过期同样要报冲突（40902）。
func TestUpdateRecordRejectsStaleSchemaVersion(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newVersionFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
		Fields: map[string]any{fieldID.String(): "初稿"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	_, err = svc.UpdateRecord(ctx, userID, projectID, row.ID, RecordInput{
		Fields:        map[string]any{fieldID.String(): "改稿"},
		SchemaVersion: 999,
	})
	if err == nil {
		t.Fatal("expected schema conflict")
	}
	if !errors.Is(err, ErrSchemaConflict) {
		t.Fatalf("expected ErrSchemaConflict, got %v", err)
	}
}
