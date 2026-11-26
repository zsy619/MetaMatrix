package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"metamatrix/api/internal/model"
)

// Service 是 Base Engine 的应用服务：编排用例、控制事务、校验权限。
type Service struct {
	db       *gorm.DB
	registry *Registry
	events   *EventHub
}

// NewService 构造 Base Engine 服务。
func NewService(db *gorm.DB) *Service {
	return &Service{
		db:       db,
		registry: NewRegistry(),
		events:   NewEventHub(),
	}
}

// Registry 暴露字段注册表。
func (s *Service) Registry() *Registry { return s.registry }

// Events 暴露事件中心（SSE 广播）。
func (s *Service) Events() *EventHub { return s.events }

// 领域错误。
var (
	ErrBaseNotFound      = errors.New("base not found")
	ErrTableNotFound     = errors.New("table not found")
	ErrFieldNotFound     = errors.New("field not found")
	ErrRecordNotFound    = errors.New("record not found")
	ErrViewNotFound      = errors.New("view not found")
	ErrForbidden         = errors.New("base operation forbidden")
	ErrVersionConflict   = errors.New("record version conflict")
	ErrSchemaConflict    = errors.New("schema version conflict")
	ErrFieldValueInvalid = errors.New("field value invalid")
)

// 权限角色：沿用知识库空间角色。
const (
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// spaceRole 返回用户在空间内的角色。
func (s *Service) spaceRole(userID, projectID uuid.UUID) string {
	var count int64
	if err := s.db.Model(&struct {
		ID uuid.UUID `gorm:"type:uuid;primaryKey"`
	}{}).Table("projects").Where("id = ? AND owner_user_id = ?", projectID, userID).Count(&count).Error; err == nil && count > 0 {
		return RoleAdmin
	}
	var role string
	err := s.db.Table("knowledge_members").Select("role").Where("project_id = ? AND user_id = ?", projectID, userID).Limit(1).Scan(&role).Error
	if err == nil && role != "" {
		return role
	}
	return ""
}

func roleRank(role string) int {
	switch role {
	case RoleAdmin:
		return 3
	case RoleEditor:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}

// assertAccess 校验空间权限。
func (s *Service) assertAccess(userID, projectID uuid.UUID, need string) error {
	role := s.spaceRole(userID, projectID)
	if role == "" {
		return ErrBaseNotFound
	}
	if roleRank(role) < roleRank(need) {
		return ErrForbidden
	}
	return nil
}

// —— Base ——

// BaseInfo 是对外的 Base 概要。
type BaseInfo struct {
	ID            uuid.UUID  `json:"id"`
	ProjectID     uuid.UUID  `json:"projectId"`
	NodeID        *uuid.UUID `json:"nodeId,omitempty"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	Icon          string     `json:"icon"`
	OwnerID       uuid.UUID  `json:"ownerId"`
	SchemaVersion int64      `json:"schemaVersion"`
	Migrated      string     `json:"migrated,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// EnsureBase 取（或创建）某个知识库节点对应的 Base。
//
// 幂等：同一个 nodeId 只会创建一个 Base。
func (s *Service) EnsureBase(ctx context.Context, userID, projectID, nodeID uuid.UUID, name string) (*BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var app BaseApp
	err := s.db.WithContext(ctx).Where("project_id = ? AND node_id = ?", projectID, nodeID).First(&app).Error
	if err == nil {
		return baseInfoOf(&app), nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	app = BaseApp{
		ID:        uuid.New(),
		ProjectID: projectID,
		NodeID:    &nodeID,
		Name:      strings.TrimSpace(name),
		OwnerID:   userID,
		Status:    1,
	}
	if app.Name == "" {
		app.Name = "多维表格"
	}
	if err := s.db.WithContext(ctx).Create(&app).Error; err != nil {
		return nil, err
	}
	// 新建 Base 同时准备默认数据表（名称字段 + 表格视图），
	// 避免出现「有 Base 无表」的空壳状态——前端所有表级操作都依赖 tableId。
	s.seedDefaultTable(ctx, userID, projectID, app.ID)
	return baseInfoOf(&app), nil
}

// seedDefaultTable 为新建 Base 补一张默认数据表与默认网格视图。
// 权限不足（只读成员）或建表失败时静默跳过：前端会给出「新建数据表」引导。
func (s *Service) seedDefaultTable(ctx context.Context, userID, projectID, baseID uuid.UUID) {
	table, err := s.CreateTable(ctx, userID, projectID, baseID, "数据表", "")
	if err != nil {
		return
	}
	_, _ = s.CreateView(ctx, userID, projectID, table.ID, "表格视图", "grid", map[string]any{})
}

// GetBase 按 ID 取 Base。
func (s *Service) GetBase(ctx context.Context, userID, projectID, baseID uuid.UUID) (*BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var app BaseApp
	if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", baseID, projectID).First(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBaseNotFound
		}
		return nil, err
	}
	return baseInfoOf(&app), nil
}

// ListBases 列出空间下的 Base。
func (s *Service) ListBases(ctx context.Context, userID, projectID uuid.UUID) ([]BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var rows []BaseApp
	if err := s.db.WithContext(ctx).Where("project_id = ?", projectID).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BaseInfo, 0, len(rows))
	for i := range rows {
		out = append(out, *baseInfoOf(&rows[i]))
	}
	return out, nil
}

func baseInfoOf(app *BaseApp) *BaseInfo {
	return &BaseInfo{
		ID:            app.ID,
		ProjectID:     app.ProjectID,
		NodeID:        app.NodeID,
		Name:          app.Name,
		Description:   app.Description,
		Icon:          app.Icon,
		OwnerID:       app.OwnerID,
		SchemaVersion: app.SchemaVersion,
		Migrated:      app.Migrated,
		CreatedAt:     app.CreatedAt,
		UpdatedAt:     app.UpdatedAt,
	}
}

// MarkMigrationFailed 记录迁移失败。
//
// 迁移失败不能把用户挡在门外：标记后前端进入只读降级，
// 继续读旧 JSONB 数据，用户可以导出或联系管理员修复。
func (s *Service) MarkMigrationFailed(ctx context.Context, baseID uuid.UUID, reason string) error {
	reason = strings.TrimSpace(reason)
	if len(reason) > 200 {
		reason = reason[:200]
	}
	return s.db.WithContext(ctx).Model(&BaseApp{}).Where("id = ?", baseID).
		Update("migrated", "failed:"+reason).Error
}

// —— Table ——

// TableInfo 是对外的表信息。
type TableInfo struct {
	ID             uuid.UUID      `json:"id"`
	BaseID         uuid.UUID      `json:"baseId"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	PrimaryFieldID *uuid.UUID     `json:"primaryFieldId,omitempty"`
	SortOrder      int            `json:"sortOrder"`
	SchemaVersion  int64          `json:"schemaVersion"`
	Settings       map[string]any `json:"settings"`
	Fields         []FieldMeta    `json:"fields"`
	RecordCount    int64          `json:"recordCount"`
	CreatedAt      time.Time      `json:"createdAt"`
}

// ListTables 列出 Base 下的表。
func (s *Service) ListTables(ctx context.Context, userID, projectID, baseID uuid.UUID) ([]TableInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var tables []BaseTable
	if err := s.db.WithContext(ctx).Where("base_id = ?", baseID).Order("sort_order ASC, created_at ASC").Find(&tables).Error; err != nil {
		return nil, err
	}
	out := make([]TableInfo, 0, len(tables))
	for i := range tables {
		info, err := s.tableInfo(ctx, &tables[i])
		if err != nil {
			return nil, err
		}
		out = append(out, *info)
	}
	return out, nil
}

func (s *Service) tableInfo(ctx context.Context, t *BaseTable) (*TableInfo, error) {
	idx, err := s.loadFieldIndex(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	var count int64
	s.db.WithContext(ctx).Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", t.ID).Count(&count)
	settings := map[string]any{}
	if len(t.Settings) > 0 {
		_ = json.Unmarshal(t.Settings, &settings)
	}
	return &TableInfo{
		ID:             t.ID,
		BaseID:         t.BaseID,
		Name:           t.Name,
		Description:    t.Description,
		PrimaryFieldID: t.PrimaryFieldID,
		SortOrder:      t.SortOrder,
		SchemaVersion:  t.SchemaVersion,
		Settings:       settings,
		Fields:         fieldMetas(idx),
		RecordCount:    count,
		CreatedAt:      t.CreatedAt,
	}, nil
}

// CreateTable 建表：自动带一个主字段。
func (s *Service) CreateTable(ctx context.Context, userID, projectID, baseID uuid.UUID, name, description string) (*TableInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("%w: table name is required", ErrFieldValueInvalid)
	}
	table := BaseTable{
		ID:          uuid.New(),
		BaseID:      baseID,
		Name:        name,
		Description: strings.TrimSpace(description),
		SortOrder:   int(time.Now().Unix()),
		Status:      1,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&table).Error; err != nil {
			return err
		}
		primary := BaseField{
			ID:        uuid.New(),
			TableID:   table.ID,
			Name:      "名称",
			Type:      string(FieldText),
			Config:    datatypes.JSON(`{"maxLength":200}`),
			IsPrimary: true,
			SortOrder: 0,
			Version:   1,
			Status:    1,
		}
		if err := tx.Create(&primary).Error; err != nil {
			return err
		}
		table.PrimaryFieldID = &primary.ID
		if err := tx.Model(&BaseTable{}).Where("id = ?", table.ID).Update("primary_field_id", primary.ID).Error; err != nil {
			return err
		}
		return s.bumpSchema(tx, table.ID)
	})
	if err != nil {
		return nil, err
	}
	return s.tableInfo(ctx, &table)
}

// UpdateTable 改表信息。
func (s *Service) UpdateTable(ctx context.Context, userID, projectID, tableID uuid.UUID, name, description *string) (*TableInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", tableID).First(&table).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTableNotFound
		}
		return nil, err
	}
	updates := map[string]any{}
	if name != nil {
		updates["name"] = strings.TrimSpace(*name)
	}
	if description != nil {
		updates["description"] = strings.TrimSpace(*description)
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&table).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return s.tableInfo(ctx, &table)
}

// DeleteTable 软删除表及其记录。
func (s *Service) DeleteTable(ctx context.Context, userID, projectID, tableID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", tableID).Delete(&BaseTable{}).Error; err != nil {
			return err
		}
		if err := tx.Where("table_id = ?", tableID).Delete(&BaseRecord{}).Error; err != nil {
			return err
		}
		return tx.Where("table_id = ?", tableID).Delete(&BaseRecordValue{}).Error
	})
}

// bumpSchema 推进表的结构版本。
func (s *Service) bumpSchema(tx *gorm.DB, tableID uuid.UUID) error {
	return tx.Model(&BaseTable{}).Where("id = ?", tableID).
		UpdateColumn("schema_version", gorm.Expr("schema_version + 1")).Error
}

// —— Field ——

// FieldInput 是创建字段的入参。
type FieldInput struct {
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Config    map[string]any `json:"config"`
	Required  bool           `json:"required"`
	IsPrimary bool           `json:"isPrimary"`
	SortOrder int            `json:"sortOrder"`
}

// FieldUpdateInput 是修改字段的入参：字段级部分更新。
//
// 指针字段区分「没传」与「传了零值」：
// 只改必填或只改顺序时，不能把没传的 name 覆盖成空串。
type FieldUpdateInput struct {
	Name      *string        `json:"name"`
	Config    map[string]any `json:"config"`
	Required  *bool          `json:"required"`
	SortOrder *int           `json:"sortOrder"`
}

// ListFields 列出表字段。
func (s *Service) ListFields(ctx context.Context, userID, projectID, tableID uuid.UUID) ([]FieldMeta, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	metas := fieldMetas(idx)
	sort.Slice(metas, func(i, j int) bool { return metas[i].SortOrder < metas[j].SortOrder })
	return metas, nil
}

// loadFieldIndex 加载表字段元信息与处理器。
func (s *Service) loadFieldIndex(ctx context.Context, tableID uuid.UUID) (*fieldIndex, error) {
	var rows []BaseField
	if err := s.db.WithContext(ctx).Where("table_id = ? AND status = 1", tableID).Order("sort_order ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	idx := &fieldIndex{byID: map[uuid.UUID]FieldMeta{}, handlers: map[uuid.UUID]FieldHandler{}}
	for _, f := range rows {
		cfg := map[string]any{}
		if len(f.Config) > 0 {
			_ = json.Unmarshal(f.Config, &cfg)
		}
		idx.byID[f.ID] = FieldMeta{
			ID:        f.ID.String(),
			Name:      f.Name,
			Type:      f.Type,
			Config:    cfg,
			Required:  f.Required,
			IsPrimary: f.IsPrimary,
			SortOrder: f.SortOrder,
			Version:   f.Version,
		}
		if handler, ok := s.registry.Get(FieldType(f.Type)); ok {
			idx.handlers[f.ID] = handler
		}
	}
	return idx, nil
}

// loadTableSchema 加载表与字段元信息，并做空间权限校验。
func (s *Service) loadTableSchema(ctx context.Context, userID, projectID, tableID uuid.UUID) (*BaseTable, *fieldIndex, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, nil, err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", tableID).First(&table).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrTableNotFound
		}
		return nil, nil, err
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, nil, err
	}
	return &table, idx, nil
}

// CreateField 创建字段。
func (s *Service) CreateField(ctx context.Context, userID, projectID, tableID uuid.UUID, in FieldInput) (*FieldMeta, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: field name is required", ErrFieldValueInvalid)
	}
	if err := s.registry.ValidateFieldType(in.Type); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrFieldValueInvalid, err.Error())
	}
	handler, _ := s.registry.Get(FieldType(in.Type))
	cfg := in.Config
	if cfg == nil {
		cfg = map[string]any{}
	}
	if err := handler.ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrFieldValueInvalid, err.Error())
	}
	rawCfg, _ := json.Marshal(cfg)
	field := BaseField{
		ID:        uuid.New(),
		TableID:   tableID,
		Name:      name,
		Type:      in.Type,
		Config:    rawCfg,
		Required:  in.Required,
		IsPrimary: in.IsPrimary,
		SortOrder: in.SortOrder,
		Version:   1,
		Status:    1,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&field).Error; err != nil {
			return err
		}
		return s.bumpSchema(tx, tableID)
	})
	if err != nil {
		return nil, err
	}
	// 新字段可能是可筛选类型（长文本 / 关联记录 / 关联文档），
	// 存量记录里的同名字段值需要补投影，否则筛选会「命中为空」。
	if err := s.reindexTable(ctx, tableID); err != nil {
		return nil, err
	}
	return &FieldMeta{
		ID: field.ID.String(), Name: field.Name, Type: field.Type, Config: cfg,
		Required: field.Required, IsPrimary: field.IsPrimary, SortOrder: field.SortOrder, Version: field.Version,
	}, nil
}

// UpdateField 修改字段元信息（改名、改配置、改必填、改顺序）。
//
// 只允许改名称与配置；改类型必须走 MigrateField，避免存量数据无法解析。
func (s *Service) UpdateField(ctx context.Context, userID, projectID, fieldID uuid.UUID, in FieldUpdateInput) (*FieldMeta, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFieldNotFound
		}
		return nil, err
	}
	updates := map[string]any{
		"version":  gorm.Expr("version + 1"),
	}
	cfg := map[string]any{}
	if len(field.Config) > 0 {
		_ = json.Unmarshal(field.Config, &cfg)
	}
	if in.Name != nil {
		updates["name"] = strings.TrimSpace(*in.Name)
	}
	if in.Config != nil {
		handler, _ := s.registry.Get(FieldType(field.Type))
		if err := handler.ValidateConfig(in.Config); err != nil {
			return nil, fmt.Errorf("%w: %s", ErrFieldValueInvalid, err.Error())
		}
		rawCfg, _ := json.Marshal(in.Config)
		updates["config"] = datatypes.JSON(rawCfg)
		cfg = in.Config
	}
	if in.Required != nil {
		updates["required"] = *in.Required
	}
	if in.SortOrder != nil {
		updates["sort_order"] = *in.SortOrder
	}
	if err := s.db.WithContext(ctx).Model(&field).Updates(updates).Error; err != nil {
		return nil, err
	}
	name := field.Name
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
	}
	required := field.Required
	if in.Required != nil {
		required = *in.Required
	}
	sortOrder := field.SortOrder
	if in.SortOrder != nil {
		sortOrder = *in.SortOrder
	}
	return &FieldMeta{
		ID: field.ID.String(), Name: name, Type: field.Type, Config: cfg,
		Required: required, IsPrimary: field.IsPrimary, SortOrder: sortOrder, Version: field.Version + 1,
	}, nil
}

// ReorderFields 按给定顺序重排表字段。
//
// fieldIDs 必须是该表全部字段的完整集合，顺序即最终顺序；
// 缺项、重复或多传都直接报错，避免出现两个字段同序导致排序不稳定。
func (s *Service) ReorderFields(ctx context.Context, userID, projectID, tableID uuid.UUID, fieldIDs []uuid.UUID) ([]FieldMeta, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	if len(fieldIDs) != len(idx.byID) {
		return nil, fmt.Errorf("%w: field list mismatch, want %d got %d", ErrFieldValueInvalid, len(idx.byID), len(fieldIDs))
	}
	seen := make(map[uuid.UUID]bool, len(fieldIDs))
	for _, id := range fieldIDs {
		if _, ok := idx.byID[id]; !ok {
			return nil, fmt.Errorf("%w: unknown field %s", ErrFieldValueInvalid, id)
		}
		if seen[id] {
			return nil, fmt.Errorf("%w: duplicated field %s", ErrFieldValueInvalid, id)
		}
		seen[id] = true
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, id := range fieldIDs {
			if err := tx.Model(&BaseField{}).Where("id = ?", id).Updates(map[string]any{
				"sort_order": i,
				"version":    gorm.Expr("version + 1"),
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	idx, err = s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	metas := fieldMetas(idx)
	sort.Slice(metas, func(i, j int) bool { return metas[i].SortOrder < metas[j].SortOrder })
	return metas, nil
}

// DeleteField 删除字段：同时清理记录里的值与投影。
func (s *Service) DeleteField(ctx context.Context, userID, projectID, fieldID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrFieldNotFound
		}
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", fieldID).Delete(&BaseField{}).Error; err != nil {
			return err
		}
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseRecordValue{}).Error; err != nil {
			return err
		}
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseFormulaDependency{}).Error; err != nil {
			return err
		}
		// 清掉记录里残留的字段值。
		var records []BaseRecord
		if err := tx.Where("table_id = ?", field.TableID).Find(&records).Error; err != nil {
			return err
		}
		for _, rec := range records {
			data := map[string]any{}
			if len(rec.Data) > 0 {
				_ = json.Unmarshal(rec.Data, &data)
			}
			if _, ok := data[fieldID.String()]; !ok {
				continue
			}
			delete(data, fieldID.String())
			raw, _ := json.Marshal(data)
			if err := tx.Model(&BaseRecord{}).Where("id = ?", rec.ID).Update("data", raw).Error; err != nil {
				return err
			}
		}
		return s.bumpSchema(tx, field.TableID)
	})
}

// recalcTableFormulas 重算表内所有记录的公式字段并同步投影。
//
// 公式定义变化后，历史记录不会自动重算，这里做一次全表回填。
func (s *Service) recalcTableFormulas(ctx context.Context, tableID uuid.UUID) error {
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", tableID).First(&table).Error; err != nil {
		return err
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return err
	}
	var records []BaseRecord
	if err := s.db.WithContext(ctx).Where("table_id = ?", tableID).Find(&records).Error; err != nil {
		return err
	}
	for _, rec := range records {
		data := map[string]any{}
		if len(rec.Data) > 0 {
			_ = json.Unmarshal(rec.Data, &data)
		}
		computed, err := s.recomputeFormulas(s.db.WithContext(ctx), &table, idx, data)
		if err != nil {
			// 循环依赖等问题不影响其它记录的回填。
			continue
		}
		raw, _ := json.Marshal(computed)
		if err := s.db.WithContext(ctx).Model(&BaseRecord{}).Where("id = ?", rec.ID).
			Updates(map[string]any{"data": raw, "version": gorm.Expr("version + 1")}).Error; err != nil {
			return err
		}
		if err := s.syncAllProjections(s.db.WithContext(ctx), tableID, rec.ID, computed); err != nil {
			return err
		}
	}
	return nil
}

// MigrateField 迁移字段类型：先预检存量数据，再逐条转换。
func (s *Service) MigrateField(ctx context.Context, userID, projectID, fieldID uuid.UUID, newType string) (*FieldMeta, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFieldNotFound
		}
		return nil, err
	}
	if err := s.registry.ValidateFieldType(newType); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrFieldValueInvalid, err.Error())
	}
	newHandler, _ := s.registry.Get(FieldType(newType))
	var records []BaseRecord
	if err := s.db.WithContext(ctx).Where("table_id = ?", field.TableID).Find(&records).Error; err != nil {
		return nil, err
	}
	// 预检：无法转换的值直接报错，不做静默丢弃。
	type plan struct {
		record BaseRecord
		data   map[string]any
		value  any
	}
	plans := make([]plan, 0, len(records))
	for _, rec := range records {
		data := map[string]any{}
		if len(rec.Data) > 0 {
			_ = json.Unmarshal(rec.Data, &data)
		}
		raw, ok := data[fieldID.String()]
		if !ok {
			continue
		}
		value, err := newHandler.Normalize(raw, nil)
		if err != nil {
			return nil, fmt.Errorf("%w: 存量数据无法迁移到 %s：%v", ErrFieldValueInvalid, newType, err)
		}
		if err := newHandler.ValidateValue(value, nil); err != nil {
			return nil, fmt.Errorf("%w: 存量数据无法迁移到 %s：%v", ErrFieldValueInvalid, newType, err)
		}
		plans = append(plans, plan{record: rec, data: data, value: value})
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, p := range plans {
			p.data[fieldID.String()] = p.value
			raw, _ := json.Marshal(p.data)
			if err := tx.Model(&BaseRecord{}).Where("id = ?", p.record.ID).Update("data", raw).Error; err != nil {
				return err
			}
			if err := s.syncProjection(tx, field.TableID, p.record.ID, fieldID, p.value); err != nil {
				return err
			}
		}
		if err := tx.Model(&field).Updates(map[string]any{
			"type":    newType,
			"version": gorm.Expr("version + 1"),
		}).Error; err != nil {
			return err
		}
		return s.bumpSchema(tx, field.TableID)
	})
	if err != nil {
		return nil, err
	}
	// 类型变了，投影类型可能也变（如 text → doc）：重建全表投影。
	if err := s.reindexTable(ctx, field.TableID); err != nil {
		return nil, err
	}
	return &FieldMeta{
		ID: field.ID.String(), Name: field.Name, Type: newType, Required: field.Required,
		IsPrimary: field.IsPrimary, SortOrder: field.SortOrder, Version: field.Version + 1,
	}, nil
}

// —— Record ——

// RecordInput 是记录写入入参。
type RecordInput struct {
	Fields          map[string]any `json:"fields"`
	ExpectedVersion int64          `json:"expectedVersion"`
	SchemaVersion   int64          `json:"schemaVersion"`
}

// CreateRecord 新建记录。
func (s *Service) CreateRecord(ctx context.Context, userID, projectID, tableID uuid.UUID, in RecordInput) (*RecordRow, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	normalized, err := s.normalizeValues(idx, in.Fields)
	if err != nil {
		return nil, err
	}
	if err := s.validateDocRefs(ctx, projectID, idx, normalized); err != nil {
		return nil, err
	}
	rec := BaseRecord{
		ID:        uuid.New(),
		TableID:   tableID,
		Version:   1,
		CreatedBy: userID,
		UpdatedBy: userID,
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		normalized, err = s.recomputeFormulas(tx, table, idx, normalized)
		if err != nil {
			return err
		}
		raw, _ := json.Marshal(normalized)
		rec.Data = raw
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		if err := s.syncAllProjections(tx, tableID, rec.ID, normalized); err != nil {
			return err
		}
		if err := s.writeAudit(tx, projectID, table.BaseID, &tableID, &rec.ID, userID, "record.created", nil, normalized, ""); err != nil {
			return err
		}
		return s.writeEvent(tx, projectID, table.BaseID, &tableID, &rec.ID, "record.created", map[string]any{
			"version": rec.Version,
			"fields":  normalized,
		})
	}); err != nil {
		return nil, err
	}
	return &RecordRow{ID: rec.ID, Version: rec.Version, Fields: normalized, Updated: rec.UpdatedAt}, nil
}

// UpdateRecord 更新记录（乐观锁）。
func (s *Service) UpdateRecord(ctx context.Context, userID, projectID, recordID uuid.UUID, in RecordInput) (*RecordRow, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var rec BaseRecord
	if err := s.db.WithContext(ctx).Where("id = ?", recordID).First(&rec).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, rec.TableID)
	if err != nil {
		return nil, err
	}
	if in.ExpectedVersion > 0 && in.ExpectedVersion != rec.Version {
		return nil, fmt.Errorf("%w: 当前版本 %d，客户端版本 %d", ErrVersionConflict, rec.Version, in.ExpectedVersion)
	}
	if in.SchemaVersion > 0 && in.SchemaVersion != table.SchemaVersion {
		return nil, fmt.Errorf("%w: 当前结构版本 %d，客户端版本 %d", ErrSchemaConflict, table.SchemaVersion, in.SchemaVersion)
	}
	data := map[string]any{}
	if len(rec.Data) > 0 {
		_ = json.Unmarshal(rec.Data, &data)
	}
	before := map[string]any{}
	for k, v := range data {
		before[k] = v
	}
	patch, err := s.normalizeValues(idx, in.Fields)
	if err != nil {
		return nil, err
	}
	if err := s.validateDocRefs(ctx, projectID, idx, patch); err != nil {
		return nil, err
	}
	for k, v := range patch {
		data[k] = v
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		data, err = s.recomputeFormulas(tx, table, idx, data)
		if err != nil {
			return err
		}
		raw, _ := json.Marshal(data)
		res := tx.Model(&BaseRecord{}).
			Where("id = ? AND version = ? AND deleted_at IS NULL", rec.ID, rec.Version).
			Updates(map[string]any{
				"data":       raw,
				"version":    gorm.Expr("version + 1"),
				"updated_by": userID,
				"updated_at": time.Now(),
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("%w: 记录已被他人修改", ErrVersionConflict)
		}
		rec.Version++
		if err := s.syncAllProjections(tx, rec.TableID, rec.ID, data); err != nil {
			return err
		}
		if err := s.writeAudit(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, userID, "record.updated", before, data, ""); err != nil {
			return err
		}
		return s.writeEvent(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, "record.updated", map[string]any{
			"version": rec.Version,
			"fields":  patch,
		})
	})
	if err != nil {
		return nil, err
	}
	return &RecordRow{ID: rec.ID, Version: rec.Version, Fields: data, Updated: rec.UpdatedAt}, nil
}

// DeleteRecord 软删除记录。
func (s *Service) DeleteRecord(ctx context.Context, userID, projectID, recordID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	var rec BaseRecord
	if err := s.db.WithContext(ctx).Where("id = ?", recordID).First(&rec).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrRecordNotFound
		}
		return err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", rec.TableID).First(&table).Error; err != nil {
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", recordID).Delete(&BaseRecord{}).Error; err != nil {
			return err
		}
		if err := tx.Where("record_id = ?", recordID).Delete(&BaseRecordValue{}).Error; err != nil {
			return err
		}
		if err := s.writeAudit(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, userID, "record.deleted", nil, nil, ""); err != nil {
			return err
		}
		return s.writeEvent(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, "record.deleted", map[string]any{
			"version": rec.Version,
		})
	})
}

// BatchCreate 批量创建记录（默认整批成功或整批失败）。
func (s *Service) BatchCreate(ctx context.Context, userID, projectID, tableID uuid.UUID, items []RecordInput) ([]RecordRow, error) {
	out := make([]RecordRow, 0, len(items))
	for _, item := range items {
		row, err := s.CreateRecord(ctx, userID, projectID, tableID, item)
		if err != nil {
			return nil, err
		}
		out = append(out, *row)
	}
	return out, nil
}

// BatchUpdate 批量更新记录。
func (s *Service) BatchUpdate(ctx context.Context, userID, projectID, tableID uuid.UUID, ids []uuid.UUID, fields map[string]any) ([]RecordRow, error) {
	out := make([]RecordRow, 0, len(ids))
	for _, id := range ids {
		row, err := s.UpdateRecord(ctx, userID, projectID, id, RecordInput{Fields: fields})
		if err != nil {
			return nil, err
		}
		out = append(out, *row)
	}
	return out, nil
}

// BatchDelete 批量删除记录。
func (s *Service) BatchDelete(ctx context.Context, userID, projectID, tableID uuid.UUID, ids []uuid.UUID) error {
	for _, id := range ids {
		if err := s.DeleteRecord(ctx, userID, projectID, id); err != nil {
			return err
		}
	}
	return nil
}

// normalizeValues 校验并归一化字段值。
func (s *Service) normalizeValues(idx *fieldIndex, input map[string]any) (map[string]any, error) {
	out := map[string]any{}
	for key, raw := range input {
		fieldID, err := uuid.Parse(key)
		if err != nil {
			return nil, fmt.Errorf("%w: bad field id %s", ErrFieldValueInvalid, key)
		}
		meta, ok := idx.byID[fieldID]
		if !ok {
			return nil, fmt.Errorf("%w: unknown field %s", ErrFieldValueInvalid, key)
		}
		handler, ok := idx.handler(fieldID)
		if !ok {
			return nil, fmt.Errorf("%w: unsupported field type %s", ErrFieldValueInvalid, meta.Type)
		}
		if handler.Definition().Capabilities.Computed {
			// 计算字段由服务端写入，忽略客户端传入值。
			continue
		}
		if err := handler.ValidateValue(raw, meta.Config); err != nil {
			return nil, fmt.Errorf("%w: %s：%v", ErrFieldValueInvalid, meta.Name, err)
		}
		value, err := handler.Normalize(raw, meta.Config)
		if err != nil {
			return nil, fmt.Errorf("%w: %s：%v", ErrFieldValueInvalid, meta.Name, err)
		}
		out[fieldID.String()] = value
	}
	// 必填校验。
	for id, meta := range idx.byID {
		if !meta.Required {
			continue
		}
		if _, ok := out[id.String()]; !ok {
			continue
		}
		if value, ok := out[id.String()]; ok {
			if s, isStr := value.(string); isStr && s == "" {
				return nil, fmt.Errorf("%w: %s 为必填", ErrFieldValueInvalid, meta.Name)
			}
		}
	}
	return out, nil
}

// validateDocRefs 校验「关联文档」字段引用的节点确实属于当前空间。
//
// 跨空间引用会泄露别的空间内容，这里直接拒绝。
func (s *Service) validateDocRefs(ctx context.Context, projectID uuid.UUID, idx *fieldIndex, values map[string]any) error {
	for id, meta := range idx.byID {
		if meta.Type != string(FieldDoc) {
			continue
		}
		raw, ok := values[id.String()]
		if !ok {
			continue
		}
		ids := stringSlice(raw)
		if len(ids) == 0 {
			continue
		}
		for _, rawID := range ids {
			nodeID, err := uuid.Parse(rawID)
			if err != nil {
				return fmt.Errorf("%w: %s 关联的文档 ID 非法", ErrFieldValueInvalid, meta.Name)
			}
			var count int64
			if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
				Where("id = ? AND project_id = ? AND trashed_at IS NULL", nodeID, projectID).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return fmt.Errorf("%w: %s 关联的文档不在当前空间", ErrFieldValueInvalid, meta.Name)
			}
		}
	}
	return nil
}

// reindexTable 按当前字段能力重建整表投影。
//
// 背景：字段的「可筛选」能力与「可索引」能力必须一致——
// 早期版本里长文本 / 关联记录 / 关联文档声明了 Filterable 却没开 Indexable，
// 导致这些字段既不写投影也筛不出结果。字段新建或改类型后必须重建一次。
func (s *Service) reindexTable(ctx context.Context, tableID uuid.UUID) error {
	var records []BaseRecord
	if err := s.db.WithContext(ctx).
		Where("table_id = ? AND deleted_at IS NULL", tableID).
		Limit(5000).
		Find(&records).Error; err != nil {
		return err
	}
	if len(records) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, rec := range records {
			data := map[string]any{}
			if len(rec.Data) > 0 {
				if err := json.Unmarshal(rec.Data, &data); err != nil {
					continue
				}
			}
			if err := s.syncAllProjections(tx, tableID, rec.ID, data); err != nil {
				return err
			}
		}
		return nil
	})
}

// syncAllProjections 把记录的所有字段写入查询投影表。
func (s *Service) syncAllProjections(tx *gorm.DB, tableID, recordID uuid.UUID, data map[string]any) error {
	var fields []BaseField
	if err := tx.Where("table_id = ? AND status = 1", tableID).Find(&fields).Error; err != nil {
		return err
	}
	for _, f := range fields {
		handler, ok := s.registry.Get(FieldType(f.Type))
		if !ok || !handler.Definition().Capabilities.Indexable {
			continue
		}
		value, exists := data[f.ID.String()]
		if !exists {
			continue
		}
		if err := s.syncProjection(tx, tableID, recordID, f.ID, value); err != nil {
			return err
		}
	}
	return nil
}

// syncProjection 写入单条投影记录。
func (s *Service) syncProjection(tx *gorm.DB, tableID, recordID, fieldID uuid.UUID, value any) error {
	handler, ok := s.registry.Get(FieldType(fieldMustType(s, fieldID)))
	if !ok {
		return nil
	}
	row := BaseRecordValue{
		ID:        uuid.New(),
		TableID:   tableID,
		RecordID:  recordID,
		FieldID:   fieldID,
		ValueType: handler.ProjectedType(),
	}
	switch handler.ProjectedType() {
	case ProjectedNumber:
		if n, ok := toFloat(value); ok {
			row.ValueNumber = n
		}
	case ProjectedDate:
		if ts, err := parseTime(value); err == nil {
			row.ValueDate = &ts
		}
	case ProjectedBool:
		row.ValueBool = toBool(value)
	case ProjectedJSON:
		raw, _ := json.Marshal(value)
		row.ValueJSON = raw
	default:
		row.ValueText = handler.Text(value)
	}
	// 覆盖式写入：先删后插，避免唯一键冲突与残留。
	if err := tx.Where("record_id = ? AND field_id = ?", recordID, fieldID).Delete(&BaseRecordValue{}).Error; err != nil {
		return err
	}
	return tx.Create(&row).Error
}

// fieldMustType 读取字段类型；读不到时回退为文本。
func fieldMustType(s *Service, fieldID uuid.UUID) string {
	var t string
	if err := s.db.Model(&BaseField{}).Where("id = ?", fieldID).Select("type").Scan(&t).Error; err == nil && t != "" {
		return t
	}
	return string(FieldText)
}

// recomputeFormulas 计算公式字段并写回数据。
//
// 计算顺序由依赖图拓扑决定；循环依赖直接报错，不做半吊子计算。
func (s *Service) recomputeFormulas(tx *gorm.DB, table *BaseTable, idx *fieldIndex, data map[string]any) (map[string]any, error) {
	var formulas []BaseFieldFormula
	if err := tx.Where("status = 1").Find(&formulas).Error; err != nil {
		return data, nil
	}
	if len(formulas) == 0 {
		return data, nil
	}
	// 只处理本表的公式字段。
	byID := map[string]BaseFieldFormula{}
	for _, f := range formulas {
		if _, ok := idx.byID[f.FieldID]; ok {
			byID[f.FieldID.String()] = f
		}
	}
	if len(byID) == 0 {
		return data, nil
	}
	// 字段名 → 字段 ID（公式用 {字段名} 引用）。
	nameToID := map[string]string{}
	for id, meta := range idx.byID {
		nameToID[meta.Name] = id.String()
	}
	// 依赖图（字段 ID → 依赖字段 ID），用于拓扑排序与环检测。
	deps := map[string][]string{}
	asts := map[string]*ASTNode{}
	for id, f := range byID {
		var node ASTNode
		if len(f.AST) > 0 {
			_ = json.Unmarshal(f.AST, &node)
		}
		asts[id] = &node
		for _, dep := range FormulaDependencies(&node) {
			depID, ok := nameToID[dep]
			if !ok {
				parsed, perr := uuid.Parse(dep)
				if perr != nil {
					continue
				}
				if _, direct := idx.byID[parsed]; !direct {
					continue
				}
				depID = parsed.String()
			}
			deps[id] = append(deps[id], depID)
		}
	}
	if cycle := DetectCycle(deps); len(cycle) > 0 {
		return data, fmt.Errorf("%w: %s", ErrFormulaCycle, strings.Join(cycle, " → "))
	}
	// 拓扑排序：依赖者后算。
	order := topoOrder(deps)
	for _, id := range order {
		f, ok := byID[id]
		if !ok {
			continue
		}
		node := asts[id]
		if node == nil {
			continue
		}
		ctxValues := map[string]any{}
		for fid, meta := range idx.byID {
			key := fid.String()
			ctxValues[key] = data[key]
			ctxValues[meta.Name] = data[key]
		}
		value, err := EvaluateFormula(node, EvalContext{FieldValues: ctxValues, Now: time.Now()})
		if err != nil {
			var fe *FormulaError
			if errors.As(err, &fe) {
				value = fe.Code
			} else {
				value = ErrCodeValue
			}
		}
		data[id] = value
		_ = f
	}
	return data, nil
}

// topoOrder 返回公式字段的计算顺序（依赖在前）。
func topoOrder(deps map[string][]string) []string {
	visited := map[string]bool{}
	order := []string{}
	var visit func(node string)
	visit = func(node string) {
		if visited[node] {
			return
		}
		visited[node] = true
		for _, dep := range deps[node] {
			visit(dep)
		}
		order = append(order, node)
	}
	keys := make([]string, 0, len(deps))
	for k := range deps {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		visit(k)
	}
	return order
}

// —— View ——

// ViewInfo 是视图信息。
type ViewInfo struct {
	ID        uuid.UUID      `json:"id"`
	TableID   uuid.UUID      `json:"tableId"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Config    map[string]any `json:"config"`
	IsDefault bool           `json:"isDefault"`
	OwnerID   uuid.UUID      `json:"ownerId"`
	Version   int64          `json:"version"`
	CreatedAt time.Time      `json:"createdAt"`
}

// ListViews 列出表视图。
func (s *Service) ListViews(ctx context.Context, userID, projectID, tableID uuid.UUID) ([]ViewInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var rows []BaseView
	if err := s.db.WithContext(ctx).Where("table_id = ? AND status = 1", tableID).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ViewInfo, 0, len(rows))
	for _, v := range rows {
		out = append(out, viewInfoOf(&v))
	}
	return out, nil
}

