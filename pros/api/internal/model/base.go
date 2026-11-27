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
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	TableID   uuid.UUID      `gorm:"type:uuid;not null;index:idx_base_record_table" json:"tableId"`
	Data      datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"data"`
	Version   int64          `gorm:"not null;default:1" json:"version"`
	CreatedBy uuid.UUID      `gorm:"type:uuid;not null;index" json:"createdBy"`
	UpdatedBy uuid.UUID      `gorm:"type:uuid;not null;index" json:"updatedBy"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BaseRecord) TableName() string { return "base_records" }

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
	OwnerID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"ownerId"`
	Version   int64          `gorm:"not null;default:1" json:"version"`
	Status    int            `gorm:"not null;default:1" json:"status"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BaseView) TableName() string { return "base_views" }

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
