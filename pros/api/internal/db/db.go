package db

import (
	"fmt"
	"log"

	"metamatrix/api/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(databaseURL string) (*gorm.DB, error) {
	gdb, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	return gdb, nil
}

func AutoMigrate(gdb *gorm.DB) error {
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
		&model.KnowledgeEvent{},
		&model.KnowledgeView{},
		// 知识库 5.0：评论已读位与业务标签词库。
		&model.DocCommentRead{},
		&model.KnowledgeTagDict{},
		// 知识库 3.0：节点结构化数据、分享链接、历史版本快照。
		&model.KnowledgeNodeData{},
		&model.KnowledgeShare{},
		&model.KnowledgeDocVersion{},
	); err != nil {
		return fmt.Errorf("automigrate: %w", err)
	}
	if err := gdb.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_asset (user_id, sha256)`).Error; err != nil {
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
	log.Println("AutoMigrate OK: users, canvas_documents, canvas_revisions, canvas_content_blocks, document_save_operations, backup_imports, media_category, media_asset, media_reference, password_reset_tokens")
	return nil
}

// ensureResetIndexes adds the indexes the reset code rate limit relies on.
//
// The service counts issued codes per address and per IP inside a time
// window. Without these indexes every rate limit check would scan the whole
// table, which is exactly the kind of query an attacker can hammer.
func ensureResetIndexes(gdb *gorm.DB) error {
	stmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_reset_email_created ON password_reset_tokens (email, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_reset_ip_created ON password_reset_tokens (request_ip, created_at DESC)`,
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
		`ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS content_text TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS notes TEXT`,
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
  WHERE table_name = 'canvas_documents' AND column_name = 'content_tsv'
)`).Scan(&hasTSV).Error
	if !hasTSV {
		if err := gdb.Exec(`
ALTER TABLE canvas_documents
  ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content_text, ''))) STORED
`).Error; err != nil {
			return err
		}
	}
	indexStmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_docs_content_tsv ON canvas_documents USING GIN (content_tsv)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_content_trgm ON canvas_documents USING GIN (content_text gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_document_panel ON canvas_content_blocks (document_id, panel_id)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_text_trgm ON canvas_content_blocks USING GIN (text_content gin_trgm_ops)`,
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
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_updated ON canvas_documents (owner_user_id, updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_active_updated ON canvas_documents (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_archived ON canvas_documents (owner_user_id, updated_at DESC) WHERE deleted_at IS NOT NULL`,
		// keyset 排序包含 id 决胜键；索引保持完全同序，深页翻页不需要额外排序或 offset 扫描。
		`CREATE INDEX IF NOT EXISTS idx_docs_owner_keyset ON canvas_documents (owner_user_id, updated_at DESC, id ASC)`,
		`CREATE INDEX IF NOT EXISTS idx_revisions_doc_created ON canvas_revisions (document_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_revisions_doc_keyset ON canvas_revisions (document_id, created_at DESC, id ASC)`,
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
	return gdb.Exec(`UPDATE knowledge_nodes n
  SET created_by = p.owner_user_id
  FROM projects p
  WHERE n.project_id = p.id AND n.created_by IS NULL`).Error
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
