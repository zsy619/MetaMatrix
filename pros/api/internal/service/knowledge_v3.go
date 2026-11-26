package service

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 3.0：多维表格 / 思维导图节点、分享链接、历史版本对比、
// 知识图谱、作者维度检索、在线协作状态（presence）与本地智能检索问答。

const (
	maxNodeDataBytes = 256 * 1024
	maxVersionKeep   = 50
	presenceTTL      = 45 * time.Second
)

// ---------------------------------------------------------------- 节点数据（表格 / 导图）

// docs 借 DocumentsService 读文档：知识库与文档共用同一套所有权校验。
func (s *KnowledgeService) docs() *DocumentsService { return NewDocumentsService(s.db) }

// GetNodeData 读取节点的结构化数据；没有记录时返回按类型生成的空骨架。
func (s *KnowledgeService) GetNodeData(ownerID, projectID, nodeID uuid.UUID) (*model.KnowledgeNodeData, error) {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	var row model.KnowledgeNodeData
	err = s.db.Where("node_id = ?", nodeID).First(&row).Error
	if err == nil {
		return &row, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	return &model.KnowledgeNodeData{
		NodeID: nodeID,
		Kind:   dataKindForNodeType(node.NodeType),
		Data:   datatypes.JSON(defaultNodeData(dataKindForNodeType(node.NodeType))),
	}, nil
}

// SaveNodeData 保存节点的结构化数据。
func (s *KnowledgeService) SaveNodeData(ownerID, projectID, nodeID uuid.UUID, kind string, data json.RawMessage) (*model.KnowledgeNodeData, error) {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	want := dataKindForNodeType(node.NodeType)
	if want == "" {
		return nil, ErrValidation
	}
	if kind != "" && kind != want {
		return nil, ErrValidation
	}
	if len(data) == 0 || len(data) > maxNodeDataBytes {
		return nil, ErrValidation
	}
	now := time.Now().UTC()
	row := model.KnowledgeNodeData{
		NodeID:    nodeID,
		Kind:      want,
		Data:      datatypes.JSON(data),
		CreatedAt: now,
		UpdatedAt: now,
	}
	err = s.db.Where("node_id = ?", nodeID).
		Assign(map[string]interface{}{"kind": want, "data": datatypes.JSON(data), "updated_at": now}).
		FirstOrCreate(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// dataKindForNodeType 把节点类型映射到结构化数据的类别。
func dataKindForNodeType(nodeType string) string {
	switch nodeType {
	case "sheet":
		return "sheet"
	case "mindmap":
		return "mindmap"
	case "attachment":
		return "attachment"
	default:
		return ""
	}
}

// defaultNodeData 生成空骨架：表格给一行表头，导图给一个根节点。
func defaultNodeData(kind string) []byte {
	switch kind {
	case "sheet":
		return []byte(`{"columns":["列 1","列 2","列 3"],"rows":[["","",""]]}`)
	case "mindmap":
		return []byte(`{"title":"中心主题","children":[{"title":"分支 1","children":[]}]}`)
	case "attachment":
		return []byte(`{"files":[]}`)
	default:
		return []byte(`{}`)
	}
}

// ---------------------------------------------------------------- 分享链接

// CreateShare 为文档创建分享链接。
func (s *KnowledgeService) CreateShare(ownerID, docID uuid.UUID, role string, expiresAt *time.Time) (*model.KnowledgeShare, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	role = strings.TrimSpace(role)
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
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now().UTC(),
	}
	if err := s.db.Create(share).Error; err != nil {
		return nil, err
	}
	return share, nil
}

// ListShares 返回文档的分享链接。
func (s *KnowledgeService) ListShares(ownerID, docID uuid.UUID) ([]model.KnowledgeShare, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	var rows []model.KnowledgeShare
	err := s.db.Where("document_id = ?", docID).Order("created_at DESC").Find(&rows).Error
	for i := range rows {
		rows[i].HasPassword = rows[i].PasswordHash != ""
	}
	return rows, err
}

// RevokeShare 撤销分享链接。
func (s *KnowledgeService) RevokeShare(ownerID, shareID uuid.UUID) error {
	res := s.db.Where("id = ? AND created_by = ?", shareID, ownerID).Delete(&model.KnowledgeShare{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrDocumentNotFound
	}
	return nil
}

// SharedDoc 是分享页可读的内容。
//
// Kind 决定渲染方式：doc 用 HTML，canvas 走画布模板，
// mindmap / sheet 直接下发结构化 JSON。
type SharedDoc struct {
	Token     string     `json:"token"`
	Role      string     `json:"role"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	HTML      string     `json:"html"`
	ExpiresAt *time.Time `json:"expiresAt"`
	// Canvas 是画布分享的模板与内容：前端按模板 id 渲染。
	Canvas *SharedCanvas `json:"canvas,omitempty"`
	// Data 是导图 / 表格的结构化内容（原始 JSON）。
	Data json.RawMessage `json:"data,omitempty"`
	// AllowCopy=false 时分享页禁止复制与导出。
	AllowCopy bool `json:"allowCopy"`
	// RequiresPassword=true 表示需要口令才能读取正文。
	RequiresPassword bool `json:"requiresPassword"`
}

// SharedCanvas 是画布分享的内容。
type SharedCanvas struct {
	TemplateID string          `json:"templateId"`
	Data       json.RawMessage `json:"data"`
}

// documentHTML 取文档正文 HTML：正文存在 current_data 里。
func documentHTML(doc *model.CanvasDocument) string {
	if doc == nil || len(doc.CurrentData) == 0 {
		return ""
	}
	var payload struct {
		HTML string `json:"html"`
	}
	if err := json.Unmarshal(doc.CurrentData, &payload); err != nil {
		return ""
	}
	return payload.HTML
}

// ResolveShare 按分享 token 取文档内容（公开访问，不需要登录态）。
func (s *KnowledgeService) ResolveShare(token string) (*SharedDoc, error) {
	share, err := s.findShareByToken(token)
	if err != nil {
		return nil, err
	}
	return s.resolveShareContent(share, false)
}

// findShareByToken 按 token 取分享记录，顺带校验有效期。
func (s *KnowledgeService) findShareByToken(token string) (*model.KnowledgeShare, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrDocumentNotFound
	}
	var share model.KnowledgeShare
	if err := s.db.Where("token = ?", token).First(&share).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	if share.ExpiresAt != nil && share.ExpiresAt.Before(time.Now().UTC()) {
		return nil, ErrDocumentNotFound
	}
	return &share, nil
}

// resolveShareContent 按分享类型取正文。
//
// unlocked 表示口令已校验通过：带口令的分享在解锁前只回「需要口令」标记。
func (s *KnowledgeService) resolveShareContent(share *model.KnowledgeShare, unlocked bool) (*SharedDoc, error) {
	kind := shareKind(share)
	if kind == "mindmap" || kind == "sheet" {
		return s.resolveNodeShare(share, unlocked)
	}
	var doc model.CanvasDocument
	if share.DocumentID == nil {
		return nil, ErrDocumentNotFound
	}
	if err := s.db.Where("id = ?", *share.DocumentID).First(&doc).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	// 有口令的分享：没有口令就不返回正文，只提示需要口令。
	if share.PasswordHash != "" && !unlocked {
		return &SharedDoc{
			Token:            share.Token,
			Role:             share.Role,
			Kind:             kind,
			Title:            doc.Title,
			ExpiresAt:        share.ExpiresAt,
			AllowCopy:        share.AllowCopy,
			RequiresPassword: true,
		}, nil
	}
	// 画布不是富文本文档：正文是模板 JSON，分享页要按模板渲染。
	if kind == "canvas" {
		s.auditShareAccess(share)
		return &SharedDoc{
			Token:     share.Token,
			Role:      share.Role,
			Kind:      "canvas",
			Title:     doc.Title,
			ExpiresAt: share.ExpiresAt,
			AllowCopy: share.AllowCopy,
			Canvas: &SharedCanvas{
				TemplateID: canvasTemplateID(&doc),
				Data:       json.RawMessage(doc.CurrentData),
			},
		}, nil
	}
	html := documentHTML(&doc)
	// 分享访问审计：同一文档 5 分钟内只记一次，避免轮询刷事件。
	s.auditShareAccess(share)
	return &SharedDoc{
		Token:     share.Token,
		Role:      share.Role,
		Kind:      kind,
		Title:     doc.Title,
		HTML:      html,
		ExpiresAt: share.ExpiresAt,
		AllowCopy: share.AllowCopy,
	}, nil
}

// shareKindForDoc 按文档类型判定分享内容类型：画布类走模板渲染，其余按富文本处理。
func shareKindForDoc(doc *model.CanvasDocument) string {
	if doc == nil {
		return "doc"
	}
	if doc.CanvasType != "" && doc.CanvasType != "doc" {
		return "canvas"
	}
	return "doc"
}

// shareKind 返回分享的内容类型，兼容存量数据（没有 kind 列时按文档处理）。
func shareKind(share *model.KnowledgeShare) string {
	if share.Kind != "" {
		return share.Kind
	}
	return "doc"
}

// canvasTemplateID 取画布模板 id：优先用模板字段，回退到画布类型。
func canvasTemplateID(doc *model.CanvasDocument) string {
	if doc == nil {
		return ""
	}
	if doc.TemplateID != nil && *doc.TemplateID != "" {
		return *doc.TemplateID
	}
	return doc.CanvasType
}

// auditShareAccess 记录「谁在何时通过链接访问了文档」。
func (s *KnowledgeService) auditShareAccess(share *model.KnowledgeShare) {
	if share.ProjectID == uuid.Nil {
		return
	}
	if share.DocumentID == nil {
		return
	}
	recent := time.Now().UTC().Add(-5 * time.Minute)
	var count int64
	if err := s.db.Model(&model.KnowledgeEvent{}).
		Where("project_id = ? AND event_type = 'share.access' AND document_id = ? AND created_at > ?",
			share.ProjectID, *share.DocumentID, recent).Count(&count).Error; err != nil {
		return
	}
	if count > 0 {
		return
	}
	// 审计事件里不写完整 token：分享链接本身就是访问凭证，事件表会被导出。
	// 只留脱敏后的前缀，足够排查「谁在什么时候访问过」（112）。
	_ = s.AppendEvent(s.db, share.ProjectID, "share.access", nil, share.DocumentID, share.CreatedBy, maskShareToken(share.Token))
}

// ---------------------------------------------------------------- 历史版本

// VersionKeep 是每篇文档保留的历史版本条数：启动时按配置覆盖（111）。
var VersionKeep = maxVersionKeep

// SnapshotDocVersion 为文档追加一条历史快照；同一 saveVersion 只留一条。
func SnapshotDocVersion(tx *gorm.DB, doc *model.CanvasDocument) error {
	if doc == nil || doc.CanvasType != "doc" {
		return nil
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
	var exists int64
	if err := tx.Model(&model.KnowledgeDocVersion{}).
		Where("document_id = ? AND save_version = ?", doc.ID, doc.SaveVersion).
		Count(&exists).Error; err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	version := &model.KnowledgeDocVersion{
		ID:           uuid.New(),
		DocumentID:   doc.ID,
		Title:        doc.Title,
		HTML:         html,
		AuthorUserID: doc.OwnerUserID,
		SaveVersion:  doc.SaveVersion,
		CreatedAt:    time.Now().UTC(),
	}
	if err := tx.Create(version).Error; err != nil {
		return err
	}
	// 只保留最近 keepVersionLimit 条，多余的旧快照删掉。
	var stale []uuid.UUID
	if err := tx.Model(&model.KnowledgeDocVersion{}).
		Where("document_id = ?", doc.ID).
		Order("created_at DESC").Offset(VersionKeep).
		Pluck("id", &stale).Error; err != nil {
		return err
	}
	if len(stale) > 0 {
		if err := tx.Unscoped().Where("id IN ?", stale).Delete(&model.KnowledgeDocVersion{}).Error; err != nil {
			return err
		}
	}
	return nil
}

// ListDocVersions 返回文档的历史快照。
func (s *KnowledgeService) ListDocVersions(ownerID, docID uuid.UUID, limit int) ([]model.KnowledgeDocVersion, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > VersionKeep {
		limit = VersionKeep
	}
	var rows []model.KnowledgeDocVersion
	err := s.db.Where("document_id = ?", docID).
		Order("created_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// VersionDiff 对比两个历史快照，返回统一 diff 文本。
func (s *KnowledgeService) VersionDiff(ownerID, docID, fromID, toID uuid.UUID) (string, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return "", err
	}
	load := func(id uuid.UUID) (model.KnowledgeDocVersion, error) {
		var row model.KnowledgeDocVersion
		err := s.db.Where("id = ? AND document_id = ?", id, docID).First(&row).Error
		if err != nil {
			return row, ErrDocumentNotFound
		}
		return row, nil
	}
	from, err := load(fromID)
	if err != nil {
		return "", err
	}
	to, err := load(toID)
	if err != nil {
		return "", err
	}
	ops := content.DiffTextLines(stripHTML(from.HTML), stripHTML(to.HTML))
	return content.UnifiedDiff(ops), nil
}

var htmlTagRe = regexp.MustCompile(`<[^>]+>`)

func stripHTML(s string) string {
	text := htmlTagRe.ReplaceAllString(s, "")
	text = strings.ReplaceAll(text, "&nbsp;", " ")
	text = strings.ReplaceAll(text, "&amp;", "&")
	text = strings.ReplaceAll(text, "&lt;", "<")
	text = strings.ReplaceAll(text, "&gt;", ">")
	return strings.TrimSpace(text)
}

// ---------------------------------------------------------------- 知识图谱

// KnowledgeGraph 是知识图谱数据。
type KnowledgeGraph struct {
	Nodes []KnowledgeGraphNode `json:"nodes"`
	Edges []KnowledgeGraphEdge `json:"edges"`
}

// KnowledgeGraphNode 是图谱中的一个节点。
type KnowledgeGraphNode struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	NodeType   string `json:"nodeType"`
	DocumentID string `json:"documentId"`
	Author     string `json:"author"`
}

// KnowledgeGraphEdge 是图谱中的一条关系。
type KnowledgeGraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"` // tree | reference
}

// BuildGraph 用「目录父子关系 + 文档引用关系」拼出知识图谱。
func (s *KnowledgeService) BuildGraph(ownerID, projectID uuid.UUID) (*KnowledgeGraph, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL", projectID).
		Find(&nodes).Error; err != nil {
		return nil, err
	}
	graph := &KnowledgeGraph{Nodes: []KnowledgeGraphNode{}, Edges: []KnowledgeGraphEdge{}}
	docToNode := map[uuid.UUID]uuid.UUID{}
	for _, n := range nodes {
		graphNode := KnowledgeGraphNode{
			ID:       n.ID.String(),
			Title:    n.Title,
			NodeType: n.NodeType,
			Author:   s.userName(n.CreatedBy),
		}
		if n.DocumentID != nil {
			graphNode.DocumentID = n.DocumentID.String()
			docToNode[*n.DocumentID] = n.ID
		}
		graph.Nodes = append(graph.Nodes, graphNode)
	}
	for _, n := range nodes {
		if n.ParentID != nil {
			graph.Edges = append(graph.Edges, KnowledgeGraphEdge{
				Source: n.ParentID.String(), Target: n.ID.String(), Type: "tree",
			})
		}
	}
	var refs []model.PageReference
	if err := s.db.Model(&model.PageReference{}).
		Where("source_doc_id IN ?", s.projectDocIDs(projectID)).
		Find(&refs).Error; err != nil {
		return nil, err
	}
	for _, ref := range refs {
		source, ok := docToNode[ref.SourceDocID]
		if !ok {
			continue
		}
		target, ok := docToNode[ref.TargetDocID]
		if !ok || source == target {
			continue
		}
		edgeType := "reference"
		if ref.BlockType != "" {
			edgeType = "structure"
		}
		graph.Edges = append(graph.Edges, KnowledgeGraphEdge{
			Source: source.String(), Target: target.String(), Type: edgeType,
		})
	}
	return graph, nil
}

// userName 查用户显示名，查不到就返回空串。
func (s *KnowledgeService) userName(id *uuid.UUID) string {
	if id == nil || *id == uuid.Nil {
		return ""
	}
	var user model.User
	if err := s.db.Select("display_name", "email").Where("id = ?", *id).First(&user).Error; err != nil {
		return ""
	}
	if user.DisplayName != "" {
		return user.DisplayName
	}
	return user.Email
}

// ---------------------------------------------------------------- 作者维度检索

// KnowledgeSearchHit 是一条检索结果。
type KnowledgeSearchHit struct {
	NodeID     string    `json:"nodeId"`
	DocumentID string    `json:"documentId"`
	Title      string    `json:"title"`
	Summary    string    `json:"summary"`
	NodeType   string    `json:"nodeType"`
	Author     string    `json:"author"`
	AuthorID   string    `json:"authorId"`
	Tags       string    `json:"tags"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Snippet    string    `json:"snippet"`
	// Words 是正文字数：搜索结果按字数排序时用它。
	Words int `json:"words"`
}

// KnowledgeSearchFilter 是检索条件。
type KnowledgeSearchFilter struct {
	Query    string
	AuthorID string
	NodeType string
	From     *time.Time
	To       *time.Time
	Limit    int
	// Sort 是排序方式：""（最近更新）| word（字数）| title（标题）。
	Sort string
}

// SearchSpace 在知识空间内检索节点与文档，支持作者、类型、时间过滤与排序。
func (s *KnowledgeService) SearchSpace(ownerID, projectID uuid.UUID, f KnowledgeSearchFilter) ([]KnowledgeSearchHit, error) {
	return s.searchSpaceExtended(ownerID, &projectID, f)
}

// authorID 取作者 ID 的字符串形式，空作者返回空串。
func authorID(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

// snippet 截取文档里命中关键词的一段文字。
func (s *KnowledgeService) snippet(ownerID, docID uuid.UUID, query string) string {
	var doc model.CanvasDocument
	if err := s.db.Select("content_text").Where("id = ? AND owner_user_id = ?", docID, ownerID).
		First(&doc).Error; err != nil {
		return ""
	}
	text := strings.TrimSpace(stripHTML(doc.ContentText))
	if text == "" {
		return ""
	}
	if query == "" {
		return truncateRunes(text, 120)
	}
	if idx := strings.Index(strings.ToLower(text), strings.ToLower(query)); idx >= 0 {
		start := idx - 40
		if start < 0 {
			start = 0
		}
		return truncateRunes(text[start:], 160)
	}
	return truncateRunes(text, 120)
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	runes := []rune(s)
	return string(runes[:n]) + "…"
}

// maskShareToken 脱敏分享 token：保留前 6 位，其余以 * 代替。
func maskShareToken(token string) string {
	if len(token) <= 6 {
		return "***"
	}
	return token[:6] + strings.Repeat("*", 8)
}

// ---------------------------------------------------------------- 在线协作状态（presence）

// PresenceUser 是当前在线的协作者。
type PresenceUser struct {
	UserID  string `json:"userId"`
	Name    string `json:"name"`
	Avatar  string `json:"avatar"`
	Editing bool   `json:"editing"`
	// Cursor 是协作者当前编辑位置（段落标题 + 字符偏移），前端用来「跳到 TA 的位置」。
	Cursor   string    `json:"cursor"`
	LastSeen time.Time `json:"lastSeen"`
}

type presenceEntry struct {
	userID   uuid.UUID
	docID    uuid.UUID
	name     string
	avatar   string
	editing  bool
	cursor   string
	lastSeen time.Time
}

// PresenceRegistry 是进程内的在线状态表。
//
// 有意做成内存态：在线状态是瞬时信息，落库只会制造垃圾行；
// 多实例部署时换成 Redis 即可，接口不变。
type PresenceRegistry struct {
	mu      sync.Mutex
	entries map[uuid.UUID]map[uuid.UUID]presenceEntry
}

// NewPresenceRegistry 建一个空的在线状态表。
func NewPresenceRegistry() *PresenceRegistry {
	return &PresenceRegistry{entries: map[uuid.UUID]map[uuid.UUID]presenceEntry{}}
}

// Heartbeat 上报一次在线状态。
func (r *PresenceRegistry) Heartbeat(docID, userID uuid.UUID, name, avatar string, editing bool, cursor string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.entries[docID] == nil {
		r.entries[docID] = map[uuid.UUID]presenceEntry{}
	}
	r.entries[docID][userID] = presenceEntry{
		userID: userID, docID: docID, name: name, avatar: avatar,
		editing: editing, cursor: cursor, lastSeen: time.Now().UTC(),
	}
}

// List 返回文档当前在线的人（超过 TTL 的自动剔除）。
func (r *PresenceRegistry) List(docID uuid.UUID) []PresenceUser {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []PresenceUser{}
	for userID, entry := range r.entries[docID] {
		if time.Since(entry.lastSeen) > presenceTTL {
			delete(r.entries[docID], userID)
			continue
		}
		out = append(out, PresenceUser{
			UserID:   userID.String(),
			Name:     entry.name,
			Avatar:   entry.avatar,
			Editing:  entry.editing,
			Cursor:   entry.cursor,
			LastSeen: entry.lastSeen,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out
}

// PresenceHeartbeat 上报当前用户的在线状态与编辑位置。
func (s *KnowledgeService) PresenceHeartbeat(ownerID, docID uuid.UUID, editing bool, cursor string) error {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return err
	}
	var user model.User
	if err := s.db.Select("display_name", "email", "avatar_url").Where("id = ?", ownerID).
		First(&user).Error; err != nil {
		return err
	}
	name := user.DisplayName
	if name == "" {
		name = user.Email
	}
	s.presence.Heartbeat(docID, ownerID, name, user.AvatarURL, editing, cursor)
	return nil
}

// PresenceList 返回文档当前在线的协作者。
func (s *KnowledgeService) PresenceList(ownerID, docID uuid.UUID) ([]PresenceUser, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	return s.presence.List(docID), nil
}

// ---------------------------------------------------------------- 本地智能：摘要 / 标签 / 问答

// SummarizeDoc 用标题层级与首句生成摘要（不依赖外部大模型）。
func (s *KnowledgeService) SummarizeDoc(ownerID, docID uuid.UUID) (string, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(stripHTML(doc.ContentText))
	if text == "" {
		return "", nil
	}
	sentences := splitSentences(text)
	summary := ""
	for _, sentence := range sentences {
		if len([]rune(summary))+len([]rune(sentence)) > 180 {
			break
		}
		if summary != "" {
			summary += " "
		}
		summary += sentence
	}
	return summary, nil
}

// SuggestTags 从标题与正文里抽取高频词作为标签建议。
func (s *KnowledgeService) SuggestTags(ownerID, docID uuid.UUID) ([]string, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	return extractKeywords(doc.Title+" "+stripHTML(doc.ContentText), 8), nil
}

// KnowledgeAnswer 是问答命中的一条结果。
type KnowledgeAnswer struct {
	DocumentID string  `json:"documentId"`
	Title      string  `json:"title"`
	Snippet    string  `json:"snippet"`
	Score      float64 `json:"score"`
	// Source 是出处（文档标题 + 命中片段），Confidence 是置信度（0-1）。
	Source     string  `json:"source"`
	Confidence float64 `json:"confidence"`
}

// AskSpace 在知识空间内做关键词检索问答，返回带出处的片段。
//
// shortcut: 目前是本地关键词检索，不做语义理解；需要语义问答时接 LLM 检索层。
func (s *KnowledgeService) AskSpace(ownerID, projectID uuid.UUID, question string, limit int) ([]KnowledgeAnswer, error) {
	return s.askSpace(ownerID, &projectID, question, limit)
}

// askSpace 是问答实现：projectID 为 nil 时跨本人全部项目检索。
func (s *KnowledgeService) askSpace(ownerID uuid.UUID, projectID *uuid.UUID, question string, limit int) ([]KnowledgeAnswer, error) {
	if projectID != nil {
		if err := s.assertSpaceAccess(ownerID, *projectID, SpaceRoleViewer); err != nil {
			return nil, err
		}
	}
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	terms := tokenize(question)
	if len(terms) == 0 {
		return []KnowledgeAnswer{}, nil
	}
	q := s.db.Where("owner_user_id = ? AND canvas_type = 'doc'", ownerID)
	if projectID != nil {
		q = q.Where("project_id = ?", *projectID)
	} else {
		q = q.Where("project_id IN (SELECT id FROM core_projects WHERE owner_user_id = ?)", ownerID)
	}
	var docs []model.CanvasDocument
	if err := q.Find(&docs).Error; err != nil {
		return nil, err
	}
	answers := make([]KnowledgeAnswer, 0, limit)
	maxScore := 0.0
	for _, doc := range docs {
		haystack := strings.ToLower(doc.Title + " " + stripHTML(doc.ContentText))
		score := 0.0
		for _, term := range terms {
			score += float64(strings.Count(haystack, term))
		}
		if score == 0 {
			continue
		}
		if score > maxScore {
			maxScore = score
		}
		answers = append(answers, KnowledgeAnswer{
			DocumentID: doc.ID.String(),
			Title:      doc.Title,
			Snippet:    s.snippet(ownerID, doc.ID, terms[0]),
			Score:      score,
			Source:     doc.Title,
		})
	}
	sort.Slice(answers, func(i, j int) bool { return answers[i].Score > answers[j].Score })
	if len(answers) > limit {
		answers = answers[:limit]
	}
	if maxScore > 0 {
		for i := range answers {
			answers[i].Confidence = answers[i].Score / maxScore
		}
	}
	// 向量召回作为第二层：关键词没命中或命中太少时，语义相似的结果补进来。
	answers = s.mergeSemanticAnswers(ownerID, projectID, question, answers, limit)
	return answers, nil
}

// mergeSemanticAnswers 把向量召回结果并进关键词答案。
//
// 关键词命中为 0 时这一层才是主力；两边都命中时按文档去重，
// 关键词结果的排序优先。
func (s *KnowledgeService) mergeSemanticAnswers(ownerID uuid.UUID, projectID *uuid.UUID, question string, answers []KnowledgeAnswer, limit int) []KnowledgeAnswer {
	if projectID == nil {
		return answers
	}
	hits, err := s.SemanticSearch(context.Background(), ownerID, *projectID, question, limit)
	if err != nil || len(hits) == 0 {
		return answers
	}
	seen := map[string]bool{}
	for _, a := range answers {
		seen[a.DocumentID] = true
	}
	for _, hit := range hits {
		if seen[hit.DocumentID] {
			continue
		}
		seen[hit.DocumentID] = true
		answers = append(answers, KnowledgeAnswer{
			DocumentID: hit.DocumentID,
			Title:      hit.Title,
			Snippet:    hit.Snippet,
			Score:      hit.Score,
			Source:     hit.Title,
			Confidence: hit.Score,
		})
	}
	sort.SliceStable(answers, func(i, j int) bool { return answers[i].Score > answers[j].Score })
	if len(answers) > limit {
		answers = answers[:limit]
	}
	return answers
}

// splitSentences 按中文/英文句号切句。
func splitSentences(text string) []string {
	re := regexp.MustCompile(`[^。！？.!?\n]+[。！？.!?]?`)
	parts := re.FindAllString(text, -1)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

var stopWords = map[string]bool{
	"的": true, "了": true, "和": true, "是": true, "在": true, "我们": true,
	"可以": true, "这个": true, "一个": true, "the": true, "and": true, "for": true,
	"with": true, "that": true, "this": true, "from": true,
}

// tokenize 把问题拆成检索词：英文按单词，中文按二元组。
func tokenize(text string) []string {
	lower := strings.ToLower(text)
	terms := []string{}
	for _, word := range strings.FieldsFunc(lower, func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r > 0x4e00 && r < 0x9fff)
	}) {
		if len(word) >= 2 && !stopWords[word] {
			terms = append(terms, word)
		}
	}
	runes := []rune(lower)
	for i := 0; i+1 < len(runes); i++ {
		if runes[i] > 0x4e00 && runes[i] < 0x9fff && runes[i+1] > 0x4e00 && runes[i+1] < 0x9fff {
			term := string(runes[i : i+2])
			if !stopWords[term] {
				terms = append(terms, term)
			}
		}
	}
	return terms
}

// extractKeywords 抽取高频词（英文单词 + 中文二元组）。
func extractKeywords(text string, limit int) []string {
	counts := map[string]int{}
	for _, term := range tokenize(text) {
		if stopWords[term] || len([]rune(term)) < 2 {
			continue
		}
		counts[term]++
	}
	type kv struct {
		word string
		n    int
	}
	list := make([]kv, 0, len(counts))
	for word, n := range counts {
		list = append(list, kv{word, n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].n != list[j].n {
			return list[i].n > list[j].n
		}
		return list[i].word < list[j].word
	})
	out := []string{}
	for i, item := range list {
		if i >= limit {
			break
		}
		out = append(out, item.word)
	}
	return out
}
