package service

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

// 知识库 4.0：归档区与统计、别名唯一性、模板作用域与另存、分享口令与角色落地、
// 版本标注、跨类型检索与关联推荐、空间打包导出、敏感内容扫描与回收站清理。

// SearchGlobal 跨项目检索：projectID 为 nil 时检索本人全部项目。
func (s *KnowledgeService) SearchGlobal(ownerID uuid.UUID, projectID *uuid.UUID, f KnowledgeSearchFilter) ([]KnowledgeSearchHit, error) {
	return s.searchSpaceExtended(ownerID, projectID, f)
}

// AskGlobal 跨项目问答：语料不再局限于当前项目。
func (s *KnowledgeService) AskGlobal(ownerID uuid.UUID, question string, limit int) ([]KnowledgeAnswer, error) {
	return s.askSpace(ownerID, nil, question, limit)
}

// GetOwnedDocument 取本人拥有的一篇文档（共享相关接口复用）。
func (s *KnowledgeService) GetOwnedDocument(ownerID, docID uuid.UUID) (*model.CanvasDocument, error) {
	return s.docs().GetOwned(ownerID, docID)
}

// ---------------------------------------------------------------- 目录增强

// ListArchived 返回归档区节点（默认目录不显示，这里单独列出）。
func (s *KnowledgeService) ListArchived(ownerID, projectID uuid.UUID) ([]model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var rows []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND archived_at IS NOT NULL AND trashed_at IS NULL", projectID).
		Order("archived_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return s.overlayDocTitles(ownerID, rows)
}

// NodeStats 是目录节点悬浮时展示的统计。
type NodeStats struct {
	Children int64 `json:"children"`
	Words    int   `json:"words"`
	Comments int64 `json:"comments"`
}

// NodeStatsOf 统计单个节点的子节点数、正文字数与评论数。
func (s *KnowledgeService) NodeStatsOf(ownerID, projectID, nodeID uuid.UUID) (*NodeStats, error) {
	if _, err := s.getOwnedNode(ownerID, projectID, nodeID); err != nil {
		return nil, err
	}
	stats := &NodeStats{}
	if err := s.db.Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND parent_id = ? AND trashed_at IS NULL", projectID, nodeID).
		Count(&stats.Children).Error; err != nil {
		return nil, err
	}
	var node model.KnowledgeNode
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}
	if node.DocumentID != nil {
		var doc model.CanvasDocument
		if err := s.db.Select("content_text").Where("id = ? AND owner_user_id = ?", *node.DocumentID, ownerID).
			First(&doc).Error; err == nil {
			stats.Words = len([]rune(strings.TrimSpace(stripHTML(doc.ContentText))))
		}
		if err := s.db.Model(&model.DocComment{}).Where("doc_id = ?", *node.DocumentID).
			Count(&stats.Comments).Error; err != nil {
			return nil, err
		}
	}
	return stats, nil
}

// DeleteWithPolicy 删除节点：promote=true 时子节点提升到父级，否则级联删除。
func (s *KnowledgeService) DeleteWithPolicy(ownerID, projectID, nodeID uuid.UUID, promote bool) error {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return err
	}
	if promote {
		return s.db.Model(&model.KnowledgeNode{}).
			Where("project_id = ? AND parent_id = ? AND trashed_at IS NULL", projectID, nodeID).
			Update("parent_id", node.ParentID).Error
	}
	return s.Delete(ownerID, projectID, nodeID)
}

// AutoFillSummaries 为缺摘要的文档节点回填摘要，返回回填数量。
func (s *KnowledgeService) AutoFillSummaries(ownerID, projectID uuid.UUID) (int, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return 0, err
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL AND summary = '' AND document_id IS NOT NULL",
		projectID).Find(&nodes).Error; err != nil {
		return 0, err
	}
	filled := 0
	for _, node := range nodes {
		summary, err := s.SummarizeDoc(ownerID, *node.DocumentID)
		if err != nil || strings.TrimSpace(summary) == "" {
			continue
		}
		if len([]rune(summary)) > maxSummaryRunes {
			summary = string([]rune(summary)[:maxSummaryRunes])
		}
		if err := s.db.Model(&model.KnowledgeNode{}).Where("id = ?", node.ID).
			Update("summary", summary).Error; err != nil {
			return filled, err
		}
		filled++
	}
	return filled, nil
}

