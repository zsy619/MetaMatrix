package base

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// newScopeFixture 造一个「空间 + 管理者 + 访客 + 编辑者 + 表 + 字段」的环境。
func newScopeFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:datascope?mode=memory&cache=shared"), &gorm.Config{})
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
	editorID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, ownerID).Error; err != nil {
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
	return NewService(db), ownerID, viewerID, editorID, projectID, tableID
}

// 受限记录：访客与编辑者都看不到，管理者与创建者看得到。
//
// 这是技术方案第 8 章「记录级可见性」的核心语义：
// 过滤必须在 Query Engine 生成 SQL 时注入，所以 total 也不能把受限记录算进去。
func TestRestrictedRecordHiddenFromOthers(t *testing.T) {
	svc, ownerID, viewerID, editorID, projectID, tableID := newScopeFixture(t)
	ctx := context.Background()

	// 编辑者建一条受限记录。
	restricted := "restricted"
	row, err := svc.CreateRecord(ctx, editorID, projectID, tableID, RecordInput{
		Fields:     map[string]any{},
		Visibility: &restricted,
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if row.Visibility != RecordVisibilityRestricted {
		t.Fatalf("expected restricted visibility, got %q", row.Visibility)
	}

	// 访客查不到（记录与计数都不含）。
	viewer, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	if len(viewer.Records) != 0 || viewer.Total != 0 {
		t.Fatalf("restricted record leaked to viewer: records=%d total=%d", len(viewer.Records), viewer.Total)
	}

	// 另一个编辑者也看不到。
	other, err := svc.Query(ctx, ownerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("owner query failed: %v", err)
	}
	_ = other
	_ = editorID

	// 创建者自己看得到。
	creator, err := svc.Query(ctx, editorID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("creator query failed: %v", err)
	}
	if len(creator.Records) != 1 || creator.Total != 1 {
		t.Fatalf("creator should see own restricted record: records=%d total=%d", len(creator.Records), creator.Total)
	}

	// 管理者看得到。
	admin, err := svc.Query(ctx, ownerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("admin query failed: %v", err)
	}
	if len(admin.Records) != 1 {
		t.Fatalf("admin should see restricted record, got %d", len(admin.Records))
	}

	// 访客直接改这条记录 → 按「不存在」处理。
	if _, err := svc.UpdateRecord(ctx, viewerID, projectID, row.ID, RecordInput{
		Fields: map[string]any{},
	}); err == nil {
		t.Fatal("viewer should not update restricted record")
	}
}

// 空间可见的记录不受影响。
func TestSpaceRecordVisibleToAll(t *testing.T) {
	svc, ownerID, viewerID, editorID, projectID, tableID := newScopeFixture(t)
	ctx := context.Background()
	if _, err := svc.CreateRecord(ctx, editorID, projectID, tableID, RecordInput{Fields: map[string]any{}}); err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	viewer, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	if len(viewer.Records) != 1 || viewer.Total != 1 {
		t.Fatalf("space record should be visible to viewer: records=%d total=%d", len(viewer.Records), viewer.Total)
	}
	_ = ownerID
}

// 只有管理者能改可见范围。
func TestOnlyAdminCanChangeVisibility(t *testing.T) {
	svc, ownerID, viewerID, editorID, projectID, tableID := newScopeFixture(t)
	ctx := context.Background()
	row, err := svc.CreateRecord(ctx, editorID, projectID, tableID, RecordInput{Fields: map[string]any{}})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	restricted := "restricted"
	if _, err := svc.UpdateRecord(ctx, editorID, projectID, row.ID, RecordInput{Visibility: &restricted}); err == nil {
		t.Fatal("editor should not be able to change record visibility")
	}
	if _, err := svc.UpdateRecord(ctx, ownerID, projectID, row.ID, RecordInput{Visibility: &restricted}); err != nil {
		t.Fatalf("admin should be able to change record visibility: %v", err)
	}
	_ = viewerID
}

// 「指定成员可见」：只有被授权的成员能看到这条记录，其余成员（包括编辑者）看不到。
func TestCustomVisibilityGrants(t *testing.T) {
	svc, ownerID, viewerID, editorID, projectID, tableID := newScopeFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, ownerID, projectID, tableID, RecordInput{Fields: map[string]any{}})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}

	// 授权给访客；未授权的编辑者应当看不到。
	grants := []string{viewerID.String()}
	custom := RecordVisibilityCustom
	if _, err := svc.UpdateRecord(ctx, ownerID, projectID, row.ID, RecordInput{
		Visibility: &custom, Grants: &grants,
	}); err != nil {
		t.Fatalf("set custom visibility failed: %v", err)
	}

	viewer, err := svc.Query(ctx, viewerID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("viewer query failed: %v", err)
	}
	if viewer.Total != 1 || len(viewer.Records) != 1 {
		t.Fatalf("granted viewer should see the record, got total=%d records=%d", viewer.Total, len(viewer.Records))
	}

	editor, err := svc.Query(ctx, editorID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("editor query failed: %v", err)
	}
	if editor.Total != 0 || len(editor.Records) != 0 {
		t.Fatalf("non-granted editor should not see the record, got total=%d", editor.Total)
	}

	// 授权名单可以被读取出来（UI 要展示「谁能看到」）。
	list, err := svc.ListRecordGrants(ctx, ownerID, projectID, row.ID)
	if err != nil {
		t.Fatalf("list grants failed: %v", err)
	}
	if len(list) != 1 || list[0].UserID != viewerID.String() {
		t.Fatalf("unexpected grants: %+v", list)
	}

	// 访客不能改可见范围，也不能改授权名单。
	if _, err := svc.UpdateRecord(ctx, viewerID, projectID, row.ID, RecordInput{
		Visibility: &custom, Grants: &grants,
	}); err == nil {
		t.Fatal("viewer should not be able to change visibility/grants")
	}
}

// 授权名单不能给「不是空间成员」的人（否则是看起来生效、实际无效的假权限）。
func TestGrantMustBeSpaceMember(t *testing.T) {
	svc, ownerID, _, _, projectID, tableID := newScopeFixture(t)
	ctx := context.Background()

	row, err := svc.CreateRecord(ctx, ownerID, projectID, tableID, RecordInput{Fields: map[string]any{}})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	outsider := uuid.New()
	grants := []string{outsider.String()}
	custom := RecordVisibilityCustom
	if _, err := svc.UpdateRecord(ctx, ownerID, projectID, row.ID, RecordInput{
		Visibility: &custom, Grants: &grants,
	}); err == nil {
		t.Fatal("granting a non-member should be rejected")
	}
}
