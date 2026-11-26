package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// DocBlockRevision 记录派生块在某次保存时的内容快照。
type DocBlockRevision struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID  uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_block_revs_doc" json:"documentId"`
	BlockID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_block_revs_block_created,priority:1" json:"blockId"`
	RevisionID  *uuid.UUID     `gorm:"type:uuid" json:"revisionId"`
	ContentText string         `gorm:"type:text;not null;default:''" json:"contentText"`
	ContentJSON datatypes.JSON `gorm:"type:jsonb" json:"contentJson"`
	Attrs       datatypes.JSON `gorm:"type:jsonb" json:"attrs"`
	CreatedAt   time.Time      `gorm:"type:timestamptz;not null;index:idx_doc_block_revs_block_created,priority:2" json:"createdAt"`
}

func (DocBlockRevision) TableName() string { return "doc_block_revisions" }
