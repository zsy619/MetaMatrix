package handler

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/google/uuid"
)

const auditSecret = "doc-audit-handler-test-secret"

type stubDocAudit struct {
	actor uuid.UUID
	doc   uuid.UUID
	err   error
	rows  []model.DocAuditEvent
}

func (s stubDocAudit) List(actorID, docID uuid.UUID, limit int) ([]model.DocAuditEvent, error) {
	if s.err != nil {
		return nil, s.err
	}
	if actorID != s.actor || docID != s.doc {
		return nil, service.ErrDocumentNotFound
	}
	return s.rows, nil
}

func TestListAuditHTTP(t *testing.T) {
	userID := uuid.New()
	docID := uuid.New()
	eventID := uuid.New()
	created := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	backend := stubDocAudit{
		actor: userID,
		doc:   docID,
		rows: []model.DocAuditEvent{{
			ID: eventID, DocumentID: docID, UserID: userID,
			Action: service.AuditActionSave, BlockID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
			CreatedAt: created,
		}},
	}
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewDocAuditHandler(backend, auditSecret)
	engine.Use(middleware.AuthRequired(auditSecret))
	engine.GET("/documents/:id/audit", h.ListAudit)

	unauth := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/audit", nil)
	if unauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated code = %d, want 401", unauth.Code)
	}

	otherTok, err := middleware.SignToken(auditSecret, uuid.New(), "other@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	forbidden := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/audit", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + otherTok})
	if forbidden.Code != http.StatusNotFound {
		t.Fatalf("no-access code = %d, body = %s, want 404", forbidden.Code, forbidden.Body.String())
	}

	tok, err := middleware.SignToken(auditSecret, userID, "owner@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	ok := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/audit", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + tok})
	if ok.Code != http.StatusOK {
		t.Fatalf("owner code = %d, body = %s, want 200", ok.Code, ok.Body.String())
	}
	var got []auditEventJSON
	if err := json.Unmarshal(ok.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != eventID.String() || got[0].UserID != userID.String() ||
		got[0].DocumentID != docID.String() || got[0].Action != service.AuditActionSave ||
		got[0].BlockID != "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {
		t.Fatalf("body = %s", ok.Body.String())
	}
}
