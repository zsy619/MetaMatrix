-- Projects: canvases are grouped into core_projects.
-- Applied at API startup via GORM AutoMigrate; this file documents the schema.
--
-- project_id is NULLABLE on purpose: every canvas that existed before this
-- migration stays outside any project, so old data keeps working untouched.
-- Node/edge content itself is NOT stored here -- it lives in
-- kb_documents.current_data (JSONB), one document per canvas.

CREATE TABLE IF NOT EXISTS core_projects (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  -- emoji / progress 是项目的基本信息：表情用于列表识别，进度由使用者维护。
  emoji VARCHAR(16) NOT NULL DEFAULT '📁',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON core_projects (owner_user_id, updated_at DESC);

ALTER TABLE kb_documents
  ADD COLUMN IF NOT EXISTS project_id UUID;
CREATE INDEX IF NOT EXISTS idx_docs_project ON kb_documents (project_id);
