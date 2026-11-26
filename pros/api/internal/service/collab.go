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

const (
	collabOpUpdate   = "update"
	collabOpSnapshot = "snapshot"
	// 单条协同增量上限，与旧 CRDT 旁路一致。
	maxCollabPayload = 4 << 20
)

// CollabOperationInput 是一次要落库的协同操作。
// HTML 可选：有值时同时把 current_data 导出更新（A2 双写），方便检索与回滚。
type CollabOperationInput struct {
	Kind    string
	Payload []byte
	HTML    string
}

// CollabOperation 是对外暴露的一条操作日志。
type CollabOperation struct {
	Seq          int64     `json:"seq"`
	Kind         string    `json:"kind"`
	Payload      []byte    `json:"payload"`
	AuthorUserID uuid.UUID `json:"authorUserId"`
	SaveVersion  int64     `json:"saveVersion"`
	CreatedAt    time.Time `json:"createdAt"`
}

// CollabService 负责正文协同：操作日志、current_data 双写、presence。
// presence 复用知识库既有 PresenceStore，存储实现（内存+表 / 以后换 Redis）对调用方透明。
type CollabService struct {
	db       *gorm.DB
	docs     *DocumentsService
	presence PresenceStore
}

// NewCollabService 构造协同服务。presence 必须与知识库共用同一实例，避免两套在线状态。
func NewCollabService(db *gorm.DB, presence PresenceStore) *CollabService {
	if presence == nil {
		presence = newHybridPresenceStore(db)
	}
	return &CollabService{
		db:       db,
		docs:     NewDocumentsService(db),
		presence: presence,
	}
}

// Presence 返回当前使用的 presence 存储，便于测试断言接口形状而未写死实现。
func (s *CollabService) Presence() PresenceStore {
	return s.presence
}

// Append 把一条协同增量写入 doc_operation。
// 调用方提供 HTML 时，同步更新 current_data 并推进 save_version（不走 expectedSaveVersion CAS，
// 避免与实时通道抢锁）；未提供 HTML 时只写操作日志，current_data 保持不变。
func (s *CollabService) Append(ownerID, docID, authorID uuid.UUID, in CollabOperationInput) (*CollabOperation, error) {
	if len(in.Payload) == 0 || len(in.Payload) > maxCollabPayload {
		return nil, ErrValidation
	}
	kind := strings.TrimSpace(in.Kind)
	if kind != collabOpUpdate && kind != collabOpSnapshot {
		kind = collabOpUpdate
	}

	var out *CollabOperation
	err := s.db.Transaction(func(tx *gorm.DB) error {
		doc, err := getOwnedDoc(tx, ownerID, docID)
		if err != nil {
			return err
		}

		saveVersion := int64(0)
		if strings.TrimSpace(in.HTML) != "" {
			data, err := currentDataWithHTML(doc.CurrentData, in.HTML)
			if err != nil {
				return err
			}
			if err := bumpSaveVersion(tx, ownerID, docID, nil, map[string]interface{}{
				"current_data": data,
			}); err != nil {
				return err
			}
			if err := tx.Model(&model.CanvasDocument{}).
				Select("save_version").
				Where("id = ? AND owner_user_id = ?", docID, ownerID).
				Scan(&saveVersion).Error; err != nil {
				return err
			}
		}

		var row model.DocOperation
		var lastErr error
		for attempt := 0; attempt < 5; attempt++ {
			var lastSeq int64
			if err := tx.Model(&model.DocOperation{}).
				Where("document_id = ?", docID).
				Select("COALESCE(MAX(seq), 0)").
				Scan(&lastSeq).Error; err != nil {
				return err
			}
			row = model.DocOperation{
				ID:           uuid.New(),
				DocumentID:   docID,
				Seq:          lastSeq + 1,
				Kind:         kind,
				Payload:      in.Payload,
				AuthorUserID: authorID,
				SaveVersion:  saveVersion,
				CreatedAt:    time.Now().UTC(),
			}
			lastErr = tx.Create(&row).Error
			if lastErr == nil {
				break
			}
			// 并发下 Seq 可能撞唯一约束，重取最大值再写。
			if !isUniqueConflict(lastErr) {
				return lastErr
			}
		}
		if lastErr != nil {
			return lastErr
		}
		out = &CollabOperation{
			Seq:          row.Seq,
			Kind:         row.Kind,
			Payload:      row.Payload,
			AuthorUserID: row.AuthorUserID,
			SaveVersion:  row.SaveVersion,
			CreatedAt:    row.CreatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// List 读取 after 之后的协同操作，按 Seq 升序。
func (s *CollabService) List(ownerID, docID uuid.UUID, after int64, limit int) ([]CollabOperation, error) {
	if _, err := s.docs.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var rows []model.DocOperation
	if err := s.db.Where("document_id = ? AND seq > ?", docID, after).
		Order("seq ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]CollabOperation, 0, len(rows))
	for _, r := range rows {
		out = append(out, CollabOperation{
			Seq:          r.Seq,
			Kind:         r.Kind,
			Payload:      r.Payload,
			AuthorUserID: r.AuthorUserID,
			SaveVersion:  r.SaveVersion,
			CreatedAt:    r.CreatedAt,
		})
	}
	return out, nil
}

// Heartbeat 把当前用户写入 presence 存储。存储实现可换 Redis，接口不变。
func (s *CollabService) Heartbeat(ownerID, docID uuid.UUID, editing bool, cursor string) error {
	if _, err := s.docs.GetOwned(ownerID, docID); err != nil {
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

// ListPresence 读取文档当前在线协作者。
func (s *CollabService) ListPresence(ownerID, docID uuid.UUID) ([]PresenceUser, error) {
	if _, err := s.docs.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	return s.presence.List(docID), nil
}

func getOwnedDoc(tx *gorm.DB, ownerID, docID uuid.UUID) (*model.CanvasDocument, error) {
	var doc model.CanvasDocument
	err := tx.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDocumentNotFound
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

// currentDataWithHTML 在既有 current_data 上替换 html 字段，并保证 type 存在。
// 其它字段原样保留，避免双写把文档元数据冲掉。
func currentDataWithHTML(existing datatypes.JSON, html string) (datatypes.JSON, error) {
	var m map[string]interface{}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &m); err != nil {
			m = map[string]interface{}{}
		}
	}
	if m == nil {
		m = map[string]interface{}{}
	}
	if _, ok := m["type"]; !ok {
		m["type"] = "doc"
	}
	m["html"] = html
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}

func isUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}
