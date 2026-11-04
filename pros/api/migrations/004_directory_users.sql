-- Organization directory columns on the existing users table.
-- GORM AutoMigrate applies equivalent at startup; this file documents them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);
