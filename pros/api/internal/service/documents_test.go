package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// documentSaveOperationSQLite 仅用于 SQLite 建表：生产模型的 timestamptz
// 会被 SQLite 当作文本，回读 time.Time 失败；这里保持列和唯一索引完全一致，
// 只让时间字段使用驱动可识别的默认 datetime 类型。其余文档表复用项目已有的
// backup*SQLite 影子模型，生产 service/model 和真实 SQL 路径均保持不变。
type documentSaveOperationSQLite struct {
	OwnerUserID       uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_document_save_operation,priority:1"`
	DocumentID        uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_document_save_operation,priority:2;index"`
	OperationID       string         `gorm:"type:varchar(128);not null;uniqueIndex:uniq_document_save_operation,priority:3"`
	RequestHash       string         `gorm:"type:char(64);not null"`
	ResultSaveVersion int64          `gorm:"not null;default:0"`
	Result            datatypes.JSON `gorm:"type:jsonb"`
	CreatedAt         time.Time      `gorm:"not null"`
	UpdatedAt         time.Time      `gorm:"not null"`
}

func (documentSaveOperationSQLite) TableName() string { return "document_save_operations" }

// docAuditEventSQLite 是 doc_audit_events 的 SQLite 影子模型：只把时间列换成可回读类型。
type docAuditEventSQLite struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	DocumentID uuid.UUID `gorm:"type:uuid;not null;index:idx_doc_audit_doc_created,priority:1"`
	UserID     uuid.UUID `gorm:"type:uuid;not null;index"`
	Action     string    `gorm:"type:varchar(32);not null"`
	BlockID    string    `gorm:"type:varchar(128);not null;default:''"`
	Detail     string    `gorm:"type:text;not null;default:''"`
	CreatedAt  time.Time `gorm:"not null;index:idx_doc_audit_doc_created,priority:2"`
}

func (docAuditEventSQLite) TableName() string { return "doc_audit_events" }

type docBlockSQLite struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey"`
	DocumentID  uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_blocks_doc_ordinal,priority:1"`
	ParentID    *uuid.UUID     `gorm:"type:uuid;index:idx_doc_blocks_parent"`
	BlockType   string         `gorm:"type:varchar(64);not null"`
	Ordinal     int            `gorm:"not null;default:0;index:idx_doc_blocks_doc_ordinal,priority:2"`
	Depth       int            `gorm:"not null;default:0"`
	AnchorKey   string         `gorm:"type:varchar(128);not null;default:''"`
	ContentText string         `gorm:"type:text;not null;default:''"`
	ContentJSON datatypes.JSON `gorm:"type:json"`
	Attrs       datatypes.JSON `gorm:"type:json"`
	RevisionID  *uuid.UUID     `gorm:"type:uuid"`
	Permission  string         `gorm:"type:varchar(32);not null;default:''"`
	CreatedAt   time.Time      `gorm:"not null"`
	UpdatedAt   time.Time      `gorm:"not null"`
	DeletedAt   *time.Time     `gorm:"index:idx_doc_blocks_deleted"`
}

func (docBlockSQLite) TableName() string { return "doc_blocks" }

type docBlockRevisionSQLite struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey"`
	DocumentID  uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_block_revs_doc"`
	BlockID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_doc_block_revs_block_created,priority:1"`
	RevisionID  *uuid.UUID     `gorm:"type:uuid"`
	ContentText string         `gorm:"type:text;not null;default:''"`
	ContentJSON datatypes.JSON `gorm:"type:json"`
	Attrs       datatypes.JSON `gorm:"type:json"`
	CreatedAt   time.Time      `gorm:"not null;index:idx_doc_block_revs_block_created,priority:2"`
}

func (docBlockRevisionSQLite) TableName() string { return "doc_block_revisions" }

type docBlockRefSQLite struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey"`
	DocumentID    uuid.UUID  `gorm:"type:uuid;not null;index:idx_doc_block_refs_doc"`
	SourceBlockID uuid.UUID  `gorm:"type:uuid;not null;index:idx_doc_block_refs_source"`
	TargetBlockID *uuid.UUID `gorm:"type:uuid;index:idx_doc_block_refs_target"`
	TargetDocID   *uuid.UUID `gorm:"type:uuid"`
	RefType       string     `gorm:"type:varchar(32);not null"`
	AnchorKey     string     `gorm:"type:varchar(128);not null;default:''"`
	TargetLabel   string     `gorm:"type:varchar(255);not null;default:''"`
	Lost          bool       `gorm:"not null;default:false"`
	CreatedAt     time.Time  `gorm:"not null"`
}

