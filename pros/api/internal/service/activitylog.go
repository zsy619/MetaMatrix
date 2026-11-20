package service

import (
	"log"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"metamatrix/api/internal/model"
)

// ActivityService 记录并查询活动日志（登录、退出、写操作）。
type ActivityService struct {
	db *gorm.DB
}

func NewActivityService(db *gorm.DB) *ActivityService {
	return &ActivityService{db: db}
}

// Record 写一条活动记录。
//
// 日志写不进去也不能影响主流程：失败只打一行日志，调用方照常返回。
func (s *ActivityService) Record(entry model.ActivityLog) {
	if s == nil || s.db == nil {
		return
	}
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now()
	}
	if entry.Status == "" {
		entry.Status = "success"
	}
	if err := s.db.Create(&entry).Error; err != nil {
		log.Printf("activity log write failed: %v", err)
	}
}

// List 列出某个用户的活动记录，最新的在前。
func (s *ActivityService) List(userID uuid.UUID, category string, limit, offset int) ([]model.ActivityLog, int64, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	q := s.db.Model(&model.ActivityLog{}).Where("user_id = ?", userID)
	if category != "" {
		q = q.Where("category = ?", category)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.ActivityLog
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}
