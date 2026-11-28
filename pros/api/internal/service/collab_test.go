package service

import (
	"encoding/json"

	"errors"
	"metamatrix/api/internal/model"
	"strings"
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

func (docOperationSQLite) TableName() string { return "kb_doc_operations" }

func openCollabSQLite(t *testing.T) *gorm.DB {
	t.Helper()
	db := openDocumentsSQLite(t)
	if err := db.AutoMigrate(
		&docOperationSQLite{},
		&knowledgePresenceSQLite{},
		&backupUserSQLite{},
		&projectSQLite{},
		&knowledgeMemberSQLite{},
		&knowledgeDocVersionSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

func attachCollabProject(t *testing.T, db *gorm.DB, ownerID, docID uuid.UUID) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	projectID := uuid.New()
	if err := db.Create(&projectSQLite{
		ID: projectID, OwnerUserID: ownerID, Name: "协同空间", Emoji: "📁",
		CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&backupDocumentSQLite{}).Where("id = ?", docID).Update("project_id", projectID).Error; err != nil {
		t.Fatal(err)
	}
	return projectID
}

func addCollabMember(t *testing.T, db *gorm.DB, projectID, ownerID uuid.UUID, role, name string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	memberID := uuid.New()
	if err := db.Create(&backupUserSQLite{
		ID: memberID, Email: memberID.String() + "@collab.test", DisplayName: name, PasswordHash: "x",
		CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&knowledgeMemberSQLite{
		ID: uuid.New(), ProjectID: projectID, UserID: memberID, Role: role, CreatedBy: ownerID,
		CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	return memberID
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

func TestCollabLeaveRemovesFromPresence(t *testing.T) {
	db := openCollabSQLite(t)
	store := newHybridPresenceStore(db)
	svc := NewCollabService(db, store)
	_, ownerID, docID, _ := newCollabFixture(t, db)
	projectID := attachCollabProject(t, db, ownerID, docID)
	viewerID := addCollabMember(t, db, projectID, ownerID, SpaceRoleViewer, "只读成员")

	if err := svc.Heartbeat(ownerID, docID, true, "para:1"); err != nil {
		t.Fatalf("owner heartbeat: %v", err)
	}
	if err := svc.Heartbeat(viewerID, docID, false, ""); err != nil {
		t.Fatalf("viewer heartbeat: %v", err)
	}
	users, err := svc.ListPresence(ownerID, docID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(users) != 2 {
		t.Fatalf("presence = %+v, want 2 users", users)
	}
	if err := svc.Leave(viewerID, docID); err != nil {
		t.Fatalf("viewer leave: %v", err)
	}
	users, err = svc.ListPresence(ownerID, docID)
	if err != nil {
		t.Fatalf("list after leave: %v", err)
	}
	if len(users) != 1 || users[0].UserID != ownerID.String() {
		t.Fatalf("after leave = %+v, want only owner", users)
	}
	if got := store.List(docID); len(got) != 1 || got[0].UserID != ownerID.String() {
		t.Fatalf("shared store after leave = %+v", got)
	}
	stranger := uuid.New()
	if err := svc.Leave(stranger, docID); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger leave err = %v, want ErrDocumentNotFound", err)
	}
	if got := store.List(docID); len(got) != 1 {
		t.Fatalf("stranger leave must not clear room, got %+v", got)
	}
}

func TestCollabEditorMemberCanWriteAndViewerIsReadOnly(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, _ := newCollabFixture(t, db)
	projectID := attachCollabProject(t, db, ownerID, docID)
	editorID := addCollabMember(t, db, projectID, ownerID, SpaceRoleEditor, "编辑成员")
	viewerID := addCollabMember(t, db, projectID, ownerID, SpaceRoleViewer, "只读成员")
	stranger := uuid.New()

	edAccess, err := svc.Authorize(editorID, docID)
	if err != nil || !edAccess.CanWrite || edAccess.Role != SpaceRoleEditor {
		t.Fatalf("editor access = %+v, err=%v", edAccess, err)
	}
	vwAccess, err := svc.Authorize(viewerID, docID)
	if err != nil || vwAccess.CanWrite || vwAccess.Role != SpaceRoleViewer {
		t.Fatalf("viewer access = %+v, err=%v, want read-only", vwAccess, err)
	}
	if _, err := svc.Authorize(stranger, docID); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger err = %v, want ErrDocumentNotFound", err)
	}

	op, err := svc.Append(editorID, docID, editorID, CollabOperationInput{Payload: []byte{0x11}, HTML: "<p>成员写入</p>"})
	if err != nil {
		t.Fatalf("editor append: %v", err)
	}
	if op.AuthorUserID != editorID {
		t.Fatalf("author = %s, want editor", op.AuthorUserID)
	}

	if _, err := svc.Append(viewerID, docID, viewerID, CollabOperationInput{Payload: []byte{0x12}}); !errors.Is(err, ErrCollabReadOnly) {
		t.Fatalf("viewer append err = %v, want ErrCollabReadOnly", err)
	}
	rows, err := svc.List(viewerID, docID, 0, 10)
	if err != nil {
		t.Fatalf("viewer list: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("viewer should see owner-space ops, got %d", len(rows))
	}
	if err := svc.Heartbeat(viewerID, docID, false, ""); err != nil {
		t.Fatalf("viewer heartbeat: %v", err)
	}
}

func TestCollabDerivedExtractAndCheckpointAfterFlush(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	title := "抽取文档"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}

	html := `<p data-block-id="22222222-2222-4222-8222-222222222222">检索可见正文</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{
		Payload: []byte{0x21},
		HTML:    html,
	}); err != nil {
		t.Fatal(err)
	}
	// 尚未 Flush 时不应强迫按键级抽取已经完成；给一个短窗口后强制执行。
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatalf("flush: %v", err)
	}

	fresh, err := docs.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(fresh.ContentText, "检索可见正文") {
		t.Fatalf("content_text = %q, want extracted html text", fresh.ContentText)
	}
	var blocks int64
	if err := db.Model(&model.CanvasContentBlock{}).Where("document_id = ?", doc.ID).Count(&blocks).Error; err != nil {
		t.Fatal(err)
	}
	if blocks == 0 {
		t.Fatal("expected canvas_content_blocks after flush")
	}
	if fresh.HeadRevisionID == nil || (doc.HeadRevisionID != nil && *fresh.HeadRevisionID == *doc.HeadRevisionID) {
		t.Fatalf("head revision should advance after checkpoint, was %v now %v", doc.HeadRevisionID, fresh.HeadRevisionID)
	}
	var versions int64
	if err := db.Model(&model.KnowledgeDocVersion{}).Where("document_id = ?", doc.ID).Count(&versions).Error; err != nil {
		t.Fatal(err)
	}
	if versions == 0 {
		t.Fatal("expected knowledge_doc_versions snapshot after flush")
	}
}

func TestCollabAppendWithoutHTMLDoesNotScheduleExtract(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	title := "无导出"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	before := doc.ContentText
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x31}}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}
	fresh, err := docs.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != doc.SaveVersion {
		t.Fatalf("save_version changed without html")
	}
	// Flush 仍会按当前 current_data 跑一次抽取；初稿文本应保持稳定而不是被清空。
	if fresh.ContentText == "" && before != "" {
		t.Fatalf("extract wiped content_text")
	}
}

func TestInspectDualWriteReportsOpsAheadAndRecovered(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	title := "双写校验"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}

	before, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatalf("inspect empty: %v", err)
	}
	if !before.Consistent || before.Reason != "no_ops" {
		t.Fatalf("empty report = %+v, want consistent no_ops", before)
	}

	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x01}}); err != nil {
		t.Fatal(err)
	}
	ahead, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ahead.Consistent || ahead.Reason != "ops_ahead_of_current_data" || ahead.OpsWithoutHTML != 1 {
		t.Fatalf("ahead report = %+v", ahead)
	}

	html := `<p data-block-id="33333333-3333-4333-8333-333333333333">双写正文</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x02}, HTML: html}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}
	// 后续带 HTML 的双写已追上 current_data；历史裸增量不再算「落后」。保存仍是双写。
	still, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !still.Consistent || still.Reason != "dual_write_in_sync" || still.OpsWithoutHTML != 0 {
		t.Fatalf("after later html dual-write, report = %+v, want dual_write_in_sync", still)
	}
	if !still.HasCurrentHTML || still.LastHTMLSaveVersion == 0 {
		t.Fatalf("expected current_data html after dual write: %+v", still)
	}
	if !still.HeadMatchesCurrent {
		t.Fatalf("head should match current_data after flush: %+v", still)
	}
}

func TestInspectDualWriteInSyncAfterHTMLOnly(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	title := "双写一致"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	html := `<p data-block-id="44444444-4444-4444-8444-444444444444">一致正文</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x11}, HTML: html}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}
	got, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Consistent || got.Reason != "dual_write_in_sync" || got.OpsWithoutHTML != 0 {
		t.Fatalf("report = %+v, want dual_write_in_sync", got)
	}
	if !got.HasCurrentHTML || !got.HeadMatchesCurrent {
		t.Fatalf("expected html and matching head: %+v", got)
	}
}

func TestCollabRevokeEditorMidSessionBlocksAppend(t *testing.T) {
	db := openCollabSQLite(t)
	svc, ownerID, docID, _ := newCollabFixture(t, db)
	projectID := attachCollabProject(t, db, ownerID, docID)
	editorID := addCollabMember(t, db, projectID, ownerID, SpaceRoleEditor, "会被收回的编辑")

	first, err := svc.Append(editorID, docID, editorID, CollabOperationInput{Payload: []byte{0x41}, HTML: "<p>收回前</p>"})
	if err != nil {
		t.Fatalf("editor append before revoke: %v", err)
	}

	if err := db.Model(&knowledgeMemberSQLite{}).
		Where("project_id = ? AND user_id = ?", projectID, editorID).
		Update("role", SpaceRoleViewer).Error; err != nil {
		t.Fatal(err)
	}

	access, err := svc.Authorize(editorID, docID)
	if err != nil || access.CanWrite || access.Role != SpaceRoleViewer {
		t.Fatalf("after revoke access = %+v err=%v, want viewer read-only", access, err)
	}
	if _, err := svc.Append(editorID, docID, editorID, CollabOperationInput{Payload: []byte{0x42}, HTML: "<p>收回后</p>"}); !errors.Is(err, ErrCollabReadOnly) {
		t.Fatalf("append after revoke err = %v, want ErrCollabReadOnly", err)
	}

	rows, err := svc.List(ownerID, docID, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Seq != first.Seq {
		t.Fatalf("ops after revoke = %+v, want only seq %d", rows, first.Seq)
	}
}

func TestCompactOperationsDeletesBeforeSnapshotAndLeavesInspectConsistent(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	svc.compactLimit = -1 // 本用例只测手动压缩
	title := "压缩日志"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x01}}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x02}}); err != nil {
		t.Fatal(err)
	}
	noop, err := svc.CompactOperations(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if noop.Reason != "no_snapshot" || noop.Deleted != 0 || noop.Kept != 2 {
		t.Fatalf("no snapshot compact = %+v, want no_snapshot kept=2", noop)
	}

	html := `<p data-block-id="55555555-5555-4555-8555-555555555555">快照正文</p>`
	snap, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{
		Kind:    collabOpSnapshot,
		Payload: []byte{0x03},
		HTML:    html,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x04}}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}

	got, err := svc.CompactOperations(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Reason != "compacted_before_snapshot" || got.SnapshotSeq != snap.Seq || got.Deleted != 2 || got.Kept != 2 {
		t.Fatalf("compact = %+v, want deleted 2 kept 2 at snapshot %d", got, snap.Seq)
	}

	var kinds []string
	if err := db.Model(&model.DocOperation{}).
		Where("document_id = ?", doc.ID).
		Order("seq asc").
		Pluck("kind", &kinds).Error; err != nil {
		t.Fatal(err)
	}
	if len(kinds) != 2 || kinds[0] != collabOpSnapshot || kinds[1] != collabOpUpdate {
		t.Fatalf("remaining kinds = %v, want snapshot then update", kinds)
	}

	ahead, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	// 快照之后还有一条未带 HTML 的增量，压缩不得把它删掉，双写校验应如实报落后。
	if ahead.Consistent || ahead.Reason != "ops_ahead_of_current_data" || ahead.OpsWithoutHTML != 1 {
		t.Fatalf("inspect after compact with later bare update = %+v, want ops_ahead_of_current_data", ahead)
	}
	if ahead.LastSnapshotSeq != snap.Seq {
		t.Fatalf("last snapshot seq = %d, want %d", ahead.LastSnapshotSeq, snap.Seq)
	}

	laterHTML := `<p data-block-id="55555555-5555-4555-8555-555555555555">压缩后追上</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x05}, HTML: laterHTML}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}
	report, err := svc.InspectDualWrite(doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !report.Consistent || report.Reason != "dual_write_in_sync" {
		t.Fatalf("inspect after compact and later html = %+v, want still dual_write_in_sync (still dual-write)", report)
	}
	if report.LastSnapshotSeq != snap.Seq {
		t.Fatalf("last snapshot seq = %d, want %d", report.LastSnapshotSeq, snap.Seq)
	}
}

func TestFlushDerivedCompactsWhenOverLimit(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	svc.compactLimit = 3
	title := "自动压缩"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		Data:       json.RawMessage(`{"type":"doc","html":"<p>初稿</p>"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x11}}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x12}}); err != nil {
		t.Fatal(err)
	}
	html := `<p data-block-id="66666666-6666-4666-8666-666666666666">自动快照</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{
		Kind:    collabOpSnapshot,
		Payload: []byte{0x13},
		HTML:    html,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x14}}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatal(err)
	}
	var kept int64
	if err := db.Model(&model.DocOperation{}).Where("document_id = ?", doc.ID).Count(&kept).Error; err != nil {
		t.Fatal(err)
	}
	if kept != 2 {
		t.Fatalf("kept after flush compact = %d, want 2 (snapshot + later update)", kept)
	}
}
