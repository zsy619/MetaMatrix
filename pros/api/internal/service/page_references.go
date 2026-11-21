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

// 结构块模式：表格、白板、流程图、图表、画布嵌入。
// 引用落在这些块里时记到 PageReference.BlockType，图谱里连成「结构」边。
var (
	tableRe      = regexp.MustCompile(`(?s)<table[^>]*>.*?</table>`)
	whiteboardRe = regexp.MustCompile(`data-type="whiteboard"`)
	flowchartRe  = regexp.MustCompile(`data-type="flowchart"`)
	chartRe      = regexp.MustCompile(`data-type="(echartsChart|chart)"`)
	embedRe      = regexp.MustCompile(`data-type="canvasEmbed"`)
)

// blockRange 是一段结构块在 HTML 里的区间。
type blockRange struct {
	start int
	end   int
	kind  string
}

// scanBlockRanges 找出正文里的结构块区间。
func scanBlockRanges(html string) []blockRange {
	out := []blockRange{}
	for _, m := range tableRe.FindAllStringIndex(html, -1) {
		out = append(out, blockRange{start: m[0], end: m[1], kind: "table"})
	}
	for _, item := range []struct {
		re   *regexp.Regexp
		kind string
	}{
		{whiteboardRe, "whiteboard"},
		{flowchartRe, "flowchart"},
		{chartRe, "chart"},
		{embedRe, "embed"},
	} {
		for _, m := range item.re.FindAllStringIndex(html, -1) {
			out = append(out, blockRange{start: m[0], end: m[1] + 32, kind: item.kind})
		}
	}
	return out
}

// blockKindAt 返回某个位置所在结构块的类型；不在结构块里返回空串。
func blockKindAt(ranges []blockRange, pos int) string {
	kind := ""
	for _, r := range ranges {
		if pos < r.start || pos > r.end {
			continue
		}
		// 表格是更大的容器，优先级更高：表格里的引用仍算表格引用。
		if kind == "" || r.kind == "table" {
			kind = r.kind
		}
	}
	return kind
}

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
	ranges := scanBlockRanges(html)
	add := func(targetID, refType, label, blockType string) {
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
			BlockType:   blockType,
			TargetLabel: label,
			CreatedAt:   now,
		})
	}
	for _, m := range mentionNodeRe.FindAllStringSubmatchIndex(html, -1) {
		matched := html[m[0]:m[1]]
		add(html[m[2]:m[3]], "mention", extractLabel(html, matched), blockKindAt(ranges, m[2]))
	}
	for _, m := range canvasEmbedRe.FindAllStringSubmatchIndex(html, -1) {
		add(html[m[2]:m[3]], "embed", "", blockKindAt(ranges, m[2]))
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
