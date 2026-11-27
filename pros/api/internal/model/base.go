// 多维表格 Base Engine 的表结构定义。
//
// 放在 model 包里，保持「表结构唯一事实来源」的约定；
// 业务逻辑在 internal/base。
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// BaseApp 是一个多维表格应用容器。
//
// ProjectID 就是本项目的「知识库空间」，充当租户边界：
// 所有查询都必须带上 project_id，禁止跨空间读写。
type BaseApp struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID   uuid.UUID  `gorm:"type:uuid;not null;index:idx_base_app_project" json:"projectId"`
	NodeID      *uuid.UUID `gorm:"type:uuid;uniqueIndex" json:"nodeId"`
	Name        string     `gorm:"type:varchar(128);not null;default:''" json:"name"`
	Description string     `gorm:"type:text;not null;default:''" json:"description"`
	Icon        string     `gorm:"type:varchar(64);not null;default:''" json:"icon"`
	OwnerID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"ownerId"`
	// SchemaVersion 是 Base 级别结构版本；字段/表变更会推进它。
	SchemaVersion int64 `gorm:"not null;default:1" json:"schemaVersion"`
	// Migrated 记录数据来源，例如 legacy_sheet:<nodeId>，用于迁移幂等。
	Migrated  string         `gorm:"type:varchar(64);not null;default:''" json:"migrated"`
	Status    int            `gorm:"not null;default:1" json:"status"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BaseApp) TableName() string { return "base_apps" }

// BaseTable 是一张数据表。
type BaseTable struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	BaseID         uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_table_base" json:"baseId"`
	Name           string         `gorm:"type:varchar(128);not null;default:''" json:"name"`
	Description    string         `gorm:"type:text;not null;default:''" json:"description"`
	PrimaryFieldID *uuid.UUID     `gorm:"type:uuid" json:"primaryFieldId"`
	SortOrder      int            `gorm:"not null;default:0" json:"sortOrder"`
	SchemaVersion  int64          `gorm:"not null;default:1" json:"schemaVersion"`
	Settings       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"settings"`
	Status         int            `gorm:"not null;default:1" json:"status"`
	CreatedAt      time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt      time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BaseTable) TableName() string { return "base_tables" }

// BaseField 定义记录中某个数据项的类型与规则。
type BaseField struct {
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	TableID    uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_field_table" json:"tableId"`
	Name       string         `gorm:"type:varchar(128);not null;default:''" json:"name"`
	Type       string         `gorm:"type:varchar(48);not null;default:'text'" json:"type"`
	Config     datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"config"`
	Required   bool           `gorm:"not null;default:false" json:"required"`
	UniqueFlag bool           `gorm:"not null;default:false" json:"unique"`
	IsPrimary  bool           `gorm:"not null;default:false" json:"isPrimary"`
	IsSystem   bool           `gorm:"not null;default:false" json:"isSystem"`
	SortOrder  int            `gorm:"not null;default:0" json:"sortOrder"`
	Version    int64          `gorm:"not null;default:1" json:"version"`
	Status     int            `gorm:"not null;default:1" json:"status"`
	CreatedAt  time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseField) TableName() string { return "base_fields" }

// BaseRecord 是记录主表：data 是权威存储，键为字段 ID。
//
// Version 是乐观锁版本，任何写入都必须带 expectedVersion。
type BaseRecord struct {
	ID      uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TableID uuid.UUID `gorm:"type:uuid;not null;index:idx_base_record_table;index:idx_base_record_table_sort,priority:1;index:idx_base_record_scope,priority:1" json:"tableId"`
	// SortOrder 是手动排序位（画廊 / 表格的默认顺序）。越小越靠前。
	SortOrder int64          `gorm:"not null;default:0;index:idx_base_record_table_sort,priority:2" json:"sortOrder"`
	Data      datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"data"`
	Version   int64          `gorm:"not null;default:1" json:"version"`
	// Visibility 是记录级可见范围：
	//   space     —— 空间内可见（默认）；
	//   restricted —— 仅创建者与空间管理者可见。
	// 记录级过滤在 Query Engine 生成 SQL 时注入，不做查询后内存删除。
	Visibility string         `gorm:"type:varchar(16);not null;default:'space';index:idx_base_record_scope,priority:2" json:"visibility"`
	CreatedBy  uuid.UUID      `gorm:"type:uuid;not null;index" json:"createdBy"`
	UpdatedBy  uuid.UUID      `gorm:"type:uuid;not null;index" json:"updatedBy"`
	CreatedAt  time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BaseRecord) TableName() string { return "base_records" }

