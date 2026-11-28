package db

import (
	"log"

	"gorm.io/gorm"
)

// ensureBaseDependencyIndex 给「谁依赖我」这条反查链路补上索引。
//
// 背景（A-06）：
//
//	引用 / 汇总字段（lookup / rollup）依赖的是**别的表**，
//	但这条依赖关系过去只存在字段配置 JSON 里（config->>'targetTableId'），
//	base_formula_dependencies 里只有公式字段的依赖。
//	结果是：每次「目标表写完之后重算依赖方」都要
//	把整个 Base 下所有表的字段索引逐个加载一遍才能判断谁依赖我 ——
//	表越多越慢，写入路径被拖住。
//
// 这里做两件事：
//
//  1. 建索引：
//     - base_fields ((config->>'targetTableId'))：反查「谁指向这张表」；
//     - base_formula_dependencies (dependency_table_id)：依赖图的反查维度。
//  2. 把存量 lookup / rollup 字段的跨表依赖**补写进依赖图**
//     （启动时回填一次，之后由字段增删改维护）。
//
// 回填用 SQL 直接做，不依赖业务层：字段配置里的 targetTableId 就是依赖边。
func ensureBaseDependencyIndex(gdb *gorm.DB) error {
	if !gdb.Migrator().HasTable("base_fields") {
		return nil
	}
	// 1) 依赖图的反查维度。
	if gdb.Migrator().HasTable("base_formula_dependencies") {
		if err := gdb.Exec(
			`CREATE INDEX IF NOT EXISTS idx_base_dep_dependency_table
			 ON base_formula_dependencies (dependency_table_id)`,
		).Error; err != nil {
			return err
		}
		// 依赖边唯一：回填与字段维护都靠它保证幂等
		//（没有唯一约束的话，每次启动回填都会再插一份）。
		if err := gdb.Exec(
			`DELETE FROM base_formula_dependencies a
			 USING base_formula_dependencies b
			 WHERE a.formula_field_id = b.formula_field_id
			   AND a.dependency_field_id = b.dependency_field_id
			   AND a.dependency_type = b.dependency_type
			   AND a.ctid > b.ctid`,
		).Error; err != nil {
			return err
		}
		if err := gdb.Exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS uniq_base_dep_formula_field_type
			 ON base_formula_dependencies (formula_field_id, dependency_field_id, dependency_type)`,
		).Error; err != nil {
			return err
		}
	}
	// 2) 字段配置里的目标表 —— 反查「谁依赖这张表」的主索引。
	//
	// 用表达式索引而不是全表扫：JSONB 里的这一项是反查的唯一入口。
	if err := gdb.Exec(
		`CREATE INDEX IF NOT EXISTS idx_base_field_target_table
		 ON base_fields ((config->>'targetTableId'))`,
	).Error; err != nil {
		return err
	}
	// 3) 回填跨表依赖边（lookup / rollup）。
	//
	// 只回填「引用 / 汇总」类型：公式字段的依赖在保存公式时已经写好了。
	// dependency_field_id 取目标字段，取不到就用 linkFieldId，
	// 再取不到就退化成零值 UUID（同一字段只会留下一行，语义不受影响）。
	if gdb.Migrator().HasTable("base_formula_dependencies") {
		backfill := `
			INSERT INTO base_formula_dependencies
				(id, tenant_id, table_id, formula_field_id, dependency_field_id, dependency_type, dependency_table_id)
			SELECT
				gen_random_uuid(),
				f.tenant_id,
				f.table_id,
				f.id,
				COALESCE(
					NULLIF(f.config->>'targetFieldId', '')::uuid,
					NULLIF(f.config->>'linkFieldId', '')::uuid,
					'00000000-0000-0000-0000-000000000000'::uuid
				),
				f.type,
				(f.config->>'targetTableId')::uuid
			FROM base_fields f
			WHERE f.type IN ('lookup', 'rollup')
			  AND COALESCE(f.config->>'targetTableId', '') <> ''
			  AND f.status = 1
			ON CONFLICT DO NOTHING`
		if err := gdb.Exec(backfill).Error; err != nil {
			// 回填失败只记日志：反查还有表达式索引兜底。
			log.Printf("ensureBaseDependencyIndex backfill warning: %v", err)
		}
	}
	return nil
}