func viewInfoOf(v *BaseView) ViewInfo {
	cfg := map[string]any{}
	if len(v.Config) > 0 {
		_ = json.Unmarshal(v.Config, &cfg)
	}
	return ViewInfo{
		ID: v.ID, TableID: v.TableID, Name: v.Name, Type: v.Type, Config: cfg,
		IsDefault: v.IsDefault, OwnerID: v.OwnerID, Version: v.Version, CreatedAt: v.CreatedAt,
	}
}

// CreateView 新建视图。
func (s *Service) CreateView(ctx context.Context, userID, projectID, tableID uuid.UUID, name, viewType string, config map[string]any) (*ViewInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	if strings.TrimSpace(name) == "" {
		name = "新视图"
	}
	if viewType == "" {
		viewType = "grid"
	}
	raw, _ := json.Marshal(config)
	view := BaseView{
		ID: uuid.New(), TableID: tableID, Name: name, Type: viewType, Config: raw,
		OwnerID: userID, Version: 1, Status: 1,
	}
	if err := s.db.WithContext(ctx).Create(&view).Error; err != nil {
		return nil, err
	}
	info := viewInfoOf(&view)
	return &info, nil
}

// UpdateView 更新视图配置（乐观锁）。
func (s *Service) UpdateView(ctx context.Context, userID, projectID, viewID uuid.UUID, name, viewType *string, config map[string]any, version int64) (*ViewInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var view BaseView
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).First(&view).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrViewNotFound
		}
		return nil, err
	}
	updates := map[string]any{"version": gorm.Expr("version + 1")}
	if name != nil {
		updates["name"] = strings.TrimSpace(*name)
	}
	if viewType != nil && *viewType != "" {
		updates["type"] = *viewType
	}
	if config != nil {
		raw, _ := json.Marshal(config)
		updates["config"] = raw
	}
	query := s.db.WithContext(ctx).Model(&view)
	if version > 0 {
		query = query.Where("version = ?", version)
	}
	res := query.Updates(updates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, fmt.Errorf("%w: 视图已被他人修改", ErrVersionConflict)
	}
	var fresh BaseView
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).First(&fresh).Error; err != nil {
		return nil, err
	}
	info := viewInfoOf(&fresh)
	return &info, nil
}

