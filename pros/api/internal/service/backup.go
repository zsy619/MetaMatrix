package service

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	backupVersion    = 1
	maxBackupExport  = 200
	maxBackupRestore = 200

	// DefaultBackupExportBatchSize 控制服务层每次从数据库读取的画布数。
	// HTTP 层可以逐批编码，避免在完整 JSON 之外再构造一份 200 份画布的大副本。
	DefaultBackupExportBatchSize = 50
	maxBackupExportBatchSize     = 100
	maxBackupImportBatchIDLength = 128
)

// ErrBackupImportConflict 表示同一个幂等批次号已经绑定了另一份 bundle。
// handler 应把它映射为 409，而不是当作数据库唯一键错误返回 500。
var ErrBackupImportConflict = errors.New("backup import batch is bound to a different bundle")

// BackupDocument is one owned canvas inside a portable JSON bundle.
type BackupDocument struct {
	Title         string          `json:"title"`
	Notes         string          `json:"notes,omitempty"`
	TemplateID    *string         `json:"templateId,omitempty"`
	CanvasType    string          `json:"canvasType"`
	SchemaVersion int             `json:"schemaVersion"`
	UpdatedAt     time.Time       `json:"updatedAt,omitempty"`
	CurrentData   json.RawMessage `json:"currentData"`
}

// BackupBundle is a personal export. It does not include other accounts or archived rows.
// 快照范围仍然只有 CurrentData：修订历史、媒体文件及媒体行不在该便携备份中。
type BackupBundle struct {
	Version    int              `json:"version"`
	ExportedAt time.Time        `json:"exportedAt"`
	Count      int              `json:"count"`
	Truncated  bool             `json:"truncated"`
	Documents  []BackupDocument `json:"documents"`
}

// BackupExportBatch 是供流式 HTTP handler 使用的一批导出数据。
// 元数据在每批中保持一致；第一批即可先写响应头，后续批次只追加 documents。
// Count 是本次最多导出的画布数，Truncated 表示账号是否还有第 201 份及以后的未归档画布。
type BackupExportBatch struct {
	Version    int
	ExportedAt time.Time
	Count      int
	Truncated  bool
	Documents  []BackupDocument
}

// BackupRestoreResult reports how many canvases were created as new documents.
type BackupRestoreResult struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

// IterateBackupExport 按 updated_at DESC、id ASC 分批遍历当前账号的未归档画布。
//
// 空备份也会回调一次，让调用方能够输出完整的空 documents 数组。batchSize 小于等于
// 零时使用默认值，过大时会被限制。这里提供的是可复用的服务层流式遍历能力；
// 是否把它接到 HTTP chunked/streaming 响应由 handler 决定。
func (s *DocumentsService) IterateBackupExport(
	ownerID uuid.UUID,
	batchSize int,
	yield func(BackupExportBatch) error,
) error {
	if yield == nil {
		return ErrValidation
	}
	if batchSize <= 0 {
		batchSize = DefaultBackupExportBatchSize
	}
	if batchSize > maxBackupExportBatchSize {
		batchSize = maxBackupExportBatchSize
	}

	// 先只取总数，不为了判断 truncated 把第 201 份完整 CurrentData 读进内存。
	// GORM 默认作用域会排除 deleted_at 非空的归档行，保持 UI 已声明的导出范围。
	var total int64
	if err := s.db.Model(&model.CanvasDocument{}).
		Where("owner_user_id = ?", ownerID).
		Count(&total).Error; err != nil {
		return fmt.Errorf("count backup documents: %w", err)
	}
	count := int(total)
	truncated := total > maxBackupExport
	if truncated {
		count = maxBackupExport
	}
	exportedAt := time.Now().UTC()

	if count == 0 {
		return yield(BackupExportBatch{
			Version:    backupVersion,
			ExportedAt: exportedAt,
			Count:      0,
			Truncated:  truncated,
			Documents:  []BackupDocument{},
		})
	}

	for offset := 0; offset < count; offset += batchSize {
		limit := batchSize
		if remain := count - offset; remain < limit {
			limit = remain
		}
		var docs []model.CanvasDocument
		err := s.db.
			Select("id, title, notes, template_id, canvas_type, schema_version, updated_at, current_data").
			Where("owner_user_id = ?", ownerID).
			// updated_at 可能相同，id 是稳定次序的第二键，避免分页边界反复或漏行。
			Order("updated_at DESC").
			Order("id ASC").
			Limit(limit).
			Offset(offset).
			Find(&docs).Error
		if err != nil {
			return fmt.Errorf("read backup documents at offset %d: %w", offset, err)
		}
		out := make([]BackupDocument, 0, len(docs))
		for _, doc := range docs {
			out = append(out, backupDocument(doc))
		}
		if err := yield(BackupExportBatch{
			Version:    backupVersion,
			ExportedAt: exportedAt,
			Count:      count,
			Truncated:  truncated,
			Documents:  out,
		}); err != nil {
			return fmt.Errorf("emit backup documents at offset %d: %w", offset, err)
		}
	}
	return nil
}

