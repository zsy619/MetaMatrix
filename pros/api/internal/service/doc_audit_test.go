package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

func docHTMLPayload(html string) json.RawMessage {
	raw, err := json.Marshal(map[string]string{"type": "doc", "html": html})
	if err != nil {
		panic(err)
	}
	return raw
}

func TestDocumentSaveWritesAudit(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	audits := NewDocAuditService(db)

	before := time.Now().UTC().Add(-time.Second)
	updated, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData: documentTestPayload("保存后应有审计"),
	})
	if err != nil {
		t.Fatal(err)
	}

	rows, err := audits.List(ownerID, doc.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("audit count = %d, want 1", len(rows))
	}
	row := rows[0]
	if row.UserID != ownerID || row.DocumentID != doc.ID {
		t.Fatalf("audit who/doc = %s %s, want %s %s", row.UserID, row.DocumentID, ownerID, doc.ID)
	}
	if row.Action != AuditActionSave {
		t.Fatalf("action = %q, want %q", row.Action, AuditActionSave)
	}
	if row.CreatedAt.Before(before) || row.CreatedAt.After(time.Now().UTC().Add(time.Second)) {
		t.Fatalf("createdAt = %s, want around now", row.CreatedAt)
	}
	if row.BlockID != "" {
		t.Fatalf("blockId = %q, want empty when payload has no data-block-id", row.BlockID)
	}
	if updated.SaveVersion <= doc.SaveVersion {
		t.Fatalf("save should have advanced version")
	}

	// 元数据保存不改 current_data，不应再写审计。
	title := "只改标题"
	ver := updated.SaveVersion
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         json.RawMessage(updated.CurrentData),
		Title:               &title,
		ExpectedSaveVersion: &ver,
	}); err != nil {
		t.Fatal(err)
	}
	rows, err = audits.List(ownerID, doc.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("after metadata save audit count = %d, want 1", len(rows))
	}
}

func TestDocumentSaveAuditRecordsBlockIDs(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	idA := "11111111-1111-1111-1111-111111111111"
	idB := "22222222-2222-2222-2222-222222222222"
	html := `<p data-block-id="` + idA + `">一段</p><p data-block-id="` + idB + `">二段</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(html)}); err != nil {
		t.Fatal(err)
	}
	rows, err := NewDocAuditService(db).List(ownerID, doc.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("audit count = %d, want 1 (must not write one row per block)", len(rows))
	}
	if rows[0].BlockID != idA {
		t.Fatalf("blockId = %q, want first id %q", rows[0].BlockID, idA)
	}
	if !strings.Contains(rows[0].Detail, idA) || !strings.Contains(rows[0].Detail, idB) {
		t.Fatalf("detail = %q, want both block ids", rows[0].Detail)
	}
}

func TestDocAuditListRequiresAccess(t *testing.T) {
	db := openCollabSQLite(t)
	docs, ownerID, doc := newDocumentFixture(t, db)
	if _, err := docs.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: documentTestPayload("权限")}); err != nil {
		t.Fatal(err)
	}
	projectID := attachCollabProject(t, db, ownerID, doc.ID)
	viewerID := addCollabMember(t, db, projectID, ownerID, "viewer", "只读成员")
	stranger := uuid.New()
	audits := NewDocAuditService(db)

	for _, uid := range []uuid.UUID{ownerID, viewerID} {
		rows, err := audits.List(uid, doc.ID, 10)
		if err != nil {
			t.Fatalf("list as %s: %v", uid, err)
		}
		if len(rows) != 1 {
			t.Fatalf("list as %s count = %d, want 1", uid, len(rows))
		}
	}
	if _, err := audits.List(stranger, doc.ID, 10); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger err = %v, want ErrDocumentNotFound", err)
	}
	if _, err := audits.List(ownerID, uuid.New(), 10); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("missing doc err = %v, want ErrDocumentNotFound", err)
	}
}

func TestCollabDerivedWritesSingleAudit(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, _ := newCollabFixture(t, db)
	html1 := `<p data-block-id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa">一</p>`
	html2 := `<p data-block-id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa">二</p>`
	if _, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind: "update", Payload: []byte{1, 2, 3}, HTML: html1,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind: "update", Payload: []byte{4, 5, 6}, HTML: html2,
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(docID); err != nil {
		t.Fatal(err)
	}
	rows, err := NewDocAuditService(db).List(ownerID, docID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("collab audit count = %d, want 1 (not one per WS update)", len(rows))
	}
	if rows[0].Action != AuditActionCollabSave || rows[0].UserID != ownerID || rows[0].DocumentID != docID {
		t.Fatalf("collab audit = %+v", rows[0])
	}
	if rows[0].BlockID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("blockId = %q", rows[0].BlockID)
	}

	var ops int64
	if err := db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&ops).Error; err != nil {
		t.Fatal(err)
	}
	if ops != 2 {
		t.Fatalf("doc_operation count = %d, want 2", ops)
	}
}
