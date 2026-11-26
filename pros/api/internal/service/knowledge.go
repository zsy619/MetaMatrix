package service

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/ai"
	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var (
	ErrNodeNotFound   = errors.New("knowledge node not found")
	ErrNodeCycle      = errors.New("knowledge node would form a cycle")
	ErrProjectMissing = errors.New("project not found")
)

const (
	maxNodeTitleRunes = 200
	maxNodeIconRunes  = 16
	maxTreeDepth      = 8
)

type KnowledgeService struct {
	db *gorm.DB
	// presence 是在线协作状态存储：数据库为主、内存兜底（多实例共享同一份状态）。
	presence PresenceStore
	// ai 是可选的外部模型客户端：没配置时所有智能化能力走本地降级。
	ai *ai.Client
	// 飞书开放平台配置：知识空间导入与群机器人通知。
	feishuAppID     string
	feishuAppSecret string
	feishuWebhook   string
	feishuBaseURL   string
	// mail 用于评论通知。未注入或 SMTP 不齐时邮件路跳过，站内通知仍写。
	mail mail.Sender
}

func NewKnowledgeService(db *gorm.DB) *KnowledgeService {
	return &KnowledgeService{db: db, presence: newHybridPresenceStore(db)}
}

// PresenceStore 返回知识库正在使用的 presence 存储，供正文协同通道复用同一实例。
func (s *KnowledgeService) PresenceStore() PresenceStore {
	return s.presence
}

type KnowledgeNodeInput struct {
	ParentID   *uuid.UUID
	NodeType   string // folder | doc
	Title      string
	Icon       string
	DocumentID *uuid.UUID
	// Pinyin 是标题的拼音与首字母（前端用 pinyin-pro 生成）：中文按拼音检索。
	Pinyin string
}

type KnowledgeMoveInput struct {
	ParentID  *uuid.UUID
	SortOrder *int
}

func validateNodeTitle(s string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" || utf8.RuneCountInString(t) > maxNodeTitleRunes {
		return "", ErrValidation
	}
	return t, nil
}

func validateNodeType(t string) string {
	t = strings.TrimSpace(t)
	switch t {
	case "folder", "doc", "canvas", "note", "sheet", "mindmap", "attachment":
		return t
	default:
		return "doc"
	}
}

func defaultNodeIcon(nodeType string) string {
	switch nodeType {
	case "folder":
		return "📁"
	case "canvas":
		return "🖼️"
	case "note":
		return "📌"
	case "sheet":
		return "📊"
	case "mindmap":
		return "🧠"
	case "attachment":
		return "📎"
	default:
		return "📄"
	}
}

// cleanNodeIcon 归一化图标：空串回落到类型默认值；超出列宽 varchar(16) 的直接拒绝，
// 否则要等落库时才以 500 的形式报出来。
func cleanNodeIcon(raw, nodeType string) (string, error) {
	icon := strings.TrimSpace(raw)
	if icon == "" {
		return defaultNodeIcon(nodeType), nil
	}
	if utf8.RuneCountInString(icon) > maxNodeIconRunes {
		return "", ErrValidation
	}
	return icon, nil
}

// Tree 返回一个项目下的全部目录节点，前端一次性构建整棵树。
// 同时把文档的基本信息（title/canvasType/updatedAt）拼到节点上，避免前端二次请求。
func (s *KnowledgeService) Tree(ownerID, projectID uuid.UUID) ([]model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var nodes []model.KnowledgeNode
	// 回收站里的节点不在默认目录里：软删除后仍可从回收站恢复。
	err := s.db.Where("project_id = ? AND trashed_at IS NULL AND archived_at IS NULL", projectID).
		Order("parent_id NULLS FIRST").
		Order("sort_order ASC").
		Order("id ASC").
		Find(&nodes).Error
	if err != nil {
		return nil, err
	}
	// 私有节点对未授权用户不可见（节点级权限）。
	visible := nodes[:0]
	for _, n := range nodes {
		if s.nodeVisible(ownerID, n) {
			visible = append(visible, n)
		}
	}
	return s.overlayDocTitles(ownerID, visible)
}

