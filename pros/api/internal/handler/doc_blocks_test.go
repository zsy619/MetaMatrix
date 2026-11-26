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

const blockSecret = "doc-block-handler-test-secret"

type stubDocBlocks struct {
	actor uuid.UUID
	doc   uuid.UUID
	err   error
	rows  []model.DocBlock
}

func (s stubDocBlocks) ListBlocks(actorID, docID uuid.UUID) ([]model.DocBlock, error) {
	if s.err != nil {
		return nil, s.err
	}
	if actorID != s.actor || docID != s.doc {
		return nil, service.ErrDocumentNotFound
	}
	return s.rows, nil
}

func (s stubDocBlocks) GetBlock(actorID, docID, blockID uuid.UUID) (*model.DocBlock, error) {
	if s.err != nil {
		return nil, s.err
	}
	if actorID != s.actor || docID != s.doc {
		return nil, service.ErrDocumentNotFound
	}
	for i := range s.rows {
		if s.rows[i].ID == blockID {
			return &s.rows[i], nil
		}
	}
	return nil, service.ErrDocumentNotFound
}

func (s stubDocBlocks) ListBlockRefs(actorID, docID, blockID uuid.UUID) ([]model.DocBlockRef, error) {
	if s.err != nil {
		return nil, s.err
	}
	if actorID != s.actor || docID != s.doc {
		return nil, service.ErrDocumentNotFound
	}
	return nil, nil
}

func TestListBlocksHTTP(t *testing.T) {
	userID := uuid.New()
	docID := uuid.New()
	blockID := uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	parentID := uuid.MustParse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	backend := stubDocBlocks{
		actor: userID,
		doc:   docID,
		rows: []model.DocBlock{{
			ID: blockID, DocumentID: docID, ParentID: &parentID,
			BlockType: "paragraph", Depth: 1, Ordinal: 2,
			ContentText: "子块", CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
		}},
	}
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewDocBlockHandler(backend, blockSecret)
	engine.Use(middleware.AuthRequired(blockSecret))
	engine.GET("/documents/:id/blocks", h.ListBlocks)
	engine.GET("/documents/:id/blocks/:blockId", h.GetBlock)

	unauth := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/blocks", nil)
	if unauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated code = %d, want 401", unauth.Code)
	}

	otherTok, err := middleware.SignToken(blockSecret, uuid.New(), "other@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	forbidden := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/blocks", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + otherTok})
	if forbidden.Code != http.StatusNotFound {
		t.Fatalf("no-access code = %d, body = %s, want 404", forbidden.Code, forbidden.Body.String())
	}

	tok, err := middleware.SignToken(blockSecret, userID, "owner@test.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	ok := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/blocks", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + tok})
	if ok.Code != http.StatusOK {
		t.Fatalf("owner list code = %d, body = %s, want 200", ok.Code, ok.Body.String())
	}
	var listed []map[string]any
	if err := json.Unmarshal(ok.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0]["id"] != blockID.String() || listed[0]["blockType"] != "paragraph" {
		t.Fatalf("listed = %+v", listed)
	}
	if listed[0]["parentId"] != parentID.String() || listed[0]["depth"] != float64(1) || listed[0]["ordinal"] != float64(2) {
		t.Fatalf("shape = %+v", listed[0])
	}

	one := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/blocks/"+blockID.String(), nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + tok})
	if one.Code != http.StatusOK {
		t.Fatalf("get code = %d, body = %s, want 200", one.Code, one.Body.String())
	}

	missing := ut.PerformRequest(engine, http.MethodGet, "/documents/"+docID.String()+"/blocks/"+uuid.New().String(), nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + tok})
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing block code = %d, want 404", missing.Code)
	}
}
