package service

import (
	"encoding/json"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	collabOpUpdate   = "update"
	collabOpSnapshot = "snapshot"
	// 单条协同增量上限，与旧 CRDT 旁路一致。
	maxCollabPayload = 4 << 20
	// 双写 current_data 后，抽取与修订快照默认抖动 2s，避免每个按键全量重建块表。
	defaultDerivedDelay = 2 * time.Second
)

// ErrCollabReadOnly 表示用户可以进协同房间，但不能写入操作日志。
// 对应知识库 viewer：允许读文档，不允许编辑。
var ErrCollabReadOnly = errors.New("collab room is read-only")

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

// CollabAccess 是某用户对一篇文档的协同房间权限。
type CollabAccess struct {
	Doc      *model.CanvasDocument
	CanWrite bool
	Role     string
}

// CollabService 负责正文协同：操作日志、current_data 双写、presence。
// presence 复用知识库既有 PresenceStore，存储实现（内存+表 / 以后换 Redis）对调用方透明。
type CollabService struct {
	db            *gorm.DB
	docs          *DocumentsService
	presence      PresenceStore
	derivedDelay  time.Duration
	derivedMu     sync.Mutex
	derivedTimers map[uuid.UUID]*time.Timer
}

// NewCollabService 构造协同服务。presence 必须与知识库共用同一实例，避免两套在线状态。
func NewCollabService(db *gorm.DB, presence PresenceStore) *CollabService {
	if presence == nil {
		presence = newHybridPresenceStore(db)
	}
	return &CollabService{
		db:            db,
		docs:          NewDocumentsService(db),
		presence:      presence,
		derivedDelay:  defaultDerivedDelay,
		derivedTimers: make(map[uuid.UUID]*time.Timer),
	}
}

// Presence 返回当前使用的 presence 存储，便于测试断言接口形状而未写死实现。
func (s *CollabService) Presence() PresenceStore {
	return s.presence
}

// Authorize 校验用户能否进入文档的协同房间。
//
// 文档所有者可写。若文档属于某个项目，则沿用知识库空间角色：
// admin / editor 可写；viewer 只读进房；无成员关系视为文档不存在，避免泄露。
// 没有 ProjectID 的文档仍只对所有者开放。
func (s *CollabService) Authorize(userID, docID uuid.UUID) (*CollabAccess, error) {
	var doc model.CanvasDocument
	if err := s.db.Where("id = ?", docID).First(&doc).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDocumentNotFound
		}
		return nil, err
	}
	if doc.OwnerUserID == userID {
		return &CollabAccess{Doc: &doc, CanWrite: true, Role: "owner"}, nil
	}
	if doc.ProjectID == nil {
		return nil, ErrDocumentNotFound
	}
	role := lookupSpaceRole(s.db, userID, *doc.ProjectID)
	if role == "" {
		return nil, ErrDocumentNotFound
	}
	if spaceRoleRank(role) >= spaceRoleRank(SpaceRoleEditor) {
		return &CollabAccess{Doc: &doc, CanWrite: true, Role: role}, nil
	}
	return &CollabAccess{Doc: &doc, CanWrite: false, Role: role}, nil
}

// Append 把一条协同增量写入 doc_operation。
// actor 必须对文档有写权限；双写 current_data 时仍按文档所有者更新行（不改 owner_user_id 条件）。
func (s *CollabService) Append(actorID, docID, authorID uuid.UUID, in CollabOperationInput) (*CollabOperation, error) {
	if len(in.Payload) == 0 || len(in.Payload) > maxCollabPayload {
		return nil, ErrValidation
	}
	kind := strings.TrimSpace(in.Kind)
	if kind != collabOpUpdate && kind != collabOpSnapshot {
		kind = collabOpUpdate
	}
	access, err := s.Authorize(actorID, docID)
	if err != nil {
		return nil, err
	}
	if !access.CanWrite {
		return nil, ErrCollabReadOnly
	}
	if authorID == uuid.Nil {
		authorID = actorID
	}

	var out *CollabOperation
	var shouldDerive bool
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var doc model.CanvasDocument
		if err := tx.Where("id = ?", docID).First(&doc).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDocumentNotFound
			}
			return err
		}

		saveVersion := int64(0)
		if strings.TrimSpace(in.HTML) != "" {
			data, err := currentDataWithHTML(doc.CurrentData, in.HTML)
			if err != nil {
				return err
			}
			// 双写必须按所有者条件更新行：成员编辑不能改 WHERE owner_user_id。
			if err := bumpSaveVersion(tx, doc.OwnerUserID, docID, nil, map[string]interface{}{
				"current_data": data,
			}); err != nil {
				return err
			}
			if err := tx.Model(&model.CanvasDocument{}).
				Select("save_version").
				Where("id = ?", docID).
				Scan(&saveVersion).Error; err != nil {
				return err
			}
			shouldDerive = true
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
	if shouldDerive {
		s.scheduleDerived(docID)
	}
	return out, nil
}

