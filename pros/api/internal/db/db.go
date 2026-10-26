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
		&model.CanvasDocument{},
		&model.CanvasRevision{},
		&model.CanvasContentBlock{},
	); err != nil {
		return fmt.Errorf("automigrate: %w", err)
	}
	if err := ensureSearchSchema(gdb); err != nil {
		log.Printf("ensureSearchSchema warning: %v", err)
	}
	log.Println("AutoMigrate OK: users, canvas_documents, canvas_revisions, canvas_content_blocks")
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
