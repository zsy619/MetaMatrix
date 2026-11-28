package db

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(databaseURL string) (*gorm.DB, error) {
	return ConnectWithPool(databaseURL, PoolOptions{})
}

// PoolOptions 是连接池参数（来自分层配置）。
type PoolOptions struct {
	MaxOpenConns       int
	MaxIdleConns       int
	ConnMaxLifetimeMin int
	ConnMaxIdleMin     int
}

// ConnectWithPool 建立连接并按配置设置连接池。
func ConnectWithPool(databaseURL string, opts PoolOptions) (*gorm.DB, error) {
	gdb, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	// 显式配置连接池。
	//
	// 不配置时 GORM 默认「连接数无上限、空闲连接仅 2 条」，
	// 压测或并发高峰下会瞬间打满 Postgres 的 max_connections（默认 100），
	// 新连接被服务端拒绝，报 `tls error: EOF` / `too many clients`，
	// 表现出来就是随机 404 / 500 —— 这类「假 404」最难排查。
	pool, err := gdb.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql.DB: %w", err)
	}
	// 50 / 10 是技术文档 §16.3 给出的建议值：
	// 30 条连接在「多维表格并发查询 + 压测」场景下会成为瓶颈
	// （连接池打满 → 等待 → P95 抖动）。Postgres 默认 max_connections=100，
	// 50 条留有余量且不会顶满。
	pool.SetMaxOpenConns(intEnv("DB_MAX_OPEN_CONNS", pickInt(opts.MaxOpenConns, 50)))
	pool.SetMaxIdleConns(intEnv("DB_MAX_IDLE_CONNS", pickInt(opts.MaxIdleConns, 10)))
	pool.SetConnMaxLifetime(time.Duration(intEnv("DB_CONN_MAX_LIFETIME_MIN", pickInt(opts.ConnMaxLifetimeMin, 30))) * time.Minute)
	pool.SetConnMaxIdleTime(time.Duration(intEnv("DB_CONN_MAX_IDLE_MIN", pickInt(opts.ConnMaxIdleMin, 5))) * time.Minute)
	return gdb, nil
}

// pickInt 返回配置值；<=0 时用缺省值。
func pickInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

