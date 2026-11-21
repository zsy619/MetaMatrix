package service

import (
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// 以下影子模型只用于 SQLite 测试建表，不参与生产代码。
//
// 生产模型把时间列声明为 PostgreSQL 的 timestamptz；SQLite 不认识该类型，
// 会按 TEXT 存储，随后 glebarez/sqlite 无法把字符串 Scan 回 time.Time。
// 影子结构保持相同表名、列名、索引和 JSON/UUID 类型，仅让时间字段使用
// GORM 在 SQLite 下默认的 datetime 类型。这样测试仍执行真实生产 service/model，
// 不需要为了测试放宽生产模型或绕过 ExportBackup/RestoreBackup 的 SQL 路径。
type backupUserSQLite struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex;not null"`
	DisplayName  string    `gorm:"type:varchar(128)"`
	Department   string    `gorm:"type:varchar(128);index"`
	Role         string    `gorm:"type:varchar(128);index"`
	AvatarURL    string    `gorm:"type:varchar(512)"`
	PasswordHash string    `gorm:"type:varchar(255);not null"`
	CreatedAt    time.Time `gorm:"not null"`
	UpdatedAt    time.Time `gorm:"not null"`
}

func (backupUserSQLite) TableName() string { return "users" }

type backupDocumentSQLite struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID    uuid.UUID      `gorm:"type:uuid;not null;index:idx_docs_owner_updated,priority:1;index:idx_docs_owner_type,priority:1;index:idx_docs_owner_template,priority:1"`
	CanvasType     string         `gorm:"type:varchar(64);not null;index:idx_docs_owner_type,priority:2"`
	Title          string         `gorm:"type:varchar(255);not null"`
	Icon           string         `gorm:"type:varchar(16);not null;default:''"`
	Notes          string         `gorm:"type:text"`
	SchemaVersion  int            `gorm:"not null;default:1"`
	SaveVersion    int64          `gorm:"not null;default:1"`
	CurrentData    datatypes.JSON `gorm:"type:jsonb;not null"`
	ContentText    string         `gorm:"type:text;not null;default:''"`
	HeadRevisionID *uuid.UUID     `gorm:"type:uuid"`
	TemplateID     *string        `gorm:"type:varchar(64);index:idx_docs_owner_template,priority:2"`
	ProjectID      *uuid.UUID     `gorm:"type:uuid;index"`
	CreatedAt      time.Time      `gorm:"not null"`
	UpdatedAt      time.Time      `gorm:"not null;index:idx_docs_owner_updated,priority:2,sort:desc"`
	DeletedAt      gorm.DeletedAt `gorm:"index"`
}

func (backupDocumentSQLite) TableName() string { return "canvas_documents" }

type backupRevisionSQLite struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey"`
	DocumentID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_revisions_document,priority:1"`
	ParentID       *uuid.UUID     `gorm:"type:uuid"`
	RevisionType   string         `gorm:"type:varchar(16);not null"`
	Payload        datatypes.JSON `gorm:"type:jsonb;not null"`
	BaseSnapshotID *uuid.UUID     `gorm:"type:uuid"`
	AuthorUserID   *uuid.UUID     `gorm:"type:uuid"`
	Label          *string        `gorm:"type:varchar(255)"`
	ContentHash    *string        `gorm:"type:varchar(64)"`
	CreatedAt      time.Time      `gorm:"not null;index:idx_revisions_document,priority:2,sort:desc"`
}

func (backupRevisionSQLite) TableName() string { return "canvas_revisions" }

type backupContentBlockSQLite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	DocumentID  uuid.UUID `gorm:"type:uuid;not null;index:idx_blocks_document_panel,priority:1"`
	PanelID     string    `gorm:"type:varchar(64);index:idx_blocks_document_panel,priority:2"`
	PanelTitle  string    `gorm:"type:varchar(255)"`
	BlockPath   string    `gorm:"type:varchar(255)"`
	TextContent string    `gorm:"type:text;not null"`
	SortOrder   int       `gorm:"not null;default:0"`
	UpdatedAt   time.Time `gorm:"not null"`
}

func (backupContentBlockSQLite) TableName() string { return "canvas_content_blocks" }

