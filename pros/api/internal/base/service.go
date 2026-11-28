package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"metamatrix/api/internal/model"
)

// Service 是 Base Engine 的应用服务：编排用例、控制事务、校验权限。
type Service struct {
	db       *gorm.DB
	registry *Registry
	events   *EventHub
	// bundleSecret 是配置包签名密钥（由 JWT_SECRET 派生注入）。
	bundleSecret string
	// outboxMu / outboxAt 是本实例的事件读取水位（多实例各自读全量、推给各自的订阅者）。
	outboxMu sync.Mutex
	outboxAt outboxCursor
	// maintenanceMu / maintenance 是后台维护任务（归档、死信治理、清理）的参数。
	maintenanceMu sync.Mutex
	maintenance   MaintenanceConfig
}

// baseBatchChunk 是批量写入时「一个事务写多少行」。
//
// 取 50 是权衡结果：事务太大 → 行锁长期持有，多个并发批次互相等锁，
// 整批写入会直接卡死；事务太小 → 往返数又跟行数成正比。
// 50 行一批在压测里既能压住往返数，又能让事务在几十毫秒内提交。
const baseBatchChunk = 50

// NewService 构造 Base Engine 服务。
func NewService(db *gorm.DB) *Service {
	return &Service{
		db:          db,
		registry:    NewRegistry(),
		events:      NewEventHub(),
		maintenance: DefaultMaintenanceConfig(),
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
	// ErrFieldTypeIncompatible：字段类型迁移不兼容（§10.1 → 42202）。
	ErrFieldTypeIncompatible = errors.New("field type incompatible")
	// ErrFormulaParse：公式解析失败（§10.1 → 42203）。
	ErrFormulaParse = errors.New("formula parse error")
	// ErrRateLimited：请求过于频繁（§10.1 → 42901）。
	ErrRateLimited = errors.New("too many requests")
)

// 权限角色：沿用知识库空间角色。
const (
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// spaceRole 返回用户在空间内的角色。
func (s *Service) spaceRole(userID, projectID uuid.UUID) string {
	role, _ := s.spaceRoleWithError(userID, projectID)
	return role
}

// spaceRoleWithError 取用户在空间中的角色。
//
// 关键点：**数据库瞬时错误不能被当成「不是成员」**。
// 旧实现把查询错误一律吞掉并返回空角色，导致高并发下（连接池忙、上下文超时）
// 权限校验直接返回 `base not found`（404），把「数据库抖动」伪装成「资源不存在」。
// 现在把错误原样向上抛，调用方按 500 处理；真正的「查不到成员」才返回空角色。
func (s *Service) spaceRoleWithError(userID, projectID uuid.UUID) (string, error) {
	var count int64
	if err := s.db.Model(&struct {
		ID uuid.UUID `gorm:"type:uuid;primaryKey"`
	}{}).Table("core_projects").Where("id = ? AND owner_user_id = ?", projectID, userID).Count(&count).Error; err == nil && count > 0 {
		return RoleAdmin, nil
	} else if err != nil {
		return "", err
	}
	var role string
	err := s.db.Table("kb_members").Select("role").Where("project_id = ? AND user_id = ?", projectID, userID).Limit(1).Scan(&role).Error
	if err != nil {
		return "", err
	}
	if role != "" {
		return role, nil
	}
	return "", nil
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
	role, err := s.spaceRoleWithError(userID, projectID)
	if err != nil {
		// 数据库错误 ≠ 无权限：原样返回，避免把 500 误报成 404。
		return fmt.Errorf("resolve space role: %w", err)
	}
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
		TenantID:  projectID,
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
	_, _ = s.CreateView(ctx, userID, projectID, table.ID, "表格视图", "grid", map[string]any{}, ViewScopeShared)
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

// BaseUpdateInput 是 Base 元信息更新入参（指针区分「没传」与「置空」）。
type BaseUpdateInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Icon        *string `json:"icon"`
}

// CreateBase 创建一个不依赖知识库节点的独立 Base。
//
// 与 EnsureBase 的区别：EnsureBase 是「按 nodeId 幂等取或建」，
// 这里则是显式创建一个新的 Base（可后续再挂到知识库节点上）。
func (s *Service) CreateBase(ctx context.Context, userID, projectID uuid.UUID, in BaseUpdateInput) (*BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(derefStr(in.Name))
	if name == "" {
		name = "多维表格"
	}
	if len(name) > 120 {
		name = name[:120]
	}
	app := BaseApp{
		ID:          uuid.New(),
		TenantID:    projectID,
		ProjectID:   projectID,
		Name:        name,
		Description: strings.TrimSpace(derefStr(in.Description)),
		Icon:        strings.TrimSpace(derefStr(in.Icon)),
		OwnerID:     userID,
		Status:      1,
	}
	if err := s.db.WithContext(ctx).Create(&app).Error; err != nil {
		return nil, err
	}
	s.seedDefaultTable(ctx, userID, projectID, app.ID)
	// 播种默认表是一次结构变更（会推进 Base 的 schemaVersion），
	// 这里重新读一次，保证返回给调用方的结构版本与库里一致。
	if err := s.db.WithContext(ctx).Where("id = ?", app.ID).First(&app).Error; err != nil {
		return nil, err
	}
	return baseInfoOf(&app), nil
}

// UpdateBase 更新 Base 的名称 / 描述 / 图标。
//
// 只改元信息，不动结构（表 / 字段），因此**不推进 schemaVersion**：
// 结构版本只应被结构变更推进。
func (s *Service) UpdateBase(ctx context.Context, userID, projectID, baseID uuid.UUID, in BaseUpdateInput) (*BaseInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var app BaseApp
	if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", baseID, projectID).First(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBaseNotFound
		}
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: base name is required", ErrFieldValueInvalid)
		}
		if len(name) > 120 {
			name = name[:120]
		}
		app.Name = name
	}
	if in.Description != nil {
		app.Description = strings.TrimSpace(*in.Description)
	}
	if in.Icon != nil {
		app.Icon = strings.TrimSpace(*in.Icon)
	}
	if err := s.db.WithContext(ctx).Model(&BaseApp{}).Where("id = ?", app.ID).
		Updates(map[string]any{"name": app.Name, "description": app.Description, "icon": app.Icon}).Error; err != nil {
		return nil, err
	}
	return baseInfoOf(&app), nil
}

// DeleteBase 删除 Base（软删）。
//
// 权限要求：空间管理员（editor 不能删整库）。
// 级联：Base 下的表 / 字段 / 记录 / 视图一并软删，避免留下孤儿数据。
func (s *Service) DeleteBase(ctx context.Context, userID, projectID, baseID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleAdmin); err != nil {
		return err
	}
	var app BaseApp
	if err := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", baseID, projectID).First(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrBaseNotFound
		}
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tableIDs []uuid.UUID
		if err := tx.Model(&BaseTable{}).Where("base_id = ?", baseID).Pluck("id", &tableIDs).Error; err != nil {
			return err
		}
		if len(tableIDs) > 0 {
			if err := tx.Where("table_id IN ?", tableIDs).Delete(&BaseField{}).Error; err != nil {
				return err
			}
			if err := tx.Where("table_id IN ?", tableIDs).Delete(&BaseView{}).Error; err != nil {
				return err
			}
			if err := tx.Where("table_id IN ?", tableIDs).Delete(&BaseRecordValue{}).Error; err != nil {
				return err
			}
			if err := tx.Where("table_id IN ?", tableIDs).Delete(&BaseRecord{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("base_id = ?", baseID).Delete(&BaseTable{}).Error; err != nil {
			return err
		}
		return tx.Delete(&BaseApp{}, "id = ?", baseID).Error
	})
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
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
		TenantID:    projectID,
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
			TenantID:  projectID,
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
	if err := tx.Model(&BaseTable{}).Where("id = ?", tableID).
		UpdateColumn("schema_version", gorm.Expr("schema_version + 1")).Error; err != nil {
		return err
	}
	// 表结构变了 → 广播 schema.changed（技术文档 §8.2 事件清单）。
	// 订阅端据此重新拉字段元信息；不带这条事件时，客户端会继续用旧 schema 渲染。
	return s.emitSchemaChanged(tx, tableID)
}

// emitSchemaChanged 在事务内写一条 schema.changed 事件。
func (s *Service) emitSchemaChanged(tx *gorm.DB, tableID uuid.UUID) error {
	var table BaseTable
	if err := tx.Select("id, base_id").Where("id = ?", tableID).First(&table).Error; err != nil {
		// 表刚被删掉（软删）时拿不到 base_id —— 结构变更事件可以省略。
		return nil
	}
	var app BaseApp
	if err := tx.Select("id, project_id").Where("id = ?", table.BaseID).First(&app).Error; err != nil {
		return nil
	}
	// Base 级结构版本同步推进：文档 §4 要求「字段 / 表变更会推进 Base 的结构版本」。
	// 之前只推进了表级版本，导致 Base.schemaVersion 永远停在 1，
	// 客户端拿它判断「结构有没有变」时形同虚设。
	if err := tx.Model(&BaseApp{}).Where("id = ?", table.BaseID).
		UpdateColumn("schema_version", gorm.Expr("schema_version + 1")).Error; err != nil {
		return err
	}
	return s.writeEventOptional(tx, app.ProjectID, table.BaseID, &table.ID, nil, "table", "schema.changed", map[string]any{
		"tableId": table.ID.String(),
		"baseId":  table.BaseID.String(),
	})
}

// emitFieldEvent 广播字段级事件（field.created / field.updated / field.deleted）。
func (s *Service) emitFieldEvent(tx *gorm.DB, projectID, tableID, fieldID uuid.UUID, eventType string, payload map[string]any) error {
	var table BaseTable
	if err := tx.Select("id, base_id").Where("id = ?", tableID).First(&table).Error; err != nil {
		return nil
	}
	return s.writeEventOptional(tx, projectID, table.BaseID, &table.ID, &fieldID, "field", eventType, payload)
}

// emitViewEvent 广播视图事件（view.updated）。
func (s *Service) emitViewEvent(tx *gorm.DB, projectID, tableID, viewID uuid.UUID, eventType string, payload map[string]any) error {
	var table BaseTable
	if err := tx.Select("id, base_id").Where("id = ?", tableID).First(&table).Error; err != nil {
		return nil
	}
	return s.writeEventOptional(tx, projectID, table.BaseID, &table.ID, &viewID, "view", eventType, payload)
}

// emitRecordEvent 广播记录级事件（record.batch_updated 等）。
func (s *Service) emitRecordEvent(tx *gorm.DB, projectID, baseID, tableID, recordID uuid.UUID, eventType string, payload map[string]any) error {
	return s.writeEventOptional(tx, projectID, baseID, &tableID, &recordID, "record", eventType, payload)
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
	// 字段级权限：对当前角色隐藏的字段不返回（连元信息都不给）。
	return s.viewerFields(ctx, userID, projectID, tableID)
}