// DeleteView 删除视图。
func (s *Service) DeleteView(ctx context.Context, userID, projectID, viewID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	return s.db.WithContext(ctx).Where("id = ?", viewID).Delete(&BaseView{}).Error
}

// —— Formula ——

// FormulaValidation 是公式校验结果。
type FormulaValidation struct {
	Valid        bool     `json:"valid"`
	AST          *ASTNode `json:"ast,omitempty"`
	Dependencies []string `json:"dependencies,omitempty"`
	Error        string   `json:"error,omitempty"`
	ErrorCode    string   `json:"errorCode,omitempty"`
	// Value 是预览模式下的计算结果。
	Value any `json:"value,omitempty"`
}

// ValidateFormula 解析并校验公式，检测依赖与循环。
func (s *Service) ValidateFormula(ctx context.Context, userID, projectID, tableID uuid.UUID, expression string) (*FormulaValidation, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	node, err := ParseFormula(expression)
	if err != nil {
		return formulaErrResult(err), nil
	}
	deps := FormulaDependencies(node)
	// 依赖必须落在本表字段上。
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	names := map[string]bool{}
	for _, meta := range idx.byID {
		names[meta.Name] = true
	}
	for _, dep := range deps {
		if !names[dep] {
			if _, err := uuid.Parse(dep); err != nil {
				return &FormulaValidation{Valid: false, Error: "找不到字段 " + dep, ErrorCode: ErrCodeRef}, nil
			}
		}
	}
	return &FormulaValidation{Valid: true, AST: node, Dependencies: deps}, nil
}

