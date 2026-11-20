package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const (
	// BackupImportStatusImporting 只在导入事务内部可见；事务提交时记录必然已完成。
	BackupImportStatusImporting = "importing"
	// BackupImportStatusCompleted 表示 Result 可以与同批次重试请求安全复用。
	BackupImportStatusCompleted = "completed"
)

// BackupImport 记录一个用户的一次幂等备份导入。
//
// OwnerUserID + BatchID 是数据库级唯一约束，不能只在服务层“先查再插”：
// 两个并发请求必须依靠该约束选出唯一执行者，另一个请求再读取首次结果。
// Result 与文档写入在同一事务中提交，因此不会留下“文档已导入但结果丢失”的记录。
type BackupImport struct {
	ID                 uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	OwnerUserID        uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:idx_backup_import_owner_batch,priority:1" json:"ownerUserId"`
	BatchID            string         `gorm:"type:varchar(128);not null;uniqueIndex:idx_backup_import_owner_batch,priority:2" json:"batchId"`
	RequestFingerprint string         `gorm:"type:varchar(64);not null" json:"-"`
	Status             string         `gorm:"type:varchar(16);not null" json:"status"`
	Result             datatypes.JSON `gorm:"type:jsonb;not null" json:"result"`
	CreatedAt          time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt          time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (BackupImport) TableName() string { return "backup_imports" }