// loadFieldIndex 加载表字段元信息与处理器。
func (s *Service) loadFieldIndex(ctx context.Context, tableID uuid.UUID) (*fieldIndex, error) {
	var rows []BaseField
	// sort_order 相同的字段（历史数据）必须有稳定的次序，
	// 否则每次刷新列顺序都可能变（PostgreSQL 不保证同值行的相对顺序）。
	if err := s.db.WithContext(ctx).Where("table_id = ? AND status = 1", tableID).Order("sort_order ASC, created_at ASC, id ASC").Find(&rows).Error; err != nil {
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
	// 字段级权限策略以 base_field_policies 表为准（config 里那份是双写副本）。
	s.overlayFieldPolicies(ctx, tableID, idx)
	return idx, nil
}

// overlayFieldPolicies 把独立表里的字段策略覆盖到字段元信息上。
//
// 双写期内表为准、config 为副本；表里没有记录时沿用 config（历史数据兜底）。
func (s *Service) overlayFieldPolicies(ctx context.Context, tableID uuid.UUID, idx *fieldIndex) {
	if idx == nil || len(idx.byID) == 0 {
		return
	}
	var rows []BaseFieldPolicy
	if err := s.db.WithContext(ctx).Where("table_id = ?", tableID).Find(&rows).Error; err != nil {
		// 表还不存在（老库未迁移）时静默降级到 config 里的策略。
		return
	}
	for _, row := range rows {
		fieldID, err := uuid.Parse(row.FieldID.String())
		if err != nil {
			continue
		}
		meta, ok := idx.byID[fieldID]
		if !ok {
			continue
		}
		policy := map[string]any{}
		if len(row.Policy) > 0 {
			_ = json.Unmarshal(row.Policy, &policy)
		}
		if meta.Config == nil {
			meta.Config = map[string]any{}
		}
		meta.Config["permissions"] = policy
		idx.byID[fieldID] = meta
	}
}

// syncFieldPolicy 双写字段策略到独立表（与 base_fields.config.permissions 保持一致）。
func (s *Service) syncFieldPolicy(ctx context.Context, tx *gorm.DB, projectID, tableID, fieldID uuid.UUID, cfg map[string]any) {
	if tx == nil {
		tx = s.db
	}
	// 独立策略表可能还没迁移（老库 / 精简影子库）。
	// **必须先判断表是否存在再执行语句**：Postgres 里一条失败语句会让整个
	// 事务进入 aborted 状态，之后所有语句都会失败 —— 「吞掉错误」是拦不住的。
	if !tx.Migrator().HasTable(&BaseFieldPolicy{}) {
		return
	}
	raw, ok := cfg["permissions"]
	if !ok {
		// 没有策略 → 删除独立表记录。
		_ = tx.WithContext(ctx).Where("field_id = ?", fieldID).Delete(&BaseFieldPolicy{}).Error
		return
	}
	policy, err := json.Marshal(raw)
	if err != nil {
		return
	}
	now := time.Now()
	var existing BaseFieldPolicy
	err = tx.WithContext(ctx).Where("field_id = ?", fieldID).First(&existing).Error
	if err == nil {
		_ = tx.WithContext(ctx).Model(&BaseFieldPolicy{}).Where("id = ?", existing.ID).
			Updates(map[string]any{"policy": policy, "updated_at": now}).Error
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return
	}
	_ = tx.WithContext(ctx).Create(&BaseFieldPolicy{
		ID:        uuid.New(),
		TenantID:  projectID,
		ProjectID: projectID,
		TableID:   tableID,
		FieldID:   fieldID,
		Policy:    policy,
		CreatedAt: now,
		UpdatedAt: now,
	}).Error
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
	// 租户边界校验：表 → Base → 空间。
	//
	// assertAccess 只证明「这个用户是 projectID 的成员」，
	// 并不能证明「这张表属于 projectID」。没有这一步的话，
	// 只要猜到别的空间的 tableId 就能读到它的字段与数据 —— 跨空间越权。
	if err := s.assertBaseInProject(ctx, projectID, table.BaseID); err != nil {
		return nil, nil, err
	}
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, nil, err
	}
	return &table, idx, nil
}

// assertBaseInProject 校验 Base 属于指定空间。
//
// 口径：Base 记录存在但属于别的空间 → 拒绝（跨空间越权）；
// Base 记录完全不存在（孤儿表 / 影子库）→ 放行，不阻断业务。
func (s *Service) assertBaseInProject(ctx context.Context, projectID, baseID uuid.UUID) error {
	if baseID == uuid.Nil {
		return ErrBaseNotFound
	}
	var app BaseApp
	if err := s.db.WithContext(ctx).
		Select("id, project_id").
		Where("id = ? AND deleted_at IS NULL", baseID).
		First(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Base 不存在 → 孤儿表，放行（不因为数据不完整就拒绝正常操作）。
			return nil
		}
		// 影子库（精简测试库）没有 base_apps 表 → 无法验证归属，放行。
		if isMissingTable(err) {
			return nil
		}
		return err
	}
	if app.ProjectID != projectID {
		// Base 属于别的空间 → 跨空间越权，按「不存在」处理。
		return ErrBaseNotFound
	}
	return nil
}

// isMissingTable 判断错误是否是「表不存在」。
func isMissingTable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "no such table") ||
		strings.Contains(msg, "doesn't exist") ||
		strings.Contains(msg, "does not exist")
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
		return nil, fmt.Errorf("%w: %s", ErrFieldTypeIncompatible, err.Error())
	}
	handler, _ := s.registry.Get(FieldType(in.Type))
	cfg := in.Config
	if cfg == nil {
		cfg = map[string]any{}
	}
	if err := handler.ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrFieldTypeIncompatible, err.Error())
	}
	rawCfg, _ := json.Marshal(cfg)
	field := BaseField{
		ID:        uuid.New(),
		TenantID:  projectID,
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
		// 字段策略双写：config.permissions → base_field_policies。
		s.syncFieldPolicy(ctx, tx, projectID, tableID, field.ID, cfg)
		if err := s.bumpSchema(tx, tableID); err != nil {
			return err
		}
		return s.emitFieldEvent(tx, projectID, tableID, field.ID, "field.created", map[string]any{
			"fieldId": field.ID.String(),
			"name":    field.Name,
			"type":    field.Type,
		})
	})
	if err != nil {
		return nil, err
	}
	// 新字段可能是可筛选类型（长文本 / 关联记录 / 关联文档），
	// 存量记录里的同名字段值需要补投影，否则筛选会「命中为空」。
	if err := s.reindexTable(ctx, tableID, projectID); err != nil {
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
		"version": gorm.Expr("version + 1"),
	}
	cfg := map[string]any{}
	if len(field.Config) > 0 {
		_ = json.Unmarshal(field.Config, &cfg)
	}
	if in.Name != nil {
		// 字段名不能为空：空名会让表头「没有标题」（只剩一个类型图标），
		// 而且用户在字段管理器里误清空输入框就会永久留下一个无名列。
		trimmed := strings.TrimSpace(*in.Name)
		if trimmed == "" {
			return nil, fmt.Errorf("%w: field name is required", ErrFieldValueInvalid)
		}
		updates["name"] = trimmed
	}
	if in.Config != nil {
		// 字段级权限策略（config.permissions）独立于类型配置：
		// 改类型配置（选项 / 精度 / 上限…）时不能把策略冲掉，这里单独保留并合入。
		if perm, ok := cfg["permissions"]; ok {
			if _, provided := in.Config["permissions"]; !provided {
				merged := make(map[string]any, len(in.Config)+1)
				for k, v := range in.Config {
					merged[k] = v
				}
				merged["permissions"] = perm
				in.Config = merged
			}
		}
		// 显式提交了 permissions 但内容为空 → 视为「清除权限策略」。
		// 前端要能取消权限，就必须有一条明确的「清空」通道：
		// 靠「不传 permissions」来表达清除是行不通的（那会被当成「没改」）。
		if perm, provided := in.Config["permissions"]; provided {
			if isEmptyPermissions(perm) {
				delete(in.Config, "permissions")
			}
		}
		handler, _ := s.registry.Get(FieldType(field.Type))
		if err := handler.ValidateConfig(in.Config); err != nil {
			return nil, fmt.Errorf("%w: %s", ErrFieldTypeIncompatible, err.Error())
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
	// 字段策略双写：独立表始终与 config.permissions 保持一致。
	s.syncFieldPolicy(ctx, s.db, projectID, field.TableID, field.ID, cfg)
	name := field.Name
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
	}
	// 字段元信息变了 → 广播 field.updated（技术文档 §8.2）。
	_ = s.emitFieldEvent(s.db.WithContext(ctx), projectID, field.TableID, field.ID, "field.updated", map[string]any{
		"fieldId": field.ID.String(),
		"name":    name,
	})

	required := field.Required
	if in.Required != nil {
		required = *in.Required
	}
	sortOrder := field.SortOrder
	if in.SortOrder != nil {
		sortOrder = *in.SortOrder
	}
	meta := &FieldMeta{
		ID: field.ID.String(), Name: name, Type: field.Type, Config: cfg,
		Required: required, IsPrimary: field.IsPrimary, SortOrder: sortOrder, Version: field.Version + 1,
	}
	// 字段能力变化（例如附件从不可索引改为可索引）后，重建整表投影，
	// 否则存量记录仍然没有投影行，关键字搜索搜不到。
	if err := s.reindexTable(ctx, field.TableID, projectID); err != nil {
		return nil, err
	}
	// 权限策略变了 → 广播 permission.changed，让订阅端重新拉字段元信息与数据
	// （技术方案第 8 章：权限变更后失效订阅）。
	if in.Config != nil {
		if _, ok := in.Config["permissions"]; ok {
			var table BaseTable
			if err := s.db.WithContext(ctx).Select("id, base_id").Where("id = ?", field.TableID).First(&table).Error; err == nil {
				_ = s.writeEventTyped(s.db, projectID, table.BaseID, &field.TableID, &field.ID, "field", "permission.changed", map[string]any{
					"scope":   "field",
					"fieldId": field.ID.String(),
				})
			}
		}
	}
	return meta, nil
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
		// 字段策略独立表同步清理，避免留下指向已删字段的孤儿策略。
		// 表还不存在（老库未迁移 / 精简影子库）时忽略，不阻断删字段。
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseFieldPolicy{}).Error; err != nil &&
			!strings.Contains(err.Error(), "no such table") {
			return err
		}
		// 删掉该字段产生的历史关联（正反向都要清）。
		// 不清的话，表里最后一个 link 字段被删除后，残留的关联边
		// 仍会被「谁关联了我」反查命中。
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseRecordLink{}).Error; err != nil &&
			!strings.Contains(err.Error(), "no such table") {
			return err
		}
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseRecordReverseLink{}).Error; err != nil &&
			!strings.Contains(err.Error(), "no such table") {
			return err
		}
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseRecordValue{}).Error; err != nil {
			return err
		}
		// 公式依赖表没有 field_id 列（它是 formula_field_id / dependency_field_id），
		// 按 field_id 删会直接报「column field_id does not exist」。
		if err := tx.Where("formula_field_id = ? OR dependency_field_id = ?", fieldID, fieldID).
			Delete(&BaseFormulaDependency{}).Error; err != nil {
			return err
		}
		// 公式定义本身也要清掉，否则留下指向已删字段的孤儿公式。
		if err := tx.Where("field_id = ?", fieldID).Delete(&BaseFieldFormula{}).Error; err != nil {
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
			// 同上：删字段属于结构变更，不应改写记录的「最后更新时间」。
			if err := tx.Model(&BaseRecord{}).Where("id = ?", rec.ID).UpdateColumn("data", raw).Error; err != nil {
				return err
			}
		}
		if err := s.bumpSchema(tx, field.TableID); err != nil {
			return err
		}
		return s.emitFieldEvent(tx, projectID, field.TableID, field.ID, "field.deleted", map[string]any{
			"fieldId": field.ID.String(),
			"name":    field.Name,
		})
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
		// 系统字段按记录自身的创建 / 更新信息回填。
		applySystemFields(idx, data, rec.CreatedAt, rec.UpdatedAt, rec.CreatedBy, rec.UpdatedBy)
		computed, err := s.recomputeFormulas(s.db.WithContext(ctx), &table, idx, data)
		if err != nil {
			// 循环依赖等问题不影响其它记录的回填。
			continue
		}
		raw, _ := json.Marshal(computed)
		// UpdateColumns 而非 Updates：跳过 GORM 的 updated_at 自动写入，
		// 否则「系统重算」会把记录的「最后更新时间」刷成重算时刻，
		// 用户看到的更新时间就不再是「最后一次被人编辑的时间」。
		if err := s.db.WithContext(ctx).Model(&BaseRecord{}).Where("id = ?", rec.ID).
			UpdateColumns(map[string]any{"data": raw, "version": gorm.Expr("version + 1")}).Error; err != nil {
			return err
		}
		if err := s.syncAllProjections(s.db.WithContext(ctx), tableID, rec.ID, table.TenantID, computed); err != nil {
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
		return nil, fmt.Errorf("%w: %s", ErrFieldTypeIncompatible, err.Error())
	}
	// 系统字段（创建人 / 创建时间 …）的值由服务端维护，
	// 不允许把普通字段迁成系统字段，也不允许把系统字段迁成普通字段
	// （否则存量值与自动维护的值会互相打架）。
	if IsSystemField(FieldType(newType)) || IsSystemField(FieldType(field.Type)) {
		return nil, fmt.Errorf("%w: 系统字段不支持类型迁移", ErrFieldTypeIncompatible)
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
			return nil, fmt.Errorf("%w: 存量数据无法迁移到 %s：%v", ErrFieldTypeIncompatible, newType, err)
		}
		if err := newHandler.ValidateValue(value, nil); err != nil {
			return nil, fmt.Errorf("%w: 存量数据无法迁移到 %s：%v", ErrFieldTypeIncompatible, newType, err)
		}
		plans = append(plans, plan{record: rec, data: data, value: value})
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, p := range plans {
			p.data[fieldID.String()] = p.value
			raw, _ := json.Marshal(p.data)
			// 类型迁移同样不改写「最后更新时间」。
			if err := tx.Model(&BaseRecord{}).Where("id = ?", p.record.ID).UpdateColumn("data", raw).Error; err != nil {
				return err
			}
			if err := s.syncProjection(tx, field.TableID, p.record.ID, fieldID, projectID, p.value); err != nil {
				return err
			}
		}
		if err := tx.Model(&field).Updates(map[string]any{
			"type":    newType,
			"version": gorm.Expr("version + 1"),
		}).Error; err != nil {
			return err
		}
		if err := s.bumpSchema(tx, field.TableID); err != nil {
			return err
		}
		// 类型迁移是结构变更 → 广播 field.updated + schema.changed。
		if err := s.emitFieldEvent(tx, projectID, field.TableID, fieldID, "field.updated", map[string]any{
			"fieldId": fieldID.String(),
			"type":    newType,
			"migrate": true,
		}); err != nil {
			return err
		}
		// 投影重建与数据迁移必须同事务：否则迁移失败回滚后，
		// 数据是旧类型、投影却是新类型，两边对不上。
		if err := s.reindexTableTx(tx, field.TableID, projectID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
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
	// Visibility 是记录级可见范围（space / restricted / custom）；nil 表示不改。
	Visibility *string `json:"visibility"`
	// Grants 是「指定成员可见」时的授权成员 ID 列表；nil 表示不改，
	// 空数组表示清空授权名单（此时除创建者与管理者外谁都看不到）。
	Grants *[]string `json:"grants"`
	// GrantSubjects 是更完整的授权名单（支持部门 + 有效期）。
	// 与 Grants 二选一：传了 GrantSubjects 就以它为准。
	GrantSubjects *[]GrantSubject `json:"grantSubjects"`
}

