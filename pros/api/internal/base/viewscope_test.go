package base

import (
	"context"
	"testing"
)

// 访客可以保存自己的「个人查询偏好」，但改不动视图的共享配置。
func TestViewerCanSaveOwnQueryPrefOnly(t *testing.T) {
	svc, adminID, viewerID, _, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()

	view, err := svc.CreateView(ctx, adminID, projectID, tableID, "表格视图", "grid", map[string]any{
		"filters": map[string]any{"logic": "AND", "conditions": []any{}},
	}, ViewScopeShared)
	if err != nil {
		t.Fatalf("create view failed: %v", err)
	}

	// 访客保存个人查询偏好（顺带带一份共享段改动，共享段必须被忽略）。
	updated, err := svc.UpdateView(ctx, viewerID, projectID, view.ID, nil, nil, map[string]any{
		"filters": map[string]any{"logic": "AND", "conditions": []any{map[string]any{"fieldId": "f1"}}},
		"personal": map[string]any{
			viewerID.String(): map[string]any{
				"query": map[string]any{"sorts": []any{map[string]any{"fieldId": "f1", "order": "desc"}}},
			},
		},
	}, 0)
	if err != nil {
		t.Fatalf("viewer save personal pref failed: %v", err)
	}
	personal, ok := updated.Config["personal"].(map[string]any)
	if !ok || personal[viewerID.String()] == nil {
		t.Fatalf("viewer personal pref should be returned, got %+v", updated.Config)
	}
	// 共享段不能被访客改掉。
	sharedFilters, _ := updated.Config["filters"].(map[string]any)
	conds, _ := sharedFilters["conditions"].([]any)
	if len(conds) != 0 {
		t.Fatalf("viewer must not change shared filters, got %+v", updated.Config["filters"])
	}

	// 管理员看到的共享配置仍然是原来的。
	views, err := svc.ListViews(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("list views failed: %v", err)
	}
	for _, v := range views {
		if v.ID != view.ID {
			continue
		}
		sharedFilters, _ := v.Config["filters"].(map[string]any)
		conds, _ := sharedFilters["conditions"].([]any)
		if len(conds) != 0 {
			t.Fatalf("shared filters changed by viewer: %+v", v.Config["filters"])
		}
	}
}

// 访客可以建个人视图，但建不了共享视图。
func TestViewerCanCreatePersonalViewOnly(t *testing.T) {
	svc, _, viewerID, _, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()

	if _, err := svc.CreateView(ctx, viewerID, projectID, tableID, "我的视图", "grid", map[string]any{}, ViewScopePersonal); err != nil {
		t.Fatalf("viewer should create personal view: %v", err)
	}
	if _, err := svc.CreateView(ctx, viewerID, projectID, tableID, "共享视图", "grid", map[string]any{}, ViewScopeShared); err == nil {
		t.Fatal("viewer should not create shared view")
	}
}
