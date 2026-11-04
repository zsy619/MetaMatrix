package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/google/uuid"
)

// stubDirectory 是一个不依赖数据库的通讯录后端。
// 它记录 handler 传下来的查询参数，测试据此断言搜索与分页行为。
type stubDirectory struct {
	users []service.DirectoryUserDTO
	err   error

	calls  int
	q      string
	limit  int
	offset int
}

func (s *stubDirectory) List(q string, limit, offset int) ([]service.DirectoryUserDTO, error) {
	s.calls++
	s.q = q
	s.limit = limit
	s.offset = offset
	if s.err != nil {
		return nil, s.err
	}
	return s.users, nil
}

const directorySecret = "directory-test-secret"

func newDirectoryEngine(stub *stubDirectory, auth bool) *route.Engine {
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewDirectoryHandler(stub)
	if auth {
		engine.Use(middleware.AuthRequired(directorySecret))
	}
	engine.GET("/directory/users", h.List)
	return engine
}

func directoryToken(t *testing.T) string {
	t.Helper()
	token, err := middleware.SignToken(directorySecret, uuid.New(), "tester@metamatrix.local", time.Hour)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func getWithToken(engine *route.Engine, path, token string) *ut.ResponseRecorder {
	if token == "" {
		return ut.PerformRequest(engine, http.MethodGet, path, nil)
	}
	return ut.PerformRequest(engine, http.MethodGet, path, nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + token})
}

func TestDirectoryUsersRequiresAuth(t *testing.T) {
	stub := &stubDirectory{}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users", "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "unauthorized") {
		t.Fatalf("body = %s, want unauthorized", rec.Body.String())
	}
	if stub.calls != 0 {
		t.Fatalf("backend called %d times, want 0", stub.calls)
	}
}

func TestDirectoryUsersRejectsBadToken(t *testing.T) {
	stub := &stubDirectory{}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users", "not-a-jwt")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if stub.calls != 0 {
		t.Fatalf("backend called %d times, want 0", stub.calls)
	}
}

func TestDirectoryUsersReturnsList(t *testing.T) {
	stub := &stubDirectory{users: []service.DirectoryUserDTO{
		{ID: "11111111-1111-1111-1111-111111111111", Name: "爱丽丝", Email: "alice@metamatrix.local"},
	}}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users", directoryToken(t))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	var rows []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if rows[0]["name"] != "爱丽丝" {
		t.Fatalf("name = %v", rows[0]["name"])
	}
	if rows[0]["email"] != "alice@metamatrix.local" {
		t.Fatalf("email = %v", rows[0]["email"])
	}
	for _, banned := range []string{"password", "hash", "secret", "token", "salt"} {
		if strings.Contains(strings.ToLower(rec.Body.String()), banned) {
			t.Fatalf("response leaks %q: %s", banned, rec.Body.String())
		}
	}
}

func TestDirectoryUsersPassesQueryAndCapsLimit(t *testing.T) {
	stub := &stubDirectory{}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users?q=alice&limit=500&offset=10", directoryToken(t))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if stub.calls != 1 {
		t.Fatalf("backend called %d times, want 1", stub.calls)
	}
	if stub.q != "alice" {
		t.Fatalf("q = %q, want alice", stub.q)
	}
	if stub.limit != service.DirectoryMaxLimit {
		t.Fatalf("limit = %d, want %d", stub.limit, service.DirectoryMaxLimit)
	}
	if stub.offset != 10 {
		t.Fatalf("offset = %d, want 10", stub.offset)
	}
	if got := rec.Header().Get("X-Limit"); got != "200" {
		t.Fatalf("X-Limit = %q, want 200", got)
	}
	if got := rec.Header().Get("X-Offset"); got != "10" {
		t.Fatalf("X-Offset = %q, want 10", got)
	}
}

func TestDirectoryUsersUsesDefaultPaging(t *testing.T) {
	stub := &stubDirectory{}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users", directoryToken(t))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if stub.limit != service.DirectoryDefaultLimit {
		t.Fatalf("limit = %d, want %d", stub.limit, service.DirectoryDefaultLimit)
	}
	if stub.offset != 0 {
		t.Fatalf("offset = %d, want 0", stub.offset)
	}
	if stub.q != "" {
		t.Fatalf("q = %q, want empty", stub.q)
	}
}

func TestDirectoryUsersEmptyResultIsEmptyArray(t *testing.T) {
	stub := &stubDirectory{}
	engine := newDirectoryEngine(stub, true)

	rec := getWithToken(engine, "/directory/users", directoryToken(t))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("body = %s, want []", rec.Body.String())
	}
}
