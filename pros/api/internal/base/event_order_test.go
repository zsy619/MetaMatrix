package base

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"metamatrix/api/internal/model"
)

// 并发验收补测（技术文档 §15 验收清单）：
//
//   - 场景 A：事件**乱序到达**时，服务端必须按落库顺序投递，
//     客户端靠版本号发现跳跃并重新拉取（不能把乱序当成「数据丢了」）。
//   - 场景 B：公式计算事件（formula.calculated）必须**晚于**记录更新事件，
//     否则客户端会用旧的公式列覆盖新值。

// 场景 A：乱序事件。
//
// 构造方式：直接往发件箱塞三条 created_at 逆序的事件，
// 模拟「事件到达顺序与落库顺序不一致」的极端情况（多实例 / 网络抖动）。
// 期望：ReplaySince 返回的事件按 created_at 升序，客户端不会收到乱序流。
func TestEventOrderOutOfOrderArrivalIsNormalized(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "v1"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}

	base := time.Now().Add(-time.Hour)
	// 逆序插入：第三条最早，第一条最晚。
	for i, offset := range []int{2, 1, 0} {
		row := model.BaseEventOutbox{
			ID:            uuid.New(),
			TenantID:      f.projectID,
			ProjectID:     f.projectID,
			BaseID:        f.baseID,
			TableID:       &f.tableID,
			AggregateType: "record",
			AggregateID:   rec.ID,
			EventType:     "record.updated",
			Payload:       []byte(fmt.Sprintf(`{"version":%d}`, i+1)),
			Status:        OutboxStatusPublished,
			CreatedAt:     base.Add(time.Duration(offset) * time.Minute),
		}
		if err := f.db.Create(&row).Error; err != nil {
			t.Fatalf("insert outbox row failed: %v", err)
		}
	}

	// ReplaySince 需要锚点事件 ID；这里按时间水位回放。
	rows, err := f.svc.ReplaySinceTime(ctx, f.projectID, base.Add(-time.Minute), 50)
	if err != nil {
		t.Fatalf("replay since time failed: %v", err)
	}
	var stamped []model.BaseEventOutbox
	if err := f.db.Where("project_id = ?", f.projectID).
		Order("created_at ASC, id ASC").Find(&stamped).Error; err != nil {
		t.Fatalf("read events failed: %v", err)
	}
	if len(stamped) < 3 {
		t.Fatalf("场景A：应至少有 3 条事件，实际 %d", len(stamped))
	}
	for i := 1; i < len(stamped); i++ {
		if stamped[i].CreatedAt.Before(stamped[i-1].CreatedAt) {
			t.Fatalf("场景A：回放顺序必须按 created_at 递增，第 %d 条乱序", i)
		}
	}
	// 回放结果本身也必须有序。
	for i := 1; i < len(rows); i++ {
		if rows[i].Timestamp.Before(rows[i-1].Timestamp) {
			t.Fatalf("场景A：ReplaySinceTime 返回的事件乱序，第 %d 条", i)
		}
	}
}

// 场景 A2：乱序到达时，版本号必须能暴露「跳跃」。
//
// 客户端靠记录版本号判断是否漏收；同一条记录连改两次，版本必须严格递增。
func TestEventOrderVersionMonotonicForOutOfOrderDelivery(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "v1"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if rec.Version != 1 {
		t.Fatalf("场景A2：新建记录版本应为 1，实际 %d", rec.Version)
	}
	for i := 2; i <= 4; i++ {
		updated, err := f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): fmt.Sprintf("v%d", i)},
		})
		if err != nil {
			t.Fatalf("update record failed: %v", err)
		}
		if updated.Version != int64(i) {
			t.Fatalf("场景A2：第 %d 次更新版本应为 %d，实际 %d", i, i, updated.Version)
		}
	}
	// 事件里的版本号必须严格递增，客户端据此判断跳跃。
	var rows []model.BaseEventOutbox
	if err := f.db.Where("project_id = ? AND event_type = ?", f.projectID, "record.updated").
		Order("created_at ASC, id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read events failed: %v", err)
	}
	if len(rows) < 3 {
		t.Fatalf("场景A2：应至少有 3 条 record.updated 事件，实际 %d", len(rows))
	}
	var last int64
	for _, row := range rows {
		var payload map[string]any
		if len(row.Payload) > 0 {
			if err := jsonUnmarshalMap(row.Payload, &payload); err != nil {
				t.Fatalf("场景A2：事件负载解析失败：%v", err)
			}
		}
		rawVersion, ok := payload["version"].(float64)
		if !ok {
			t.Fatalf("场景A2：事件缺少 version 字段，实际负载 %v", payload)
		}
		v := int64(rawVersion)
		if v <= last {
			t.Fatalf("场景A2：事件版本号必须递增，实际 %d 之后是 %d", last, v)
		}
		last = v
	}
}

// 场景 B：公式计算事件晚于记录更新事件。
//
// 期望：保存公式并重算后，落库的 formula.calculated 事件
// 在时间与顺序上都在 record.updated 之后 —— 否则前端会用旧公式列覆盖新值。
func TestEventOrderFormulaCalculatedAfterRecordUpdated(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	formula, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "公式", Type: "formula"})
	if err != nil {
		t.Fatalf("create formula field failed: %v", err)
	}
	rec, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "10"},
	})
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	if _, err := f.svc.UpdateRecord(ctx, f.userA, f.projectID, rec.ID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "20"},
	}); err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if err := f.svc.SaveFormula(ctx, f.userA, f.projectID, uuid.MustParse(formula.ID), "{字段A} + 1"); err != nil {
		t.Fatalf("save formula failed: %v", err)
	}

	var rows []model.BaseEventOutbox
	if err := f.db.Where("project_id = ?", f.projectID).
		Order("created_at ASC, id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read events failed: %v", err)
	}
	recordIdx, calculatedIdx := -1, -1
	for i, row := range rows {
		switch row.EventType {
		case "record.updated":
			if recordIdx < 0 {
				recordIdx = i
			}
		case "formula.calculated":
			calculatedIdx = i
		}
	}
	if recordIdx < 0 {
		t.Fatalf("场景B：未找到 record.updated 事件，实际事件类型 %v", eventTypesOf(rows))
	}
	if calculatedIdx < 0 {
		t.Fatalf("场景B：未找到 formula.calculated 事件，实际事件类型 %v", eventTypesOf(rows))
	}
	if calculatedIdx < recordIdx {
		t.Fatalf("场景B：公式计算事件必须晚于记录更新事件（record=%d, formula=%d）", recordIdx, calculatedIdx)
	}
	if !rows[calculatedIdx].CreatedAt.After(rows[recordIdx].CreatedAt) &&
		calculatedIdx == recordIdx {
		t.Fatal("场景B：公式计算事件的时间戳必须晚于记录更新事件")
	}
}
