package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	doccontent "metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 5.0（续）：评论增强、正文任务块、大纲/目录、权限与词库。

// ---------------------------------------------------------------- 评论增强

// maxMentionUsers 限制单条评论 @ 的人数。
const maxMentionUsers = 20

// AddCommentDetailed 加评论：支持划线区间锚点与 @ 成员。
func (s *KnowledgeService) AddCommentDetailed(ownerID, docID uuid.UUID, parentID *uuid.UUID, quote, content string, anchorFrom, anchorTo int, mentions []string, blockID *uuid.UUID, blockOffset int) (*model.DocComment, error) {
	content = strings.TrimSpace(content)
	if content == "" || utf8.RuneCountInString(content) > maxCommentRunes {
		return nil, ErrValidation
	}
	if anchorFrom < 0 {
		anchorFrom = -1
	}
	if anchorTo < anchorFrom {
		anchorTo = anchorFrom
	}
	if len(mentions) > maxMentionUsers {
		return nil, ErrValidation
	}
	ids := make([]string, 0, len(mentions))
	for _, m := range mentions {
		if _, err := uuid.Parse(m); err == nil {
			ids = append(ids, m)
		}
	}
	if blockOffset < 0 {
		blockOffset = -1
	}
	if blockID == nil {
		var doc model.CanvasDocument
		if err := s.db.Select("id", "current_data").Where("id = ?", docID).First(&doc).Error; err == nil {
			blocks := doccontent.ExtractDocBlocks([]byte(doc.CurrentData))
			if bid, off, ok := doccontent.ResolveCommentAnchor(blocks, quote, anchorFrom); ok {
				if id, err := uuid.Parse(bid); err == nil {
					blockID = &id
					blockOffset = off
				}
			}
		}
	}
	now := time.Now().UTC()
	comment := &model.DocComment{
		ID:           uuid.New(),
		DocID:        docID,
		AuthorUserID: ownerID,
		ParentID:     parentID,
		Quote:        quote,
		Anchor:       anchorFrom,
		AnchorFrom:   anchorFrom,
		AnchorTo:     anchorTo,
		BlockID:      blockID,
		BlockOffset:  blockOffset,
		Mentions:     strings.Join(ids, ","),
		Reactions:    datatypes.JSON([]byte(`{}`)),
		Content:      content,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.db.Create(comment).Error; err != nil {
		return nil, err
	}
	s.notifyNewComment(comment)
	return comment, nil
}

// ToggleReaction 给评论加/取消表情回应。
func (s *KnowledgeService) ToggleReaction(ownerID, commentID uuid.UUID, emoji string) (*model.DocComment, error) {
	emoji = strings.TrimSpace(emoji)
	if emoji == "" || utf8.RuneCountInString(emoji) > 8 {
		return nil, ErrValidation
	}
	var comment model.DocComment
	if err := s.db.Where("id = ?", commentID).First(&comment).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	reactions := map[string][]string{}
	if len(comment.Reactions) > 0 {
		_ = json.Unmarshal(comment.Reactions, &reactions)
	}
	users := reactions[emoji]
	filtered := users[:0]
	found := false
	for _, u := range users {
		if u == ownerID.String() {
			found = true
			continue
		}
		filtered = append(filtered, u)
	}
	if found {
		reactions[emoji] = filtered
	} else {
		reactions[emoji] = append(filtered, ownerID.String())
	}
	raw, err := json.Marshal(reactions)
	if err != nil {
		return nil, err
	}
	comment.Reactions = datatypes.JSON(raw)
	comment.UpdatedAt = time.Now().UTC()
	if err := s.db.Save(&comment).Error; err != nil {
		return nil, err
	}
	return &comment, nil
}

// MarkCommentsRead 把当前用户的评论已读位置推进到现在。
func (s *KnowledgeService) MarkCommentsRead(ownerID, docID uuid.UUID) error {
	now := time.Now().UTC()
	var read model.DocCommentRead
	err := s.db.Where("user_id = ? AND doc_id = ?", ownerID, docID).First(&read).Error
	if err == gorm.ErrRecordNotFound {
		return s.db.Create(&model.DocCommentRead{
			ID: uuid.New(), UserID: ownerID, DocID: docID, ReadAt: now, CreatedAt: now,
		}).Error
	}
	if err != nil {
		return err
	}
	read.ReadAt = now
	return s.db.Save(&read).Error
}

// commentUnreadState 标记当前用户尚未读到的评论。
func (s *KnowledgeService) commentUnreadState(ownerID, docID uuid.UUID, rows []model.DocComment) error {
	var read model.DocCommentRead
	readAt := time.Time{}
	if err := s.db.Where("user_id = ? AND doc_id = ?", ownerID, docID).First(&read).Error; err == nil {
		readAt = read.ReadAt
	}
	for i := range rows {
		if readAt.IsZero() {
			rows[i].Unread = true
			continue
		}
		rows[i].Unread = rows[i].CreatedAt.After(readAt)
	}
	return nil
}

// ListCommentsFiltered 列评论并带上未读标记。
func (s *KnowledgeService) ListCommentsFiltered(ownerID, docID uuid.UUID, resolved *bool, unreadOnly bool) ([]model.DocComment, error) {
	rows, err := s.ListComments(ownerID, docID)
	if err != nil {
		return nil, err
	}
	if err := s.commentUnreadState(ownerID, docID, rows); err != nil {
		return nil, err
	}
	out := make([]model.DocComment, 0, len(rows))
	for _, c := range rows {
		if resolved != nil && c.Resolved != *resolved {
			continue
		}
		if unreadOnly && !c.Unread {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

// VersionComments 返回某个历史版本当时的评论：版本时间点之前已存在的评论。
func (s *KnowledgeService) VersionComments(ownerID, docID, versionID uuid.UUID) ([]model.DocComment, error) {
	var version model.KnowledgeDocVersion
	if err := s.db.Where("id = ? AND document_id = ?", versionID, docID).First(&version).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	var rows []model.DocComment
	if err := s.db.Where("doc_id = ? AND created_at <= ?", docID, version.CreatedAt).
		Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ---------------------------------------------------------------- 正文任务块

// DocTask 是正文里的一个待办项。
type DocTask struct {
	Index   int    `json:"index"`
	Text    string `json:"text"`
	Checked bool   `json:"checked"`
}

// isTaskItemAttrs 判断列表项是不是待办块：TipTap 用 data-type="taskItem"，
// 简化写法用 data-checked 或内嵌 checkbox。
func isTaskItemAttrs(attrs string) bool {
	lower := strings.ToLower(attrs)
	return strings.Contains(lower, "data-type=\"taskitem\"") ||
		strings.Contains(lower, "data-type=\"task\"") ||
		strings.Contains(lower, "data-type='taskitem'") ||
		strings.Contains(lower, "data-type='task'") ||
		strings.Contains(lower, "data-checked")
}

var taskItemRe = regexp.MustCompile(`(?is)<li([^>]*)>(.*?)</li>`)
var taskCheckedRe = regexp.MustCompile(`(?i)data-checked\s*=\s*"(true|false)"`)
var taskCheckedInputRe = regexp.MustCompile(`(?is)<input[^>]*type\s*=\s*"checkbox"[^>]*>`)
var inputCheckedRe = regexp.MustCompile(`(?i)checked`)

// ExtractTasks 从正文 HTML 里提取待办块。
func ExtractTasks(html string) []DocTask {
	tasks := []DocTask{}
	idx := 0
	for _, m := range taskItemRe.FindAllStringSubmatch(html, -1) {
		attrs, inner := m[1], m[2]
		isTask := isTaskItemAttrs(attrs) || taskCheckedInputRe.MatchString(inner)
		if !isTask {
			continue
		}
		checked := false
		if cm := taskCheckedRe.FindStringSubmatch(attrs); cm != nil {
			checked = cm[1] == "true"
		} else if taskCheckedInputRe.MatchString(inner) {
			checked = inputCheckedRe.MatchString(taskCheckedInputRe.FindString(inner))
		}
		text := stripHTML(inner)
		text = strings.TrimSpace(strings.Trim(text, "☐☑✓✔[]"))
		tasks = append(tasks, DocTask{Index: idx, Text: text, Checked: checked})
		idx++
	}
	return tasks
}

// ListDocTasks 列出文档正文里的待办块。
func (s *KnowledgeService) ListDocTasks(ownerID, docID uuid.UUID) ([]DocTask, error) {
	doc, err := s.GetOwnedDocument(ownerID, docID)
	if err != nil {
		return nil, err
	}
	return ExtractTasks(documentHTML(doc)), nil
}

// SetDocTask 勾选/取消勾选某个待办块，并回写正文。
func (s *KnowledgeService) SetDocTask(ownerID, docID uuid.UUID, index int, checked bool) error {
	doc, err := s.GetOwnedDocument(ownerID, docID)
	if err != nil {
		return err
	}
	html := documentHTML(doc)
	tasks := ExtractTasks(html)
	if index < 0 || index >= len(tasks) {
		return ErrNodeNotFound
	}
	seen := 0
	out := taskItemRe.ReplaceAllStringFunc(html, func(m string) string {
		sub := taskItemRe.FindStringSubmatch(m)
		attrs, inner := sub[1], sub[2]
		isTask := isTaskItemAttrs(attrs) || taskCheckedInputRe.MatchString(inner)
		if !isTask {
			return m
		}
		cur := seen
		seen++
		if cur != index {
			return m
		}
		newAttrs := taskCheckedRe.ReplaceAllString(attrs, `data-checked="`+strconv.FormatBool(checked)+`"`)
		if !taskCheckedRe.MatchString(attrs) {
			newAttrs = attrs + ` data-checked="` + strconv.FormatBool(checked) + `"`
		}
		return "<li" + newAttrs + ">" + inner + "</li>"
	})
	if seen != len(tasks) {
		return ErrNodeNotFound
	}
	return s.saveDocHTML(ownerID, docID, htmlPayload(out))
}

// ---------------------------------------------------------------- 大纲与目录

// OutlineItem 是正文里的一级标题。
type OutlineItem struct {
	Index int    `json:"index"`
	Level int    `json:"level"`
	Text  string `json:"text"`
}

// DocOutline 解析正文标题层级：大纲面板与目录块共用。
func (s *KnowledgeService) DocOutline(ownerID, docID uuid.UUID) ([]OutlineItem, error) {
	doc, err := s.GetOwnedDocument(ownerID, docID)
	if err != nil {
		return nil, err
	}
	return OutlineFromHTML(documentHTML(doc)), nil
}

// OutlineFromHTML 从 HTML 里抽标题层级。
func OutlineFromHTML(html string) []OutlineItem {
	items := []OutlineItem{}
	for _, m := range headingRe.FindAllStringSubmatch(html, -1) {
		level, _ := strconv.Atoi(m[1])
		text := strings.TrimSpace(stripHTML(m[2]))
		items = append(items, OutlineItem{Index: len(items), Level: level, Text: text})
	}
	return items
}

// section 是「标题 + 其后内容」组成的一节：大纲拖拽排序按节移动。
type section struct {
	heading string
	body    string
}

// splitSections 按标题切分正文：标题之前的内容归入 preamble。
func splitSections(html string) (string, []section) {
	matches := headingRe.FindAllStringSubmatchIndex(html, -1)
	if len(matches) == 0 {
		return html, nil
	}
	preamble := html[:matches[0][0]]
	sections := make([]section, 0, len(matches))
	for i, m := range matches {
		end := len(html)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		}
		sections = append(sections, section{heading: html[m[0]:m[1]], body: html[m[1]:end]})
	}
	return preamble, sections
}

// ReorderOutline 按大纲顺序重排正文各节：order 是原大纲索引的新顺序。
func (s *KnowledgeService) ReorderOutline(ownerID, docID uuid.UUID, order []int) error {
	doc, err := s.GetOwnedDocument(ownerID, docID)
	if err != nil {
		return err
	}
	html := documentHTML(doc)
	preamble, sections := splitSections(html)
	if len(sections) == 0 {
		return ErrValidation
	}
	if len(order) != len(sections) {
		return ErrValidation
	}
	used := map[int]bool{}
	for _, idx := range order {
		if idx < 0 || idx >= len(sections) || used[idx] {
			return ErrValidation
		}
		used[idx] = true
	}
	var b strings.Builder
	b.WriteString(preamble)
	for _, idx := range order {
		b.WriteString(sections[idx].heading)
		b.WriteString(sections[idx].body)
	}
	return s.saveDocHTML(ownerID, docID, htmlPayload(b.String()))
}

// ErrShareForbidden 表示分享白名单不允许当前访问者。
var ErrShareForbidden = errors.New("share not allowed for current user")

// ---------------------------------------------------------------- 权限

// NodeAccessInput 是节点可见范围设置。
type NodeAccessInput struct {
	// Visibility 是 space 或 private。
	Visibility string `json:"visibility"`
	// AllowedUsers 是私有节点可见用户（逗号分隔）。
	AllowedUsers string `json:"allowedUsers"`
}

// SetNodeAccess 设置节点可见范围与可见成员。
func (s *KnowledgeService) SetNodeAccess(ownerID, projectID, nodeID uuid.UUID, in NodeAccessInput) (*model.KnowledgeNode, error) {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	visibility := strings.TrimSpace(in.Visibility)
	if visibility == "" {
		visibility = "space"
	}
	if visibility != "space" && visibility != "private" {
		return nil, ErrValidation
	}
	users := strings.TrimSpace(in.AllowedUsers)
	if utf8.RuneCountInString(users) > 512 {
		return nil, ErrValidation
	}
	node.Visibility = visibility
	node.AllowedUsers = users
	node.UpdatedAt = time.Now().UTC()
	if err := s.db.Model(&model.KnowledgeNode{}).Where("id = ?", node.ID).
		Updates(map[string]any{
			"visibility":    visibility,
			"allowed_users": users,
			"updated_at":    node.UpdatedAt,
		}).Error; err != nil {
		return nil, err
	}
	return node, nil
}

// nodeVisible 判断节点对某用户是否可见：私有节点沿父链继承最严格的可见范围。
func (s *KnowledgeService) nodeVisible(ownerID uuid.UUID, node model.KnowledgeNode) bool {
	// 自身是私有时：只有名单内成员与创建者可见。
	if node.Visibility == "private" && !nodeAllowsUser(node, ownerID) {
		return false
	}
	// 父级是私有时：子节点一并继承父级的可见范围。
	parentID := node.ParentID
	for depth := 0; parentID != nil && depth < maxTreeDepth; depth++ {
		var parent model.KnowledgeNode
		if err := s.db.Where("id = ?", *parentID).First(&parent).Error; err != nil {
			break
		}
		if parent.Visibility == "private" && !nodeAllowsUser(parent, ownerID) {
			return false
		}
		parentID = parent.ParentID
	}
	return true
}

// nodeAllowsUser 判断节点的可见名单是否包含该用户（创建者始终可见）。
func nodeAllowsUser(node model.KnowledgeNode, ownerID uuid.UUID) bool {
	if node.CreatedBy != nil && *node.CreatedBy == ownerID {
		return true
	}
	for _, id := range strings.Split(node.AllowedUsers, ",") {
		if strings.TrimSpace(id) == ownerID.String() {
			return true
		}
	}
	return false
}

// SetShareAllowList 设置分享白名单。
func (s *KnowledgeService) SetShareAllowList(ownerID, shareID uuid.UUID, allowUsers string) (*model.KnowledgeShare, error) {
	var share model.KnowledgeShare
	if err := s.db.Where("id = ? AND created_by = ?", shareID, ownerID).First(&share).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	allowUsers = strings.TrimSpace(allowUsers)
	if utf8.RuneCountInString(allowUsers) > 512 {
		return nil, ErrValidation
	}
	share.AllowUsers = allowUsers
	if err := s.db.Model(&model.KnowledgeShare{}).Where("id = ?", share.ID).
		Updates(map[string]any{"allow_users": allowUsers}).Error; err != nil {
		return nil, err
	}
	return &share, nil
}

// shareAllowed 判断访问者是否在分享白名单内：空名单表示公开。
func shareAllowed(share *model.KnowledgeShare, userID *uuid.UUID) bool {
	if strings.TrimSpace(share.AllowUsers) == "" {
		return true
	}
	if userID == nil {
		return false
	}
	for _, id := range strings.Split(share.AllowUsers, ",") {
		if strings.TrimSpace(id) == userID.String() {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- 业务词库

// ListTagDict 列出空间的业务词库。
func (s *KnowledgeService) ListTagDict(ownerID, projectID uuid.UUID) ([]model.KnowledgeTagDict, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var rows []model.KnowledgeTagDict
	if err := s.db.Where("project_id = ?", projectID).Order("category ASC, tag ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// AddTagDict 往词库加词条（同词条覆盖分类与别名）。
func (s *KnowledgeService) AddTagDict(ownerID, projectID uuid.UUID, tag, category, aliases string) (*model.KnowledgeTagDict, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	tag = strings.TrimSpace(tag)
	if tag == "" || utf8.RuneCountInString(tag) > 64 {
		return nil, ErrValidation
	}
	if utf8.RuneCountInString(category) > 32 || utf8.RuneCountInString(aliases) > 255 {
		return nil, ErrValidation
	}
	row := &model.KnowledgeTagDict{
		ID: uuid.New(), ProjectID: projectID, Tag: tag, Category: category, Aliases: aliases,
		CreatedAt: time.Now().UTC(),
	}
	err := s.db.Where("project_id = ? AND tag = ?", projectID, tag).
		Assign(map[string]any{"category": category, "aliases": aliases}).
		FirstOrCreate(row).Error
	if err != nil {
		return nil, err
	}
	return row, nil
}

// DeleteTagDict 删除词条。
func (s *KnowledgeService) DeleteTagDict(ownerID, projectID uuid.UUID, id uuid.UUID) error {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return err
	}
	return s.db.Where("id = ? AND project_id = ?", id, projectID).Delete(&model.KnowledgeTagDict{}).Error
}

// SuggestTagsWithDict 在原有关键词推荐上叠加业务词库。
func (s *KnowledgeService) SuggestTagsWithDict(ownerID, projectID uuid.UUID, docID uuid.UUID) ([]string, error) {
	base, err := s.SuggestTags(ownerID, docID)
	if err != nil {
		return nil, err
	}
	dict, err := s.ListTagDict(ownerID, projectID)
	if err != nil {
		return base, nil
	}
	seen := map[string]bool{}
	for _, t := range base {
		seen[strings.ToLower(t)] = true
	}
	for _, entry := range dict {
		candidates := append([]string{entry.Tag}, strings.Split(entry.Aliases, ",")...)
		for _, c := range candidates {
			c = strings.TrimSpace(c)
			if c == "" || seen[strings.ToLower(c)] {
				continue
			}
			seen[strings.ToLower(c)] = true
			base = append(base, c)
		}
	}
	return base, nil
}

// ---------------------------------------------------------------- 辅助

// htmlPayload 把正文 HTML 包成文档的 current_data 负载。
func htmlPayload(html string) []byte {
	raw, err := json.Marshal(map[string]interface{}{"type": "doc", "html": html})
	if err != nil {
		return []byte(`{"type":"doc","html":""}`)
	}
	return raw
}

// saveDocHTML 直接回写文档正文并留一条历史快照：服务端改稿（勾选待办、拖拽大纲）用。
func (s *KnowledgeService) saveDocHTML(ownerID, docID uuid.UUID, payload []byte) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var doc model.CanvasDocument
		if err := tx.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&doc).Error; err != nil {
			return ErrDocumentNotFound
		}
		var body struct {
			HTML string `json:"html"`
		}
		_ = json.Unmarshal(payload, &body)
		doc.CurrentData = datatypes.JSON(payload)
		doc.ContentText = stripHTML(body.HTML)
		doc.SaveVersion = doc.SaveVersion + 1
		doc.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&doc).Error; err != nil {
			return err
		}
		return SnapshotDocVersion(tx, &doc)
	})
}
