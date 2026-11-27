package model

import (
	"time"

	"github.com/google/uuid"
)

// UserNotification 是站内通知（评论 / 回复 / @）。
type UserNotification struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index:idx_un_user_created,priority:1" json:"userId"`
	ActorID   uuid.UUID  `gorm:"type:uuid;not null" json:"actorId"`
	DocID     *uuid.UUID `gorm:"type:uuid;index" json:"docId,omitempty"`
	CommentID *uuid.UUID `gorm:"type:uuid;index" json:"commentId,omitempty"`
	Kind      string     `gorm:"type:varchar(32);not null" json:"kind"`
	Title     string     `gorm:"type:varchar(255);not null;default:''" json:"title"`
	Body      string     `gorm:"type:text;not null;default:''" json:"body"`
	ReadAt    *time.Time `gorm:"type:timestamptz" json:"readAt,omitempty"`
	CreatedAt time.Time  `gorm:"type:timestamptz;not null;index:idx_un_user_created,priority:2" json:"createdAt"`
}

func (UserNotification) TableName() string { return "core_user_notifications" }
