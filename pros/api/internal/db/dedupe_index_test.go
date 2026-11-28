package db

import (
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// TestEnsureBaseDedupeIndexes 回归「表改名残留的重复索引」。
//
// 历史上每次表改名都会新建一份索引，旧名那份不会被删，
// 于是同一个列上挂着两个定义完全一样的索引 —— 每次写入都要多维护一份。
//
// 用例在临时 schema 里造出「同定义、不同名字」的一对索引，
// 验证 ensureBaseDedupeIndexes 只保留符合命名规范的那一个。
func TestEnsureBaseDedupeIndexes(t *testing.T) {
	url := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL"))
	if url == "" {
		url = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if url == "" {
		t.Skip("未配置 TEST_DATABASE_URL / DATABASE_URL，跳过重复索引用例")
	}
	admin, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("无法连接 Postgres：%v", err)
	}
	schema := "dedupe_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	if err := admin.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Skipf("无法创建临时 schema：%v", err)
	}
	t.Cleanup(func() { admin.Exec(`DROP SCHEMA IF EXISTS "` + schema + `" CASCADE`) })

	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	gdb, err := gorm.Open(postgres.Open(url+sep+"search_path="+schema),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open failed: %v", err)
	}
	if err := gdb.Exec(`CREATE TABLE base_records (
		id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_by uuid, deleted_at timestamptz)`).Error; err != nil {
		t.Fatalf("建表失败：%v", err)
	}
	// 造一对同定义、不同名的索引（模拟改名残留）。
	if err := gdb.Exec(`CREATE INDEX idx_base_record_created_by ON base_records (created_by)`).Error; err != nil {
		t.Fatalf("建索引失败：%v", err)
	}
	if err := gdb.Exec(`CREATE INDEX idx_base_records_created_by ON base_records (created_by)`).Error; err != nil {
		t.Fatalf("建索引失败：%v", err)
	}

	if err := ensureBaseDedupeIndexes(gdb); err != nil {
		t.Fatalf("ensureBaseDedupeIndexes 失败：%v", err)
	}
	// 幂等：再跑一次不应报错，也不应再删。
	if err := ensureBaseDedupeIndexes(gdb); err != nil {
		t.Fatalf("ensureBaseDedupeIndexes 二次执行失败：%v", err)
	}

	var names []string
	if err := gdb.Raw(`SELECT indexname FROM pg_indexes
		WHERE schemaname = current_schema() AND tablename = 'base_records'
		ORDER BY indexname`).Scan(&names).Error; err != nil {
		t.Fatalf("查询索引失败：%v", err)
	}
	count := 0
	for _, n := range names {
		if strings.Contains(n, "created_by") {
			count++
			if n != "idx_base_records_created_by" {
				t.Fatalf("应保留 idx_base_records_created_by，实际保留 %s", n)
			}
		}
	}
	if count != 1 {
		t.Fatalf("created_by 索引应只剩 1 个，实际 %d 个（%v）", count, names)
	}
}
