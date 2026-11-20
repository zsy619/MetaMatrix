package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// KnowledgeNodeData 是「多维表格 / 思维导图」这类非正文节点的结构化数据。
//
// 正文节点（doc）用 canvas_documents.current_data 存 HTML；
// 表格与导图有自己的形状，放进同一张表用 kind 区分，避免为每种节点类型建表。
type KnowledgeNodeData struct {
	NodeID    uuid.UUID      `gorm:"type:uuid;primaryKey" json:"nodeId"`
	Kind      string         `gorm:"type:varchar(16);not null" json:"kind"` // sheet | mindmap
	Data      datatypes.JSON `gorm:"type:jsonb;not null" json:"data"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (KnowledgeNodeData) TableName() string { return "knowledge_node_data" }

// KnowledgeShare 是文档的分享链接。
//
// Role 决定分享页能做什么：view 只读、comment 可评论、edit 可编辑。
// 公开访问走 /api/knowledge/shares/:token，不需要登录态。
type KnowledgeShare struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID uuid.UUID  `gorm:"type:uuid;not null;index" json:"documentId"`
	ProjectID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"projectId"`
	Token      string     `gorm:"type:varchar(64);not null;uniqueIndex" json:"token"`
	Role       string     `gorm:"type:varchar(16);not null;default:'view'" json:"role"`
	CreatedBy  uuid.UUID  `gorm:"type:uuid;not null" json:"createdBy"`
	ExpiresAt  *time.Time `gorm:"index" json:"expiresAt"`
	CreatedAt  time.Time  `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (KnowledgeShare) TableName() string { return "knowledge_shares" }

// KnowledgeDocVersion 是知识库文档的历史快照（飞书「历史版本」）。
//
// 与 canvas_revisions 独立：这里只关心「可读可对比的正文快照」，
// 每次保存自动追加一条，最多保留 keepVersionLimit 条。
type KnowledgeDocVersion struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID   uuid.UUID `gorm:"type:uuid;not null;index:idx_kdv_doc,priority:1" json:"documentId"`
	Title        string    `gorm:"type:varchar(255);not null;default:''" json:"title"`
	HTML         string    `gorm:"type:text;not null;default:''" json:"html"`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null;index" json:"authorUserId"`
	SaveVersion  int64     `gorm:"not null;default:0" json:"saveVersion"`
	CreatedAt    time.Time `gorm:"type:timestamptz;not null;index:idx_kdv_doc,priority:2,sort:desc" json:"createdAt"`
}

func (KnowledgeDocVersion) TableName() string { return "knowledge_doc_versions" }
