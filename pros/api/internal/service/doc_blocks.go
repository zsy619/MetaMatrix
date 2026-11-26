package service

import (
	"encoding/json"
	"errors"
	"time"

	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// DocBlockService 读取派生块表。写入只走 syncExtract，保持与 current_data 同事务。
type DocBlockService struct {
	db *gorm.DB
}

func NewDocBlockService(db *gorm.DB) *DocBlockService {
	return &DocBlockService{db: db}
}

// ListBlocks 返回文档当前未软删的派生块，按 ordinal 排序。
func (s *DocBlockService) ListBlocks(actorID, docID uuid.UUID) ([]model.DocBlock, error) {
	if err := authorizeKnowledgeDocRead(s.db, actorID, docID); err != nil {
		return nil, err
	}
	var rows []model.DocBlock
	if err := s.db.Where("document_id = ? AND deleted_at IS NULL", docID).
		Order("ordinal ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// GetBlock 读取单个未软删块。无权限与不存在一样返回 ErrDocumentNotFound。
func (s *DocBlockService) GetBlock(actorID, docID, blockID uuid.UUID) (*model.DocBlock, error) {
	if err := authorizeKnowledgeDocRead(s.db, actorID, docID); err != nil {
		return nil, err
	}
	var row model.DocBlock
	err := s.db.Where("id = ? AND document_id = ? AND deleted_at IS NULL", blockID, docID).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDocumentNotFound
		}
		return nil, err
	}
	return &row, nil
}

// ListBlockRefs 返回指向该块的引用（反查）。无权限与文档不存在一样返回 ErrDocumentNotFound。
func (s *DocBlockService) ListBlockRefs(actorID, docID, blockID uuid.UUID) ([]model.DocBlockRef, error) {
	if err := authorizeKnowledgeDocRead(s.db, actorID, docID); err != nil {
		return nil, err
	}
	var refs []model.DocBlockRef
	if err := s.db.Where("document_id = ? AND target_block_id = ?", docID, blockID).
		Order("created_at ASC").Find(&refs).Error; err != nil {
		return nil, err
	}
	return refs, nil
}

// BackfillCommentAnchors 按文档 current_data 回填尚未绑定块锚点的评论。
func BackfillCommentAnchors(tx *gorm.DB, docID uuid.UUID) (int, error) {
	var comments []model.DocComment
	if err := tx.Where("doc_id = ? AND block_id IS NULL AND (quote <> '' OR anchor_from >= 0)", docID).
		Find(&comments).Error; err != nil {
		return 0, err
	}
	if len(comments) == 0 {
		return 0, nil
	}
	var doc model.CanvasDocument
	if err := tx.Select("id", "current_data").Where("id = ?", docID).First(&doc).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, err
	}
	blocks := content.ExtractDocBlocks([]byte(doc.CurrentData))
	updated := 0
	for _, row := range comments {
		blockID, offset, ok := content.ResolveCommentAnchor(blocks, row.Quote, row.AnchorFrom)
		if !ok {
			continue
		}
		id, err := uuid.Parse(blockID)
		if err != nil {
			continue
		}
		if err := tx.Model(&model.DocComment{}).Where("id = ?", row.ID).
			Updates(map[string]interface{}{"block_id": id, "block_offset": offset}).Error; err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}

// syncDocBlocks 按 data-block-id upsert，文档中消失的块软删。同一份 payload / 幂等保存重复进入是安全的。
func syncDocBlocks(tx *gorm.DB, docID uuid.UUID, data []byte, now time.Time) error {
	extracted := content.ExtractDocBlocks(data)
	var existing []model.DocBlock
	if err := tx.Where("document_id = ?", docID).Find(&existing).Error; err != nil {
		return err
	}
	byID := make(map[uuid.UUID]model.DocBlock, len(existing))
	for _, row := range existing {
		byID[row.ID] = row
	}
	seen := make(map[uuid.UUID]struct{}, len(extracted))
	for i, b := range extracted {
		id, err := uuid.Parse(b.ID)
		if err != nil {
			continue
		}
		seen[id] = struct{}{}
		var parent *uuid.UUID
		if b.ParentID != "" {
			if p, err := uuid.Parse(b.ParentID); err == nil {
				parent = &p
			}
		}
		attrs := mustJSON(b.Attrs)
		contentJSON := mustJSON(map[string]string{"text": b.Text})
		anchorKey := truncateStr(b.AnchorKey, 128)
		fields := map[string]interface{}{
			"parent_id":    parent,
			"block_type":   truncateStr(b.Type, 64),
			"ordinal":      i,
			"depth":        b.Depth,
			"anchor_key":   anchorKey,
			"content_text": b.Text,
			"content_json": contentJSON,
			"attrs":        attrs,
			"updated_at":   now,
			"deleted_at":   nil,
		}
		if prev, ok := byID[id]; ok {
			if err := tx.Model(&model.DocBlock{}).Where("id = ? AND document_id = ?", id, docID).
				Select("parent_id", "block_type", "ordinal", "depth", "anchor_key", "content_text", "content_json", "attrs", "updated_at", "deleted_at").
				Updates(fields).Error; err != nil {
				return err
			}
			if prev.ContentText != b.Text || string(prev.Attrs) != string(attrs) {
				if err := appendDocBlockRevision(tx, docID, id, prev.RevisionID, b.Text, contentJSON, attrs, now); err != nil {
					return err
				}
			}
			continue
		}
		row := model.DocBlock{
			ID:          id,
			DocumentID:  docID,
			ParentID:    parent,
			BlockType:   truncateStr(b.Type, 64),
			Ordinal:     i,
			Depth:       b.Depth,
			AnchorKey:   anchorKey,
			ContentText: b.Text,
			ContentJSON: contentJSON,
			Attrs:       attrs,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if err := appendDocBlockRevision(tx, docID, id, nil, b.Text, contentJSON, attrs, now); err != nil {
			return err
		}
	}
	for _, row := range existing {
		if _, ok := seen[row.ID]; ok {
			continue
		}
		if row.DeletedAt != nil {
			continue
		}
		if err := tx.Model(&model.DocBlock{}).Where("id = ? AND document_id = ?", row.ID, docID).
			Update("deleted_at", now).Error; err != nil {
			return err
		}
	}
	return nil
}

func mustJSON(v any) datatypes.JSON {
	if v == nil {
		return datatypes.JSON([]byte("null"))
	}
	b, err := json.Marshal(v)
	if err != nil {
		return datatypes.JSON([]byte("{}"))
	}
	return datatypes.JSON(b)
}

func appendDocBlockRevision(tx *gorm.DB, docID, blockID uuid.UUID, revisionID *uuid.UUID, text string, contentJSON, attrs datatypes.JSON, now time.Time) error {
	row := model.DocBlockRevision{
		ID:          uuid.New(),
		DocumentID:  docID,
		BlockID:     blockID,
		RevisionID:  revisionID,
		ContentText: text,
		ContentJSON: contentJSON,
		Attrs:       attrs,
		CreatedAt:   now,
	}
	return tx.Create(&row).Error
}

func syncDocBlockRefs(tx *gorm.DB, docID uuid.UUID, data []byte, now time.Time) error {
	if err := tx.Where("document_id = ?", docID).Delete(&model.DocBlockRef{}).Error; err != nil {
		return err
	}
	extracted := content.ExtractDocBlockRefs(data)
	if len(extracted) == 0 {
		return nil
	}
	var blocks []model.DocBlock
	if err := tx.Where("document_id = ? AND deleted_at IS NULL", docID).Find(&blocks).Error; err != nil {
		return err
	}
	byID := make(map[uuid.UUID]model.DocBlock, len(blocks))
	byAnchor := make(map[string]model.DocBlock, len(blocks))
	for _, row := range blocks {
		byID[row.ID] = row
		if row.AnchorKey != "" {
			byAnchor[row.AnchorKey] = row
		}
	}
	var rows []model.DocBlockRef
	for _, ref := range extracted {
		if ref.RefType != "crossref" {
			continue
		}
		sourceID, err := uuid.Parse(ref.SourceID)
		if err != nil {
			continue
		}
		rec := model.DocBlockRef{
			ID:            uuid.New(),
			DocumentID:    docID,
			SourceBlockID: sourceID,
			RefType:       ref.RefType,
			AnchorKey:     truncateStr(ref.TargetKey, 128),
			TargetLabel:   truncateStr(ref.Label, 255),
			Lost:          ref.Lost,
			CreatedAt:     now,
		}
		if targetID, err := uuid.Parse(ref.TargetKey); err == nil {
			if _, ok := byID[targetID]; ok {
				rec.TargetBlockID = &targetID
				rec.Lost = false
			} else {
				rec.Lost = true
			}
		} else if hit, ok := byAnchor[ref.TargetKey]; ok {
			id := hit.ID
			rec.TargetBlockID = &id
			rec.Lost = false
		} else {
			rec.Lost = true
		}
		rows = append(rows, rec)
	}
	if len(rows) == 0 {
		return nil
	}
	return tx.CreateInBatches(rows, 100).Error
}