// EnsureAliasUnique 保证别名在项目内唯一（@ 提及按别名命中，需要唯一）。
func (s *KnowledgeService) EnsureAliasUnique(projectID, nodeID uuid.UUID, alias string) error {
	alias = strings.TrimSpace(alias)
	if alias == "" {
		return nil
	}
	var count int64
	err := s.db.Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND alias = ? AND id <> ? AND trashed_at IS NULL", projectID, alias, nodeID).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrValidation
	}
	return nil
}

// ---------------------------------------------------------------- 模板扩展

// UpdateTemplate 改模板的名称、正文、排序与作用域。
func (s *KnowledgeService) UpdateTemplate(ownerID, id uuid.UUID, label, html *string, sortOrder *int, scope *string) (*model.KnowledgeTemplate, error) {
	var tpl model.KnowledgeTemplate
	if err := s.db.Where("id = ? AND owner_user_id = ? AND builtin = false", id, ownerID).First(&tpl).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	fields := map[string]interface{}{"updated_at": time.Now().UTC()}
	if label != nil {
		clean := strings.TrimSpace(*label)
		if clean == "" || len([]rune(clean)) > maxTemplateLabelRunes {
			return nil, ErrValidation
		}
		fields["label"] = clean
	}
	if html != nil {
		if len(*html) > maxTemplateHTMLBytes {
			return nil, ErrValidation
		}
		fields["html"] = *html
	}
	if sortOrder != nil {
		fields["sort_order"] = *sortOrder
	}
	if scope != nil {
		switch *scope {
		case "team", "personal", "project":
			fields["scope"] = *scope
		default:
			return nil, ErrValidation
		}
	}
	if err := s.db.Model(&model.KnowledgeTemplate{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return nil, err
	}
	if err := s.db.Where("id = ?", id).First(&tpl).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

// SaveDocAsTemplate 把一篇文档另存为模板（复用文档当前正文）。
func (s *KnowledgeService) SaveDocAsTemplate(ownerID, docID uuid.UUID, label string) (*model.KnowledgeTemplate, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	label = strings.TrimSpace(label)
	if label == "" {
		label = doc.Title
	}
	if len([]rune(label)) > maxTemplateLabelRunes {
		return nil, ErrValidation
	}
	html := ""
	if len(doc.CurrentData) > 0 {
		var payload struct {
			HTML string `json:"html"`
		}
		if err := json.Unmarshal(doc.CurrentData, &payload); err == nil {
			html = payload.HTML
		}
	}
	if len(html) > maxTemplateHTMLBytes {
		return nil, ErrValidation
	}
	tpl := &model.KnowledgeTemplate{
		ID:          uuid.New(),
		OwnerUserID: &ownerID,
		Key:         "doc-" + uuid.NewString()[:8],
		Label:       label,
		Icon:        "📄",
		Category:    "我的模板",
		Scope:       "personal",
		HTML:        html,
		Builtin:     false,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := s.db.Create(tpl).Error; err != nil {
		return nil, err
	}
	return tpl, nil
}

// ---------------------------------------------------------------- 分享增强

// SharePasswordDigest 是访问口令的摘要。
func SharePasswordDigest(password string) string {
	sum := sha256.Sum256([]byte(password))
	return hex.EncodeToString(sum[:])
}

// CreateShareInput 是创建分享链接的入参。
type CreateShareInput struct {
	Role      string
	ExpiresAt *time.Time
	Password  string
	AllowCopy bool
}

// CreateShareWith 按新参数创建分享链接。
func (s *KnowledgeService) CreateShareWith(ownerID, docID uuid.UUID, in CreateShareInput) (*model.KnowledgeShare, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	role := strings.TrimSpace(in.Role)
	switch role {
	case "", "view":
		role = "view"
	case "comment", "edit":
	default:
		return nil, ErrValidation
	}
	share := &model.KnowledgeShare{
		ID:         uuid.New(),
		DocumentID: &docID,
		Token:      uuid.NewString() + uuid.NewString()[:8],
		Role:       role,
		Kind:       shareKindForDoc(doc),
		CreatedBy:  ownerID,
		ExpiresAt:  in.ExpiresAt,
		AllowCopy:  in.AllowCopy,
		CreatedAt:  time.Now().UTC(),
	}
	if doc.ProjectID != nil {
		share.ProjectID = *doc.ProjectID
	}
	if in.Password != "" {
		share.PasswordHash = SharePasswordDigest(in.Password)
	}
	share.HasPassword = in.Password != ""
	if err := s.db.Create(share).Error; err != nil {
		return nil, err
	}
	// GORM 对带 default 标签的零值字段会跳过插入，这里显式补写一次 false。
	if !in.AllowCopy {
		if err := s.db.Model(&model.KnowledgeShare{}).Where("id = ?", share.ID).
			Update("allow_copy", false).Error; err != nil {
			return nil, err
		}
	}
	return share, nil
}

// ResolveShareWithPassword 按 token + 口令取文档。
//
// 没带口令时只返回「需要口令」标记（不泄露正文）；口令不对返回 ErrValidation。
func (s *KnowledgeService) ResolveShareWithPassword(token, password string, viewer *uuid.UUID) (*SharedDoc, error) {
	doc, err := s.ResolveShare(token)
	if err != nil {
		return nil, err
	}
	var share model.KnowledgeShare
	if err := s.db.Where("token = ?", token).First(&share).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	if !shareAllowed(&share, viewer) {
		return nil, ErrShareForbidden
	}
	if doc.RequiresPassword {
		if password == "" {
			return doc, nil
		}
		if share.PasswordHash != SharePasswordDigest(password) {
			return nil, ErrValidation
		}
		// 口令正确：按分享类型取正文（文档 HTML / 画布模板 / 导图表格数据）。
		return s.resolveShareContent(&share, true)
	}
	return doc, nil
}

// AddShareComment 往分享文档写评论（分享页可评论角色）。
func (s *KnowledgeService) AddShareComment(token, password, content string, viewer *uuid.UUID) (*model.DocComment, error) {
	share, doc, err := s.shareWithAccess(token, password, viewer)
	if err != nil {
		return nil, err
	}
	if share.Role != "comment" && share.Role != "edit" {
		return nil, ErrValidation
	}
	// 导图与表格没有文档正文，评论无处落地：这类分享只读。
	if doc == nil {
		return nil, ErrValidation
	}
	content = strings.TrimSpace(content)
	if content == "" || len([]rune(content)) > maxCommentRunes {
		return nil, ErrValidation
	}
	comment := &model.DocComment{
		ID:           uuid.New(),
		DocID:        doc.ID,
		AuthorUserID: share.CreatedBy,
		Content:      content,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := s.db.Create(comment).Error; err != nil {
		return nil, err
	}
	return comment, nil
}

// UpdateShareContent 通过分享链接改文档正文（分享页可编辑角色）。
func (s *KnowledgeService) UpdateShareContent(token, password, html string, viewer *uuid.UUID) error {
	share, doc, err := s.shareWithAccess(token, password, viewer)
	if err != nil {
		return err
	}
	if share.Role != "edit" {
		return ErrValidation
	}
	// 画布正文是模板 JSON，导图表格是结构化数据：都不能按富文本回写。
	if shareKind(share) != "doc" || doc == nil {
		return ErrValidation
	}
	if len(html) > maxNodeDataBytes {
		return ErrValidation
	}
	payload, err := json.Marshal(map[string]interface{}{"type": "doc", "html": html})
	if err != nil {
		return err
	}
	_, err = s.docs().Update(share.CreatedBy, doc.ID, UpdateDocumentInput{CurrentData: payload})
	return err
}

// shareWithAccess 解析分享并校验口令与有效期。
func (s *KnowledgeService) shareWithAccess(token, password string, viewer *uuid.UUID) (*model.KnowledgeShare, *model.CanvasDocument, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, ErrDocumentNotFound
	}
	var share model.KnowledgeShare
	if err := s.db.Where("token = ?", token).First(&share).Error; err != nil {
		return nil, nil, ErrDocumentNotFound
	}
	if share.ExpiresAt != nil && share.ExpiresAt.Before(time.Now().UTC()) {
		return nil, nil, ErrDocumentNotFound
	}
	if share.PasswordHash != "" && share.PasswordHash != SharePasswordDigest(password) {
		return nil, nil, ErrValidation
	}
	if !shareAllowed(&share, viewer) {
		return nil, nil, ErrShareForbidden
	}
	// 导图 / 表格的分享没有文档正文，doc 返回 nil，调用方按只读处理。
	if share.DocumentID == nil {
		return &share, nil, nil
	}
	var doc model.CanvasDocument
	if err := s.db.Where("id = ?", *share.DocumentID).First(&doc).Error; err != nil {
		return nil, nil, ErrDocumentNotFound
	}
	return &share, &doc, nil
}

// ---------------------------------------------------------------- 版本标注

// LabelVersion 给历史版本加备注（如「发布版」）。
func (s *KnowledgeService) LabelVersion(ownerID, docID, versionID uuid.UUID, label string) (*model.KnowledgeDocVersion, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	label = strings.TrimSpace(label)
	if len([]rune(label)) > 64 {
		return nil, ErrValidation
	}
	res := s.db.Model(&model.KnowledgeDocVersion{}).
		Where("id = ? AND document_id = ?", versionID, docID).Update("label", label)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrDocumentNotFound
	}
	var row model.KnowledgeDocVersion
	if err := s.db.Where("id = ?", versionID).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// VersionAuthorNames 返回版本作者显示名，键为用户 ID。
func (s *KnowledgeService) VersionAuthorNames(docID uuid.UUID) (map[string]string, error) {
	var rows []model.KnowledgeDocVersion
	if err := s.db.Select("author_user_id").Where("document_id = ?", docID).Find(&rows).Error; err != nil {
		return nil, err
	}
	ids := map[uuid.UUID]bool{}
	for _, row := range rows {
		ids[row.AuthorUserID] = true
	}
	out := map[string]string{}
	for id := range ids {
		out[id.String()] = s.userName(&id)
	}
	return out, nil
}

// ---------------------------------------------------------------- 检索增强

// SearchSpace 扩展：支持跨类型（未挂节点的文档）、评论命中与排序。
func (s *KnowledgeService) searchSpaceExtended(ownerID uuid.UUID, projectID *uuid.UUID, f KnowledgeSearchFilter) ([]KnowledgeSearchHit, error) {
	if projectID != nil {
		if err := s.assertSpaceAccess(ownerID, *projectID, SpaceRoleViewer); err != nil {
			return nil, err
		}
	}
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 30
	}
	query := strings.TrimSpace(f.Query)
	like := "%" + strings.ToLower(query) + "%"

	q := s.db.Where("trashed_at IS NULL")
	if projectID != nil {
		q = q.Where("project_id = ?", *projectID)
	} else {
		q = q.Where("project_id IN (SELECT id FROM core_projects WHERE owner_user_id = ?)", ownerID)
	}
	if f.NodeType != "" {
		q = q.Where("node_type = ?", f.NodeType)
	}
	if f.AuthorID != "" {
		author, err := uuid.Parse(f.AuthorID)
		if err != nil {
			return nil, ErrValidation
		}
		q = q.Where("created_by = ?", author)
	}
	if f.From != nil {
		q = q.Where("updated_at >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("updated_at <= ?", *f.To)
	}
	if query != "" {
		// 拼音列由前端用 pinyin-pro 生成，中文场景可直接按拼音或首字母命中。
		q = q.Where("LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(alias) LIKE ? OR LOWER(pinyin) LIKE ?"+
			" OR document_id IN (SELECT id FROM kb_documents WHERE LOWER(content_text) LIKE ?)"+
			" OR document_id IN (SELECT doc_id FROM kb_comments WHERE LOWER(content) LIKE ?)",
			like, like, like, like, like, like)
	}
	var nodes []model.KnowledgeNode
	if err := q.Order("updated_at DESC").Limit(f.Limit * 2).Find(&nodes).Error; err != nil {
		return nil, err
	}
	hits := make([]KnowledgeSearchHit, 0, len(nodes))
	for _, n := range nodes {
		if len(hits) >= f.Limit {
			break
		}
		hit := KnowledgeSearchHit{
			NodeID:    n.ID.String(),
			Title:     n.Title,
			Summary:   n.Summary,
			NodeType:  n.NodeType,
			Author:    s.userName(n.CreatedBy),
			AuthorID:  authorID(n.CreatedBy),
			Tags:      n.Alias,
			UpdatedAt: n.UpdatedAt,
		}
		if n.DocumentID != nil {
			hit.DocumentID = n.DocumentID.String()
			hit.Snippet = s.snippet(ownerID, *n.DocumentID, query)
			hit.Words = s.docWordCount(ownerID, *n.DocumentID)
		}
		hits = append(hits, hit)
	}
	// 未挂进目录的文档也要能被搜到（跨类型检索）。
	if query != "" {
		docQ := s.db.Where("owner_user_id = ? AND LOWER(content_text) LIKE ?", ownerID, like)
		if projectID != nil {
			docQ = docQ.Where("project_id = ?", *projectID)
		} else {
			docQ = docQ.Where("project_id IN (SELECT id FROM core_projects WHERE owner_user_id = ?)", ownerID)
		}
		var docs []model.CanvasDocument
		if err := docQ.Order("updated_at DESC").Limit(f.Limit).Find(&docs).Error; err != nil {
			return nil, err
		}
		known := map[string]bool{}
		for _, hit := range hits {
			known[hit.DocumentID] = true
		}
		for _, doc := range docs {
			if len(hits) >= f.Limit {
				break
			}
			if known[doc.ID.String()] {
				continue
			}
			hits = append(hits, KnowledgeSearchHit{
				DocumentID: doc.ID.String(),
				Title:      doc.Title,
				NodeType:   "loose-" + doc.CanvasType,
				Author:     s.userName(&doc.OwnerUserID),
				AuthorID:   doc.OwnerUserID.String(),
				UpdatedAt:  doc.UpdatedAt,
				Snippet:    s.snippet(ownerID, doc.ID, query),
				Words:      len([]rune(strings.TrimSpace(stripHTML(doc.ContentText)))),
			})
		}
	}
	switch f.Sort {
	case "word":
		sort.SliceStable(hits, func(i, j int) bool { return hits[i].Words > hits[j].Words })
	case "title":
		sort.SliceStable(hits, func(i, j int) bool { return hits[i].Title < hits[j].Title })
	}
	return hits, nil
}

// docWordCount 统计文档正文字数。
func (s *KnowledgeService) docWordCount(ownerID, docID uuid.UUID) int {
	var doc model.CanvasDocument
	if err := s.db.Select("content_text").Where("id = ? AND owner_user_id = ?", docID, ownerID).
		First(&doc).Error; err != nil {
		return 0
	}
	return len([]rune(strings.TrimSpace(stripHTML(doc.ContentText))))
}

// RelatedDocsOf 给出与某节点相关的文档：同作者、同引用、同标签。
func (s *KnowledgeService) RelatedDocsOf(ownerID, projectID, nodeID uuid.UUID, limit int) ([]KnowledgeSearchHit, error) {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 20 {
		limit = 6
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND id <> ? AND trashed_at IS NULL", projectID, nodeID).
		Order("updated_at DESC").Limit(limit * 4).Find(&nodes).Error; err != nil {
		return nil, err
	}
	out := []KnowledgeSearchHit{}
	for _, other := range nodes {
		score := 0
		if node.CreatedBy != nil && other.CreatedBy != nil && *node.CreatedBy == *other.CreatedBy {
			score += 2
		}
		if node.Alias != "" && node.Alias == other.Alias {
			score += 2
		}
		if node.DocumentID != nil && other.DocumentID != nil {
			var refs int64
			s.db.Model(&model.PageReference{}).
				Where("source_doc_id = ? AND target_doc_id = ?", *node.DocumentID, *other.DocumentID).
				Count(&refs)
			score += int(refs) * 3
		}
		if score == 0 {
			continue
		}
		hit := KnowledgeSearchHit{
			NodeID:    other.ID.String(),
			Title:     other.Title,
			Summary:   other.Summary,
			NodeType:  other.NodeType,
			Author:    s.userName(other.CreatedBy),
			AuthorID:  authorID(other.CreatedBy),
			UpdatedAt: other.UpdatedAt,
		}
		if other.DocumentID != nil {
			hit.DocumentID = other.DocumentID.String()
		}
		out = append(out, hit)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

// SimilarDocs 找目录树里的疑似重复文档（标题相同或高度相似）。
func (s *KnowledgeService) SimilarDocs(ownerID, projectID uuid.UUID) ([][]KnowledgeSearchHit, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL AND document_id IS NOT NULL", projectID).
		Find(&nodes).Error; err != nil {
		return nil, err
	}
	groups := map[string][]KnowledgeSearchHit{}
	for _, n := range nodes {
		key := strings.ToLower(strings.TrimSpace(n.Title))
		if key == "" {
			continue
		}
		groups[key] = append(groups[key], KnowledgeSearchHit{
			NodeID:     n.ID.String(),
			DocumentID: authorID(n.DocumentID),
			Title:      n.Title,
			Summary:    n.Summary,
			NodeType:   n.NodeType,
			UpdatedAt:  n.UpdatedAt,
		})
	}
	out := [][]KnowledgeSearchHit{}
	for _, items := range groups {
		if len(items) > 1 {
			out = append(out, items)
		}
	}
	sort.Slice(out, func(i, j int) bool { return len(out[i]) > len(out[j]) })
	return out, nil
}

// AskSpaceWithContext 支持多轮追问：把历史问题一起纳入检索词。
func (s *KnowledgeService) AskSpaceWithContext(ownerID uuid.UUID, projectID *uuid.UUID, question string, context []string, limit int) ([]KnowledgeAnswer, error) {
	merged := strings.TrimSpace(question)
	for _, prev := range context {
		merged += " " + prev
	}
	return s.askSpace(ownerID, projectID, merged, limit)
}

// ---------------------------------------------------------------- 质量体检

// QualityItem 是一条体检结论。
type QualityItem struct {
	DocID   string `json:"docId"`
	Title   string `json:"title"`
	Kind    string `json:"kind"`
	Detail  string `json:"detail"`
	Suggest string `json:"suggest"`
}

// QualityAudit 文档质量体检：空摘要、重复表述、空段落、超长文档。
func (s *KnowledgeService) QualityAudit(ownerID, projectID uuid.UUID, limit int) ([]QualityItem, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL AND document_id IS NOT NULL", projectID).
		Limit(limit).Find(&nodes).Error; err != nil {
		return nil, err
	}
	items := []QualityItem{}
	for _, node := range nodes {
		doc, err := s.docs().GetOwned(ownerID, *node.DocumentID)
		if err != nil {
			continue
		}
		text := strings.TrimSpace(stripHTML(doc.ContentText))
		if strings.TrimSpace(node.Summary) == "" {
			items = append(items, QualityItem{
				DocID: doc.ID.String(), Title: doc.Title, Kind: "缺少摘要",
				Detail:  "目录卡片与搜索结果显示不出这篇讲了什么",
				Suggest: "一键生成摘要",
			})
		}
		if text == "" {
			items = append(items, QualityItem{
				DocID: doc.ID.String(), Title: doc.Title, Kind: "空文档",
				Detail:  "正文没有任何内容",
				Suggest: "补充正文或归档",
			})
			continue
		}
		for _, para := range splitSentences(text) {
			if len([]rune(para)) < 2 {
				items = append(items, QualityItem{
					DocID: doc.ID.String(), Title: doc.Title, Kind: "空段落",
					Detail:  "存在几乎为空的段落",
					Suggest: "删除空段落",
				})
				break
			}
		}
		if len([]rune(text)) > 8000 {
			items = append(items, QualityItem{
				DocID: doc.ID.String(), Title: doc.Title, Kind: "篇幅过长",
				Detail:  fmt.Sprintf("正文约 %d 字，建议拆分", len([]rune(text))),
				Suggest: "拆成多篇并用目录组织",
			})
		}
	}
	return items, nil
}

// ---------------------------------------------------------------- 空间导出

// ExportSpaceZip 把整个知识空间打包成 zip：目录树 + 每篇文档的 Markdown。
func (s *KnowledgeService) ExportSpaceZip(ownerID, projectID uuid.UUID) ([]byte, string, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, "", err
	}
	nodes, err := s.Tree(ownerID, projectID)
	if err != nil {
		return nil, "", err
	}
	tree, err := s.ExportTreeMarkdown(ownerID, projectID)
	if err != nil {
		return nil, "", err
	}
	type entry struct {
		name    string
		content string
	}
	entries := []entry{{name: "knowledge-tree.md", content: tree}}
	for _, node := range nodes {
		if node.DocumentID == nil {
			continue
		}
		doc, err := s.docs().GetOwned(ownerID, *node.DocumentID)
		if err != nil {
			continue
		}
		html := ""
		if len(doc.CurrentData) > 0 {
			var payload struct {
				HTML string `json:"html"`
			}
			if err := json.Unmarshal(doc.CurrentData, &payload); err == nil {
				html = payload.HTML
			}
		}
		entries = append(entries, entry{
			name:    "docs/" + node.ID.String() + ".md",
			content: "# " + node.Title + "\n\n" + htmlToMarkdown(html),
		})
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, item := range entries {
		w, err := zw.Create(item.name)
		if err != nil {
			return nil, "", err
		}
		if _, err := w.Write([]byte(item.content)); err != nil {
			return nil, "", err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), "knowledge-space.zip", nil
}

// ---------------------------------------------------------------- 敏感内容扫描

var sensitivePatterns = []struct {
	name string
	re   *regexp.Regexp
}{
	{name: "身份证号", re: regexp.MustCompile(`\d{17}[\dXx]`)},
	{name: "手机号", re: regexp.MustCompile(`1[3-9]\d{9}`)},
	{name: "疑似密码", re: regexp.MustCompile(`(?i)(password|passwd|密码)\s*[:：=]\s*\S{4,}`)},
}

// SensitiveHit 是一处敏感内容命中。
type SensitiveHit struct {
	Kind  string `json:"kind"`
	Match string `json:"match"`
}

// ScanSensitive 扫描文本里的敏感信息（导入与发布前的提示）。
func ScanSensitive(text string) []SensitiveHit {
	hits := []SensitiveHit{}
	for _, pattern := range sensitivePatterns {
		if match := pattern.re.FindString(text); match != "" {
			hits = append(hits, SensitiveHit{Kind: pattern.name, Match: maskSensitive(match)})
		}
	}
	return hits
}

// maskSensitive 对命中的敏感串做打码。
func maskSensitive(text string) string {
	runes := []rune(text)
	if len(runes) <= 4 {
		return strings.Repeat("*", len(runes))
	}
	return string(runes[:2]) + strings.Repeat("*", len(runes)-4) + string(runes[len(runes)-2:])
}

// ---------------------------------------------------------------- 回收站清理

// PurgeAllExpiredTrash 清理所有用户超期的回收站节点（定时任务用）。
func (s *KnowledgeService) PurgeAllExpiredTrash(keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	var users []model.User
	if err := s.db.Select("id").Find(&users).Error; err != nil {
		return 0, err
	}
	total := 0
	for _, user := range users {
		purged, err := s.PurgeExpiredTrash(user.ID, keepDays)
		if err != nil {
			continue
		}
		total += purged
	}
	return total, nil
}

// PurgeExpiredTrash 清理超过保留期的回收站节点。
func (s *KnowledgeService) PurgeExpiredTrash(ownerID uuid.UUID, keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -keepDays)
	var projects []model.Project
	if err := s.db.Select("id").Where("owner_user_id = ?", ownerID).Find(&projects).Error; err != nil {
		return 0, err
	}
	if len(projects) == 0 {
		return 0, nil
	}
	projectIDs := make([]uuid.UUID, 0, len(projects))
	for _, p := range projects {
		projectIDs = append(projectIDs, p.ID)
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id IN ? AND trashed_at IS NOT NULL AND trashed_at < ?", projectIDs, cutoff).
		Find(&nodes).Error; err != nil {
		return 0, err
	}
	purged := 0
	for _, node := range nodes {
		if err := s.PurgeNode(ownerID, node.ProjectID, node.ID); err != nil {
			continue
		}
		purged++
	}
	return purged, nil
}
