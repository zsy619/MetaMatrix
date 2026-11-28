package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	// AuditActionSave 是单人保存管线成功写入 current_data。
	AuditActionSave = "save"
	// AuditActionRestore 是从修订快照恢复并覆盖 current_data。
	AuditActionRestore = "restore"
	// AuditActionCollabSave 是协同双写 HTML 后，在抖动抽取点追加的一条文档级记录。
	AuditActionCollabSave = "collab_save"

	maxAuditBlockIDs = 32
	maxAuditDetail   = 1024
)

var dataBlockIDAttr = regexp.MustCompile(`(?i)data-block-id\s*=\s*["']([^"']+)["']`)

// DocAuditService 提供文档审计的查询。写入走 appendDocAudit，嵌在保存/双写事务里。
type DocAuditService struct {
	db *gorm.DB
}

func NewDocAuditService(db *gorm.DB) *DocAuditService {
	return &DocAuditService{db: db}
}

// List 按文档返回审计记录，新的在前。权限与知识库文档一致：所有者或空间成员（含 viewer）可读；
// 无权限视为文档不存在。
func (s *DocAuditService) List(actorID, docID uuid.UUID, limit int) ([]model.DocAuditEvent, error) {
	if err := authorizeKnowledgeDocRead(s.db, actorID, docID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []model.DocAuditEvent
	if err := s.db.Where("document_id = ?", docID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// authorizeKnowledgeDocRead 与协同进房的读权限对齐：所有者或项目空间成员可读。
func authorizeKnowledgeDocRead(db *gorm.DB, userID, docID uuid.UUID) error {
	var doc model.CanvasDocument
	if err := db.Where("id = ?", docID).First(&doc).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDocumentNotFound
		}
		return err
	}
	if doc.OwnerUserID == userID {
		return nil
	}
	if doc.ProjectID == nil {
		return ErrDocumentNotFound
	}
	if lookupSpaceRole(db, userID, *doc.ProjectID) == "" {
		return ErrDocumentNotFound
	}
	return nil
}

// appendDocAudit 写入一条文档级审计。同一份 payload 只落一行，涉及的 data-block-id 写入 BlockID / Detail，
// 不为每个块各写一行。
func appendDocAudit(tx *gorm.DB, userID, docID uuid.UUID, action string, payload []byte) error {
	blockID, detail := blockIDsFromPayload(payload)
	row := model.DocAuditEvent{
		ID:         uuid.New(),
		DocumentID: docID,
		UserID:     userID,
		Action:     action,
		BlockID:    blockID,
		Detail:     detail,
		CreatedAt:  time.Now().UTC(),
	}
	return tx.Create(&row).Error
}

func blockIDsFromPayload(payload []byte) (blockID, detail string) {
	ids := uniqueBlockIDs(htmlFromPayload(payload))
	if len(ids) == 0 {
		return "", ""
	}
	blockID = ids[0]
	if len(ids) == 1 {
		return blockID, ""
	}
	if len(ids) > maxAuditBlockIDs {
		ids = ids[:maxAuditBlockIDs]
	}
	detail = strings.Join(ids, ",")
	if len(detail) > maxAuditDetail {
		detail = detail[:maxAuditDetail]
	}
	return blockID, detail
}

func htmlFromPayload(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	var body struct {
		HTML string `json:"html"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return ""
	}
	return body.HTML
}

func uniqueBlockIDs(html string) []string {
	if html == "" {
		return nil
	}
	matches := dataBlockIDAttr.FindAllStringSubmatch(html, maxAuditBlockIDs)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		id := strings.TrimSpace(m[1])
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
