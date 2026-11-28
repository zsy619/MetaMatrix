package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 大批量导入任务（技术文档 §16.2）。
//
// 设计要点：
//   - 提交即返回 jobId，不阻塞 HTTP 请求；
//   - 后台逐批处理，进度落库，可轮询；
//   - 支持取消与失败明细；
//   - 进程重启后，未完成的任务会被重新捡起来。

// 导入任务状态。
const (
	ImportJobPending   = "pending"
	ImportJobRunning   = "running"
	ImportJobSucceeded = "succeeded"
	ImportJobPartial   = "partial"
	ImportJobFailed    = "failed"
	ImportJobCancelled = "cancelled"
)

// 导入任务模式。
const (
	ImportModeAtomic  = "atomic"
	ImportModePartial = "partial"
)

// ImportJobBatchSize 是单批写入的记录数。
const ImportJobBatchSize = 200

// ImportJobPayload 是导入任务的输入负载。
type ImportJobPayload struct {
	// Rows 是待导入的记录（字段 ID → 值）。
	Rows []map[string]any `json:"rows"`
	// Mode：atomic / partial。
	Mode string `json:"mode"`
}

// ImportJobFailure 是一条失败明细。
type ImportJobFailure struct {
	Row    int    `json:"row"`
	Field  string `json:"field,omitempty"`
	Reason string `json:"reason"`
}

// ImportJobInfo 是导入任务的对外视图。
type ImportJobInfo struct {
	ID         string             `json:"id"`
	ProjectID  string             `json:"projectId"`
	TableID    string             `json:"tableId"`
	Status     string             `json:"status"`
	Mode       string             `json:"mode"`
	Total      int                `json:"total"`
	Processed  int                `json:"processed"`
	Succeeded  int                `json:"succeeded"`
	Failed     int                `json:"failed"`
	Failures   []ImportJobFailure `json:"failures"`
	Error      string             `json:"error,omitempty"`
	CreatedAt  time.Time          `json:"createdAt"`
	StartedAt  *time.Time         `json:"startedAt,omitempty"`
	FinishedAt *time.Time         `json:"finishedAt,omitempty"`
}

// importJobInfoOf 把任务行转成对外视图。
func importJobInfoOf(job *BaseImportJob) ImportJobInfo {
	info := ImportJobInfo{
		ID: job.ID.String(), ProjectID: job.ProjectID.String(), TableID: job.TableID.String(),
		Status: job.Status, Mode: job.Mode, Total: job.Total, Processed: job.Processed,
		Succeeded: job.Succeeded, Failed: job.Failed, Error: job.Error,
		CreatedAt: job.CreatedAt, StartedAt: job.StartedAt, FinishedAt: job.FinishedAt,
	}
	if len(job.Failures) > 0 {
		_ = json.Unmarshal(job.Failures, &info.Failures)
	}
	return info
}

// CreateImportJob 提交一个导入任务。
//
// 立即返回任务 ID；后台 goroutine 负责实际写入。
func (s *Service) CreateImportJob(ctx context.Context, userID, projectID, tableID uuid.UUID, payload ImportJobPayload) (*ImportJobInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	if _, _, err := s.loadTableSchema(ctx, userID, projectID, tableID); err != nil {
		return nil, err
	}
	if len(payload.Rows) == 0 {
		return nil, fmt.Errorf("%w: import rows must not be empty", ErrFieldValueInvalid)
	}
	mode := strings.TrimSpace(payload.Mode)
	if mode == "" {
		mode = ImportModePartial
	}
	if mode != ImportModeAtomic && mode != ImportModePartial {
		return nil, fmt.Errorf("%w: unsupported import mode %q", ErrQueryInvalid, mode)
	}
	raw, _ := json.Marshal(payload.Rows)
	job := BaseImportJob{
		ID:        uuid.New(),
		TenantID:  projectID,
		ProjectID: projectID,
		TableID:   tableID,
		CreatedBy: userID,
		Status:    ImportJobPending,
		Mode:      mode,
		Total:     len(payload.Rows),
		Payload:   datatypes.JSON(raw),
	}
	if err := s.db.WithContext(ctx).Create(&job).Error; err != nil {
		return nil, err
	}
	info := importJobInfoOf(&job)
	go s.runImportJob(job.ID)
	return &info, nil
}

// GetImportJob 查询导入任务。
func (s *Service) GetImportJob(ctx context.Context, userID, projectID, jobID uuid.UUID) (*ImportJobInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var job BaseImportJob
	if err := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", jobID, projectID).
		First(&job).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}
	info := importJobInfoOf(&job)
	return &info, nil
}

