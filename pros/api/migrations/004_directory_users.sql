-- Organization directory columns on the existing core_users table.
-- GORM AutoMigrate applies equivalent at startup; this file documents them.
ALTER TABLE core_users ADD COLUMN IF NOT EXISTS department VARCHAR(128);
ALTER TABLE core_users ADD COLUMN IF NOT EXISTS role VARCHAR(128);
ALTER TABLE core_users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
CREATE INDEX IF NOT EXISTS idx_users_department ON core_users (department);
