package service

import (
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// openPostgresForServiceTest 只在 CI 提供真实 PostgreSQL 时运行。
//
// 并发覆盖必须用真实数据库验证：SQLite 的写入是串行的，即使代码里没有
// 原子条件也可能“看起来正确”，无法证明线上 PostgreSQL 的行为。
func openPostgresForServiceTest(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("MEDIA_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("MEDIA_TEST_DATABASE_URL is not set; concurrency tests need real PostgreSQL")
	}
	if !strings.Contains(dsn, "media_test") {
		t.Fatalf("refusing to run against a database URL that does not contain media_test: %s", dsn)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.User{}, &model.CanvasDocument{}, &model.CanvasRevision{}, &model.CanvasContentBlock{}, &model.DocumentSaveOperation{}, &model.PasswordResetToken{}, &model.PageReference{}); err != nil {
		t.Fatal(err)
	}
	return db
}

// newDocumentFixture 建一个用户和一篇文档，返回服务与文档。
func newDocumentFixture(t *testing.T, db *gorm.DB) (*DocumentsService, uuid.UUID, *model.CanvasDocument) {
	t.Helper()
	svc := NewDocumentsService(db)
	ownerID := uuid.New()
	user := &model.User{ID: ownerID, Email: ownerID.String() + "@concurrency.test", PasswordHash: "x"}
	if err := db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	title := "并发测试"
	doc, err := svc.Create(ownerID, CreateDocumentInput{Title: &title, Data: json.RawMessage(`{"type":"dual-triangle","schemaVersion":1,"id":"t","sections":[]}`)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		// 按依赖顺序清理，避免在共享测试库里留下垃圾数据。
		var docIDs []uuid.UUID
		db.Model(&model.CanvasDocument{}).Where("owner_user_id = ?", ownerID).Pluck("id", &docIDs)
		if len(docIDs) > 0 {
			db.Where("document_id IN ?", docIDs).Delete(&model.DocumentSaveOperation{})
			db.Where("document_id IN ?", docIDs).Delete(&model.CanvasContentBlock{})
			db.Where("document_id IN ?", docIDs).Delete(&model.CanvasRevision{})
		}
		db.Where("owner_user_id = ?", ownerID).Delete(&model.CanvasDocument{})
		db.Where("id = ?", ownerID).Delete(&model.User{})
	})
	return svc, ownerID, doc
}

// TestUpdateAdvancesSaveVersion 锁定“每次普通保存都推进版本”这一前提。
// 如果普通保存不推进版本，并发令牌就永远不变，乐观锁也就失去意义。
func TestUpdateAdvancesSaveVersion(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	if doc.SaveVersion != 1 {
		t.Fatalf("new document saveVersion = %d, want 1", doc.SaveVersion)
	}

	// 第一次保存：显式带上当前版本。
	v1 := doc.SaveVersion
	updated, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         json.RawMessage(`{"type":"dual-triangle","schemaVersion":1,"id":"t","sections":[1]}`),
		ExpectedSaveVersion: &v1,
	})
	if err != nil {
		t.Fatalf("first update: %v", err)
	}
	if updated.SaveVersion != v1+1 {
		t.Fatalf("saveVersion = %d, want %d", updated.SaveVersion, v1+1)
	}

	// 第二次保存仍用旧版本：必须被拒绝，而不是静默覆盖。
	_, err = svc.Update(ownerID, doc.ID, UpdateDocumentInput{
		CurrentData:         json.RawMessage(`{"type":"dual-triangle","schemaVersion":1,"id":"t","sections":[2]}`),
		ExpectedSaveVersion: &v1,
	})
	if !errors.Is(err, ErrSaveConflict) {
		t.Fatalf("stale update error = %v, want ErrSaveConflict", err)
	}
}

// TestUpdateConcurrentSameVersionOnlyOneWins 是本次修复的核心回归测试。
//
// 多个请求同时读到同一个 saveVersion，同时提交保存；由于版本比较与
// save_version + 1 在同一条 UPDATE 里完成，只允许一个成功。
func TestUpdateConcurrentSameVersionOnlyOneWins(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	expected := doc.SaveVersion

	const workers = 8
	var wg sync.WaitGroup
	results := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			payload := json.RawMessage(`{"type":"dual-triangle","schemaVersion":1,"id":"t","sections":[` + strconv.Itoa(n) + `]}`)
			_, err := svc.Update(ownerID, doc.ID, UpdateDocumentInput{
				CurrentData:         payload,
				ExpectedSaveVersion: &expected,
			})
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)

	success := 0
	conflicts := 0
	for err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, ErrSaveConflict):
			conflicts++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if success != 1 || conflicts != workers-1 {
		t.Fatalf("success=%d conflicts=%d, want 1 and %d", success, conflicts, workers-1)
	}

	fresh, err := svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != expected+1 {
		t.Fatalf("final saveVersion = %d, want %d", fresh.SaveVersion, expected+1)
	}
}

