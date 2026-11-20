package model

import (
	"time"

	"github.com/google/uuid"
)

// PageReference 记录一篇文档对另一篇文档的引用（@ 文档 mention 或画布嵌入块）。
// 保存时全量重建：先删该 source_doc_id 的旧记录，再扫描当前内容插入新记录。
// 反查（谁引用了我）走 target_doc_id 索引。
type PageReference struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	SourceDocID  uuid.UUID `gorm:"type:uuid;not null;index:idx_pr_source,priority:1" json:"sourceDocId"`
	TargetDocID  uuid.UUID `gorm:"type:uuid;not null;index:idx_pr_target" json:"targetDocId"`
	RefType      string    `gorm:"type:varchar(16);not null" json:"refType"` // mention | embed
	TargetLabel  string    `gorm:"type:varchar(255);not null;default:''" json:"targetLabel"`
	CreatedAt    time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (PageReference) TableName() string { return "page_references" }
