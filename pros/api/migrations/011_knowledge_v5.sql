-- 知识库 5.0：模板属性、自定义字段、评论增强、节点权限、分享白名单、标签词库。

ALTER TABLE knowledge_nodes ADD COLUMN IF NOT EXISTS pinyin varchar(255) NOT NULL DEFAULT '';
ALTER TABLE knowledge_nodes ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'space';
ALTER TABLE knowledge_nodes ADD COLUMN IF NOT EXISTS allowed_users varchar(512) NOT NULL DEFAULT '';

ALTER TABLE knowledge_templates ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '[]';

ALTER TABLE doc_properties ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]';
ALTER TABLE doc_properties ADD COLUMN IF NOT EXISTS field_values jsonb NOT NULL DEFAULT '{}';

ALTER TABLE doc_comments ADD COLUMN IF NOT EXISTS anchor_from integer NOT NULL DEFAULT -1;
ALTER TABLE doc_comments ADD COLUMN IF NOT EXISTS anchor_to integer NOT NULL DEFAULT -1;
ALTER TABLE doc_comments ADD COLUMN IF NOT EXISTS mentions varchar(512) NOT NULL DEFAULT '';
ALTER TABLE doc_comments ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}';

ALTER TABLE knowledge_shares ADD COLUMN IF NOT EXISTS allow_users varchar(512) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS doc_comment_reads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    doc_id uuid NOT NULL,
    read_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dcr_user_doc ON doc_comment_reads (user_id, doc_id);

CREATE TABLE IF NOT EXISTS knowledge_tag_dict (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    tag varchar(64) NOT NULL,
    category varchar(32) NOT NULL DEFAULT '',
    aliases varchar(255) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ktd_project_tag ON knowledge_tag_dict (project_id, tag);
CREATE INDEX IF NOT EXISTS idx_ktd_project ON knowledge_tag_dict (project_id);
