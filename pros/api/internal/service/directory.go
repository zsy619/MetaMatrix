package service

import (
	"strings"

	"metamatrix/api/internal/model"

	"gorm.io/gorm"
)

// 通讯录（真人 @）的公开字段。
//
// 这是一个专门的 DTO，不是 model.User。密码哈希、token、盐等敏感字段不会
// 出现在这里，序列化时也只会输出下面这几个键。
const (
	// DirectoryDefaultLimit 是没带 limit 时每页返回的用户数。
	DirectoryDefaultLimit = 50
	// DirectoryMaxLimit 是 limit 的上限，防止一次拉爆通讯录。
	DirectoryMaxLimit = 200
)

// DirectoryUserDTO 是一个通讯录用户的对外形状。
type DirectoryUserDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role,omitempty"`
	Department string `json:"department,omitempty"`
	Email      string `json:"email,omitempty"`
	AvatarURL  string `json:"avatarUrl,omitempty"`
}

// DirectoryUserFromModel 把数据库行转成对外 DTO。
// 显示名优先用 DisplayName，空的时候退回账号（邮箱）。
func DirectoryUserFromModel(u *model.User) DirectoryUserDTO {
	if u == nil {
		return DirectoryUserDTO{}
	}
	name := strings.TrimSpace(u.DisplayName)
	if name == "" {
		name = strings.TrimSpace(u.Email)
	}
	return DirectoryUserDTO{
		ID:         u.ID.String(),
		Name:       name,
		Role:       strings.TrimSpace(u.Role),
		Department: strings.TrimSpace(u.Department),
		Email:      strings.TrimSpace(u.Email),
		AvatarURL:  strings.TrimSpace(u.AvatarURL),
	}
}

// NormalizeDirectoryQuery 规整搜索词。空词表示不搜索。
func NormalizeDirectoryQuery(q string) string {
	return strings.TrimSpace(q)
}

// ParseDirectoryLimit 解析 limit 参数。
// 非法值退回默认值，超过上限按上限截断，小于 1 按 1 处理。
func ParseDirectoryLimit(raw string) int {
	v, ok := parsePositiveInt(raw)
	if !ok {
		return DirectoryDefaultLimit
	}
	if v > DirectoryMaxLimit {
		return DirectoryMaxLimit
	}
	if v < 1 {
		return 1
	}
	return v
}

// ParseDirectoryOffset 解析 offset 参数。非法或负数按 0 处理。
func ParseDirectoryOffset(raw string) int {
	v, ok := parsePositiveInt(raw)
	if !ok || v < 0 {
		return 0
	}
	return v
}

func parsePositiveInt(raw string) (int, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	n := 0
	for _, r := range raw {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
		if n > 1<<31-1 {
			return 0, false
		}
	}
	return n, true
}

// escapeLikeLike 转义 LIKE 里的通配符，避免用户输入的 % 或 _ 变成通配。
func escapeLikeLike(s string) string {
	r := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_")
	return r.Replace(s)
}

// buildDirectoryFilter 拼出搜索条件。
// 大小写不敏感（ILIKE），匹配显示名与邮箱。返回空条件表示不过滤。
func buildDirectoryFilter(q string) (string, []interface{}) {
	q = NormalizeDirectoryQuery(q)
	if q == "" {
		return "", nil
	}
	like := "%" + escapeLikeLike(q) + "%"
	return "(display_name ILIKE ? ESCAPE '\\' OR email ILIKE ? ESCAPE '\\')", []interface{}{like, like}
}

// DirectoryService 读通讯录。
type DirectoryService struct {
	db *gorm.DB
}

// NewDirectoryService 建立通讯录服务。
func NewDirectoryService(db *gorm.DB) *DirectoryService {
	return &DirectoryService{db: db}
}

// List 按关键词分页列出通讯录用户。
//
// 只查 id / email / display_name / department / role / avatar_url，密码哈希等列根本不会进入查询结果。
// users 表没有软删除与启用状态字段，所以当前不做状态过滤。
func (s *DirectoryService) List(q string, limit, offset int) ([]DirectoryUserDTO, error) {
	if s == nil || s.db == nil {
		return []DirectoryUserDTO{}, nil
	}
	if limit <= 0 {
		limit = DirectoryDefaultLimit
	}
	if limit > DirectoryMaxLimit {
		limit = DirectoryMaxLimit
	}
	if offset < 0 {
		offset = 0
	}

	tx := s.db.Model(&model.User{}).Select("id", "email", "display_name", "department", "role", "avatar_url")
	if where, args := buildDirectoryFilter(q); where != "" {
		tx = tx.Where(where, args...)
	}
	var rows []model.User
	if err := tx.Order("display_name ASC, id ASC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]DirectoryUserDTO, 0, len(rows))
	for i := range rows {
		out = append(out, DirectoryUserFromModel(&rows[i]))
	}
	return out, nil
}
