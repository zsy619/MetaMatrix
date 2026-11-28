package base

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestKeywordSearchReturnsOnlyMatchingRecords 关键字检索的功能正确性。
//
// 覆盖两种执行路径：
//   - 「候选集快路径」：命中行数不超过上限时，直接用记录 ID 集合查；
//   - 「半连接回落路径」：命中面大时，用半连接查。
//
// 两条路径的结果必须一致 —— 候选集是「上限内即完整」的判断，
// 一旦判错就会漏记录。
func TestKeywordSearchReturnsOnlyMatchingRecords(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	mk := func(value string) uuid.UUID {
		row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): value},
		})
		if err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
		return row.ID
	}
	alpha := mk("alpha 公司")
	beta := mk("beta 公司")
	mk("gamma 公司")

	// 命中：只应返回 alpha。
	res, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID: f.tableID.String(), PageSize: 50, Keyword: "alpha",
	})
	if err != nil {
		t.Fatalf("关键字查询失败：%v", err)
	}
	if res.Total != 1 || len(res.Records) != 1 || res.Records[0].ID != alpha {
		t.Fatalf("关键字命中应只有 1 条，实际 total=%d rows=%d", res.Total, len(res.Records))
	}
	if beta == alpha {
		t.Fatalf("测试数据异常")
	}

	// 无命中：必须为空（候选集快路径会走「恒假条件」分支）。
	res, err = f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID: f.tableID.String(), PageSize: 50, Keyword: "zzz-不存在的词",
	})
	if err != nil {
		t.Fatalf("关键字查询失败：%v", err)
	}
	if res.Total != 0 || len(res.Records) != 0 {
		t.Fatalf("无命中应返回空集，实际 total=%d rows=%d", res.Total, len(res.Records))
	}

	// 子串命中（不是前缀）："公司" 应命中全部 3 条。
	res, err = f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID: f.tableID.String(), PageSize: 50, Keyword: "公司",
	})
	if err != nil {
		t.Fatalf("关键字查询失败：%v", err)
	}
	if res.Total != 3 || len(res.Records) != 3 {
		t.Fatalf("子串命中应返回 3 条，实际 total=%d rows=%d", res.Total, len(res.Records))
	}
}

// TestDeleteTableHardDeletesRecords 校验删表时记录是**硬删**。
//
// 旧实现是软删（留墓碑）：表都没了，这些记录永远没人读得到，
// 墓碑却一直占着堆与索引空间 —— 压测跑几轮就能堆出几十万条。
func TestDeleteTableHardDeletesRecords(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "待删除"},
		}); err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
	}
	// 先确认记录确实在库里。
	var live int64
	if err := f.db.Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", f.tableID).Count(&live).Error; err != nil {
		t.Fatalf("统计记录失败：%v", err)
	}
	if live != 3 {
		t.Fatalf("应有 3 条记录，实际 %d 条", live)
	}

	if err := f.svc.DeleteTable(ctx, f.userA, f.projectID, f.tableID); err != nil {
		t.Fatalf("删除数据表失败：%v", err)
	}

	// 含墓碑在内，一条都不能剩。
	var total int64
	if err := f.db.Unscoped().Model(&BaseRecord{}).
		Where("table_id = ?", f.tableID).Count(&total).Error; err != nil {
		t.Fatalf("统计残留记录失败：%v", err)
	}
	if total != 0 {
		t.Fatalf("删表后不应残留记录（含墓碑），实际 %d 条", total)
	}
	// 投影也要清干净。
	var values int64
	if err := f.db.Model(&BaseRecordValue{}).
		Where("table_id = ?", f.tableID).Count(&values).Error; err != nil {
		t.Fatalf("统计残留投影失败：%v", err)
	}
	if values != 0 {
		t.Fatalf("删表后不应残留投影，实际 %d 条", values)
	}
}

// TestPurgeTombstonedRecords 校验墓碑清理。
//
// 软删记录在保留期内不动；超过期限的连同投影一起物理删除。
func TestPurgeTombstonedRecords(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
		Fields: map[string]any{f.fieldA.String(): "待删除"},
	})
	if err != nil {
		t.Fatalf("创建记录失败：%v", err)
	}
	if err := f.svc.DeleteRecord(ctx, f.userA, f.projectID, row.ID); err != nil {
		t.Fatalf("删除记录失败：%v", err)
	}
	// 软删后仍有墓碑。
	var tombs int64
	if err := f.db.Unscoped().Model(&BaseRecord{}).Where("id = ?", row.ID).Count(&tombs).Error; err != nil {
		t.Fatalf("统计墓碑失败：%v", err)
	}
	if tombs != 1 {
		t.Fatalf("软删后应留下 1 条墓碑，实际 %d 条", tombs)
	}

	// 保留期 0 天 = 不清理。
	if n, err := f.svc.PurgeTombstonedRecords(ctx, 0); err != nil || n != 0 {
		t.Fatalf("保留期 0 时不应清理：n=%d err=%v", n, err)
	}
	// 保留期足够长时也不该动它（还在期限内）。
	if n, err := f.svc.PurgeTombstonedRecords(ctx, 30); err != nil || n != 0 {
		t.Fatalf("期限内不应清理：n=%d err=%v", n, err)
	}
	// 把墓碑时间往前推一天，再按 1 天保留期清理。
	if err := f.db.Unscoped().Model(&BaseRecord{}).Where("id = ?", row.ID).
		UpdateColumn("deleted_at", time.Now().AddDate(0, 0, -2)).Error; err != nil {
		t.Fatalf("调整墓碑时间失败：%v", err)
	}
	n, err := f.svc.PurgeTombstonedRecords(ctx, 1)
	if err != nil {
		t.Fatalf("清理墓碑失败：%v", err)
	}
	if n != 1 {
		t.Fatalf("应清理 1 条墓碑，实际 %d 条", n)
	}
	// 投影也要一起清掉。
	var values int64
	if err := f.db.Model(&BaseRecordValue{}).Where("record_id = ?", row.ID).Count(&values).Error; err != nil {
		t.Fatalf("统计投影失败：%v", err)
	}
	if values != 0 {
		t.Fatalf("墓碑清理后不应残留投影，实际 %d 条", values)
	}
}
