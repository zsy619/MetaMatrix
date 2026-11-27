package base

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"metamatrix/api/internal/model"
)

// 幂等键（共享技术方案 §10.9）。
//
// 目标：批量创建、导入和重试类请求带 `Idempotency-Key` 时，
// **重复提交只生效一次**，并且第二次直接回放第一次的响应。
//
// 实现要点：
//   - 唯一索引 (user_id, endpoint, key) 是并发重试的最终防线；
//   - 同键同体 → 回放；同键异体 → 40901（客户端误用）；
//   - 首次执行失败 → 删掉占位行，允许客户端原样重试；
//   - 首次执行仍在进行中 → 返回 40901「处理中」，不重复执行。
var (
	// ErrIdempotencyConflict 表示同一个幂等键被用于了不同的请求体。
	ErrIdempotencyConflict = errors.New("idempotency key conflict")
	// ErrIdempotencyInFlight 表示同键请求仍在处理中。
	ErrIdempotencyInFlight = errors.New("idempotency request in flight")
)

// IdempotencyTTL 是幂等记录的保留时长（超过后允许同键重新执行）。
const IdempotencyTTL = 7 * 24 * time.Hour

// IdempotencyResult 是一次幂等执行的结果。
type IdempotencyResult struct {
	// Replayed 为 true 表示这次没有真正执行，而是回放上次的结果。
	Replayed bool
	// Status 是 HTTP 状态码（首次执行与回放保持一致）。
	Status int
	// Body 是响应体。
	Body any
}

// HashRequest 计算请求体的稳定摘要（用于判断「同键是否同体」）。
func HashRequest(payload any) string {
	if payload == nil {
		return ""
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// Idempotent 在给定幂等键下执行 fn。
//
// key 为空时直接执行（不做任何记录）。
func (s *Service) Idempotent(
	ctx context.Context,
	userID, projectID uuid.UUID,
	endpoint, key string,
	payload any,
	status int,
	fn func(ctx context.Context) (any, error),
) (IdempotencyResult, error) {
	key = trimKey(key)
	if key == "" {
		body, err := fn(ctx)
		return IdempotencyResult{Body: body, Status: status}, err
	}
	hash := HashRequest(payload)
	row := model.IdempotencyKey{
		ID:          uuid.New(),
		ProjectID:   projectID,
		UserID:      userID,
		Endpoint:    endpoint,
		Key:         key,
		RequestHash: hash,
	}
	// 占位插入：抢到唯一索引的请求才是「首次执行者」。
	res := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row)
	if res.Error != nil {
		return IdempotencyResult{}, res.Error
	}
	// RowsAffected = 0 → 唯一键冲突 → 之前已经有人用过这个键。
	if res.RowsAffected == 0 {
		// 说明唯一键冲突 → 之前已经有人用过这个键。
		var existing model.IdempotencyKey
		if err := s.db.WithContext(ctx).
			Where("user_id = ? AND endpoint = ? AND key = ?", userID, endpoint, key).
			First(&existing).Error; err != nil {
			return IdempotencyResult{}, err
		}
		if existing.RequestHash != hash {
			return IdempotencyResult{}, fmt.Errorf("%w: 同一幂等键对应了不同的请求体", ErrIdempotencyConflict)
		}
		if existing.ResponseCode == 0 {
			return IdempotencyResult{}, fmt.Errorf("%w: 同键请求正在处理中", ErrIdempotencyInFlight)
		}
		var body any
		if len(existing.ResponseBody) > 0 {
			_ = json.Unmarshal(existing.ResponseBody, &body)
		}
		return IdempotencyResult{Replayed: true, Body: body, Status: existing.ResponseCode}, nil
	}

	// 首次执行者：执行并落结果。
	body, err := fn(ctx)
	if err != nil {
		// 失败要清掉占位，否则客户端无法原样重试。
		_ = s.db.WithContext(ctx).Where("id = ?", row.ID).Delete(&model.IdempotencyKey{}).Error
		return IdempotencyResult{}, err
	}
	raw, _ := json.Marshal(body)
	if status == 0 {
		status = 200
	}
	_ = s.db.WithContext(ctx).Model(&model.IdempotencyKey{}).Where("id = ?", row.ID).
		Updates(map[string]any{"response_code": status, "response_body": raw}).Error
	return IdempotencyResult{Body: body, Status: status}, nil
}

// PurgeIdempotency 清理过期幂等记录（可由定时任务调用）。
func (s *Service) PurgeIdempotency(ctx context.Context) (int64, error) {
	res := s.db.WithContext(ctx).
		Where("created_at < ?", time.Now().Add(-IdempotencyTTL)).
		Delete(&model.IdempotencyKey{})
	return res.RowsAffected, res.Error
}

func trimKey(key string) string {
	out := make([]rune, 0, len(key))
	for _, r := range key {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			continue
		}
		out = append(out, r)
	}
	if len(out) > 160 {
		out = out[:160]
	}
	return string(out)
}

// ensure gorm imported for interface check.
var _ = gorm.ErrRecordNotFound
