package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
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
func (s stubCollab) Leave(ownerID, docID uuid.UUID) error {
	return s.listErr
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

type revokeAwareCollab struct {
	mu       sync.Mutex
	canWrite bool
	role     string
	appends  int
	authErr  error
	appendErr error
}

func (s *revokeAwareCollab) Authorize(userID, docID uuid.UUID) (*service.CollabAccess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.authErr != nil {
		return nil, s.authErr
	}
	return &service.CollabAccess{CanWrite: s.canWrite, Role: s.role}, nil
}

func (s *revokeAwareCollab) Append(ownerID, docID, authorID uuid.UUID, in service.CollabOperationInput) (*service.CollabOperation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.canWrite {
		return nil, service.ErrCollabReadOnly
	}
	if s.appendErr != nil {
		return nil, s.appendErr
	}
	s.appends++
	return &service.CollabOperation{
		Seq:          int64(s.appends),
		Kind:         "update",
		Payload:      in.Payload,
		AuthorUserID: authorID,
		CreatedAt:    time.Now().UTC(),
	}, nil
}

func (s *revokeAwareCollab) List(ownerID, docID uuid.UUID, after int64, limit int) ([]service.CollabOperation, error) {
	return nil, nil
}
func (s *revokeAwareCollab) Heartbeat(ownerID, docID uuid.UUID, editing bool, cursor string) error {
	return nil
}
func (s *revokeAwareCollab) ListPresence(ownerID, docID uuid.UUID) ([]service.PresenceUser, error) {
	return nil, nil
}
func (s *revokeAwareCollab) Leave(ownerID, docID uuid.UUID) error { return nil }

func TestHandleWSUpdateReauthorizesAfterRevoke(t *testing.T) {
	backend := &revokeAwareCollab{canWrite: true, role: "editor"}
	h := NewCollabHandler(backend, collabSecret)
	var out []wsOut
	client := &collabClient{
		docID:    uuid.New(),
		userID:   uuid.New(),
		canWrite: true,
		role:     "editor",
		writeFn: func(v any) error {
			msg, ok := v.(wsOut)
			if !ok {
				t.Fatalf("writeJSON got %T", v)
			}
			out = append(out, msg)
			return nil
		},
	}

	payload := base64.StdEncoding.EncodeToString([]byte{0x01})
	body, err := json.Marshal(wsIn{Type: "update", Payload: payload})
	if err != nil {
		t.Fatal(err)
	}
	h.handleWSMessage(client, body)
	if backend.appends != 1 {
		t.Fatalf("first update appends = %d, want 1; out=%+v", backend.appends, out)
	}

	backend.mu.Lock()
	backend.canWrite = false
	backend.role = "viewer"
	backend.mu.Unlock()
	out = nil
	h.handleWSMessage(client, body)
	if backend.appends != 1 {
		t.Fatalf("second update must not append, got %d", backend.appends)
	}
	if client.canWrite {
		t.Fatal("client.canWrite should be cleared after revoke")
	}
	var sawHello, sawReadonly bool
	for _, msg := range out {
		if msg.Type == "hello" && !msg.CanWrite && msg.Role == "viewer" {
			sawHello = true
		}
		if msg.Type == "error" && msg.Message == "collab room is read-only" {
			sawReadonly = true
		}
	}
	if !sawHello || !sawReadonly {
		t.Fatalf("after revoke messages = %+v, want hello(canWrite=false) and read-only error", out)
	}
}
