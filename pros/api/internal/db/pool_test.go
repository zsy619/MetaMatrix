package db

import (
	"os"
	"strings"
	"testing"
)

// 连接池配置（P1-7）。
//
// 契约：连接数上限默认 50（原先 30），可被环境变量 / PoolOptions 覆盖。
// 这个值直接决定「并发查询 + 导入 worker + outbox 发布器 + SSE 订阅」能否共存，
// 配小了会表现为随机 404 / 500（连接等待超时），配大了会顶满 Postgres。
func TestConnectWithPoolAppliesConfiguredLimits(t *testing.T) {
	url := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL"))
	if url == "" {
		url = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过连接池用例")
	}
	os.Unsetenv("DB_MAX_OPEN_CONNS")
	os.Unsetenv("DB_MAX_IDLE_CONNS")

	gdb, err := ConnectWithPool(url, PoolOptions{})
	if err != nil {
		t.Fatalf("connect failed: %v", err)
	}
	pool, err := gdb.DB()
	if err != nil {
		t.Fatalf("get sql.DB failed: %v", err)
	}
	defer pool.Close()

	if got := pool.Stats().MaxOpenConnections; got != 50 {
		t.Fatalf("MaxOpenConnections = %d, want 50", got)
	}

	// 环境变量必须能覆盖（生产按机器规格调整）。
	t.Setenv("DB_MAX_OPEN_CONNS", "17")
	os.Unsetenv("DB_MAX_IDLE_CONNS")
	gdb2, err := ConnectWithPool(url, PoolOptions{})
	if err != nil {
		t.Fatalf("connect failed: %v", err)
	}
	pool2, err := gdb2.DB()
	if err != nil {
		t.Fatalf("get sql.DB failed: %v", err)
	}
	defer pool2.Close()
	if got := pool2.Stats().MaxOpenConnections; got != 17 {
		t.Fatalf("环境变量未生效：MaxOpenConnections = %d, want 17", got)
	}

	// PoolOptions 也必须能覆盖（压测工具按需放大）。
	os.Unsetenv("DB_MAX_OPEN_CONNS")
	gdb3, err := ConnectWithPool(url, PoolOptions{MaxOpenConns: 64, MaxIdleConns: 16})
	if err != nil {
		t.Fatalf("connect failed: %v", err)
	}
	pool3, err := gdb3.DB()
	if err != nil {
		t.Fatalf("get sql.DB failed: %v", err)
	}
	defer pool3.Close()
	if got := pool3.Stats().MaxOpenConnections; got != 64 {
		t.Fatalf("PoolOptions 未生效：MaxOpenConnections = %d, want 64", got)
	}
}
