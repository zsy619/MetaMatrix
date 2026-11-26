package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"metamatrix/api/internal/model"
)

// 遗留多维表格的数据形状（旧的 sheetModel.ts）。
type legacySheet struct {
	Fields []legacyField `json:"fields"`
	Rows   []legacyRow   `json:"rows"`
	Views  []legacyView  `json:"views"`
}

type legacyField struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Type    string   `json:"type"`
	Options []string `json:"options"`
	Width   int      `json:"width"`
}

type legacyRow struct {
	ID    string         `json:"id"`
	Cells map[string]any `json:"cells"`
}

type legacyView struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Filters   []legacyFilter `json:"filters"`
	SortBy    *string        `json:"sortBy"`
	SortOrder string         `json:"sortOrder"`
	GroupBy   *string        `json:"groupBy"`
}

type legacyFilter struct {
	FieldID string `json:"fieldId"`
	Op      string `json:"op"`
	Value   string `json:"value"`
}

// legacyTypeMap 把旧字段类型映射到新字段注册表。
var legacyTypeMap = map[string]FieldType{
	"text":        FieldText,
	"longtext":    FieldLongText,
	"number":      FieldNumber,
	"date":        FieldDate,
	"select":      FieldSingleSelect,
	"multiSelect": FieldMultiSelect,
	"checkbox":    FieldCheckbox,
	"link":        FieldURL,
	"progress":    FieldPercent,
	"rating":      FieldRating,
	"person":      FieldUser,
}

// MigrateLegacySheet 把遗留 JSONB 表格迁移到 Base Engine。
//
// 幂等：base_app.migrated 标记为 legacy_sheet:<nodeId> 后不再重复迁移。
// 迁移失败时不写任何表数据（整体事务回滚），旧数据保持可读。
func (s *Service) MigrateLegacySheet(ctx context.Context, userID, projectID, nodeID uuid.UUID, raw []byte) (*BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var app BaseApp
	err := s.db.WithContext(ctx).Where("project_id = ? AND node_id = ?", projectID, nodeID).First(&app).Error
	if err != nil {
		return nil, ErrBaseNotFound
	}
	marker := "legacy_sheet:" + nodeID.String()
	if app.Migrated != "" {
		return baseInfoOf(&app), nil
	}
	var legacy legacySheet
	if err := json.Unmarshal(raw, &legacy); err != nil {
		return nil, fmt.Errorf("%w: 旧表格数据解析失败", ErrFieldValueInvalid)
	}
	if len(legacy.Fields) == 0 {
		// 旧表没有任何字段：只标记已迁移，后续由用户自行建字段。
		if err := s.db.WithContext(ctx).Model(&app).Update("migrated", marker).Error; err != nil {
			return nil, err
		}
		return baseInfoOf(&app), nil
	}

	tableID := uuid.New()
	// 旧字段 ID → 新字段 ID
	fieldMap := map[string]uuid.UUID{}
	type newField struct {
		id      uuid.UUID
		name    string
		ftype   FieldType
		options []string
		primary bool
		sortIdx int
	}
	newFields := []newField{}
	for i, f := range legacy.Fields {
		ftype, ok := legacyTypeMap[f.Type]
		if !ok {
			ftype = FieldText
		}
		newFields = append(newFields, newField{
			id:      uuid.New(),
			name:    strings.TrimSpace(f.Name),
			ftype:   ftype,
			options: f.Options,
			primary: i == 0,
			sortIdx: i,
		})
		fieldMap[f.ID] = newFields[i].id
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		table := BaseTable{
			ID:            tableID,
			BaseID:        app.ID,
			Name:          app.Name,
			Description:   "由旧版多维表格迁移而来",
			SortOrder:     1,
			SchemaVersion: 1,
			Settings:      datatypes.JSON(`{"migratedFrom":"legacy_sheet"}`),
			Status:        1,
		}
		if err := tx.Create(&table).Error; err != nil {
			return err
		}
		for _, f := range newFields {
			cfg := map[string]any{}
			if len(f.options) > 0 {
				opts := make([]any, 0, len(f.options))
				for _, opt := range f.options {
					opts = append(opts, opt)
				}
				cfg["options"] = opts
			}
			rawCfg, _ := json.Marshal(cfg)
			field := BaseField{
				ID: f.id, TableID: tableID, Name: f.name, Type: string(f.ftype), Config: rawCfg,
				IsPrimary: f.primary, SortOrder: f.sortIdx, Version: 1, Status: 1,
			}
			if err := tx.Create(&field).Error; err != nil {
				return err
			}
		}
		primaryID := newFields[0].id
		if err := tx.Model(&BaseTable{}).Where("id = ?", tableID).Update("primary_field_id", primaryID).Error; err != nil {
			return err
		}

		// 记录：旧 cell key 是旧字段 ID，要换成新字段 ID。
		idx := &fieldIndex{byID: map[uuid.UUID]FieldMeta{}, handlers: map[uuid.UUID]FieldHandler{}}
		for _, f := range newFields {
			cfg := map[string]any{}
			if len(f.options) > 0 {
				opts := make([]any, 0, len(f.options))
				for _, opt := range f.options {
					opts = append(opts, opt)
				}
				cfg["options"] = opts
			}
			idx.byID[f.id] = FieldMeta{ID: f.id.String(), Name: f.name, Type: string(f.ftype), Config: cfg, SortOrder: f.sortIdx}
			if handler, ok := s.registry.Get(f.ftype); ok {
				idx.handlers[f.id] = handler
			}
		}
		for _, row := range legacy.Rows {
			data := map[string]any{}
			for oldKey, value := range row.Cells {
				newKey, ok := fieldMap[oldKey]
				if !ok {
					continue
				}
				handler, ok := idx.handlers[newKey]
				if !ok {
					continue
				}
				normalized, err := handler.Normalize(value, idx.byID[newKey].Config)
				if err != nil {
					normalized = value
				}
				data[newKey.String()] = normalized
			}
			rawData, _ := json.Marshal(data)
			rec := BaseRecord{
				ID: uuid.New(), TableID: tableID, Data: rawData, Version: 1,
				CreatedBy: userID, UpdatedBy: userID,
			}
			if err := tx.Create(&rec).Error; err != nil {
				return err
			}
			if err := s.syncAllProjections(tx, tableID, rec.ID, data); err != nil {
				return err
			}
		}

		// 视图：把旧视图配置映射到新视图配置。
		for i, v := range legacy.Views {
			viewType := v.Type
			if viewType == "" {
				viewType = "grid"
			}
			rawCfg, _ := json.Marshal(migratedViewConfig(v, legacy.Fields, fieldMap))
			view := BaseView{
				ID: uuid.New(), TableID: tableID, Name: v.Name, Type: viewType, Config: rawCfg,
				OwnerID: userID, Version: 1, Status: 1,
			}
			if i == 0 {
				view.IsDefault = true
			}
			if err := tx.Create(&view).Error; err != nil {
				return err
			}
		}
		return tx.Model(&app).Update("migrated", marker).Error
	})
	if err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Where("id = ?", app.ID).First(&app).Error; err != nil {
		return nil, err
	}
	return baseInfoOf(&app), nil
}

