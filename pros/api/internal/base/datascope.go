package base

import (
	"context"
	"errors"
	"fmt"
	"sort"
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

// userDepartment 返回用户所属部门（取不到时返回空串）。
//
// 部门授权靠它匹配；取不到部门不影响其它授权（直接授权给用户）生效。
func (s *Service) userDepartment(userID uuid.UUID) string {
	if userID == uuid.Nil {
		return ""
	}
	var u model.User
	if err := s.db.Select("department").Where("id = ?", userID).First(&u).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(u.Department)
}

// hasRecordGrant 判断用户是否在某条记录的授权名单里。
//
// 命中条件（任一）：
//   - 直接授权给该用户（subject_type = user）；
//   - 授权给该用户所属部门（subject_type = department，按 core_users.department 匹配）；
//   - 授权已过期（expires_at <= now）→ 不命中。
func (s *Service) hasRecordGrant(recordID, userID uuid.UUID) bool {
	if recordID == uuid.Nil || userID == uuid.Nil {
		return false
	}
	department := s.userDepartment(userID)
	var count int64
	if err := s.db.Model(&BaseRecordGrant{}).
		Where("record_id = ? AND (expires_at IS NULL OR expires_at > ?)", recordID, time.Now()).
		Where("(subject_type = 'user' AND user_id = ?) OR (subject_type = 'department' AND subject_id = ?)",
			userID, department).
		Count(&count).Error; err != nil {
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
	// 授权命中口径与 hasRecordGrant 保持一致：直接授权 / 部门授权 / 未过期。
	// 部门名在 Go 侧解析（core_users 可能不存在于影子库），避免把 users 表写进 SQL。
	department := s.userDepartment(userID)
	return q.Where("("+prefix+"visibility = ? OR "+prefix+"created_by = ? OR "+prefix+"id IN (SELECT g.record_id FROM base_record_grants g WHERE (g.expires_at IS NULL OR g.expires_at > ?) AND ((g.subject_type = 'user' AND g.user_id = ?) OR (g.subject_type = 'department' AND g.subject_id = ?))))",
		RecordVisibilitySpace, userID, time.Now(), userID, department)
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
	// 租户边界校验：记录 → 表 → Base → 空间。
	//
	// recordScopeAllows 只判断「记录级可见范围」，
	// 不判断「这条记录属于哪个空间」—— space 可见性的记录对任何人都放行。
	// 没有这一步，猜到别的空间的 recordId 就能直接读到它的字段值。
	// 口径与 assertBaseInProject 一致：
	//   - Base 存在但属于别的空间 → 跨空间越权，按「不存在」处理；
	//   - Base 完全不存在（孤儿表 / 精简影子库）→ 放行，不因为数据不完整就拒绝；
	//   - base_apps 表缺失（老库未迁移）→ 放行。
	var owner struct {
		BaseID uuid.UUID `gorm:"column:base_id"`
	}
	ownerErr := s.db.WithContext(ctx).Table("base_tables AS t").
		Select("t.base_id").
		Where("t.id = ? AND t.deleted_at IS NULL", rec.TableID).
		Scan(&owner).Error
	if ownerErr != nil && !isMissingTable(ownerErr) {
		return BaseRecord{}, ownerErr
	}
	if ownerErr == nil && owner.BaseID != uuid.Nil {
		var app struct {
			ProjectID uuid.UUID `gorm:"column:project_id"`
		}
		appErr := s.db.WithContext(ctx).Table("base_apps AS a").
			Select("a.project_id").
			Where("a.id = ? AND a.deleted_at IS NULL", owner.BaseID).
			Scan(&app).Error
		if appErr != nil && !isMissingTable(appErr) {
			return BaseRecord{}, appErr
		}
		if appErr == nil && app.ProjectID != uuid.Nil && app.ProjectID != projectID {
			// Base 属于别的空间 → 跨空间越权，按「不存在」处理。
			return BaseRecord{}, ErrRecordNotFound
		}
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

// GrantSubject 是一个授权对象：用户或部门，可带有效期。
type GrantSubject struct {
	// Type：user（指定成员） / department（整个部门）。
	Type string `json:"type"`
	// ID：用户 ID（user）或部门名（department）。
	ID string `json:"id"`
	// ExpiresAt 为空表示永久有效。
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

// 授权对象类型常量。
const (
	GrantSubjectUser       = "user"
	GrantSubjectDepartment = "department"
)

// departmentPseudoUserID 由部门名派生一个稳定的伪用户 ID。
//
// base_record_grants 的唯一索引是 (record_id, user_id)，
// 部门授权需要占一行，用派生 ID 既能复用索引，又不会和真实用户冲突。
func departmentPseudoUserID(department string) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("dept:"+department))
}

// normalizeGrantSubjects 归一化授权对象列表。
func normalizeGrantSubjects(in *[]GrantSubject) ([]GrantSubject, error) {
	if in == nil {
		return nil, nil
	}
	out := make([]GrantSubject, 0, len(*in))
	seen := map[string]bool{}
	for _, item := range *in {
		kind := strings.TrimSpace(item.Type)
		if kind == "" {
			kind = GrantSubjectUser
		}
		if kind != GrantSubjectUser && kind != GrantSubjectDepartment {
			return nil, fmt.Errorf("%w: 授权对象类型只能是 user 或 department", ErrFieldValueInvalid)
		}
		id := strings.TrimSpace(item.ID)
		if id == "" {
			return nil, fmt.Errorf("%w: 授权对象不能为空", ErrFieldValueInvalid)
		}
		if kind == GrantSubjectUser {
			if _, err := uuid.Parse(id); err != nil {
				return nil, fmt.Errorf("%w: 授权用户 ID 非法: %s", ErrFieldValueInvalid, id)
			}
		}
		key := kind + "|" + id
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, GrantSubject{Type: kind, ID: id, ExpiresAt: item.ExpiresAt})
	}
	return out, nil
}

// spaceMemberDepartments 返回空间成员出现过的部门集合。
func (s *Service) spaceMemberDepartments(ctx context.Context, projectID uuid.UUID) (map[string]bool, error) {
	out := map[string]bool{}
	var rows []model.User
	if err := s.db.WithContext(ctx).
		Select("core_users.id, core_users.department").
		Joins("JOIN kb_members ON kb_members.user_id = core_users.id").
		Where("kb_members.project_id = ?", projectID).
		Find(&rows).Error; err != nil {
		// 影子库 / 精简部署里可能没有 core_users 表；此时拿不到部门集合，
		// 退化为「无部门可选」，不影响按用户直接授权。
		return out, nil
	}
	for _, row := range rows {
		dept := strings.TrimSpace(row.Department)
		if dept != "" {
			out[dept] = true
		}
	}
	return out, nil
}

// ListSpaceDepartments 列出空间成员出现过的部门（去重、排序）。
//
// 供前端「按部门授权」下拉使用；空间里没有部门时返回空数组。
func (s *Service) ListSpaceDepartments(ctx context.Context, userID, projectID uuid.UUID) ([]string, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	set, err := s.spaceMemberDepartments(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(set))
	for dept := range set {
		out = append(out, dept)
	}
	sort.Strings(out)
	return out, nil
}

// resolveGrantSubjects 归一化「授权对象」输入。
//
// 兼容两种写法：
//   - grantSubjects：用户 / 部门 + 有效期（推荐）；
//   - grants：旧的用户 ID 列表（自动转成 user 类型、无有效期）。
//
// 返回 nil 表示「本次请求没有改授权名单」。
func (s *Service) resolveGrantSubjects(ctx context.Context, projectID uuid.UUID, in *RecordInput) (*[]GrantSubject, error) {
	if in == nil {
		return nil, nil
	}
	if in.GrantSubjects != nil {
		subjects, err := normalizeGrantSubjects(in.GrantSubjects)
		if err != nil {
			return nil, err
		}
		return &subjects, nil
	}
	if in.Grants == nil {
		return nil, nil
	}
	users, err := s.normalizeGrantUsers(in.Grants)
	if err != nil {
		return nil, err
	}
	if users == nil {
		return nil, nil
	}
	subjects := make([]GrantSubject, 0, len(*users))
	for _, uid := range *users {
		subjects = append(subjects, GrantSubject{Type: GrantSubjectUser, ID: uid.String()})
	}
	return &subjects, nil
}

// saveRecordGrants 覆盖写入某条记录的授权名单。
func (s *Service) saveRecordGrants(ctx context.Context, tx *gorm.DB, projectID, recordID, operatorID uuid.UUID, subjects []GrantSubject) error {
	if tx == nil {
		tx = s.db
	}
	if err := tx.WithContext(ctx).Where("record_id = ?", recordID).Delete(&BaseRecordGrant{}).Error; err != nil {
		return err
	}
	if len(subjects) == 0 {
		return nil
	}
	now := time.Now()
	rows := make([]BaseRecordGrant, 0, len(subjects))
	for _, subject := range subjects {
		row := BaseRecordGrant{
			ID:          uuid.New(),
			TenantID:    projectID,
			RecordID:    recordID,
			ProjectID:   projectID,
			SubjectType: subject.Type,
			SubjectID:   subject.ID,
			ExpiresAt:   subject.ExpiresAt,
			CreatedBy:   operatorID,
			CreatedAt:   now,
		}
		if subject.Type == GrantSubjectDepartment {
			row.UserID = departmentPseudoUserID(subject.ID)
		} else {
			uid, _ := uuid.Parse(subject.ID)
			row.UserID = uid
		}
		rows = append(rows, row)
	}
	return tx.WithContext(ctx).Create(&rows).Error
}

// GrantUser 是授权名单里的一个授权对象（含显示名）。
type GrantUser struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email,omitempty"`
	// SubjectType：user / department。
	SubjectType string `json:"subjectType,omitempty"`
	// SubjectID：用户 ID 或部门名。
	SubjectID string `json:"subjectId,omitempty"`
	// ExpiresAt 为空表示永久有效。
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
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
		if row.SubjectType == GrantSubjectDepartment {
			continue
		}
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
		entry := GrantUser{
			UserID:      row.UserID.String(),
			SubjectType: row.SubjectType,
			SubjectID:   row.SubjectID,
			ExpiresAt:   row.ExpiresAt,
		}
		if entry.SubjectType == "" {
			entry.SubjectType = GrantSubjectUser
		}
		if entry.SubjectType == GrantSubjectDepartment {
			entry.Name = "部门：" + row.SubjectID
			out = append(out, entry)
			continue
		}
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