func backupDocument(doc model.CanvasDocument) BackupDocument {
	return BackupDocument{
		Title:         doc.Title,
		Notes:         doc.Notes,
		TemplateID:    doc.TemplateID,
		CanvasType:    doc.CanvasType,
		SchemaVersion: doc.SchemaVersion,
		UpdatedAt:     doc.UpdatedAt,
		CurrentData:   json.RawMessage(doc.CurrentData),
	}
}

// ExportBackup 保留旧 handler 所需的完整 bundle API。
// 新 handler 应优先使用 IterateBackupExport 逐批编码；此处仅为兼容而汇总所有批次。
func (s *DocumentsService) ExportBackup(ownerID uuid.UUID) (*BackupBundle, error) {
	bundle := &BackupBundle{Documents: make([]BackupDocument, 0)}
	err := s.IterateBackupExport(ownerID, DefaultBackupExportBatchSize, func(batch BackupExportBatch) error {
		bundle.Version = batch.Version
		bundle.ExportedAt = batch.ExportedAt
		bundle.Count = batch.Count
		bundle.Truncated = batch.Truncated
		bundle.Documents = append(bundle.Documents, batch.Documents...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return bundle, nil
}

// RestoreBackup creates new canvases for the caller. It never reuses the source ids.
//
// importBatchID 是可变可选参数：旧调用方仍传两个参数，新调用方传第三个字符串即可。
// 同 owner 下同批次、同 bundle 的重试返回首次结果；同批次不同 bundle 返回冲突。
// 所有有效 CurrentData 的 Create 都在一个外层事务里完成，任何一篇失败都会整批回滚。
func (s *DocumentsService) RestoreBackup(
	ownerID uuid.UUID,
	bundle BackupBundle,
	importBatchID ...string,
) (*BackupRestoreResult, error) {
	if bundle.Version != backupVersion || len(bundle.Documents) > maxBackupRestore || len(importBatchID) > 1 {
		return nil, ErrValidation
	}
	batchID := ""
	if len(importBatchID) == 1 {
		batchID = strings.TrimSpace(importBatchID[0])
		if len(batchID) > maxBackupImportBatchIDLength {
			return nil, ErrValidation
		}
	}

	// 预检只决定“哪些输入本来就无效”，不再把 Create 的数据库错误算作 skipped。
	// 因此调用方看到的 Imported + Skipped 永远等于请求里的文档数；写入异常则整批报错。
	valid := make([]BackupDocument, 0, len(bundle.Documents))
	result := &BackupRestoreResult{}
	for _, item := range bundle.Documents {
		if err := ValidateCanvasImport(item.CurrentData); err != nil {
			result.Skipped++
			continue
		}
		valid = append(valid, item)
	}
	if batchID == "" && len(valid) == 0 {
		// 保留旧行为：全部无效时不依赖数据库，直接返回跳过数量。
		return result, nil
	}
	if batchID == "" {
		if err := s.db.Transaction(func(tx *gorm.DB) error {
			return createBackupDocuments(tx, ownerID, valid, result)
		}); err != nil {
			return nil, err
		}
		return result, nil
	}

	fingerprint, err := backupRequestFingerprint(bundle)
	if err != nil {
		return nil, err
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		initialResult, err := json.Marshal(result)
		if err != nil {
			return fmt.Errorf("marshal initial backup import result: %w", err)
		}
		record := model.BackupImport{
			ID:                 uuid.New(),
			OwnerUserID:        ownerID,
			BatchID:            batchID,
			RequestFingerprint: fingerprint,
			Status:             model.BackupImportStatusImporting,
			Result:             datatypes.JSON(initialResult),
		}

		// 数据库唯一键是并发幂等的最终裁决者。ON CONFLICT 会等待并发事务结束，
		// 不会像“先 SELECT 再 INSERT”那样让两个请求都进入 Create，或暴露唯一键 500。
		res := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "owner_user_id"}, {Name: "batch_id"}},
			DoNothing: true,
		}).Create(&record)
		if res.Error != nil {
			return fmt.Errorf("reserve backup import batch: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			var existing model.BackupImport
			if err := tx.Where("owner_user_id = ? AND batch_id = ?", ownerID, batchID).
				First(&existing).Error; err != nil {
				return fmt.Errorf("load existing backup import batch: %w", err)
			}
			if existing.RequestFingerprint != fingerprint {
				return ErrBackupImportConflict
			}
			if existing.Status != model.BackupImportStatusCompleted {
				return fmt.Errorf("backup import batch has unfinished status %q", existing.Status)
			}
			var firstResult BackupRestoreResult
			if err := json.Unmarshal(existing.Result, &firstResult); err != nil {
				return fmt.Errorf("decode existing backup import result: %w", err)
			}
			// 重试不执行 createBackupDocuments，直接复用首次提交的相同结果。
			result = &firstResult
			return nil
		}

		if err := createBackupDocuments(tx, ownerID, valid, result); err != nil {
			return err
		}
		finalResult, err := json.Marshal(result)
		if err != nil {
			return fmt.Errorf("marshal final backup import result: %w", err)
		}
		// 占位记录、文档、初始修订及提取块必须一起提交；任一步失败均不会留下批次记录。
		if err := tx.Model(&model.BackupImport{}).
			Where("id = ?", record.ID).
			Updates(map[string]interface{}{
				"status": model.BackupImportStatusCompleted,
				"result": datatypes.JSON(finalResult),
			}).Error; err != nil {
			return fmt.Errorf("complete backup import batch: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func createBackupDocuments(
	tx *gorm.DB,
	ownerID uuid.UUID,
	items []BackupDocument,
	result *BackupRestoreResult,
) error {
	// Create 自带文档 + 初始修订 + 内容提取的内层事务。把 tx 注入一个新的服务实例，
	// GORM 会使用 savepoint 嵌套到外层事务，既复用现有逻辑，又保证整批恢复原子性。
	importer := NewDocumentsService(tx)
	for index, item := range items {
		title := item.Title
		canvasType := item.CanvasType
		_, err := importer.Create(ownerID, CreateDocumentInput{
			Title:      &title,
			Notes:      &item.Notes,
			CanvasType: &canvasType,
			TemplateID: item.TemplateID,
			Data:       item.CurrentData,
		})
		if err != nil {
			return fmt.Errorf("create backup document %d: %w", index, err)
		}
		result.Imported++
	}
	return nil
}

// backupRequestFingerprint 逐字段、逐文档计算 SHA-256，不把 200 份 CurrentData
// 再拼成一个完整 JSON 副本。长度前缀避免字段边界不同却产生相同哈希输入。
func backupRequestFingerprint(bundle BackupBundle) (string, error) {
	h := sha256.New()
	fields := []interface{}{bundle.Version, bundle.ExportedAt, bundle.Count, bundle.Truncated}
	for _, field := range fields {
		if err := writeBackupFingerprintField(h, field); err != nil {
			return "", err
		}
	}
	for _, doc := range bundle.Documents {
		fields := []interface{}{
			doc.Title,
			doc.Notes,
			doc.TemplateID,
			doc.CanvasType,
			doc.SchemaVersion,
			doc.UpdatedAt,
		}
		for _, field := range fields {
			if err := writeBackupFingerprintField(h, field); err != nil {
				return "", err
			}
		}
		// CurrentData 可能正是预检要跳过的 malformed JSON。若再次 json.Marshal
		// 整个 BackupDocument，RawMessage 会在计为 skipped 之前提前报错。
		// 直接哈希原始字节既保留精确请求指纹，也不改变恢复接口的输入校验语义。
		writeBackupFingerprintBytes(h, doc.CurrentData)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func writeBackupFingerprintField(h hash.Hash, value interface{}) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal backup fingerprint field: %w", err)
	}
	writeBackupFingerprintBytes(h, raw)
	return nil
}

func writeBackupFingerprintBytes(h hash.Hash, raw []byte) {
	var size [8]byte
	binary.BigEndian.PutUint64(size[:], uint64(len(raw)))
	_, _ = h.Write(size[:])
	_, _ = h.Write(raw)
}
