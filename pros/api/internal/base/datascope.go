package base

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"metamatrix/api/internal/model"
)

// 记录级可见范围（技术方案第 8 章 ·「记录级可见性」）。
//
// 与字段级策略互补：
//   - 字段级策略决定「这条记录里的哪些列看不见、不能改」；
//   - 记录级策略决定「这条记录本身看不看得见」。
//
// 关键约束：记录级过滤必须在 **Query Engine 生成 SQL 时注入**，
// 不能「先查出来再在内存里删」—— 否则分页总数、筛选、排序都会算错，
// 而且受限记录的值会先进入内存再被丢掉（越权读的风险）。
const (
	// RecordVisibilitySpace：空间内可见（默认，与既有行为一致）。
	RecordVisibilitySpace = "space"
	// RecordVisibilityRestricted：仅创建者与空间管理者可见。
	RecordVisibilityRestricted = "restricted"
	// RecordVisibilityCustom：指定成员可见（授权名单在 base_record_grants）。
	RecordVisibilityCustom = "custom"
)

// NormalizeRecordVisibility 归一化可见范围取值。
func NormalizeRecordVisibility(v string) (string, error) {
	switch v {
	case "", RecordVisibilitySpace:
		return RecordVisibilitySpace, nil
	case RecordVisibilityRestricted:
		return RecordVisibilityRestricted, nil
	case RecordVisibilityCustom:
		return RecordVisibilityCustom, nil
	default:
		return "", fmt.Errorf("%w: 可见范围只能是 space 或 restricted", ErrFieldValueInvalid)
	}
}

// recordScopeAllows 判断某条记录对某用户是否可见。
//
// 规则：
//   - space：空间内成员都可见；
//   - restricted：仅创建者（created_by）与空间管理者（admin / 空间 owner）可见；
//   - custom：创建者 + 空间管理者 + 授权名单（base_record_grants）里的成员可见。
func (s *Service) recordScopeAllows(rec BaseRecord, userID, projectID uuid.UUID) bool {
	if rec.Visibility == "" || rec.Visibility == RecordVisibilitySpace {
		return true
	}
	if rec.CreatedBy == userID {
		return true
	}
	if roleRank(s.roleOf(userID, projectID)) >= roleRank(RoleAdmin) {
		return true
	}
	if rec.Visibility == RecordVisibilityCustom {
		return s.hasRecordGrant(rec.ID, userID)
	}
	return false
}

// hasRecordGrant 判断用户是否在某条记录的授权名单里。
func (s *Service) hasRecordGrant(recordID, userID uuid.UUID) bool {
	if recordID == uuid.Nil || userID == uuid.Nil {
		return false
	}
	var count int64
	if err := s.db.Model(&BaseRecordGrant{}).
		Where("record_id = ? AND user_id = ?", recordID, userID).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

// applyRecordScope 把记录级可见范围注入查询。
//
// 管理员不加限制；其余用户只能看到「空间可见」的记录与自己创建的受限记录。
// alias 是记录表的别名（Query Engine 用 r；用 Model() 查询时传 "" 表示主表）。
func (s *Service) applyRecordScope(q *gorm.DB, userID, projectID uuid.UUID, alias string) *gorm.DB {
	if q == nil {
		return q
	}
	if roleRank(s.roleOf(userID, projectID)) >= roleRank(RoleAdmin) {
		return q
	}
	prefix := ""
	if alias != "" {
		prefix = alias + "."
	}
	// 注意：子查询里的表名**不能**带别名前缀（base_record_grants 在子查询里是主表）。
	return q.Where("("+prefix+"visibility = ? OR "+prefix+"created_by = ? OR "+prefix+"id IN (SELECT g.record_id FROM base_record_grants g WHERE g.user_id = ?))",
		RecordVisibilitySpace, userID, userID)
}

// assertRecordVisible 校验当前用户能否读写某条记录；不可见时按「不存在」处理，
// 避免通过错误码区分「记录存在但无权限」与「记录不存在」。
func (s *Service) assertRecordVisible(rec BaseRecord, userID, projectID uuid.UUID) error {
	if s.recordScopeAllows(rec, userID, projectID) {
		return nil
	}
	return ErrRecordNotFound
}

// scopeLoadRecord 按 ID 取记录并校验记录级可见范围。
func (s *Service) scopeLoadRecord(ctx context.Context, userID, projectID, recordID uuid.UUID) (BaseRecord, error) {
	var rec BaseRecord
	if err := s.db.WithContext(ctx).Where("id = ?", recordID).First(&rec).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return BaseRecord{}, ErrRecordNotFound
		}
		return BaseRecord{}, err
	}
	if err := s.assertRecordVisible(rec, userID, projectID); err != nil {
		return BaseRecord{}, err
	}
	return rec, nil
}

// visibleRecordQuery 返回一个已经注入记录级可见范围的查询（别名 r）。
func (s *Service) visibleRecordQuery(ctx context.Context, userID, projectID uuid.UUID) *gorm.DB {
	q := s.db.WithContext(ctx).Table("base_records AS r").
		Where("r.deleted_at IS NULL")
	return s.applyRecordScope(q, userID, projectID, "r")
}

