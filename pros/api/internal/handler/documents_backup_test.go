package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func backupStreamBatch(exportedAt time.Time, count int, docs ...service.BackupDocument) service.BackupExportBatch {
	return service.BackupExportBatch{
		Version:    1,
		ExportedAt: exportedAt,
		Count:      count,
		Documents:  docs,
	}
}

// backupStreamIterator 按测试脚本依次执行 yield，模拟服务层的真实回调约定。
// 编码器不依赖数据库，因此这里可以精确构造空备份、多批次和中途故障。
func backupStreamIterator(
	batches []service.BackupExportBatch,
	terminalErr error,
) func(func(service.BackupExportBatch) error) error {
	return func(yield func(service.BackupExportBatch) error) error {
		for _, batch := range batches {
			if err := yield(batch); err != nil {
				return err
			}
		}
		return terminalErr
	}
}

func TestWriteBackupExportJoinsMultipleBatchesAsValidJSON(t *testing.T) {
	exportedAt := time.Date(2026, 11, 17, 8, 30, 0, 0, time.UTC)
	batches := []service.BackupExportBatch{
		backupStreamBatch(exportedAt, 3,
			service.BackupDocument{Title: "第一篇", CanvasType: "canvas", CurrentData: json.RawMessage(`{"type":"canvas","n":1}`)},
			service.BackupDocument{Title: "第二篇", CanvasType: "canvas", CurrentData: json.RawMessage(`{"type":"canvas","n":2}`)},
		),
		backupStreamBatch(exportedAt, 3,
			service.BackupDocument{Title: "第三篇", CanvasType: "canvas", CurrentData: json.RawMessage(`{"type":"canvas","n":3}`)},
		),
	}
	var out bytes.Buffer
	if err := writeBackupExport(&out, backupStreamIterator(batches, nil)); err != nil {
		t.Fatal(err)
	}
	if !json.Valid(out.Bytes()) {
		t.Fatalf("stream is not valid JSON: %q", out.String())
	}
	var bundle service.BackupBundle
	if err := json.Unmarshal(out.Bytes(), &bundle); err != nil {
		t.Fatal(err)
	}
	if bundle.Version != 1 || bundle.Count != 3 || !bundle.ExportedAt.Equal(exportedAt) {
		t.Fatalf("unexpected metadata: %+v", bundle)
	}
	if len(bundle.Documents) != 3 {
		t.Fatalf("documents = %d, want 3", len(bundle.Documents))
	}
	for i, want := range []string{"第一篇", "第二篇", "第三篇"} {
		if bundle.Documents[i].Title != want {
			t.Fatalf("document %d title = %q, want %q", i, bundle.Documents[i].Title, want)
		}
	}
}

func TestWriteBackupExportEmitsEmptyDocumentsArray(t *testing.T) {
	exportedAt := time.Date(2026, 11, 17, 8, 30, 0, 0, time.UTC)
	var out bytes.Buffer
	err := writeBackupExport(&out, backupStreamIterator(
		[]service.BackupExportBatch{backupStreamBatch(exportedAt, 0)}, nil,
	))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `"documents":[]`) {
		t.Fatalf("empty backup must contain an array, got %q", out.String())
	}
	var bundle service.BackupBundle
	if err := json.Unmarshal(out.Bytes(), &bundle); err != nil {
		t.Fatal(err)
	}
	if bundle.Count != 0 || len(bundle.Documents) != 0 {
		t.Fatalf("unexpected empty bundle: %+v", bundle)
	}
}

