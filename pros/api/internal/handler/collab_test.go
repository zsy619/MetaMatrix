package handler

import (
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

const collabSecret = "collab-handler-test-secret"

type stubCollab struct {
	listErr error
}

func (s stubCollab) Authorize(userID, docID uuid.UUID) (*service.CollabAccess, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return &service.CollabAccess{CanWrite: true, Role: "owner"}, nil
}
func (s stubCollab) Append(ownerID, docID, authorID uuid.UUID, in service.CollabOperationInput) (*service.CollabOperation, error) {
	return nil, s.listErr
}
func (s stubCollab) List(ownerID, docID uuid.UUID, after int64, limit int) ([]service.CollabOperation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return nil, nil
}
func (s stubCollab) Heartbeat(ownerID, docID uuid.UUID, editing bool, cursor string) error {
	return s.listErr
}
func (s stubCollab) ListPresence(ownerID, docID uuid.UUID) ([]service.PresenceUser, error) {
	return nil, s.listErr
}

func newCollabAuthEngine(backend collabBackend) *route.Engine {
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewCollabHandler(backend, collabSecret)
	engine.GET("/documents/:id/collab", h.ServeWS)
	engine.GET("/documents/:id/operations", middleware.AuthRequired(collabSecret), h.ListOperations)
	return engine
}

func TestCollabWSRequiresToken(t *testing.T) {
	engine := newCollabAuthEngine(stubCollab{})
	docID := uuid.New().String()

	rec := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID+"/collab", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no token code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "unauthorized") {
		t.Fatalf("body = %s, want unauthorized", rec.Body.String())
	}

	rec = ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID+"/collab?token=not-a-jwt", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad query token code = %d, body = %s", rec.Code, rec.Body.String())
	}

	rec = ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID+"/collab", nil,
		ut.Header{Key: "Authorization", Value: "Bearer not-a-jwt"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad bearer code = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCollabWSAcceptsQueryTokenThenRejectsUnknownDoc(t *testing.T) {
	engine := newCollabAuthEngine(stubCollab{listErr: service.ErrDocumentNotFound})
	uid := uuid.New()
	tok, err := middleware.SignToken(collabSecret, uid, "collab@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rec := ut.PerformRequest(engine, http.MethodGet, "/documents/"+uuid.New().String()+"/collab?token="+tok, nil)
	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("valid query token still unauthorized: %s", rec.Body.String())
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("valid query token, missing doc: code = %d, body = %s, want 404", rec.Code, rec.Body.String())
	}
}

func TestCollabOperationsHTTPRequiresBearer(t *testing.T) {
	engine := newCollabAuthEngine(stubCollab{})
	path := "/documents/" + uuid.New().String() + "/operations"
	rec := ut.PerformRequest(engine, http.MethodGet, path, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("operations without token code = %d", rec.Code)
	}
	// query token 不得用于普通 HTTP 操作日志接口（仍走 AuthRequired）。
	uid := uuid.New()
	tok, err := middleware.SignToken(collabSecret, uid, "collab@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rec = ut.PerformRequest(engine, http.MethodGet, path+"?token="+tok, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("operations query token should not authenticate, code = %d", rec.Code)
	}
}
