-- 知识库目录树。
-- 目录树与文档解耦：节点只存父子关系和排序，文档内容仍在 canvas_documents。
-- document_id 为 NULL 表示文件夹；非 NULL 指向一篇 canvas_documents。
-- 文档被删后 document_id 置 NULL（ON DELETE SET NULL），节点保留为「已失效」占位。
-- AutoMigrate 会建表，此文件记录 schema 供参考。

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  parent_id UUID,
  node_type VARCHAR(16) NOT NULL,          -- folder | doc
  document_id UUID,                         -- doc 节点指向 canvas_documents.id
  title VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon VARCHAR(16) NOT NULL DEFAULT '📄',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kn_project_parent
  ON knowledge_nodes (project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_kn_project_sort
  ON knowledge_nodes (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_kn_document
  ON knowledge_nodes (document_id);

-- 文档删除时节点不删，document_id 置 NULL。
-- GORM AutoMigrate 不建 FK 约束，这里显式补上。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_kn_document'
  ) THEN
    ALTER TABLE knowledge_nodes
      ADD CONSTRAINT fk_kn_document
      FOREIGN KEY (document_id) REFERENCES canvas_documents(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_kn_project'
  ) THEN
    ALTER TABLE knowledge_nodes
      ADD CONSTRAINT fk_kn_project
      FOREIGN KEY (project_id) REFERENCES projects(id)
      ON DELETE CASCADE;
  END IF;
END $$;
