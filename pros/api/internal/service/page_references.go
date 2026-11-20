package service

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// mentionNodeRe 匹配 TipTap mention 节点序列化后的 HTML：
// <span data-type="mention" data-id="..." ...>。
// doc mention 的 id 是 documentId（uuid）。
var mentionNodeRe = regexp.MustCompile(`data-type="mention"[^>]*data-id="([0-9a-fA-F-]{36})"`)

// canvasEmbedRe 匹配画布嵌入块：data-type="canvasEmbed" data-doc-id="..."。
var canvasEmbedRe = regexp.MustCompile(`data-type="canvasEmbed"[^>]*data-doc-id="([0-9a-fA-F-]{36})"`)

// labelRe 抽 mention/embed 节点的可见文本作为 targetLabel。
var labelRe = regexp.MustCompile(`>([^<]*)<`)

// RebuildPageReferences 全量重建一篇文档的出向引用索引。
// 在 syncExtract 同事务内调用：先删旧记录，再扫描 current_data 里的 mention/embed。
// data 是 canvas_documents.current_data（JSON），doc 类型的 html 字段里含 mention/embed 节点。
func RebuildPageReferences(tx *gorm.DB, sourceDocID uuid.UUID, data datatypes.JSON, now time.Time) error {
	if err := tx.Where("source_doc_id = ?", sourceDocID).
		Delete(&model.PageReference{}).Error; err != nil {
		return err
	}
	refs := scanPageReferences(data, sourceDocID, now)
	if len(refs) == 0 {
		return nil
	}
	return tx.CreateInBatches(refs, 100).Error
}

func scanPageReferences(data datatypes.JSON, sourceDocID uuid.UUID, now time.Time) []model.PageReference {
	html := extractDocHTML(data)
	if html == "" {
		return nil
	}
	var out []model.PageReference
	seen := map[string]bool{}
	add := func(targetID, refType, label string) {
		if targetID == "" || targetID == sourceDocID.String() {
			return
		}
		uid, err := uuid.Parse(targetID)
		if err != nil {
			return
		}
		key := refType + ":" + targetID
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, model.PageReference{
			ID:          uuid.New(),
			SourceDocID: sourceDocID,
			TargetDocID: uid,
			RefType:     refType,
			TargetLabel: label,
			CreatedAt:   now,
		})
	}
	for _, m := range mentionNodeRe.FindAllStringSubmatch(html, -1) {
		add(m[1], "mention", extractLabel(html, m[0]))
	}
	for _, m := range canvasEmbedRe.FindAllStringSubmatch(html, -1) {
		add(m[1], "embed", "")
	}
	return out
}

func extractDocHTML(data datatypes.JSON) string {
	if len(data) == 0 {
		return ""
	}
	var raw struct {
		Type string `json:"type"`
		HTML string `json:"html"`
	}
	if err := json.Unmarshal([]byte(data), &raw); err != nil {
		return ""
	}
	if raw.Type != "doc" {
		return ""
	}
	return raw.HTML
}

func extractLabel(html, nodeMatch string) string {
	i := strings.Index(html, nodeMatch)
	if i < 0 {
		return ""
	}
	tail := html[i+len(nodeMatch):]
	if m := labelRe.FindStringSubmatch(tail); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// Backrefs 返回引用了 targetDocID 的文档 id 列表。
func (s *KnowledgeService) Backrefs(ownerID, targetDocID uuid.UUID) ([]model.PageReference, error) {
	var refs []model.PageReference
	err := s.db.Joins("JOIN canvas_documents ON canvas_documents.id = page_references.source_doc_id").
		Where("page_references.target_doc_id = ? AND canvas_documents.owner_user_id = ?", targetDocID, ownerID).
		Order("page_references.created_at DESC").
		Find(&refs).Error
	if err != nil {
		return nil, err
	}
	return refs, nil
}
