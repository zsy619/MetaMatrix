package db

import (
	"log"

	"gorm.io/gorm"
)

// ensureBaseValueUniqueIndex 保证投影表 base_record_values 的
// **(record_id, field_id) 唯一**。
//
// 为什么需要这条约束：
//
//  1. 排序 / 分组的 LEFT JOIN 建立在 (record_id, field_id) 上。
//     一旦出现重复投影行，同一条记录会被 JOIN 出来多次 ——
//     列表里出现重复行、窗口计数（COUNT(*) OVER ()）虚高。
//  2. 查询侧现在把「统计 + 取数」合并成一次扫描（窗口函数），
//     这要求 JOIN 严格 1:1，否则 total 与实际行数对不上。
//
// 投影是**派生数据**（可以从 base_records.data 重建），
// 所以发现重复行时直接删掉多余的（保留 id 最小的一条），不会丢业务数据。
//
// 幂等：重复执行不会报错；失败只记日志不阻断启动 ——
// 唯一索引缺失只是让统计退回「独立 COUNT」，功能不受影响。
func ensureBaseValueUniqueIndex(gdb *gorm.DB) error {
	if !gdb.Migrator().HasTable("base_record_values") {
		return nil
	}
	// 1) 先清重复行：同一 (record_id, field_id) 只留 id 最小的一条。
	//
	// 用 ctid 比对而不是 id —— 老库里投影行的 id 不一定唯一
	//（历史上有随机 id 的写入路径），ctid 是物理行号，一定唯一。
	dedupe := `
		DELETE FROM base_record_values a
		USING base_record_values b
		WHERE a.record_id = b.record_id
		  AND a.field_id = b.field_id
		  AND a.ctid > b.ctid`
	if err := gdb.Exec(dedupe).Error; err != nil {
		return err
	}
	// 2) 建唯一索引：之后任何写入路径都不可能再插出重复投影。
	if err := gdb.Exec(
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_base_record_values_record_field
		 ON base_record_values (record_id, field_id)`,
	).Error; err != nil {
		return err
	}
	log.Printf("db: base_record_values unique index on (record_id, field_id) ensured")
	return nil
}
