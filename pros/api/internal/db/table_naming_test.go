package db

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"metamatrix/api/internal/model"
)

// 本文件是表命名全局规则在数据库层的守卫：
//
//  1. 改名清单（tableRenames）自身必须自洽；
//  2. migrations/*.sql 里出现的表名必须符合全局规则。
//
// 规范见 docs/db-table-naming.md。

// TestTableRenamesAreConsistent：改名清单的目标名必须合法且唯一。
func TestTableRenamesAreConsistent(t *testing.T) {
	oldNames := map[string]bool{}
	newNames := map[string]bool{}
	for _, r := range tableRenames {
		if r.old == r.new {
			t.Errorf("改名清单里 %s → %s 没有实际改名", r.old, r.new)
		}
		if oldNames[r.old] {
			t.Errorf("改名清单里旧表名 %s 重复", r.old)
		}
		oldNames[r.old] = true
		if newNames[r.new] {
			t.Errorf("改名清单里新表名 %s 重复", r.new)
		}
		newNames[r.new] = true

		if err := model.ValidateTableName(r.new); err != nil {
			t.Errorf("改名目标 %s 不符合全局规则: %v", r.new, err)
		}
		// 旧名可能不合规（历史遗留），但不能与任何新名撞车。
		if oldNames[r.new] && r.new != r.old {
			t.Errorf("改名清单里 %s 同时是新名和旧名", r.new)
		}
	}
}

// TestRenamedTablesAreRegistered：新表名必须在 model.TableRegistry 里登记。
func TestRenamedTablesAreRegistered(t *testing.T) {
	for _, r := range tableRenames {
		found := false
		for _, e := range model.TableRegistry {
			if e.Name == r.new {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("改名目标 %s 没有在 model.TableRegistry 登记", r.new)
		}
	}
}

var (
	sqlCreateTable = regexp.MustCompile(`(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)`)
	sqlAlterTable  = regexp.MustCompile(`(?i)ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)`)
)

// TestMigrationTableNamesFollowGlobalRule：migrations 里的表名必须符合全局规则。
//
// 012_table_naming.sql 是历史改名脚本，里面出现旧表名是正常的，单独跳过。
func TestMigrationTableNamesFollowGlobalRule(t *testing.T) {
	dir := filepath.Join("..", "..", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", dir, err)
	}
	checked := 0
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sql") || strings.HasPrefix(name, "012_table_naming") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("读取 %s 失败: %v", name, err)
		}
		text := string(raw)
		for _, re := range []*regexp.Regexp{sqlCreateTable, sqlAlterTable} {
			for _, m := range re.FindAllStringSubmatch(text, -1) {
				table := m[1]
				if !isKnownTable(table) {
					continue // 临时表、CTE 名等
				}
				checked++
				if err := model.ValidateTableName(table); err != nil {
					t.Errorf("迁移 %s 里的表名 %s 不合规: %v", name, table, err)
				}
			}
		}
	}
	if checked == 0 {
		t.Fatal("没有校验到任何表名，规则可能失效")
	}
}

// isKnownTable 只校验登记在册的表名，避免把 CTE / 临时表当成违规。
func isKnownTable(name string) bool {
	for _, e := range model.TableRegistry {
		if e.Name == name {
			return true
		}
	}
	// 旧表名（改名之前的历史名）不在登记表里，但迁移脚本仍可能引用。
	for _, r := range tableRenames {
		if r.old == name {
			return true
		}
	}
	return false
}

// TestRegisteredTablesHaveMigrationOrAutoMigrate：登记表里的表要么在
// migrations 里有 CREATE TABLE，要么由 AutoMigrate 建表，二选一即可，
// 但不能两边都没有（否则新环境建不出来）。
func TestRegisteredTablesHaveMigrationOrAutoMigrate(t *testing.T) {
	dir := filepath.Join("..", "..", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", dir, err)
	}
	var text strings.Builder
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("读取 %s 失败: %v", e.Name(), err)
		}
		text.Write(raw)
	}
	migrationText := text.String()
	autoMigrateText := readFileString(t, "db.go")

	var missing []string
	for _, e := range model.TableRegistry {
		inMigration := strings.Contains(migrationText, "CREATE TABLE IF NOT EXISTS "+e.Name)
		inAutoMigrate := strings.Contains(autoMigrateText, "&model."+e.Model+"{}")
		if !inMigration && !inAutoMigrate {
			missing = append(missing, e.Name+" ("+e.Model+")")
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("以下表既没有 migration 建表，也没有在 AutoMigrate 注册：\n  %s",
			strings.Join(missing, "\n  "))
	}
}

func readFileString(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", name, err)
	}
	return string(raw)
}