// CreateRecord 新建记录。
func (s *Service) CreateRecord(ctx context.Context, userID, projectID, tableID uuid.UUID, in RecordInput) (*RecordRow, error) {
	started := time.Now()
	row, err := s.createRecord(ctx, userID, projectID, tableID, in)
	ObserveOperation(OpCreateRecord, time.Since(started), err)
	return row, err
}

// createRecord 是 CreateRecord 的真实实现（耗时统计包在 CreateRecord 里）。
// writeIO 是一次写入里「所有行共享」的上下文。
//
// 解决两个问题：
//  1. 表结构 / 字段元数据 / 权限身份 / 排序位基线都提到循环外 ——
//     批量写入不再逐行重查（500 行就是几千次重复往返）。
//  2. 「公式表 / 关系表是否存在」的探测也只做一次 —— 事务里每行查一次
//     information_schema，500 行就是 1000 次无谓往返。
type writeIO struct {
	table      *BaseTable
	idx        *fieldIndex
	projFields []BaseField
	subj       policySubject

	tablesProbed bool
	hasFormulas  bool
	hasLinks     bool

	// formulas 是本表的公式定义（一次写入只查一次）。
	//
	// 旧实现每写一行都要 `SELECT ... WHERE field_id IN (本表字段)`，
	// 500 行就是 500 次重复查询；公式定义在一次写入期间不会变，缓存即可。
	formulasLoaded bool
	formulas       map[string]BaseFieldFormula

	// pendingAudits / pendingEvents 是「攒一批再落库」的审计与事件。
	//
	// 每行单独 INSERT 审计 + 发件箱，批量写入时往返数被放大 N 倍；
	// 改成事务收尾时批量插入，往返数与行数脱钩。
	pendingAudits []BaseOperationLog
	pendingEvents []BaseEventOutbox
}

// tableFormulas 载入本表公式（一次写入只载一次）。
func (io *writeIO) tableFormulas(tx *gorm.DB) map[string]BaseFieldFormula {
	if io.formulasLoaded {
		return io.formulas
	}
	io.formulasLoaded = true
	io.formulas = loadTableFormulas(tx, io.idx, io.hasFormulas)
	return io.formulas
}

// flushPending 把累积的审计与事件批量落库（与业务数据同事务）。
func (io *writeIO) flushPending(tx *gorm.DB) error {
	if len(io.pendingAudits) > 0 {
		if err := tx.CreateInBatches(&io.pendingAudits, 200).Error; err != nil {
			return err
		}
		io.pendingAudits = io.pendingAudits[:0]
	}
	if len(io.pendingEvents) > 0 {
		if err := tx.CreateInBatches(&io.pendingEvents, 200).Error; err != nil {
			return err
		}
		io.pendingEvents = io.pendingEvents[:0]
	}
	return nil
}

// truncatePending 丢弃已被回滚的行产生的审计与事件。
//
// 批量写入里单行失败会 ROLLBACK TO SAVEPOINT，那一行的审计 / 事件
// 也不能留下 —— 否则会出现「记录没写成、审计却写了」的假象。
func (io *writeIO) truncatePending(audits, events int) {
	if audits <= len(io.pendingAudits) {
		io.pendingAudits = io.pendingAudits[:audits]
	}
	if events <= len(io.pendingEvents) {
		io.pendingEvents = io.pendingEvents[:events]
	}
}

// newWriteIO 组装一次写入的共享上下文。
//
// **必须在开启事务之前调用**：权限身份（subjectOf）与字段元数据的读取
// 都要走独立连接；如果放在事务开启之后做，就会出现
// 「事务占着 1 条连接 + 查询再要 1 条」，并发一上来就把连接池打满，
// 所有请求互相等待 —— 压测里表现为整批写入卡死、库里一排 idle in transaction。
func (s *Service) newWriteIO(ctx context.Context, userID, projectID, tableID uuid.UUID) (*writeIO, error) {
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	projFields, err := s.loadProjectionFields(ctx, tableID)
	if err != nil {
		return nil, err
	}
	return &writeIO{
		table:      table,
		idx:        idx,
		projFields: projFields,
		subj:       s.subjectOf(userID, projectID),
	}, nil
}

// probeTables 探测「公式表 / 关系表是否存在」，一次写入只探一次。
func (io *writeIO) probeTables(tx *gorm.DB) {
	if io.tablesProbed {
		return
	}
	io.tablesProbed = true
	io.hasFormulas = tx.Migrator().HasTable(&BaseFieldFormula{})
	io.hasLinks = tx.Migrator().HasTable(&BaseRecordLink{})
}

// allocSortBase 取表内当前最大排序位（-1 表示空表）。
//
// 在事务内取，保证同一批里的排序位连续，且不会与已提交的行撞号。
func allocSortBase(tx *gorm.DB, tableID uuid.UUID) (int64, error) {
	var max int64
	if err := tx.Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", tableID).
		Select("COALESCE(MAX(sort_order), -1)").Scan(&max).Error; err != nil {
		return 0, err
	}
	return max, nil
}

// createRecord 创建单条记录。
func (s *Service) createRecord(ctx context.Context, userID, projectID, tableID uuid.UUID, in RecordInput) (*RecordRow, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	io, err := s.newWriteIO(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	// 校验放在事务外（校验要查库，走独立连接）。
	prepared, err := s.prepareRecord(ctx, userID, projectID, io.table, io.idx, in, io.subj)
	if err != nil {
		return nil, err
	}
	// sortBase 传 -1：在事务内按当前表末尾分配排序位。
	return s.persistRecord(ctx, userID, projectID, io, -1, prepared, nil)
}

// preparedRecord 是「校验通过、可以落库」的记录内容。
type preparedRecord struct {
	normalized map[string]any
	visibility string
}

// prepareRecord 做写入前的归一化与校验（不碰事务）。
//
// 为什么要拆出来：**校验要查库（文档引用 / 关联记录是否有效）**，
// 如果放在事务内做，这些查询会走另一条连接；批量写入并发时
// 「事务占一条 + 校验再要一条」会把连接池打满，形成互相等待的死锁。
// 所以校验一律在事务开启之前完成。
func (s *Service) prepareRecord(
	ctx context.Context,
	userID, projectID uuid.UUID,
	table *BaseTable,
	idx *fieldIndex,
	in RecordInput,
	subject policySubject,
) (*preparedRecord, error) {
	normalized, err := s.normalizeValues(idx, in.Fields)
	if err != nil {
		return nil, err
	}
	if err := s.validateDocRefs(ctx, projectID, idx, normalized); err != nil {
		return nil, err
	}
	if err := s.validateLinkRefs(ctx, table.BaseID, projectID, userID, idx, normalized); err != nil {
		return nil, err
	}
	// 条件可见字段：新记录自身也要满足条件才能写入（合并后的值 = 本次提交）。
	if err := s.assertWritableFields(idx, subject, normalized, normalized); err != nil {
		return nil, err
	}
	// 新记录默认「空间可见」；创建者即受限记录的唯一可见者。
	visibility := RecordVisibilitySpace
	if in.Visibility != nil {
		v, verr := NormalizeRecordVisibility(*in.Visibility)
		if verr != nil {
			return nil, verr
		}
		visibility = v
	}
	return &preparedRecord{normalized: normalized, visibility: visibility}, nil
}

// persistRecord 把已校验的记录写进库（事务内）。
//
// outerTx 非空时复用外部事务（批量写入用）。
// sortBase < 0 表示「在事务内按当前表末尾分配排序位」。
//
// 事务内**只允许出现纯写入语句**：任何走 s.db 的查询都会再要一条连接，
// 与「事务已经占住一条」叠加后，连接池一满就整体死锁。
func (s *Service) persistRecord(
	ctx context.Context,
	userID, projectID uuid.UUID,
	io *writeIO,
	sortBase int64,
	prepared *preparedRecord,
	outerTx *gorm.DB,
) (*RecordRow, error) {
	normalized := prepared.normalized
	rec := BaseRecord{
		ID:         uuid.New(),
		TenantID:   projectID,
		TableID:    io.table.ID,
		Version:    1,
		Visibility: prepared.visibility,
		CreatedBy:  userID,
		UpdatedBy:  userID,
	}
	now := time.Now()
	rec.CreatedAt = now
	rec.UpdatedAt = now
	write := func(tx *gorm.DB) error {
		io.probeTables(tx)
		if sortBase < 0 {
			base, err := allocSortBase(tx, io.table.ID)
			if err != nil {
				return err
			}
			sortBase = base
		}
		rec.SortOrder = sortBase + 1
		// 系统字段（创建时间 / 创建人 …）先落库，公式才能引用它们。
		applySystemFields(io.idx, normalized, now, now, userID, userID)
		computed, err := s.applyFormulas(io.table, io.idx, normalized, io.tableFormulas(tx))
		if err != nil {
			return err
		}
		normalized = computed
		raw, _ := json.Marshal(normalized)
		rec.Data = raw
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		if err := s.syncProjectionsWithFields(tx, io.table.ID, rec.ID, projectID, normalized, io.projFields); err != nil {
			return err
		}
		if err := s.syncRecordLinksWith(tx, io.table, io.idx, rec.ID, normalized, io.hasLinks); err != nil {
			return err
		}
		// 审计与事件先入缓冲，事务收尾时批量落库（往返数与行数脱钩）。
		io.pendingAudits = append(io.pendingAudits, newAuditRow(
			projectID, io.table.BaseID, &io.table.ID, &rec.ID, userID, "record.created", nil, normalized, ""))
		// 事件只广播「哪些字段变了」，不广播值：
		// SSE 订阅不区分角色，带值会绕过字段级权限（隐藏字段泄露）。
		io.pendingEvents = append(io.pendingEvents, newEventRow(
			projectID, io.table.BaseID, &io.table.ID, &rec.ID, "record", "record.created", map[string]any{
				"version":  rec.Version,
				"fieldIds": fieldIDsOf(normalized),
			}))
		return nil
	}
	if outerTx != nil {
		// 外部事务：审计 / 事件由调用方在事务收尾时批量落库。
		if err := write(outerTx.WithContext(ctx)); err != nil {
			return nil, err
		}
	} else if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := write(tx); err != nil {
			return err
		}
		return io.flushPending(tx)
	}); err != nil {
		return nil, err
	}
	stripped, condHidden := stripHiddenFieldsWithReasons(normalized, io.idx, io.subj)
	return &RecordRow{
		ID: rec.ID, Version: rec.Version,
		Fields:            stripped,
		Updated:           rec.UpdatedAt,
		Visibility:        rec.Visibility,
		CreatedBy:         rec.CreatedBy.String(),
		ConditionalHidden: condHidden,
	}, nil
}

