package base

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
)

// 后台维护任务：归档 / 死信治理 / 清理。
//
// 为什么要专门做：
//   - base_operation_logs 是审计表，只增不减，一年后单表就能到千万行；
//   - base_event_outboxes 既是发件箱也是「断线补拉」的数据源，
//     published 的事件留太久没意义，但删太早会让重连的客户端补不到事件；
//   - 死信（dead）事件必须有明确的去处和保留期，不能无限堆积；
//   - 导入任务记录同理：失败的明细看几天就够了。

// MaintenanceConfig 是后台维护任务的参数。
type MaintenanceConfig struct {
	// OperationLogKeepDays 是操作审计保留天数（<=0 表示不清理）。
	OperationLogKeepDays int
	// OutboxKeepDays 是已发布事件保留天数（<=0 表示不清理）。
	OutboxKeepDays int
	// OutboxDeadKeepDays 是死信事件保留天数（<=0 表示不清理）。
	OutboxDeadKeepDays int
	// OutboxMaxRetries 是发布失败的最大重试次数，超出进入死信。
	OutboxMaxRetries int
	// ImportJobKeepDays 是导入任务保留天数（<=0 表示不清理）。
	ImportJobKeepDays int
	// Interval 是调度周期。
	Interval time.Duration
}

// DefaultMaintenanceConfig 返回默认参数。
func DefaultMaintenanceConfig() MaintenanceConfig {
	return MaintenanceConfig{
		OperationLogKeepDays: 90,
		OutboxKeepDays:       7,
		OutboxDeadKeepDays:   30,
		OutboxMaxRetries:     5,
		ImportJobKeepDays:    30,
		Interval:             time.Hour,
	}
}

// SetMaintenanceConfig 更新维护参数。
func (s *Service) SetMaintenanceConfig(cfg MaintenanceConfig) {
	if cfg.Interval <= 0 {
		cfg.Interval = time.Hour
	}
	if cfg.OutboxMaxRetries <= 0 {
		cfg.OutboxMaxRetries = 5
	}
	s.maintenanceMu.Lock()
	defer s.maintenanceMu.Unlock()
	s.maintenance = cfg
}

// MaintenanceConfig 返回当前维护参数。
func (s *Service) MaintenanceConfig() MaintenanceConfig {
	s.maintenanceMu.Lock()
	defer s.maintenanceMu.Unlock()
	return s.maintenance
}

// StartMaintenance 启动后台维护调度。
//
// 只启动一个协程：所有清理动作在同一个 tick 里依次执行，
// 避免多个定时器同时扫库把数据库 IO 打满。
func (s *Service) StartMaintenance(ctx context.Context) {
	cfg := s.MaintenanceConfig()
	go func() {
		ticker := time.NewTicker(cfg.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunMaintenanceOnce(ctx)
			}
		}
	}()
}

// RunMaintenanceOnce 立即执行一次维护（供测试与手动触发）。
func (s *Service) RunMaintenanceOnce(ctx context.Context) {
	cfg := s.MaintenanceConfig()
	if n, err := s.ArchiveOperationLogs(ctx, cfg.OperationLogKeepDays); err != nil {
		log.Printf("base maintenance: archive operation logs failed: %v", err)
	} else if n > 0 {
		log.Printf("base maintenance: archived %d operation logs", n)
	}
	if n, err := s.PurgeOutbox(ctx, cfg.OutboxKeepDays, cfg.OutboxDeadKeepDays); err != nil {
		log.Printf("base maintenance: purge outbox failed: %v", err)
	} else if n > 0 {
		log.Printf("base maintenance: purged %d outbox rows", n)
	}
	if n, err := s.PurgeImportJobs(ctx, cfg.ImportJobKeepDays); err != nil {
		log.Printf("base maintenance: purge import jobs failed: %v", err)
	} else if n > 0 {
		log.Printf("base maintenance: purged %d import jobs", n)
	}
}

// ArchiveOperationLogs 归档（清理）超期的操作审计。
//
// 保留策略：keepDays <= 0 时不删；只删「已完成状态」之外的所有行，
// 因为审计日志没有「未完成」状态，按时间删即可。
func (s *Service) ArchiveOperationLogs(ctx context.Context, keepDays int) (int64, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	deadline := time.Now().AddDate(0, 0, -keepDays)
	res := s.db.WithContext(ctx).
		Where("created_at < ?", deadline).
		Delete(&BaseOperationLog{})
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// PurgeOutbox 清理已发布事件与超期死信。
//
// 保留已发布事件 keepDays 天（断线补拉窗口）；
// 死信保留 deadKeepDays 天，超期彻底删除（需要长期保留就调大配置）。
func (s *Service) PurgeOutbox(ctx context.Context, keepDays, deadKeepDays int) (int64, error) {
	var total int64
	if keepDays > 0 {
		deadline := time.Now().AddDate(0, 0, -keepDays)
		res := s.db.WithContext(ctx).
			Where("status = ? AND created_at < ?", "published", deadline).
			Delete(&BaseEventOutbox{})
		if res.Error != nil {
			return total, res.Error
		}
		total += res.RowsAffected
	}
	if deadKeepDays > 0 {
		deadline := time.Now().AddDate(0, 0, -deadKeepDays)
		res := s.db.WithContext(ctx).
			Where("status = ? AND created_at < ?", OutboxStatusDead, deadline).
			Delete(&BaseEventOutbox{})
		if res.Error != nil {
			return total, res.Error
		}
		total += res.RowsAffected
	}
	return total, nil
}

// PurgeImportJobs 清理超期的导入任务记录。
func (s *Service) PurgeImportJobs(ctx context.Context, keepDays int) (int64, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	deadline := time.Now().AddDate(0, 0, -keepDays)
	res := s.db.WithContext(ctx).
		Where("created_at < ? AND status NOT IN ?", deadline, []string{ImportJobPending, ImportJobRunning}).
		Delete(&BaseImportJob{})
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// ListDeadLetters 列出死信事件（运维排查用）。
func (s *Service) ListDeadLetters(ctx context.Context, projectID uuid.UUID, limit int) ([]BaseEventOutbox, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []BaseEventOutbox
	q := s.db.WithContext(ctx).Where("status = ?", OutboxStatusDead).Order("created_at DESC").Limit(limit)
	if projectID != uuid.Nil {
		q = q.Where("project_id = ?", projectID)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// RetryDeadLetter 把一条死信重新放回队列。
//
// 为什么必须同时刷新 created_at：
//
// 发布器按「时间 + ID」水位单调向前读事件（readOutboxSince），已经读过的事件
// 不会再被读到。死信是之前读过的旧行，只把 status 改回 pending 的话，
// 它会永远留在 pending 里等下一次发布 —— 看起来「重投成功」，实际**永远不会送达**。
//
// 把 created_at 刷成当前时刻，等于让它重新进入水位窗口，
// 同时保留 id 不变（订阅端不会把它当成新事件重复处理）。
func (s *Service) RetryDeadLetter(ctx context.Context, eventID uuid.UUID) error {
	res := s.db.WithContext(ctx).Model(&BaseEventOutbox{}).
		Where("id = ? AND status = ?", eventID, OutboxStatusDead).
		Updates(map[string]any{
			"status":       "pending",
			"retry_count":  0,
			"created_at":   time.Now(),
			"published_at": nil,
		}).Error
	if res != nil {
		return res
	}
	return nil
}
