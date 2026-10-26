-- Search / AI extraction layer (JSONB remains source of truth).
-- Applied at API startup via AutoMigrate + ensureSearchSchema; this file documents the schema.

-- canvas_documents: plain-text extract + full-text vector
ALTER TABLE canvas_documents
  ADD COLUMN IF NOT EXISTS content_text TEXT NOT NULL DEFAULT '';

-- Generated tsvector (simple config works for CJK when paired with ILIKE fallback)
ALTER TABLE canvas_documents
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_docs_content_tsv ON canvas_documents USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS idx_docs_content_trgm ON canvas_documents USING GIN (content_text gin_trgm_ops);

-- Optional: enable pg_trgm for ILIKE acceleration (ignore if extension unavailable)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Structured blocks for panel-level retrieval / AI context
CREATE TABLE IF NOT EXISTS canvas_content_blocks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
  panel_id VARCHAR(64),
  panel_title VARCHAR(255),
  block_path VARCHAR(255),
  text_content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocks_document_panel ON canvas_content_blocks (document_id, panel_id);
CREATE INDEX IF NOT EXISTS idx_blocks_text_trgm ON canvas_content_blocks USING GIN (text_content gin_trgm_ops);
