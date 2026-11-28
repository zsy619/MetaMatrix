package base

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// newViewPrefFixture 造一个「空间 + 管理员 + 访客 + 表」的环境，用于验证视图配置。
func newViewPrefFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:viewpref?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(&baseTableSQLite{}, &baseFieldSQLite{}, &baseViewSQLite{}, &baseViewPrefSQLite{}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
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
	return NewService(db), adminID, viewerID, editorID, projectID, tableID
}

// 个人偏好必须按人隔离：别人既看不到我的偏好，我的偏好也不会被别人的保存冲掉。
func TestViewPersonalPrefIsolatedPerUser(t *testing.T) {
	svc, adminID, viewerID, editorID, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()

	view, err := svc.CreateView(ctx, adminID, projectID, tableID, "表格视图", "grid", map[string]any{}, ViewScopeShared)
	if err != nil {
		t.Fatalf("create view failed: %v", err)
	}

	// 管理员保存一份个人偏好（隐藏某列）。
	pref := map[string]any{"fieldVisibility": map[string]any{"f1": false}}
	updated, err := svc.UpdateView(ctx, adminID, projectID, view.ID, nil, nil, map[string]any{
		"fieldVisibility": map[string]any{},
		"personal":        map[string]any{adminID.String(): pref},
	}, 0)
	if err != nil {
		t.Fatalf("save personal pref failed: %v", err)
	}
	personal, ok := updated.Config["personal"].(map[string]any)
	if !ok || personal[adminID.String()] == nil {
		t.Fatalf("personal pref should be returned to owner, got %+v", updated.Config)
	}
	if _, leaked := updated.Config["personal"].(map[string]any)[viewerID.String()]; leaked {
		t.Fatal("other user's personal pref leaked")
	}

	// 访客看不到这份偏好。
	views, err := svc.ListViews(ctx, viewerID, projectID, tableID)
	if err != nil {
		t.Fatalf("list views failed: %v", err)
	}
	for _, v := range views {
		if _, ok := v.Config["personal"]; ok {
			t.Fatalf("viewer should not receive personal segment, got %+v", v.Config)
		}
	}

	// 别的成员（编辑者）保存共享配置，不会冲掉管理员的个人偏好。
	if _, err := svc.UpdateView(ctx, editorID, projectID, view.ID, nil, nil, map[string]any{
		"fieldVisibility": map[string]any{"f2": true},
	}, 0); err != nil {
		t.Fatalf("editor save shared config failed: %v", err)
	}
	after, err := svc.ListViews(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("admin list views failed: %v", err)
	}
	found := false
	for _, v := range after {
		if v.ID != view.ID {
			continue
		}
		found = true
		p, ok := v.Config["personal"].(map[string]any)
		if !ok || p[adminID.String()] == nil {
			t.Fatalf("admin personal pref was wiped by another user's save: %+v", v.Config)
		}
	}
	if !found {
		t.Fatal("view not found in admin list")
	}

	// 共享模式下保存（personal 段没有我的键）= 删除我的个人偏好。
	if _, err := svc.UpdateView(ctx, adminID, projectID, view.ID, nil, nil, map[string]any{
		"fieldVisibility": map[string]any{},
		"personal":        map[string]any{},
	}, 0); err != nil {
		t.Fatalf("shared save failed: %v", err)
	}
	final, err := svc.ListViews(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("final list views failed: %v", err)
	}
	for _, v := range final {
		if v.ID != view.ID {
			continue
		}
		if p, ok := v.Config["personal"].(map[string]any); ok && p[adminID.String()] != nil {
			t.Fatalf("personal pref should be removed in shared mode: %+v", v.Config)
		}
	}
}

// 个人视图：只有创建者能看到、能改。
func TestPersonalViewOnlyVisibleToOwner(t *testing.T) {
	svc, adminID, viewerID, _, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()

	view, err := svc.CreateView(ctx, adminID, projectID, tableID, "我的私密视图", "grid", map[string]any{}, ViewScopePersonal)
	if err != nil {
		t.Fatalf("create personal view failed: %v", err)
	}
	if view.Scope != ViewScopePersonal {
		t.Fatalf("expected personal scope, got %q", view.Scope)
	}

	views, err := svc.ListViews(ctx, viewerID, projectID, tableID)
	if err != nil {
		t.Fatalf("viewer list views failed: %v", err)
	}
	for _, v := range views {
		if v.ID == view.ID {
			t.Fatal("personal view leaked to other member")
		}
	}

	// 访客改别人的个人视图 → 视为不存在。
	if _, err := svc.UpdateView(ctx, viewerID, projectID, view.ID, nil, nil, map[string]any{}, 0); err == nil {
		t.Fatal("expected error when updating another user's personal view")
	}
}
