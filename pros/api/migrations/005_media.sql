-- Private media library. GORM AutoMigrate creates the same tables at startup.
-- user_id is required on every table, including references.
-- sha256 is unique per user, not globally. Paths stored here are relative.

CREATE TABLE IF NOT EXISTS media_category (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(128) NOT NULL,
  parent_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_category_user ON media_category (user_id);

CREATE TABLE IF NOT EXISTS media_asset (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  category_id UUID,
  media_type VARCHAR(16) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  storage_disk VARCHAR(32) NOT NULL DEFAULT 'local',
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  feishu_media_token VARCHAR(128) NOT NULL DEFAULT '',
  feishu_parent_type VARCHAR(32) NOT NULL DEFAULT '',
  feishu_parent_node VARCHAR(128) NOT NULL DEFAULT '',
  feishu_sync_status VARCHAR(32) NOT NULL DEFAULT 'not_configured',
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_asset (user_id, sha256);
CREATE INDEX IF NOT EXISTS idx_media_asset_user ON media_asset (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_reference (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  ref_type VARCHAR(32) NOT NULL,
  ref_id VARCHAR(128) NOT NULL,
  inserted_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_reference_user ON media_reference (user_id);
CREATE INDEX IF NOT EXISTS idx_media_reference_asset ON media_reference (asset_id);