type backupImportSQLite struct {
	ID                 uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID        uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:idx_backup_import_owner_batch,priority:1"`
	BatchID            string         `gorm:"type:varchar(128);not null;uniqueIndex:idx_backup_import_owner_batch,priority:2"`
	RequestFingerprint string         `gorm:"type:varchar(64);not null"`
	Status             string         `gorm:"type:varchar(16);not null"`
	Result             datatypes.JSON `gorm:"type:jsonb;not null"`
	CreatedAt          time.Time      `gorm:"not null"`
	UpdatedAt          time.Time      `gorm:"not null"`
}

func (backupImportSQLite) TableName() string { return "backup_imports" }

func newBackupTestService(t *testing.T, maxOpenConns int) (*DocumentsService, *gorm.DB, uuid.UUID, uuid.UUID) {
	t.Helper()
	// 文件型 SQLite 配合 WAL 和 busy_timeout，可以真正让多个连接竞争唯一键；
	// 不是仅靠单连接串行化来伪装并发测试。
	dsn := "file:" + filepath.Join(t.TempDir(), "backup.db") +
		"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(
		&backupUserSQLite{},
		&backupDocumentSQLite{},
		&backupRevisionSQLite{},
		&backupContentBlockSQLite{},
		&backupImportSQLite{},
		&pageReferencesSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	return NewDocumentsService(db), db, createBackupOwner(t, db), createBackupOwner(t, db)
}

func createBackupOwner(t *testing.T, db *gorm.DB) uuid.UUID {
	t.Helper()
	id := uuid.New()
	now := time.Now().UTC()
	if err := db.Create(&model.User{
		ID:           id,
		Email:        id.String() + "@example.test",
		PasswordHash: "test-only",
		CreatedAt:    now,
		UpdatedAt:    now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	return id
}

func makeBackupBundle(count int) BackupBundle {
	docs := make([]BackupDocument, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, BackupDocument{
			Title:         fmt.Sprintf("导入-%03d", i),
			CanvasType:    "canvas",
			SchemaVersion: 1,
			UpdatedAt:     time.Unix(int64(1_700_000_000+i), 0).UTC(),
			CurrentData: []byte(fmt.Sprintf(
				`{"type":"canvas","schemaVersion":1,"value":%d}`, i,
			)),
		})
	}
	return BackupBundle{
		Version:    backupVersion,
		ExportedAt: time.Unix(1_700_100_000, 0).UTC(),
		Count:      count,
		Documents:  docs,
	}
}

func backupDocumentCount(t *testing.T, db *gorm.DB, ownerID uuid.UUID) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.CanvasDocument{}).
		Where("owner_user_id = ?", ownerID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	return count
}

func backupImportCount(t *testing.T, db *gorm.DB, ownerID uuid.UUID) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.BackupImport{}).
		Where("owner_user_id = ?", ownerID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	return count
}

func TestRestoreBackupRejectsUnknownVersion(t *testing.T) {
	svc := NewDocumentsService(nil)
	_, err := svc.RestoreBackup(uuid.New(), BackupBundle{Version: 0})
	if err != ErrValidation {
		t.Fatalf("version = %v", err)
	}
	docs := make([]BackupDocument, maxBackupRestore+1)
	_, err = svc.RestoreBackup(uuid.New(), BackupBundle{Version: backupVersion, Documents: docs})
	if err != ErrValidation {
		t.Fatalf("too many = %v", err)
	}
}

