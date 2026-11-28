package base

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
)

// TestReindexTableCoversAllRecords 回归「投影重建只处理前 5000 行」。
//
// 旧实现 `reindexTableTx` 写死 `Limit(5000)` 且没有续跑游标，
// 第 5001 行以后记录的投影停留在旧结构 ——
// 典型症状是「字段类型迁移成功了，但后半张表的投影还是旧类型」，
// 数据与投影对不上。
//
// 本用例造 5200 条记录（超过旧上限），重建投影后校验：
//   - 每条记录都有投影；
//   - 投影条数 = 记录条数。
func TestReindexTableCoversAllRecords(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	const total = 5200
	// 批量插记录（走 SQL，不用服务层 —— 服务层一条一条太慢）。
	if err := f.db.Exec(fmt.Sprintf(`
		INSERT INTO base_records (id, tenant_id, table_id, sort_order, data, version, visibility, created_by, updated_by, created_at, updated_at)
		SELECT gen_random_uuid(), ?, ?, i, jsonb_build_object(?::text, '值-' || i), 1, 'space', ?, ?, now(), now()
		FROM generate_series(1, %d) i`, total),
		f.projectID, f.tableID, f.fieldA.String(), f.userA, f.userA).Error; err != nil {
		t.Fatalf("批量插入记录失败：%v", err)
	}

	var recordCount int64
	if err := f.db.Model(&BaseRecord{}).Where("table_id = ? AND deleted_at IS NULL", f.tableID).Count(&recordCount).Error; err != nil {
		t.Fatalf("统计记录失败：%v", err)
	}
	if recordCount != total {
		t.Fatalf("准备数据异常：records=%d want=%d", recordCount, total)
	}

	if err := f.svc.reindexTable(ctx, f.tableID, f.projectID); err != nil {
		t.Fatalf("重建投影失败：%v", err)
	}

	var valueCount int64
	if err := f.db.Model(&BaseRecordValue{}).Where("table_id = ? AND field_id = ?", f.tableID, f.fieldA).Count(&valueCount).Error; err != nil {
		t.Fatalf("统计投影失败：%v", err)
	}
	if valueCount != total {
		t.Fatalf("投影应覆盖全部 %d 条记录，实际只有 %d 条（旧实现的 5000 行上限会截断）", total, valueCount)
	}
}

// TestIterateRecordsByCursorVisitsAll 校验游标遍历不重不漏。
func TestIterateRecordsByCursorVisitsAll(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	const total = 1200
	if err := f.db.Exec(fmt.Sprintf(`
		INSERT INTO base_records (id, tenant_id, table_id, sort_order, data, version, visibility, created_by, updated_by, created_at, updated_at)
		SELECT gen_random_uuid(), ?, ?, i, '{}'::jsonb, 1, 'space', ?, ?, now(), now()
		FROM generate_series(1, %d) i`, total),
		f.projectID, f.tableID, f.userA, f.userA).Error; err != nil {
		t.Fatalf("批量插入记录失败：%v", err)
	}

	seen := map[uuid.UUID]bool{}
	if err := iterateRecordsByCursor(f.db.WithContext(ctx), f.tableID, false, func(chunk []BaseRecord) error {
		for _, r := range chunk {
			if seen[r.ID] {
				t.Fatalf("记录重复访问：%s", r.ID)
			}
			seen[r.ID] = true
		}
		return nil
	}); err != nil {
		t.Fatalf("游标遍历失败：%v", err)
	}
	if len(seen) != total {
		t.Fatalf("应遍历到 %d 条记录，实际 %d 条", total, len(seen))
	}
}