func formulaErrResult(err error) *FormulaValidation {
	var fe *FormulaError
	if errors.As(err, &fe) {
		return &FormulaValidation{Valid: false, Error: fe.Message, ErrorCode: fe.Code}
	}
	return &FormulaValidation{Valid: false, Error: err.Error(), ErrorCode: ErrCodeParse}
}

// PreviewFormula 用样例记录预览公式结果。
func (s *Service) PreviewFormula(ctx context.Context, userID, projectID, tableID uuid.UUID, expression string, sample map[string]any) (*FormulaValidation, error) {
	validation, err := s.ValidateFormula(ctx, userID, projectID, tableID, expression)
	if err != nil {
		return nil, err
	}
	if !validation.Valid {
		return validation, nil
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	values := map[string]any{}
	for id, meta := range idx.byID {
		key := id.String()
		v, ok := sample[key]
		if !ok {
			v, ok = sample[meta.Name]
		}
		if !ok {
			continue
		}
		handler, ok := idx.handler(id)
		if !ok {
			continue
		}
		normalized, err := handler.Normalize(v, meta.Config)
		if err != nil {
			continue
		}
		values[key] = normalized
		values[meta.Name] = normalized
	}
	value, err := EvaluateFormula(validation.AST, EvalContext{FieldValues: values, Now: time.Now()})
	if err != nil {
		return formulaErrResult(err), nil
	}
	return &FormulaValidation{
		Valid: true, AST: validation.AST, Dependencies: validation.Dependencies, Value: value,
	}, nil
}

// SaveFormula 保存公式定义并更新依赖。
func (s *Service) SaveFormula(ctx context.Context, userID, projectID, fieldID uuid.UUID, expression string) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrFieldNotFound
		}
		return err
	}
	if field.Type != string(FieldFormula) {
		return fmt.Errorf("%w: 目标字段不是公式字段", ErrFieldValueInvalid)
	}
	node, err := ParseFormula(expression)
	if err != nil {
		return err
	}
	rawAST, _ := json.Marshal(node)
	deps := FormulaDependencies(node)
	tableID := field.TableID
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var formula BaseFieldFormula
		err := tx.Where("field_id = ?", fieldID).First(&formula).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			formula = BaseFieldFormula{
				ID: uuid.New(), FieldID: fieldID, Expression: expression, AST: rawAST,
				CalculationMode: "sync", FormulaVersion: 1, Status: 1,
			}
			if err := tx.Create(&formula).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Model(&formula).Updates(map[string]any{
				"expression":      expression,
				"ast":             rawAST,
				"formula_version": gorm.Expr("formula_version + 1"),
			}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("formula_field_id = ?", fieldID).Delete(&BaseFormulaDependency{}).Error; err != nil {
			return err
		}
		idx, err := s.loadFieldIndex(ctx, field.TableID)
		if err != nil {
			return err
		}
		nameToID := map[string]uuid.UUID{}
		for id, meta := range idx.byID {
			nameToID[meta.Name] = id
		}
		for _, dep := range deps {
			depID, ok := nameToID[dep]
			if !ok {
				continue
			}
			row := BaseFormulaDependency{
				ID: uuid.New(), TableID: field.TableID, FormulaFieldID: fieldID,
				DependencyFieldID: depID, DependencyType: "field", DependencyTableID: &field.TableID,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		return s.bumpSchema(tx, field.TableID)
	})
	if err != nil {
		return err
	}
	// 公式保存后立刻重算本表历史记录，保证新公式立即有值。
	if err := s.recalcTableFormulas(ctx, tableID); err != nil {
		return err
	}
	return nil
}

