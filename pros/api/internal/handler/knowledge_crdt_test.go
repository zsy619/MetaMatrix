package handler

import (
	"bytes"
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

const crdtBypassSecret = "crdt-readonly-test-secret"

func TestAppendCRDTHTTPRejectsWrites(t *testing.T) {
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewKnowledgeHandler(&service.KnowledgeService{}, crdtBypassSecret)
	engine.Use(middleware.AuthRequired(crdtBypassSecret))
	engine.POST("/documents/:id/crdt", h.AppendCRDT)

	docID := uuid.New().String()
	body := `{"kind":"update","payload":"AQID"}`

	noAuth := ut.PerformRequest(engine, http.MethodPost, "/documents/"+docID+"/crdt",
		&ut.Body{Body: bytes.NewReader([]byte(body)), Len: len(body)})
	if noAuth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated POST code = %d, want 401", noAuth.Code)
	}

	token, err := middleware.SignToken(crdtBypassSecret, uuid.New(), "crdt@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rec := ut.PerformRequest(engine, http.MethodPost, "/documents/"+docID+"/crdt",
		&ut.Body{Body: bytes.NewReader([]byte(body)), Len: len(body)},
		ut.Header{Key: "Authorization", Value: "Bearer " + token},
		ut.Header{Key: "Content-Type", Value: "application/json"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("POST /crdt code = %d, body = %s, want 403", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "crdt_read_only") && !strings.Contains(rec.Body.String(), "read-only") {
		t.Fatalf("POST /crdt body = %s, want read-only rejection", rec.Body.String())
	}
}
