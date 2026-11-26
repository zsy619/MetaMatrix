package service

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type docOperationSQLite struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	DocumentID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_doc_operation_doc_seq,priority:1"`
	Seq          int64     `gorm:"not null;uniqueIndex:idx_doc_operation_doc_seq,priority:2"`
	Kind         string    `gorm:"type:varchar(16);not null;default:'update'"`
	Payload      []byte    `gorm:""`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null"`
	SaveVersion  int64     `gorm:"not null;default:0"`
	CreatedAt    time.Time `gorm:"not null"`
}

func (docOperationSQLite) TableName() string { return "doc_operation" }

func openCollabSQLite(t *testing.T) *gorm.DB {
	t.Helper()
	db := openDocumentsSQLite(t)
	if err := db.AutoMigrate(&docOperationSQLite{}, &knowledgePresenceSQLite{}, &backupUserSQLite{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func newCollabFixture(t *testing.T, db *gorm.DB) (*CollabService, uuid.UUID, uuid.UUID, int64) {
	t.Helper()
	_, ownerID, doc := newDocumentFixture(t, db)
	db.Model(&backupUserSQLite{}).Where("id = ?", ownerID).Update("display_name", "协同作者")
	svc := NewCollabService(db, newHybridPresenceStore(db))
	return svc, ownerID, doc.ID, doc.SaveVersion
}

func TestCollabAppendPersistsOperation(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, _ := newCollabFixture(t, db)

	op, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind:    "update",
		Payload: []byte{0x01, 0x02, 0x03},
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if op.Seq != 1 {
		t.Fatalf("seq = %d, want 1", op.Seq)
	}
	if op.SaveVersion != 0 {
		t.Fatalf("saveVersion = %d, want 0 when html is omitted", op.SaveVersion)
	}

	rows, err := svc.List(ownerID, docID, 0, 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || string(rows[0].Payload) != string([]byte{0x01, 0x02, 0x03}) {
		t.Fatalf("list = %+v", rows)
	}

	second, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind:    "snapshot",
		Payload: []byte{0x04},
	})
	if err != nil {
		t.Fatalf("second append: %v", err)
	}
	if second.Seq != 2 || second.Kind != "snapshot" {
		t.Fatalf("second = %+v", second)
	}
}

func TestCollabAppendDualWritesCurrentData(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, prevVersion := newCollabFixture(t, db)

	html := `<p data-block-id="11111111-1111-4111-8111-111111111111">世界</p>`
	op, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind:    "update",
		Payload: []byte{0xaa},
		HTML:    html,
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if op.SaveVersion != prevVersion+1 {
		t.Fatalf("saveVersion = %d, want %d", op.SaveVersion, prevVersion+1)
	}

	docs := NewDocumentsService(db)
	got, err := docs.GetOwned(ownerID, docID)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if got.SaveVersion != prevVersion+1 {
		t.Fatalf("doc saveVersion = %d, want %d", got.SaveVersion, prevVersion+1)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(got.CurrentData, &payload); err != nil {
		t.Fatalf("current_data: %v", err)
	}
	if payload["html"] != html {
		t.Fatalf("current_data html = %#v, want %q", payload["html"], html)
	}
}

func TestCollabAppendWithoutHTMLLeavesCurrentData(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, prevVersion := newCollabFixture(t, db)
	docs := NewDocumentsService(db)
	before, err := docs.GetOwned(ownerID, docID)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{
		Kind:    "update",
		Payload: []byte{0x01},
	}); err != nil {
		t.Fatal(err)
	}
	after, err := docs.GetOwned(ownerID, docID)
	if err != nil {
		t.Fatal(err)
	}
	if after.SaveVersion != prevVersion {
		t.Fatalf("saveVersion changed to %d without html", after.SaveVersion)
	}
	if string(after.CurrentData) != string(before.CurrentData) {
		t.Fatalf("current_data changed without html: %s -> %s", before.CurrentData, after.CurrentData)
	}
}

func TestCollabRejectsEmptyPayloadAndForeignDoc(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, _ := newCollabFixture(t, db)

	if _, err := svc.Append(ownerID, docID, ownerID, CollabOperationInput{Payload: nil}); !errors.Is(err, ErrValidation) {
		t.Fatalf("empty payload err = %v, want ErrValidation", err)
	}
	stranger := uuid.New()
	if _, err := svc.Append(stranger, docID, stranger, CollabOperationInput{Payload: []byte{1}}); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("foreign append err = %v, want ErrDocumentNotFound", err)
	}
	if _, err := svc.List(stranger, docID, 0, 10); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("foreign list err = %v, want ErrDocumentNotFound", err)
	}
}

func TestCollabPresenceUsesSharedStore(t *testing.T) {
	db := openCollabSQLite(t)
	store := newHybridPresenceStore(db)
	svc := NewCollabService(db, store)
	_, ownerID, docID, _ := newCollabFixture(t, db)
	// 上面又建了一篇文档；用最后一个 fixture 的用户做心跳。
	if err := svc.Heartbeat(ownerID, docID, true, "para:1"); err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	users, err := svc.ListPresence(ownerID, docID)
	if err != nil {
		t.Fatalf("list presence: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("presence = %+v, want 1 user", users)
	}
	if users[0].UserID != ownerID.String() || users[0].Name == "" || !users[0].Editing {
		t.Fatalf("presence user = %+v", users[0])
	}
	// 同一 PresenceStore 实例从知识库路径也应能读到。
	if svc.Presence() != store {
		t.Fatalf("presence store was replaced; interface should keep the injected implementation")
	}
	also := store.List(docID)
	if len(also) != 1 || also[0].UserID != ownerID.String() {
		t.Fatalf("shared store list = %+v", also)
	}
}
