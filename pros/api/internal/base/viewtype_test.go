package base

import (
	"context"
	"errors"
	"testing"
)

// D3：视图类型白名单 —— form / gantt 是新增的两种，必须允许；
// 未在白名单里的类型必须被拒绝（40001 语义的 ErrQueryInvalid）。
func TestValidViewTypesAllowFormAndGantt(t *testing.T) {
	for _, vt := range []string{"grid", "kanban", "calendar", "gallery", "form", "gantt"} {
		if !IsValidViewType(vt) {
			t.Fatalf("view type %q should be valid", vt)
		}
	}
	for _, vt := range []string{"timeline", "tree", "pivot", "FORM", ""} {
		if IsValidViewType(vt) {
			t.Fatalf("view type %q should be invalid", vt)
		}
	}
}

// D3：创建视图时非法类型被拒绝，form / gantt 能建出来。
func TestCreateViewRejectsUnknownType(t *testing.T) {
	svc, adminID, _, _, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()

	if _, err := svc.CreateView(ctx, adminID, projectID, tableID, "坏类型", "timeline", map[string]any{}, ViewScopeShared); !errors.Is(err, ErrQueryInvalid) {
		t.Fatalf("expected ErrQueryInvalid, got %v", err)
	}
	for _, vt := range []string{"form", "gantt"} {
		v, err := svc.CreateView(ctx, adminID, projectID, tableID, "视图-"+vt, vt, map[string]any{}, ViewScopeShared)
		if err != nil {
			t.Fatalf("create %s view failed: %v", vt, err)
		}
		if v.Type != vt {
			t.Fatalf("view type mismatch: want %q got %q", vt, v.Type)
		}
	}
}

// D3：更新视图类型同样走白名单。
func TestUpdateViewRejectsUnknownType(t *testing.T) {
	svc, adminID, _, _, projectID, tableID := newViewPrefFixture(t)
	ctx := context.Background()
	view, err := svc.CreateView(ctx, adminID, projectID, tableID, "表格", "grid", map[string]any{}, ViewScopeShared)
	if err != nil {
		t.Fatalf("create view failed: %v", err)
	}
	if _, err := svc.UpdateView(ctx, adminID, projectID, view.ID, nil, nil, map[string]any{}, 0); err != nil {
		t.Fatalf("update view without type should be ok: %v", err)
	}
	bad := "timeline"
	if _, err := svc.UpdateView(ctx, adminID, projectID, view.ID, nil, &bad, map[string]any{}, 0); !errors.Is(err, ErrQueryInvalid) {
		t.Fatalf("expected ErrQueryInvalid, got %v", err)
	}
	good := "gantt"
	if _, err := svc.UpdateView(ctx, adminID, projectID, view.ID, nil, &good, map[string]any{}, 0); err != nil {
		t.Fatalf("update to gantt failed: %v", err)
	}
}
