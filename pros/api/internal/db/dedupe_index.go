package db

import (
	"fmt"
	"log"
	"strings"

	"gorm.io/gorm"
)

// ensureBaseDedupeIndexes 清理**定义完全相同**的重复索引。
//
// 背景：历史上多次表改名（`base_record` → `base_records` 等），
// 每个旧名 / 新名都建了一份索引，改名后两份定义一模一样，
// 于是每次插记录 / 插投影都要多维护 2~3 个索引 —— 纯写放大。
//
// 实测（pg_indexes）重复项：
//
//	base_records        idx_base_record_created_by   ≡ idx_base_records_created_by
//	base_records        idx_base_record_deleted_at   ≡ idx_base_records_deleted_at
//	base_records        idx_base_record_updated_by   ≡ idx_base_records_updated_by
//	base_records        idx_base_records_tenant       ≡ idx_base_records_tenant_id
//	base_record_values  idx_base_record_values_tenant ≡ idx_base_record_values_tenant_id
//	base_tables         idx_base_table_deleted_at     ≡ idx_base_tables_deleted_at
//	base_tables         idx_base_tables_tenant        ≡ idx_base_tables_tenant_id
//	base_fields         idx_base_fields_tenant        ≡ idx_base_fields_tenant_id
//	base_apps           idx_base_app_deleted_at        ≡ idx_base_apps_deleted_at
//	kb_documents        idx_canvas_documents_deleted_at ≡ idx_kb_documents_deleted_at
//	kb_nodes            idx_knowledge_nodes_created_by  ≡ idx_kb_nodes_created_by
//
// 保留规则：保留**符合命名规范**的那一个（`idx_<域>_<实体>_<列>`，即
// 索引名以 `idx_<表名>_` 开头），其余同定义索引删除。
//
// 为什么要放在 ensure*Schema 而不是手工改线上库：
//   - 线上库 / 预发库 / 新库都要一致；
//   - 幂等，重复执行不会报错；
//   - 删除语句走 `DROP INDEX IF EXISTS`，不存在也不影响启动。
//
// 失败只记日志不阻断启动：重复索引只是慢一点，不该让服务起不来。
func ensureBaseDedupeIndexes(gdb *gorm.DB) error {
	if !gdb.Migrator().HasTable("base_records") {
		return nil
	}
	type idxRow struct {
		TableName string `gorm:"column:tablename"`
		IndexName string `gorm:"column:indexname"`
		IndexDef  string `gorm:"column:indexdef"`
	}
	var rows []idxRow
	// 覆盖**当前 schema 的所有表**：改名残留不止发生在 base_*，
	// kb_documents（idx_canvas_documents_*）、kb_nodes（idx_knowledge_nodes_*）、
	// base_apps（idx_base_app_*）都有同义重复索引。
	if err := gdb.Raw(`SELECT tablename, indexname, indexdef
		FROM pg_indexes
		WHERE schemaname = current_schema()
		  AND indexname NOT LIKE '%_pkey'`).Scan(&rows).Error; err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	// 同一个表 + 同一个定义 = 重复。
	groups := map[string][]idxRow{}
	for _, r := range rows {
		// 唯一索引（pkey / unique）不参与去重：它们承担约束语义。
		if strings.Contains(r.IndexDef, " UNIQUE ") {
			continue
		}
		// indexdef 里**带着索引名**（`CREATE INDEX <name> ON ...`），
		// 直接拿它当分组键的话两个同义索引永远分不到一组。
		// 这里把索引名从定义里抹掉，只留「表 + 列 + 方法」这一层语义。
		norm := strings.Replace(r.IndexDef, "INDEX "+r.IndexName+" ", "INDEX ", 1)
		key := r.TableName + "|" + norm
		groups[key] = append(groups[key], r)
	}
	for _, group := range groups {
		if len(group) < 2 {
			continue
		}
		// 保留符合命名规范的索引（idx_<表名>_…），其它删除。
		//
		// 同一组里可能有多个都符合前缀（如 idx_base_records_tenant 与
		// idx_base_records_tenant_id），此时取**名字最短**的那个 ——
		// 规范是 idx_<域>_<实体>_<列>，列名越具体说明是历史冗余（如 _id 后缀）。
		keep := ""
		for _, r := range group {
			if !strings.HasPrefix(r.IndexName, "idx_"+r.TableName+"_") {
				continue
			}
			if keep == "" || len(r.IndexName) < len(keep) ||
				(len(r.IndexName) == len(keep) && r.IndexName < keep) {
				keep = r.IndexName
			}
		}
		if keep == "" {
			// 全都不符合规范 → 保留第一个（按 pg_indexes 返回顺序，稳定可复现）。
			keep = group[0].IndexName
		}
		for _, r := range group {
			if r.IndexName == keep {
				continue
			}
			stmt := fmt.Sprintf(`DROP INDEX IF EXISTS "%s"`, r.IndexName)
			if err := gdb.Exec(stmt).Error; err != nil {
				log.Printf("ensureBaseDedupeIndexes: 删除重复索引 %s 失败：%v", r.IndexName, err)
				continue
			}
			log.Printf("ensureBaseDedupeIndexes: 已删除重复索引 %s（保留 %s）", r.IndexName, keep)
		}
	}
	return nil
}
