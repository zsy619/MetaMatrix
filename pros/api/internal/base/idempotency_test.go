package base

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// idempotencyKeySQLite 是 core_idempotency_keys 的 SQLite 影子模型。
type idempotencyKeySQLite struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProjectID    uuid.UUID `gorm:"type:uuid;not null"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:1"`
	Endpoint     string    `gorm:"type:varchar(160);not null;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:2"`
	Key          string    `gorm:"type:varchar(160);not null;uniqueIndex:uniq_core_idem_user_endpoint_key,priority:3"`
	RequestHash  string    `gorm:"type:char(64);not null"`
	ResponseCode int       `gorm:"not null;default:0"`
	ResponseBody string    `gorm:"type:text;not null;default:'{}'"`
	CreatedAt    time.Time `gorm:"type:datetime;not null"`
	UpdatedAt    time.Time `gorm:"type:datetime;not null"`
}

func (idempotencyKeySQLite) TableName() string { return "core_idempotency_keys" }

func newIdempotencyFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:idem-"+uuid.NewString()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(&idempotencyKeySQLite{}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	userID := uuid.New()
	projectID := uuid.New()
	return NewService(db), userID, projectID
}

// A2：同键同体 → 只执行一次，第二次回放。
func TestIdempotentReplaysSameRequest(t *testing.T) {
	svc, userID, projectID := newIdempotencyFixture(t)
	ctx := context.Background()
	calls := 0
	payload := map[string]any{"rows": []string{"a"}}
	fn := func(ctx context.Context) (any, error) {
		calls++
		return map[string]any{"created": calls}, nil
	}

	first, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-1", payload, 200, fn)
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	if first.Replayed {
		t.Fatal("first call must not be a replay")
	}
	second, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-1", payload, 200, fn)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}
	if !second.Replayed {
		t.Fatal("second call must be a replay")
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 execution, got %d", calls)
	}
}

// A2：同键异体 → 40901（ErrIdempotencyConflict），不执行。
func TestIdempotentRejectsDifferentBody(t *testing.T) {
	svc, userID, projectID := newIdempotencyFixture(t)
	ctx := context.Background()
	calls := 0
	fn := func(ctx context.Context) (any, error) {
		calls++
		return map[string]any{"ok": true}, nil
	}
	if _, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-2",
		map[string]any{"rows": []string{"a"}}, 200, fn); err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	_, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-2",
		map[string]any{"rows": []string{"b"}}, 200, fn)
	if err == nil {
		t.Fatal("expected idempotency conflict")
	}
	if calls != 1 {
		t.Fatalf("conflicting request must not execute, calls=%d", calls)
	}
}

// A2：不同用户的同一个 key 互不影响。
func TestIdempotentIsolatesUsers(t *testing.T) {
	svc, userID, projectID := newIdempotencyFixture(t)
	ctx := context.Background()
	other := uuid.New()
	calls := 0
	fn := func(ctx context.Context) (any, error) {
		calls++
		return map[string]any{"ok": true}, nil
	}
	payload := map[string]any{"x": 1}
	if _, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "shared-key", payload, 200, fn); err != nil {
		t.Fatalf("user A failed: %v", err)
	}
	out, err := svc.Idempotent(ctx, other, projectID, "base.batchRecords", "shared-key", payload, 200, fn)
	if err != nil {
		t.Fatalf("user B failed: %v", err)
	}
	if out.Replayed {
		t.Fatal("different user must not replay another user's result")
	}
	if calls != 2 {
		t.Fatalf("expected 2 executions, got %d", calls)
	}
}

// A2：空幂等键 → 直接执行，不落库。
func TestIdempotentWithoutKeyJustRuns(t *testing.T) {
	svc, userID, projectID := newIdempotencyFixture(t)
	ctx := context.Background()
	calls := 0
	fn := func(ctx context.Context) (any, error) {
		calls++
		return nil, nil
	}
	for i := 0; i < 2; i++ {
		if _, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "  ", nil, 200, fn); err != nil {
			t.Fatalf("run failed: %v", err)
		}
	}
	if calls != 2 {
		t.Fatalf("expected 2 executions, got %d", calls)
	}
	var count int64
	svc.db.Model(&idempotencyKeySQLite{}).Count(&count)
	if count != 0 {
		t.Fatalf("expected no idempotency rows, got %d", count)
	}
}

// A2：首次执行失败 → 清掉占位，允许原样重试。
func TestIdempotentAllowsRetryAfterFailure(t *testing.T) {
	svc, userID, projectID := newIdempotencyFixture(t)
	ctx := context.Background()
	calls := 0
	fn := func(ctx context.Context) (any, error) {
		calls++
		if calls == 1 {
			return nil, ErrFieldValueInvalid
		}
		return map[string]any{"ok": true}, nil
	}
	payload := map[string]any{"x": 1}
	if _, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-3", payload, 200, fn); err == nil {
		t.Fatal("expected first call to fail")
	}
	out, err := svc.Idempotent(ctx, userID, projectID, "base.batchRecords", "key-3", payload, 200, fn)
	if err != nil {
		t.Fatalf("retry failed: %v", err)
	}
	if out.Replayed {
		t.Fatal("retry after failure must execute again")
	}
	if calls != 2 {
		t.Fatalf("expected 2 executions, got %d", calls)
	}
}
