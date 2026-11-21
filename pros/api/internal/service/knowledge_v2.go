package service

import (
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 知识库 2.0：属性、模板、评论、回收站、收藏、空间看板、事件与导出。
//
// 这些能力都挂在既有 canvas_documents / knowledge_nodes 之上：
// 不新增内容表，只新增「围绕目录与文档的元数据」，与飞书知识库的
// 「目录 + 页面属性 + 评论 + 模板 + 回收站」一一对应。

const (
	maxTemplateLabelRunes = 64
	maxTemplateHTMLBytes  = 64 * 1024
	maxCommentRunes       = 2000
	maxSummaryRunes       = 255
)

// KnowledgeTemplateInput 是新建模板的入参。
type KnowledgeTemplateInput struct {
	Key      string
	Label    string
	Icon     string
	Category string
	HTML     string
	// Scope 是模板作用域：personal（仅自己）| team（团队共享）| project（仅本项目）。
	Scope string
}

// NodeMetaInput 是节点元数据的增量更新。
// 指针为 nil 表示「不改」，避免把 false 误当成「置否」。
type NodeMetaInput struct {
	Alias    *string
	Summary  *string
	Favorite *bool
	Locked   *bool
	Archived *bool
	Trashed  *bool
}

// KnowledgeSummary 是空间看板数据。
type KnowledgeSummary struct {
	NodeCount     int64                  `json:"nodeCount"`
	DocCount      int64                  `json:"docCount"`
	FolderCount   int64                  `json:"folderCount"`
	CommentCount  int64                  `json:"commentCount"`
	OpenComments  int64                  `json:"openComments"`
	TagCount      int                    `json:"tagCount"`
	RecentUpdates []model.KnowledgeNode  `json:"recentUpdates"`
	Contributors  []KnowledgeContributor `json:"contributors"`
	Health        []KnowledgeHealthItem  `json:"health"`
}

// KnowledgeContributor 是贡献人统计。
type KnowledgeContributor struct {
	OwnerUserID uuid.UUID `json:"ownerUserId"`
	Documents   int64     `json:"documents"`
}

// KnowledgeHealthItem 是一条知识健康度提示。
type KnowledgeHealthItem struct {
	Kind    string `json:"kind"` // no_title | empty_doc | stale | no_summary
	DocID   string `json:"docId"`
	Title   string `json:"title"`
	Message string `json:"message"`
}

// ---------------------------------------------------------------- 模板

// builtinTemplates 是内置模板种子：飞书模板中心的最小可用集。
var builtinTemplates = []model.KnowledgeTemplate{
	{Key: "blank", Label: "空白文档", Icon: "📄", Category: "通用", HTML: ""},
	{Key: "meeting", Label: "会议纪要", Icon: "📝", Category: "协作",
		HTML: `<h1>会议纪要</h1><p><strong>日期：</strong></p><p><strong>参会人：</strong></p><h2>议题</h2><ul><li></li></ul><h2>决议</h2><ul><li></li></ul><h2>待办</h2><ul><li></li></ul>`},
	{Key: "requirement", Label: "需求文档", Icon: "📋", Category: "产品",
		HTML: `<h1>需求文档</h1><h2>背景</h2><p></p><h2>目标</h2><ul><li></li></ul><h2>功能列表</h2><ul><li></li></ul><h2>非功能需求</h2><ul><li></li></ul><h2>里程碑</h2><ul><li></li></ul>`},
	{Key: "weekly", Label: "周报", Icon: "📅", Category: "协作",
		HTML: `<h1>周报</h1><p><strong>周期：</strong></p><h2>本周完成</h2><ul><li></li></ul><h2>下周计划</h2><ul><li></li></ul><h2>风险与求助</h2><ul><li></li></ul>`},
	{Key: "decision", Label: "决策记录", Icon: "⚖️", Category: "协作",
		HTML: `<h1>决策记录</h1><p><strong>日期：</strong></p><h2>背景</h2><p></p><h2>候选方案</h2><ul><li></li></ul><h2>结论</h2><p></p><h2>影响</h2><ul><li></li></ul>`},
	{Key: "sop", Label: "标准流程 SOP", Icon: "🧭", Category: "流程",
		HTML: `<h1>标准流程</h1><h2>适用场景</h2><p></p><h2>步骤</h2><ol><li></li></ol><h2>责任人</h2><p></p><h2>异常处理</h2><p></p>`},
	{Key: "retro", Label: "复盘", Icon: "🔁", Category: "协作",
		HTML: `<h1>复盘</h1><h2>目标</h2><p></p><h2>实际结果</h2><p></p><h2>做得好的</h2><ul><li></li></ul><h2>待改进</h2><ul><li></li></ul><h2>行动项</h2><ul><li></li></ul>`},
	{Key: "faq", Label: "FAQ", Icon: "❓", Category: "通用",
		HTML: `<h1>常见问题</h1><h2>Q1</h2><p></p><h2>A1</h2><p></p><h2>Q2</h2><p></p><h2>A2</h2><p></p>`},
}

// SeedBuiltinTemplates 幂等写入内置模板。
// 按 key 去重：重复启动不会产生第二份同名模板。
func SeedBuiltinTemplates(db *gorm.DB) error {
	now := time.Now().UTC()
	for i := range builtinTemplates {
		tpl := builtinTemplates[i]
		var count int64
		if err := db.Model(&model.KnowledgeTemplate{}).
			Where("key = ? AND builtin = true", tpl.Key).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		tpl.ID = uuid.New()
		tpl.Builtin = true
		tpl.SortOrder = i
		tpl.CreatedAt = now
		tpl.UpdatedAt = now
		if err := db.Create(&tpl).Error; err != nil {
			return err
		}
	}
	return nil
}

// ListTemplates 返回内置模板 + 当前用户的个人模板 + 项目模板。
func (s *KnowledgeService) ListTemplates(ownerID, projectID uuid.UUID) ([]model.KnowledgeTemplate, error) {
	var rows []model.KnowledgeTemplate
	err := s.db.Where("builtin = true OR owner_user_id = ? OR scope = 'team'", ownerID).
		Where("project_id IS NULL OR project_id = ?", projectID).
		Order("builtin DESC").Order("sort_order ASC").Order("created_at ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// CreateTemplate 存一份个人模板（可跨项目复用）。
func (s *KnowledgeService) CreateTemplate(ownerID, projectID uuid.UUID, in KnowledgeTemplateInput) (*model.KnowledgeTemplate, error) {
	label := strings.TrimSpace(in.Label)
	if label == "" || utf8.RuneCountInString(label) > maxTemplateLabelRunes {
		return nil, ErrValidation
	}
	if len(in.HTML) > maxTemplateHTMLBytes {
		return nil, ErrValidation
	}
	key := strings.TrimSpace(in.Key)
	if key == "" {
		key = "user-" + uuid.NewString()[:8]
	}
	icon, err := cleanNodeIcon(in.Icon, "doc")
	if err != nil {
		return nil, err
	}
	category := strings.TrimSpace(in.Category)
	if category == "" {
		category = "我的模板"
	}
	scope := strings.TrimSpace(in.Scope)
	switch scope {
	case "", "personal", "team", "project":
	default:
		return nil, ErrValidation
	}
	if scope == "" {
		scope = "personal"
	}
	now := time.Now().UTC()
	tpl := &model.KnowledgeTemplate{
		ID:          uuid.New(),
		OwnerUserID: &ownerID,
		Key:         key,
		Label:       label,
		Icon:        icon,
		Category:    category,
		Scope:       scope,
		HTML:        in.HTML,
		SortOrder:   100,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if scope == "project" {
		tpl.ProjectID = &projectID
	}
	if err := s.db.Create(tpl).Error; err != nil {
		return nil, err
	}
	return tpl, nil
}

// DeleteTemplate 只允许删自己的模板。
func (s *KnowledgeService) DeleteTemplate(ownerID, id uuid.UUID) error {
	return s.db.Where("id = ? AND owner_user_id = ? AND builtin = false", id, ownerID).
		Delete(&model.KnowledgeTemplate{}).Error
}

// ---------------------------------------------------------------- 节点元数据 / 回收站

// UpdateNodeMeta 更新节点的别名、摘要、收藏、锁定、归档与回收站状态。
func (s *KnowledgeService) UpdateNodeMeta(ownerID, projectID, nodeID uuid.UUID, in NodeMetaInput) (*model.KnowledgeNode, error) {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	fields := map[string]interface{}{}
	if in.Alias != nil {
		alias := strings.TrimSpace(*in.Alias)
		if utf8.RuneCountInString(alias) > 64 {
			return nil, ErrValidation
		}
		if err := s.EnsureAliasUnique(projectID, nodeID, alias); err != nil {
			return nil, err
		}
		fields["alias"] = alias
	}
	if in.Summary != nil {
		summary := strings.TrimSpace(*in.Summary)
		if utf8.RuneCountInString(summary) > maxSummaryRunes {
			return nil, ErrValidation
		}
		fields["summary"] = summary
	}
	if in.Favorite != nil {
		fields["favorite"] = *in.Favorite
	}
	if in.Locked != nil {
		fields["locked"] = *in.Locked
	}
	if in.Archived != nil {
		if *in.Archived {
			now := time.Now().UTC()
			fields["archived_at"] = now
		} else {
			fields["archived_at"] = nil
		}
	}
	if in.Trashed != nil {
		if *in.Trashed {
			now := time.Now().UTC()
			fields["trashed_at"] = now
		} else {
			fields["trashed_at"] = nil
		}
	}
	if len(fields) == 0 {
		return node, nil
	}
	fields["updated_at"] = time.Now().UTC()
	if err := s.db.Model(&model.KnowledgeNode{}).Where("id = ?", nodeID).Updates(fields).Error; err != nil {
		return nil, err
	}
	_ = s.AppendEvent(s.db, projectID, "node.meta", &nodeID, node.DocumentID, ownerID, "")
	return s.getOwnedNode(ownerID, projectID, nodeID)
}

// ListTrash 返回回收站里的节点（含子孙）。
func (s *KnowledgeService) ListTrash(ownerID, projectID uuid.UUID) ([]model.KnowledgeNode, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	var rows []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NOT NULL", projectID).
		Order("trashed_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return s.overlayDocTitles(ownerID, rows)
}

// PurgeNode 彻底删除回收站里的节点（连带子孙）。
func (s *KnowledgeService) PurgeNode(ownerID, projectID, nodeID uuid.UUID) error {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return err
	}
	if node.TrashedAt == nil {
		return ErrValidation
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		ids, err := s.collectDescendants(tx, projectID, nodeID)
		if err != nil {
			return err
		}
		return tx.Unscoped().Where("id IN ?", ids).Delete(&model.KnowledgeNode{}).Error
	})
}

// CopyNode 复制一个节点（文档节点连正文一起复制），落到目标父级下。
func (s *KnowledgeService) CopyNode(ownerID, projectID, nodeID uuid.UUID, newParentID *uuid.UUID) (*model.KnowledgeNode, error) {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	if newParentID != nil {
		if err := s.assertParentCycle(ownerID, projectID, newParentID, &nodeID); err != nil {
			return nil, err
		}
	}
	var newDocID *uuid.UUID
	if node.DocumentID != nil {
		copied, err := s.copyDocument(ownerID, *node.DocumentID, node.Title+"（副本）")
		if err != nil {
			return nil, err
		}
		newDocID = &copied
	}
	input := KnowledgeNodeInput{
		ParentID:   newParentID,
		NodeType:   node.NodeType,
		Title:      node.Title + "（副本）",
		Icon:       node.Icon,
		DocumentID: newDocID,
	}
	copied, err := s.Create(ownerID, projectID, input)
	if err != nil {
		return nil, err
	}
	return copied, nil
}

// copyDocument 复制一篇文档的正文，产出新的 canvas_documents 行。
// 复制的是「内容快照」：不复制修订历史（飞书复制页面同理，版本独立）。
func (s *KnowledgeService) copyDocument(ownerID, docID uuid.UUID, title string) (uuid.UUID, error) {
	var src model.CanvasDocument
	if err := s.db.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&src).Error; err != nil {
		return uuid.Nil, err
	}
	now := time.Now().UTC()
	dst := model.CanvasDocument{
		ID:            uuid.New(),
		OwnerUserID:   ownerID,
		CanvasType:    src.CanvasType,
		Title:         title,
		Notes:         src.Notes,
		TemplateID:    src.TemplateID,
		ProjectID:     src.ProjectID,
		SchemaVersion: src.SchemaVersion,
		SaveVersion:   1,
		CurrentData:   src.CurrentData,
		ContentText:   src.ContentText,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.db.Create(&dst).Error; err != nil {
		return uuid.Nil, err
	}
	// 复制文档属性：状态、标签、摘要一起带过去。
	var props model.DocProperty
	if err := s.db.Where("doc_id = ?", src.ID).First(&props).Error; err == nil {
		props.DocID = dst.ID
		props.CreatedAt = now
		props.UpdatedAt = now
		if err := s.db.Create(&props).Error; err != nil {
			return uuid.Nil, err
		}
	}
	return dst.ID, nil
}

// BatchNodeOp 是批量操作类型。
const (
	BatchTrash    = "trash"
	BatchFavorite = "favorite"
	BatchArchive  = "archive"
	BatchMove     = "move"
	BatchIcon     = "icon"
)

// BatchNodes 对一批节点做同一个操作（飞书批量移动/删除）。
func (s *KnowledgeService) BatchNodes(ownerID, projectID uuid.UUID, ids []uuid.UUID, op string, parentID *uuid.UUID, value string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	count := 0
	for _, id := range ids {
		switch op {
		case BatchTrash:
			if _, err := s.UpdateNodeMeta(ownerID, projectID, id, NodeMetaInput{Trashed: boolPtr(true)}); err != nil {
				return count, err
			}
		case BatchFavorite:
			if _, err := s.UpdateNodeMeta(ownerID, projectID, id, NodeMetaInput{Favorite: boolPtr(value == "on")}); err != nil {
				return count, err
			}
		case BatchArchive:
			if _, err := s.UpdateNodeMeta(ownerID, projectID, id, NodeMetaInput{Archived: boolPtr(value == "on")}); err != nil {
				return count, err
			}
		case BatchMove:
			if _, err := s.Move(ownerID, projectID, id, KnowledgeMoveInput{ParentID: parentID}); err != nil {
				return count, err
			}
		case "type":
			nodeType := validateNodeType(value)
			if err := s.db.Model(&model.KnowledgeNode{}).
				Where("id = ? AND project_id = ?", id, projectID).
				Update("node_type", nodeType).Error; err != nil {
				return count, err
			}
		case BatchIcon:
			icon, err := cleanNodeIcon(value, "doc")
			if err != nil {
				return count, err
			}
			if _, err := s.Update(ownerID, projectID, id, nil, &icon, nil); err != nil {
				return count, err
			}
		default:
			return count, ErrValidation
		}
		count++
	}
	return count, nil
}

// ---------------------------------------------------------------- 文档属性

// GetDocProps 读文档属性；没有记录时返回默认值（draft）。
func (s *KnowledgeService) GetDocProps(ownerID, docID uuid.UUID) (*model.DocProperty, error) {
	var props model.DocProperty
	err := s.db.Where("doc_id = ? AND owner_user_id = ?", docID, ownerID).First(&props).Error
	if err == gorm.ErrRecordNotFound {
		return &model.DocProperty{
			DocID:       docID,
			OwnerUserID: ownerID,
			Status:      "draft",
			CreatedAt:   time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return &props, nil
}

// DocPropsInput 是文档属性的增量更新。
type DocPropsInput struct {
	Status         *string
	ReviewerUserID *uuid.UUID
	DueAt          *time.Time
	ClearDueAt     bool
	Tags           *string
	Summary        *string
	CoverColor     *string
	CoverURL       *string
	// Members 是参与人（逗号分隔的用户 ID）。
	Members *string
	// Priority 是优先级：low | normal | high | urgent。
	Priority *string
	// Milestone 是里程碑，Sprint 是迭代周期。
	Milestone *string
	Sprint    *string
	// Number 是自定义数值（预算 / 工时 / 评分）。
	Number *float64
}

// UpsertDocProps 写文档属性。
func (s *KnowledgeService) UpsertDocProps(ownerID, docID uuid.UUID, in DocPropsInput) (*model.DocProperty, error) {
	props, err := s.GetDocProps(ownerID, docID)
	if err != nil {
		return nil, err
	}
	if in.Status != nil {
		status := strings.TrimSpace(*in.Status)
		if status != "draft" && status != "published" && status != "archived" {
			return nil, ErrValidation
		}
		props.Status = status
	}
	if in.ReviewerUserID != nil {
		props.ReviewerUserID = in.ReviewerUserID
	}
	if in.ClearDueAt {
		props.DueAt = nil
	} else if in.DueAt != nil {
		props.DueAt = in.DueAt
	}
	if in.Tags != nil {
		tags := strings.TrimSpace(*in.Tags)
		if utf8.RuneCountInString(tags) > 255 {
			return nil, ErrValidation
		}
		props.Tags = tags
	}
	if in.Summary != nil {
		summary := strings.TrimSpace(*in.Summary)
		if utf8.RuneCountInString(summary) > maxSummaryRunes {
			return nil, ErrValidation
		}
		props.Summary = summary
	}
	if in.CoverColor != nil {
		props.CoverColor = strings.TrimSpace(*in.CoverColor)
	}
	if in.CoverURL != nil {
		props.CoverURL = strings.TrimSpace(*in.CoverURL)
	}
	if in.Members != nil {
		members := strings.TrimSpace(*in.Members)
		if utf8.RuneCountInString(members) > 512 {
			return nil, ErrValidation
		}
		props.Members = members
	}
	if in.Priority != nil {
		priority := strings.TrimSpace(*in.Priority)
		switch priority {
		case "low", "normal", "high", "urgent":
		default:
			return nil, ErrValidation
		}
		props.Priority = priority
	}
	if in.Milestone != nil {
		props.Milestone = strings.TrimSpace(*in.Milestone)
	}
	if in.Sprint != nil {
		props.Sprint = strings.TrimSpace(*in.Sprint)
	}
	if in.Number != nil {
		props.Number = *in.Number
	}
	// 发布态必须有摘要：否则目录卡片与搜索结果显示不出这篇讲了什么。
	if props.Status == "published" && strings.TrimSpace(props.Summary) == "" {
		return nil, ErrValidation
	}
	props.UpdatedAt = time.Now().UTC()
	if err := s.db.Save(props).Error; err != nil {
		return nil, err
	}
	return props, nil
}

// ---------------------------------------------------------------- 评论

// ListComments 返回一篇文档的评论（未解决的在前）。
func (s *KnowledgeService) ListComments(ownerID, docID uuid.UUID) ([]model.DocComment, error) {
	var rows []model.DocComment
	err := s.db.Where("doc_id = ?", docID).
		Order("resolved ASC").Order("created_at ASC").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// AddComment 加一条评论。
func (s *KnowledgeService) AddComment(ownerID, docID uuid.UUID, parentID *uuid.UUID, quote, content string) (*model.DocComment, error) {
	content = strings.TrimSpace(content)
	if content == "" || utf8.RuneCountInString(content) > maxCommentRunes {
		return nil, ErrValidation
	}
	now := time.Now().UTC()
	comment := &model.DocComment{
		ID:           uuid.New(),
		DocID:        docID,
		AuthorUserID: ownerID,
		ParentID:     parentID,
		Quote:        quote,
		Content:      content,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.db.Create(comment).Error; err != nil {
		return nil, err
	}
	return comment, nil
}

// UpdateComment 改评论内容或标记已解决。
func (s *KnowledgeService) UpdateComment(ownerID, commentID uuid.UUID, content *string, resolved *bool) (*model.DocComment, error) {
	var comment model.DocComment
	if err := s.db.Where("id = ? AND author_user_id = ?", commentID, ownerID).First(&comment).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	if content != nil {
		clean := strings.TrimSpace(*content)
		if clean == "" || utf8.RuneCountInString(clean) > maxCommentRunes {
			return nil, ErrValidation
		}
		comment.Content = clean
	}
	if resolved != nil {
		comment.Resolved = *resolved
	}
	comment.UpdatedAt = time.Now().UTC()
	if err := s.db.Save(&comment).Error; err != nil {
		return nil, err
	}
	return &comment, nil
}

// DeleteComment 删自己的评论。
func (s *KnowledgeService) DeleteComment(ownerID, commentID uuid.UUID) error {
	return s.db.Where("id = ? AND author_user_id = ?", commentID, ownerID).
		Delete(&model.DocComment{}).Error
}

// ---------------------------------------------------------------- 最近浏览

// TouchView 记录一次文档访问。
func (s *KnowledgeService) TouchView(ownerID, docID uuid.UUID) error {
	now := time.Now().UTC()
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND doc_id = ?", ownerID, docID).
			Delete(&model.KnowledgeView{}).Error; err != nil {
			return err
		}
		return tx.Create(&model.KnowledgeView{
			ID:       uuid.New(),
			UserID:   ownerID,
			DocID:    docID,
			ViewedAt: now,
		}).Error
	})
}

// RecentView 是最近浏览的一条记录。
type RecentView struct {
	DocID    uuid.UUID `json:"docId"`
	Title    string    `json:"title"`
	ViewedAt time.Time `json:"viewedAt"`
}

// ListRecentViews 返回最近浏览的文档。
func (s *KnowledgeService) ListRecentViews(ownerID uuid.UUID, limit int) ([]RecentView, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var rows []model.KnowledgeView
	if err := s.db.Where("user_id = ?", ownerID).
		Order("viewed_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []RecentView{}
	if len(rows) == 0 {
		return out, nil
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.DocID)
	}
	var docs []model.CanvasDocument
	if err := s.db.Select("id", "title").Where("id IN ? AND owner_user_id = ?", ids, ownerID).
		Find(&docs).Error; err != nil {
		return nil, err
	}
	titles := map[uuid.UUID]string{}
	for _, doc := range docs {
		titles[doc.ID] = doc.Title
	}
	for _, row := range rows {
		out = append(out, RecentView{DocID: row.DocID, Title: titles[row.DocID], ViewedAt: row.ViewedAt})
	}
	return out, nil
}

// ---------------------------------------------------------------- 事件

// AppendEvent 追加一条知识变更事件（outbox）。
func (s *KnowledgeService) AppendEvent(db *gorm.DB, projectID uuid.UUID, eventType string, nodeID, docID *uuid.UUID, actorID uuid.UUID, payload string) error {
	return db.Create(&model.KnowledgeEvent{
		ID:          uuid.New(),
		ProjectID:   projectID,
		EventType:   eventType,
		NodeID:      nodeID,
		DocumentID:  docID,
		ActorUserID: actorID,
		Payload:     payload,
		CreatedAt:   time.Now().UTC(),
	}).Error
}

// ListEvents 返回项目最近的知识变更事件。
func (s *KnowledgeService) ListEvents(ownerID, projectID uuid.UUID, limit int) ([]model.KnowledgeEvent, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []model.KnowledgeEvent
	if err := s.db.Where("project_id = ?", projectID).
		Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ---------------------------------------------------------------- 看板

// SpaceSummary 汇总空间看板数据。
func (s *KnowledgeService) SpaceSummary(ownerID, projectID uuid.UUID) (*KnowledgeSummary, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	summary := &KnowledgeSummary{
		RecentUpdates: []model.KnowledgeNode{},
		Contributors:  []KnowledgeContributor{},
		Health:        []KnowledgeHealthItem{},
	}
	if err := s.db.Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND trashed_at IS NULL", projectID).
		Count(&summary.NodeCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND trashed_at IS NULL AND node_type = 'folder'", projectID).
		Count(&summary.FolderCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.CanvasDocument{}).
		Where("project_id = ? AND canvas_type = ? AND deleted_at IS NULL", projectID, DocCanvasType).
		Count(&summary.DocCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.DocComment{}).
		Where("doc_id IN (?)", s.projectDocIDs(projectID)).
		Count(&summary.CommentCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.DocComment{}).
		Where("doc_id IN (?) AND resolved = false", s.projectDocIDs(projectID)).
		Count(&summary.OpenComments).Error; err != nil {
		return nil, err
	}

	// 最近更新：按节点 updated_at 倒序取 8 条。
	var recent []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL", projectID).
		Order("updated_at DESC").Limit(8).Find(&recent).Error; err != nil {
		return nil, err
	}
	titled, err := s.overlayDocTitles(ownerID, recent)
	if err != nil {
		return nil, err
	}
	summary.RecentUpdates = titled

	// 贡献人：按文档属主统计。
	type row struct {
		OwnerUserID uuid.UUID
		Count       int64
	}
	var rows []row
	if err := s.db.Model(&model.CanvasDocument{}).
		Select("owner_user_id, COUNT(*) as count").
		Where("project_id = ? AND canvas_type = ? AND deleted_at IS NULL", projectID, DocCanvasType).
		Group("owner_user_id").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		summary.Contributors = append(summary.Contributors,
			KnowledgeContributor{OwnerUserID: r.OwnerUserID, Documents: r.Count})
	}

	// 健康度：无标题、正文为空、久未更新、缺摘要。
	var docs []model.CanvasDocument
	if err := s.db.Where("project_id = ? AND canvas_type = ? AND deleted_at IS NULL", projectID, DocCanvasType).
		Find(&docs).Error; err != nil {
		return nil, err
	}
	staleBefore := time.Now().UTC().Add(-30 * 24 * time.Hour)
	tags := map[string]bool{}
	for _, doc := range docs {
		if strings.TrimSpace(doc.Title) == "" {
			summary.Health = append(summary.Health, KnowledgeHealthItem{
				Kind: "no_title", DocID: doc.ID.String(), Title: doc.Title,
				Message: "文档没有标题，目录里几乎认不出来",
			})
		}
		if strings.TrimSpace(doc.ContentText) == "" {
			summary.Health = append(summary.Health, KnowledgeHealthItem{
				Kind: "empty_doc", DocID: doc.ID.String(), Title: doc.Title,
				Message: "正文为空，补一句背景也算数",
			})
		}
		if doc.UpdatedAt.Before(staleBefore) {
			summary.Health = append(summary.Health, KnowledgeHealthItem{
				Kind: "stale", DocID: doc.ID.String(), Title: doc.Title,
				Message: "超过 30 天没更新，确认是否已过期",
			})
		}
		var props model.DocProperty
		if err := s.db.Where("doc_id = ?", doc.ID).First(&props).Error; err == nil {
			if strings.TrimSpace(props.Summary) == "" {
				summary.Health = append(summary.Health, KnowledgeHealthItem{
					Kind: "no_summary", DocID: doc.ID.String(), Title: doc.Title,
					Message: "缺少摘要，搜索结果里只能看到标题",
				})
			}
			for _, tag := range strings.Split(props.Tags, ",") {
				tag = strings.TrimSpace(tag)
				if tag != "" {
					tags[tag] = true
				}
			}
		}
	}
	summary.TagCount = len(tags)
	return summary, nil
}

// projectDocIDs 返回项目下的文档 id 列表，供子查询使用。
func (s *KnowledgeService) projectDocIDs(projectID uuid.UUID) []uuid.UUID {
	var ids []uuid.UUID
	s.db.Model(&model.CanvasDocument{}).
		Where("project_id = ? AND canvas_type = ?", projectID, DocCanvasType).
		Pluck("id", &ids)
	return ids
}

// ---------------------------------------------------------------- 导出

// ExportTreeMarkdown 把整个知识库导出成保留层级的 Markdown。
func (s *KnowledgeService) ExportTreeMarkdown(ownerID, projectID uuid.UUID) (string, error) {
	nodes, err := s.Tree(ownerID, projectID)
	if err != nil {
		return "", err
	}
	type entry struct {
		node     model.KnowledgeNode
		document string
	}
	entries := map[uuid.UUID]*entry{}
	order := []uuid.UUID{}
	for _, node := range nodes {
		entries[node.ID] = &entry{node: node}
		order = append(order, node.ID)
	}
	var docs []model.CanvasDocument
	docIDs := []uuid.UUID{}
	for _, node := range nodes {
		if node.DocumentID != nil {
			docIDs = append(docIDs, *node.DocumentID)
		}
	}
	if len(docIDs) > 0 {
		if err := s.db.Where("id IN ? AND owner_user_id = ?", docIDs, ownerID).Find(&docs).Error; err != nil {
			return "", err
		}
	}
	byDoc := map[uuid.UUID]model.CanvasDocument{}
	for _, doc := range docs {
		byDoc[doc.ID] = doc
	}
	for _, node := range nodes {
		if node.DocumentID != nil {
			if doc, ok := byDoc[*node.DocumentID]; ok {
				entries[node.ID].document = docToMarkdown(doc)
			}
		}
	}

	children := map[uuid.UUID][]uuid.UUID{}
	roots := []uuid.UUID{}
	for _, id := range order {
		node := entries[id].node
		if node.ParentID == nil {
			roots = append(roots, id)
			continue
		}
		if _, ok := entries[*node.ParentID]; !ok {
			roots = append(roots, id)
			continue
		}
		children[*node.ParentID] = append(children[*node.ParentID], id)
	}
	var out strings.Builder
	var walk func(id uuid.UUID, depth int)
	walk = func(id uuid.UUID, depth int) {
		node := entries[id].node
		out.WriteString(strings.Repeat("  ", depth) + "- [" + node.Title + "]")
		if node.Alias != "" {
			out.WriteString(" (@" + node.Alias + ")")
		}
		out.WriteString("\n")
		if body := strings.TrimSpace(entries[id].document); body != "" {
			for _, line := range strings.Split(body, "\n") {
				out.WriteString(strings.Repeat("  ", depth+1) + line + "\n")
			}
		}
		kids := children[id]
		sort.Slice(kids, func(a, b int) bool {
			return entries[kids[a]].node.SortOrder < entries[kids[b]].node.SortOrder
		})
		for _, kid := range kids {
			walk(kid, depth+1)
		}
	}
	for _, root := range roots {
		walk(root, 0)
	}
	return out.String(), nil
}

// docToMarkdown 把一篇文档的正文转成 Markdown 文本。
func docToMarkdown(doc model.CanvasDocument) string {
	html := extractDocHTML(doc.CurrentData)
	if html == "" {
		return doc.ContentText
	}
	return htmlToMarkdown(html)
}

var (
	headingRe = regexp.MustCompile(`(?is)<h([1-6])[^>]*>(.*?)</h[1-6]>`)
	paraRe    = regexp.MustCompile(`(?is)<p[^>]*>(.*?)</p>`)
	listRe    = regexp.MustCompile(`(?is)<li[^>]*>(.*?)</li>`)
	strongRe  = regexp.MustCompile(`(?is)<(?:strong|b)[^>]*>(.*?)</(?:strong|b)>`)
	emRe      = regexp.MustCompile(`(?is)<(?:em|i)[^>]*>(.*?)</(?:em|i)>`)
	codeRe    = regexp.MustCompile(`(?is)<code[^>]*>(.*?)</code>`)
	tagRe     = regexp.MustCompile(`(?is)<[^>]+>`)
)

// htmlToMarkdown 把富文本 HTML 转成 Markdown。
//
// 知识库正文是 TipTap 的 HTML 片段，只需要标题、列表、段落和行内样式，
// 不引入完整的 HTML 解析器：正则够用且不新增依赖。
func htmlToMarkdown(html string) string {
	out := headingRe.ReplaceAllStringFunc(html, func(m string) string {
		parts := headingRe.FindStringSubmatch(m)
		if len(parts) < 3 {
			return m
		}
		level := parts[1]
		text := strings.TrimSpace(stripTags(parts[2]))
		if text == "" {
			return ""
		}
		return "\n" + strings.Repeat("#", int(level[0]-'0')) + " " + text + "\n\n"
	})
	// 行内样式先转成 Markdown 标记，再抽段落/列表文本：
	// 反过来做的话 stripTags 会把 <strong> 连同加粗语义一起抹掉。
	out = strongRe.ReplaceAllString(out, "**$1**")
	out = emRe.ReplaceAllString(out, "*$1*")
	out = codeRe.ReplaceAllString(out, "`$1`")
	out = listRe.ReplaceAllStringFunc(out, func(m string) string {
		parts := listRe.FindStringSubmatch(m)
		if len(parts) < 2 {
			return m
		}
		text := strings.TrimSpace(stripTags(parts[1]))
		if text == "" {
			return ""
		}
		return "\n- " + text
	})
	out = paraRe.ReplaceAllStringFunc(out, func(m string) string {
		parts := paraRe.FindStringSubmatch(m)
		if len(parts) < 2 {
			return m
		}
		text := strings.TrimSpace(stripTags(parts[1]))
		if text == "" {
			return ""
		}
		return "\n" + text + "\n"
	})
	out = tagRe.ReplaceAllString(out, "")
	out = strings.ReplaceAll(out, "&nbsp;", " ")
	out = strings.ReplaceAll(out, "&amp;", "&")
	out = strings.ReplaceAll(out, "&lt;", "<")
	out = strings.ReplaceAll(out, "&gt;", ">")
	lines := []string{}
	for _, line := range strings.Split(out, "\n") {
		trimmed := strings.TrimRight(line, " \t")
		if strings.TrimSpace(trimmed) == "" {
			if len(lines) > 0 && lines[len(lines)-1] == "" {
				continue
			}
			lines = append(lines, "")
			continue
		}
		lines = append(lines, trimmed)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

// ExportFile 是导出结果。
type ExportFile struct {
	Filename string
	Format   string
	Content  string
}

// ExportDocumentFormat 导出一篇文档为指定格式。
//
// 支持 markdown / html / text / json：Word 与 PDF 由前端用 HTML 二次转换，
// 服务端不引第三方转换依赖。
func (s *KnowledgeService) ExportDocumentFormat(ownerID, docID uuid.UUID, format string) (*ExportFile, error) {
	var doc model.CanvasDocument
	if err := s.db.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&doc).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	name := strings.TrimSpace(doc.Title)
	if name == "" {
		name = "document"
	}
	html := extractDocHTML(doc.CurrentData)
	switch format {
	case "markdown", "md":
		return &ExportFile{
			Filename: name + ".md",
			Format:   "markdown",
			Content:  htmlToMarkdown(html),
		}, nil
	case "html":
		return &ExportFile{
			Filename: name + ".html",
			Format:   "html",
			Content:  "<!doctype html><meta charset=\"utf-8\"><title>" + name + "</title>" + html,
		}, nil
	case "text", "txt":
		return &ExportFile{
			Filename: name + ".txt",
			Format:   "text",
			Content:  stripTags(html),
		}, nil
	default:
		return &ExportFile{Filename: name + ".json", Format: "json", Content: string(doc.CurrentData)}, nil
	}
}

func boolPtr(v bool) *bool { return &v }
