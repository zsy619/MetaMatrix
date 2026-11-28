package service

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"metamatrix/api/internal/model"
)

const defaultCompactLimit = 200

// CompactReport 描述一次操作日志压缩的结果。
// 只删除「已被后续 snapshot 覆盖」的更早记录；没有 snapshot 时不删除，以免丢掉无法重建的增量。
// 不改 current_data，保存仍是双写。这仍不是完整的 Yjs 文档 GC。
type CompactReport struct {
	SnapshotSeq int64  `json:"snapshotSeq"`
	Deleted     int64  `json:"deleted"`
	Kept        int64  `json:"kept"`
	Reason      string `json:"reason"`
}

// CompactOperations 删除早于最新 kind=snapshot 的操作日志。
// 没有 snapshot 时返回 no_snapshot 且 Deleted=0。
// 已压到最新 snapshot 时返回 already_compacted 且 Deleted=0。
func (s *CollabService) CompactOperations(docID uuid.UUID) (*CompactReport, error) {
	return compactOperations(s.db, docID)
}

func compactOperations(db *gorm.DB, docID uuid.UUID) (*CompactReport, error) {
	var snapSeq int64
	if err := db.Model(&model.DocOperation{}).
		Where("document_id = ? AND kind = ?", docID, collabOpSnapshot).
		Select("COALESCE(MAX(seq), 0)").Scan(&snapSeq).Error; err != nil {
		return nil, err
	}
	if snapSeq == 0 {
		var kept int64
		if err := db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&kept).Error; err != nil {
			return nil, err
		}
		return &CompactReport{Kept: kept, Reason: "no_snapshot"}, nil
	}
	var deletable int64
	if err := db.Model(&model.DocOperation{}).
		Where("document_id = ? AND seq < ?", docID, snapSeq).
		Count(&deletable).Error; err != nil {
		return nil, err
	}
	if deletable == 0 {
		var kept int64
		if err := db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&kept).Error; err != nil {
			return nil, err
		}
		return &CompactReport{SnapshotSeq: snapSeq, Kept: kept, Reason: "already_compacted"}, nil
	}
	res := db.Where("document_id = ? AND seq < ?", docID, snapSeq).Delete(&model.DocOperation{})
	if res.Error != nil {
		return nil, res.Error
	}
	var kept int64
	if err := db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&kept).Error; err != nil {
		return nil, err
	}
	return &CompactReport{
		SnapshotSeq: snapSeq,
		Deleted:     res.RowsAffected,
		Kept:        kept,
		Reason:      "compacted_before_snapshot",
	}, nil
}

func (s *CollabService) maybeCompactOperations(docID uuid.UUID) error {
	limit := s.compactLimit
	if limit < 0 {
		return nil
	}
	if limit == 0 {
		limit = defaultCompactLimit
	}
	// 阈值看「可以被最新 snapshot 覆盖的前缀」，不看快照之后仍必须保留的增量。
	// 快照后日志再长，也不在这里删；没有 snapshot 时同样不删。
	var snapSeq int64
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND kind = ?", docID, collabOpSnapshot).
		Select("COALESCE(MAX(seq), 0)").Scan(&snapSeq).Error; err != nil {
		return err
	}
	if snapSeq == 0 {
		return nil
	}
	var deletable int64
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND seq < ?", docID, snapSeq).
		Count(&deletable).Error; err != nil {
		return err
	}
	if deletable <= int64(limit) {
		return nil
	}
	_, err := compactOperations(s.db, docID)
	return err
}

// yjsStateBytes 从 current_data / 修订 payload 里取出已解码的 Yjs 快照。
func yjsStateBytes(raw []byte) ([]byte, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var payload struct {
		YjsState string `json:"yjsState"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	state := strings.TrimSpace(payload.YjsState)
	if state == "" {
		return nil, false
	}
	decoded, err := base64.StdEncoding.DecodeString(state)
	if err != nil || len(decoded) == 0 {
		return nil, false
	}
	return decoded, true
}

// appendDocOperation 在同一文档内写入下一条操作日志，Seq 冲突时重试。
func appendDocOperation(tx *gorm.DB, docID, authorID uuid.UUID, kind string, payload []byte, saveVersion int64) (*model.DocOperation, error) {
	var lastErr error
	var row model.DocOperation
	for attempt := 0; attempt < 5; attempt++ {
		var lastSeq int64
		if err := tx.Model(&model.DocOperation{}).
			Where("document_id = ?", docID).
			Select("COALESCE(MAX(seq), 0)").
			Scan(&lastSeq).Error; err != nil {
			return nil, err
		}
		row = model.DocOperation{
			ID:           uuid.New(),
			DocumentID:   docID,
			Seq:          lastSeq + 1,
			Kind:         kind,
			Payload:      payload,
			AuthorUserID: authorID,
			SaveVersion:  saveVersion,
			CreatedAt:    time.Now().UTC(),
		}
		lastErr = tx.Create(&row).Error
		if lastErr == nil {
			return &row, nil
		}
		if !isUniqueConflict(lastErr) {
			return nil, lastErr
		}
	}
	return nil, lastErr
}

// recordRestoreSnapshot 在恢复写入 current_data 的同一事务里追加 snapshot，并删掉更早的操作日志。
// 这样 List 从恢复后的状态开始，不会被恢复前较新的增量重新盖掉。仍不是完整版本树。
func recordRestoreSnapshot(tx *gorm.DB, docID, authorID uuid.UUID, currentData []byte) error {
	state, ok := yjsStateBytes(currentData)
	if !ok {
		return nil
	}
	var saveVersion int64
	if err := tx.Model(&model.CanvasDocument{}).
		Select("save_version").
		Where("id = ?", docID).
		Scan(&saveVersion).Error; err != nil {
		return err
	}
	snap, err := appendDocOperation(tx, docID, authorID, collabOpSnapshot, state, saveVersion)
	if err != nil {
		return err
	}
	return tx.Where("document_id = ? AND seq < ?", docID, snap.Seq).Delete(&model.DocOperation{}).Error
}
