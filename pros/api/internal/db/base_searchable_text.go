package db

import (
	"log"

	"gorm.io/gorm"
)

// ensureBaseSearchableText 给 JSON 型投影补上**可搜文本**（value_text）。
//
// 背景：附件 / 成员 / 关联记录这类字段的值是 JSON 数组，
// 关键字检索原来只能走 `value_json::text ILIKE ?` ——
// 每行都要把 JSONB 序列化成文本，而且走不了任何索引
//（`jsonb::text` 不是 IMMUTABLE，建不了表达式索引），
// 是整个检索路径上最贵的一段。
//
// 现在写入路径（`projectionRow`）会把可搜内容顺手落到 value_text，
// 这些字段就能跟着文本字段一起走 GIN 三值组索引。
//
// 但**存量行**是改造前写的，value_text 还是空的 —— 这里回填一次。
// 回填只动「value_text 为空且 value_json 非空」的行，幂等且代价可控。
func ensureBaseSearchableText(gdb *gorm.DB) error {
	if !gdb.Migrator().HasTable("base_record_values") {
		return nil
	}
	// JSON 数组 → 把数组里的文本元素拼起来（附件名 / 成员 ID / 关联记录 ID）。
	// 非数组形态（对象 / 单值）不在这里处理 —— 覆盖面小、风险低，
	// 真正需要时由「改字段 / 重建投影」路径补齐。
	backfill := `
		UPDATE base_record_values v
		SET value_text = COALESCE((
			SELECT string_agg(txt, ' ')
			FROM jsonb_array_elements_text(v.value_json) AS txt
			WHERE txt <> ''
		), '')
		WHERE v.value_text = ''
		  AND v.value_json IS NOT NULL
		  AND jsonb_typeof(v.value_json) = 'array'`
	if err := gdb.Exec(backfill).Error; err != nil {
		// 回填失败只记日志：功能不受影响，只是老的 JSON 字段搜不到。
		log.Printf("ensureBaseSearchableText warning: %v", err)
	}
	return nil
}
