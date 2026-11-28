package model

import (
	"time"

	"github.com/google/uuid"
)

// ActivityLog 是一条活动记录：登录、退出与写操作。
//
// 用户可以为空（uuid.Nil）：登录失败时账号可能根本不存在，
// 这类记录只留下邮箱与原因，用来排查异常登录。
type ActivityLog struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;index:idx_activity_user_created,priority:1" json:"userId"`
	// Category：login / logout / operation。
	Category string `gorm:"type:varchar(32);not null;index" json:"category"`
	// Action：login_success / login_failed / logout / 方法+路径。
	Action string `gorm:"type:varchar(96);not null" json:"action"`
	// Status：success / failure。
	Status    string `gorm:"type:varchar(16);not null" json:"status"`
	Method    string `gorm:"type:varchar(8)" json:"method"`
	Path      string `gorm:"type:varchar(255)" json:"path"`
	Detail    string `gorm:"type:varchar(500)" json:"detail"`
	IP        string `gorm:"type:varchar(64)" json:"ip"`
	UserAgent string `gorm:"type:varchar(255)" json:"userAgent"`
	RequestID string `gorm:"type:varchar(64)" json:"requestId"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null;index:idx_activity_user_created,priority:2,sort:desc" json:"createdAt"`
}

func (ActivityLog) TableName() string { return "core_activity_logs" }
