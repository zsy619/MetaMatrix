package base

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestBatchCreateUnderTightPoolDoesNotDeadlock 是「批量写入死锁」的回归用例。
//
// 旧实现的批量写入会在**事务内**再发起查询（解析权限身份 / 校验字段值），
// 这些查询走的是连接池里的**另一条**连接：
//
//	事务占 1 条 + 查询再要 1 条 = 每个请求占 2 条
//
// 并发一上来就把连接池打满 → 所有请求互相等待 → 整体卡死
// （线上表现：批量写入接口长时间不返回，数据库里一排 idle in transaction）。
//
// 这里把连接池压到 4 条、并发 8 个批量请求：
// 修复前必然超时，修复后（事务内只有纯写入语句）必须全部完成。
func TestBatchCreateUnderTightPoolDoesNotDeadlock(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	// 把服务用的连接池压到 4 条 —— 旧实现在这个水位上必然死锁。
	sqlDB, err := f.db.DB()
	if err != nil {
		t.Fatalf("取连接池失败：%v", err)
	}
	sqlDB.SetMaxOpenConns(4)
	sqlDB.SetMaxIdleConns(4)

	const workers = 8
	const rows = 20

	var wg sync.WaitGroup
	errs := make([]error, workers)
	counts := make([]int, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			items := make([]RecordInput, 0, rows)
			for j := 0; j < rows; j++ {
				items = append(items, RecordInput{Fields: map[string]any{
					f.fieldA.String(): fmt.Sprintf("w%d-r%d", i, j),
				}})
			}
			out, err := f.svc.BatchCreate(ctx, f.userA, f.projectID, f.tableID, items)
			errs[i] = err
			counts[i] = len(out)
		}(i)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatalf("批量写入在 30 秒内没有完成 —— 连接池被打满导致死锁")
	}

	for i := 0; i < workers; i++ {
		if errs[i] != nil {
			t.Fatalf("第 %d 个批量写入失败：%v", i, errs[i])
		}
		if counts[i] != rows {
			t.Fatalf("第 %d 个批量写入应写入 %d 行，实际 %d 行", i, rows, counts[i])
		}
	}

	// 行数必须真的落库（不能只返回成功）。
	var total int64
	if err := f.db.Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", f.tableID).Count(&total).Error; err != nil {
		t.Fatalf("统计记录数失败：%v", err)
	}
	if total != workers*rows {
		t.Fatalf("库里应有 %d 行，实际 %d 行", workers*rows, total)
	}
}

// TestBatchCreatePartialUnderTightPoolDoesNotDeadlock 是「部分成功批量写入」的同类回归用例。
func TestBatchCreatePartialUnderTightPoolDoesNotDeadlock(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	sqlDB, err := f.db.DB()
	if err != nil {
		t.Fatalf("取连接池失败：%v", err)
	}
	sqlDB.SetMaxOpenConns(4)
	sqlDB.SetMaxIdleConns(4)

	const workers = 8
	const rows = 20

	var wg sync.WaitGroup
	counts := make([]int, workers)
	failures := make([]int, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			items := make([]RecordInput, 0, rows)
			for j := 0; j < rows; j++ {
				items = append(items, RecordInput{Fields: map[string]any{
					f.fieldA.String(): fmt.Sprintf("p%d-r%d", i, j),
				}})
			}
			out, fails := f.svc.BatchCreatePartial(ctx, f.userA, f.projectID, f.tableID, items)
			counts[i] = len(out)
			failures[i] = len(fails)
		}(i)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatalf("部分成功批量写入在 30 秒内没有完成 —— 连接池被打满导致死锁")
	}

	for i := 0; i < workers; i++ {
		if counts[i] != rows {
			t.Fatalf("第 %d 个批量写入应成功 %d 行，实际 %d 行（失败 %d）", i, rows, counts[i], failures[i])
		}
		if failures[i] != 0 {
			t.Fatalf("第 %d 个批量写入不应有失败行，实际 %d 条", i, failures[i])
		}
	}
}

// TestBatchWriteSortOrderIsUniqueWithinRequest 校验同一批写入的排序位不重复。
//
// 排序位是 keyset 翻页的锚点（sort_order, id），批内重复会让「按顺序取」
// 的语义变得不可预期，因此批内必须唯一。
func TestBatchWriteSortOrderIsUniqueWithinRequest(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	const rows = 57 // 故意跨过 baseBatchChunk（50），验证分块后仍连续
	items := make([]RecordInput, 0, rows)
	for j := 0; j < rows; j++ {
		items = append(items, RecordInput{Fields: map[string]any{
			f.fieldA.String(): fmt.Sprintf("r%d", j),
		}})
	}
	out, err := f.svc.BatchCreate(ctx, f.userA, f.projectID, f.tableID, items)
	if err != nil {
		t.Fatalf("批量写入失败：%v", err)
	}
	if len(out) != rows {
		t.Fatalf("应写入 %d 行，实际 %d 行", rows, len(out))
	}

	type sortRow struct {
		SortOrder int64
		ID        uuid.UUID
	}
	var got []sortRow
	if err := f.db.Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", f.tableID).
		Order("sort_order ASC").Find(&got).Error; err != nil {
		t.Fatalf("查询排序位失败：%v", err)
	}
	seen := map[int64]bool{}
	for _, r := range got {
		if seen[r.SortOrder] {
			t.Fatalf("批内排序位重复：%d", r.SortOrder)
		}
		seen[r.SortOrder] = true
	}
}