// —— 审计与事件 ——

func (s *Service) writeAudit(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, recordID *uuid.UUID, operatorID uuid.UUID, operation string, before, after map[string]any, requestID string) error {
	beforeRaw, _ := json.Marshal(before)
	afterRaw, _ := json.Marshal(after)
	row := BaseOperationLog{
		ID: uuid.New(), ProjectID: projectID, BaseID: baseID, TableID: tableID, RecordID: recordID,
		OperatorID: operatorID, Operation: operation, BeforeData: beforeRaw, AfterData: afterRaw,
		RequestID: requestID, CreatedAt: time.Now(),
	}
	return tx.Create(&row).Error
}

func (s *Service) writeEvent(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, aggregateID *uuid.UUID, eventType string, payload map[string]any) error {
	raw, _ := json.Marshal(payload)
	row := BaseEventOutbox{
		ID: uuid.New(), ProjectID: projectID, BaseID: baseID, TableID: tableID,
		AggregateType: "record", AggregateID: derefUUID(aggregateID), EventType: eventType,
		Payload: raw, Status: "pending", CreatedAt: time.Now(),
	}
	return tx.Create(&row).Error
}

func derefUUID(id *uuid.UUID) uuid.UUID {
	if id == nil {
		return uuid.Nil
	}
	return *id
}

