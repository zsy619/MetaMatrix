package base

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"metamatrix/api/internal/model"
)

// 跨实例事件投递（P1-8）。
//
// 场景：多实例部署时，实例 A 产生的事件必须能被**连接到实例 B** 的订阅者收到。
//
// 机制：所有实例共用 `base_event_outboxes` 表作为事件总线；每个实例维护自己的
// `outboxCursor`（时间 + ID 二元水位），各自读全量并推给自己的订阅者。
// 关键点：实例 B 的水位**不依赖**实例 A 是否已把该事件标记为 published，
// 因此「A 先发过」不会导致 B 漏发。
func TestCrossInstanceEventDeliveredToOtherInstance(t *testing.T) {
	url := concDatabaseURL()
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过跨实例事件用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres，跳过：%v", err)
	}
	schema := "xinst_" + uuid.NewString()[:8]
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Skipf("无法创建临时 schema，跳过：%v", err)
	}
	t.Cleanup(func() { _ = admin.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`).Error })

	sep := "?"
	if len(url) > 0 && url[len(url)-1] == '?' {
		sep = ""
	}
	db, err := gorm.Open(postgres.Open(url+sep+"search_path="+schema),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open postgres failed: %v", err)
	}
	if err := db.AutoMigrate(&model.BaseEventOutbox{}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}

	ctx := context.Background()
	projectID := uuid.New()
	baseID := uuid.New()

	// 实例 A：产生事件并发布。
	instA := NewService(db)
	// 实例 B：只负责订阅与投递（模拟「用户连到了 B 这个实例」）。
	instB := NewService(db)

	// 两个实例都把水位对齐到「此刻」——与 StartOutboxPublisher 的启动行为一致。
	instA.advanceOutboxCursor(time.Now(), uuid.New())
	instB.advanceOutboxCursor(time.Now(), uuid.New())

	// 订阅者连在实例 B 上。
	sub, cancel := instB.Events().Subscribe(projectID)
	defer cancel()

	// 实例 A 写一条事件到共享 outbox（模拟业务事务提交事件）。
	eventID := uuid.New()
	if err := db.Create(&model.BaseEventOutbox{
		ID:            eventID,
		TenantID:      projectID,
		ProjectID:     projectID,
		BaseID:        baseID,
		AggregateType: "record",
		EventType:     "record.created",
		Payload:       []byte(`{"version":1}`),
		Status:        "pending",
		CreatedAt:     time.Now().Add(time.Millisecond),
	}).Error; err != nil {
		t.Fatalf("insert outbox failed: %v", err)
	}

	// 实例 B 拉取并投递（实例 A 也可以同时拉，但两边各自推进自己的水位）。
	instB.publishPending(ctx)

	select {
	case ev := <-sub:
		if ev.EventID != eventID {
			t.Fatalf("event id = %v, want %v", ev.EventID, eventID)
		}
		if ev.EventType != "record.created" {
			t.Fatalf("event type = %v, want record.created", ev.EventType)
		}
		if ev.ProjectID != projectID {
			t.Fatalf("event project = %v, want %v", ev.ProjectID, projectID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("实例 B 的订阅者在超时内没有收到实例 A 产生的事件")
	}

	// 水位必须单调推进：再拉一次不应重复投递同一条事件。
	instB.publishPending(ctx)
	select {
	case ev := <-sub:
		t.Fatalf("水位未推进，事件被重复投递：%v", ev.EventID)
	case <-time.After(300 * time.Millisecond):
	}
}
