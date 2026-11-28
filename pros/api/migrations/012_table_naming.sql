-- 012_table_naming.sql — 全库表名前缀统一
--
-- 规范见 docs/db-table-naming.md：表名 = 域前缀 + 实体名（复数），
-- 域只有 core / kb / base / media 四个。
--
-- 作用：把旧表名改成新表名（ALTER TABLE ... RENAME），保留全部数据与索引。
-- 幂等：旧表不存在就直接跳过；新旧表同时存在说明已经改过，也跳过（不合并数据）。
--
-- 说明：API 启动时的 ensureTableNamingSchema（internal/db/table_naming.go）会执行同一套改名，
-- 本文件用于「不想重启服务、手工执行」的场景，二者效果一致，不要重复跑 001–011。

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('users', 'core_users'),
      ('projects', 'core_projects'),
      ('activity_logs', 'core_activity_logs'),
      ('backup_imports', 'core_backup_imports'),
      ('password_reset_tokens', 'core_password_reset_tokens'),
      ('page_references', 'core_page_references'),
      ('canvas_documents', 'kb_documents'),
      ('canvas_revisions', 'kb_revisions'),
      ('canvas_content_blocks', 'kb_content_blocks'),
      ('doc_properties', 'kb_doc_properties'),
      ('doc_comments', 'kb_comments'),
      ('doc_comment_reads', 'kb_comment_reads'),
      ('doc_crdt_updates', 'kb_crdt_updates'),
      ('document_save_operations', 'kb_save_operations'),
      ('knowledge_nodes', 'kb_nodes'),
      ('knowledge_node_data', 'kb_node_data'),
      ('knowledge_shares', 'kb_shares'),
      ('knowledge_doc_versions', 'kb_doc_versions'),
      ('knowledge_members', 'kb_members'),
      ('knowledge_presence', 'kb_presence'),
      ('knowledge_chunks', 'kb_chunks'),
      ('knowledge_events', 'kb_events'),
      ('knowledge_views', 'kb_views'),
      ('knowledge_templates', 'kb_templates'),
      ('knowledge_tag_dict', 'kb_tags'),
      ('base_app', 'base_apps'),
      ('base_table', 'base_tables'),
      ('base_field', 'base_fields'),
      ('base_record', 'base_records'),
      ('base_record_value', 'base_record_values'),
      ('base_record_link', 'base_record_links'),
      ('base_field_formula', 'base_field_formulas'),
      ('base_formula_dependency', 'base_formula_dependencies'),
      ('base_view', 'base_views'),
      ('base_operation_log', 'base_operation_logs'),
      ('base_event_outbox', 'base_event_outboxes'),
      ('media_category', 'media_categories'),
      ('media_asset', 'media_assets'),
      ('media_reference', 'media_references')
    ) AS t(old_name, new_name)
  LOOP
    IF to_regclass('public.' || r.old_name) IS NOT NULL
       AND to_regclass('public.' || r.new_name) IS NULL THEN
      EXECUTE format('ALTER TABLE %I RENAME TO %I', r.old_name, r.new_name);
      RAISE NOTICE '表 % 已改名为 %', r.old_name, r.new_name;
    END IF;
  END LOOP;
END
$$;
