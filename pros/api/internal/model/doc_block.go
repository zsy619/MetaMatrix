package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// DocBlock 是知识库正文的派生块表（B2 第一刀）。
//
// 身份来自 A1 的 data-block-id，不在保存时另发 UUID。
// 删除走 soft delete（DeletedAt），记录保留以便引用与恢复。
type DocBlock struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID  uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_blocks_doc_ordinal,priority:1" json:"documentId"`
	ParentID    *uuid.UUID     `gorm:"type:uuid;index:idx_doc_blocks_parent" json:"parentId"`
	BlockType   string         `gorm:"type:varchar(64);not null" json:"blockType"`
	Ordinal     int            `gorm:"not null;default:0;index:idx_doc_blocks_doc_ordinal,priority:2" json:"ordinal"`
	Depth       int            `gorm:"not null;default:0" json:"depth"`
	AnchorKey   string         `gorm:"type:varchar(128);not null;default:''" json:"anchorKey"`
	ContentText string         `gorm:"type:text;not null;default:''" json:"contentText"`
	ContentJSON datatypes.JSON `gorm:"type:jsonb" json:"contentJson"`
	Attrs       datatypes.JSON `gorm:"type:jsonb" json:"attrs"`
	RevisionID  *uuid.UUID     `gorm:"type:uuid" json:"revisionId"`
	// Permission 预留块级权限字段，本轮不做 ACL UI。
	Permission string     `gorm:"type:varchar(32);not null;default:''" json:"permission,omitempty"`
	CreatedAt  time.Time  `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt  time.Time  `gorm:"type:timestamptz;not null" json:"updatedAt"`
	DeletedAt  *time.Time `gorm:"type:timestamptz;index:idx_doc_blocks_deleted" json:"deletedAt"`

	Document CanvasDocument `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
}

func (DocBlock) TableName() string { return "kb_doc_blocks" }