func (docBlockRefSQLite) TableName() string { return "doc_block_refs" }

// openDocumentsSQLite 为普通行为测试提供独立的内存数据库。
// 并发竞争不在 SQLite 上断言，因为它不能模拟 PostgreSQL 的并行写锁语义。
func openDocumentsSQLite(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:documents-"+uuid.NewString()+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	// shared-memory SQLite 在多连接下容易出现表可见性和写锁差异；行为测试串行执行即可。
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(
		&backupUserSQLite{},
		&backupDocumentSQLite{},
		&backupRevisionSQLite{},
		&backupContentBlockSQLite{},
		&documentSaveOperationSQLite{},
		&pageReferencesSQLite{},
		&docAuditEventSQLite{},
		&docBlockSQLite{},
		&docBlockRevisionSQLite{},
		&docBlockRefSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

// documentTestPayload 构造能产生正文与内容块的最小画布，便于验证抽取层是否被重建。
func documentTestPayload(text string) json.RawMessage {
	payload, err := json.Marshal(map[string]interface{}{
		"id":            "canvas-test",
		"type":          "dual-triangle",
		"schemaVersion": 1,
		"sections": []map[string]interface{}{{
			"id":    "panel-1",
			"title": "测试面板",
			"items": []map[string]interface{}{{"id": "item-1", "text": text}},
		}},
	})
	if err != nil {
		panic(err)
	}
	return payload
}

func TestRenameAdvancesVersionAndChecksExpectedVersion(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)

	// 旧调用不传版本：必须成功并推进版本，不能让 save_version 停滞。
	renamed, err := svc.Rename(ownerID, doc.ID, "旧客户端重命名")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.SaveVersion != doc.SaveVersion+1 || renamed.Title != "旧客户端重命名" {
		t.Fatalf("legacy rename = %+v", renamed)
	}

	stale := doc.SaveVersion
	conflict, err := svc.Rename(ownerID, doc.ID, "过期写入", &stale)
	if !errors.Is(err, ErrSaveConflict) {
		t.Fatalf("stale rename error = %v, want ErrSaveConflict", err)
	}
	if conflict == nil || conflict.SaveVersion != renamed.SaveVersion || conflict.Title != renamed.Title {
		t.Fatalf("conflict should carry latest summary, got %+v", conflict)
	}

	current := renamed.SaveVersion
	renamedAgain, err := svc.Rename(ownerID, doc.ID, "新客户端重命名", &current)
	if err != nil {
		t.Fatal(err)
	}
	if renamedAgain.SaveVersion != current+1 || renamedAgain.Title != "新客户端重命名" {
		t.Fatalf("CAS rename = %+v", renamedAgain)
	}
}

func TestUpdateOperationIDRetryReturnsFirstResult(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	expected := doc.SaveVersion
	input := UpdateDocumentInput{
		CurrentData:         documentTestPayload("幂等保存"),
		ExpectedSaveVersion: &expected,
		Checkpoint:          true,
		OperationID:         "save-retry-1",
	}
	first, err := svc.Update(ownerID, doc.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	var revisionCount int64
	if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Count(&revisionCount).Error; err != nil {
		t.Fatal(err)
	}
	if revisionCount != 2 {
		t.Fatalf("first save revisions = %d, want 2", revisionCount)
	}

	replay, err := svc.Update(ownerID, doc.ID, input)
	if err != nil {
		t.Fatalf("same operation retry: %v", err)
	}
	if replay.SaveVersion != first.SaveVersion || !replay.UpdatedAt.Equal(first.UpdatedAt) ||
		hashPayload(replay.CurrentData) != hashPayload(first.CurrentData) {
		t.Fatalf("retry did not return first result: first=%+v replay=%+v", first, replay)
	}
	fresh, err := svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != first.SaveVersion {
		t.Fatalf("retry bumped saveVersion to %d", fresh.SaveVersion)
	}
	if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Count(&revisionCount).Error; err != nil {
		t.Fatal(err)
	}
	if revisionCount != 2 {
		t.Fatalf("retry created checkpoint, revisions = %d", revisionCount)
	}

	// 文档之后继续前进，原 operationId 重试仍必须返回首次快照，而非最新文档。
	nextVersion := fresh.SaveVersion
	if _, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         documentTestPayload("之后的保存"),
		ExpectedSaveVersion: &nextVersion,
	}); err != nil {
		t.Fatal(err)
	}
	replay, err = svc.Update(ownerID, doc.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	if replay.SaveVersion != first.SaveVersion || hashPayload(replay.CurrentData) != hashPayload(first.CurrentData) {
		t.Fatal("retry after later writes did not restore the first response")
	}
	fresh, err = svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != nextVersion+1 {
		t.Fatalf("old retry changed current version to %d", fresh.SaveVersion)
	}

	different := input
	different.CurrentData = documentTestPayload("不同载荷")
	if _, err := svc.Update(ownerID, doc.ID, different); !errors.Is(err, ErrOperationConflict) {
		t.Fatalf("same operationId with different payload = %v, want ErrOperationConflict", err)
	}
	var operationCount int64
	if err := db.Model(&model.DocumentSaveOperation{}).Where("document_id = ?", doc.ID).Count(&operationCount).Error; err != nil {
		t.Fatal(err)
	}
	if operationCount != 1 {
		t.Fatalf("operation rows = %d, want 1", operationCount)
	}
}

func TestUpdateUnchangedContentKeepsBlocksAndAdvancesMetadata(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, _ := newDocumentFixture(t, db)
	// 并发夹具使用空画布；本用例必须显式创建带正文的文档，才有内容块可比较。
	title := "初始标题"
	doc, err := svc.Create(ownerID, CreateDocumentInput{Title: &title, Data: documentTestPayload("初始正文")})
	if err != nil {
		t.Fatal(err)
	}
	var before []model.CanvasContentBlock
	if err := db.Where("document_id = ?", doc.ID).Order("sort_order ASC").Find(&before).Error; err != nil {
		t.Fatal(err)
	}
	if len(before) == 0 {
		t.Fatal("fixture should have extracted content blocks")
	}
	beforeDoc, err := svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	title = "只修改元数据"
	notes := "正文不变"
	expected := beforeDoc.SaveVersion
	updated, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		Title:               &title,
		Notes:               &notes,
		CurrentData:         json.RawMessage(beforeDoc.CurrentData),
		ExpectedSaveVersion: &expected,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.SaveVersion != expected+1 || updated.Title != title || updated.Notes != notes {
		t.Fatalf("metadata/version did not advance: %+v", updated)
	}
	if updated.ContentText != beforeDoc.ContentText {
		t.Fatal("unchanged content unexpectedly rebuilt content_text")
	}
	var after []model.CanvasContentBlock
	if err := db.Where("document_id = ?", doc.ID).Order("sort_order ASC").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) {
		t.Fatalf("block count changed from %d to %d", len(before), len(after))
	}
	for i := range before {
		// 若实现仍然 DELETE + INSERT，数量虽相同，主键与 updated_at 也一定会变化。
		if after[i].ID != before[i].ID || !after[i].UpdatedAt.Equal(before[i].UpdatedAt) {
			t.Fatalf("block %d was unnecessarily replaced: before=%+v after=%+v", i, before[i], after[i])
		}
	}
}