// userDisplayName 取成员的显示名（用于记录级策略的展示）。
func (s *Service) userDisplayName(ctx context.Context, userID uuid.UUID) string {
	var u model.User
	if err := s.db.WithContext(ctx).Model(&model.User{}).
		Select("id, display_name, email").Where("id = ?", userID).First(&u).Error; err != nil {
		return ""
	}
	if name := strings.TrimSpace(u.DisplayName); name != "" {
		return name
	}
	return strings.TrimSpace(u.Email)
}

// visibleRecordIDs 返回「这些记录里哪些对当前用户可见」。
//
// 用于文档反向引用这类「先拿到记录 ID 再拼详情」的场景：
// 投影表里命中不代表记录可见，必须再按记录级可见范围过滤一次。
func (s *Service) visibleRecordIDs(ctx context.Context, userID, projectID uuid.UUID, ids []string) map[string]bool {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out
	}
	uuids := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if parsed, err := uuid.Parse(id); err == nil {
			uuids = append(uuids, parsed)
		}
	}
	if len(uuids) == 0 {
		return out
	}
	var rows []BaseRecord
	if err := s.db.WithContext(ctx).
		Select("id, visibility, created_by").
		Where("id IN ? AND deleted_at IS NULL", uuids).
		Find(&rows).Error; err != nil {
		return out
	}
	for _, row := range rows {
		if s.recordScopeAllows(row, userID, projectID) {
			out[row.ID.String()] = true
		}
	}
	return out
}

// normalizeGrantUsers 归一化「授权成员 ID 列表」。
//
// 返回 nil 表示「本次请求没有改授权名单」（与「改成空」区分开）。
// 传入的 ID 必须是空间成员 —— 否则会给一个根本进不来的人发授权，
// 属于看起来生效、实际无效的假权限。
func (s *Service) normalizeGrantUsers(in *[]string) (*[]uuid.UUID, error) {
	if in == nil {
		return nil, nil
	}
	out := make([]uuid.UUID, 0, len(*in))
	seen := map[uuid.UUID]bool{}
	for _, raw := range *in {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		uid, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("%w: 可见成员 ID 非法: %s", ErrFieldValueInvalid, raw)
		}
		if seen[uid] {
			continue
		}
		seen[uid] = true
		out = append(out, uid)
	}
	return &out, nil
}

// saveRecordGrants 覆盖写入某条记录的授权名单。
func (s *Service) saveRecordGrants(ctx context.Context, tx *gorm.DB, projectID, recordID, operatorID uuid.UUID, users []uuid.UUID) error {
	if tx == nil {
		tx = s.db
	}
	if err := tx.WithContext(ctx).Where("record_id = ?", recordID).Delete(&BaseRecordGrant{}).Error; err != nil {
		return err
	}
	if len(users) == 0 {
		return nil
	}
	now := time.Now()
	rows := make([]BaseRecordGrant, 0, len(users))
	for _, uid := range users {
		rows = append(rows, BaseRecordGrant{
			ID: uuid.New(), RecordID: recordID, UserID: uid,
			ProjectID: projectID, CreatedBy: operatorID, CreatedAt: now,
		})
	}
	return tx.WithContext(ctx).Create(&rows).Error
}

// GrantUser 是授权名单里的一个成员（含显示名）。
type GrantUser struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email,omitempty"`
}

// ListRecordGrants 列出某条记录的可见成员（指定成员可见时有效）。
func (s *Service) ListRecordGrants(ctx context.Context, userID, projectID, recordID uuid.UUID) ([]GrantUser, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
		return nil, err
	}
	if rec.Visibility != RecordVisibilityCustom {
		return []GrantUser{}, nil
	}
	var rows []BaseRecordGrant
	if err := s.db.WithContext(ctx).Where("record_id = ?", recordID).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]GrantUser, 0, len(rows))
	if len(rows) == 0 {
		return out, nil
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.UserID)
	}
	names := map[uuid.UUID]model.User{}
	var users []model.User
	if err := s.db.WithContext(ctx).Select("id, display_name, email").Where("id IN ?", ids).Find(&users).Error; err == nil {
		for _, u := range users {
			names[u.ID] = u
		}
	}
	for _, row := range rows {
		entry := GrantUser{UserID: row.UserID.String()}
		if u, ok := names[row.UserID]; ok {
			entry.Name = strings.TrimSpace(u.DisplayName)
			if entry.Name == "" {
				entry.Name = u.Email
			}
			entry.Email = u.Email
		}
		out = append(out, entry)
	}
	return out, nil
}

// spaceMemberIDs 返回空间成员（不含空间所有者）的用户 ID 集合。
func (s *Service) spaceMemberIDs(ctx context.Context, projectID uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	var rows []model.KnowledgeMember
	if err := s.db.WithContext(ctx).Select("user_id").Where("project_id = ?", projectID).Find(&rows).Error; err != nil {
		return out, err
	}
	for _, row := range rows {
		out[row.UserID] = true
	}
	return out, nil
}
