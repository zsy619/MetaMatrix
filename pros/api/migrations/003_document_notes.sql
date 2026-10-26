-- Document notes / remarks (nullable TEXT).
-- Applied at API startup via GORM AutoMigrate; this file documents the schema.

ALTER TABLE canvas_documents
  ADD COLUMN IF NOT EXISTS notes TEXT;