// ListImportJobs 列出某张表的导入任务。
func (s *Service) ListImportJobs(ctx context.Context, userID, projectID, tableID uuid.UUID, limit int) ([]ImportJobInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var jobs []BaseImportJob
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND table_id = ?", projectID, tableID).
		Order("created_at DESC").
		Limit(limit).
		Find(&jobs).Error; err != nil {
		return nil, err
	}
	out := make([]ImportJobInfo, 0, len(jobs))
	for i := range jobs {
		out = append(out, importJobInfoOf(&jobs[i]))
	}
	return out, nil
}

// CancelImportJob 取消一个排队中或执行中的导入任务。
func (s *Service) CancelImportJob(ctx context.Context, userID, projectID, jobID uuid.UUID) (*ImportJobInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var job BaseImportJob
	if err := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", jobID, projectID).
		First(&job).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}
	if job.Status == ImportJobSucceeded || job.Status == ImportJobFailed || job.Status == ImportJobCancelled {
		info := importJobInfoOf(&job)
		return &info, nil
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":      ImportJobCancelled,
		"finished_at": now,
	}).Error; err != nil {
		return nil, err
	}
	job.Status = ImportJobCancelled
	job.FinishedAt = &now
	info := importJobInfoOf(&job)
	return &info, nil
}

// runImportJob 执行一个导入任务（后台 goroutine）。
func (s *Service) runImportJob(jobID uuid.UUID) {
	ctx := context.Background()
	var job BaseImportJob
	if err := s.db.WithContext(ctx).Where("id = ?", jobID).First(&job).Error; err != nil {
		return
	}
	if job.Status != ImportJobPending && job.Status != ImportJobRunning {
		return
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":     ImportJobRunning,
		"started_at": now,
	}).Error; err != nil {
		return
	}
	var rows []map[string]any
	if len(job.Payload) > 0 {
		_ = json.Unmarshal(job.Payload, &rows)
	}
	succeeded, failed := 0, 0
	failures := make([]ImportJobFailure, 0)
	for start := 0; start < len(rows); start += ImportJobBatchSize {
		end := start + ImportJobBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		inputs := make([]RecordInput, 0, len(batch))
		for _, row := range batch {
			inputs = append(inputs, RecordInput{Fields: row})
		}
		created, batchFailures := s.BatchCreatePartial(ctx, job.CreatedBy, job.ProjectID, job.TableID, inputs)
		succeeded += len(created)
		for _, f := range batchFailures {
			failed++
			row := 0
			// BatchFailure.Target 形如「第 3 行」，这里取回行号（相对批次）。
			if idx := strings.Index(f.Target, " "); idx > 0 {
				if parsed, perr := strconv.Atoi(strings.TrimSpace(f.Target[idx+1:])); perr == nil {
					row = parsed
				}
			}
			failures = append(failures, ImportJobFailure{
				Row:    start + row,
				Field:  f.Target,
				Reason: f.Message,
			})
		}
		// 进度落库：用户随时能看到「导了多少」。
		rawFailures, _ := json.Marshal(failures)
		_ = s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
			"processed": end,
			"succeeded": succeeded,
			"failed":    failed,
			"failures":  datatypes.JSON(rawFailures),
		}).Error
	}
	finished := time.Now()
	status := ImportJobSucceeded
	if failed > 0 {
		if job.Mode == ImportModeAtomic {
			status = ImportJobFailed
		} else {
			status = ImportJobPartial
		}
	}
	rawFailures, _ := json.Marshal(failures)
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":      status,
		"processed":   len(rows),
		"succeeded":   succeeded,
		"failed":      failed,
		"failures":    datatypes.JSON(rawFailures),
		"finished_at": finished,
	}).Error; err != nil {
		log.Printf("base: import job %s finalize failed: %v", jobID, err)
	}
}

// StartImportJobWorker 启动导入任务恢复调度。
//
// 进程重启后，处于 running 状态的任务实际上已经中断（内存里的 goroutine 没了）。
// 这里把它们回滚为 pending 并重新执行，保证「导入不会因为重启而消失」。
func (s *Service) StartImportJobWorker(ctx context.Context) {
	interval := 2 * time.Minute
	if raw := strings.TrimSpace(os.Getenv("BASE_IMPORT_JOB_INTERVAL")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed > 0 {
			interval = parsed
		}
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.resumeStalledImportJobs(ctx)
			}
		}
	}()
}

// resumeStalledImportJobs 恢复中断的导入任务。
func (s *Service) resumeStalledImportJobs(ctx context.Context) {
	var jobs []BaseImportJob
	if err := s.db.WithContext(ctx).
		Where("status = ?", ImportJobRunning).
		Limit(20).
		Find(&jobs).Error; err != nil {
		return
	}
	for i := range jobs {
		job := jobs[i]
		if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
			"status": ImportJobPending,
		}).Error; err != nil {
			continue
		}
		go s.runImportJob(job.ID)
	}
}