// BaseRecordGrant 是「记录级可见范围 = 指定成员」时的授权名单。
//
// 为什么单独一张表：
//   - 记录本身的可见范围（space / restricted / custom）是**列**级语义，
//     「哪些人额外被授权」是**行**级语义，放 JSONB 里既查不动也加不了索引；
//   - 查询注入要靠它做 `id IN (SELECT record_id FROM base_record_grants WHERE user_id = ?)`，
//     有索引才走得动；
//   - 一个记录可能被授权给多人，天然是多对多。
type BaseRecordGrant struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	RecordID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uniq_base_record_grant;index:idx_base_record_grant_record" json:"recordId"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uniq_base_record_grant;index:idx_base_record_grant_user" json:"userId"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	CreatedBy uuid.UUID `gorm:"type:uuid;not null" json:"createdBy"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (BaseRecordGrant) TableName() string { return "base_record_grants" }

// BaseRecordValue 是查询投影表：把高频筛选/排序字段类型化，便于建索引。
// 它不是权威数据源，与 BaseRecord 同事务写入。
type BaseRecordValue struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	TableID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_value_table" json:"tableId"`
	RecordID    uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_value_record" json:"recordId"`
	FieldID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_value_field" json:"fieldId"`
	ValueType   string         `gorm:"type:varchar(24);not null;default:'text'" json:"valueType"`
	ValueText   string         `gorm:"type:text;not null;default:''" json:"valueText"`
	ValueNumber float64        `gorm:"type:double precision;not null;default:0" json:"valueNumber"`
	ValueDate   *time.Time     `gorm:"type:timestamptz" json:"valueDate"`
	ValueBool   bool           `gorm:"not null;default:false" json:"valueBool"`
	ValueJSON   datatypes.JSON `gorm:"type:jsonb" json:"valueJson"`
	UpdatedAt   time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseRecordValue) TableName() string { return "base_record_values" }

// BaseView 是视图配置：只描述如何展示，不拥有记录数据。
type BaseView struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	TableID   uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_view_table" json:"tableId"`
	Name      string         `gorm:"type:varchar(128);not null;default:''" json:"name"`
	Type      string         `gorm:"type:varchar(32);not null;default:'grid'" json:"type"`
	Config    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"config"`
	IsDefault bool           `gorm:"not null;default:false" json:"isDefault"`
	// Scope 是视图可见范围：
	//   shared  —— 空间内共享（默认），配置对所有成员生效；
	//   personal —— 仅创建者可见，用于「我自己的一套视图」。
	Scope     string    `gorm:"type:varchar(16);not null;default:'shared'" json:"scope"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null;index" json:"ownerId"`
	Version   int64     `gorm:"not null;default:1" json:"version"`
	Status    int       `gorm:"not null;default:1" json:"status"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseView) TableName() string { return "base_views" }

// BaseViewPref 是「视图个人偏好」。
//
// 为什么单独一张表，而不是把 personal 段塞进 base_views.config：
//   - 共享配置（列宽 / 显隐 / 布局）是视图级资产，任何成员改都互相可见；
//   - 个人偏好是「我自己的列宽 / 我自己隐藏了哪列」，必须按人隔离；
//   - 塞在一起时，A 改共享配置会连带覆盖 B 的个人偏好（写覆盖），
//     而且 A 能读到 B 的偏好（读泄露）—— 两者都是协作里的真实事故。
// 因此个人偏好独立成表，键是 (view_id, user_id)。
type BaseViewPref struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	ViewID    uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_base_view_pref_view_user" json:"viewId"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_base_view_pref_view_user;index:idx_base_view_pref_user" json:"userId"`
	ProjectID uuid.UUID      `gorm:"type:uuid;not null;index" json:"projectId"`
	Config    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"config"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseViewPref) TableName() string { return "base_view_prefs" }

