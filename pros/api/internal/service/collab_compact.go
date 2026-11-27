package service

import (
	"github.com/google/uuid"
	"metamatrix/api/internal/model"
)

const defaultCompactLimit = 200

// CompactReport 描述一次操作日志压缩的结果。
// 只删除「已被后续 snapshot 覆盖」的更早记录；没有 snapshot 时不删除，以免丢掉无法重建的增量。
// 不改 current_data，保存仍是双写。
type CompactReport struct {
	SnapshotSeq int64  `json:"snapshotSeq"`
	Deleted     int64  `json:"deleted"`
	Kept        int64  `json:"kept"`
	Reason      string `json:"reason"`
}

// CompactOperations 删除早于最新 kind=snapshot 的操作日志。
// 没有 snapshot 时返回 no_snapshot 且 Deleted=0。
func (s *CollabService) CompactOperations(docID uuid.UUID) (*CompactReport, error) {
	var snapSeq int64
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND kind = ?", docID, collabOpSnapshot).
		Select("COALESCE(MAX(seq), 0)").Scan(&snapSeq).Error; err != nil {
		return nil, err
	}
	if snapSeq == 0 {
		var kept int64
		if err := s.db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&kept).Error; err != nil {
			return nil, err
		}
		return &CompactReport{Kept: kept, Reason: "no_snapshot"}, nil
	}
	res := s.db.Where("document_id = ? AND seq < ?", docID, snapSeq).Delete(&model.DocOperation{})
	if res.Error != nil {
		return nil, res.Error
	}
	var kept int64
	if err := s.db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&kept).Error; err != nil {
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
	var count int64
	if err := s.db.Model(&model.DocOperation{}).Where("document_id = ?", docID).Count(&count).Error; err != nil {
		return err
	}
	if count <= int64(limit) {
		return nil
	}
	_, err := s.CompactOperations(docID)
	return err
}
