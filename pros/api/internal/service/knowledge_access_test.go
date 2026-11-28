package service

import (
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func openKnowledgeAccessSQLite(t *testing.T) (*gorm.DB, uuid.UUID, *model.Project, *KnowledgeService) {
	t.Helper()
	db, owner, project, svc := openKnowledgeV5SQLite(t)
	if err := db.AutoMigrate(&knowledgeMemberSQLite{}, &docOperationSQLite{}); err != nil {
		t.Fatal(err)
	}
	return db, owner, project, svc
}

func TestOutlineFromHTMLKeepsBlockID(t *testing.T) {
	items := OutlineFromHTML(`<h1 data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">一级</h1><h3 id="sec">三级</h3><h2>  </h2>`)
	if len(items) != 2 {
		t.Fatalf("items = %+v, want 2", items)
	}
	if items[0].BlockID != "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" || items[0].Text != "一级" {
		t.Fatalf("item0 = %+v", items[0])
	}
	if items[1].HTMLID != "sec" || items[1].Text != "三级" || items[1].Level != 3 {
		t.Fatalf("item1 = %+v", items[1])
	}
}

func TestDocumentAccessForVersionsCommentsAndProps(t *testing.T) {
	db, owner, project, svc := openKnowledgeAccessSQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "空间文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	if _, err := svc.UpsertDocProps(owner, docID, DocPropsInput{Status: strPtr("published"), Summary: strPtr("空间可见属性")}); err != nil {
		t.Fatal(err)
	}
	editor := addCollabMember(t, db, project.ID, owner, SpaceRoleEditor, "编辑成员")
	viewer := addCollabMember(t, db, project.ID, owner, SpaceRoleViewer, "浏览成员")
	stranger := uuid.New()

	props, err := svc.GetDocProps(editor, docID)
	if err != nil {
		t.Fatal(err)
	}
	if props.Status != "published" || props.Summary != "空间可见属性" {
		t.Fatalf("editor props = %+v, want owner-saved values", props)
	}
	if _, err := svc.GetDocProps(stranger, docID); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger GetDocProps = %v, want ErrDocumentNotFound", err)
	}
	if _, err := svc.UpsertDocProps(viewer, docID, DocPropsInput{Status: strPtr("archived")}); !errors.Is(err, ErrSpaceForbidden) {
		t.Fatalf("viewer UpsertDocProps = %v, want ErrSpaceForbidden", err)
	}

	if _, err := svc.AddCommentDetailed(viewer, docID, nil, "原文", "浏览者也可以评论", 0, 2, nil, nil, -1, `{"from":1}`); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.ListComments(editor, docID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].YRel != `{"from":1}` {
		t.Fatalf("comments = %+v", rows)
	}
	if _, err := svc.ListComments(stranger, docID); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger ListComments = %v, want ErrDocumentNotFound", err)
	}

	if err := SnapshotDocVersion(db, mustCanvasDoc(t, db, docID)); err != nil {
		t.Fatal(err)
	}
	versions, err := svc.ListDocVersions(editor, docID, 10)
	if err != nil || len(versions) == 0 {
		t.Fatalf("editor ListDocVersions = %v %+v", err, versions)
	}
	if _, err := svc.ListDocVersions(stranger, docID, 10); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger ListDocVersions = %v, want ErrDocumentNotFound", err)
	}
	if _, err := svc.LabelVersion(viewer, docID, versions[0].ID, "发布版"); !errors.Is(err, ErrSpaceForbidden) {
		t.Fatalf("viewer LabelVersion = %v, want ErrSpaceForbidden", err)
	}
	if _, err := svc.LabelVersion(editor, docID, versions[0].ID, "发布版"); err != nil {
		t.Fatal(err)
	}
}

func TestSnapshotDocVersionStoresYjsState(t *testing.T) {
	db, owner, project, svc := openKnowledgeAccessSQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "带协同快照", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	if err := db.Model(&model.CanvasDocument{}).Where("id = ?", docID).Update("current_data", datatypes.JSON(`{"type":"doc","html":"<p>正文</p>","yjsState":"YWJj"}`)).Error; err != nil {
		t.Fatal(err)
	}
	doc := mustCanvasDoc(t, db, docID)
	if err := SnapshotDocVersion(db, doc); err != nil {
		t.Fatal(err)
	}
	versions, err := svc.ListDocVersions(owner, docID, 10)
	if err != nil || len(versions) != 1 {
		t.Fatalf("versions = %v %+v", err, versions)
	}
	if versions[0].YjsState != "YWJj" {
		t.Fatalf("YjsState = %q, want YWJj", versions[0].YjsState)
	}

	// 没有 current_data.yjsState 时，回退到最近一条 snapshot 操作。
	raw := []byte{0x01, 0x02, 0x03}
	if err := db.Model(&model.CanvasDocument{}).Where("id = ?", docID).Updates(map[string]any{
		"current_data": datatypes.JSON(`{"type":"doc","html":"<p>新</p>"}`),
		"save_version": gorm.Expr("save_version + 1"),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&docOperationSQLite{
		ID: uuid.New(), DocumentID: docID, Seq: 1, Kind: collabOpSnapshot,
		Payload: raw, AuthorUserID: owner, SaveVersion: 2, CreatedAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := SnapshotDocVersion(db, mustCanvasDoc(t, db, docID)); err != nil {
		t.Fatal(err)
	}
	versions, err = svc.ListDocVersions(owner, docID, 10)
	if err != nil || len(versions) < 2 {
		t.Fatalf("versions after op = %v %+v", err, versions)
	}
	want := base64.StdEncoding.EncodeToString(raw)
	if versions[0].YjsState != want {
		t.Fatalf("latest YjsState = %q, want %s", versions[0].YjsState, want)
	}
}

func mustCanvasDoc(t *testing.T, db *gorm.DB, id uuid.UUID) *model.CanvasDocument {
	t.Helper()
	var doc model.CanvasDocument
	if err := db.Where("id = ?", id).First(&doc).Error; err != nil {
		t.Fatal(err)
	}
	return &doc
}
