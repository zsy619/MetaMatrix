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

// 死信重投（P2-14）。
//
// 关键回归点：发布器按「时间 + ID」水位单调前进，已经读过的行不会再被读到。
// 因此「把 status 改回 pending」是不够的 —— 必须同时刷新 created_at，
// 否则死信会永远卡在 pending 里，实际永远不会被重新投递。
func TestDeadLetterRetryIsActuallyRedelivered(t *testing.T) {
	url := concDatabaseURL()
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过死信重投用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres，跳过：%v", err)
	}
	schema := "deadltr_" + uuid.NewString()[:8]
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
	svc := NewService(db)
	projectID := uuid.New()
	baseID := uuid.New()
	eventID := uuid.New()

	// 造一条死信：状态 dead、重试次数已超限。
	old := time.Now().Add(-time.Hour)
	if err := db.Create(&model.BaseEventOutbox{
		ID:            eventID,
		TenantID:      projectID,
		ProjectID:     projectID,
		BaseID:        baseID,
		AggregateType: "record",
		EventType:     "record.updated",
		Payload:       []byte(`{"version":7}`),
		Status:        OutboxStatusDead,
		RetryCount:    99,
		CreatedAt:     old,
	}).Error; err != nil {
		t.Fatalf("insert dead letter failed: %v", err)
	}

	// 死信列表必须能查到它。
	dead, err := svc.ListDeadLetters(ctx, projectID, 50)
	if err != nil {
		t.Fatalf("list dead letters failed: %v", err)
	}
	found := false
	for _, row := range dead {
		if row.ID == eventID {
			found = true
		}
	}
	if !found {
		t.Fatal("死信列表里找不到刚写入的死信")
	}

	// 重投。
	if err := svc.RetryDeadLetter(ctx, eventID); err != nil {
		t.Fatalf("retry dead letter failed: %v", err)
	}
	var row model.BaseEventOutbox
	if err := db.Where("id = ?", eventID).First(&row).Error; err != nil {
		t.Fatalf("reload failed: %v", err)
	}
	if row.Status != "pending" {
		t.Fatalf("status after retry = %q, want pending", row.Status)
	}
	if row.RetryCount != 0 {
		t.Fatalf("retry count after retry = %d, want 0", row.RetryCount)
	}
	if !row.CreatedAt.After(old) {
		t.Fatalf("created_at 未刷新（%v），重投后事件仍在水位窗口之外，永远不会被投递", row.CreatedAt)
	}

	// 关键断言：重投后订阅者真的能收到这条事件。
	sub, cancel := svc.Events().Subscribe(projectID)
	defer cancel()
	svc.advanceOutboxCursor(time.Now().Add(-time.Second), uuid.New())
	svc.publishPending(ctx)

	select {
	case ev := <-sub:
		if ev.EventID != eventID {
			t.Fatalf("event id = %v, want %v", ev.EventID, eventID)
		}
		if ev.EventType != "record.updated" {
			t.Fatalf("event type = %v, want record.updated", ev.EventType)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("重投后事件仍未被投递（水位窗口问题未修复）")
	}

	// 投递后状态应回到 published。
	if err := db.Where("id = ?", eventID).First(&row).Error; err != nil {
		t.Fatalf("reload after publish failed: %v", err)
	}
	if row.Status != OutboxStatusPublished {
		t.Fatalf("status after publish = %q, want published", row.Status)
	}
}
