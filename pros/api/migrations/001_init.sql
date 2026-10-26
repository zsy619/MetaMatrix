-- Documented schema (GORM AutoMigrate applies equivalent at startup).
-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(128),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- canvas_documents
CREATE TABLE IF NOT EXISTS canvas_documents (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canvas_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  current_data JSONB NOT NULL,
  head_revision_id UUID,
  template_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_owner_updated ON canvas_documents (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_owner_type ON canvas_documents (owner_user_id, canvas_type);
CREATE INDEX IF NOT EXISTS idx_docs_owner_template ON canvas_documents (owner_user_id, template_id);

-- canvas_revisions
CREATE TABLE IF NOT EXISTS canvas_revisions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
  parent_id UUID,
  revision_type VARCHAR(16) NOT NULL,
  payload JSONB NOT NULL,
  base_snapshot_id UUID,
  author_user_id UUID REFERENCES users(id),
  label VARCHAR(255),
  content_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revisions_document ON canvas_revisions (document_id, created_at DESC);
