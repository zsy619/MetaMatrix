package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// IdempotencyKey 是「幂等键」记录：同一次写操作的重试只生效一次。
//
// 对应共享技术方案 §10.9「幂等键：批量创建、导入和重试请求使用 Idempotency-Key」。
//
// 语义：
//   - 唯一键 = 用户 + 接口 + 幂等键字符串；同键同请求体 → 直接回放上次响应；
//   - 同键不同请求体 → 视为客户端误用，返回 40901；
//   - 不同用户的同一个 key 互不影响（键按用户隔离）。
type IdempotencyKey struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_core_idem_project" json:"projectId"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index:idx_core_idem_user;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:1" json:"userId"`
	Endpoint  string    `gorm:"type:varchar(160);not null;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:2" json:"endpoint"`
	// Key 是客户端提供的幂等键。
	Key string `gorm:"type:varchar(160);not null;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:3" json:"key"`
	// RequestHash 是请求体的 SHA-256：用来判断「同键是否同体」。
	RequestHash string `gorm:"type:char(64);not null" json:"requestHash"`
	// ResponseCode / ResponseBody 是首次执行的结果，用于重试回放。
	ResponseCode int            `gorm:"not null;default:0" json:"responseCode"`
	ResponseBody datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"responseBody"`
	CreatedAt    time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt    time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (IdempotencyKey) TableName() string { return "core_idempotency_keys" }
