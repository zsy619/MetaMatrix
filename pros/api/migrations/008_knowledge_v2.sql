-- 知识库 2.0：模板、页面属性、评论、事件、最近浏览、节点元数据。
-- AutoMigrate 会建表，此文件记录 schema 供参考。

ALTER TABLE kb_nodes
  ADD COLUMN IF NOT EXISTS alias VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS summary VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kn_trashed ON kb_nodes (trashed_at);
CREATE INDEX IF NOT EXISTS idx_kn_archived ON kb_nodes (archived_at);

CREATE TABLE IF NOT EXISTS kb_templates (
  id UUID PRIMARY KEY,
  owner_user_id UUID,
  project_id UUID,
  key VARCHAR(64) NOT NULL,
  label VARCHAR(64) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '📄',
  category VARCHAR(32) NOT NULL DEFAULT '通用',
  html TEXT NOT NULL DEFAULT '',
  builtin BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kt_owner ON kb_templates (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_kt_project ON kb_templates (project_id);

CREATE TABLE IF NOT EXISTS kb_doc_properties (
  doc_id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  reviewer_user_id UUID,
  due_at TIMESTAMPTZ,
  tags VARCHAR(255) NOT NULL DEFAULT '',
  summary VARCHAR(255) NOT NULL DEFAULT '',
  cover_color VARCHAR(32) NOT NULL DEFAULT '',
  cover_url VARCHAR(512) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dp_owner ON kb_doc_properties (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_dp_due ON kb_doc_properties (due_at);

CREATE TABLE IF NOT EXISTS kb_comments (
  id UUID PRIMARY KEY,
  doc_id UUID NOT NULL,
  author_user_id UUID NOT NULL,
  parent_id UUID,
  quote TEXT NOT NULL DEFAULT '',
  anchor INTEGER NOT NULL DEFAULT -1,
  content TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dc_doc ON kb_comments (doc_id);
CREATE INDEX IF NOT EXISTS idx_dc_parent ON kb_comments (parent_id);

CREATE TABLE IF NOT EXISTS kb_events (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  node_id UUID,
  document_id UUID,
  actor_user_id UUID NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ke_project ON kb_events (project_id);
CREATE INDEX IF NOT EXISTS idx_ke_node ON kb_events (node_id);
CREATE INDEX IF NOT EXISTS idx_ke_document ON kb_events (document_id);
CREATE INDEX IF NOT EXISTS idx_ke_created ON kb_events (created_at);

CREATE TABLE IF NOT EXISTS kb_views (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  doc_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kv_user ON kb_views (user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kv_doc ON kb_views (doc_id);