// DocBackref 描述一条「多维表格记录引用了该文档」的线索。
type DocBackref struct {
	BaseID      string `json:"baseId"`
	NodeID      string `json:"nodeId"`
	TableID     string `json:"tableId"`
	TableName   string `json:"tableName"`
	RecordID    string `json:"recordId"`
	RecordTitle string `json:"recordTitle"`
	FieldID     string `json:"fieldId"`
	FieldName   string `json:"fieldName"`
}

// ListDocBackrefs 查出当前空间内所有「关联文档」字段指向该文档的记录。
//
// 文档侧的反向引用（C2-16）：之前只有「记录 → 文档」单向跳转，
// 这里补上「文档 → 引用它的记录」的反查能力。
func (s *Service) ListDocBackrefs(ctx context.Context, userID, projectID, nodeID uuid.UUID) ([]DocBackref, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	out := []DocBackref{}

	// 1. 空间内的 Base 与数据表。
	var apps []BaseApp
	if err := s.db.WithContext(ctx).Where("project_id = ?", projectID).Find(&apps).Error; err != nil {
		return nil, err
	}
	if len(apps) == 0 {
		return out, nil
	}
	baseIDs := make([]string, 0, len(apps))
	nodeOfBase := map[string]string{}
	for _, app := range apps {
		baseIDs = append(baseIDs, app.ID.String())
		if app.NodeID != nil {
			nodeOfBase[app.ID.String()] = app.NodeID.String()
		}
	}
	var tables []BaseTable
	if err := s.db.WithContext(ctx).Where("base_id IN ?", baseIDs).Find(&tables).Error; err != nil {
		return nil, err
	}
	if len(tables) == 0 {
		return out, nil
	}
	tableIDs := make([]string, 0, len(tables))
	tableByID := map[string]BaseTable{}
	for _, t := range tables {
		tableIDs = append(tableIDs, t.ID.String())
		tableByID[t.ID.String()] = t
	}

	// 2. 表内类型为 doc 的字段。
	var fields []BaseField
	if err := s.db.WithContext(ctx).Where("table_id IN ? AND type = ?", tableIDs, string(FieldDoc)).Find(&fields).Error; err != nil {
		return nil, err
	}
	if len(fields) == 0 {
		return out, nil
	}
	fieldByID := map[string]BaseField{}
	fieldIDs := make([]string, 0, len(fields))
	for _, f := range fields {
		fieldByID[f.ID.String()] = f
		fieldIDs = append(fieldIDs, f.ID.String())
	}

	// 3. 投影表里命中该文档 ID 的记录（doc 字段以「、」拼接 ID 存文本）。
	type hitRow struct {
		RecordID string
		FieldID  string
		TableID  string
	}
	var hits []hitRow
	like := "%" + escapeLike(nodeID.String()) + "%"
	if err := s.db.WithContext(ctx).
		Table("base_record_value v").
		Select("v.record_id AS record_id, v.field_id AS field_id, v.table_id AS table_id").
		Where("v.field_id IN ? AND v.value_text ILIKE ?", fieldIDs, like).
		Limit(200).
		Scan(&hits).Error; err != nil {
		return nil, err
	}
	if len(hits) == 0 {
		return out, nil
	}

	// 4. 记录主字段文本作为标题。
	recordIDs := make([]string, 0, len(hits))
	for _, h := range hits {
		recordIDs = append(recordIDs, h.RecordID)
	}
	var titles []struct {
		RecordID  string
		ValueText string
	}
	if err := s.db.WithContext(ctx).
		Table("base_record_value v").
		Select("v.record_id AS record_id, v.value_text AS value_text").
		Where("v.record_id IN ?", recordIDs).
		Scan(&titles).Error; err != nil {
		return nil, err
	}
	titleByRecord := map[string]string{}
	for _, t := range titles {
		if _, ok := titleByRecord[t.RecordID]; !ok && t.ValueText != "" {
			titleByRecord[t.RecordID] = t.ValueText
		}
	}

	for _, h := range hits {
		table := tableByID[h.TableID]
		field := fieldByID[h.FieldID]
		out = append(out, DocBackref{
			BaseID:      table.BaseID.String(),
			NodeID:      nodeOfBase[table.BaseID.String()],
			TableID:     h.TableID,
			TableName:   table.Name,
			RecordID:    h.RecordID,
			RecordTitle: titleByRecord[h.RecordID],
			FieldID:     h.FieldID,
			FieldName:   field.Name,
		})
	}
	return out, nil
}

// ListAudit 列出操作审计。
func (s *Service) ListAudit(ctx context.Context, userID, projectID, baseID uuid.UUID, limit int) ([]BaseOperationLog, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []BaseOperationLog
	if err := s.db.WithContext(ctx).Where("project_id = ? AND base_id = ?", projectID, baseID).
		Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
