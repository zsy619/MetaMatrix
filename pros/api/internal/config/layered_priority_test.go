package config

import (
	"os"
	"path/filepath"
	"testing"
)

// 分层配置优先级（P2-16）。
//
// 契约：环境变量 > 环境层（${APP_ENV}.yaml）> 基础层（default.yaml）> 代码默认值。
//
// 为什么必须锁住：生产改密只改环境变量，如果优先级被改错，
// 生产会静默地用上配置文件里的旧密钥 —— 这是最危险的一类回归。
func TestLayeredConfigPriority(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("default.yaml", "server:\n  port: 3000\ndatabase:\n  maxOpenConns: 50\n")
	write("prod.yaml", "server:\n  port: 8080\ndatabase:\n  maxOpenConns: 77\n")
	write("dev.yaml", "server:\n  port: 5173\ndatabase:\n  maxOpenConns: 11\n")

	t.Setenv("CONFIG_DIR", dir)
	t.Setenv("APP_ENV", "prod")
	os.Unsetenv("PORT")
	os.Unsetenv("DB_MAX_OPEN_CONNS")

	// 1) 环境层覆盖基础层。
	layer := loadLayered()
	if got := layer.int("DB_MAX_OPEN_CONNS", func(c yamlConfig) *int { return c.Database.MaxOpenConns }, 50); got != 77 {
		t.Fatalf("环境层未覆盖基础层：maxOpenConns = %d, want 77", got)
	}

	// 2) 环境变量覆盖环境层。
	t.Setenv("DB_MAX_OPEN_CONNS", "123")
	layer = loadLayered()
	if got := layer.int("DB_MAX_OPEN_CONNS", func(c yamlConfig) *int { return c.Database.MaxOpenConns }, 50); got != 123 {
		t.Fatalf("环境变量未覆盖环境层：maxOpenConns = %d, want 123", got)
	}
	t.Setenv("PORT", "9090")
	if got := layer.int("PORT", func(c yamlConfig) *int { return c.Server.Port }, 3000); got != 9090 {
		t.Fatalf("环境变量未覆盖环境层：port = %d, want 9090", got)
	}

	// 3) 换一个 APP_ENV，环境层也随之切换。
	os.Unsetenv("PORT")
	os.Unsetenv("DB_MAX_OPEN_CONNS")
	t.Setenv("APP_ENV", "dev")
	layer = loadLayered()
	if got := layer.int("DB_MAX_OPEN_CONNS", func(c yamlConfig) *int { return c.Database.MaxOpenConns }, 50); got != 11 {
		t.Fatalf("APP_ENV=dev 未生效：maxOpenConns = %d, want 11", got)
	}

	// 4) 配置文件缺失 / 写坏时退回代码默认值，服务不能起不来。
	if err := os.WriteFile(filepath.Join(dir, "dev.yaml"), []byte("server: [oops\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	layer = loadLayered()
	if got := layer.int("DB_MAX_OPEN_CONNS", func(c yamlConfig) *int { return c.Database.MaxOpenConns }, 50); got != 50 {
		t.Fatalf("损坏的环境层应退回代码默认值：maxOpenConns = %d, want 50", got)
	}
}
