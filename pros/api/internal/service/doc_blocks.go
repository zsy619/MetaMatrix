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
		fields := map[string]interface{}{
			"parent_id":     parent,
			"block_type":    truncateStr(b.Type, 64),
			"ordinal":       i,
			"depth":         b.Depth,
			"anchor_key":    "",
			"content_text":  b.Text,
			"content_json":  contentJSON,
			"attrs":         attrs,
			"updated_at":    now,
			"deleted_at":    nil,
		}
		if _, ok := byID[id]; ok {
			if err := tx.Model(&model.DocBlock{}).Where("id = ? AND document_id = ?", id, docID).
				Select("parent_id", "block_type", "ordinal", "depth", "anchor_key", "content_text", "content_json", "attrs", "updated_at", "deleted_at").
				Updates(fields).Error; err != nil {
				return err
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
			ContentText: b.Text,
			ContentJSON: contentJSON,
			Attrs:       attrs,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := tx.Create(&row).Error; err != nil {
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
