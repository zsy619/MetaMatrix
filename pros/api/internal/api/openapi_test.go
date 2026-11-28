package api

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// routeRe 匹配 main.go 里的 `baseGroup.<METHOD>("<path>"` 注册语句。
var routeRe = regexp.MustCompile(`baseGroup\.(GET|POST|PUT|PATCH|DELETE)\("([^"]+)"`)

// paramRe 匹配 Hertz 路由参数：`:name`。
var paramRe = regexp.MustCompile(`:([A-Za-z_][A-Za-z0-9_]*)`)

// normalizePath 把 Hertz 路由写法转成 OpenAPI 写法：`:id` → `{id}`。
func normalizePath(p string) string {
	return paramRe.ReplaceAllString(p, "{$1}")
}

// TestRouteTableMatchesRegisteredRoutes 是「文档不漂移」的守卫：
// main.go 里注册的每一条 base 路由，都必须出现在 OpenAPI 规范里。
func TestRouteTableMatchesRegisteredRoutes(t *testing.T) {
	path := filepath.Join("..", "..", "cmd", "server", "main.go")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read main.go failed: %v", err)
	}
	content := string(raw)
	// 只取 baseGroup 段落。
	start := strings.Index(content, `baseGroup := h.Group("/projects/:projectId/base"`)
	if start < 0 {
		t.Fatal("baseGroup not found in main.go")
	}
	rest := content[start:]
	end := strings.Index(rest, "\n\tknowledge :=")
	if end < 0 {
		end = len(rest)
	}
	section := rest[:end]

	documented := map[string]bool{}
	for _, op := range RouteTable {
		documented[op.Method+" "+op.Path] = true
	}
	for _, m := range routeRe.FindAllStringSubmatch(section, -1) {
		method := m[1]
		full := "/projects/:projectId/base" + m[2]
		key := method + " " + normalizePath(full)
		if !documented[key] {
			t.Errorf("路由已注册但 OpenAPI 缺少：%s %s", method, normalizePath(full))
		}
	}
}

// TestOpenAPIDocumentShape 校验文档结构完整。
func TestOpenAPIDocumentShape(t *testing.T) {
	doc := BuildOpenAPI()
	if doc["openapi"] != "3.0.3" {
		t.Fatalf("unexpected openapi version: %v", doc["openapi"])
	}
	paths, ok := doc["paths"].(map[string]any)
	if !ok || len(paths) == 0 {
		t.Fatal("paths empty")
	}
	comps, ok := doc["components"].(map[string]any)
	if !ok {
		t.Fatal("components missing")
	}
	schemas, ok := comps["schemas"].(map[string]any)
	if !ok {
		t.Fatal("schemas missing")
	}
	// 每个引用的 schema 都必须存在。
	for _, op := range RouteTable {
		for _, name := range []string{op.RequestBody, op.Response} {
			if name == "" {
				continue
			}
			if _, ok := schemas[name]; !ok {
				t.Errorf("schema %q referenced by %s %s but not defined", name, op.Method, op.Path)
			}
		}
	}
	if _, ok := schemas["ErrorResponse"]; !ok {
		t.Error("ErrorResponse schema missing")
	}
}
