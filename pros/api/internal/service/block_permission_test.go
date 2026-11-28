package service

import (
	"errors"
	"testing"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

func TestBlockPermissionPolicy(t *testing.T) {
	if CanEditBlockContent("", "viewer", false) || CanSetBlockPermission("viewer", false) {
		t.Fatal("viewer must not edit or set permission")
	}
	if !CanEditBlockContent(BlockPermEdit, "editor", true) {
		t.Fatal("editor should edit inherit/edit blocks")
	}
	if CanEditBlockContent(BlockPermOwner, "editor", true) {
		t.Fatal("editor must not edit owner-only blocks")
	}
	if !CanEditBlockContent(BlockPermOwner, "owner", true) || !CanEditBlockContent(BlockPermOwner, "admin", true) {
		t.Fatal("owner/admin should edit owner-only blocks")
	}
	if CanEditBlockContent(BlockPermReadonly, "owner", true) {
		t.Fatal("readonly blocks cannot be edited until permission changes")
	}
	if !CanSetBlockPermission("owner", true) || !CanSetBlockPermission("admin", true) || CanSetBlockPermission("editor", true) {
		t.Fatal("only owner/admin can set block permission")
	}
	if perm, err := NormalizeBlockPermission("read"); err != nil || perm != BlockPermReadonly {
		t.Fatalf("normalize read = %q %v", perm, err)
	}
	if _, err := NormalizeBlockPermission("secret"); !errors.Is(err, ErrValidation) {
		t.Fatalf("unknown permission err = %v", err)
	}
}

func TestLockedBlockRejectsUnauthorizedSave(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	idA := "11111111-1111-4111-8111-111111111111"
	idB := "22222222-2222-4222-8222-222222222222"
	html := `<p data-block-id="` + idA + `">一段</p><p data-block-id="` + idB + `">二段</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(html)}); err != nil {
		t.Fatal(err)
	}
	blocks := NewDocBlockService(db)
	blockID, _ := uuid.Parse(idA)
	if _, err := blocks.UpdatePermission(ownerID, doc.ID, blockID, "readonly"); err != nil {
		t.Fatal(err)
	}
	got, err := blocks.GetBlock(ownerID, doc.ID, blockID)
	if err != nil || got.Permission != BlockPermReadonly {
		t.Fatalf("permission = %+v err=%v", got, err)
	}
	changed := `<p data-block-id="` + idA + `">一段被改</p><p data-block-id="` + idB + `">二段</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(changed)}); !errors.Is(err, ErrBlockPermission) {
		t.Fatalf("edit readonly: %v", err)
	}
	keepA := `<p data-block-id="` + idA + `">一段</p><p data-block-id="` + idB + `">二段改写</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(keepA)}); err != nil {
		t.Fatalf("editing another block should pass: %v", err)
	}
	deleted := `<p data-block-id="` + idB + `">二段改写</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(deleted)}); !errors.Is(err, ErrBlockPermission) {
		t.Fatalf("delete readonly: %v", err)
	}
	stranger := uuid.New()
	if _, err := blocks.UpdatePermission(stranger, doc.ID, blockID, "edit"); !errors.Is(err, ErrDocumentNotFound) && !errors.Is(err, ErrCollabReadOnly) && !errors.Is(err, ErrBlockPermission) {
		t.Fatalf("stranger set permission: %v", err)
	}
}

func TestUpdatePermissionPreservesStoredValue(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	idA := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData: docHTMLPayload(`<p data-block-id="` + idA + `">可见</p>`),
	}); err != nil {
		t.Fatal(err)
	}
	blocks := NewDocBlockService(db)
	blockID, _ := uuid.Parse(idA)
	if _, err := blocks.UpdatePermission(ownerID, doc.ID, blockID, "owner"); err != nil {
		t.Fatal(err)
	}
	var row model.DocBlock
	if err := db.Where("id = ?", blockID).First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.Permission != BlockPermOwner {
		t.Fatalf("stored = %q", row.Permission)
	}
}
