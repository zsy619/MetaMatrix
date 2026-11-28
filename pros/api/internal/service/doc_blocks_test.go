package service

import (
	"errors"
	"testing"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

func TestDocBlocksUpsertAndSoftDeleteOnSave(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	idA := "11111111-1111-4111-8111-111111111111"
	idB := "22222222-2222-4222-8222-222222222222"
	idC := "33333333-3333-4333-8333-333333333333"
	html1 := `<p data-block-id="` + idA + `">一段</p><div data-type="callout" data-block-id="` + idB + `"><p data-block-id="` + idC + `">子块</p></div>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(html1)}); err != nil {
		t.Fatal(err)
	}

	var rows []model.DocBlock
	if err := db.Where("document_id = ?", doc.ID).Order("ordinal ASC").Find(&rows).Error; err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("doc_blocks = %d, want 3", len(rows))
	}
	if rows[0].ID.String() != idA || rows[0].BlockType != "paragraph" || rows[0].Depth != 0 || rows[0].ParentID != nil {
		t.Fatalf("block A = %+v", rows[0])
	}
	if rows[1].ID.String() != idB || rows[1].BlockType != "callout" {
		t.Fatalf("block B = %+v", rows[1])
	}
	if rows[2].ID.String() != idC || rows[2].ParentID == nil || rows[2].ParentID.String() != idB || rows[2].Depth != 1 {
		t.Fatalf("block C = %+v", rows[2])
	}

	html2 := `<p data-block-id="` + idA + `">一段改写</p>`
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(html2)}); err != nil {
		t.Fatal(err)
	}
	var after []model.DocBlock
	if err := db.Where("document_id = ?", doc.ID).Order("ordinal ASC").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if len(after) != 3 {
		t.Fatalf("after save all rows (incl soft-deleted) = %d, want 3", len(after))
	}
	var live, gone []model.DocBlock
	for _, row := range after {
		if row.DeletedAt == nil {
			live = append(live, row)
		} else {
			gone = append(gone, row)
		}
	}
	if len(live) != 1 || live[0].ID.String() != idA || live[0].ContentText != "一段改写" {
		t.Fatalf("live = %+v, want only updated A", live)
	}
	if len(gone) != 2 {
		t.Fatalf("soft-deleted = %d, want 2 (B and C still stored)", len(gone))
	}
}

func TestDocBlockListRequiresAccess(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	blocks := NewDocBlockService(db)
	_, ownerID, _, _ := newCollabFixture(t, db)
	title := "块表文档"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title: &title, CanvasType: &canvasType,
		Data: docHTMLPayload(`<p data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">可见</p>`),
	})
	if err != nil {
		t.Fatal(err)
	}
	projectID := attachCollabProject(t, db, ownerID, doc.ID)
	viewerID := addCollabMember(t, db, projectID, ownerID, SpaceRoleViewer, "只读成员")
	stranger := uuid.New()

	rows, err := blocks.ListBlocks(ownerID, doc.ID)
	if err != nil || len(rows) != 1 || rows[0].BlockType != "paragraph" || rows[0].Depth != 0 {
		t.Fatalf("owner list = %+v err=%v", rows, err)
	}
	if rows[0].DeletedAt != nil {
		t.Fatal("list must omit soft-deleted rows")
	}
	got, err := blocks.ListBlocks(viewerID, doc.ID)
	if err != nil || len(got) != 1 {
		t.Fatalf("viewer list = %+v err=%v", got, err)
	}
	if _, err := blocks.ListBlocks(stranger, doc.ID); !errorsIsNotFound(err) {
		t.Fatalf("stranger list err = %v, want ErrDocumentNotFound", err)
	}
	if _, err := blocks.GetBlock(stranger, doc.ID, rows[0].ID); !errorsIsNotFound(err) {
		t.Fatalf("stranger get err = %v, want ErrDocumentNotFound", err)
	}
	missing := uuid.New()
	if _, err := blocks.ListBlocks(ownerID, missing); !errorsIsNotFound(err) {
		t.Fatalf("missing doc err = %v, want ErrDocumentNotFound", err)
	}

	// 删掉正文中的块后再 List，不应再返回它。
	if _, err := docs.Update(ownerID, doc.ID, UpdateDocumentInput{CurrentData: docHTMLPayload(`<p data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">新块</p>`)}); err != nil {
		t.Fatal(err)
	}
	listed, err := blocks.ListBlocks(ownerID, doc.ID)
	if err != nil || len(listed) != 1 || listed[0].ID.String() != "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" {
		t.Fatalf("after delete list = %+v err=%v", listed, err)
	}
	if _, err := blocks.GetBlock(ownerID, doc.ID, rows[0].ID); !errorsIsNotFound(err) {
		t.Fatalf("get soft-deleted err = %v, want ErrDocumentNotFound", err)
	}
}

func TestCollabFlushWritesDocBlocks(t *testing.T) {
	db := openCollabSQLite(t)
	docs := NewDocumentsService(db)
	svc, ownerID, _, _ := newCollabFixture(t, db)
	title := "协同抽取块"
	canvasType := DocCanvasType
	doc, err := docs.Create(ownerID, CreateDocumentInput{
		Title: &title, CanvasType: &canvasType,
		Data: docHTMLPayload(`<p>初稿</p>`),
	})
	if err != nil {
		t.Fatal(err)
	}
	html := `<p data-block-id="22222222-2222-4222-8222-222222222222">协同后的段落</p>`
	if _, err := svc.Append(ownerID, doc.ID, ownerID, CollabOperationInput{Payload: []byte{0x31}, HTML: html}); err != nil {
		t.Fatal(err)
	}
	if err := svc.FlushDerived(doc.ID); err != nil {
		t.Fatalf("flush: %v", err)
	}
	var n int64
	if err := db.Model(&model.DocBlock{}).Where("document_id = ? AND deleted_at IS NULL", doc.ID).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("doc_blocks after flush = %d, want 1", n)
	}
}