func TestWriteBackupExportRejectsIncompleteOrInconsistentStreams(t *testing.T) {
	exportedAt := time.Date(2026, 11, 17, 8, 30, 0, 0, time.UTC)
	validDoc := service.BackupDocument{
		Title: "画布", CanvasType: "canvas", CurrentData: json.RawMessage(`{"type":"canvas"}`),
	}
	tests := []struct {
		name        string
		batches     []service.BackupExportBatch
		terminalErr error
		wantErr     string
	}{
		{
			name:    "数据库中途失败",
			batches: []service.BackupExportBatch{backupStreamBatch(exportedAt, 1, validDoc)},
			// 即使首批已经写完，也不能补上 JSON 结尾伪装成功。
			terminalErr: errors.New("database disconnected"),
			wantErr:     "database disconnected",
		},
		{
			name:    "实际篇数少于声明",
			batches: []service.BackupExportBatch{backupStreamBatch(exportedAt, 2, validDoc)},
			wantErr: "count mismatch",
		},
		{
			name: "批次元数据漂移",
			batches: []service.BackupExportBatch{
				backupStreamBatch(exportedAt, 1),
				{Version: 1, ExportedAt: exportedAt.Add(time.Second), Count: 1, Documents: []service.BackupDocument{validDoc}},
			},
			wantErr: "metadata changed",
		},
		{
			name: "文档 JSON 损坏",
			batches: []service.BackupExportBatch{backupStreamBatch(exportedAt, 1, service.BackupDocument{
				Title: "坏数据", CanvasType: "canvas", CurrentData: json.RawMessage(`{"type":`),
			})},
			wantErr: "encode backup document",
		},
		{
			name:    "服务层没有返回元数据",
			wantErr: "no metadata",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			err := writeBackupExport(&out, backupStreamIterator(tt.batches, tt.terminalErr))
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error = %v, want substring %q", err, tt.wantErr)
			}
			if json.Valid(out.Bytes()) {
				t.Fatalf("failed stream must not look like a complete backup: %q", out.String())
			}
		})
	}
}

func TestHandleDocErrMapsBackupImportConflictTo409(t *testing.T) {
	engine := route.NewEngine(config.NewOptions(nil))
	engine.GET("/backup-conflict", func(ctx context.Context, c *app.RequestContext) {
		if !handleDocErr(c, service.ErrBackupImportConflict, nil) {
			c.Status(http.StatusNoContent)
		}
	})
	rec := ut.PerformRequest(engine, http.MethodGet, "/backup-conflict", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "backup_import_conflict") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

// backupHandlerDocumentSQLite 仅为 HTTP 测试建立 SQLite 可扫描的时间列。
// 生产模型使用 timestamptz；直接由 SQLite AutoMigrate 会把时间存成 TEXT，
// 导致查询时无法 Scan 回 time.Time。表名和列名与生产模型保持一致，handler 和
// service 仍执行真实导出代码，没有用 mock 替代本次要验证的 HTTP/数据库路径。
type backupHandlerDocumentSQLite struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID    uuid.UUID      `gorm:"type:uuid;not null;index"`
	CanvasType     string         `gorm:"type:varchar(64);not null"`
	Title          string         `gorm:"type:varchar(255);not null"`
	Notes          string         `gorm:"type:text"`
	SchemaVersion  int            `gorm:"not null;default:1"`
	SaveVersion    int64          `gorm:"not null;default:1"`
	CurrentData    datatypes.JSON `gorm:"type:jsonb;not null"`
	ContentText    string         `gorm:"type:text;not null;default:''"`
	HeadRevisionID *uuid.UUID     `gorm:"type:uuid"`
	TemplateID     *string        `gorm:"type:varchar(64)"`
	CreatedAt      time.Time      `gorm:"not null"`
	UpdatedAt      time.Time      `gorm:"not null"`
	DeletedAt      gorm.DeletedAt `gorm:"index"`
}

func (backupHandlerDocumentSQLite) TableName() string { return "kb_documents" }

type backupHandlerImportSQLite struct {
	ID                 uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID        uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:idx_backup_import_owner_batch,priority:1"`
	BatchID            string         `gorm:"type:varchar(128);not null;uniqueIndex:idx_backup_import_owner_batch,priority:2"`
	RequestFingerprint string         `gorm:"type:varchar(64);not null"`
	Status             string         `gorm:"type:varchar(16);not null"`
	Result             datatypes.JSON `gorm:"type:jsonb;not null"`
	CreatedAt          time.Time      `gorm:"not null"`
	UpdatedAt          time.Time      `gorm:"not null"`
}

func (backupHandlerImportSQLite) TableName() string { return "core_backup_imports" }

