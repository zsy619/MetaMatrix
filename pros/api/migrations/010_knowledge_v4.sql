-- 知识库 4.0：模板作用域、页面属性扩展、分享口令与禁止复制、版本备注、
-- 存量节点作者回填。

ALTER TABLE kb_templates
  ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'personal';

ALTER TABLE kb_doc_properties
  ADD COLUMN IF NOT EXISTS members VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS milestone VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sprint VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS number DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE kb_shares
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS allow_copy BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE kb_doc_versions
  ADD COLUMN IF NOT EXISTS label VARCHAR(64) NOT NULL DEFAULT '';

-- 存量节点作者回填：旧数据没有 created_by，作者维度检索与图谱归属会失效。
UPDATE kb_nodes n
  SET created_by = p.owner_user_id
  FROM core_projects p
  WHERE n.project_id = p.id AND n.created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_kn_project_alias ON kb_nodes (project_id, alias);