// BaseRecordLink 存记录之间的关联关系。
type BaseRecordLink struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	SourceTableID  uuid.UUID `gorm:"type:uuid;not null;index" json:"sourceTableId"`
	SourceRecordID uuid.UUID `gorm:"type:uuid;not null;index" json:"sourceRecordId"`
	FieldID        uuid.UUID `gorm:"type:uuid;not null;index" json:"fieldId"`
	TargetTableID  uuid.UUID `gorm:"type:uuid;not null;index" json:"targetTableId"`
	TargetRecordID uuid.UUID `gorm:"type:uuid;not null;index" json:"targetRecordId"`
	SortOrder      int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt      time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (BaseRecordLink) TableName() string { return "base_record_links" }

// BaseFieldFormula 保存公式定义与解析后的 AST。
type BaseFieldFormula struct {
	ID              uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	FieldID         uuid.UUID      `gorm:"type:uuid;uniqueIndex" json:"fieldId"`
	Expression      string         `gorm:"type:text;not null;default:''" json:"expression"`
	AST             datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"ast"`
	CalculationMode string         `gorm:"type:varchar(24);not null;default:'sync'" json:"calculationMode"`
	FormulaVersion  int64          `gorm:"not null;default:1" json:"formulaVersion"`
	Status          int            `gorm:"not null;default:1" json:"status"`
	CreatedAt       time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt       time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseFieldFormula) TableName() string { return "base_field_formulas" }

// BaseFormulaDependency 记录公式字段依赖了哪些字段。
type BaseFormulaDependency struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	TableID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"tableId"`
	FormulaFieldID    uuid.UUID  `gorm:"type:uuid;not null;index:idx_base_dep_formula" json:"formulaFieldId"`
	DependencyFieldID uuid.UUID  `gorm:"type:uuid;not null;index" json:"dependencyFieldId"`
	DependencyType    string     `gorm:"type:varchar(24);not null;default:'field'" json:"dependencyType"`
	DependencyTableID *uuid.UUID `gorm:"type:uuid" json:"dependencyTableId"`
}

func (BaseFormulaDependency) TableName() string { return "base_formula_dependencies" }

// BaseOperationLog 是操作审计：记录谁在什么时候改了什么。
type BaseOperationLog struct {
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"projectId"`
	BaseID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"baseId"`
	TableID    *uuid.UUID     `gorm:"type:uuid;index" json:"tableId"`
	RecordID   *uuid.UUID     `gorm:"type:uuid;index" json:"recordId"`
	OperatorID uuid.UUID      `gorm:"type:uuid;not null;index" json:"operatorId"`
	Operation  string         `gorm:"type:varchar(32);not null;default:''" json:"operation"`
	BeforeData datatypes.JSON `gorm:"type:jsonb" json:"beforeData"`
	AfterData  datatypes.JSON `gorm:"type:jsonb" json:"afterData"`
	RequestID  string         `gorm:"type:varchar(64);not null;default:''" json:"requestId"`
	CreatedAt  time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (BaseOperationLog) TableName() string { return "base_operation_logs" }

// BaseEventOutbox 是事务性发件箱：业务数据与事件同事务落库，再异步发布。
type BaseEventOutbox struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"projectId"`
	BaseID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"baseId"`
	TableID       *uuid.UUID     `gorm:"type:uuid;index" json:"tableId"`
	AggregateType string         `gorm:"type:varchar(32);not null;default:'record'" json:"aggregateType"`
	AggregateID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"aggregateId"`
	EventType     string         `gorm:"type:varchar(64);not null;index" json:"eventType"`
	Payload       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"payload"`
	Status        string         `gorm:"type:varchar(16);not null;default:'pending';index" json:"status"`
	RetryCount    int            `gorm:"not null;default:0" json:"retryCount"`
	CreatedAt     time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	PublishedAt   *time.Time     `gorm:"type:timestamptz" json:"publishedAt"`
}

func (BaseEventOutbox) TableName() string { return "base_event_outboxes" }
