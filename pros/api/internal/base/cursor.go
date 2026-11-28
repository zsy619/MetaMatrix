package base

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// recordChunkSize 是按游标分批遍历时的批大小。
//
// 取 500：一次取 500 行的 JSONB 数据大约几十 MB 以内，
// 不会把整表读进内存；往返次数也只有「行数 / 500」量级。
const recordChunkSize = 500

// iterateRecordsByCursor 按 **id 游标**分批遍历表内记录。
//
// 为什么不用 `Find(&records)`：
//   - 整表载入内存：5000 行 × 20 字段的 JSONB 直接把堆吃满，
//     更大的表会 OOM；
//   - 硬编码 `Limit(5000)`：第 5001 行以后的数据永远不会被处理，
//     典型症状是「类型迁移成功了，但第 5001 行以后投影还是旧结构」。
//
// 游标用 id（主键，天然有序且唯一），比 OFFSET 更稳：
// 遍历过程中写入 / 删除不会导致重复或漏行。
//
// fn 收到的每一批是**独立切片**，fn 可以安全地持有它。
func iterateRecordsByCursor(tx *gorm.DB, tableID uuid.UUID, includeDeleted bool, fn func([]BaseRecord) error) error {
	var cursor uuid.UUID
	for {
		q := tx.Where("table_id = ?", tableID)
		if !includeDeleted {
			q = q.Where("deleted_at IS NULL")
		}
		if cursor != uuid.Nil {
			q = q.Where("id > ?", cursor)
		}
		var chunk []BaseRecord
		if err := q.Order("id ASC").Limit(recordChunkSize).Find(&chunk).Error; err != nil {
			return err
		}
		if len(chunk) == 0 {
			return nil
		}
		if err := fn(chunk); err != nil {
			return err
		}
		cursor = chunk[len(chunk)-1].ID
		if len(chunk) < recordChunkSize {
			return nil
		}
	}
}

// iterateRecordIDsBySortOrder 按 **(sort_order, id)** 游标分批遍历记录，只取 ID 与排序位。
//
// 用于「重排」这类需要保持原相对次序的场景：
// 只取两列，不读 JSONB，内存占用与表大小无关。
//
// 旧的实现是 `Order("sort_order ASC, id ASC").Limit(5000)` ——
// 第 5001 条以后的记录被排除在重排之外，保留旧 sort_order，
// 可能与前 5000 条撞号 → 顺序错乱。
func iterateRecordIDsBySortOrder(tx *gorm.DB, tableID uuid.UUID, exclude []uuid.UUID, fn func([]uuid.UUID) error) error {
	var lastSortOrder int64
	var lastID uuid.UUID
	first := true
	for {
		q := tx.Model(&BaseRecord{}).
			Where("table_id = ? AND deleted_at IS NULL", tableID)
		if len(exclude) > 0 {
			q = q.Where("id NOT IN ?", exclude)
		}
		if !first {
			q = q.Where("(sort_order > ? OR (sort_order = ? AND id > ?))", lastSortOrder, lastSortOrder, lastID)
		}
		var chunk []BaseRecord
		if err := q.Order("sort_order ASC, id ASC").Limit(recordChunkSize).
			Select("id", "sort_order").Find(&chunk).Error; err != nil {
			return err
		}
		if len(chunk) == 0 {
			return nil
		}
		ids := make([]uuid.UUID, 0, len(chunk))
		for _, r := range chunk {
			ids = append(ids, r.ID)
		}
		if err := fn(ids); err != nil {
			return err
		}
		lastSortOrder = chunk[len(chunk)-1].SortOrder
		lastID = chunk[len(chunk)-1].ID
		first = false
		if len(chunk) < recordChunkSize {
			return nil
		}
	}
}