// loadProjectionFields 读取表内参与查询投影的字段元数据（含类型）。
func (s *Service) loadProjectionFields(ctx context.Context, tableID uuid.UUID) ([]BaseField, error) {
	var fields []BaseField
	if err := s.db.WithContext(ctx).Where("table_id = ? AND status = 1", tableID).Find(&fields).Error; err != nil {
		return nil, err
	}
	return fields, nil
}

// UpdateRecord 更新记录（乐观锁）。
func (s *Service) UpdateRecord(ctx context.Context, userID, projectID, recordID uuid.UUID, in RecordInput) (*RecordRow, error) {
	started := time.Now()
	row, err := s.updateRecord(ctx, userID, projectID, recordID, in)
	ObserveOperation(OpUpdateRecord, time.Since(started), err)
	return row, err
}

// updateRecord 是 UpdateRecord 的真实实现（耗时统计包在 UpdateRecord 里）。
func (s *Service) updateRecord(ctx context.Context, userID, projectID, recordID uuid.UUID, in RecordInput) (*RecordRow, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	// 权限身份只解析一次。
	//
	// 旧实现每次更新要查 4~5 次角色（assertWritableFields / 可见范围 /
	// 授权名单 / 收尾的字段裁剪），每次都是 1~2 条 SQL；
	// 批量更新 100 行就是几百次重复往返，P95 直接被拖到秒级。
	subj := s.subjectOf(userID, projectID)
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
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
	if err := s.validateLinkRefs(ctx, table.BaseID, projectID, userID, idx, patch); err != nil {
		return nil, err
	}
	// 条件可见字段：按「旧值 + 本次提交」合并后的记录判断可见性。
	merged := make(map[string]any, len(data)+len(patch))
	for k, v := range data {
		merged[k] = v
	}
	for k, v := range patch {
		merged[k] = v
	}
	if err := s.assertWritableFields(idx, subj, patch, merged); err != nil {
		return nil, err
	}
	for k, v := range patch {
		data[k] = v
	}
	// 记录级可见范围变更：只有空间管理者可以改（否则谁都能把自己记录藏起来，
	// 也无法把别人的受限记录放出来）。
	var newVisibility string
	if in.Visibility != nil {
		v, err := NormalizeRecordVisibility(*in.Visibility)
		if err != nil {
			return nil, err
		}
		if v != rec.Visibility {
			if roleRank(subj.role) < roleRank(RoleAdmin) {
				return nil, fmt.Errorf("%w: 只有空间管理者可以修改记录可见范围", ErrForbidden)
			}
			newVisibility = v
		}
	}
	// 授权名单（指定成员可见）：同样只有管理者能改。
	// GrantSubjects（用户 / 部门 + 有效期）优先；否则回落到旧的 grants（用户 ID 列表）。
	grantSubjects, err := s.resolveGrantSubjects(ctx, projectID, &in)
	if err != nil {
		return nil, err
	}
	if grantSubjects != nil && roleRank(subj.role) < roleRank(RoleAdmin) {
		return nil, fmt.Errorf("%w: 只有空间管理者可以修改记录可见成员", ErrForbidden)
	}
	if grantSubjects != nil && len(*grantSubjects) > 0 {
		// 只能授权给「空间内的人 / 空间内存在的部门」：
		// 给外人或不存在���部门授权属于看起来生效、实际无效的假权限。
		members, err := s.spaceMemberIDs(ctx, projectID)
		if err != nil {
			return nil, err
		}
		departments, err := s.spaceMemberDepartments(ctx, projectID)
		if err != nil {
			return nil, err
		}
		for _, subject := range *grantSubjects {
			switch subject.Type {
			case GrantSubjectDepartment:
				if !departments[subject.ID] {
					return nil, fmt.Errorf("%w: 部门不在空间成员中: %s", ErrFieldValueInvalid, subject.ID)
				}
			default:
				uid, parseErr := uuid.Parse(subject.ID)
				if parseErr != nil || !members[uid] {
					return nil, fmt.Errorf("%w: 可见成员必须是空间成员", ErrFieldValueInvalid)
				}
			}
		}
	}
	if newVisibility != "" && newVisibility != RecordVisibilityCustom && grantSubjects != nil && len(*grantSubjects) > 0 {
		return nil, fmt.Errorf("%w: 只有「指定成员可见」才能配置可见成员", ErrFieldValueInvalid)
	}
	// 冲突策略（对标飞书 / Airtable 的字段级合并）：
	//   - 客户端显式带 expectedVersion → 严格乐观锁，版本过期直接报冲突，不重试。
	//   - 客户端没带 expectedVersion → 有限重试：重新锁行取最新值，把本次提交的
	//     字段合并上去再写。这样两个人同时改**同一记录的不同字段**时不会互相打断，
	//     只有真正改到同一字段才会出现「后写覆盖先写」（与主流多维表格一致）。
	const maxConflictRetry = 3
	for attempt := 0; ; attempt++ {
		err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			// 锁行取最新记录：后写者基于最新值合并，而不是覆盖别人刚写的字段。
			var locked BaseRecord
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND deleted_at IS NULL", rec.ID).First(&locked).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrRecordNotFound
				}
				return err
			}
			if in.ExpectedVersion > 0 && locked.Version != in.ExpectedVersion {
				return fmt.Errorf("%w: 当前版本 %d，客户端版本 %d", ErrVersionConflict, locked.Version, in.ExpectedVersion)
			}
			base := map[string]any{}
			if len(locked.Data) > 0 {
				_ = json.Unmarshal(locked.Data, &base)
			}
			merged := make(map[string]any, len(base)+len(patch))
			for k, v := range base {
				merged[k] = v
			}
			for k, v := range patch {
				merged[k] = v
			}
			// 系统字段：创建信息沿用记录原值，更新信息取本次操作。
			applySystemFields(idx, merged, locked.CreatedAt, time.Now(), locked.CreatedBy, userID)
			computed, err := s.recomputeFormulas(tx, table, idx, merged)
			if err != nil {
				return err
			}
			raw, _ := json.Marshal(computed)
			updates := map[string]any{
				"data":       raw,
				"version":    gorm.Expr("version + 1"),
				"updated_by": userID,
				"updated_at": time.Now(),
			}
			if newVisibility != "" {
				updates["visibility"] = newVisibility
				// 同步回内存对象，保证响应里返回的是「改完之后」的可见范围，
				// 否则前端拿到旧值会以为没生效（记录级策略是安全边界，不能有歧义）。
				rec.Visibility = newVisibility
			}
			res := tx.Model(&BaseRecord{}).
				Where("id = ? AND version = ? AND deleted_at IS NULL", locked.ID, locked.Version).
				Updates(updates)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return fmt.Errorf("%w: 记录已被他人修改", ErrVersionConflict)
			}
			rec.Version = locked.Version + 1
			rec.Data = raw
			rec.UpdatedAt = time.Now()
			// 审计的「修改前」必须是这次写入前的真实值（合并后的基线）。
			before = base
			data = computed
			if err := s.syncAllProjections(tx, rec.TableID, rec.ID, projectID, data); err != nil {
				return err
			}
			if err := s.syncRecordLinks(tx, table, idx, rec.ID, data); err != nil {
				return err
			}
			if err := s.writeAudit(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, userID, "record.updated", before, data, ""); err != nil {
				return err
			}
			if grantSubjects != nil {
				if err := s.saveRecordGrants(ctx, tx, projectID, rec.ID, userID, *grantSubjects); err != nil {
					return err
				}
			}
			if err := s.writeEvent(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, "record.updated", map[string]any{
				"version":  rec.Version,
				"fieldIds": fieldIDsOf(patch),
			}); err != nil {
				return err
			}
			// 可见范围 / 授权名单变了 → 广播权限变更事件，让订阅端重新拉取
			// （技术方案第 8 章：权限变更后失效订阅）。
			if newVisibility != "" || grantSubjects != nil {
				if err := s.writeEvent(tx, projectID, table.BaseID, &rec.TableID, &rec.ID, "permission.changed", map[string]any{
					"scope":      "record",
					"visibility": rec.Visibility,
					"recordId":   rec.ID.String(),
				}); err != nil {
					return err
				}
			}
			return nil
		})
		if err == nil {
			break
		}
		// 冲突重试：仅在客户端没有指定 expectedVersion 时允许自动合并重试。
		if errors.Is(err, ErrVersionConflict) && in.ExpectedVersion == 0 && attempt+1 < maxConflictRetry {
			continue
		}
		return nil, err
	}
	stripped, condHidden := stripHiddenFieldsWithReasons(data, idx, subj)
	return &RecordRow{
		ID: rec.ID, Version: rec.Version,
		Fields:            stripped,
		Updated:           rec.UpdatedAt,
		Visibility:        rec.Visibility,
		CreatedBy:         rec.CreatedBy.String(),
		ConditionalHidden: condHidden,
	}, nil
}

