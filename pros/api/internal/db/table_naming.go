package db

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// tableRename 描述一次表改名：旧表名 → 新表名。
type tableRename struct {
	old string
	new string
}

// tableRenames 是「全库表名前缀统一」的改名清单。
//
// 规范见 docs/db-table-naming.md：表名 = 域前缀 + 实体名（复数），
// 域只有 core / kb / base / media 四个。新增表不要再引入第五套前缀。
var tableRenames = []tableRename{
	// core 平台域：账号、项目、审计、备份、密码重置、页面引用。
	{old: "users", new: "core_users"},
	{old: "projects", new: "core_projects"},
	{old: "activity_logs", new: "core_activity_logs"},
	{old: "backup_imports", new: "core_backup_imports"},
	{old: "password_reset_tokens", new: "core_password_reset_tokens"},
	{old: "page_references", new: "core_page_references"},
	// kb 知识库域：目录树、文档真源、版本、属性、评论、协同、检索、模板。
	{old: "canvas_documents", new: "kb_documents"},
	{old: "canvas_revisions", new: "kb_revisions"},
	{old: "canvas_content_blocks", new: "kb_content_blocks"},
	{old: "doc_properties", new: "kb_doc_properties"},
	{old: "doc_comments", new: "kb_comments"},
	{old: "doc_comment_reads", new: "kb_comment_reads"},
	{old: "doc_crdt_updates", new: "kb_crdt_updates"},
	{old: "document_save_operations", new: "kb_save_operations"},
	{old: "knowledge_nodes", new: "kb_nodes"},
	{old: "knowledge_node_data", new: "kb_node_data"},
	{old: "knowledge_shares", new: "kb_shares"},
	{old: "knowledge_doc_versions", new: "kb_doc_versions"},
	{old: "knowledge_members", new: "kb_members"},
	{old: "knowledge_presence", new: "kb_presence"},
	{old: "knowledge_chunks", new: "kb_chunks"},
	{old: "knowledge_events", new: "kb_events"},
	{old: "knowledge_views", new: "kb_views"},
	{old: "knowledge_templates", new: "kb_templates"},
	{old: "knowledge_tag_dict", new: "kb_tags"},
	// base 多维表格域：单数改复数，与其它域对齐。
	{old: "base_app", new: "base_apps"},
	{old: "base_table", new: "base_tables"},
	{old: "base_field", new: "base_fields"},
	{old: "base_record", new: "base_records"},
	{old: "base_record_value", new: "base_record_values"},
	{old: "base_record_link", new: "base_record_links"},
	{old: "base_field_formula", new: "base_field_formulas"},
	{old: "base_formula_dependency", new: "base_formula_dependencies"},
	{old: "base_view", new: "base_views"},
	{old: "base_operation_log", new: "base_operation_logs"},
	{old: "base_event_outbox", new: "base_event_outboxes"},
	// media 素材域：单数改复数，与其它域对齐。
	{old: "media_category", new: "media_categories"},
	{old: "media_asset", new: "media_assets"},
	{old: "media_reference", new: "media_references"},
	// 本功能分支新建表：对齐四域前缀。kb_doc_operations 不是 kb_save_operations。
	{old: "user_notifications", new: "core_user_notifications"},
	{old: "doc_audit_events", new: "kb_doc_audit_events"},
	{old: "doc_block_refs", new: "kb_doc_block_refs"},
	{old: "doc_block_revisions", new: "kb_doc_block_revisions"},
	{old: "doc_blocks", new: "kb_doc_blocks"},
	{old: "doc_operation", new: "kb_doc_operations"},
}

// ensureTableNamingSchema 把旧表名改成新表名。
//
// 必须在 AutoMigrate 之前跑：GORM 的 AutoMigrate 见到「不存在的新表」会直接建一张空表，
// 如果先 AutoMigrate 再改名，旧表的数据会留在旧表里，看起来像数据丢了。
//
// 整个改名放在一个事务里：要么全改成功，要么全不改，服务不会带着半套表名启动。
// 新旧表同时存在（说明已经手工改过、或上一步只改了一半）时只告警、不动数据。
func ensureTableNamingSchema(gdb *gorm.DB) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		for _, r := range tableRenames {
			oldExists, err := tableExists(tx, r.old)
			if err != nil {
				return fmt.Errorf("check table %s: %w", r.old, err)
			}
			if !oldExists {
				continue
			}
			newExists, err := tableExists(tx, r.new)
			if err != nil {
				return fmt.Errorf("check table %s: %w", r.new, err)
			}
			if newExists {
				log.Printf("ensureTableNamingSchema warning: 表 %s 与 %s 同时存在，跳过改名", r.old, r.new)
				continue
			}
			if err := tx.Exec(fmt.Sprintf(`ALTER TABLE %q RENAME TO %q`, r.old, r.new)).Error; err != nil {
				return fmt.Errorf("rename table %s -> %s: %w", r.old, r.new, err)
			}
			log.Printf("ensureTableNamingSchema: 表 %s 已改名为 %s", r.old, r.new)
		}
		return nil
	})
}

// tableExists 判断当前 schema 下是否存在指定表。
func tableExists(gdb *gorm.DB, name string) (bool, error) {
	var count int64
	err := gdb.Raw("SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?", name).Scan(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
