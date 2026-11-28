package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 7.0：结构化内容（思维导图 / 多维表格）的分享链接。
//
// 分享面板与文档分享完全一致（权限 / 口令 / 有效期 / 允许复制 / 白名单），
// 差别只在分享页的渲染方式：文档下发 HTML，导图与表格下发结构化 JSON。

// shareKindForNode 把目录节点类型映射成分享内容类型。
//
// 画布节点带 documentId，走文档分享路径（分享对象仍是画布文档）；
// 导图与表格没有文档，单独挂在节点上。
func shareKindForNode(node *model.KnowledgeNode) string {
	switch node.NodeType {
	case "mindmap":
		return "mindmap"
	case "sheet":
		return "sheet"
	default:
		return ""
	}
}

// CreateShareForNode 给知识库节点创建分享链接（导图 / 表格）。
func (s *KnowledgeService) CreateShareForNode(ownerID, projectID, nodeID uuid.UUID, in CreateShareInput) (*model.KnowledgeShare, error) {
	node, err := s.getWritableNode(ownerID, projectID, nodeID)
	if err != nil {
		return nil, err
	}
	kind := shareKindForNode(node)
	if kind == "" {
		return nil, ErrValidation
	}
	role := strings.TrimSpace(in.Role)
	switch role {
	case "", "view", "comment", "edit":
		// 结构化内容没有在线编辑与评论落地，统一按只读处理。
		role = "view"
	default:
		return nil, ErrValidation
	}
	share := &model.KnowledgeShare{
		ID:        uuid.New(),
		NodeID:    &nodeID,
		ProjectID: projectID,
		Token:     uuid.NewString() + uuid.NewString()[:8],
		Role:      role,
		Kind:      kind,
		CreatedBy: ownerID,
		ExpiresAt: in.ExpiresAt,
		AllowCopy: in.AllowCopy,
		CreatedAt: time.Now().UTC(),
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

// ListNodeShares 返回知识库节点的分享链接。
func (s *KnowledgeService) ListNodeShares(ownerID, projectID, nodeID uuid.UUID) ([]model.KnowledgeShare, error) {
	if _, err := s.getOwnedNode(ownerID, projectID, nodeID); err != nil {
		return nil, err
	}
	var rows []model.KnowledgeShare
	err := s.db.Where("node_id = ?", nodeID).Order("created_at DESC").Find(&rows).Error
	for i := range rows {
		rows[i].HasPassword = rows[i].PasswordHash != ""
	}
	return rows, err
}

// resolveNodeShare 取导图 / 表格内容（公开访问，不需要登录态）。
//
// unlocked 表示口令已校验通过：没解锁时只回「需要口令」标记，不泄露正文。
func (s *KnowledgeService) resolveNodeShare(share *model.KnowledgeShare, unlocked bool) (*SharedDoc, error) {
	if share.NodeID == nil {
		return nil, ErrDocumentNotFound
	}
	var node model.KnowledgeNode
	if err := s.db.Where("id = ?", share.NodeID).First(&node).Error; err != nil {
		return nil, ErrDocumentNotFound
	}
	// 有口令的分享：没有口令就不返回正文，只提示需要口令。
	if share.PasswordHash != "" && !unlocked {
		return &SharedDoc{
			Token:            share.Token,
			Role:             share.Role,
			Kind:             shareKind(share),
			Title:            node.Title,
			ExpiresAt:        share.ExpiresAt,
			AllowCopy:        share.AllowCopy,
			RequiresPassword: true,
		}, nil
	}
	var row model.KnowledgeNodeData
	if err := s.db.Where("node_id = ?", *share.NodeID).First(&row).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		// 节点还没保存过内容：下发默认结构，分享页展示空表格而不是 404。
		row = model.KnowledgeNodeData{
			NodeID: *share.NodeID,
			Kind:   shareKindForNode(&node),
			Data:   datatypes.JSON(defaultNodeData(shareKindForNode(&node))),
		}
	}
	return &SharedDoc{
		Token:     share.Token,
		Role:      share.Role,
		Kind:      shareKind(share),
		Title:     node.Title,
		Data:      json.RawMessage(row.Data),
		ExpiresAt: share.ExpiresAt,
		AllowCopy: share.AllowCopy,
	}, nil
}
