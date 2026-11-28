-- Document notes / remarks (nullable TEXT).
-- Applied at API startup via GORM AutoMigrate; this file documents the schema.

ALTER TABLE kb_documents
  ADD COLUMN IF NOT EXISTS notes TEXT;
