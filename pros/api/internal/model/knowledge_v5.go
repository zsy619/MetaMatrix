package model

import (
	"time"

	"github.com/google/uuid"
)

// 知识库 5.0：评论已读位、业务标签词库。

// DocCommentRead 记录用户在某文档里读到哪一条评论。
//
// 用「读到的时间点」而不是逐条标记：评论列表只关心「有没有新评论」，
// 一行就够，读到时间之后的评论即为未读。
type DocCommentRead struct {
	ID     uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_dcr_user_doc" json:"userId"`
	DocID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_dcr_user_doc" json:"docId"`
	// ReadAt 是已读时间点：之后的评论对用户而言是未读。
	ReadAt    time.Time `gorm:"type:timestamptz;not null" json:"readAt"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (DocCommentRead) TableName() string { return "doc_comment_reads" }

// KnowledgeTagDict 是空间的业务词库：统一标签命名与推荐来源。
type KnowledgeTagDict struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_ktd_project" json:"projectId"`
	// Tag 是词条本体；同一空间内唯一。
	Tag string `gorm:"type:varchar(64);not null;uniqueIndex:idx_ktd_project_tag" json:"tag"`
	// Category 是分类：状态、阶段、业务线等。
	Category string `gorm:"type:varchar(32);not null;default:''" json:"category"`
	// Aliases 是同义词（逗号分隔）：检索与推荐时一并命中。
	Aliases   string    `gorm:"type:varchar(255);not null;default:''" json:"aliases"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (KnowledgeTagDict) TableName() string { return "knowledge_tag_dict" }