// TestRenameConcurrentSameVersionOnlyOneWins 验证重命名不是 CAS 的旁路。
// 所有请求都携带同一个旧版本，数据库必须只接受一个标题更新并只推进一次版本。
func TestRenameConcurrentSameVersionOnlyOneWins(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	expected := doc.SaveVersion

	const workers = 8
	type renameResult struct {
		summary *model.DocumentSummary
		err     error
	}
	results := make(chan renameResult, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			<-start // 尽量让竞争发生在同一版本上，而不是由 goroutine 调度天然串行化。
			summary, err := svc.Rename(ownerID, doc.ID, "并发标题-"+strconv.Itoa(n), &expected)
			results <- renameResult{summary: summary, err: err}
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)

	success := 0
	conflicts := 0
	for result := range results {
		switch {
		case result.err == nil:
			success++
			if result.summary == nil || result.summary.SaveVersion != expected+1 {
				t.Fatalf("successful rename returned stale summary: %+v", result.summary)
			}
		case errors.Is(result.err, ErrSaveConflict):
			conflicts++
			if result.summary == nil || result.summary.SaveVersion != expected+1 {
				t.Fatalf("conflict should return latest summary: %+v", result.summary)
			}
		default:
			t.Fatalf("unexpected rename error: %v", result.err)
		}
	}
	if success != 1 || conflicts != workers-1 {
		t.Fatalf("success=%d conflicts=%d, want 1 and %d", success, conflicts, workers-1)
	}
	fresh, err := svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != expected+1 {
		t.Fatalf("final saveVersion = %d, want %d", fresh.SaveVersion, expected+1)
	}
}

// TestUpdateConcurrentOperationIDReturnsOneCommittedResult 验证网络重试的真实竞态。
// 并发请求不仅都不能出现唯一键 500，还必须拿到完全相同的首次响应；版本、
// 自动 checkpoint 和幂等记录都只能产生一次，不能依赖 SQLite 的串行写入来断言。
func TestUpdateConcurrentOperationIDReturnsOneCommittedResult(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	expected := doc.SaveVersion
	input := UpdateDocumentInput{
		CurrentData:         json.RawMessage(`{"type":"dual-triangle","schemaVersion":1,"id":"t","sections":[{"id":"panel","title":"retry","items":[{"text":"same operation"}]}]}`),
		ExpectedSaveVersion: &expected,
		Checkpoint:          true,
		OperationID:         "postgres-concurrent-retry",
	}

	const workers = 8
	type updateResult struct {
		doc *model.CanvasDocument
		err error
	}
	results := make(chan updateResult, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, err := svc.Update(ownerID, doc.ID, input)
			results <- updateResult{doc: updated, err: err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	var first *model.CanvasDocument
	for result := range results {
		if result.err != nil {
			t.Fatalf("concurrent idempotent retry failed: %v", result.err)
		}
		if result.doc == nil {
			t.Fatal("concurrent idempotent retry returned nil document")
		}
		if first == nil {
			first = result.doc
			continue
		}
		if result.doc.SaveVersion != first.SaveVersion ||
			!result.doc.UpdatedAt.Equal(first.UpdatedAt) ||
			hashPayload(result.doc.CurrentData) != hashPayload(first.CurrentData) {
			t.Fatalf("retries returned different committed results: first=%+v other=%+v", first, result.doc)
		}
	}
	if first == nil || first.SaveVersion != expected+1 {
		t.Fatalf("first result = %+v, want saveVersion %d", first, expected+1)
	}

	fresh, err := svc.GetOwned(ownerID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.SaveVersion != expected+1 {
		t.Fatalf("retries bumped saveVersion to %d, want %d", fresh.SaveVersion, expected+1)
	}
	var operationCount, revisionCount int64
	if err := db.Model(&model.DocumentSaveOperation{}).
		Where("owner_user_id = ? AND document_id = ? AND operation_id = ?", ownerID, doc.ID, input.OperationID).
		Count(&operationCount).Error; err != nil {
		t.Fatal(err)
	}
	if operationCount != 1 {
		t.Fatalf("operation rows = %d, want 1", operationCount)
	}
	if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Count(&revisionCount).Error; err != nil {
		t.Fatal(err)
	}
	if revisionCount != 2 {
		t.Fatalf("revisions = %d, want initial revision plus one checkpoint", revisionCount)
	}
}

// TestRestoreAndRevisionShareTheSaveLock 确认另外两条写路径也被同一把锁保护。
func TestRestoreAndRevisionShareTheSaveLock(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, ownerID, doc := newDocumentFixture(t, db)
	v1 := doc.SaveVersion

	fresh, rev, err := svc.CreateRevision(ownerID, doc.ID, CreateRevisionInput{ExpectedSaveVersion: &v1})
	if err != nil {
		t.Fatalf("create revision: %v", err)
	}
	if fresh.SaveVersion != v1+1 {
		t.Fatalf("after revision saveVersion = %d, want %d", fresh.SaveVersion, v1+1)
	}

	// 用已经过期的 v1 去恢复：必须冲突。
	stale := v1
	if _, err := svc.Restore(ownerID, doc.ID, RestoreInput{RevisionID: rev.ID, ExpectedSaveVersion: &stale}); !errors.Is(err, ErrSaveConflict) {
		t.Fatalf("stale restore error = %v, want ErrSaveConflict", err)
	}

	// 用最新版本恢复：成功并继续推进。
	current := fresh.SaveVersion
	restored, err := svc.Restore(ownerID, doc.ID, RestoreInput{RevisionID: rev.ID, ExpectedSaveVersion: &current})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if restored.SaveVersion != current+1 {
		t.Fatalf("after restore saveVersion = %d, want %d", restored.SaveVersion, current+1)
	}
}
