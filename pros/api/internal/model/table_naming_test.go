package model

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// 本文件是「表命名全局规则」的机器守卫。
//
// 规则对人类与任何智能体（Claude Code / Codex / Grok / Hermes / DeepSeek 等）一视同仁：
// 只要在 CI 里改动表，违反规则就会红。规范原文见 docs/db-table-naming.md。

// tableModel 是一次 AST 扫描的产物：一个「表模型」结构体及其声明的表名。
type tableModel struct {
	structName string
	tableName  string
	hasMethod  bool
}

// scanTableModels 用 AST 扫描本包，找出所有「带 gorm 主键的导出结构体」。
//
// 带主键 = 会被 GORM 当成表模型；这类结构体必须显式写 TableName()，
// 否则 GORM 会按结构体名推导表名，绕过全局命名规则。
func scanTableModels(t *testing.T) []tableModel {
	t.Helper()

	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi os.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, parser.ParseComments)
	if err != nil {
		t.Fatalf("解析 model 包失败: %v", err)
	}

	var out []tableModel
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			// 收集该文件里所有 TableName 方法：接收者类型 → 返回的表名字面量。
			names := map[string]string{}
			methods := map[string]bool{}
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Name.Name != "TableName" || fn.Recv == nil || len(fn.Recv.List) == 0 {
					continue
				}
				recv, ok := fn.Recv.List[0].Type.(*ast.Ident)
				if !ok {
					continue
				}
				methods[recv.Name] = true
				if fn.Body == nil || len(fn.Body.List) != 1 {
					continue
				}
				ret, ok := fn.Body.List[0].(*ast.ReturnStmt)
				if !ok || len(ret.Results) != 1 {
					continue
				}
				lit, ok := ret.Results[0].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				if value, err := strconv.Unquote(lit.Value); err == nil {
					names[recv.Name] = value
				}
			}

			for _, decl := range file.Decls {
				gen, ok := decl.(*ast.GenDecl)
				if !ok || gen.Tok != token.TYPE {
					continue
				}
				for _, spec := range gen.Specs {
					ts, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}
					if !ts.Name.IsExported() {
						continue
					}
					st, ok := ts.Type.(*ast.StructType)
					if !ok || !hasGormPrimaryKey(st) {
						continue
					}
					out = append(out, tableModel{
						structName: ts.Name.Name,
						tableName:  names[ts.Name.Name],
						hasMethod:  methods[ts.Name.Name],
					})
				}
			}
		}
	}
	return out
}

func hasGormPrimaryKey(st *ast.StructType) bool {
	for _, field := range st.Fields.List {
		if field.Tag == nil {
			continue
		}
		tag, err := strconv.Unquote(field.Tag.Value)
		if err != nil {
			continue
		}
		if strings.Contains(tag, "primaryKey") {
			return true
		}
	}
	return false
}

// TestTableModelsMustDeclareTableName：表模型必须显式声明 TableName()。
func TestTableModelsMustDeclareTableName(t *testing.T) {
	models := scanTableModels(t)
	if len(models) == 0 {
		t.Fatal("没有扫描到任何表模型，AST 规则可能失效")
	}
	for _, m := range models {
		if !m.hasMethod {
			t.Errorf("模型 %s 是表模型（带 gorm 主键）却没写 TableName()："+
				"GORM 会按结构体名推导表名，违反全局命名规则", m.structName)
		}
	}
}

// TestTableNamesFollowGlobalRule：所有表名必须满足「域前缀白名单 + 复数 + 已登记」。
func TestTableNamesFollowGlobalRule(t *testing.T) {
	models := scanTableModels(t)
	for _, m := range models {
		if !m.hasMethod {
			continue // 上一条测试已经报过
		}
		if m.tableName == "" {
			t.Errorf("模型 %s 的 TableName() 没有返回字符串字面量", m.structName)
			continue
		}
		if err := ValidateTableName(m.tableName); err != nil {
			t.Errorf("模型 %s 的表名不合规: %v", m.structName, err)
		}
	}
}

// TestTableRegistryMatchesModels：登记表必须与模型一一对应。
func TestTableRegistryMatchesModels(t *testing.T) {
	models := scanTableModels(t)
	used := map[string]string{}
	for _, m := range models {
		if !m.hasMethod || m.tableName == "" {
			continue
		}
		if prev, ok := used[m.tableName]; ok {
			t.Errorf("表名 %s 被 %s 与 %s 同时使用", m.tableName, prev, m.structName)
		}
		used[m.tableName] = m.structName
	}

	registered := map[string]bool{}
	for _, e := range TableRegistry {
		if registered[e.Name] {
			t.Errorf("登记表里 %s 重复", e.Name)
		}
		registered[e.Name] = true
		if e.Domain != "" {
			if got, ok := DomainOfTable(e.Name); !ok || got != e.Domain {
				t.Errorf("登记表 %s 的域标注是 %q，与表名推出来的域 %q 不一致", e.Name, e.Domain, got)
			}
		}
		if e.Model == "" {
			t.Errorf("登记表 %s 没有写对应的 Go 结构体", e.Name)
			continue
		}
		if got, ok := used[e.Name]; ok && got != e.Model {
			t.Errorf("登记表 %s 标注的模型是 %s，实际是 %s", e.Name, e.Model, got)
		}
	}

	for name, model := range used {
		if !registered[name] {
			t.Errorf("模型 %s 使用的表 %s 没有在 TableRegistry 登记", model, name)
		}
	}
}