// DeleteRecord 软删除记录。
func (s *Service) DeleteRecord(ctx context.Context, userID, projectID, recordID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
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
		// 关联关系随记录一起失效（正向）。
		if err := tx.Where("source_record_id = ?", recordID).Delete(&BaseRecordLink{}).Error; err != nil {
			return err
		}
		// 反向关系来自记录 JSONB，删除后自然查不到；这里同步清理关系表里的入边。
		if err := tx.Where("target_record_id = ?", recordID).Delete(&BaseRecordLink{}).Error; err != nil {
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

// BatchFailure 记录一条批量操作里的失败明细。
type BatchFailure struct {
	// Target 是失败对象的标识（记录 ID、导入行号等）。
	Target string `json:"target"`
	// Message 是失败原因（可直接展示给用户）。
	Message string `json:"message"`
}

// BatchCreatePartial 批量创建记录，**允许部分成功**。
//
// 与 BatchCreate 的区别：单条失败不再中断整批，而是收集到 failures 里返回，
// 便于界面给出「成功 N 条 / 失败 M 条 + 失败明细」。
func (s *Service) BatchCreatePartial(ctx context.Context, userID, projectID, tableID uuid.UUID, items []RecordInput) ([]RecordRow, []BatchFailure) {
	rows := make([]RecordRow, 0, len(items))
	failures := make([]BatchFailure, 0)
	// 表结构 / 字段元数据 / 排序位基线只在循环外取一次。
	//
	// 旧实现逐行调 CreateRecord，每行都要重查一遍表结构、字段索引、
	// 字段策略、空间角色、MAX(sort_order) —— 500 行就是几千次重复往返，
	// 「批量写入 500 行」在压测里要 18 秒。提到循环外后往返数与行数脱钩。
	io, err := s.newWriteIO(ctx, userID, projectID, tableID)
	if err != nil {
		return rows, batchAllFailed(len(items), err)
	}
	// **先校验、后开事务**。
	//
	// 校验里的「文档引用 / 关联记录是否存在」要查库，走的是独立连接。
	// 如果一边开着事务一边校验，每行都要「占着 1 条连接 + 再要 1 条连接」，
	// 50 并发时正好把 50 条的连接池打满 → 所有请求互相等待 → 整体卡死
	// （压测表现：批量写入 120 秒超时，库里 50 个事务全部 idle in transaction）。
	// 所以先把所有行的校验做完，再开事务写入。
	preparedRows := make([]*preparedRecord, len(items))
	prepareFailed := make([]bool, len(items))
	for i, item := range items {
		p, err := s.prepareRecord(ctx, userID, projectID, io.table, io.idx, item, io.subj)
		if err != nil {
			failures = append(failures, BatchFailure{Target: fmt.Sprintf("第 %d 行", i+1), Message: err.Error()})
			prepareFailed[i] = true
			continue
		}
		preparedRows[i] = p
	}
	// 分块写入：每块 baseBatchChunk 行共用一个事务，块内每行一个 SAVEPOINT。
	//
	// 为什么不是「整批一个事务」：500 行一个大事务会把 base_records 的行锁
	// 一直按住到提交，多个并发批次互相等锁，直接把写入卡死（压测里整批超时）。
	// 分块后事务足够短（几十毫秒），并发批次互不阻塞；
	// 单行失败只 ROLLBACK TO SAVEPOINT 自己的存档点，不影响同块其它行。
	for start := 0; start < len(items); start += baseBatchChunk {
		end := start + baseBatchChunk
		if end > len(items) {
			end = len(items)
		}
		rowsBefore := len(rows)
		tx := s.db.WithContext(ctx).Begin()
		if tx.Error != nil {
			failures = append(failures, batchChunkFailures(start, end, tx.Error)...)
			continue
		}
		chunkOK := true
		// 表结构探测与排序位基线都在事务内做一次（复用同一条连接）。
		io.probeTables(tx)
		sortBase, allocErr := allocSortBase(tx, tableID)
		if allocErr != nil {
			tx.Rollback()
			failures = append(failures, batchChunkFailures(start, end, allocErr)...)
			continue
		}
		for j := start; j < end; j++ {
			idxInBatch := j
			if prepareFailed[idxInBatch] {
				continue
			}
			// 存档点用原生 SQL 建立。
			//
			// 不能用 gorm 的 tx.SavePoint：它会「关闭预编译语句 + 换掉
			// Statement.ConnPool」，在 pgx 驱动下会让事务的后续语句
			// 拿不到原来的连接，表现为事务停在 outbox 写入之后不再前进。
			// 原生 SAVEPOINT / ROLLBACK TO 只发普通 SQL，不动连接池。
			sp := fmt.Sprintf("sp_%d", idxInBatch)
			if err := tx.Exec("SAVEPOINT " + sp).Error; err != nil {
				failures = append(failures, BatchFailure{Target: fmt.Sprintf("第 %d 行", idxInBatch+1), Message: err.Error()})
				chunkOK = false
				break
			}
			// 本行写入前的审计 / 事件缓冲长度：失败时据此回退。
			auditsBefore := len(io.pendingAudits)
			eventsBefore := len(io.pendingEvents)
			row, err := s.persistRecord(ctx, userID, projectID, io, sortBase, preparedRows[idxInBatch], tx)
			if err != nil {
				// 回滚到本行的存档点，事务恢复可写，后续行继续。
				_ = tx.Exec("ROLLBACK TO SAVEPOINT " + sp).Error
				// 这一行没有落库，它的审计 / 事件也不能留下。
				io.truncatePending(auditsBefore, eventsBefore)
				failures = append(failures, BatchFailure{Target: fmt.Sprintf("第 %d 行", idxInBatch+1), Message: err.Error()})
				continue
			}
			rows = append(rows, *row)
			// 下一行接在本行之后，保证同一批里的排序位不重复。
			sortBase++
		}
		if chunkOK {
			// 审计与事件批量落库（与记录同事务）。
			if err := io.flushPending(tx); err != nil {
				tx.Rollback()
				rows = rows[:rowsBefore]
				failures = append(failures, batchChunkFailures(start, end, err)...)
				continue
			}
			if err := tx.Commit().Error; err != nil {
				failures = append(failures, batchChunkFailures(start, end, err)...)
				// 提交失败：本块整体作废，已收集的行也要撤掉。
				rows = rows[:rowsBefore]
				continue
			}
		} else {
			tx.Rollback()
			rows = rows[:rowsBefore]
			io.truncatePending(0, 0)
		}
	}
	return rows, failures
}

// batchAllFailed 生成「整批都失败」的失败明细。
func batchAllFailed(n int, err error) []BatchFailure {
	return batchChunkFailures(0, n, err)
}

// batchChunkFailures 生成某一段行号的失败明细。
func batchChunkFailures(start, end int, err error) []BatchFailure {
	failures := make([]BatchFailure, 0, end-start)
	for i := start; i < end; i++ {
		failures = append(failures, BatchFailure{Target: fmt.Sprintf("第 %d 行", i+1), Message: err.Error()})
	}
	return failures
}

// BatchUpdatePartial 批量更新记录，**允许部分成功**。
func (s *Service) BatchUpdatePartial(ctx context.Context, userID, projectID, tableID uuid.UUID, ids []uuid.UUID, fields map[string]any) ([]RecordRow, []BatchFailure) {
	rows := make([]RecordRow, 0, len(ids))
	failures := make([]BatchFailure, 0)
	for _, id := range ids {
		row, err := s.UpdateRecord(ctx, userID, projectID, id, RecordInput{Fields: fields})
		if err != nil {
			failures = append(failures, BatchFailure{Target: id.String(), Message: err.Error()})
			continue
		}
		rows = append(rows, *row)
	}
	return rows, failures
}

// BatchDeletePartial 批量删除记录，**允许部分成功**。
func (s *Service) BatchDeletePartial(ctx context.Context, userID, projectID, tableID uuid.UUID, ids []uuid.UUID) []BatchFailure {
	failures := make([]BatchFailure, 0)
	for _, id := range ids {
		if err := s.DeleteRecord(ctx, userID, projectID, id); err != nil {
			failures = append(failures, BatchFailure{Target: id.String(), Message: err.Error()})
		}
	}
	return failures
}

// ReorderRecords 按给定顺序重排记录（手动排序位）。
//
// ids 是目标顺序（可以只是当前视图里可见的那部分记录）；
// 其余记录保持相对次序并排到 ids 之后，因此不会因为分页/筛选而错乱。
func (s *Service) ReorderRecords(ctx context.Context, userID, projectID, tableID uuid.UUID, ids []uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	if len(ids) == 0 {
		return fmt.Errorf("%w: empty reorder list", ErrFieldValueInvalid)
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", tableID).First(&table).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTableNotFound
		}
		return err
	}
	// 目标顺序里的记录必须都属于本表。
	var owned []uuid.UUID
	if err := s.db.WithContext(ctx).Model(&BaseRecord{}).
		Where("table_id = ? AND id IN ? AND deleted_at IS NULL", tableID, ids).
		Pluck("id", &owned).Error; err != nil {
		return err
	}
	if len(owned) != len(ids) {
		return fmt.Errorf("%w: reorder contains unknown record", ErrFieldValueInvalid)
	}
	// 表内其余记录：保持原相对次序，排到目标顺序之后。
	var rest []BaseRecord
	if err := s.db.WithContext(ctx).Where("table_id = ? AND id NOT IN ? AND deleted_at IS NULL", tableID, ids).
		Order("sort_order ASC, id ASC").Limit(5000).Find(&rest).Error; err != nil {
		return err
	}
	ordered := make([]uuid.UUID, 0, len(ids)+len(rest))
	ordered = append(ordered, ids...)
	for _, item := range rest {
		ordered = append(ordered, item.ID)
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, id := range ordered {
			if err := tx.Model(&BaseRecord{}).
				Where("id = ? AND table_id = ?", id, tableID).
				Updates(map[string]any{
					"sort_order": int64(i),
					"version":    gorm.Expr("version + 1"),
					"updated_by": userID,
					"updated_at": time.Now(),
				}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// BatchCreate 批量创建记录（默认整批成功或整批失败）。
func (s *Service) BatchCreate(ctx context.Context, userID, projectID, tableID uuid.UUID, items []RecordInput) ([]RecordRow, error) {
	out := make([]RecordRow, 0, len(items))
	// 同 BatchCreatePartial：schema / 权限身份提到循环外。
	io, err := s.newWriteIO(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	// **校验全部在事务外完成**。
	//
	// 校验要查库（文档引用 / 关联记录是否存在），走的是独立连接。
	// 如果放在事务内做，每个请求就是「事务占 1 条 + 校验再要 1 条」，
	// 50 并发正好打满 50 条的连接池 → 所有请求互相等待 → 整体死锁
	// （压测表现：批量写入 120 秒超时，库里一排 idle in transaction）。
	prepared := make([]*preparedRecord, len(items))
	for i, item := range items {
		p, err := s.prepareRecord(ctx, userID, projectID, io.table, io.idx, item, io.subj)
		if err != nil {
			return nil, fmt.Errorf("第 %d 行: %w", i+1, err)
		}
		prepared[i] = p
	}
	// 整批一个事务：语义是「全成功或全失败」，任何一行出错整批回滚。
	//
	// 事务内只有纯写入语句（不再有任何 s.db 查询），所以不会出现
	// 「事务 + 校验」两条连接同时占用的死锁。
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		io.probeTables(tx)
		base, err := allocSortBase(tx, tableID)
		if err != nil {
			return err
		}
		for i := range prepared {
			row, err := s.persistRecord(ctx, userID, projectID, io, base, prepared[i], tx)
			if err != nil {
				return fmt.Errorf("第 %d 行: %w", i+1, err)
			}
			out = append(out, *row)
			base++
		}
		// 审计与事件批量落库（与记录同事务）。
		return io.flushPending(tx)
	})
	if err != nil {
		return nil, err
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
	// 批量修改完成 → 广播 record.batch_updated（技术文档 §8.2）。
	// 逐条更新已经各自发了 record.updated；这条汇总事件让订阅端
	// 能识别「这是一次批量操作」，避免把 N 条更新当成 N 次独立协作。
	if len(ids) > 0 {
		var table BaseTable
		if err := s.db.WithContext(ctx).Select("id, base_id").Where("id = ?", tableID).First(&table).Error; err == nil {
			recordIDs := make([]string, 0, len(ids))
			for _, id := range ids {
				recordIDs = append(recordIDs, id.String())
			}
			_ = s.emitRecordEvent(s.db.WithContext(ctx), projectID, table.BaseID, tableID, ids[0], "record.batch_updated", map[string]any{
				"tableId":   tableID.String(),
				"recordIds": recordIDs,
				"count":     len(ids),
			})
		}
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

// BaseEmbedder 描述一篇内嵌了本 Base 的文档。
type BaseEmbedder struct {
	// NodeID 是知识库节点 ID（可直接跳转）。
	NodeID uuid.UUID `json:"nodeId"`
	// DocumentID 是文档 ID。
	DocumentID uuid.UUID `json:"documentId"`
	// Title 是文档标题。
	Title string `json:"title"`
	// TableID 是被内嵌的表（一个文档可以内嵌同一 Base 的多张表）。
	TableID string `json:"tableId"`
}

// ListBaseEmbedders 列出所有内嵌了本 Base 的文档。
//
// 文档里的内嵌块以 `<div data-type="baseEmbed" data-base-id=... data-table-id=...>` 存 HTML，
// 这里扫当前空间的文档正文，命中 `data-base-id` 即认为内嵌了本 Base。
func (s *Service) ListBaseEmbedders(ctx context.Context, userID, projectID, baseID uuid.UUID) ([]BaseEmbedder, error) {
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
	type row struct {
		NodeID     uuid.UUID
		DocumentID uuid.UUID
		Title      string
		HTML       string
	}
	var rows []row
	if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
		Select("kb_nodes.id AS node_id, kb_nodes.document_id, kb_nodes.title, COALESCE(d.current_data->>'html','') AS html").
		// 文档表在「全库表名前缀统一」后叫 kb_documents（见 internal/db/table_naming.go）。
		Joins("JOIN kb_documents d ON d.id = kb_nodes.document_id AND d.deleted_at IS NULL").
		Where("kb_nodes.project_id = ? AND kb_nodes.node_type = 'doc' AND kb_nodes.trashed_at IS NULL AND kb_nodes.document_id IS NOT NULL", projectID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	marker := `data-base-id="` + app.ID.String() + `"`
	out := make([]BaseEmbedder, 0)
	for _, item := range rows {
		if !strings.Contains(item.HTML, marker) {
			continue
		}
		out = append(out, BaseEmbedder{
			NodeID:     item.NodeID,
			DocumentID: item.DocumentID,
			Title:      item.Title,
			TableID:    app.ID.String(),
		})
	}
	return out, nil
}

// RecordDocReference 是「引用了本记录的文档」条目。
type RecordDocReference struct {
	// NodeID 是知识库节点 ID（可直接跳转）。
	NodeID uuid.UUID `json:"nodeId"`
	// DocumentID 是文档 ID。
	DocumentID uuid.UUID `json:"documentId"`
	// Title 是文档标题。
	Title string `json:"title"`
	// Kind：embed = 文档内嵌了本记录所属的表；mention = 文档正文里提到了本记录 ID。
	Kind string `json:"kind"`
}

// ListRecordDocReferences 列出「引用了本记录」的文档。
//
// 两种口径：
//   - embed：文档正文里内嵌了本记录所属 Base 的视图块（data-base-id 命中）；
//   - mention：文档正文里出现了本记录 ID（例如复制粘贴了记录链接）。
//
// 对应技术方案第 11 章「文档反向引用某条记录」。
func (s *Service) ListRecordDocReferences(ctx context.Context, userID, projectID, recordID uuid.UUID) ([]RecordDocReference, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	record, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
		return nil, err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", record.TableID).First(&table).Error; err != nil {
		return nil, err
	}
	type row struct {
		NodeID     uuid.UUID
		DocumentID uuid.UUID
		Title      string
		HTML       string
	}
	var rows []row
	if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
		Select("kb_nodes.id AS node_id, kb_nodes.document_id, kb_nodes.title, COALESCE(d.current_data->>'html','') AS html").
		Joins("JOIN kb_documents d ON d.id = kb_nodes.document_id AND d.deleted_at IS NULL").
		Where("kb_nodes.project_id = ? AND kb_nodes.node_type = 'doc' AND kb_nodes.trashed_at IS NULL AND kb_nodes.document_id IS NOT NULL", projectID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	embedMarker := `data-base-id="` + table.BaseID.String() + `"`
	mentionMarker := recordID.String()
	out := make([]RecordDocReference, 0)
	for _, item := range rows {
		switch {
		case strings.Contains(item.HTML, embedMarker):
			out = append(out, RecordDocReference{
				NodeID: item.NodeID, DocumentID: item.DocumentID, Title: item.Title, Kind: "embed",
			})
		case strings.Contains(item.HTML, mentionMarker):
			out = append(out, RecordDocReference{
				NodeID: item.NodeID, DocumentID: item.DocumentID, Title: item.Title, Kind: "mention",
			})
		}
	}
	return out, nil
}

// reindexTable 按当前字段能力重建整表投影。
//
// 背景：字段的「可筛选」能力与「可索引」能力必须一致——
// 早期版本里长文本 / 关联记录 / 关联文档声明了 Filterable 却没开 Indexable，
// 导致这些字段既不写投影也筛不出结果。字段新建或改类型后必须重建一次。
func (s *Service) reindexTable(ctx context.Context, tableID uuid.UUID, tenantID uuid.UUID) error {
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
		return s.reindexTableTx(tx, tableID, tenantID)
	})
}

// reindexTableTx 在已有事务里重建整表投影。
//
// 字段类型迁移时必须走这个版本：投影重建要和数据迁移在**同一个事务**里，
// 否则会出现「类型已改、投影还是旧结构」的中间态（回滚时数据与投影对不上）。
func (s *Service) reindexTableTx(tx *gorm.DB, tableID uuid.UUID, tenantID uuid.UUID) error {
	var records []BaseRecord
	if err := tx.Where("table_id = ? AND deleted_at IS NULL", tableID).
		Limit(5000).
		Find(&records).Error; err != nil {
		return err
	}
	if len(records) == 0 {
		return nil
	}
	for _, rec := range records {
		data := map[string]any{}
		if len(rec.Data) > 0 {
			if err := json.Unmarshal(rec.Data, &data); err != nil {
				continue
			}
		}
		if err := s.syncAllProjections(tx, tableID, rec.ID, tenantID, data); err != nil {
			return err
		}
	}
	return nil
}

// syncAllProjections 把记录的所有字段写入查询投影表。
func (s *Service) syncAllProjections(tx *gorm.DB, tableID, recordID uuid.UUID, tenantID uuid.UUID, data map[string]any) error {
	var fields []BaseField
	if err := tx.Where("table_id = ? AND status = 1", tableID).Find(&fields).Error; err != nil {
		return err
	}
	return s.syncProjectionsWithFields(tx, tableID, recordID, tenantID, data, fields)
}

// syncProjectionsWithFields 用**已加载好的字段列表**写投影。
//
// 为什么要单独一个版本：批量写入（一次 500 行）时，
// 每个字段都单独发一次 DELETE + 一次 INSERT，还额外查一次字段类型，
// 20 个字段就是 60 次往返 —— 500 行就是 3 万次往返，写入直接被拖到十几秒。
// 这里改成「一次 DELETE（这些字段）+ 一次批量 INSERT」，往返数与字段数无关。
func (s *Service) syncProjectionsWithFields(tx *gorm.DB, tableID, recordID uuid.UUID, tenantID uuid.UUID, data map[string]any, fields []BaseField) error {
	rows := make([]BaseRecordValue, 0, len(fields))
	fieldIDs := make([]uuid.UUID, 0, len(fields))
	for _, f := range fields {
		handler, ok := s.registry.Get(FieldType(f.Type))
		if !ok || !handler.Definition().Capabilities.Indexable {
			continue
		}
		value, exists := data[f.ID.String()]
		if !exists {
			continue
		}
		row, ok := projectionRow(handler, tableID, recordID, f.ID, tenantID, value)
		if !ok {
			continue
		}
		rows = append(rows, row)
		fieldIDs = append(fieldIDs, f.ID)
	}
	if len(rows) == 0 {
		return nil
	}
	// 覆盖式写入：先删后插，避免唯一键冲突与残留。
	// 一次删掉本次要写的全部字段，而不是逐字段删。
	if err := tx.Where("record_id = ? AND field_id IN ?", recordID, fieldIDs).
		Delete(&BaseRecordValue{}).Error; err != nil {
		return err
	}
	return tx.CreateInBatches(&rows, 100).Error
}

// syncProjection 写入单条投影记录。
func (s *Service) syncProjection(tx *gorm.DB, tableID, recordID, fieldID uuid.UUID, tenantID uuid.UUID, value any) error {
	handler, ok := s.registry.Get(FieldType(fieldMustType(s, fieldID)))
	if !ok {
		return nil
	}
	row, ok := projectionRow(handler, tableID, recordID, fieldID, tenantID, value)
	if !ok {
		return nil
	}
	// 覆盖式写入：先删后插，避免唯一键冲突与残留。
	if err := tx.Where("record_id = ? AND field_id = ?", recordID, fieldID).Delete(&BaseRecordValue{}).Error; err != nil {
		return err
	}
	return tx.Create(&row).Error
}

// projectionRow 按字段处理器把值转成投影行。
func projectionRow(handler FieldHandler, tableID, recordID, fieldID, tenantID uuid.UUID, value any) (BaseRecordValue, bool) {
	row := BaseRecordValue{
		ID:        uuid.New(),
		TenantID:  tenantID,
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
	return row, true
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
	// 公式表可能还没迁移（老库 / 精简影子库）：先判断再查，
	// 否则失败的 SELECT 会毒死 Postgres 事务，后续写入全部失败。
	return s.recomputeFormulasWith(tx, table, idx, data, tx.Migrator().HasTable(&BaseFieldFormula{}))
}

// recomputeFormulasWith 是 recomputeFormulas 的「已知表是否存在」版本。
//
// 批量写入时 HasTable 只需要探一次：每行探一次就是每行一次
// information_schema 查询，500 行会白白多出 500 次往返。
func (s *Service) recomputeFormulasWith(tx *gorm.DB, table *BaseTable, idx *fieldIndex, data map[string]any, hasFormulaTable bool) (map[string]any, error) {
	return s.applyFormulas(table, idx, data, loadTableFormulas(tx, idx, hasFormulaTable))
}

// loadTableFormulas 载入本表（status = 1）的公式定义。
//
// 只取本表字段对应的公式。
//
// 旧实现是 `WHERE status = 1` 全表扫描：库里每个表的公式都被拉出来，
// 再在内存里按本表字段过滤。表一多，每次写记录都要搬运全库公式行，
// 批量写入时这个开销被放大几百倍。
func loadTableFormulas(tx *gorm.DB, idx *fieldIndex, hasFormulaTable bool) map[string]BaseFieldFormula {
	if !hasFormulaTable {
		return nil
	}
	fieldIDs := make([]uuid.UUID, 0, len(idx.byID))
	for fid := range idx.byID {
		fieldIDs = append(fieldIDs, fid)
	}
	if len(fieldIDs) == 0 {
		return nil
	}
	var formulas []BaseFieldFormula
	if err := tx.Where("status = 1 AND field_id IN ?", fieldIDs).Find(&formulas).Error; err != nil {
		return nil
	}
	byID := map[string]BaseFieldFormula{}
	for _, f := range formulas {
		if _, ok := idx.byID[f.FieldID]; ok {
			byID[f.FieldID.String()] = f
		}
	}
	return byID
}

// applyFormulas 按依赖顺序计算公式字段并写回数据。
func (s *Service) applyFormulas(table *BaseTable, idx *fieldIndex, data map[string]any, byID map[string]BaseFieldFormula) (map[string]any, error) {
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
		// 无依赖的公式（例如 TODAY()、1 + 1）也必须进入计算顺序，
		// 否则 deps 里没有它的键，topoOrder 会把它整条漏掉（公式值永远算不出来）。
		if _, ok := deps[id]; !ok {
			deps[id] = nil
		}
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
	// Scope 是视图可见范围：shared（空间共享）/ personal（仅创建者）。
	Scope     string    `json:"scope"`
	OwnerID   uuid.UUID `json:"ownerId"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
}

// ListViews 列出表视图。
func (s *Service) ListViews(ctx context.Context, userID, projectID, tableID uuid.UUID) ([]ViewInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	// 个人视图只有创建者能看到（共享视图对空间成员可见）。
	var rows []BaseView
	if err := s.db.WithContext(ctx).
		Where("table_id = ? AND status = 1 AND (scope = ? OR scope = '' OR owner_id = ?)", tableID, ViewScopeShared, userID).
		Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ViewInfo, 0, len(rows))
	for _, v := range rows {
		out = append(out, viewInfoOf(&v, userID))
	}
	if err := s.attachViewPrefs(ctx, userID, projectID, out); err != nil {
		return nil, err
	}
	return out, nil
}

// attachViewPrefs 把「当前用户」的个人偏好挂到视图列表上。
//
// 只挂当前用户的 —— 别人的个人偏好是别人的事，不下发（也不该被读到）。
func (s *Service) attachViewPrefs(ctx context.Context, userID, projectID uuid.UUID, infos []ViewInfo) error {
	if len(infos) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(infos))
	index := map[uuid.UUID]int{}
	for i, info := range infos {
		ids = append(ids, info.ID)
		index[info.ID] = i
	}
	var prefs []BaseViewPref
	if err := s.db.WithContext(ctx).
		Where("view_id IN ? AND user_id = ?", ids, userID).
		Find(&prefs).Error; err != nil {
		return err
	}
	for _, pref := range prefs {
		i, ok := index[pref.ViewID]
		if !ok {
			continue
		}
		personal := map[string]any{}
		if len(pref.Config) > 0 {
			_ = json.Unmarshal(pref.Config, &personal)
		}
		if infos[i].Config == nil {
			infos[i].Config = map[string]any{}
		}
		infos[i].Config["personal"] = map[string]any{viewPersonalKey(userID): personal}
	}
	return nil
}

// viewInfoOf 输出视图信息（共享配置部分）。
//
// 个人偏好不在这份 config 里 —— 它存在 base_view_prefs，
// 由 ListViews / UpdateView 按「当前用户」单独挂到 config.personal[uid] 上。
func viewInfoOf(v *BaseView, userID uuid.UUID) ViewInfo {
	cfg := map[string]any{}
	if len(v.Config) > 0 {
		_ = json.Unmarshal(v.Config, &cfg)
	}
	scope := v.Scope
	if scope == "" {
		scope = ViewScopeShared
	}
	return ViewInfo{
		ID: v.ID, TableID: v.TableID, Name: v.Name, Type: v.Type, Config: cfg,
		IsDefault: v.IsDefault, Scope: scope, OwnerID: v.OwnerID, Version: v.Version, CreatedAt: v.CreatedAt,
	}
}

// splitViewPersonal 把「共享段」与「个人段」拆开。
//
// shared —— 视图级共享配置（列宽 / 显隐 / 布局），存在 base_views.config；
// personal —— 当前用户的个人偏好，存在 base_view_prefs。
//
// 返回的 personalOK=false 表示本次请求里根本没带 personal 段
// （调用方据此区分「没动」和「删掉了自己的偏好」）。
func splitViewPersonal(cfg map[string]any) (shared map[string]any, personal map[string]any, personalOK bool) {
	shared = map[string]any{}
	if cfg == nil {
		return shared, nil, false
	}
	for k, v := range cfg {
		if k == "personal" {
			continue
		}
		shared[k] = v
	}
	if p, ok := cfg["personal"].(map[string]any); ok {
		return shared, p, true
	}
	return shared, nil, false
}

// viewPersonalKey 是个人偏好在响应里的键（当前用户 uid）。
func viewPersonalKey(userID uuid.UUID) string { return userID.String() }

// CreateView 新建视图。
// ValidViewTypes 是允许的视图类型。
//
//	grid    —— 表格视图
//	kanban  —— 看板视图
//	calendar—— 日历视图
//	gallery —— 画廊视图
//	form    —— 表单视图（一次填一条记录）
//	gantt   —— 甘特视图（按开始 / 结束日期排布）
var ValidViewTypes = []string{"grid", "kanban", "calendar", "gallery", "form", "gantt"}

// IsValidViewType 判断视图类型是否受支持。
func IsValidViewType(t string) bool {
	for _, item := range ValidViewTypes {
		if item == t {
			return true
		}
	}
	return false
}

func (s *Service) CreateView(ctx context.Context, userID, projectID, tableID uuid.UUID, name, viewType string, config map[string]any, scope string) (*ViewInfo, error) {
	if strings.TrimSpace(name) == "" {
		name = "新视图"
	}
	if viewType == "" {
		viewType = "grid"
	}
	if !IsValidViewType(viewType) {
		return nil, fmt.Errorf("%w: unsupported view type %q", ErrQueryInvalid, viewType)
	}
	if scope != ViewScopePersonal {
		scope = ViewScopeShared
	}
	// 共享视图需要编辑者；个人视图只有自己看得到，访客也能建（第十三轮）。
	need := RoleEditor
	if scope == ViewScopePersonal {
		need = RoleViewer
	}
	if err := s.assertAccess(userID, projectID, need); err != nil {
		return nil, err
	}
	shared, personal, _ := splitViewPersonal(config)
	raw, _ := json.Marshal(shared)
	view := BaseView{
		ID: uuid.New(), TenantID: projectID, TableID: tableID, Name: name, Type: viewType, Config: raw,
		Scope: scope, OwnerID: userID, Version: 1, Status: 1,
	}
	if err := s.db.WithContext(ctx).Create(&view).Error; err != nil {
		return nil, err
	}
	// 新建视图时如果带了个人段，落进 base_view_prefs。
	if len(personal) > 0 {
		if pref, ok := personal[viewPersonalKey(userID)]; ok {
			if err := s.saveViewPref(ctx, projectID, view.ID, userID, pref); err != nil {
				return nil, err
			}
		}
	}
	info := viewInfoOf(&view, userID)
	return &info, nil
}

// UpdateView 更新视图配置（乐观锁）。
func (s *Service) UpdateView(ctx context.Context, userID, projectID, viewID uuid.UUID, name, viewType *string, config map[string]any, version int64) (*ViewInfo, error) {
	// 访客也能改「自己的个人偏好」（第十三轮）：
	// 只写 base_view_prefs 里自己的那一份，不影响共享配置。
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var view BaseView
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).First(&view).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrViewNotFound
		}
		return nil, err
	}
	// 个人视图只有创建者能改；共享视图的空间成员都能改（保持既有协作方式）。
	if view.Scope == ViewScopePersonal && view.OwnerID != userID {
		return nil, ErrViewNotFound
	}
	// 共享段（视图名 / 类型 / 共享配置）需要编辑者及以上；
	// 但「自己的个人视图」只有自己看得到，访客也能完整编辑。
	canEditShared := roleRank(s.spaceRole(userID, projectID)) >= roleRank(RoleEditor) ||
		(view.Scope == ViewScopePersonal && view.OwnerID == userID)
	if !canEditShared {
		// 访客只能改自己的偏好；视图名与共享配置的改动一律忽略。
		if name != nil || viewType != nil {
			name, viewType = nil, nil
		}
	}
	updates := map[string]any{"version": gorm.Expr("version + 1")}
	if name != nil {
		updates["name"] = strings.TrimSpace(*name)
	}
	if viewType != nil && *viewType != "" {
		if !IsValidViewType(*viewType) {
			return nil, fmt.Errorf("%w: unsupported view type %q", ErrQueryInvalid, *viewType)
		}
		updates["type"] = *viewType
	}
	var personal map[string]any
	personalOK := false
	if config != nil {
		// 共享段整体替换；个人段单独落到 base_view_prefs，互不覆盖。
		shared, p, ok := splitViewPersonal(config)
		personal, personalOK = p, ok
		if canEditShared {
			raw, _ := json.Marshal(shared)
			updates["config"] = raw
		}
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
	// 个人偏好：带了就 upsert，没带自己的键就删掉（共享模式下「取消我的偏好」）。
	if personalOK {
		if pref, ok := personal[viewPersonalKey(userID)]; ok {
			if err := s.saveViewPref(ctx, projectID, viewID, userID, pref); err != nil {
				return nil, err
			}
		} else if err := s.deleteViewPref(ctx, viewID, userID); err != nil {
			return nil, err
		}
	}
	// 视图配置变了 → 广播 view.updated（技术文档 §8.2）。
	_ = s.emitViewEvent(s.db.WithContext(ctx), projectID, view.TableID, viewID, "view.updated", map[string]any{
		"viewId": viewID.String(),
		"scope":  view.Scope,
	})
	var fresh BaseView
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).First(&fresh).Error; err != nil {
		return nil, err
	}
	info := viewInfoOf(&fresh, userID)
	list := []ViewInfo{info}
	if err := s.attachViewPrefs(ctx, userID, projectID, list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

// saveViewPref 写入（或覆盖）某个视图的个人偏好。
func (s *Service) saveViewPref(ctx context.Context, projectID, viewID, userID uuid.UUID, pref any) error {
	raw, err := json.Marshal(pref)
	if err != nil {
		return err
	}
	row := BaseViewPref{
		ID: uuid.New(), TenantID: projectID, ViewID: viewID, UserID: userID, ProjectID: projectID,
		Config: raw, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	return s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "view_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"config", "updated_at"}),
		}).
		Create(&row).Error
}

// deleteViewPref 删除某个视图的个人偏好。
func (s *Service) deleteViewPref(ctx context.Context, viewID, userID uuid.UUID) error {
	return s.db.WithContext(ctx).
		Where("view_id = ? AND user_id = ?", viewID, userID).
		Delete(&BaseViewPref{}).Error
}

// DeleteView 删除视图。
func (s *Service) DeleteView(ctx context.Context, userID, projectID, viewID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	var view BaseView
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).First(&view).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrViewNotFound
		}
		return err
	}
	if view.Scope == ViewScopePersonal && view.OwnerID != userID {
		return ErrViewNotFound
	}
	if err := s.db.WithContext(ctx).Where("id = ?", viewID).Delete(&BaseView{}).Error; err != nil {
		return err
	}
	// 视图删了，它所有人的个人偏好也没意义了。
	return s.db.WithContext(ctx).Where("view_id = ?", viewID).Delete(&BaseViewPref{}).Error
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
		return fmt.Errorf("%w: %v", ErrFormulaParse, err)
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
				ID: uuid.New(), TenantID: projectID, FieldID: fieldID, Expression: expression, AST: rawAST,
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
				ID: uuid.New(), TenantID: projectID, TableID: field.TableID, FormulaFieldID: fieldID,
				DependencyFieldID: depID, DependencyType: "field", DependencyTableID: &field.TableID,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		if err := s.bumpSchema(tx, field.TableID); err != nil {
			return err
		}
		// 公式变更要广播事件：订阅端据此刷新公式列（此前保存公式不通知，
		// 协作端要等下一次拉取才看到新公式结果）。
		var ownerTable BaseTable
		if err := tx.Where("id = ?", field.TableID).First(&ownerTable).Error; err != nil {
			return err
		}
		return s.writeEventTyped(tx, projectID, ownerTable.BaseID, &field.TableID, &fieldID, "field", "field.formula.saved", map[string]any{
			"fieldId":      fieldID.String(),
			"expression":   expression,
			"dependencies": deps,
		})
	})
	if err != nil {
		return err
	}
	// 公式保存后立刻重算本表历史记录，保证新公式立即有值。
	if err := s.recalcTableFormulas(ctx, tableID); err != nil {
		return err
	}
	// 公式重算完成 → 广播 formula.calculated（技术文档 §8.2）。
	// 与 field.formula.saved 配对：前者说「定义变了」，后者说「值算好了」。
	var ownerTable BaseTable
	if err := s.db.WithContext(ctx).Select("id, base_id").Where("id = ?", tableID).First(&ownerTable).Error; err == nil {
		_ = s.writeEventOptional(s.db.WithContext(ctx), projectID, ownerTable.BaseID, &tableID, &fieldID, "field", "formula.calculated", map[string]any{
			"fieldId":    fieldID.String(),
			"tableId":    tableID.String(),
			"expression": expression,
		})
	}
	return nil
}

// —— 审计与事件 ——

func (s *Service) writeAudit(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, recordID *uuid.UUID, operatorID uuid.UUID, operation string, before, after map[string]any, requestID string) error {
	row := newAuditRow(projectID, baseID, tableID, recordID, operatorID, operation, before, after, requestID)
	return tx.Create(&row).Error
}

// newAuditRow 构造一条操作审计行（不落库）。
//
// 批量写入时先攒行、最后批量插入，往返数与行数脱钩。
func newAuditRow(projectID, baseID uuid.UUID, tableID, recordID *uuid.UUID, operatorID uuid.UUID, operation string, before, after map[string]any, requestID string) BaseOperationLog {
	beforeRaw, _ := json.Marshal(before)
	afterRaw, _ := json.Marshal(after)
	return BaseOperationLog{
		ID: uuid.New(), TenantID: projectID, ProjectID: projectID, BaseID: baseID, TableID: tableID, RecordID: recordID,
		OperatorID: operatorID, Operation: operation, BeforeData: beforeRaw, AfterData: afterRaw,
		RequestID: requestID, CreatedAt: time.Now(),
	}
}

func (s *Service) writeEvent(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, aggregateID *uuid.UUID, eventType string, payload map[string]any) error {
	return s.writeEventTyped(tx, projectID, baseID, tableID, aggregateID, "record", eventType, payload)
}

// writeEventTyped 写一条领域事件（outbox）。
//
// aggregateType 区分事件归属（record / field / view），
// 订阅端据此决定要不要重新拉取。
func (s *Service) writeEventTyped(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, aggregateID *uuid.UUID, aggregateType, eventType string, payload map[string]any) error {
	row := newEventRow(projectID, baseID, tableID, aggregateID, aggregateType, eventType, payload)
	return tx.Create(&row).Error
}

// newEventRow 构造一条发件箱事件行（不落库）。
//
// 批量写入时先攒行、最后批量插入，往返数与行数脱钩。
func newEventRow(projectID, baseID uuid.UUID, tableID, aggregateID *uuid.UUID, aggregateType, eventType string, payload map[string]any) BaseEventOutbox {
	raw, _ := json.Marshal(payload)
	return BaseEventOutbox{
		ID: uuid.New(), TenantID: projectID, ProjectID: projectID, BaseID: baseID, TableID: tableID,
		AggregateType: aggregateType, AggregateID: derefUUID(aggregateID), EventType: eventType,
		Payload: raw, Status: "pending", CreatedAt: time.Now(),
	}
}

// writeEventOptional 写一条「可有可无」的事件。
//
// 结构类事件（schema.changed / field.* / view.updated）不应该因为
// 发件箱表还没建好（精简影子库 / 老库未迁移）就把整个业务操作打回。
// 这里吞掉「表不存在」类错误，其余错误照常返回。
func (s *Service) writeEventOptional(tx *gorm.DB, projectID, baseID uuid.UUID, tableID, aggregateID *uuid.UUID, aggregateType, eventType string, payload map[string]any) error {
	// 同上：发件箱表没迁移时不能直接执行 INSERT —— 失败的语句会毒死整个事务。
	if !tx.Migrator().HasTable(&BaseEventOutbox{}) {
		return nil
	}
	err := s.writeEventTyped(tx, projectID, baseID, tableID, aggregateID, aggregateType, eventType, payload)
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "no such table") ||
		strings.Contains(msg, "doesn't exist") ||
		strings.Contains(msg, "does not exist") {
		return nil
	}
	return err
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
		Table("base_record_values v").
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
		Table("base_record_values v").
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

	// 记录级可见范围：受限记录不应出现在文档的「反向引用」里。
	visible := s.visibleRecordIDs(ctx, userID, projectID, recordIDs)

	for _, h := range hits {
		if !visible[h.RecordID] {
			continue
		}
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

// AuditQuery 是操作审计的查询条件（分页 + 筛选）。
type AuditQuery struct {
	// Limit 是单页条数（1~200，默认 50）。
	Limit int
	// Offset 是偏移量（配合「加载更多」）。
	Offset int
	// Action 是操作类型过滤（record.created / field.updated / …）；空表示不过滤。
	Action string
	// From / To 是时间范围（含端点）；nil 表示不限。
	From *time.Time
	To   *time.Time
	// OperatorID 是操作者过滤（用户 ID）；uuid.Nil 表示不过滤。
	OperatorID uuid.UUID
	// RecordID 是记录过滤（记录 ID）；uuid.Nil 表示不过滤。
	RecordID uuid.UUID
	// RecordPrefix 是记录 ID 的前缀过滤（用户只记得前几位时用）；空表示不过滤。
	RecordPrefix string
}

// canonicalUUIDPrefix 把用户输入的记录 ID 前缀转成 UUID 规范写法的前缀，
// 便于「只记得前几位」时也能筛到记录；非法输入返回 ok=false（调用方忽略该条件）。
func canonicalUUIDPrefix(input string) (string, bool) {
	clean := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(input), "-", ""))
	if len(clean) == 0 || len(clean) > 32 {
		return "", false
	}
	for _, r := range clean {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return "", false
		}
	}
	switch {
	case len(clean) <= 8:
		return clean, true
	case len(clean) <= 13:
		return clean[:8] + "-" + clean[8:], true
	case len(clean) <= 18:
		return clean[:8] + "-" + clean[8:12] + "-" + clean[12:], true
	case len(clean) <= 23:
		return clean[:8] + "-" + clean[8:12] + "-" + clean[12:16] + "-" + clean[16:], true
	default:
		return clean[:8] + "-" + clean[8:12] + "-" + clean[12:16] + "-" + clean[16:20] + "-" + clean[20:], true
	}
}

// ListAudit 列出操作审计（分页 + 筛选），并返回符合条件的总条数。
func (s *Service) ListAudit(ctx context.Context, userID, projectID, baseID uuid.UUID, q AuditQuery) ([]BaseOperationLog, int64, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, 0, err
	}
	if q.Limit <= 0 || q.Limit > 200 {
		q.Limit = 50
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	base := s.db.WithContext(ctx).Model(&BaseOperationLog{}).
		Where("project_id = ? AND base_id = ?", projectID, baseID)
	if action := strings.TrimSpace(q.Action); action != "" {
		base = base.Where("operation = ?", action)
	}
	if q.From != nil {
		base = base.Where("created_at >= ?", *q.From)
	}
	if q.To != nil {
		base = base.Where("created_at <= ?", *q.To)
	}
	if q.OperatorID != uuid.Nil {
		base = base.Where("operator_id = ?", q.OperatorID)
	}
	if q.RecordID != uuid.Nil {
		base = base.Where("record_id = ?", q.RecordID)
	} else if prefix := strings.TrimSpace(q.RecordPrefix); prefix != "" {
		if canonical, ok := canonicalUUIDPrefix(prefix); ok {
			// Postgres 用 ::text，SQLite（单测影子库）用 CAST。
			expr := "record_id::text LIKE ?"
			if s.db.Dialector.Name() != "postgres" {
				expr = "CAST(record_id AS TEXT) LIKE ?"
			}
			base = base.Where(expr, canonical+"%")
		}
	}
	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []BaseOperationLog
	if err := base.Order("created_at DESC").Limit(q.Limit).Offset(q.Offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// 视图可见范围（技术方案风险表：共享视图与个人偏好混存 → 视图分「共享 / 个人」）。
const (
	// ViewScopeShared：空间内共享视图，配置对所有成员生效。
	ViewScopeShared = "shared"
	// ViewScopePersonal：个人视图，只有创建者能看到与编辑。
	ViewScopePersonal = "personal"
)

// —— 公式只读接口（§10.7） ——

// FormulaDefinition 是公式字段的只读定义。
type FormulaDefinition struct {
	FieldID      uuid.UUID       `json:"fieldId"`
	FieldName    string          `json:"fieldName"`
	TableID      uuid.UUID       `json:"tableId"`
	Expression   string          `json:"expression"`
	AST          *ASTNode        `json:"ast,omitempty"`
	Version      int64           `json:"version"`
	Dependencies []FormulaDepRef `json:"dependencies"`
}

// FormulaDepRef 是依赖图里的一条边。
type FormulaDepRef struct {
	FieldID   uuid.UUID `json:"fieldId"`
	FieldName string    `json:"fieldName"`
	TableID   uuid.UUID `json:"tableId"`
	// Direction：down = 本公式依赖它；up = 它依赖本公式。
	Direction string `json:"direction"`
}

// GetFieldFormula 读取公式定义。
func (s *Service) GetFieldFormula(ctx context.Context, userID, projectID, fieldID uuid.UUID) (*FormulaDefinition, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFieldNotFound
		}
		return nil, err
	}
	def := &FormulaDefinition{
		FieldID:   field.ID,
		FieldName: field.Name,
		TableID:   field.TableID,
	}
	var formula BaseFieldFormula
	err := s.db.WithContext(ctx).Where("field_id = ?", fieldID).First(&formula).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err == nil {
		def.Expression = formula.Expression
		def.Version = formula.FormulaVersion
		if len(formula.AST) > 0 {
			var node ASTNode
			if err := json.Unmarshal(formula.AST, &node); err == nil {
				def.AST = &node
			}
		}
	}
	deps, err := s.ListFormulaDependencies(ctx, userID, projectID, fieldID)
	if err != nil {
		return nil, err
	}
	def.Dependencies = deps
	return def, nil
}

// ListFormulaDependencies 列出公式依赖图（双向）。
//
// down = 本公式依赖的字段；up = 依赖本公式的字段。
func (s *Service) ListFormulaDependencies(ctx context.Context, userID, projectID, fieldID uuid.UUID) ([]FormulaDepRef, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var field BaseField
	if err := s.db.WithContext(ctx).Where("id = ?", fieldID).First(&field).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFieldNotFound
		}
		return nil, err
	}
	idx, err := s.loadFieldIndex(ctx, field.TableID)
	if err != nil {
		return nil, err
	}
	out := []FormulaDepRef{}
	// 我依赖谁
	var down []BaseFormulaDependency
	if err := s.db.WithContext(ctx).Where("formula_field_id = ?", fieldID).Find(&down).Error; err != nil {
		return nil, err
	}
	for _, row := range down {
		name := ""
		if meta, ok := idx.byID[row.DependencyFieldID]; ok {
			name = meta.Name
		}
		depTableID := field.TableID
		if row.DependencyTableID != nil {
			depTableID = *row.DependencyTableID
		}
		out = append(out, FormulaDepRef{
			FieldID: row.DependencyFieldID, FieldName: name,
			TableID: depTableID, Direction: "down",
		})
	}
	// 谁依赖我
	var up []BaseFormulaDependency
	if err := s.db.WithContext(ctx).Where("dependency_field_id = ?", fieldID).Find(&up).Error; err != nil {
		return nil, err
	}
	for _, row := range up {
		name := ""
		if meta, ok := idx.byID[row.FormulaFieldID]; ok {
			name = meta.Name
		}
		out = append(out, FormulaDepRef{
			FieldID: row.FormulaFieldID, FieldName: name,
			TableID: row.TableID, Direction: "up",
		})
	}
	return out, nil
}

// TableSchema 是「表结构快照」（§10.3 GET /tables/{tableId}/schema）。
//
// 一次性返回结构相关的全部元信息，便于外部系统（导入 / 迁移 / 审计）只调一个接口拿到全貌。
type TableSchema struct {
	Table         TableInfo    `json:"table"`
	Fields        []FieldMeta  `json:"fields"`
	Views         []ViewInfo   `json:"views"`
	SchemaVersion int64        `json:"schemaVersion"`
	Formulas      []FormulaDef `json:"formulas"`
}

// FormulaDef 是公式字段的简要定义。
type FormulaDef struct {
	FieldID    uuid.UUID `json:"fieldId"`
	FieldName  string    `json:"fieldName"`
	Expression string    `json:"expression"`
}

// TableSchema 返回一张表的结构快照。
func (s *Service) TableSchema(ctx context.Context, userID, projectID, tableID uuid.UUID) (*TableSchema, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	table, _, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	info, err := s.tableInfo(ctx, table)
	if err != nil {
		return nil, err
	}
	fields, err := s.ListFields(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	views, err := s.ListViews(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	formulas := []FormulaDef{}
	for _, meta := range fields {
		if meta.Type != string(FieldFormula) {
			continue
		}
		var row BaseFieldFormula
		if err := s.db.WithContext(ctx).Where("field_id = ?", meta.ID).First(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return nil, err
		}
		fieldID, err := uuid.Parse(meta.ID)
		if err != nil {
			continue
		}
		formulas = append(formulas, FormulaDef{
			FieldID: fieldID, FieldName: meta.Name, Expression: row.Expression,
		})
	}
	return &TableSchema{
		Table:         *info,
		Fields:        fields,
		Views:         views,
		SchemaVersion: table.SchemaVersion,
		Formulas:      formulas,
	}, nil
}
