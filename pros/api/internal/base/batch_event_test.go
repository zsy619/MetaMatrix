package base

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// TestBatchUpdateEmitsSingleBatchEvent 回归「批量写的事件风暴」。
//
// 旧实现每行都发一条 record.updated 事件：
// 100 行批量改 → 发件箱里 100 条事件，订阅端要处理 100 次。
// 现在改成「每块（≤50 行）一条 record.batch_updated」。
func TestBatchUpdateEmitsSingleBatchEvent(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	ids := make([]uuid.UUID, 0, 10)
	for i := 0; i < 10; i++ {
		row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "初值"},
		})
		if err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
		ids = append(ids, row.ID)
	}

	var before int64
	if err := f.db.Model(&BaseEventOutbox{}).Where("event_type = ?", "record.updated").Count(&before).Error; err != nil {
		t.Fatalf("统计事件失败：%v", err)
	}
	var totalBefore int64
	if err := f.db.Model(&BaseEventOutbox{}).Count(&totalBefore).Error; err != nil {
		t.Fatalf("统计事件总数失败：%v", err)
	}

	if _, err := f.svc.BatchUpdate(ctx, f.userA, f.projectID, f.tableID, ids,
		map[string]any{f.fieldA.String(): "新值"}); err != nil {
		t.Fatalf("批量更新失败：%v", err)
	}

	var updatedEvents int64
	if err := f.db.Model(&BaseEventOutbox{}).Where("event_type = ?", "record.updated").Count(&updatedEvents).Error; err != nil {
		t.Fatalf("统计事件失败：%v", err)
	}
	if updatedEvents != before {
		t.Fatalf("批量更新不应产生逐条 record.updated 事件：before=%d after=%d", before, updatedEvents)
	}
	var batchEvents int64
	if err := f.db.Model(&BaseEventOutbox{}).
		Where("event_type = ? AND aggregate_id = ?", "record.batch_updated", ids[0]).Count(&batchEvents).Error; err != nil {
		t.Fatalf("统计批量事件失败：%v", err)
	}
	if batchEvents < 1 {
		t.Fatalf("应产生 record.batch_updated 事件，实际 0 条")
	}
	// 关键断言：10 行批量改产生的事件条数必须是**常数级**，而不是每行一条。
	var totalAfter int64
	if err := f.db.Model(&BaseEventOutbox{}).Count(&totalAfter).Error; err != nil {
		t.Fatalf("统计事件总数失败：%v", err)
	}
	if delta := totalAfter - totalBefore; delta > 3 {
		t.Fatalf("批量更新 10 行不应产生超过 3 条事件，实际新增 %d 条（事件风暴）", delta)
	}
}
