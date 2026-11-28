package db

import (
	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ensureCommentBlockAnchors 在 AutoMigrate 补上 block_id / block_offset 后，
// 用正文派生块回填旧评论。对不上的行保持空块锚点，继续走 Quote / Anchor 降级。
func ensureCommentBlockAnchors(gdb *gorm.DB) error {
	return BackfillCommentBlockAnchors(gdb)
}

// BackfillCommentBlockAnchors 回填所有尚未绑定块锚点的评论。
func BackfillCommentBlockAnchors(gdb *gorm.DB) error {
	var comments []model.DocComment
	if err := gdb.Where("block_id IS NULL AND (quote <> '' OR anchor_from >= 0)").
		Find(&comments).Error; err != nil {
		return err
	}
	byDoc := map[uuid.UUID][]model.DocComment{}
	for _, row := range comments {
		byDoc[row.DocID] = append(byDoc[row.DocID], row)
	}
	for docID, rows := range byDoc {
		if _, err := BackfillCommentAnchorsForDoc(gdb, docID, rows); err != nil {
			return err
		}
	}
	return nil
}

// BackfillCommentAnchorsForDoc 按一篇文档的 current_data 回填评论双锚点。
func BackfillCommentAnchorsForDoc(gdb *gorm.DB, docID uuid.UUID, comments []model.DocComment) (int, error) {
	if comments == nil {
		if err := gdb.Where("doc_id = ? AND block_id IS NULL AND (quote <> '' OR anchor_from >= 0)", docID).
			Find(&comments).Error; err != nil {
			return 0, err
		}
	}
	if len(comments) == 0 {
		return 0, nil
	}
	var doc model.CanvasDocument
	if err := gdb.Select("id", "current_data").Where("id = ?", docID).First(&doc).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, nil
		}
		return 0, err
	}
	blocks := content.ExtractDocBlocks([]byte(doc.CurrentData))
	updated := 0
	for _, row := range comments {
		if row.BlockID != nil {
			continue
		}
		blockID, offset, ok := content.ResolveCommentAnchor(blocks, row.Quote, row.AnchorFrom)
		if !ok {
			continue
		}
		id, err := uuid.Parse(blockID)
		if err != nil {
			continue
		}
		if err := gdb.Model(&model.DocComment{}).Where("id = ?", row.ID).
			Updates(map[string]interface{}{"block_id": id, "block_offset": offset}).Error; err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}