// intEnv 读取整数型环境变量，缺省或非法时返回默认值。
func intEnv(key string, def int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func AutoMigrate(gdb *gorm.DB) error {
	// 改名必须排在 AutoMigrate 前面：先建表再改名会把旧数据留在旧表里。
	if err := ensureTableNamingSchema(gdb); err != nil {
		return fmt.Errorf("table naming schema: %w", err)
	}
	if err := gdb.AutoMigrate(
		&model.User{},
		&model.Project{},
		&model.CanvasDocument{},
		&model.CanvasRevision{},
		&model.CanvasContentBlock{},
		// 保存与备份的幂等记录必须随服务一起迁移；唯一约束是并发重试的最终防线。
		&model.DocumentSaveOperation{},
		&model.BackupImport{},
		&model.MediaCategory{},
		&model.MediaAsset{},
		&model.MediaReference{},
		&model.PasswordResetToken{},
		// 活动日志：登录、退出与写操作的留痕。
		&model.ActivityLog{},
		// 知识库目录树节点。
		&model.KnowledgeNode{},
		// 知识库反向引用：@ 文档 mention / 画布嵌入块的出向索引。
		&model.PageReference{},
		// 知识库 2.0：模板、页面属性、评论、变更事件、最近浏览。
		&model.KnowledgeTemplate{},
		&model.DocProperty{},
		&model.DocComment{},
		&model.UserNotification{},
		&model.KnowledgeEvent{},
		&model.KnowledgeView{},
		// 知识库 6.0：空间成员、presence 共享存储、协同增量、向量切片。
		&model.KnowledgeMember{},
		&model.KnowledgePresence{},
		&model.DocCRDTUpdate{},
		// 正文协同操作日志（与文档保存版本对齐），独立于旧 HTML 级 doc_crdt_updates。
		&model.DocOperation{},
		// 用户+文档级审计骨架（A3）；块类型/父子等到 B2。
		&model.DocAuditEvent{},
		// B2：派生块表、块修订与块引用。
		&model.DocBlock{},
		&model.DocBlockRevision{},
		&model.DocBlockRef{},
		&model.KnowledgeChunk{},
		// 知识库 5.0：评论已读位与业务标签词库。
		&model.DocCommentRead{},
		&model.KnowledgeTagDict{},
		// 知识库 3.0：节点结构化数据、分享链接、历史版本快照。
		&model.KnowledgeNodeData{},
		&model.KnowledgeShare{},
		&model.KnowledgeDocVersion{},
		// 多维表格 Base Engine：Base/表/字段/记录/投影/视图/关联/公式/审计/事件。
		&model.BaseApp{},
		&model.BaseTable{},
		&model.BaseField{},
		&model.BaseFieldPolicy{},
		&model.BaseRecord{},
		&model.BaseRecordGrant{},
		&model.BaseRecordValue{},
		&model.BaseView{},
		&model.BaseViewPref{},
		&model.BaseRecordLink{},
		&model.BaseRecordReverseLink{},
		&model.BaseFieldFormula{},
		&model.BaseFormulaDependency{},
		&model.BaseOperationLog{},
		&model.BaseEventOutbox{},
		// 大批量导入的后台任务（技术文档 §16.2：超大导入不在单次请求内处理）。
		&model.BaseImportJob{},
		// 通讯录分组：人员字段可以引用一个组而不是一个人。
		&model.BaseUserGroup{},
		// 幂等键：批量创建 / 导入 / 重试去重（共享方案 §10.9）。
		&model.IdempotencyKey{},
	); err != nil {
		return fmt.Errorf("automigrate: %w", err)
	}
	if err := gdb.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_assets (user_id, sha256)`).Error; err != nil {
		return fmt.Errorf("media unique index: %w", err)
	}
	if err := ensureSearchSchema(gdb); err != nil {
		log.Printf("ensureSearchSchema warning: %v", err)
	}
	if err := ensureQueryIndexes(gdb); err != nil {
		log.Printf("ensureQueryIndexes warning: %v", err)
	}
	if err := ensureResetIndexes(gdb); err != nil {
		log.Printf("ensureResetIndexes warning: %v", err)
	}
	if err := backfillKnowledgeAuthors(gdb); err != nil {
		log.Printf("backfillKnowledgeAuthors warning: %v", err)
	}
	if err := ensureShareSchema(gdb); err != nil {
		log.Printf("ensureShareSchema warning: %v", err)
	}
	if err := ensureCommentBlockAnchors(gdb); err != nil {
		log.Printf("ensureCommentBlockAnchors warning: %v", err)
	}
	if err := ensureMarkdownSchema(gdb); err != nil {
		log.Printf("ensureMarkdownSchema warning: %v", err)
	}
	if err := ensureBaseEngineIndexes(gdb); err != nil {
		log.Printf("ensureBaseEngineIndexes warning: %v", err)
	}
	if err := ensureBaseRecordSortOrder(gdb); err != nil {
		log.Printf("ensureBaseRecordSortOrder warning: %v", err)
	}
	if err := ensureBaseRecordVisibility(gdb); err != nil {
		log.Printf("ensureBaseRecordVisibility warning: %v", err)
	}
	if err := ensureBaseRecordGrants(gdb); err != nil {
		log.Printf("ensureBaseRecordGrants warning: %v", err)
	}
	if err := ensureBaseViewScope(gdb); err != nil {
		log.Printf("ensureBaseViewScope warning: %v", err)
	}
	if err := ensureBaseViewPrefsSchema(gdb); err != nil {
		log.Printf("ensureBaseViewPrefsSchema warning: %v", err)
	}
	if err := ensureBaseFieldNames(gdb); err != nil {
		log.Printf("ensureBaseFieldNames warning: %v", err)
	}
	if err := ensureIdempotencySchema(gdb); err != nil {
		log.Printf("ensureIdempotencySchema warning: %v", err)
	}
	if err := ensureBaseFieldPolicies(gdb); err != nil {
		log.Printf("ensureBaseFieldPolicies warning: %v", err)
	}
	if err := ensureBaseReverseLinks(gdb); err != nil {
		log.Printf("ensureBaseReverseLinks warning: %v", err)
	}
	if err := ensureBaseTenantID(gdb); err != nil {
		log.Printf("ensureBaseTenantID warning: %v", err)
	}
	log.Println("AutoMigrate OK: core_users, core_projects, kb_documents, kb_revisions, kb_content_blocks, kb_save_operations, core_backup_imports, media_categories, media_assets, media_references, core_password_reset_tokens")
	return nil
}

// ensureMarkdownSchema 给文档表补 Markdown 源码列。
//
// AutoMigrate 会加列，但线上库可能存在历史版本，这里显式补一次，
// 保证「库里存的不只是 HTML，还有 Markdown 源码」。
func ensureMarkdownSchema(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS content_markdown text NOT NULL DEFAULT ''`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureShareSchema 让分享链接同时支持「文档」与「知识库节点」两种对象。
//
// GORM 的 AutoMigrate 会补新列，但不会把已有的 NOT NULL 约束放开，
// 所以 document_id 变可空必须显式 ALTER。
func ensureShareSchema(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE kb_shares ALTER COLUMN document_id DROP NOT NULL`,
		`ALTER TABLE kb_shares ADD COLUMN IF NOT EXISTS node_id uuid`,
		`ALTER TABLE kb_shares ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'doc'`,
		`CREATE INDEX IF NOT EXISTS idx_shares_node ON kb_shares (node_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			log.Printf("share schema step skip/warn: %v (%s)", err, stmt)
		}
	}
	// 存量分享链接补类型：画布文档按画布渲染，其余按富文本。
	if err := gdb.Exec(`UPDATE kb_shares s SET kind = 'canvas'
  FROM kb_documents d
  WHERE d.id = s.document_id AND d.canvas_type <> '' AND d.canvas_type <> 'doc'`).Error; err != nil {
		log.Printf("share kind backfill warning: %v", err)
	}
	return nil
}

// ensureResetIndexes adds the indexes the reset code rate limit relies on.
//
// The service counts issued codes per address and per IP inside a time
// window. Without these indexes every rate limit check would scan the whole
// table, which is exactly the kind of query an attacker can hammer.
func ensureResetIndexes(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_reset_email_created ON core_password_reset_tokens (email, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_reset_ip_created ON core_password_reset_tokens (request_ip, created_at DESC)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureSearchSchema adds content_tsv GENERATED column, GIN indexes, pg_trgm when available.
func ensureSearchSchema(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS content_text TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS notes TEXT`,
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
	}
	for _, s := range stmts {
		if err := gdb.Exec(s).Error; err != nil {
			log.Printf("schema step skip/warn: %v (%s)", err, s[:min(40, len(s))])
		}
	}
	// Add generated tsvector if missing
	var hasTSV bool
	_ = gdb.Raw(`
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'kb_documents' AND column_name = 'content_tsv'
)`).Scan(&hasTSV).Error
	if !hasTSV {
		if err := gdb.Exec(`
ALTER TABLE kb_documents
  ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content_text, ''))) STORED