// overlayDocTitles 用文档标题覆盖文档节点的标题：标题只有文档这一个数据源，
// 在编辑器里改名后目录树不需要任何写时同步。
func (s *KnowledgeService) overlayDocTitles(ownerID uuid.UUID, nodes []model.KnowledgeNode) ([]model.KnowledgeNode, error) {
	docIDs := make([]uuid.UUID, 0, len(nodes))
	for _, node := range nodes {
		if node.DocumentID != nil {
			docIDs = append(docIDs, *node.DocumentID)
		}
	}
	if len(docIDs) == 0 {
		return nodes, nil
	}
	var docs []model.CanvasDocument
	if err := s.db.Select("id", "title", "canvas_type", "template_id").
		Where("id IN ? AND owner_user_id = ?", docIDs, ownerID).
		Find(&docs).Error; err != nil {
		return nil, err
	}
	titles := make(map[uuid.UUID]string, len(docs))
	canvasTypes := make(map[uuid.UUID]string, len(docs))
	templateIDs := make(map[uuid.UUID]string, len(docs))
	for _, doc := range docs {
		titles[doc.ID] = doc.Title
		canvasTypes[doc.ID] = doc.CanvasType
		if doc.TemplateID != nil {
			templateIDs[doc.ID] = *doc.TemplateID
		}
	}
	for index := range nodes {
		if nodes[index].DocumentID == nil {
			continue
		}
		if title, ok := titles[*nodes[index].DocumentID]; ok {
			nodes[index].Title = title
		}
		nodes[index].DocumentCanvasType = canvasTypes[*nodes[index].DocumentID]
		nodes[index].DocumentTemplateID = templateIDs[*nodes[index].DocumentID]
	}
	return nodes, nil
}

