package base

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// newAuditFixture 造一个带操作日志的最小环境：空间 + 管理员 + 访客 + 表 + 两条日志。
func newAuditFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:auditfilter?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
		`CREATE TABLE IF NOT EXISTS base_operation_logs (
			id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
			operator_id uuid, operation varchar(32), before_data json, after_data json, change_set json,
			request_id varchar(64), created_at datetime)`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("prepare table failed: %v", err)
		}
	}
	adminID := uuid.New()
	viewerID := uuid.New()
	projectID := uuid.New()
	baseID := uuid.New()
	tableID := uuid.New()
	recordID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, adminID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, viewerID, RoleViewer).Error; err != nil {
		t.Fatalf("insert viewer failed: %v", err)
	}
	now := time.Now()
	for _, row := range []BaseOperationLog{
		{ID: uuid.New(), ProjectID: projectID, BaseID: baseID, TableID: &tableID, RecordID: &recordID,
			OperatorID: adminID, Operation: "record.created", CreatedAt: now.Add(-2 * time.Hour)},
		{ID: uuid.New(), ProjectID: projectID, BaseID: baseID, TableID: &tableID, RecordID: &recordID,
			OperatorID: viewerID, Operation: "record.updated", CreatedAt: now.Add(-1 * time.Hour)},
	} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatalf("insert audit log failed: %v", err)
		}
	}
	return NewService(db), adminID, viewerID, projectID, baseID, tableID, recordID
}

// 审计按操作者过滤。
func TestAuditFilterByOperator(t *testing.T) {
	svc, adminID, viewerID, projectID, baseID, _, _ := newAuditFixture(t)
	ctx := context.Background()

	rows, total, err := svc.ListAudit(ctx, adminID, projectID, baseID, AuditQuery{OperatorID: viewerID})
	if err != nil {
		t.Fatalf("list audit failed: %v", err)
	}
	if total != 1 || len(rows) != 1 {
		t.Fatalf("expected 1 row for operator filter, got total=%d rows=%d", total, len(rows))
	}
	if rows[0].OperatorID != viewerID {
		t.Fatalf("unexpected operator %s", rows[0].OperatorID)
	}
}

// 审计按记录 ID 过滤（完整 ID 与前缀都要命中）。
func TestAuditFilterByRecord(t *testing.T) {
	svc, adminID, _, projectID, baseID, _, recordID := newAuditFixture(t)
	ctx := context.Background()

	rows, total, err := svc.ListAudit(ctx, adminID, projectID, baseID, AuditQuery{RecordID: recordID})
	if err != nil {
		t.Fatalf("list audit failed: %v", err)
	}
	if total != 2 || len(rows) != 2 {
		t.Fatalf("expected 2 rows for record filter, got total=%d rows=%d", total, len(rows))
	}

	prefix := recordID.String()[:8]
	rows, total, err = svc.ListAudit(ctx, adminID, projectID, baseID, AuditQuery{RecordPrefix: prefix})
	if err != nil {
		t.Fatalf("list audit by prefix failed: %v", err)
	}
	if total != 2 || len(rows) != 2 {
		t.Fatalf("expected 2 rows for record prefix filter, got total=%d rows=%d", total, len(rows))
	}

	// 不存在的前缀不应命中任何记录。
	_, total, err = svc.ListAudit(ctx, adminID, projectID, baseID, AuditQuery{RecordPrefix: "deadbeef"})
	if err != nil {
		t.Fatalf("list audit by missing prefix failed: %v", err)
	}
	if total != 0 {
		t.Fatalf("expected 0 rows for missing prefix, got %d", total)
	}
}

// 非法前缀不报错，只是不过滤。
func TestAuditFilterInvalidPrefixIgnored(t *testing.T) {
	svc, adminID, _, projectID, baseID, _, _ := newAuditFixture(t)
	ctx := context.Background()

	_, total, err := svc.ListAudit(ctx, adminID, projectID, baseID, AuditQuery{RecordPrefix: "不是ID"})
	if err != nil {
		t.Fatalf("list audit failed: %v", err)
	}
	if total != 2 {
		t.Fatalf("expected 2 rows (filter ignored), got %d", total)
	}
}