// migratedViewConfig 把旧视图配置转换成新视图配置。
//
// 筛选必须落成 FilterGroup（logic/conditions/children），
// 否则新查询引擎拿到的是数组，无法编译成 SQL。
func migratedViewConfig(v legacyView, legacyFields []legacyField, fieldMap map[string]uuid.UUID) map[string]any {
	widths := map[string]any{}
	for _, f := range legacyFields {
		// 列宽要挂在新的 field_id 上，否则视图里存的宽度对不上任何列。
		newID, ok := fieldMap[f.ID]
		if ok && f.Width > 0 {
			widths[newID.String()] = f.Width
		}
	}

	conditions := []any{}
	for _, flt := range v.Filters {
		fieldID, ok := fieldMap[flt.FieldID]
		if !ok {
			continue
		}
		op := legacyFilterOp(flt.Op)
		if op == "isempty" || op == "isnotempty" {
			conditions = append(conditions, map[string]any{
				"fieldId": fieldID.String(), "operator": op,
			})
			continue
		}
		conditions = append(conditions, map[string]any{
			"fieldId": fieldID.String(), "operator": op, "value": flt.Value,
		})
	}

	sorts := []any{}
	if v.SortBy != nil && *v.SortBy != "" {
		if fieldID, ok := fieldMap[*v.SortBy]; ok {
			order := "asc"
			if v.SortOrder == "desc" {
				order = "desc"
			}
			sorts = append(sorts, map[string]any{"fieldId": fieldID.String(), "order": order})
		}
	}

	groups := []any{}
	if v.GroupBy != nil && *v.GroupBy != "" {
		if fieldID, ok := fieldMap[*v.GroupBy]; ok {
			groups = append(groups, map[string]any{"fieldId": fieldID.String(), "order": "asc"})
		}
	}

	return map[string]any{
		"fieldVisibility": map[string]any{},
		"fieldWidths":     widths,
		"filters":         map[string]any{"logic": "AND", "conditions": conditions, "children": []any{}},
		"sorts":           sorts,
		"groups":          groups,
	}
}

// legacyFilterOp 把旧筛选操作符映射到新的。
func legacyFilterOp(op string) string {
	switch op {
	case "contains":
		return "contains"
	case "is":
		return "eq"
	case "isNot":
		return "ne"
	case "empty":
		return "isempty"
	case "notEmpty":
		return "isnotempty"
	default:
		return "contains"
	}
}

// MigrateIfNeeded 在存在旧版 sheet 数据时自动迁移到 Base Engine。
//
// 迁移是幂等的：base_app.migrated 有标记后不再重复执行。
func (s *Service) MigrateIfNeeded(ctx context.Context, userID, projectID, nodeID uuid.UUID) error {
	var app BaseApp
	if err := s.db.WithContext(ctx).Where("project_id = ? AND node_id = ?", projectID, nodeID).First(&app).Error; err != nil {
		return ErrBaseNotFound
	}
	if app.Migrated != "" {
		return nil
	}
	var legacy model.KnowledgeNodeData
	err := s.db.WithContext(ctx).Where("node_id = ? AND kind = ?", nodeID, "sheet").First(&legacy).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 没有旧数据：标记已迁移，避免以后反复探测。
			return s.db.WithContext(ctx).Model(&app).Update("migrated", "none").Error
		}
		return err
	}
	if len(legacy.Data) == 0 {
		return s.db.WithContext(ctx).Model(&app).Update("migrated", "none").Error
	}
	_, err = s.MigrateLegacySheet(ctx, userID, projectID, nodeID, legacy.Data)
	return err
}

// EnsureBaseWithMigration 取（或创建）Base，并在存在旧数据时自动迁移。
func (s *Service) EnsureBaseWithMigration(ctx context.Context, userID, projectID, nodeID uuid.UUID, name string, legacyRaw []byte) (*BaseInfo, error) {
	info, err := s.EnsureBase(ctx, userID, projectID, nodeID, name)
	if err != nil {
		return nil, err
	}
	if len(legacyRaw) == 0 {
		return info, nil
	}
	return s.MigrateLegacySheet(ctx, userID, projectID, nodeID, legacyRaw)
}