// Create 新建节点。doc 类型可同时带 documentId 指向一篇已有文档；
// 不带 documentId 时由调用方先建文档再建节点。
func (s *KnowledgeService) Create(ownerID, projectID uuid.UUID, in KnowledgeNodeInput) (*model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	title, err := validateNodeTitle(in.Title)
	if err != nil {
		return nil, err
	}
	nodeType := validateNodeType(in.NodeType)
	icon, err := cleanNodeIcon(in.Icon, nodeType)
	if err != nil {
		return nil, err
	}

	if in.ParentID != nil {
		if err := s.assertParentCycle(ownerID, projectID, in.ParentID, nil); err != nil {
			return nil, err
		}
	}

	// 新节点排在同级的末尾：取同级 max(sort_order)+1。
	var maxOrder int
	if err := s.db.Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND parent_id IS NOT DISTINCT FROM ?", projectID, in.ParentID).
		Select("COALESCE(MAX(sort_order), -1)").Scan(&maxOrder).Error; err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	node := &model.KnowledgeNode{
		ID:         uuid.New(),
		ProjectID:  projectID,
		CreatedBy:  &ownerID,
		ParentID:   in.ParentID,
		NodeType:   nodeType,
		DocumentID: in.DocumentID,
		Title:      title,
		Pinyin:     strings.TrimSpace(in.Pinyin),
		SortOrder:  maxOrder + 1,
		Icon:       icon,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.db.Create(node).Error; err != nil {
		return nil, err
	}
	return node, nil
}

// Update 重命名 / 改图标 / 换文档。
func (s *KnowledgeService) Update(ownerID, projectID, nodeID uuid.UUID, title *string, icon *string, documentID *uuid.UUID, pinyin *string) (*model.KnowledgeNode, error) {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	fields := map[string]interface{}{}
	if title != nil {
		clean, err := validateNodeTitle(*title)
		if err != nil {
			return nil, err
		}
		fields["title"] = clean
	}
	if icon != nil {
		clean, err := cleanNodeIcon(*icon, node.NodeType)
		if err != nil {
			return nil, err
		}
		fields["icon"] = clean
	}
	if documentID != nil {
		fields["document_id"] = *documentID
	}
	if pinyin != nil {
		clean := strings.TrimSpace(*pinyin)
		if utf8.RuneCountInString(clean) > 255 {
			return nil, ErrValidation
		}
		fields["pinyin"] = clean
	}
	if len(fields) == 0 {
		return node, nil
	}
	now := time.Now().UTC()
	fields["updated_at"] = now
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// 文档节点改名要落到文档上，否则目录树读回来的仍是文档的旧标题。
		if newTitle, renamed := fields["title"]; renamed && node.DocumentID != nil {
			if err := tx.Model(&model.CanvasDocument{}).
				Where("id = ? AND owner_user_id = ?", *node.DocumentID, ownerID).
				Updates(map[string]interface{}{"title": newTitle, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.KnowledgeNode{}).Where("id = ?", nodeID).Updates(fields).Error
	})
	if err != nil {
		return nil, err
	}
	return s.getWritableNode(ownerID, projectID, nodeID)
}

// Move 移动节点 / 调整排序。parentId=nil 表示移到根级。
// 会检查环：不能把自己移到自己的子孙下面。
func (s *KnowledgeService) Move(ownerID, projectID, nodeID uuid.UUID, in KnowledgeMoveInput) (*model.KnowledgeNode, error) {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	if in.ParentID != nil {
		if *in.ParentID == nodeID {
			return nil, ErrNodeCycle
		}
		if err := s.assertParentCycle(ownerID, projectID, in.ParentID, &nodeID); err != nil {
			return nil, err
		}
	}
	fields := map[string]interface{}{}
	if in.ParentID != nil || (in.ParentID == nil && hasParentColumn(node)) {
		// 显式传入 nil 也允许：表示移到根级。
		fields["parent_id"] = in.ParentID
	}
	if in.SortOrder != nil {
		fields["sort_order"] = *in.SortOrder
	}
	if len(fields) == 0 {
		return node, nil
	}
	fields["updated_at"] = time.Now().UTC()
	if err := s.db.Model(&model.KnowledgeNode{}).Where("id = ?", nodeID).Updates(fields).Error; err != nil {
		return nil, err
	}
	return s.getWritableNode(ownerID, projectID, nodeID)
}

func hasParentColumn(node *model.KnowledgeNode) bool {
	return node.ParentID != nil
}

// Reorder 批量更新一组同级节点的排序。
// 入参是节点 id 列表，按列表顺序赋 sort_order。
func (s *KnowledgeService) Reorder(ownerID, projectID uuid.UUID, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return err
	}
	now := time.Now().UTC()
	return s.db.Transaction(func(tx *gorm.DB) error {
		for i, id := range ids {
			if err := tx.Model(&model.KnowledgeNode{}).
				Where("id = ? AND project_id = ?", id, projectID).
				Updates(map[string]interface{}{"sort_order": i, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// Delete 删节点并级联删它下面的全部子节点；只删节点，不删文档本身。
func (s *KnowledgeService) Delete(ownerID, projectID, nodeID uuid.UUID) error {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 文档下面也能挂文档，所以不分类型都要带走子孙，否则它们会变成没有入口的孤儿。
		descendants, err := s.collectDescendants(tx, projectID, node.ID)
		if err != nil {
			return err
		}
		return tx.Where("id IN ? AND project_id = ?", append(descendants, node.ID), projectID).
			Delete(&model.KnowledgeNode{}).Error
	})
}

func (s *KnowledgeService) collectDescendants(tx *gorm.DB, projectID, nodeID uuid.UUID) ([]uuid.UUID, error) {
	var out []uuid.UUID
	queue := []uuid.UUID{nodeID}
	for len(queue) > 0 {
		head := queue[0]
		queue = queue[1:]
		var kids []uuid.UUID
		if err := tx.Model(&model.KnowledgeNode{}).
			Where("project_id = ? AND parent_id = ?", projectID, head).
			Pluck("id", &kids).Error; err != nil {
			return nil, err
		}
		for _, k := range kids {
			out = append(out, k)
			queue = append(queue, k)
		}
		if len(out) > 5000 {
			return nil, errors.New("knowledge tree too deep to delete")
		}
	}
	return out, nil
}

func (s *KnowledgeService) getOwnedNode(ownerID, projectID, nodeID uuid.UUID) (*model.KnowledgeNode, error) {
	var node model.KnowledgeNode
	err := s.db.Where("id = ? AND project_id = ?", nodeID, projectID).First(&node).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNodeNotFound
		}
		return nil, err
	}
	// 校验项目归属：项目不属于该用户时整个树都不可见。
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	return &node, nil
}

// getWritableNode 取节点并要求空间编辑权限。
//
// 读路径用 getOwnedNode（空间成员可读），写路径必须走这里，
// 否则 viewer 角色就能改节点。
func (s *KnowledgeService) getWritableNode(ownerID, projectID, nodeID uuid.UUID) (*model.KnowledgeNode, error) {
	node, err := s.getOwnedNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *KnowledgeService) assertProjectOwned(ownerID, projectID uuid.UUID) error {
	var count int64
	if err := s.db.Model(&model.Project{}).
		Where("id = ? AND owner_user_id = ?", projectID, ownerID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrProjectMissing
	}
	return nil
}

// assertParentCycle 检查把一个节点移到 parentID 下是否会形成环：
// parentID 不能是节点自己（调用方已拦），也不能是节点的子孙。
// nodeID=nil 时只检查 parentID 本身存在于该项目内。
func (s *KnowledgeService) assertParentCycle(ownerID, projectID uuid.UUID, parentID, nodeID *uuid.UUID) error {
	var parent model.KnowledgeNode
	if err := s.db.Where("id = ? AND project_id = ?", parentID, projectID).First(&parent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNodeNotFound
		}
		return err
	}
	if nodeID == nil {
		return nil
	}
	// 向上查祖先链，如果中途碰到 nodeID 就说明会成环。
	cursor := &parent
	depth := 0
	for cursor.ParentID != nil {
		if *cursor.ParentID == *nodeID {
			return ErrNodeCycle
		}
		var ancestor model.KnowledgeNode
		if err := s.db.Where("id = ? AND project_id = ?", *cursor.ParentID, projectID).First(&ancestor).Error; err != nil {
			break
		}
		cursor = &ancestor
		depth++
		if depth > maxTreeDepth {
			return errors.New("knowledge tree too deep")
		}
	}
	return nil
}

// CreateDocWithNode 一步建文档 + 挂节点。
// 文档 canvasType="doc"，current_data 是 TipTap 空 doc。
func (s *KnowledgeService) CreateDocWithNode(ownerID, projectID uuid.UUID, parentID *uuid.UUID, title string, icon string) (*model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	cleanTitle, err := validateNodeTitle(title)
	if err != nil {
		return nil, err
	}
	// 先校验图标再建文档：否则节点创建失败时会留下一篇没有入口的文档。
	nodeIcon, err := cleanNodeIcon(icon, "doc")
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	docID := uuid.New()
	revID := uuid.New()
	emptyDoc := datatypes.JSON([]byte(`{"type":"doc","content":[]}`))
	hash := hashPayload([]byte(`{"type":"doc","content":[]}`))

	doc := &model.CanvasDocument{
		ID:             docID,
		OwnerUserID:    ownerID,
		CanvasType:     "doc",
		Title:          cleanTitle,
		SchemaVersion:  1,
		SaveVersion:    1,
		CurrentData:    emptyDoc,
		ContentText:    "",
		HeadRevisionID: &revID,
		ProjectID:      &projectID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	rev := &model.CanvasRevision{
		ID:           revID,
		DocumentID:   docID,
		RevisionType: "snapshot",
		Payload:      emptyDoc,
		AuthorUserID: &ownerID,
		Label:        ptrString("initial"),
		ContentHash:  &hash,
		CreatedAt:    now,
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(doc).Error; err != nil {
			return err
		}
		if err := tx.Create(rev).Error; err != nil {
			return err
		}
		// 抽取层：空文档没有内容块，content_text 已是空串。
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.Create(ownerID, projectID, KnowledgeNodeInput{
		ParentID:   parentID,
		NodeType:   "doc",
		Title:      cleanTitle,
		Icon:       nodeIcon,
		DocumentID: &docID,
	})
}

func ptrString(s string) *string { return &s }