func errorsIsNotFound(err error) bool {
	return errors.Is(err, ErrDocumentNotFound)
}

func TestDocBlockRefsWriteReverseLookupAndCommentBackfill(t *testing.T) {
	db := openDocumentsSQLite(t)
	if err := db.AutoMigrate(&docCommentSQLite{}); err != nil {
		t.Fatal(err)
	}
	svc := NewDocumentsService(db)
	blocks := NewDocBlockService(db)
	ownerID := uuid.New()
	if err := db.Create(&model.User{ID: ownerID, Email: ownerID.String() + "@blocks.test", PasswordHash: "x"}).Error; err != nil {
		t.Fatal(err)
	}
	src := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	dst := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	oldKey := "h-intro"
	title := "引用文档"
	canvasType := DocCanvasType
	html := `<p data-block-id="` + src + `">见<span data-type="cross-ref" data-target="` + oldKey + `" data-label="§ 引言">§ 引言</span></p>` +
		`<h2 id="` + oldKey + `" data-block-id="` + dst + `">引言段落</h2>`
	doc, err := svc.Create(ownerID, CreateDocumentInput{
		Title: &title, CanvasType: &canvasType, Data: docHTMLPayload(html),
	})
	if err != nil {
		t.Fatal(err)
	}

	var stored []model.DocBlock
	if err := db.Where("document_id = ? AND deleted_at IS NULL", doc.ID).Order("ordinal ASC").Find(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if len(stored) != 2 {
		t.Fatalf("blocks = %d, want 2", len(stored))
	}
	var heading model.DocBlock
	for _, row := range stored {
		if row.ID.String() == dst {
			heading = row
		}
	}
	if heading.AnchorKey != oldKey {
		t.Fatalf("anchor_key = %q, want %s", heading.AnchorKey, oldKey)
	}

	var revs int64
	if err := db.Model(&model.DocBlockRevision{}).Where("document_id = ?", doc.ID).Count(&revs).Error; err != nil {
		t.Fatal(err)
	}
	if revs < 2 {
		t.Fatalf("revisions = %d, want at least 2", revs)
	}

	refs, err := blocks.ListBlockRefs(ownerID, doc.ID, heading.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 {
		t.Fatalf("refs = %+v, want 1", refs)
	}
	if refs[0].SourceBlockID.String() != src || refs[0].TargetBlockID == nil || refs[0].TargetBlockID.String() != dst || refs[0].Lost || refs[0].AnchorKey != oldKey {
		t.Fatalf("ref = %+v", refs[0])
	}

	stranger := uuid.New()
	if _, err := blocks.ListBlockRefs(stranger, doc.ID, heading.ID); !errors.Is(err, ErrDocumentNotFound) {
		t.Fatalf("stranger refs err = %v, want not found", err)
	}

	now := stored[0].UpdatedAt
	comment := model.DocComment{
		ID: uuid.New(), DocID: doc.ID, AuthorUserID: ownerID,
		Quote: "引言段落", Content: "这块要改", Anchor: -1, AnchorFrom: -1, AnchorTo: -1, BlockOffset: -1,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(&comment).Error; err != nil {
		t.Fatal(err)
	}
	n, err := BackfillCommentAnchors(db, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("backfilled = %d, want 1", n)
	}
	var got model.DocComment
	if err := db.Where("id = ?", comment.ID).First(&got).Error; err != nil {
		t.Fatal(err)
	}
	if got.BlockID == nil || got.BlockID.String() != dst || got.BlockOffset != 0 {
		t.Fatalf("comment anchors = %+v", got)
	}

	// 对不上的旧评论保持降级：不写 block_id。
	orphan := model.DocComment{
		ID: uuid.New(), DocID: doc.ID, AuthorUserID: ownerID,
		Quote: "已经删掉的句子", Content: "找不到", Anchor: -1, AnchorFrom: -1, AnchorTo: -1, BlockOffset: -1,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(&orphan).Error; err != nil {
		t.Fatal(err)
	}
	n, err = BackfillCommentAnchors(db, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("orphan backfill = %d, want 0", n)
	}
	if err := db.Where("id = ?", orphan.ID).First(&orphan).Error; err != nil {
		t.Fatal(err)
	}
	if orphan.BlockID != nil {
		t.Fatalf("orphan should stay degraded, got block %v", orphan.BlockID)
	}
}

func TestRebuildPageReferencesSetsSourceBlockID(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc := NewDocumentsService(db)
	ownerID := uuid.New()
	if err := db.Create(&model.User{ID: ownerID, Email: ownerID.String() + "@pref.test", PasswordHash: "x"}).Error; err != nil {
		t.Fatal(err)
	}
	src := "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	targetDoc := uuid.New()
	title := "提及文档"
	canvasType := DocCanvasType
	html := `<p data-block-id="` + src + `"><span data-type="mention" data-id="` + targetDoc.String() + `">@另一篇</span></p>`
	doc, err := svc.Create(ownerID, CreateDocumentInput{
		Title: &title, CanvasType: &canvasType, Data: docHTMLPayload(html),
	})
	if err != nil {
		t.Fatal(err)
	}
	var refs []model.PageReference
	if err := db.Where("source_doc_id = ?", doc.ID).Find(&refs).Error; err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 {
		t.Fatalf("page refs = %+v, want 1", refs)
	}
	if refs[0].TargetDocID != targetDoc || refs[0].SourceBlockID == nil || refs[0].SourceBlockID.String() != src {
		t.Fatalf("page ref = %+v", refs[0])
	}
}
