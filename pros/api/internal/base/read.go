package base

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// —— 只读详情接口（技术文档 §10 API 清单）——

// GetRecord 按 ID 读取单条记录详情。
//
// 与 Query 返回的列语义完全一致：
//   - 记录级可见范围在 SQL 层过滤（scopeLoadRecord）；
//   - 字段级隐藏 / 条件可见在出参前剥离（stripHiddenFieldsWithReasons）。
func (s *Service) GetRecord(ctx context.Context, userID, projectID, recordID uuid.UUID) (*RecordRow, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
		return nil, err
	}
	_, idx, err := s.loadTableSchema(ctx, userID, projectID, rec.TableID)
	if err != nil {
		return nil, err
	}
	data := map[string]any{}
	if len(rec.Data) > 0 {
		_ = json.Unmarshal(rec.Data, &data)
	}
	subj := s.subjectOf(userID, projectID)
	stripped, condHidden := stripHiddenFieldsWithReasons(data, idx, subj)
	return &RecordRow{
		ID:                rec.ID,
		Version:           rec.Version,
		Fields:            stripped,
		Updated:           rec.UpdatedAt,
		Visibility:        rec.Visibility,
		CreatedBy:         rec.CreatedBy.String(),
		ConditionalHidden: condHidden,
	}, nil
}

// GetView 按 ID 读取单个视图配置（含当前用户的个人偏好）。
func (s *Service) GetView(ctx context.Context, userID, projectID, viewID uuid.UUID) (*ViewInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var view BaseView
	if err := s.db.WithContext(ctx).Where("id = ? AND status = 1", viewID).First(&view).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrViewNotFound
		}
		return nil, err
	}
	// 视图必须属于本空间：表 → Base → 空间。
	if _, _, err := s.loadTableSchema(ctx, userID, projectID, view.TableID); err != nil {
		return nil, err
	}
	// 个人视图只有创建者可见。
	if view.Scope != "" && view.Scope != ViewScopeShared && view.OwnerID != userID {
		return nil, ErrViewNotFound
	}
	info := viewInfoOf(&view, userID)
	if err := s.attachViewPrefs(ctx, userID, projectID, []ViewInfo{info}); err != nil {
		return nil, err
	}
	return &info, nil
}

// QueryByView 按视图配置查询数据（技术文档 §10「POST /views/{viewId}/query」）。
//
// 视图里存的是「共享查询条件」（filters / sorts / groups）；
// 请求体可以带覆盖条件：
//   - 请求体给了 filters / sorts / groups → 以请求体为准；
//   - 没给 → 用视图里的共享条件。
//
// 这样既保留了「按视图查询」这一接口形态，又不破坏现有
// 「个人偏好覆盖共享条件」的前端语义（前端本来就自己合并好再查）。
func (s *Service) QueryByView(ctx context.Context, userID, projectID, viewID uuid.UUID, req QueryRequest) (*QueryResult, error) {
	view, err := s.GetView(ctx, userID, projectID, viewID)
	if err != nil {
		return nil, err
	}
	req.ViewID = viewID.String()
	req.TableID = view.TableID.String()
	if len(req.Filters.Conditions) == 0 && len(req.Filters.Children) == 0 && req.Filters.Logic == "" {
		if shared, ok := view.Config["filters"].(map[string]any); ok {
			if parsed, err := parseFilterGroup(shared); err == nil {
				req.Filters = parsed
			}
		}
	}
	if len(req.Sorts) == 0 {
		if parsed, ok := parseSortRules(view.Config["sorts"]); ok {
			req.Sorts = parsed
		}
	}
	if len(req.Groups) == 0 {
		if parsed, ok := parseGroupRules(view.Config["groups"]); ok {
			req.Groups = parsed
		}
	}
	return s.Query(ctx, userID, projectID, req)
}

// parseFilterGroup 从视图配置里解析筛选条件。
func parseFilterGroup(raw map[string]any) (FilterGroup, error) {
	out := FilterGroup{Logic: "AND"}
	if raw == nil {
		return out, nil
	}
	if logic, ok := raw["logic"].(string); ok && logic != "" {
		out.Logic = strings.ToUpper(logic)
	}
	items, _ := raw["conditions"].([]any)
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fieldID, _ := m["fieldId"].(string)
		operator, _ := m["operator"].(string)
		if fieldID == "" || operator == "" {
			continue
		}
		out.Conditions = append(out.Conditions, Condition{
			FieldID:  fieldID,
			Operator: operator,
			Value:    m["value"],
		})
	}
	children, _ := raw["children"].([]any)
	for _, item := range children {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		child, err := parseFilterGroup(m)
		if err != nil {
			return out, err
		}
		out.Children = append(out.Children, child)
	}
	return out, nil
}

// parseSortRules 从视图配置里解析排序规则。
func parseSortRules(raw any) ([]SortRule, bool) {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return nil, false
	}
	out := make([]SortRule, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fieldID, _ := m["fieldId"].(string)
		// 存量视图里可能有重复 / 超限规则（历史数据），
		// 解析时去重并截断，避免整条查询被 MaxSorts 拦成 422。
		if fieldID == "" || seen[fieldID] || len(out) >= MaxSorts {
			continue
		}
		seen[fieldID] = true
		order := "asc"
		if v, ok := m["order"].(string); ok && v != "" {
			order = v
		}
		out = append(out, SortRule{FieldID: fieldID, Order: order})
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

// parseGroupRules 从视图配置里解析分组规则。
func parseGroupRules(raw any) ([]GroupRule, bool) {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return nil, false
	}
	out := make([]GroupRule, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fieldID, _ := m["fieldId"].(string)
		if fieldID == "" || seen[fieldID] || len(out) >= MaxGroups {
			continue
		}
		seen[fieldID] = true
		order := "asc"
		if v, ok := m["order"].(string); ok && v != "" {
			order = v
		}
		out = append(out, GroupRule{FieldID: fieldID, Order: order})
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

// GetBaseDetail 返回 Base 详情（含统计），供 GET /bases/{baseId} 使用。
func (s *Service) GetBaseDetail(ctx context.Context, userID, projectID, baseID uuid.UUID) (map[string]any, error) {
	info, err := s.GetBase(ctx, userID, projectID, baseID)
	if err != nil {
		return nil, err
	}
	var tableCount int64
	if err := s.db.WithContext(ctx).Model(&BaseTable{}).
		Where("base_id = ? AND deleted_at IS NULL", baseID).Count(&tableCount).Error; err != nil {
		return nil, err
	}
	var recordCount int64
	if err := s.db.WithContext(ctx).Table("base_records AS r").
		Joins("JOIN base_tables t ON t.id = r.table_id AND t.deleted_at IS NULL").
		Where("t.base_id = ? AND r.deleted_at IS NULL", baseID).
		Count(&recordCount).Error; err != nil {
		return nil, err
	}
	return map[string]any{
		"id":            info.ID,
		"projectId":     info.ProjectID,
		"nodeId":        info.NodeID,
		"name":          info.Name,
		"description":   info.Description,
		"icon":          info.Icon,
		"ownerId":       info.OwnerID,
		"schemaVersion": info.SchemaVersion,
		"migrated":      info.Migrated,
		"createdAt":     info.CreatedAt,
		"updatedAt":     info.UpdatedAt,
		"tableCount":    tableCount,
		"recordCount":   recordCount,
	}, nil
}
