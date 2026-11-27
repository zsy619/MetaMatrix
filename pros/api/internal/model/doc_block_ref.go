package model

import (
	"time"

	"github.com/google/uuid"
)

// DocBlockRef 是文档内块到块的引用（交叉引用）。老锚点保留在 AnchorKey。
type DocBlockRef struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID    uuid.UUID  `gorm:"type:uuid;not null;index:idx_doc_block_refs_doc" json:"documentId"`
	SourceBlockID uuid.UUID  `gorm:"type:uuid;not null;index:idx_doc_block_refs_source" json:"sourceBlockId"`
	TargetBlockID *uuid.UUID `gorm:"type:uuid;index:idx_doc_block_refs_target" json:"targetBlockId"`
	TargetDocID   *uuid.UUID `gorm:"type:uuid" json:"targetDocId"`
	RefType       string     `gorm:"type:varchar(32);not null" json:"refType"`
	AnchorKey     string     `gorm:"type:varchar(128);not null;default:''" json:"anchorKey"`
	TargetLabel   string     `gorm:"type:varchar(255);not null;default:''" json:"targetLabel"`
	Lost          bool       `gorm:"not null;default:false" json:"lost"`
	CreatedAt     time.Time  `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (DocBlockRef) TableName() string { return "kb_doc_block_refs" }