func TestRestoreBackupSkipsInvalidCanvas(t *testing.T) {
	svc := NewDocumentsService(nil)
	got, err := svc.RestoreBackup(uuid.New(), BackupBundle{
		Version: backupVersion,
		Documents: []BackupDocument{{
			Title:       "坏的",
			CanvasType:  "canvas",
			CurrentData: []byte(`[]`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Imported != 0 || got.Skipped != 1 {
		t.Fatalf("got %+v", got)
	}
}

func TestRestoreBackupBatchSkipsMalformedCanvasAndReplays(t *testing.T) {
	svc, db, owner, _ := newBackupTestService(t, 1)
	bundle := makeBackupBundle(1)
	bundle.Documents = append(bundle.Documents, BackupDocument{
		Title:       " malformed JSON ",
		CanvasType:  "canvas",
		CurrentData: []byte(`{"type":`),
	})
	bundle.Count = len(bundle.Documents)

	first, err := svc.RestoreBackup(owner, bundle, "batch-with-invalid-canvas")
	if err != nil {
		t.Fatal(err)
	}
	if first.Imported != 1 || first.Skipped != 1 {
		t.Fatalf("first result = %+v", first)
	}
	replayed, err := svc.RestoreBackup(owner, bundle, "batch-with-invalid-canvas")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, replayed) {
		t.Fatalf("first = %+v, replay = %+v", first, replayed)
	}
	if got := backupDocumentCount(t, db, owner); got != 1 {
		t.Fatalf("replayed import created duplicate documents: %d", got)
	}
}

func TestBackupExportAndRestoreTwoHundred(t *testing.T) {
	svc, db, sourceOwner, targetOwner := newBackupTestService(t, 1)
	now := time.Now().UTC().Truncate(time.Second)
	docs := make([]model.CanvasDocument, 0, maxBackupExport+2)
	for i := 0; i < maxBackupExport+1; i++ {
		docs = append(docs, model.CanvasDocument{
			ID:            uuid.New(),
			OwnerUserID:   sourceOwner,
			CanvasType:    "canvas",
			Title:         fmt.Sprintf("画布-%03d", i),
			SchemaVersion: 1,
			SaveVersion:   1,
			CurrentData:   datatypes.JSON(fmt.Sprintf(`{"type":"canvas","schemaVersion":1,"n":%d}`, i)),
			ContentText:   "",
			CreatedAt:     now,
			UpdatedAt:     now.Add(time.Duration(i) * time.Second),
		})
	}
	// 额外放一份更新的归档文档，验证它既不会挤占 200 条名额，也不会出现在 bundle。
	docs = append(docs, model.CanvasDocument{
		ID:            uuid.New(),
		OwnerUserID:   sourceOwner,
		CanvasType:    "canvas",
		Title:         "已归档",
		SchemaVersion: 1,
		SaveVersion:   1,
		CurrentData:   datatypes.JSON(`{"type":"canvas","archived":true}`),
		ContentText:   "",
		CreatedAt:     now,
		UpdatedAt:     now.Add(1000 * time.Hour),
		DeletedAt:     gorm.DeletedAt{Time: now, Valid: true},
	})
	if err := db.CreateInBatches(docs, 25).Error; err != nil {
		t.Fatal(err)
	}

	bundle, err := svc.ExportBackup(sourceOwner)
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Count != maxBackupExport || len(bundle.Documents) != maxBackupExport || !bundle.Truncated {
		t.Fatalf("unexpected export metadata: count=%d len=%d truncated=%v",
			bundle.Count, len(bundle.Documents), bundle.Truncated)
	}
	if bundle.Documents[0].Title != "画布-200" {
		t.Fatalf("newest document first = %q", bundle.Documents[0].Title)
	}
	for i := 1; i < len(bundle.Documents); i++ {
		if bundle.Documents[i-1].UpdatedAt.Before(bundle.Documents[i].UpdatedAt) {
			t.Fatalf("updated_at order broken at %d", i)
		}
		if bundle.Documents[i].Title == "已归档" {
			t.Fatal("archived document leaked into backup")
		}
	}

	result, err := svc.RestoreBackup(targetOwner, *bundle)
	if err != nil {
		t.Fatal(err)
	}
	if result.Imported != maxBackupExport || result.Skipped != 0 {
		t.Fatalf("restore result = %+v", result)
	}
	if got := backupDocumentCount(t, db, targetOwner); got != maxBackupExport {
		t.Fatalf("restored documents = %d", got)
	}
	var revisions int64
	if err := db.Model(&model.CanvasRevision{}).
		Where("author_user_id = ?", targetOwner).Count(&revisions).Error; err != nil {
		t.Fatal(err)
	}
	if revisions != maxBackupExport {
		t.Fatalf("initial revisions = %d", revisions)
	}
}

func TestIterateBackupExportBatches(t *testing.T) {
	svc, db, owner, _ := newBackupTestService(t, 1)
	now := time.Now().UTC().Truncate(time.Second)
	const total = 125
	docs := make([]model.CanvasDocument, 0, total)
	for i := 0; i < total; i++ {
		docs = append(docs, model.CanvasDocument{
			ID:            uuid.New(),
			OwnerUserID:   owner,
			CanvasType:    "canvas",
			Title:         fmt.Sprintf("分批-%03d", i),
			SchemaVersion: 1,
			SaveVersion:   1,
			CurrentData:   datatypes.JSON(`{"type":"canvas"}`),
			CreatedAt:     now,
			UpdatedAt:     now.Add(time.Duration(i) * time.Second),
		})
	}
	if err := db.CreateInBatches(docs, 25).Error; err != nil {
		t.Fatal(err)
	}

	const batchSize = 17
	var streamed []BackupDocument
	var batchLengths []int
	var exportedAt time.Time
	err := svc.IterateBackupExport(owner, batchSize, func(batch BackupExportBatch) error {
		if len(batch.Documents) > batchSize {
			t.Fatalf("oversized batch: %d", len(batch.Documents))
		}
		if batch.Count != total || batch.Truncated || batch.Version != backupVersion {
			t.Fatalf("metadata = %+v", batch)
		}
		if exportedAt.IsZero() {
			exportedAt = batch.ExportedAt
		} else if !batch.ExportedAt.Equal(exportedAt) {
			t.Fatal("export timestamp changed between batches")
		}
		batchLengths = append(batchLengths, len(batch.Documents))
		streamed = append(streamed, batch.Documents...)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(batchLengths) != 8 || batchLengths[len(batchLengths)-1] != 6 {
		t.Fatalf("batch lengths = %v", batchLengths)
	}
	legacy, err := svc.ExportBackup(owner)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(streamed, legacy.Documents) {
		t.Fatal("batched traversal differs from compatibility ExportBackup")
	}
}

func TestIterateBackupExportEmptyBundleStillCallsBack(t *testing.T) {
	svc, _, owner, _ := newBackupTestService(t, 1)
	calls := 0
	err := svc.IterateBackupExport(owner, 0, func(batch BackupExportBatch) error {
		calls++
		if batch.Count != 0 || batch.Documents == nil || len(batch.Documents) != 0 {
			t.Fatalf("empty batch = %+v", batch)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("callbacks = %d", calls)
	}
}

func TestRestoreBackupBatchIdempotencyAndConflict(t *testing.T) {
	svc, db, owner, otherOwner := newBackupTestService(t, 1)
	bundle := makeBackupBundle(2)
	first, err := svc.RestoreBackup(owner, bundle, "batch-retry")
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := svc.RestoreBackup(owner, bundle, "batch-retry")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, replayed) || first.Imported != 2 || first.Skipped != 0 {
		t.Fatalf("first=%+v replay=%+v", first, replayed)
	}
	if got := backupDocumentCount(t, db, owner); got != 2 {
		t.Fatalf("duplicate retry created documents: %d", got)
	}
	if got := backupImportCount(t, db, owner); got != 1 {
		t.Fatalf("import records = %d", got)
	}
	var record model.BackupImport
	if err := db.Where("owner_user_id = ? AND batch_id = ?", owner, "batch-retry").
		First(&record).Error; err != nil {
		t.Fatal(err)
	}
	if record.Status != model.BackupImportStatusCompleted || len(record.RequestFingerprint) != 64 {
		t.Fatalf("import record = %+v", record)
	}

	changed := bundle
	changed.Documents = append([]BackupDocument(nil), bundle.Documents...)
	changed.Documents[0].Title = "另一份 bundle"
	if _, err := svc.RestoreBackup(owner, changed, "batch-retry"); !errors.Is(err, ErrBackupImportConflict) {
		t.Fatalf("same batch with different bundle: %v", err)
	}
	if got := backupDocumentCount(t, db, owner); got != 2 {
		t.Fatalf("conflict changed documents: %d", got)
	}
	// 唯一键包含 owner，另一个账号可以合法复用相同客户端批次号。
	if _, err := svc.RestoreBackup(otherOwner, bundle, "batch-retry"); err != nil {
		t.Fatal(err)
	}
	if got := backupDocumentCount(t, db, otherOwner); got != 2 {
		t.Fatalf("other owner documents = %d", got)
	}
}

func TestRestoreBackupConcurrentBatchRunsOnce(t *testing.T) {
	svc, db, owner, _ := newBackupTestService(t, 12)
	bundle := makeBackupBundle(3)
	const workers = 10
	start := make(chan struct{})
	type outcome struct {
		result *BackupRestoreResult
		err    error
	}
	outcomes := make(chan outcome, workers)
	for i := 0; i < workers; i++ {
		go func() {
			<-start
			result, err := svc.RestoreBackup(owner, bundle, "concurrent-batch")
			outcomes <- outcome{result: result, err: err}
		}()
	}
	close(start)
	for i := 0; i < workers; i++ {
		out := <-outcomes
		if out.err != nil {
			t.Errorf("concurrent restore %d: %v", i, out.err)
			continue
		}
		if out.result.Imported != 3 || out.result.Skipped != 0 {
			t.Errorf("concurrent result %d = %+v", i, out.result)
		}
	}
	if t.Failed() {
		return
	}
	if got := backupDocumentCount(t, db, owner); got != 3 {
		t.Fatalf("documents after concurrent retries = %d", got)
	}
	if got := backupImportCount(t, db, owner); got != 1 {
		t.Fatalf("import rows after concurrent retries = %d", got)
	}
}

func TestRestoreBackupCreateFailureRollsBackWholeBatch(t *testing.T) {
	for _, batchID := range []string{"", "rollback-batch"} {
		t.Run(fmt.Sprintf("batch=%q", batchID), func(t *testing.T) {
			svc, db, owner, _ := newBackupTestService(t, 1)
			bundle := makeBackupBundle(2)
			// CurrentData 预检会通过，但第二篇 Create 的元数据校验失败。
			// 旧实现会把它伪装成 skipped 并留下第一篇；新实现必须报错且第一篇也回滚。
			bundle.Documents[1].Title = strings.Repeat("长", maxTitleRunes+1)
			var err error
			if batchID == "" {
				_, err = svc.RestoreBackup(owner, bundle)
			} else {
				_, err = svc.RestoreBackup(owner, bundle, batchID)
			}
			if !errors.Is(err, ErrValidation) {
				t.Fatalf("create failure = %v", err)
			}
			if got := backupDocumentCount(t, db, owner); got != 0 {
				t.Fatalf("documents survived rollback: %d", got)
			}
			if got := backupImportCount(t, db, owner); got != 0 {
				t.Fatalf("import row survived rollback: %d", got)
			}
			var revisions int64
			if err := db.Model(&model.CanvasRevision{}).
				Where("author_user_id = ?", owner).Count(&revisions).Error; err != nil {
				t.Fatal(err)
			}
			if revisions != 0 {
				t.Fatalf("revisions survived rollback: %d", revisions)
			}

			// 失败事务没有占用批次号，修正输入后可以用同一 ID 成功重试。
			bundle.Documents[1].Title = "已修正"
			var result *BackupRestoreResult
			if batchID == "" {
				result, err = svc.RestoreBackup(owner, bundle)
			} else {
				result, err = svc.RestoreBackup(owner, bundle, batchID)
			}
			if err != nil {
				t.Fatal(err)
			}
			if result.Imported != 2 || backupDocumentCount(t, db, owner) != 2 {
				t.Fatalf("corrected retry = %+v", result)
			}
		})
	}
}

func TestRestoreBackupDatabaseErrorIsNotSkipped(t *testing.T) {
	svc, db, owner, _ := newBackupTestService(t, 1)
	var documentCreates atomic.Int32
	injected := errors.New("injected document insert failure")
	if err := db.Callback().Create().Before("gorm:create").Register(
		"test_fail_second_backup_document",
		func(tx *gorm.DB) {
			if tx.Statement.Table == "canvas_documents" && documentCreates.Add(1) == 2 {
				tx.AddError(injected)
			}
		},
	); err != nil {
		t.Fatal(err)
	}
	result, err := svc.RestoreBackup(owner, makeBackupBundle(2), "database-error")
	if !errors.Is(err, injected) {
		t.Fatalf("database error = %v", err)
	}
	if result != nil {
		t.Fatalf("database error disguised as a skipped result: %+v", result)
	}
	if got := backupDocumentCount(t, db, owner); got != 0 {
		t.Fatalf("documents survived database rollback: %d", got)
	}
	if got := backupImportCount(t, db, owner); got != 0 {
		t.Fatalf("import row survived database rollback: %d", got)
	}
}
