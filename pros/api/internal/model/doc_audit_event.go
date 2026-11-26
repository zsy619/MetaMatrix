package model

import (
	"time"

	"github.com/google/uuid"
)

// DocAuditEvent 是用户+文档级审计骨架（A3）。
//
// 记录「谁在何时对哪篇文档做了什么」；BlockID 来自 A1 的 data-block-id，拿不到则为空。
// 完整块类型 / 父子 / 深度等到 B2 再补，不要和 activity_logs（登录与 HTTP 写操作）混用。
type DocAuditEvent struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID uuid.UUID `gorm:"type:uuid;not null;index:idx_doc_audit_doc_created,priority:1" json:"documentId"`
	UserID     uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	Action     string    `gorm:"type:varchar(32);not null" json:"action"`
	BlockID    string    `gorm:"type:varchar(128);not null;default:''" json:"blockId"`
	Detail     string    `gorm:"type:text;not null;default:''" json:"detail"`
	CreatedAt  time.Time `gorm:"not null;index:idx_doc_audit_doc_created,priority:2,sort:desc" json:"createdAt"`
}

func (DocAuditEvent) TableName() string { return "doc_audit_events" }