`).Error; err != nil {
			return err
		}
	}
	indexStmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_docs_content_tsv ON kb_documents USING GIN (content_tsv)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_content_trgm ON kb_documents USING GIN (content_text gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_document_panel ON kb_content_blocks (document_id, panel_id)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_text_trgm ON kb_content_blocks USING GIN (text_content gin_trgm_ops)`,
	}
	for _, s := range indexStmts {
		if err := gdb.Exec(s).Error; err != nil {
			log.Printf("index step skip/warn: %v", err)
		}
	}
	return nil
}

// ensureQueryIndexes covers owner lists and revision history.
// Partial indexes keep archived rows out of the common updated_at ordering.
func ensureQueryIndexes(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_updated ON kb_documents (owner_user_id, updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_active_updated ON kb_documents (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_archived ON kb_documents (owner_user_id, updated_at DESC) WHERE deleted_at IS NOT NULL`,
		// keyset 排序包含 id 决胜键；索引保持完全同序，深页翻页不需要额外排序或 offset 扫描。
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_keyset ON kb_documents (owner_user_id, updated_at DESC, id ASC)`,
		`CREATE INDEX IF NOT EXISTS idx_revisions_doc_created ON kb_revisions (document_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_revisions_doc_keyset ON kb_revisions (document_id, created_at DESC, id ASC)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// backfillKnowledgeAuthors 回填存量目录节点的作者：旧数据没有 created_by，
// 作者维度检索与图谱归属会失效。
func backfillKnowledgeAuthors(gdb *gorm.DB) error {
	return gdb.Exec(`UPDATE kb_nodes n
  SET created_by = p.owner_user_id
  FROM core_projects p
  WHERE n.project_id = p.id AND n.created_by IS NULL`).Error
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ensureBaseRecordSortOrder 给记录表补「手动排序位」列。
//
// AutoMigrate 会加列，但存量记录的 sort_order 全是 0（顺序随机），
// 这里按创建时间回填一次，保证默认排序稳定。
func ensureBaseRecordSortOrder(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE base_records ADD COLUMN IF NOT EXISTS sort_order bigint NOT NULL DEFAULT 0`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_table_sort ON base_records (table_id, sort_order)`,
		// 早期版本建过单列索引，被复合索引取代后清理掉。
		`DROP INDEX IF EXISTS idx_base_record_sort`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	// 存量回填：只处理 sort_order 仍为 0 的记录（避免覆盖用户已经排好的顺序）。
	return gdb.Exec(`UPDATE base_records r
  SET sort_order = sub.pos
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY created_at ASC, id ASC) - 1 AS pos
    FROM base_records
    WHERE sort_order = 0
  ) sub
  WHERE r.id = sub.id AND r.sort_order = 0`).Error
}

// ensureBaseRecordVisibility 给记录表补「记录级可见范围」列。
//
// space     —— 空间内可见（默认，与旧行为一致）；
// restricted —— 仅创建者与空间管理者可见。
func ensureBaseRecordVisibility(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE base_records ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'space'`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_scope ON base_records (table_id, visibility)`,
		`UPDATE base_records SET visibility = 'space' WHERE visibility IS NULL OR visibility = ''`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureBaseEngineIndexes 给 Base Engine 补查询投影与事件表的索引。
//
// 记录主数据在 JSONB，筛选与排序走类型化投影表（base_record_values），
// 因此这里为投影表的「字段 + 值」建复合索引，让动态字段的排序与范围筛选可控。
func ensureBaseEngineIndexes(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_base_record_table ON base_records (table_id, id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_data_gin ON base_records USING GIN (data jsonb_path_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_updated ON base_records (table_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_base_value_number ON base_record_values (table_id, field_id, value_number, record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_value_text ON base_record_values (table_id, field_id, value_text, record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_value_date ON base_record_values (table_id, field_id, value_date, record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_value_record ON base_record_values (record_id, field_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_outbox_pending ON base_event_outboxes (status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_base_audit_base ON base_operation_logs (base_id, created_at DESC)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureBaseViewPrefsSchema 建「视图个人偏好」表，并把历史写在
// base_views.config.personal 里的个人偏好迁过来。
//
// 不做这一步的话：老视图里的 personal 段会继续被所有人读到，
// 而且它和新的 base_view_prefs 会各写一份，两边打架。
func ensureBaseViewPrefsSchema(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS base_view_prefs (
			id uuid PRIMARY KEY,
			view_id uuid NOT NULL,
			user_id uuid NOT NULL,
			project_id uuid NOT NULL,
			config jsonb NOT NULL DEFAULT '{}'::jsonb,
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_base_view_pref_view_user ON base_view_prefs (view_id, user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_view_pref_user ON base_view_prefs (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_view_pref_project ON base_view_prefs (project_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return migrateLegacyViewPersonal(gdb)
}

// migrateLegacyViewPersonal 把 base_views.config.personal 迁到 base_view_prefs。
//
// 链路：base_views → base_tables → base_apps → project_id。
func migrateLegacyViewPersonal(gdb *gorm.DB) error {
	type legacyView struct {
		ID       uuid.UUID
		Config   datatypes.JSON
		ProjectI uuid.UUID
	}
	var rows []legacyView
	err := gdb.Table("base_views AS v").
		Select("v.id AS id, v.config AS config, a.project_id AS project_i").
		Joins("JOIN base_tables t ON t.id = v.table_id").
		Joins("JOIN base_apps a ON a.id = t.base_id").
		Where("v.config ? 'personal' AND v.status = 1").
		Find(&rows).Error
	if err != nil {
		return err
	}
	for _, row := range rows {
		cfg := map[string]any{}
		if len(row.Config) > 0 {
			_ = json.Unmarshal(row.Config, &cfg)
		}
		personal, ok := cfg["personal"].(map[string]any)
		if !ok {
			continue
		}
		for uid, pref := range personal {
			userID, perr := uuid.Parse(uid)
			if perr != nil {
				continue
			}
			raw, merr := json.Marshal(pref)
			if merr != nil {
				continue
			}
			// 已有记录不覆盖（新的写入路径优先）。
			gdb.Exec(`INSERT INTO base_view_prefs (id, view_id, user_id, project_id, config, created_at, updated_at)
				VALUES (gen_random_uuid(), ?, ?, ?, ?::jsonb, now(), now())
				ON CONFLICT (view_id, user_id) DO NOTHING`,
				row.ID, userID, row.ProjectI, string(raw))
		}
	}
	return nil
}

// ensureBaseRecordGrants 建「记录级授权名单」表。
//
// 记录可见范围为 custom（指定成员可见）时，谁能看到这条记录记在这里。
func ensureBaseRecordGrants(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS base_record_grants (
			id uuid PRIMARY KEY,
			record_id uuid NOT NULL,
			user_id uuid NOT NULL,
			project_id uuid NOT NULL,
			created_by uuid NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_base_record_grant ON base_record_grants (record_id, user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_grant_record ON base_record_grants (record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_grant_user ON base_record_grants (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_grant_project ON base_record_grants (project_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	// 授权对象类型 / 有效期（2026-11-27 补齐「记录级授权有效期 + 按部门授权」）。
	alter := []string{
		`ALTER TABLE base_record_grants ADD COLUMN IF NOT EXISTS subject_type varchar(16) NOT NULL DEFAULT 'user'`,
		`ALTER TABLE base_record_grants ADD COLUMN IF NOT EXISTS subject_id varchar(128) NOT NULL DEFAULT ''`,
		`ALTER TABLE base_record_grants ADD COLUMN IF NOT EXISTS expires_at timestamptz`,
		// 存量数据回填：原来是「按用户授权」。
		`UPDATE base_record_grants SET subject_id = user_id::text WHERE subject_id = ''`,
		`UPDATE base_record_grants SET subject_type = 'user' WHERE subject_type IS NULL OR subject_type = ''`,
		`CREATE INDEX IF NOT EXISTS idx_base_record_grant_subject ON base_record_grants (subject_type, subject_id)`,
	}
	for _, stmt := range alter {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureBaseViewScope 给视图表补「可见范围」列。
//
// shared —— 空间内共享；personal —— 仅创建者可见。
func ensureBaseViewScope(gdb *gorm.DB) error {
	stmts := []string{
		`ALTER TABLE base_views ADD COLUMN IF NOT EXISTS scope varchar(16) NOT NULL DEFAULT 'shared'`,
		`UPDATE base_views SET scope = 'shared' WHERE scope IS NULL OR scope = ''`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureBaseFieldNames 给「空名字段」补名。
//
// 历史成因：旧版表格允许空列名，迁移时直接搬过来，
// 于是新表表头只剩一个类型图标、看不到标题。
// 这里按 sort_order 补成「字段 N」（同表内不重名），不改任何数据行。
func ensureBaseFieldNames(gdb *gorm.DB) error {
	type row struct {
		ID        uuid.UUID
		TableID   uuid.UUID
		SortOrder int
	}
	var empty []row
	if err := gdb.Raw(`SELECT id, table_id, sort_order FROM base_fields WHERE name IS NULL OR TRIM(name) = ''`).Scan(&empty).Error; err != nil {
		return err
	}
	if len(empty) == 0 {
		return nil
	}
	byTable := map[uuid.UUID][]row{}
	for _, r := range empty {
		byTable[r.TableID] = append(byTable[r.TableID], r)
	}
	for tableID, rows := range byTable {
		used := map[string]bool{}
		var existing []row
		if err := gdb.Raw(`SELECT id, table_id, sort_order FROM base_fields WHERE table_id = ?`, tableID).Scan(&existing).Error; err != nil {
			return err
		}
		for _, r := range existing {
			var name string
			if err := gdb.Raw(`SELECT name FROM base_fields WHERE id = ?`, r.ID).Scan(&name).Error; err != nil {
				return err
			}
			if strings.TrimSpace(name) != "" {
				used[strings.TrimSpace(name)] = true
			}
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i].SortOrder < rows[j].SortOrder })
		for i, r := range rows {
			name := fmt.Sprintf("字段 %d", i+1)
			base := name
			for seq := 2; used[name]; seq++ {
				name = fmt.Sprintf("%s %d", base, seq)
			}
			used[name] = true
			if err := gdb.Exec(`UPDATE base_fields SET name = ? WHERE id = ?`, name, r.ID).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// ensureIdempotencySchema 补幂等键表的唯一索引与清理策略。
//
// 唯一索引是并发重试的最终防线：两个请求同时带着同一个幂等键进来时，
// 只有一个能插入成功，另一个回放首次结果。
func ensureIdempotencySchema(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_core_idem_user_endpoint_key
			ON core_idempotency_keys (user_id, endpoint, key)`,
		`CREATE INDEX IF NOT EXISTS idx_core_idem_project ON core_idempotency_keys (project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_core_idem_user ON core_idempotency_keys (user_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	// 清理 7 天前的幂等记录，避免表无限增长。
	if err := gdb.Exec(`DELETE FROM core_idempotency_keys WHERE created_at < now() - interval '7 days'`).Error; err != nil {
		return err
	}
	return nil
}

// ensureBaseFieldPolicies 建「字段级权限策略」独立表，并把存量策略从
// base_fields.config.permissions 回填进来（双写期以本表为准）。
func ensureBaseFieldPolicies(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS base_field_policies (
			id uuid PRIMARY KEY,
			project_id uuid NOT NULL,
			table_id uuid NOT NULL,
			field_id uuid NOT NULL,
			policy jsonb NOT NULL DEFAULT '{}'::jsonb,
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_base_field_policy_field ON base_field_policies (field_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_field_policy_project ON base_field_policies (project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_field_policy_table ON base_field_policies (table_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	// 回填：把字段配置里的 permissions 抽到独立表（只回填还没有记录的字段）。
	backfill := `
		INSERT INTO base_field_policies (id, project_id, table_id, field_id, policy, created_at, updated_at)
		SELECT gen_random_uuid(), COALESCE(a.project_id, uuid_nil()), f.table_id, f.id,
		       (f.config->'permissions')::jsonb, now(), now()
		FROM base_fields f
		LEFT JOIN base_tables t ON t.id = f.table_id
		LEFT JOIN base_apps a ON a.id = t.base_id
		WHERE f.config ? 'permissions'
		  AND NOT EXISTS (SELECT 1 FROM base_field_policies p WHERE p.field_id = f.id)`
	if err := gdb.Exec(backfill).Error; err != nil {
		// 回填失败不影响主流程（下次启动会再试）。
		log.Printf("ensureBaseFieldPolicies backfill warning: %v", err)
	}
	return nil
}

// ensureBaseReverseLinks 建「反向关系」独立表（与 base_record_links 双写）。
func ensureBaseReverseLinks(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS base_record_reverse_links (
			id uuid PRIMARY KEY,
			project_id uuid NOT NULL,
			source_table_id uuid NOT NULL,
			source_record_id uuid NOT NULL,
			field_id uuid NOT NULL,
			target_table_id uuid NOT NULL,
			target_record_id uuid NOT NULL,
			sort_order integer NOT NULL DEFAULT 0,
			created_at timestamptz NOT NULL DEFAULT now()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_base_reverse_link_target_record ON base_record_reverse_links (target_record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_reverse_link_source_record ON base_record_reverse_links (source_record_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_reverse_link_field ON base_record_reverse_links (field_id)`,
		`CREATE INDEX IF NOT EXISTS idx_base_reverse_link_project ON base_record_reverse_links (project_id)`,
	}
	for _, stmt := range stmts {
		if err := gdb.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// ensureBaseTenantID 给多维表格各表补「显式租户列」tenant_id。
//
// 为什么要有这一列：
//   - 本系统的租户边界是「知识库空间」= project_id，早期所有查询都靠
//     JOIN base_apps 才能拿到租户，跨空间过滤成本高、容易漏；
//   - 租户级限流、租户级审计、租户级索引都需要一个「可以直接过滤」的列；
//   - 将来若把空间拆成独立租户（多租户 SaaS 形态），列已经在，迁移成本最低。
//
// 口径：tenant_id 与 project_id 同值（当前实现里空间即租户）。
// 存量数据按「表 → Base → 空间」链路回填，回填不到的行保持零值 UUID，
// 由应用层按「零值 = 未标注」处理，不影响既有查询。
func ensureBaseTenantID(gdb *gorm.DB) error {
	// 零值 UUID = 「尚未标注租户」。列是 NOT NULL DEFAULT 零值，
	// 所以回填条件必须同时覆盖 IS NULL 与零值两种情况，只判 IS NULL 会静默失效。
	// unassigned 返回「该行尚未标注租户」的判定条件（必须带目标表别名，
	// UPDATE ... FROM 场景下同名列不限定会报 column reference is ambiguous）。
	unassigned := func(alias string) string {
		return fmt.Sprintf(`(%s.tenant_id IS NULL OR %s.tenant_id = '00000000-0000-0000-0000-000000000000')`, alias, alias)
	}

	// 直接持有 project_id 的表：直接回填。
	direct := []string{
		"base_apps",
		"base_operation_logs",
		"base_event_outboxes",
		"base_field_policies",
		"base_record_grants",
		"base_record_reverse_links",
		"base_view_prefs",
		"base_import_jobs",
		"base_user_groups",
	}
	for _, table := range direct {
		if err := addTenantColumn(gdb, table); err != nil {
			return err
		}
	}
	// 派生表：沿链路回填。顺序必须满足依赖（表 → 字段/记录 → 值/公式）。
	derived := []struct {
		table string
		sql   string
	}{
		{
			table: "base_tables",
			sql:   `UPDATE base_tables t SET tenant_id = a.tenant_id FROM base_apps a WHERE a.id = t.base_id AND ` + unassigned("t"),
		},
		{
			table: "base_fields",
			sql:   `UPDATE base_fields f SET tenant_id = t.tenant_id FROM base_tables t WHERE t.id = f.table_id AND ` + unassigned("f"),
		},
		{
			table: "base_records",
			sql:   `UPDATE base_records r SET tenant_id = t.tenant_id FROM base_tables t WHERE t.id = r.table_id AND ` + unassigned("r"),
		},
		{
			table: "base_record_values",
			sql:   `UPDATE base_record_values v SET tenant_id = r.tenant_id FROM base_records r WHERE r.id = v.record_id AND ` + unassigned("v"),
		},
		{
			table: "base_views",
			sql:   `UPDATE base_views v SET tenant_id = t.tenant_id FROM base_tables t WHERE t.id = v.table_id AND ` + unassigned("v"),
		},
		{
			table: "base_record_links",
			sql:   `UPDATE base_record_links l SET tenant_id = t.tenant_id FROM base_tables t WHERE t.id = l.source_table_id AND ` + unassigned("l"),
		},
		{
			table: "base_field_formulas",
			sql:   `UPDATE base_field_formulas f SET tenant_id = b.tenant_id FROM base_fields b WHERE b.id = f.field_id AND ` + unassigned("f"),
		},
		{
			table: "base_formula_dependencies",
			sql:   `UPDATE base_formula_dependencies d SET tenant_id = t.tenant_id FROM base_tables t WHERE t.id = d.table_id AND ` + unassigned("d"),
		},
		{
			// 反向关系：project_id 可能是历史脏数据（零值），因此优先走「源记录 → 表 → 空间」链路。
			table: "base_record_reverse_links",
			sql:   `UPDATE base_record_reverse_links l SET tenant_id = r.tenant_id FROM base_records r WHERE r.id = l.source_record_id AND ` + unassigned("l"),
		},
	}
	for _, item := range derived {
		if err := addTenantColumn(gdb, item.table); err != nil {
			return err
		}
	}
	// 回填按依赖顺序执行：先 base_apps，再表，再字段/记录，最后值/公式。
	for _, item := range derived {
		if err := gdb.Exec(item.sql).Error; err != nil {
			return fmt.Errorf("backfill tenant_id for %s: %w", item.table, err)
		}
	}
	// base_apps 自身：tenant_id = project_id。
	if err := gdb.Exec(fmt.Sprintf(
		`UPDATE base_apps SET tenant_id = project_id WHERE %s`, unassigned("base_apps"),
	)).Error; err != nil {
		return fmt.Errorf("backfill tenant_id for base_apps: %w", err)
	}
	// 其余直接持 project_id 的表：经 base_apps 关联取租户。
	// 不能直接写 tenant_id = project_id —— 历史脏数据里 project_id 本身可能是零值，
	// 那样回填后 tenant_id 仍是零值，等于没回填。
	for _, table := range direct {
		if table == "base_apps" {
			continue
		}
		stmt := fmt.Sprintf(
			`UPDATE %s t SET tenant_id = a.tenant_id FROM base_apps a WHERE a.project_id = t.project_id AND %s`,
			table, unassigned("t"),
		)
		if err := gdb.Exec(stmt).Error; err != nil {
			return fmt.Errorf("backfill tenant_id for %s: %w", table, err)
		}
	}
	// 租户级索引：租户过滤（限流 / 审计 / 清理）走索引而不是全表扫。
	for _, table := range []string{
		"base_apps", "base_tables", "base_fields", "base_records", "base_record_values",
		"base_views", "base_operation_logs", "base_event_outboxes", "base_import_jobs",
		"base_field_policies", "base_record_grants", "base_record_reverse_links",
		"base_view_prefs", "base_record_links", "base_field_formulas", "base_formula_dependencies",
		"base_user_groups",
	} {
		idx := "idx_" + table + "_tenant"
		stmt := fmt.Sprintf(`CREATE INDEX IF NOT EXISTS %s ON %s (tenant_id)`, idx, table)
		if err := gdb.Exec(stmt).Error; err != nil {
			return fmt.Errorf("create %s: %w", idx, err)
		}
	}
	return nil
}

// addTenantColumn 给表补 tenant_id 列（已存在则跳过）。
func addTenantColumn(gdb *gorm.DB, table string) error {
	stmt := fmt.Sprintf(`ALTER TABLE %s ADD COLUMN IF NOT EXISTS tenant_id uuid`, table)
	if err := gdb.Exec(stmt).Error; err != nil {
		return fmt.Errorf("add tenant_id to %s: %w", table, err)
	}
	return nil
}