// List 读取 after 之后的协同操作，按 Seq 升序。只读进房的成员也可以拉增量。
func (s *CollabService) List(actorID, docID uuid.UUID, after int64, limit int) ([]CollabOperation, error) {
	if _, err := s.Authorize(actorID, docID); err != nil {
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

// Heartbeat 把当前用户写入 presence 存储。只读进房的成员也可以上报在线状态。
func (s *CollabService) Heartbeat(actorID, docID uuid.UUID, editing bool, cursor string) error {
	if _, err := s.Authorize(actorID, docID); err != nil {
		return err
	}
	var user model.User
	if err := s.db.Select("display_name", "email", "avatar_url").Where("id = ?", actorID).
		First(&user).Error; err != nil {
		return err
	}
	name := user.DisplayName
	if name == "" {
		name = user.Email
	}
	s.presence.Heartbeat(docID, actorID, name, user.AvatarURL, editing, cursor)
	return nil
}

// ListPresence 读取文档当前在线协作者。
func (s *CollabService) ListPresence(actorID, docID uuid.UUID) ([]PresenceUser, error) {
	if _, err := s.Authorize(actorID, docID); err != nil {
		return nil, err
	}
	return s.presence.List(docID), nil
}

// FlushDerived 立即执行抖动中的抽取与修订快照，供测试与关闭房间时收尾。
func (s *CollabService) FlushDerived(docID uuid.UUID) error {
	s.derivedMu.Lock()
	if t, ok := s.derivedTimers[docID]; ok {
		t.Stop()
		delete(s.derivedTimers, docID)
	}
	s.derivedMu.Unlock()
	return s.materializeDerived(docID)
}

func (s *CollabService) scheduleDerived(docID uuid.UUID) {
	s.derivedMu.Lock()
	defer s.derivedMu.Unlock()
	if s.derivedTimers == nil {
		s.derivedTimers = make(map[uuid.UUID]*time.Timer)
	}
	if t, ok := s.derivedTimers[docID]; ok {
		t.Stop()
	}
	delay := s.derivedDelay
	if delay < 0 {
		return
	}
	s.derivedTimers[docID] = time.AfterFunc(delay, func() {
		if err := s.materializeDerived(docID); err != nil {
			log.Printf("collab derived materialize %s: %v", docID, err)
		}
	})
}

// materializeDerived 用最新 current_data 重建检索块，并在内容相对 head 有变化时补自动修订快照。
// 不在每次 WS update 的同一事务里跑，避免按键级全删全建。
func (s *CollabService) materializeDerived(docID uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var doc model.CanvasDocument
		q := tx.Where("id = ?", docID)
		// SQLite 测试库不一定支持 FOR UPDATE；锁失败时退回普通读取。
		if err := q.Clauses(clause.Locking{Strength: "UPDATE"}).First(&doc).Error; err != nil {
			if err := tx.Where("id = ?", docID).First(&doc).Error; err != nil {
				return err
			}
		}
		now := time.Now().UTC()
		if _, err := syncExtract(tx, doc.ID, doc.CurrentData, now, doc.CanvasType); err != nil {
			return err
		}
		if err := maybeCollabCheckpoint(tx, &doc, now); err != nil {
			return err
		}
		if err := tx.Where("id = ?", docID).First(&doc).Error; err != nil {
			return err
		}
		// 知识库历史快照失败不阻断主链路，与普通保存一致。
		_ = SnapshotDocVersion(tx, &doc)
		return nil
	})
}

func maybeCollabCheckpoint(tx *gorm.DB, doc *model.CanvasDocument, now time.Time) error {
	if doc.CanvasType != DocCanvasType {
		return nil
	}
	newHash := hashPayload(doc.CurrentData)
	if doc.HeadRevisionID != nil {
		var previous model.CanvasRevision
		err := tx.Select("id, document_id, payload, content_hash").
			Where("id = ? AND document_id = ?", *doc.HeadRevisionID, doc.ID).First(&previous).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil {
			adjacent := newHash
			if previous.ContentHash != nil {
				adjacent = *previous.ContentHash
			} else {
				adjacent = hashPayload(previous.Payload)
			}
			if adjacent == newHash {
				return nil
			}
		}
	}
	revID := uuid.New()
	label := "auto-checkpoint"
	rev := &model.CanvasRevision{
		ID:           revID,
		DocumentID:   doc.ID,
		ParentID:     doc.HeadRevisionID,
		RevisionType: "snapshot",
		Payload:      datatypes.JSON(doc.CurrentData),
		AuthorUserID: &doc.OwnerUserID,
		Label:        &label,
		ContentHash:  &newHash,
		CreatedAt:    now,
	}
	if err := tx.Create(rev).Error; err != nil {
		return err
	}
	if err := tx.Model(&model.CanvasDocument{}).Where("id = ?", doc.ID).
		Updates(map[string]interface{}{"head_revision_id": revID, "updated_at": now}).Error; err != nil {
		return err
	}
	doc.HeadRevisionID = &revID
	return pruneAutomaticCheckpoints(tx, doc.ID)
}

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
