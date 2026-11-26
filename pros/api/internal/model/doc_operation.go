package model

import (
	"time"

	"github.com/google/uuid"
)

// DocOperation 是正文协同的增量操作日志，与文档保存版本对齐。
//
// 这张表记录 Yjs 更新（或快照），Seq 在同一篇文档内单调递增。
// SaveVersion 在这次操作同时双写 current_data 时记下当时的文档保存版本；
// 纯增量、未带 HTML 导出时为 0，方便回滚时区分「只改了协同日志」和「已经派生过 current_data」。
// 不要和 document_save_operations（HTTP 保存幂等）或 doc_crdt_updates（旧 HTML 级旁路）混用。
type DocOperation struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_doc_operation_doc_seq,priority:1" json:"documentId"`
	Seq          int64     `gorm:"not null;uniqueIndex:idx_doc_operation_doc_seq,priority:2" json:"seq"`
	Kind         string    `gorm:"type:varchar(16);not null;default:'update'" json:"kind"`
	Payload      []byte    `gorm:"type:bytea;not null" json:"payload"`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null;index" json:"authorUserId"`
	SaveVersion  int64     `gorm:"not null;default:0" json:"saveVersion"`
	CreatedAt    time.Time `gorm:"not null" json:"createdAt"`
}

func (DocOperation) TableName() string { return "doc_operation" }
