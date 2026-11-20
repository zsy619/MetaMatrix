package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// DocumentSaveOperation 记录一次带 operationId 的文档保存。
//
//  owner_user_id + document_id + operation_id 是幂等键：同一篇文档内，
// 客户端可以用 operationId 安全重试，而不同文档之间互不影响。
// RequestHash 用来识别“同一个 ID 却提交了不同载荷”的编程错误。
// ResultSaveVersion 与 Result 在首次保存成功的同一事务里写入；Result 是
// 当时的完整文档响应，因此后续重试不会重复推进版本，也不会被之后的保存污染。
type DocumentSaveOperation struct {
	OwnerUserID       uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_document_save_operation,priority:1" json:"-"`
	DocumentID        uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_document_save_operation,priority:2;index" json:"-"`
	OperationID       string         `gorm:"type:varchar(128);not null;uniqueIndex:uniq_document_save_operation,priority:3" json:"-"`
	RequestHash       string         `gorm:"type:char(64);not null" json:"-"`
	ResultSaveVersion int64          `gorm:"not null;default:0" json:"-"`
	Result            datatypes.JSON `gorm:"type:jsonb" json:"-"`
	CreatedAt         time.Time      `gorm:"type:timestamptz;not null" json:"-"`
	UpdatedAt         time.Time      `gorm:"type:timestamptz;not null" json:"-"`
}

func (DocumentSaveOperation) TableName() string { return "document_save_operations" }