func TestBackupHandlerStreamsCompleteJSONThroughHertz(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&backupHandlerDocumentSQLite{}); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)
	docs := []backupHandlerDocumentSQLite{
		{
			ID: uuid.New(), OwnerUserID: owner, CanvasType: "canvas", Title: "较旧",
			SchemaVersion: 1, SaveVersion: 1, CurrentData: datatypes.JSON(`{"type":"canvas","n":1}`),
			CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: uuid.New(), OwnerUserID: owner, CanvasType: "canvas", Title: "较新",
			SchemaVersion: 1, SaveVersion: 1, CurrentData: datatypes.JSON(`{"type":"canvas","n":2}`),
			CreatedAt: now, UpdatedAt: now.Add(time.Second),
		},
		{
			ID: uuid.New(), OwnerUserID: uuid.New(), CanvasType: "canvas", Title: "其他账号",
			SchemaVersion: 1, SaveVersion: 1, CurrentData: datatypes.JSON(`{"type":"canvas"}`),
			CreatedAt: now, UpdatedAt: now.Add(2 * time.Second),
		},
		{
			ID: uuid.New(), OwnerUserID: owner, CanvasType: "canvas", Title: "已归档",
			SchemaVersion: 1, SaveVersion: 1, CurrentData: datatypes.JSON(`{"type":"canvas"}`),
			CreatedAt: now, UpdatedAt: now.Add(3 * time.Second), DeletedAt: gorm.DeletedAt{Time: now, Valid: true},
		},
	}
	if err := db.Create(&docs).Error; err != nil {
		t.Fatal(err)
	}

	const secret = "backup-handler-test-secret"
	h := NewDocumentsHandler(service.NewDocumentsService(db))
	engine := route.NewEngine(config.NewOptions(nil))
	engine.Use(middleware.AuthRequired(secret))
	engine.GET("/documents/backup", h.Backup)
	token, err := middleware.SignToken(secret, owner, "owner@example.test", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rec := ut.PerformRequest(engine, http.MethodGet, "/documents/backup", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + token})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Disposition"); !strings.Contains(got, "metamatrix-backup.json") {
		t.Fatalf("Content-Disposition = %q", got)
	}
	var bundle service.BackupBundle
	if err := json.Unmarshal(rec.Body.Bytes(), &bundle); err != nil {
		t.Fatalf("streamed response is incomplete: %v; body = %q", err, rec.Body.String())
	}
	if bundle.Count != 2 || len(bundle.Documents) != 2 {
		t.Fatalf("bundle count = %d, documents = %d; body = %s", bundle.Count, len(bundle.Documents), rec.Body.String())
	}
	if bundle.Documents[0].Title != "较新" || bundle.Documents[1].Title != "较旧" {
		t.Fatalf("unexpected order or tenant isolation: %+v", bundle.Documents)
	}
}

func TestRestoreBackupHandlerPassesBatchIDAndReplaysResult(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&backupHandlerImportSQLite{}); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	const secret = "backup-restore-handler-test-secret"
	h := NewDocumentsHandler(service.NewDocumentsService(db))
	engine := route.NewEngine(config.NewOptions(nil))
	engine.Use(middleware.AuthRequired(secret))
	engine.POST("/documents/backup", h.RestoreBackup)
	token, err := middleware.SignToken(secret, owner, "owner@example.test", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	// 无效画布会被跳过，因此这个用例只需要幂等表即可运行真实事务；
	// 它专门验证 HTTP 绑定 -> 服务层去重 -> 首次结果重放，而不重复文档 Create 的测试。
	payload := `{"version":1,"exportedAt":"2026-11-17T00:00:00Z","count":1,"truncated":false,"documents":[{"title":"invalid","canvasType":"canvas","schemaVersion":1,"currentData":[]}],"importBatchId":"http-import-batch"}`
	perform := func(body string) *ut.ResponseRecorder {
		return ut.PerformRequest(engine, http.MethodPost, "/documents/backup", &ut.Body{Body: bytes.NewReader([]byte(body)), Len: len(body)},
			ut.Header{Key: "Authorization", Value: "Bearer " + token},
			ut.Header{Key: "Content-Type", Value: "application/json"})
	}
	for attempt := 0; attempt < 2; attempt++ {
		rec := perform(payload)
		if rec.Code != http.StatusOK {
			t.Fatalf("attempt %d status = %d, body = %s", attempt+1, rec.Code, rec.Body.String())
		}
		var result service.BackupRestoreResult
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Imported != 0 || result.Skipped != 1 {
			t.Fatalf("attempt %d result = %+v", attempt+1, result)
		}
	}
	var batches []backupHandlerImportSQLite
	if err := db.Where("owner_user_id = ?", owner).Find(&batches).Error; err != nil {
		t.Fatal(err)
	}
	if len(batches) != 1 || batches[0].BatchID != "http-import-batch" || batches[0].Status != "completed" {
		t.Fatalf("idempotency records = %+v", batches)
	}

	changed := strings.Replace(payload, `"title":"invalid"`, `"title":"changed"`, 1)
	rec := perform(changed)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "backup_import_conflict") {
		t.Fatalf("changed retry status = %d, body = %s", rec.Code, rec.Body.String())
	}
}
