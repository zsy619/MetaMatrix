package service

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"metamatrix/api/internal/model"
)

func cloneTestStrPtr(s string) *string { return &s }

func TestBuildCloneRowsGivesNewIdAndSameContent(t *testing.T) {
	owner := uuid.New()
	srcID := uuid.New()
	revID := uuid.New()
	payload := []byte(`{"id":"dual-triangle","type":"dual-triangle","schemaVersion":1,"order":[3,1,2]}`)
	src := &model.CanvasDocument{
		ID:             srcID,
		OwnerUserID:    owner,
		CanvasType:     "dual-triangle",
		Title:          "需求评审",
		Notes:          "原备注",
		SchemaVersion:  1,
		CurrentData:    payload,
		ContentText:    "旧正文",
		HeadRevisionID: &revID,
		TemplateID:     cloneTestStrPtr("dual-triangle"),
	}
	now := time.Now().UTC()

	rows, err := buildCloneRows(owner, src, CloneDocumentInput{}, now)
	if err != nil {
		t.Fatal(err)
	}
	doc := rows.doc
	if doc.ID == src.ID {
		t.Fatal("clone reused the source document id")
	}
	if doc.ID == uuid.Nil {
		t.Fatal("clone has no id")
	}
	if doc.OwnerUserID != owner {
		t.Fatalf("owner = %s", doc.OwnerUserID)
	}
	if !bytes.Equal(doc.CurrentData, payload) {
		t.Fatalf("payload changed:\n%s\n%s", payload, doc.CurrentData)
	}
	if doc.Title != "需求评审（副本）" {
		t.Fatalf("title = %q", doc.Title)
	}
	if doc.Notes != "原备注" {
		t.Fatalf("notes = %q", doc.Notes)
	}
	if doc.TemplateID == nil || *doc.TemplateID != "dual-triangle" {
		t.Fatalf("template = %v", doc.TemplateID)
	}
	if doc.SchemaVersion != 1 {
		t.Fatalf("schema version = %d", doc.SchemaVersion)
	}
	// The clone points at its own head revision, not the source's.
	if doc.HeadRevisionID == nil || *doc.HeadRevisionID == revID {
		t.Fatalf("head revision = %v", doc.HeadRevisionID)
	}
	if *doc.HeadRevisionID != rows.rev.ID {
		t.Fatalf("head revision %s != revision row %s", *doc.HeadRevisionID, rows.rev.ID)
	}
	rev := rows.rev
	if rev.DocumentID != doc.ID {
		t.Fatalf("revision document = %s, want %s", rev.DocumentID, doc.ID)
	}
	if rev.ParentID != nil {
		t.Fatalf("clone revision has a parent: %v", *rev.ParentID)
	}
	if rev.RevisionType != "snapshot" {
		t.Fatalf("revision type = %q", rev.RevisionType)
	}
	if rev.Label == nil || *rev.Label != "clone" {
		t.Fatalf("revision label = %v", rev.Label)
	}
	if !bytes.Equal(rev.Payload, payload) {
		t.Fatalf("revision payload changed:\n%s\n%s", payload, rev.Payload)
	}
	// The source row must not be touched.
	if src.Title != "需求评审" || !bytes.Equal(src.CurrentData, payload) {
		t.Fatal("source document was mutated")
	}
}

func TestBuildCloneRowsHonorsOverrides(t *testing.T) {
	owner := uuid.New()
	src := &model.CanvasDocument{
		ID:            uuid.New(),
		OwnerUserID:   owner,
		CanvasType:    "dual-triangle",
		Title:         "需求评审",
		Notes:         "原备注",
		SchemaVersion: 1,
		CurrentData:   []byte(`{"id":"dual-triangle"}`),
	}
	title := "另一个副本"
	notes := "新备注"
	rows, err := buildCloneRows(owner, src, CloneDocumentInput{Title: &title, Notes: &notes}, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if rows.doc.Title != title {
		t.Fatalf("title = %q", rows.doc.Title)
	}
	if rows.doc.Notes != notes {
		t.Fatalf("notes = %q", rows.doc.Notes)
	}
}

func TestBuildCloneRowsRejectsBadInput(t *testing.T) {
	owner := uuid.New()
	src := &model.CanvasDocument{
		ID:          uuid.New(),
		OwnerUserID: owner,
		Title:       "需求评审",
		CurrentData: []byte(`{"id":"dual-triangle"}`),
	}
	tooLong := strings.Repeat("题", maxTitleRunes+1)
	if _, err := buildCloneRows(owner, src, CloneDocumentInput{Title: &tooLong}, time.Now().UTC()); err != ErrValidation {
		t.Fatalf("oversized title = %v", err)
	}
	bad := &model.CanvasDocument{
		ID:          uuid.New(),
		OwnerUserID: owner,
		Title:       "需求评审",
		CurrentData: []byte(`{"broken":`),
	}
	if _, err := buildCloneRows(owner, bad, CloneDocumentInput{}, time.Now().UTC()); err != ErrValidation {
		t.Fatalf("broken payload = %v", err)
	}
}

func TestClonePayloadCopiesBytesVerbatim(t *testing.T) {
	src := []byte(`{"id":"dual-triangle","type":"dual-triangle","schemaVersion":1,"order":[3,1,2],"big":12345678901234567890}`)
	got, err := clonePayload(src)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, src) {
		t.Fatalf("payload changed: %s", got)
	}
	// The copy must not share the backing array with the source.
	got[0] = '['
	if src[0] != '{' {
		t.Fatal("clone payload shares memory with the source")
	}
}

func TestClonePayloadRejectsInvalidJSON(t *testing.T) {
	if _, err := clonePayload(nil); err != ErrValidation {
		t.Fatalf("empty = %v", err)
	}
	if _, err := clonePayload([]byte(`{"a":`)); err != ErrValidation {
		t.Fatalf("broken = %v", err)
	}
}

func TestClonePayloadRejectsOversizedPayload(t *testing.T) {
	big := make([]byte, maxCanvasBytes+1)
	for i := range big {
		big[i] = 'a'
	}
	big[0] = '"'
	big[len(big)-1] = '"'
	if _, err := clonePayload(big); err != ErrPayloadTooLarge {
		t.Fatalf("oversized = %v", err)
	}
}

func TestCloneTitle(t *testing.T) {
	if got := cloneTitle("需求评审", nil); got != "需求评审"+CloneTitleSuffix {
		t.Fatalf("suffix = %q", got)
	}
	blank := "   "
	if got := cloneTitle("需求评审", &blank); got != "需求评审"+CloneTitleSuffix {
		t.Fatalf("blank override = %q", got)
	}
	custom := "新的副本"
	if got := cloneTitle("需求评审", &custom); got != custom {
		t.Fatalf("override = %q", got)
	}
	long := strings.Repeat("题", maxTitleRunes+10)
	if got := cloneTitle(long, nil); len([]rune(got)) != maxTitleRunes {
		t.Fatalf("truncated length = %d", len([]rune(got)))
	}
}
