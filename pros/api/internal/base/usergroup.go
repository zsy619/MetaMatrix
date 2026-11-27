package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 通讯录分组（多维表格人员字段的最小可用分组模型）。
//
// 语义：
//   - 分组属于一个知识库空间（租户），空间外不可见；
//   - 分组成员是空间成员的用户 ID；
//   - 字段类型 user_group 存的是「组 ID 列表」，展示时显示组名。

// UserGroupInfo 是分组的对外视图。
type UserGroupInfo struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Members     []string `json:"members"`
	MemberCount int      `json:"memberCount"`
	SortOrder   int      `json:"sortOrder"`
	CreatedAt   string   `json:"createdAt"`
}

// UserGroupInput 是新建 / 修改分组的入参。
type UserGroupInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Members     []string `json:"members"`
	SortOrder   int      `json:"sortOrder"`
}

// ListUserGroups 列出空间内的通讯录分组。
func (s *Service) ListUserGroups(ctx context.Context, userID, projectID uuid.UUID) ([]UserGroupInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var rows []BaseUserGroup
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND status = 1", projectID).
		Order("sort_order ASC, created_at ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]UserGroupInfo, 0, len(rows))
	for i := range rows {
		out = append(out, userGroupInfoOf(&rows[i]))
	}
	return out, nil
}

// CreateUserGroup 新建通讯录分组。
func (s *Service) CreateUserGroup(ctx context.Context, userID, projectID uuid.UUID, in UserGroupInput) (*UserGroupInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: group name is required", ErrFieldValueInvalid)
	}
	members, err := s.normalizeGroupMembers(ctx, projectID, in.Members)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(members)
	row := BaseUserGroup{
		ID:          uuid.New(),
		TenantID:    projectID,
		ProjectID:   projectID,
		Name:        name,
		Description: strings.TrimSpace(in.Description),
		Members:     raw,
		SortOrder:   in.SortOrder,
		Status:      1,
		CreatedBy:   userID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	info := userGroupInfoOf(&row)
	return &info, nil
}

// UpdateUserGroup 修改通讯录分组。
func (s *Service) UpdateUserGroup(ctx context.Context, userID, projectID, groupID uuid.UUID, in UserGroupInput) (*UserGroupInfo, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	var row BaseUserGroup
	if err := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", groupID, projectID).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRecordNotFound
		}
		return nil, err
	}
	updates := map[string]any{"updated_at": time.Now()}
	if name := strings.TrimSpace(in.Name); name != "" {
		updates["name"] = name
	}
	if in.Description != "" {
		updates["description"] = strings.TrimSpace(in.Description)
	}
	if in.Members != nil {
		members, err := s.normalizeGroupMembers(ctx, projectID, in.Members)
		if err != nil {
			return nil, err
		}
		raw, _ := json.Marshal(members)
		updates["members"] = raw
	}
	updates["sort_order"] = in.SortOrder
	if err := s.db.WithContext(ctx).Model(&row).Updates(updates).Error; err != nil {
		return nil, err
	}
	info := userGroupInfoOf(&row)
	return &info, nil
}

// DeleteUserGroup 删除通讯录分组。
func (s *Service) DeleteUserGroup(ctx context.Context, userID, projectID, groupID uuid.UUID) error {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return err
	}
	res := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", groupID, projectID).
		Delete(&BaseUserGroup{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrRecordNotFound
	}
	return nil
}

// normalizeGroupMembers 校验分组成员必须是空间成员。
func (s *Service) normalizeGroupMembers(ctx context.Context, projectID uuid.UUID, members []string) ([]string, error) {
	out := make([]string, 0, len(members))
	seen := map[string]bool{}
	for _, raw := range members {
		raw = strings.TrimSpace(raw)
		if raw == "" || seen[raw] {
			continue
		}
		uid, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("%w: bad member id %q", ErrFieldValueInvalid, raw)
		}
		ok, err := s.isSpaceMember(ctx, projectID, uid)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("%w: member %s is not in this space", ErrFieldValueInvalid, raw)
		}
		seen[raw] = true
		out = append(out, raw)
	}
	return out, nil
}

// isSpaceMember 判断用户是否属于空间。
func (s *Service) isSpaceMember(ctx context.Context, projectID, userID uuid.UUID) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Table("kb_members").
		Where("project_id = ? AND user_id = ?", projectID, userID).
		Count(&count).Error
	if err != nil {
		// 影子库没有 kb_members 表：不做成员校验（与既有空间成员查询同口径）。
		if isMissingTable(err) {
			return true, nil
		}
		return false, err
	}
	return count > 0, nil
}

// userGroupInfoOf 把模型转成对外视图。
func userGroupInfoOf(row *BaseUserGroup) UserGroupInfo {
	members := []string{}
	if len(row.Members) > 0 {
		_ = json.Unmarshal(row.Members, &members)
	}
	return UserGroupInfo{
		ID:          row.ID.String(),
		Name:        row.Name,
		Description: row.Description,
		Members:     members,
		MemberCount: len(members),
		SortOrder:   row.SortOrder,
		CreatedAt:   row.CreatedAt.Format(time.RFC3339),
	}
}

// UserGroupNames 批量取分组名（字段展示用）。
func (s *Service) UserGroupNames(ctx context.Context, projectID uuid.UUID, ids []string) map[string]string {
	out := map[string]string{}
	if len(ids) == 0 {
		return out
	}
	parsed := make([]uuid.UUID, 0, len(ids))
	for _, raw := range ids {
		if uid, err := uuid.Parse(raw); err == nil {
			parsed = append(parsed, uid)
		}
	}
	if len(parsed) == 0 {
		return out
	}
	var rows []BaseUserGroup
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND id IN ?", projectID, parsed).
		Find(&rows).Error; err != nil {
		return out
	}
	for i := range rows {
		out[rows[i].ID.String()] = rows[i].Name
	}
	return out
}