func TestAutomaticCheckpointDeduplicatesAdjacentHashButManualDoesNot(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	expected := doc.SaveVersion
	changed := documentTestPayload("新的自动快照")
	updated, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         changed,
		ExpectedSaveVersion: &expected,
		Checkpoint:          true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var count int64
	countRevisions := func() int64 {
		t.Helper()
		if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		return count
	}
	if got := countRevisions(); got != 2 {
		t.Fatalf("after changed checkpoint revisions = %d, want 2", got)
	}

	expected = updated.SaveVersion
	updated, err = svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         changed,
		ExpectedSaveVersion: &expected,
		Checkpoint:          true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := countRevisions(); got != 2 {
		t.Fatalf("adjacent duplicate auto checkpoint was created: %d", got)
	}

	expected = updated.SaveVersion
	if _, _, err := svc.CreateRevision(ownerID, doc.ID, CreateRevisionInput{ExpectedSaveVersion: &expected}); err != nil {
		t.Fatal(err)
	}
	if got := countRevisions(); got != 3 {
		t.Fatalf("manual snapshot must not be deduplicated: %d", got)
	}
}

func TestAutomaticCheckpointRetentionPreservesManualAndDependencies(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	if doc.HeadRevisionID == nil {
		t.Fatal("fixture should have an initial revision")
	}
	initialRevisionID := *doc.HeadRevisionID
	expected := doc.SaveVersion
	var updated *model.CanvasDocument
	saveAuto := func(index int) {
		t.Helper()
		var err error
		updated, err = svc.Update(ownerID, doc.ID, UpdateDocumentInput{
			CurrentData:         documentTestPayload("自动快照 " + strings.Repeat("x", index+1)),
			ExpectedSaveVersion: &expected,
			Checkpoint:          true,
		})
		if err != nil {
			t.Fatalf("automatic checkpoint %d: %v", index, err)
		}
		expected = updated.SaveVersion
	}

	// 第一条自动快照随后会被 patch 依赖；即使它最旧，也不能被数量清理删除。
	saveAuto(0)
	var protected model.CanvasRevision
	if err := db.Where("document_id = ? AND label = ?", doc.ID, "auto-checkpoint").
		Order("created_at ASC").Order("id ASC").First(&protected).Error; err != nil {
		t.Fatal(err)
	}
	patchLabel := "legacy-patch"
	patch := model.CanvasRevision{
		ID:             uuid.New(),
		DocumentID:     doc.ID,
		RevisionType:   "patch",
		Payload:        datatypes.JSON(documentTestPayload("patch")),
		BaseSnapshotID: &protected.ID,
		AuthorUserID:   &ownerID,
		Label:          &patchLabel,
		CreatedAt:      time.Now().UTC(),
	}
	if err := db.Create(&patch).Error; err != nil {
		t.Fatal(err)
	}

	// 手动存版带有明确用户意图，也不计入自动 checkpoint 的 50 条额度。
	manualLabel := "manual-retained"
	fresh, manual, err := svc.CreateRevision(ownerID, doc.ID, CreateRevisionInput{
		ExpectedSaveVersion: &expected,
		Label:               &manualLabel,
	})
	if err != nil {
		t.Fatal(err)
	}
	updated = fresh
	expected = updated.SaveVersion

	// 再写 50 条后共有 51 条自动快照：最旧的一条因 patch 依赖而额外保留。
	for i := 1; i <= autoCheckpointRetention; i++ {
		saveAuto(i)
	}
	assertAutoCount := func(want int64) {
		t.Helper()
		var count int64
		if err := db.Model(&model.CanvasRevision{}).
			Where("document_id = ? AND label = ?", doc.ID, "auto-checkpoint").
			Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("automatic checkpoints = %d, want %d", count, want)
		}
	}
	assertAutoCount(int64(autoCheckpointRetention + 1))

	// 找一条没有依赖的旧自动快照；下一次保存应只回收它，仍保留受依赖的最旧快照。
	var prunable model.CanvasRevision
	if err := db.Where("document_id = ? AND label = ? AND id <> ?", doc.ID, "auto-checkpoint", protected.ID).
		Order("created_at ASC").Order("id ASC").First(&prunable).Error; err != nil {
		t.Fatal(err)
	}
	saveAuto(autoCheckpointRetention + 1)
	assertAutoCount(int64(autoCheckpointRetention + 1))

	var count int64
	if err := db.Model(&model.CanvasRevision{}).Where("id = ?", prunable.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("unreferenced old automatic checkpoint was not pruned")
	}
	// 受依赖自动快照、patch、手动快照和初始快照必须全部存在。
	keepIDs := []uuid.UUID{protected.ID, patch.ID, manual.ID, initialRevisionID}
	if err := db.Model(&model.CanvasRevision{}).Where("id IN ?", keepIDs).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != int64(len(keepIDs)) {
		t.Fatalf("protected revisions = %d, want %d", count, len(keepIDs))
	}
	if updated.HeadRevisionID == nil {
		t.Fatal("current document lost head after retention")
	}
	if err := db.Model(&model.CanvasRevision{}).Where("id = ?", *updated.HeadRevisionID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("current head revision was pruned")
	}
}

