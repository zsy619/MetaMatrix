package base

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// 批量创建的语义契约（对应本轮把「批量写入」从 18 秒优化到 1 秒内的改造）：
//
//  1. 全部合法行都要写进去，且 sort_order 互不重复（排序位是 keyset 翻页的锚点）；
//  2. 单行非法只让**这一行**失败，同批其它行照常写入（部分成功语义）；
//  3. 跨块（超过 baseBatchChunk 行）也要保证排序位连续且不重复。
func TestBatchCreatePartialWritesAllRowsAndKeepsSortOrderUnique(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	// 超过一个分块（50 行），验证跨块行为。
	total := baseBatchChunk + 7
	items := make([]RecordInput, 0, total)
	for i := 0; i < total; i++ {
		items = append(items, RecordInput{Fields: map[string]any{fieldID: i}})
	}

	rows, failures := svc.BatchCreatePartial(ctx, userID, projectID, tableID, items)
	if len(failures) != 0 {
		t.Fatalf("expected no failures, got %d: %v", len(failures), failures)
	}
	if len(rows) != total {
		t.Fatalf("expected %d rows, got %d", total, len(rows))
	}

	// 库里真实落库的行数必须一致。
	var count int64
	if err := svc.db.Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", tableID).Count(&count).Error; err != nil {
		t.Fatalf("count records failed: %v", err)
	}
	if count != int64(total) {
		t.Fatalf("expected %d records in db, got %d", total, count)
	}

	// sort_order 必须互不重复：重复会让 keyset 翻页漏行 / 重复吐行。
	var dupes int64
	if err := svc.db.Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", tableID).
		Group("sort_order").Having("COUNT(*) > 1").Count(&dupes).Error; err != nil {
		t.Fatalf("check duplicated sort_order failed: %v", err)
	}
	if dupes > 0 {
		t.Fatalf("found %d duplicated sort_order values", dupes)
	}

	// 查询出来必须是 total 条且顺序稳定。
	res, err := svc.Query(ctx, userID, projectID, QueryRequest{TableID: tableID.String(), PageSize: total + 10})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if len(res.Records) != total {
		t.Fatalf("expected %d records from query, got %d", total, len(res.Records))
	}
}

// 单行非法不能让整批失败：同批其它行必须照常写入。
func TestBatchCreatePartialKeepsGoodRowsWhenOneRowInvalid(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	items := []RecordInput{
		{Fields: map[string]any{fieldID: 1}},
		{Fields: map[string]any{fieldID: 2}},
		// 字段 ID 非法 → 这一行必须失败，其余行不受影响。
		{Fields: map[string]any{"not-a-uuid": 3}},
		{Fields: map[string]any{fieldID: 4}},
	}

	rows, failures := svc.BatchCreatePartial(ctx, userID, projectID, tableID, items)
	if len(failures) != 1 {
		t.Fatalf("expected exactly 1 failure, got %d: %v", len(failures), failures)
	}
	if len(rows) != 3 {
		t.Fatalf("expected 3 successful rows, got %d", len(rows))
	}

	var count int64
	if err := svc.db.Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", tableID).Count(&count).Error; err != nil {
		t.Fatalf("count records failed: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 records in db, got %d", count)
	}
}

// 批量写入的投影必须齐全：一条记录的所有可索引字段都要进 base_record_values，
// 否则「按字段筛选 / 排序」会查不到刚写进去的数据。
func TestBatchCreatePartialSyncsProjections(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	items := []RecordInput{
		{Fields: map[string]any{fieldID: 10}},
		{Fields: map[string]any{fieldID: 20}},
	}
	rows, failures := svc.BatchCreatePartial(ctx, userID, projectID, tableID, items)
	if len(failures) != 0 {
		t.Fatalf("unexpected failures: %v", failures)
	}
	for _, row := range rows {
		var proj int64
		if err := svc.db.Model(&BaseRecordValue{}).
			Where("record_id = ? AND field_id = ?", row.ID, fieldID).Count(&proj).Error; err != nil {
			t.Fatalf("count projections failed: %v", err)
		}
		if proj != 1 {
			t.Fatalf("record %s: expected 1 projection row, got %d", row.ID, proj)
		}
	}
}

// BatchCreate 是「全成功或全失败」语义：有一行非法就整批不落库。
func TestBatchCreateIsAllOrNothing(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	items := []RecordInput{
		{Fields: map[string]any{fieldID: 1}},
		{Fields: map[string]any{"bad-id": 2}},
	}
	if _, err := svc.BatchCreate(ctx, userID, projectID, tableID, items); err == nil {
		t.Fatal("expected error for invalid row")
	}

	var count int64
	if err := svc.db.Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", tableID).Count(&count).Error; err != nil {
		t.Fatalf("count records failed: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected 0 records after failed batch, got %d", count)
	}
}

// 分块大小是性能与锁粒度的折中，锁死它避免被无意改大。
func TestBaseBatchChunkIsBounded(t *testing.T) {
	if baseBatchChunk <= 0 || baseBatchChunk > 200 {
		t.Fatalf("baseBatchChunk = %d, want 1..200", baseBatchChunk)
	}
}

// 记录 ID 必须唯一（批量插入时不能复用同一个 UUID）。
func TestBatchCreatePartialGeneratesUniqueIDs(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	items := make([]RecordInput, 0, 20)
	for i := 0; i < 20; i++ {
		items = append(items, RecordInput{Fields: map[string]any{fieldID: i}})
	}
	rows, failures := svc.BatchCreatePartial(ctx, userID, projectID, tableID, items)
	if len(failures) != 0 {
		t.Fatalf("unexpected failures: %v", failures)
	}
	seen := map[uuid.UUID]bool{}
	for _, row := range rows {
		if seen[row.ID] {
			t.Fatalf("duplicated record id %s", row.ID)
		}
		seen[row.ID] = true
	}
}