// TestTableRegistryEntityNamesUnique：同一域内不允许出现同义实体名。
func TestTableRegistryEntityNamesUnique(t *testing.T) {
	seen := map[string]string{}
	for _, e := range TableRegistry {
		domain, ok := DomainOfTable(e.Name)
		if !ok {
			t.Errorf("登记表 %s 的域前缀不合法", e.Name)
			continue
		}
		entity := strings.TrimPrefix(e.Name, domain+"_")
		key := domain + "/" + entity
		if prev, ok := seen[key]; ok {
			t.Errorf("%s 与 %s 在 %s 域内实体名重复", prev, e.Name, domain)
		}
		seen[key] = e.Name
	}
}

// TestDocsTableCatalogMatchesRegistry：docs/db-tables.json 必须与登记表一致，
// 保证任何智能体读到的表清单都是最新的。
func TestDocsTableCatalogMatchesRegistry(t *testing.T) {
	root := repoRoot(t)
	path := filepath.Join(root, "docs", "db-tables.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", path, err)
	}
	var doc struct {
		Domains []string `json:"domains"`
		Tables  []struct {
			Name     string `json:"name"`
			Domain   string `json:"domain"`
			Purpose  string `json:"purpose"`
			Model    string `json:"model"`
			MassNoun bool   `json:"massNoun"`
		} `json:"tables"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("解析 %s 失败: %v", path, err)
	}

	if len(doc.Domains) != len(TableDomains) {
		t.Errorf("docs/db-tables.json 的域数量 %d 与代码 %d 不一致", len(doc.Domains), len(TableDomains))
	} else {
		for i, d := range doc.Domains {
			if d != TableDomains[i] {
				t.Errorf("docs/db-tables.json 的域 %q 与代码 %q 不一致", d, TableDomains[i])
			}
		}
	}

	if len(doc.Tables) != len(TableRegistry) {
		t.Fatalf("docs/db-tables.json 有 %d 张表，登记表有 %d 张", len(doc.Tables), len(TableRegistry))
	}
	byName := map[string]int{}
	for i, e := range TableRegistry {
		byName[e.Name] = i
	}
	for _, dt := range doc.Tables {
		idx, ok := byName[dt.Name]
		if !ok {
			t.Errorf("docs/db-tables.json 里的 %s 不在登记表里", dt.Name)
			continue
		}
		e := TableRegistry[idx]
		if dt.Domain != e.Domain || dt.Purpose != e.Purpose || dt.Model != e.Model || dt.MassNoun != e.MassNoun {
			t.Errorf("docs/db-tables.json 的 %s 与登记表不一致", dt.Name)
		}
	}
}

// repoRoot 向上找到同时包含 pros/ 与 docs/ 的仓库根目录。
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("取工作目录失败: %v", err)
	}
	for i := 0; i < 8; i++ {
		if info, err := os.Stat(filepath.Join(dir, "docs")); err == nil && info.IsDir() {
			if info2, err := os.Stat(filepath.Join(dir, "pros")); err == nil && info2.IsDir() {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatal("找不到仓库根目录")
	return ""
}

// TestTableRegistrySorted：登记表按域、表名排序，方便人读与 diff。
func TestTableRegistrySorted(t *testing.T) {
	domainOrder := map[string]int{}
	for i, d := range TableDomains {
		domainOrder[d] = i
	}
	seenDomain := -1
	var lastName string
	for _, e := range TableRegistry {
		idx, ok := domainOrder[e.Domain]
		if !ok {
			t.Errorf("登记表 %s 的域 %q 不在白名单里", e.Name, e.Domain)
			continue
		}
		if idx < seenDomain {
			t.Errorf("登记表 %s 的域 %q 出现在 %s 之后，域分组顺序应与 TableDomains 一致", e.Name, e.Domain, TableDomains[seenDomain])
		}
		if idx != seenDomain {
			seenDomain = idx
			lastName = ""
		}
		if lastName != "" && e.Name <= lastName {
			t.Errorf("登记表 %s 在 %s 域内没有按表名字母序排列", e.Name, e.Domain)
		}
		lastName = e.Name
	}
	_ = sort.Strings
}