func TestListRevisionsPaginationMatchesLegacyOrder(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	for i := 0; i < 5; i++ {
		if _, _, err := svc.CreateRevision(ownerID, doc.ID, CreateRevisionInput{}); err != nil {
			t.Fatal(err)
		}
	}
	// 强制制造同时间戳，验证 id ASC 次级排序和深页谓词，而不只验证不同时间的简单情况。
	base := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Update("created_at", base).Error; err != nil {
		t.Fatal(err)
	}
	legacy, err := svc.ListRevisions(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(legacy) != 6 {
		t.Fatalf("legacy revisions = %d, want 6", len(legacy))
	}
	var collected []uuid.UUID
	cursor := ""
	for pageNumber := 0; ; pageNumber++ {
		if pageNumber > 10 {
			t.Fatal("cursor pagination did not terminate")
		}
		page, err := svc.ListRevisionsPage(ownerID, doc.ID, RevisionListFilter{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range page.Items {
			collected = append(collected, item.ID)
		}
		if !page.HasMore {
			if page.NextCursor != "" {
				t.Fatal("last page should not return nextCursor")
			}
			break
		}
		if page.NextCursor == "" {
			t.Fatal("non-last page missing nextCursor")
		}
		cursor = page.NextCursor
	}
	if len(collected) != len(legacy) {
		t.Fatalf("cursor returned %d rows, want %d", len(collected), len(legacy))
	}
	for i := range legacy {
		if collected[i] != legacy[i].ID {
			t.Fatalf("cursor order mismatch at %d: got %s want %s", i, collected[i], legacy[i].ID)
		}
	}
	offsetPage, err := svc.ListRevisionsPage(ownerID, doc.ID, RevisionListFilter{Limit: 2, Offset: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(offsetPage.Items) != 2 || offsetPage.Items[0].ID != legacy[1].ID || offsetPage.Items[1].ID != legacy[2].ID {
		t.Fatalf("offset page does not match legacy order: %+v", offsetPage.Items)
	}
}

func TestListKeysetStaticDataHasNoDuplicatesOrGaps(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, first := newDocumentFixture(t, db)
	docs := []*model.CanvasDocument{first}
	for i := 1; i < 5; i++ {
		title := "分页文档"
		created, err := svc.Create(ownerID, CreateDocumentInput{Title: &title, Data: documentTestPayload("keyset")})
		if err != nil {
			t.Fatal(err)
		}
		docs = append(docs, created)
	}
	base := time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC)
	for i, doc := range docs {
		// 前两篇较新且时间相同，后三篇也较旧且时间相同，覆盖两类 keyset 谓词。
		updatedAt := base.Add(-time.Duration(i/2) * time.Hour)
		if err := db.Model(&model.CanvasDocument{}).Where("id = ?", doc.ID).Update("updated_at", updatedAt).Error; err != nil {
			t.Fatal(err)
		}
	}
	legacy, _, err := svc.List(ownerID, ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	var collected []uuid.UUID
	cursor := ""
	for pageNumber := 0; ; pageNumber++ {
		if pageNumber > 10 {
			t.Fatal("document keyset did not terminate")
		}
		page, err := svc.ListKeyset(ownerID, ListCursorFilter{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != int64(len(legacy)) {
			t.Fatalf("page total = %d, want %d", page.Total, len(legacy))
		}
		for _, item := range page.Items {
			collected = append(collected, item.ID)
		}
		if !page.HasMore {
			break
		}
		cursor = page.NextCursor
	}
	if len(collected) != len(legacy) {
		t.Fatalf("keyset returned %d rows, want %d", len(collected), len(legacy))
	}
	seen := make(map[uuid.UUID]bool, len(collected))
	for i := range legacy {
		if collected[i] != legacy[i].ID {
			t.Fatalf("keyset order mismatch at %d: got %s want %s", i, collected[i], legacy[i].ID)
		}
		if seen[collected[i]] {
			t.Fatalf("duplicate document %s", collected[i])
		}
		seen[collected[i]] = true
	}
}

// TestListCategorySplitsContentSets 锁定「项目画布列表只含 node-graph」这件事。
//
// 同一个项目下混着三类内容：节点画布、知识库富文本、节点绑定的模板副本。
// 分类过滤必须把它们切成互不重叠的集合，否则项目详情页会出现打不开的假条目。
func TestListCategorySplitsContentSets(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, _ := newDocumentFixture(t, db)
	projectID := uuid.New()
	title := "分类文档"
	created := []*model.CanvasDocument{}
	for _, canvasType := range []string{NodeGraphCanvasType, DocCanvasType, "pm-solution-triangle"} {
		ct := canvasType
		doc, err := svc.Create(ownerID, CreateDocumentInput{
			Title:      &title,
			CanvasType: &ct,
			ProjectID:  &projectID,
			Data:       documentTestPayload(canvasType),
		})
		if err != nil {
			t.Fatal(err)
		}
		created = append(created, doc)
	}

	typesOf := func(category string) []string {
		rows, _, err := svc.List(ownerID, ListFilter{ProjectID: &projectID, Category: category})
		if err != nil {
			t.Fatal(err)
		}
		types := []string{}
		for _, row := range rows {
			types = append(types, row.CanvasType)
		}
		return types
	}

	nodeGraph := typesOf(CategoryNodeGraph)
	if len(nodeGraph) != 1 || nodeGraph[0] != NodeGraphCanvasType {
		t.Fatalf("node-graph category = %v, want only %s", nodeGraph, NodeGraphCanvasType)
	}
	doc := typesOf(CategoryDoc)
	if len(doc) != 1 || doc[0] != DocCanvasType {
		t.Fatalf("doc category = %v, want only %s", doc, DocCanvasType)
	}
	canvas := typesOf(CategoryCanvas)
	if len(canvas) != 2 {
		t.Fatalf("canvas category = %v, want 2 rows", canvas)
	}
	if !IsCategory(CategoryCanvas) || !IsCategory(CategoryNodeGraph) || !IsCategory(CategoryDoc) {
		t.Fatal("known categories must be accepted")
	}
	if IsCategory("unknown") {
		t.Fatal("unknown category must be rejected")
	}
}

// documentQueryCounter 只统计文档表的 SELECT，用于防止 AICorpus 悄悄退回逐篇查询。
type documentQueryCounter struct {
	logger.Interface
	documents int
}

func (l *documentQueryCounter) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	sql, _ := fc()
	if strings.Contains(sql, "canvas_documents") && strings.Contains(strings.ToUpper(sql), "SELECT") {
		l.documents++
	}
	l.Interface.Trace(ctx, begin, fc, err)
}

func TestAICorpusKeepsSearchOrderPermissionsAndTruncation(t *testing.T) {
	db := openDocumentsSQLite(t)
	svc, ownerID, longDoc := newDocumentFixture(t, db)
	longText := strings.Repeat("文", 4500)
	if _, err := svc.Update(ownerID, longDoc.ID, UpdateDocumentInput{CurrentData: documentTestPayload(longText)}); err != nil {
		t.Fatal(err)
	}
	title := "语料文档"
	second, err := svc.Create(ownerID, CreateDocumentInput{Title: &title, Data: documentTestPayload("第二篇")})
	if err != nil {
		t.Fatal(err)
	}
	third, err := svc.Create(ownerID, CreateDocumentInput{Title: &title, Data: documentTestPayload("第三篇")})
	if err != nil {
		t.Fatal(err)
	}
	_, otherOwner, otherDoc := newDocumentFixture(t, db)
	base := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	times := map[uuid.UUID]time.Time{
		longDoc.ID:  base.Add(time.Hour),
		second.ID:   base.Add(3 * time.Hour),
		third.ID:    base.Add(2 * time.Hour),
		otherDoc.ID: base.Add(4 * time.Hour), // 其他用户即使最新也绝不能进入结果。
	}
	for id, updatedAt := range times {
		if err := db.Model(&model.CanvasDocument{}).Where("id = ?", id).Update("updated_at", updatedAt).Error; err != nil {
			t.Fatal(err)
		}
	}

	recorder := &documentQueryCounter{Interface: db.Config.Logger}
	db.Config.Logger = recorder
	corpus, err := svc.AICorpus(ownerID, "", "", 10)
	db.Config.Logger = recorder.Interface
	if err != nil {
		t.Fatal(err)
	}
	wantOrder := []uuid.UUID{second.ID, third.ID, longDoc.ID}
	if len(corpus) != len(wantOrder) {
		t.Fatalf("corpus length = %d, want %d", len(corpus), len(wantOrder))
	}
	for i := range wantOrder {
		if corpus[i].DocumentID != wantOrder[i] {
			t.Fatalf("corpus order at %d = %s, want %s", i, corpus[i].DocumentID, wantOrder[i])
		}
	}
	// 一次 Search + 一次批量文档读取；旧实现会至少再按每篇文档读取一次。
	if recorder.documents != 2 {
		t.Fatalf("canvas_documents SELECT count = %d, want 2 (N+1 regression)", recorder.documents)
	}
	longItem := corpus[2]
	if utf8.RuneCountInString(longItem.PlainText) != 4001 || !strings.HasSuffix(longItem.PlainText, "…") {
		t.Fatalf("plainText was not truncated to 4000 runes plus ellipsis: %d", utf8.RuneCountInString(longItem.PlainText))
	}
	otherCorpus, err := svc.AICorpus(otherOwner, "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(otherCorpus) != 1 || otherCorpus[0].DocumentID != otherDoc.ID {
		t.Fatalf("other owner corpus leaked or missed documents: %+v", otherCorpus)
	}
}
