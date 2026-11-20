-- 知识库 3.0：节点结构化数据（表格/导图）、分享链接、历史版本快照、节点作者。
-- AutoMigrate 会建表，此文件记录 schema 供参考。

ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_kn_created_by ON knowledge_nodes (created_by);

CREATE TABLE IF NOT EXISTS knowledge_node_data (
  node_id UUID PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_shares (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  project_id UUID NOT NULL,
  token VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'view',
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_knowledge_share_token ON knowledge_shares (token);
CREATE INDEX IF NOT EXISTS idx_ks_document ON knowledge_shares (document_id);
CREATE INDEX IF NOT EXISTS idx_ks_project ON knowledge_shares (project_id);

CREATE TABLE IF NOT EXISTS knowledge_doc_versions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  author_user_id UUID NOT NULL,
  save_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kdv_doc ON knowledge_doc_versions (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kdv_author ON knowledge_doc_versions (author_user_id);
