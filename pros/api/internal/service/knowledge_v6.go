package service

import (
	"context"
	"errors"
	"log"
	"sort"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 知识库 6.0：空间成员角色（069）、团队共享模板发布（026）、
// presence 落库（078）、协同编辑增量日志（079）、结构块引用（047）。

var ErrSpaceForbidden = errors.New("space access denied")

// ErrCRDTReadOnly 表示旧 HTML 级协同旁路（doc_crdt_updates）已降为只读。
// 历史增量仍可通过 CRDTUpdates / CRDTDocuments 读取，但不得再追加写入。
// 新的协同编辑走正文 Yjs 通道（doc_operation / Hertz WebSocket）。
var ErrCRDTReadOnly = errors.New("html crdt bypass is read-only")

// 空间角色。
const (
	SpaceRoleAdmin  = "admin"
	SpaceRoleEditor = "editor"
	SpaceRoleViewer = "viewer"
)

// spaceRoleRank 把角色换算成权限等级。
func spaceRoleRank(role string) int {
	switch role {
	case SpaceRoleAdmin:
		return 3
	case SpaceRoleEditor:
		return 2
	case SpaceRoleViewer:
		return 1
	default:
		return 0
	}
}

// SpaceMember 是空间成员的展示信息。
type SpaceMember struct {
	UserID   string    `json:"userId"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Avatar   string    `json:"avatar"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
	// IsOwner 标记项目所有者：所有者天然是 admin，不落在成员表里。
	IsOwner bool `json:"isOwner"`
}

// lookupSpaceRole 查询用户在空间中的角色。项目所有者视为 admin；无成员关系返回空串。
func lookupSpaceRole(db *gorm.DB, userID, projectID uuid.UUID) string {
	var count int64
	if err := db.Model(&model.Project{}).
		Where("id = ? AND owner_user_id = ?", projectID, userID).
		Count(&count).Error; err == nil && count > 0 {
		return SpaceRoleAdmin
	}
	var member model.KnowledgeMember
	if err := db.Where("project_id = ? AND user_id = ?", projectID, userID).
		First(&member).Error; err == nil {
		return member.Role
	}
	return ""
}

// SpaceRole 返回该用户在空间里的角色；不在空间里返回空串。
func (s *KnowledgeService) SpaceRole(userID, projectID uuid.UUID) string {
	return lookupSpaceRole(s.db, userID, projectID)
}

// assertSpaceAccess 校验用户对空间的权限：read | write | admin。
//
// 项目所有者永远是 admin；空间成员按角色放行。没有成员关系时按「项目不存在」
// 处理，避免泄露空间是否存在。
func (s *KnowledgeService) assertSpaceAccess(userID, projectID uuid.UUID, need string) error {
	role := s.SpaceRole(userID, projectID)
	if role == "" {
		return ErrProjectMissing
	}
	if spaceRoleRank(role) < spaceRoleRank(need) {
		return ErrSpaceForbidden
	}
	return nil
}

// ListMembers 列出空间成员（含项目所有者）。
func (s *KnowledgeService) ListMembers(userID, projectID uuid.UUID) ([]SpaceMember, error) {
	if err := s.assertSpaceAccess(userID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var project model.Project
	if err := s.db.Select("id, owner_user_id").Where("id = ?", projectID).First(&project).Error; err != nil {
		return nil, ErrProjectMissing
	}
	members := []SpaceMember{}
	var rows []model.KnowledgeMember
	if err := s.db.Where("project_id = ?", projectID).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	byID := map[uuid.UUID]model.KnowledgeMember{}
	for _, m := range rows {
		byID[m.UserID] = m
	}
	// 所有者排在最前。
	var owner model.User
	if err := s.db.Select("id, display_name, email, avatar_url").Where("id = ?", project.OwnerUserID).First(&owner).Error; err == nil {
		members = append(members, SpaceMember{
			UserID: owner.ID.String(), Name: displayName(owner), Email: owner.Email,
			Avatar: owner.AvatarURL, Role: SpaceRoleAdmin, IsOwner: true,
			JoinedAt: owner.CreatedAt,
		})
	}
	for _, m := range rows {
		var u model.User
		if err := s.db.Select("id, display_name, email, avatar_url, created_at").Where("id = ?", m.UserID).First(&u).Error; err != nil {
			continue
		}
		members = append(members, SpaceMember{
			UserID: u.ID.String(), Name: displayName(u), Email: u.Email, Avatar: u.AvatarURL,
			Role: m.Role, JoinedAt: m.CreatedAt,
		})
	}
	return members, nil
}

func displayName(u model.User) string {
	if u.DisplayName != "" {
		return u.DisplayName
	}
	return u.Email
}

// SetMemberRole 设置（或新增）空间成员角色。
func (s *KnowledgeService) SetMemberRole(userID, projectID, targetID uuid.UUID, role string) (*model.KnowledgeMember, error) {
	if err := s.assertSpaceAccess(userID, projectID, SpaceRoleAdmin); err != nil {
		return nil, err
	}
	role = strings.TrimSpace(role)
	switch role {
	case SpaceRoleAdmin, SpaceRoleEditor, SpaceRoleViewer:
	default:
		return nil, ErrValidation
	}
	var target model.User
	if err := s.db.Select("id").Where("id = ?", targetID).First(&target).Error; err != nil {
		return nil, ErrValidation
	}
	var project model.Project
	if err := s.db.Select("owner_user_id").Where("id = ?", projectID).First(&project).Error; err != nil {
		return nil, ErrProjectMissing
	}
	if project.OwnerUserID == targetID {
		return nil, ErrValidation
	}
	now := time.Now().UTC()
	member := model.KnowledgeMember{
		ID: uuid.New(), ProjectID: projectID, UserID: targetID, Role: role,
		CreatedBy: userID, CreatedAt: now, UpdatedAt: now,
	}
	var existing model.KnowledgeMember
	err := s.db.Where("project_id = ? AND user_id = ?", projectID, targetID).First(&existing).Error
	switch {
	case err == nil:
		if err := s.db.Model(&model.KnowledgeMember{}).Where("id = ?", existing.ID).
			Updates(map[string]interface{}{"role": role, "updated_at": now}).Error; err != nil {
			return nil, err
		}
		existing.Role = role
		existing.UpdatedAt = now
		return &existing, nil
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return nil, err
	}
	if err := s.db.Create(&member).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

// RemoveMember 移除空间成员。
func (s *KnowledgeService) RemoveMember(userID, projectID, targetID uuid.UUID) error {
	if err := s.assertSpaceAccess(userID, projectID, SpaceRoleAdmin); err != nil {
		return err
	}
	return s.db.Where("project_id = ? AND user_id = ?", projectID, targetID).
		Delete(&model.KnowledgeMember{}).Error
}

// ---------------------------------------------------------------- 团队共享模板（026）

// PublishTemplate 发布或下架团队共享模板。
//
// 团队模板的作用域是 scope=team：发布后空间成员都能在模板中心看到，
// 下架后立刻消失。个人模板与内置模板不受影响。
func (s *KnowledgeService) PublishTemplate(userID, templateID uuid.UUID, published bool) (*model.KnowledgeTemplate, error) {
	var tpl model.KnowledgeTemplate
	if err := s.db.Where("id = ?", templateID).First(&tpl).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	// 只有模板作者或管理员能发布。
	if tpl.OwnerUserID == nil || *tpl.OwnerUserID != userID {
		if tpl.Scope != "team" {
			return nil, ErrSpaceForbidden
		}
	}
	if tpl.Scope == "personal" {
		return nil, ErrValidation
	}
	now := time.Now().UTC()
	updates := map[string]interface{}{"published": published, "updated_at": now}
	if published {
		updates["published_at"] = now
		updates["published_by"] = userID
	} else {
		updates["published_at"] = nil
		updates["published_by"] = nil
	}
	if err := s.db.Model(&model.KnowledgeTemplate{}).Where("id = ?", templateID).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := s.db.Where("id = ?", templateID).First(&tpl).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

// ---------------------------------------------------------------- presence 落库（078）

// PresenceStore 是 presence 的存储后端。
//
// 接口不变（清单 078 的要求），默认实现换成数据库：多实例部署时
// 各实例看到的是同一份在线状态。
type PresenceStore interface {
	Heartbeat(docID, userID uuid.UUID, name, avatar string, editing bool, cursor string)
	List(docID uuid.UUID) []PresenceUser
	// Leave 立即把该用户从文档在线名单里移除（离房或连接断开，不必等 TTL）。
	Leave(docID, userID uuid.UUID)
}

// dbPresenceStore 把 presence 落到 knowledge_presence 表。
type dbPresenceStore struct {
	db *gorm.DB
}

func newDBPresenceStore(db *gorm.DB) PresenceStore {
	return &dbPresenceStore{db: db}
}

func (s *dbPresenceStore) Heartbeat(docID, userID uuid.UUID, name, avatar string, editing bool, cursor string) {
	now := time.Now().UTC()
	row := model.KnowledgePresence{
		DocID: docID, UserID: userID, Name: name, Avatar: avatar,
		Editing: editing, Cursor: cursor, LastSeen: now,
	}
	if err := s.db.Where("doc_id = ? AND user_id = ?", docID, userID).
		Assign(map[string]interface{}{
			"name": name, "avatar": avatar, "editing": editing,
			"cursor": cursor, "last_seen": now,
		}).FirstOrCreate(&row).Error; err != nil {
		log.Printf("presence heartbeat failed: doc=%s user=%s err=%v", docID, userID, err)
	}
}

func (s *dbPresenceStore) Leave(docID, userID uuid.UUID) {
	if err := s.db.Where("doc_id = ? AND user_id = ?", docID, userID).
		Delete(&model.KnowledgePresence{}).Error; err != nil {
		log.Printf("presence leave failed: doc=%s user=%s err=%v", docID, userID, err)
	}
}

func (s *dbPresenceStore) List(docID uuid.UUID) []PresenceUser {
	cutoff := time.Now().UTC().Add(-presenceTTL)
	var rows []model.KnowledgePresence
	if err := s.db.Where("doc_id = ? AND last_seen >= ?", docID, cutoff).
		Order("last_seen DESC").Find(&rows).Error; err != nil {
		return []PresenceUser{}
	}
	out := make([]PresenceUser, 0, len(rows))
	for _, r := range rows {
		out = append(out, PresenceUser{
			UserID: r.UserID.String(), Name: r.Name, Avatar: r.Avatar,
			Editing: r.Editing, Cursor: r.Cursor, LastSeen: r.LastSeen,
		})
	}
	// 顺手清掉过期行：在线状态是瞬时信息。
	s.db.Where("doc_id = ? AND last_seen < ?", docID, cutoff).Delete(&model.KnowledgePresence{})
	return out
}

// hybridPresenceStore 把 presence 同时写内存与数据库。
//
// 数据库是跨实例共享的那一份；数据库不可用时内存表兜底，接口不变。
type hybridPresenceStore struct {
	db  *gorm.DB
	mem *PresenceRegistry
}

func newHybridPresenceStore(db *gorm.DB) PresenceStore {
	return &hybridPresenceStore{db: db, mem: NewPresenceRegistry()}
}

func (s *hybridPresenceStore) Heartbeat(docID, userID uuid.UUID, name, avatar string, editing bool, cursor string) {
	s.mem.Heartbeat(docID, userID, name, avatar, editing, cursor)
	now := time.Now().UTC()
	row := model.KnowledgePresence{
		DocID: docID, UserID: userID, Name: name, Avatar: avatar,
		Editing: editing, Cursor: cursor, LastSeen: now,
	}
	if err := s.db.Where("doc_id = ? AND user_id = ?", docID, userID).
		Assign(map[string]interface{}{
			"name": name, "avatar": avatar, "editing": editing,
			"cursor": cursor, "last_seen": now,
		}).FirstOrCreate(&row).Error; err != nil {
		log.Printf("presence heartbeat failed: doc=%s user=%s err=%v", docID, userID, err)
	}
}

func (s *hybridPresenceStore) Leave(docID, userID uuid.UUID) {
	s.mem.Leave(docID, userID)
	if err := s.db.Where("doc_id = ? AND user_id = ?", docID, userID).
		Delete(&model.KnowledgePresence{}).Error; err != nil {
		log.Printf("presence leave failed: doc=%s user=%s err=%v", docID, userID, err)
	}
}

func (s *hybridPresenceStore) List(docID uuid.UUID) []PresenceUser {
	cutoff := time.Now().UTC().Add(-presenceTTL)
	var rows []model.KnowledgePresence
	if err := s.db.Where("doc_id = ? AND last_seen >= ?", docID, cutoff).
		Order("last_seen DESC").Find(&rows).Error; err == nil && len(rows) > 0 {
		out := make([]PresenceUser, 0, len(rows))
		for _, r := range rows {
			out = append(out, PresenceUser{
				UserID: r.UserID.String(), Name: r.Name, Avatar: r.Avatar,
				Editing: r.Editing, Cursor: r.Cursor, LastSeen: r.LastSeen,
			})
		}
		s.db.Where("doc_id = ? AND last_seen < ?", docID, cutoff).Delete(&model.KnowledgePresence{})
		return out
	}
	return s.mem.List(docID)
}

// ---------------------------------------------------------------- 协同编辑增量（079）

// CRDTUpdate 是协同编辑增量的一条记录。
type CRDTUpdate struct {
	Seq     int64  `json:"seq"`
	Kind    string `json:"kind"`
	Payload []byte `json:"payload"`
}

// AppendCRDT 曾用于追加 HTML 级协同增量。A2b 起该旁路只读，调用一律拒绝写入。
func (s *KnowledgeService) AppendCRDT(docID, authorID uuid.UUID, kind string, payload []byte) (int64, error) {
	return 0, ErrCRDTReadOnly
}

// CRDTUpdates 读取某篇文档在 after 之后的历史增量（只读回放）。
func (s *KnowledgeService) CRDTUpdates(docID uuid.UUID, after int64, limit int) ([]CRDTUpdate, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var rows []model.DocCRDTUpdate
	if err := s.db.Where("doc_id = ? AND id > ?", docID, after).
		Order("id ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]CRDTUpdate, 0, len(rows))
	for _, r := range rows {
		out = append(out, CRDTUpdate{Seq: r.ID, Kind: r.Kind, Payload: r.Payload})
	}
	return out, nil
}

// CRDTDocuments 读取某篇文档的协同增量（带归属校验）。
func (s *KnowledgeService) CRDTDocuments(ownerID, docID uuid.UUID, after int64, limit int) ([]CRDTUpdate, error) {
	if _, err := s.docs().GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	return s.CRDTUpdates(docID, after, limit)
}

// ---------------------------------------------------------------- 结构块统计（047）

// DocStructureStats 是一篇文档里的结构块统计。
type DocStructureStats struct {
	Tables      int `json:"tables"`
	Whiteboards int `json:"whiteboards"`
	Flowcharts  int `json:"flowcharts"`
	Embeds      int `json:"embeds"`
	// Refs 是落在结构块里的文档引用数。
	Refs int `json:"refs"`
}

// DocStructureStats 统计文档里的表格/白板/流程图等结构块。
func (s *KnowledgeService) DocStructureStats(ownerID, docID uuid.UUID) (*DocStructureStats, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	html := extractDocHTML(doc.CurrentData)
	stats := &DocStructureStats{
		Tables:      strings.Count(html, "<table"),
		Whiteboards: strings.Count(html, `data-type="whiteboard"`),
		Flowcharts:  strings.Count(html, `data-type="flowchart"`),
		Embeds:      strings.Count(html, `data-type="canvasEmbed"`),
	}
	var refs int64
	s.db.Model(&model.PageReference{}).
		Where("source_doc_id = ? AND block_type <> ''", docID).Count(&refs)
	stats.Refs = int(refs)
	return stats, nil
}

// ---------------------------------------------------------------- 内部工具

// sortedUserIDs 把 id 列表排序，保证 SQL IN 参数稳定（便于测试与缓存）。
func sortedUserIDs(ids []uuid.UUID) []uuid.UUID {
	out := append([]uuid.UUID(nil), ids...)
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}

// ctxOrBackground 给后台任务一个可取消的上下文。
func ctxOrBackground(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}
