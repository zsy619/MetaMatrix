package model

import (
	"time"

	"github.com/google/uuid"
)

// KnowledgeTemplate 是知识库文档模板。
//
// 内置模板（Builtin=true）对所有用户可见；用户模板挂在 owner_user_id 下，
// 可跨项目复用。模板只保存初始 HTML，写文档时由前端注入正文。
type KnowledgeTemplate struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	// OwnerUserID 为空表示内置模板。
	OwnerUserID *uuid.UUID `gorm:"type:uuid;index" json:"ownerUserId"`
	// ProjectID 为空表示跨项目通用模板。
	ProjectID *uuid.UUID `gorm:"type:uuid;index" json:"projectId"`
	Key       string     `gorm:"type:varchar(64);not null" json:"key"`
	Label     string     `gorm:"type:varchar(64);not null" json:"label"`
	Icon      string     `gorm:"type:varchar(16);not null;default:'📄'" json:"icon"`
	// Category 是模板分组（飞书模板中心按场景分类）。
	Category string `gorm:"type:varchar(32);not null;default:'通用'" json:"category"`
	// Scope 是模板作用域：builtin | team | personal | project。
	Scope   string `gorm:"type:varchar(16);not null;default:'personal'" json:"scope"`
	HTML    string `gorm:"type:text;not null;default:''" json:"html"`
	Builtin bool   `gorm:"not null;default:false" json:"builtin"`
	// SortOrder 控制模板面板内的顺序。
	SortOrder int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (KnowledgeTemplate) TableName() string { return "knowledge_templates" }

// DocProperty 是文档的页面属性（飞书「页面属性」）。
//
// 与正文分开存：属性要能被筛选、排序、统计，不能塞进 current_data。
type DocProperty struct {
	DocID       uuid.UUID `gorm:"type:uuid;primaryKey" json:"docId"`
	OwnerUserID uuid.UUID `gorm:"type:uuid;not null;index" json:"ownerUserId"`
	// Status 是文档状态：draft | published | archived。
	Status string `gorm:"type:varchar(16);not null;default:'draft'" json:"status"`
	// ReviewerUserID 是负责人/审核人。
	ReviewerUserID *uuid.UUID `gorm:"type:uuid" json:"reviewerUserId"`
	// DueAt 是截止时间。
	DueAt *time.Time `gorm:"index" json:"dueAt"`
	// Tags 是逗号分隔的标签串：标签检索直接 LIKE，不引 pg_trgm。
	Tags string `gorm:"type:varchar(255);not null;default:''" json:"tags"`
	// Summary 是摘要：搜索结果与目录卡片都读它。
	Summary string `gorm:"type:varchar(255);not null;default:''" json:"summary"`
	// CoverColor / CoverURL 是封面。
	CoverColor string `gorm:"type:varchar(32);not null;default:''" json:"coverColor"`
	CoverURL   string `gorm:"type:varchar(512);not null;default:''" json:"coverUrl"`
	// Members 是参与人（逗号分隔的用户 ID）：飞书页面属性的「参与人」字段。
	Members string `gorm:"type:varchar(512);not null;default:''" json:"members"`
	// Priority 是优先级：low | normal | high | urgent。
	Priority string `gorm:"type:varchar(16);not null;default:'normal'" json:"priority"`
	// Milestone 是所属里程碑，Sprint 是所属迭代周期。
	Milestone string `gorm:"type:varchar(64);not null;default:''" json:"milestone"`
	Sprint    string `gorm:"type:varchar(64);not null;default:''" json:"sprint"`
	// Number 是自定义数值字段：预算、工时、评分都走它。
	Number    float64   `gorm:"not null;default:0" json:"number"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (DocProperty) TableName() string { return "doc_properties" }

// DocComment 是文档评论（飞书评论 / 划线评论）。
//
// Quote 是被评论的原文片段，Anchor 是其在正文里的字符偏移，
// 两者都允许为空 —— 空表示整篇文档级评论。
type DocComment struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DocID        uuid.UUID  `gorm:"type:uuid;not null;index:idx_dc_doc" json:"docId"`
	AuthorUserID uuid.UUID  `gorm:"type:uuid;not null" json:"authorUserId"`
	ParentID     *uuid.UUID `gorm:"type:uuid;index" json:"parentId"`
	Quote        string     `gorm:"type:text;not null;default:''" json:"quote"`
	Anchor       int        `gorm:"not null;default:-1" json:"anchor"`
	Content      string     `gorm:"type:text;not null" json:"content"`
	Resolved     bool       `gorm:"not null;default:false" json:"resolved"`
	CreatedAt    time.Time  `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt    time.Time  `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (DocComment) TableName() string { return "doc_comments" }

// KnowledgeEvent 是知识库变更事件（outbox）。
//
// 供外部系统订阅知识变更：节点新建/移动/删除、文档发布、评论等。
type KnowledgeEvent struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID   uuid.UUID  `gorm:"type:uuid;not null;index:idx_ke_project" json:"projectId"`
	EventType   string     `gorm:"type:varchar(32);not null" json:"eventType"`
	NodeID      *uuid.UUID `gorm:"type:uuid;index" json:"nodeId"`
	DocumentID  *uuid.UUID `gorm:"type:uuid;index" json:"documentId"`
	ActorUserID uuid.UUID  `gorm:"type:uuid;not null" json:"actorUserId"`
	Payload     string     `gorm:"type:text;not null;default:''" json:"payload"`
	CreatedAt   time.Time  `gorm:"type:timestamptz;not null;index:idx_ke_created" json:"createdAt"`
}

func (KnowledgeEvent) TableName() string { return "knowledge_events" }

// KnowledgeView 是「最近浏览」记录。
//
// 同一用户同一文档只留一条，按 viewed_at 倒序取最近 N 条。
type KnowledgeView struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;index:idx_kv_user" json:"userId"`
	DocID    uuid.UUID `gorm:"type:uuid;not null;index:idx_kv_doc" json:"docId"`
	ViewedAt time.Time `gorm:"type:timestamptz;not null;index:idx_kv_user,priority:2,sort:desc" json:"viewedAt"`
}

func (KnowledgeView) TableName() string { return "knowledge_views" }
