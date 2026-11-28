package base

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"gorm.io/datatypes"

	"metamatrix/api/internal/model"
)

// sortFieldMetas 按 sortOrder 排序。
func sortFieldMetas(metas []FieldMeta) {
	sort.Slice(metas, func(i, j int) bool { return metas[i].SortOrder < metas[j].SortOrder })
}

// ---------------------------------------------------------------------------
// 字段级权限策略（技术方案第 8 章 · P1）
//
// 字段配置里可以声明 `permissions`：
//
//	{
//	  "permissions": {
//	    "hidden":   ["viewer"],   // 这些角色**看不到**该字段
//	    "readOnly": ["viewer"]    // 这些角色能看但不能改
//	  }
//	}
//
// 设计要点（对齐技术方案）：
//   - 「字段隐藏 ≠ 字段安全」：隐藏字段的**值根本不过网**，
//     服务端在返回记录与字段元信息前就把它们剔除；
//   - 只读在服务端拦截：只读字段的写入直接 422，不依赖前端禁用；
//   - 未声明 permissions 的字段对所有角色可见可编辑（保持既有行为）。
// ---------------------------------------------------------------------------

// fieldPolicy 是一个字段的权限策略。
//
// 配置格式（两种都支持，写入统一用第一种）：
//
//	{
//	  "permissions": {
//	    "hidden":   ["viewer"],          // 旧格式：角色数组
//	    "readOnly": ["viewer"],
//	    "hiddenUsers":   ["用户ID"],     // 新格式：按人
//	    "readOnlyUsers": ["用户ID"]
//	  }
//	}
//
// 也支持对象写法（便于将来扩展）：{"hidden": {"roles": [...], "users": [...]}}。
type fieldPolicy struct {
	// Hidden 是看不到该字段的角色。
	Hidden []string `json:"hidden"`
	// ReadOnly 是只能查看、不能修改的角色。
	ReadOnly []string `json:"readOnly"`
	// HiddenUsers 是看不到该字段的具体成员（角色之外，按人粒度）。
	HiddenUsers []string `json:"hiddenUsers"`
	// ReadOnlyUsers 是只能查看、不能修改的具体成员。
	ReadOnlyUsers []string `json:"readOnlyUsers"`
	// VisibleWhen 非空时：只有满足条件的记录才看得到该字段（条件可见）。
	VisibleWhen *fieldConditionGroup `json:"visibleWhen"`
	// HiddenWhen 非空时：满足条件的记录看不到该字段（条件隐藏）。
	HiddenWhen *fieldConditionGroup `json:"hiddenWhen"`
}

// fieldCondition 是「条件可见 / 条件隐藏」里的一条条件。
//
//	{"fieldId": "预算字段 ID", "operator": "gt", "value": 10000}
type fieldCondition struct {
	FieldID  string `json:"fieldId"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
}

// fieldConditionGroup 是一组条件（AND / OR）。
type fieldConditionGroup struct {
	Logic      string           `json:"logic"`
	Conditions []fieldCondition `json:"conditions"`
}

// parseFieldPolicy 从字段配置里解析权限策略。
func parseFieldPolicy(meta FieldMeta) fieldPolicy {
	out := fieldPolicy{}
	raw, ok := meta.Config["permissions"]
	if !ok {
		return out
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return out
	}
	out.Hidden, out.HiddenUsers = subjectList(obj["hidden"])
	out.ReadOnly, out.ReadOnlyUsers = subjectList(obj["readOnly"])
	if users := roleList(obj["hiddenUsers"]); len(users) > 0 {
		out.HiddenUsers = append(out.HiddenUsers, users...)
	}
	if users := roleList(obj["readOnlyUsers"]); len(users) > 0 {
		out.ReadOnlyUsers = append(out.ReadOnlyUsers, users...)
	}
	out.VisibleWhen = parseConditionGroup(obj["visibleWhen"])
	out.HiddenWhen = parseConditionGroup(obj["hiddenWhen"])
	return out
}

// parseConditionGroup 解析条件组（visibleWhen / hiddenWhen）。
func parseConditionGroup(raw any) *fieldConditionGroup {
	obj, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	group := &fieldConditionGroup{Logic: "AND"}
	if logic, ok := obj["logic"].(string); ok && (logic == "AND" || logic == "OR") {
		group.Logic = logic
	}
	list, _ := obj["conditions"].([]any)
	for _, item := range list {
		cond, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fieldID, _ := cond["fieldId"].(string)
		operator, _ := cond["operator"].(string)
		if fieldID == "" || operator == "" {
			continue
		}
		group.Conditions = append(group.Conditions, fieldCondition{
			FieldID:  fieldID,
			Operator: operator,
			Value:    cond["value"],
		})
	}
	if len(group.Conditions) == 0 {
		return nil
	}
	return group
}

// subjectList 解析「角色 + 按人」两种目标：
//   - 数组 / 字符串 → 角色列表；
//   - 对象 {roles: [...], users: [...]} → 分别返回角色与用户。
func subjectList(raw any) (roles []string, users []string) {
	switch v := raw.(type) {
	case map[string]any:
		roles = roleList(v["roles"])
		users = roleList(v["users"])
	case []string:
		roles = v
	case []any:
		roles = roleList(v)
	case string:
		if v != "" {
			roles = []string{v}
		}
	}
	return roles, users
}

// roleList 把配置里的角色数组转成字符串数组。
func roleList(raw any) []string {
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		if v != "" {
			return []string{v}
		}
	}
	return nil
}

// roleIn 判断角色是否在列表里（大小写不敏感）。
func roleIn(list []string, role string) bool {
	for _, item := range list {
		if item == role {
			return true
		}
	}
	return false
}

// policySubject 是「当前请求人」在权限判定里的身份。
//
// 判定要同时看角色与具体的人：
//   - 角色是空间级的粗粒度（访客 / 编辑者 / 管理者）；
//   - 人是细粒度（只把某个字段对某个人隐藏 / 只读）。
//
// 管理者永远不受限制（否则「设置权限的人自己也看不到」会成为死结）。
type policySubject struct {
	role   string
	userID uuid.UUID
}

// isAdmin 是否空间管理者。
func (p policySubject) isAdmin() bool {
	return p.role == RoleAdmin || roleRank(p.role) >= roleRank(RoleAdmin)
}

// subjectOf 取当前请求人的权限身份。
func (s *Service) subjectOf(userID, projectID uuid.UUID) policySubject {
	return policySubject{role: s.roleOf(userID, projectID), userID: userID}
}

// hiddenFor 该字段对当前身份是否隐藏。
func hiddenFor(meta FieldMeta, subj policySubject) bool {
	if subj.role == "" || subj.isAdmin() {
		return false
	}
	policy := parseFieldPolicy(meta)
	if roleIn(policy.Hidden, subj.role) {
		return true
	}
	return userIn(policy.HiddenUsers, subj.userID)
}

// readOnlyFor 该字段对当前身份是否只读。
func readOnlyFor(meta FieldMeta, subj policySubject) bool {
	if subj.role == "" || subj.isAdmin() {
		return false
	}
	policy := parseFieldPolicy(meta)
	if roleIn(policy.ReadOnly, subj.role) {
		return true
	}
	return userIn(policy.ReadOnlyUsers, subj.userID)
}

// userIn 判断用户是否在「按人」列表里。
func userIn(list []string, userID uuid.UUID) bool {
	if userID == uuid.Nil {
		return false
	}
	target := userID.String()
	for _, item := range list {
		if strings.EqualFold(strings.TrimSpace(item), target) {
			return true
		}
	}
	return false
}

// filterIndexForSubject 按权限身份裁剪字段索引（隐藏字段直接剔除）。
func filterIndexForSubject(idx *fieldIndex, subj policySubject) *fieldIndex {
	out := &fieldIndex{byID: map[uuid.UUID]FieldMeta{}, handlers: map[uuid.UUID]FieldHandler{}}
	for id, meta := range idx.byID {
		if hiddenFor(meta, subj) {
			continue
		}
		out.byID[id] = meta
		if handler, ok := idx.handlers[id]; ok {
			out.handlers[id] = handler
		}
	}
	return out
}

// stripHiddenFields 从记录数据里剔除隐藏字段的值。
func stripHiddenFields(fields map[string]any, idx *fieldIndex, subj policySubject) map[string]any {
	out, _ := stripHiddenFieldsWithReasons(fields, idx, subj)
	return out
}

// stripHiddenFieldsWithReasons 剔除隐藏字段的值，并额外返回
// 「因条件可见策略而隐藏」的字段 ID 列表（界面据此显示占位符）。
func stripHiddenFieldsWithReasons(fields map[string]any, idx *fieldIndex, subj policySubject) (map[string]any, []string) {
	out := make(map[string]any, len(fields))
	var conditionalHidden []string
	for key, value := range fields {
		if fid, err := uuid.Parse(key); err == nil {
			if meta, ok := idx.byID[fid]; ok {
				if hiddenFor(meta, subj) {
					continue
				}
				// 条件可见：这一行不满足条件时，值同样不过网。
				// 与「按角色隐藏」不同，条件可见对所有人一致生效（含空间管理者）——
				// 它描述的是数据本身的可读性，而不是某类人的权限。
				if !conditionalVisible(meta, fields) {
					continue
				}
			}
		}
		out[key] = value
	}
	// 补齐「配了条件可见、但本行不满足」的字段：
	// 即使它本来就没有值，也要告诉界面「这是被条件挡住的」，而不是空值。
	for id, meta := range idx.byID {
		if !conditionalVisible(meta, fields) {
			conditionalHidden = append(conditionalHidden, id.String())
		}
	}
	sort.Strings(conditionalHidden)
	return out, conditionalHidden
}

// conditionalVisible 判断「这条记录」能不能看到该字段。
//
// 规则：hiddenWhen 命中即不可见；visibleWhen 配置了但不满足也不可见；
// 两边都没配则一律可见（字段不会因为没有条件而消失）。
func conditionalVisible(meta FieldMeta, fields map[string]any) bool {
	policy := parseFieldPolicy(meta)
	if policy.VisibleWhen == nil && policy.HiddenWhen == nil {
		return true
	}
	if policy.HiddenWhen != nil && matchConditionGroup(policy.HiddenWhen, fields) {
		return false
	}
	if policy.VisibleWhen != nil && !matchConditionGroup(policy.VisibleWhen, fields) {
		return false
	}
	return true
}

// matchConditionGroup 求值一组条件（AND / OR）。
func matchConditionGroup(group *fieldConditionGroup, fields map[string]any) bool {
	if group == nil || len(group.Conditions) == 0 {
		return false
	}
	if group.Logic == "OR" {
		for _, cond := range group.Conditions {
			if matchCondition(cond, fields) {
				return true
			}
		}
		return false
	}
	for _, cond := range group.Conditions {
		if !matchCondition(cond, fields) {
			return false
		}
	}
	return true
}

// matchCondition 求值单条条件。
func matchCondition(cond fieldCondition, fields map[string]any) bool {
	actual := fields[cond.FieldID]
	switch cond.Operator {
	case "isempty":
		return isEmptyValue(actual)
	case "isnotempty":
		return !isEmptyValue(actual)
	case "eq", "is":
		return valueEquals(actual, cond.Value)
	case "ne", "isnot":
		return !valueEquals(actual, cond.Value)
	case "contains":
		return valueContains(actual, cond.Value)
	case "notcontains":
		return !valueContains(actual, cond.Value)
	case "startswith":
		return strings.HasPrefix(valueText(actual), valueText(cond.Value))
	case "endswith":
		return strings.HasSuffix(valueText(actual), valueText(cond.Value))
	case "gt", "gte", "lt", "lte":
		a, okA := toFloat(actual)
		b, okB := toFloat(cond.Value)
		if !okA || !okB {
			return false
		}
		switch cond.Operator {
		case "gt":
			return a > b
		case "gte":
			return a >= b
		case "lt":
			return a < b
		default:
			return a <= b
		}
	default:
		return false
	}
}

// isEmptyValue 判断字段值是否为空。
func isEmptyValue(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v) == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	default:
		return false
	}
}

// valueText 把字段值转成可比较的文本。
func valueText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, valueText(item))
		}
		return strings.Join(parts, "、")
	default:
		return fmt.Sprintf("%v", value)
	}
}

// valueEquals 比较两个字段值（数字按数值比，其余按文本比）。
func valueEquals(actual, expected any) bool {
	if a, ok := toFloat(actual); ok {
		if b, okB := toFloat(expected); okB {
			return a == b
		}
	}
	if a, ok := actual.(bool); ok {
		if b, okB := expected.(bool); okB {
			return a == b
		}
	}
	return valueText(actual) == valueText(expected)
}

// valueContains 判断字段值是否包含目标文本（多值字段逐项匹配）。
func valueContains(actual, expected any) bool {
	if list, ok := actual.([]any); ok {
		for _, item := range list {
			if valueContains(item, expected) {
				return true
			}
		}
		return false
	}
	return strings.Contains(valueText(actual), valueText(expected))
}

// assertWritableFields 校验当前角色是否可以写这些字段。
//
// 只读字段被写入时直接拒绝（42201），不依赖前端禁用输入框。
//
// record 是「这条记录合并后的值」（旧值 + 本次提交）：
// 条件可见的字段在当前记录上不可见时，同样不允许写入
// （否则可以先写进去，再靠条件隐藏来「装作没写过」）。
func (s *Service) assertWritableFields(idx *fieldIndex, subj policySubject, values map[string]any, record map[string]any) error {
	for key := range values {
		fid, err := uuid.Parse(key)
		if err != nil {
			continue
		}
		meta, ok := idx.byID[fid]
		if !ok {
			continue
		}
		if readOnlyFor(meta, subj) {
			return fmt.Errorf("%w: %s 对当前角色只读", ErrFieldValueInvalid, meta.Name)
		}
		if record != nil && !conditionalVisible(meta, record) {
			return fmt.Errorf("%w: %s 在当前记录上不满足可见条件", ErrFieldValueInvalid, meta.Name)
		}
	}
	return nil
}

// roleOf 取用户在空间内的角色（空串表示无权访问）。
func (s *Service) roleOf(userID, projectID uuid.UUID) string {
	return s.spaceRole(userID, projectID)
}

// fieldMetasForSubject 输出字段元信息，并标记当前身份下只读的字段。
func fieldMetasForSubject(idx *fieldIndex, subj policySubject) []FieldMeta {
	out := make([]FieldMeta, 0, len(idx.byID))
	for _, meta := range idx.byID {
		meta.ReadOnly = readOnlyFor(meta, subj)
		// 条件可见：字段本身仍然列出（有的记录看得到），但要标出来。
		policy := parseFieldPolicy(meta)
		meta.Conditional = policy.VisibleWhen != nil || policy.HiddenWhen != nil
		out = append(out, meta)
	}
	return out
}

// viewerFields 返回当前角色可见的字段列表（已剔除隐藏字段）。
func (s *Service) viewerFields(ctx context.Context, userID, projectID, tableID uuid.UUID) ([]FieldMeta, error) {
	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	subj := s.subjectOf(userID, projectID)
	filtered := filterIndexForSubject(idx, subj)
	metas := fieldMetasForSubject(filtered, subj)
	sortFieldMetas(metas)
	return metas, nil
}

// fieldIDsOf 取出一组字段值对应的字段 ID 列表。
func fieldIDsOf(values map[string]any) []string {
	out := make([]string, 0, len(values))
	for key := range values {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// AuditEntry 是一条操作记录（附操作者显示名）。
type AuditEntry struct {
	BaseOperationLog
	// OperatorName 是操作者的显示名（找不到时回退到 ID 前 8 位）。
	OperatorName string `json:"operatorName"`
	// TableName 是被操作的数据表名（审计可能来自其它表）。
	TableName string `json:"tableName"`
	// FieldNames 是「字段 ID → 字段名」。审计记录可能来自同一 base 的其它表，
	// 前端只拿到当前表的字段表，必须由服务端补齐映射，否则会显示裸 ID。
	FieldNames map[string]string `json:"fieldNames"`
}

// ListAuditEntries 列出操作记录，并补上操作者显示名。
func (s *Service) ListAuditEntries(ctx context.Context, userID, projectID, baseID uuid.UUID, q AuditQuery) ([]AuditEntry, int64, error) {
	logs, total, err := s.ListAudit(ctx, userID, projectID, baseID, q)
	if err != nil {
		return nil, 0, err
	}
	// 批量取操作者显示名，避免 N+1 查询。
	ids := make([]uuid.UUID, 0, len(logs))
	seen := map[uuid.UUID]bool{}
	for _, item := range logs {
		if item.OperatorID != uuid.Nil && !seen[item.OperatorID] {
			seen[item.OperatorID] = true
			ids = append(ids, item.OperatorID)
		}
	}
	names := map[uuid.UUID]string{}
	if len(ids) > 0 {
		type userRow struct {
			ID          uuid.UUID
			DisplayName string
			Email       string
		}
		var users []userRow
		if err := s.db.WithContext(ctx).Model(&model.User{}).
			Select("id, display_name, email").
			Where("id IN ?", ids).Find(&users).Error; err == nil {
			for _, user := range users {
				name := strings.TrimSpace(user.DisplayName)
				if name == "" {
					name = user.Email
				}
				names[user.ID] = name
			}
		}
	}
	out := make([]AuditEntry, 0, len(logs))
	subj := s.subjectOf(userID, projectID)
	// 审计记录里存了变更前后的值：隐藏字段的值不能随审计一起发给访客。
	indexCache := map[uuid.UUID]*fieldIndex{}
	tableNameCache := map[uuid.UUID]string{}
	for _, item := range logs {
		name := names[item.OperatorID]
		if name == "" {
			name = item.OperatorID.String()[:8]
		}
		entry := AuditEntry{BaseOperationLog: item, OperatorName: name}
		if item.TableID != nil {
			idx, ok := indexCache[*item.TableID]
			if !ok {
				loaded, err := s.loadFieldIndex(ctx, *item.TableID)
				if err == nil {
					idx = loaded
				}
				indexCache[*item.TableID] = idx
			}
			if idx != nil {
				before := s.humanizeAuditValues(ctx, stripHiddenJSON(item.BeforeData, idx, subj), idx)
				after := s.humanizeAuditValues(ctx, stripHiddenJSON(item.AfterData, idx, subj), idx)
				entry.BeforeData = before
				entry.AfterData = after
			}
			// 字段名映射：审计可能来自 base 内其它表。
			entry.FieldNames = map[string]string{}
			if idx != nil {
				for fid, meta := range idx.byID {
					entry.FieldNames[fid.String()] = meta.Name
				}
			}
			tname, ok := tableNameCache[*item.TableID]
			if !ok {
				var table BaseTable
				if err := s.db.WithContext(ctx).Select("id, name").Where("id = ?", *item.TableID).First(&table).Error; err == nil {
					tname = table.Name
				}
				tableNameCache[*item.TableID] = tname
			}
			entry.TableName = tname
		}
		out = append(out, entry)
	}
	return out, total, nil
}

// humanizeAuditValues 把审计快照里的「关联记录 ID / 成员 ID」换成可读标题。
//
// 审计里直接写 UUID 对使用者毫无意义（"关联合同 6fae77a3-… → （空）"），
// 这里按字段类型解析成记录标题 / 成员显示名；解析不到的保留原值。
func (s *Service) humanizeAuditValues(ctx context.Context, raw datatypes.JSON, idx *fieldIndex) datatypes.JSON {
	if len(raw) == 0 || idx == nil {
		return raw
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return raw
	}
	changed := false
	titleCache := map[uuid.UUID]string{}
	nodeCache := map[uuid.UUID]string{}
	for fieldID, meta := range idx.byID {
		key := meta.ID
		if key == "" {
			key = fieldID.String()
		}
		val, ok := data[key]
		if !ok || val == nil {
			continue
		}
		switch meta.Type {
		case "link":
			humanized := s.humanizeLinkValue(ctx, val, titleCache)
			if humanized != nil {
				data[key] = humanized
				changed = true
			}
		case "user":
			humanized := s.humanizeUserValue(ctx, val)
			if humanized != nil {
				data[key] = humanized
				changed = true
			}
		case "doc":
			humanized := s.humanizeDocValue(ctx, val, nodeCache)
			if humanized != nil {
				data[key] = humanized
				changed = true
			}
		}
	}
	if !changed {
		return raw
	}
	out, err := json.Marshal(data)
	if err != nil {
		return raw
	}
	return datatypes.JSON(out)
}

// humanizeLinkValue 把关联记录字段值（UUID 或 UUID 数组）换成记录标题数组。
func (s *Service) humanizeLinkValue(ctx context.Context, val any, cache map[uuid.UUID]string) []any {
	var ids []uuid.UUID
	switch v := val.(type) {
	case string:
		if id, err := uuid.Parse(v); err == nil {
			ids = []uuid.UUID{id}
		}
	case []any:
		for _, item := range v {
			if str, ok := item.(string); ok {
				if id, err := uuid.Parse(str); err == nil {
					ids = append(ids, id)
				}
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		title, ok := cache[id]
		if !ok {
			title = ""
			if t, err := s.recordTitle(ctx, id, nil); err == nil {
				title = t
			}
			cache[id] = title
		}
		if title == "" {
			title = id.String()[:8]
		}
		out = append(out, title)
	}
	return out
}

// humanizeUserValue 把成员字段值换成成员显示名。
func (s *Service) humanizeUserValue(ctx context.Context, val any) any {
	var ids []string
	switch v := val.(type) {
	case string:
		if _, err := uuid.Parse(v); err == nil {
			ids = []string{v}
		}
	case []any:
		for _, item := range v {
			if str, ok := item.(string); ok {
				if _, err := uuid.Parse(str); err == nil {
					ids = append(ids, str)
				}
			}
		}
	}
	if len(ids) == 0 {
		// 值本身已经是显示名（历史数据），原样返回，不要截断。
		return nil
	}
	names := map[string]string{}
	var users []model.User
	if err := s.db.WithContext(ctx).Model(&model.User{}).
		Select("id, display_name, email").
		Where("id IN ?", ids).Find(&users).Error; err == nil {
		for _, u := range users {
			name := strings.TrimSpace(u.DisplayName)
			if name == "" {
				name = u.Email
			}
			names[u.ID.String()] = name
		}
	}
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		if name, ok := names[id]; ok && name != "" {
			out = append(out, name)
			continue
		}
		// UUID 是 ASCII，截前 8 位安全（绝不能对中文按字节截断）。
		out = append(out, id[:8])
	}
	if len(out) == 1 {
		return out[0]
	}
	return out
}

// humanizeDocValue 把关联文档字段值（知识库节点 ID）换成节点标题。
func (s *Service) humanizeDocValue(ctx context.Context, val any, cache map[uuid.UUID]string) []any {
	var ids []uuid.UUID
	switch v := val.(type) {
	case string:
		if id, err := uuid.Parse(v); err == nil {
			ids = []uuid.UUID{id}
		}
	case []any:
		for _, item := range v {
			if str, ok := item.(string); ok {
				if id, err := uuid.Parse(str); err == nil {
					ids = append(ids, id)
				}
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		title, ok := cache[id]
		if !ok {
			title = ""
			var node model.KnowledgeNode
			if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
				Select("id, title").Where("id = ?", id).First(&node).Error; err == nil {
				title = node.Title
			}
			cache[id] = title
		}
		if title == "" {
			title = id.String()[:8]
		}
		out = append(out, title)
	}
	return out
}

// stripHiddenJSON 从审计记录的 JSON 快照里剔除对当前角色不可见的字段。
func stripHiddenJSON(raw datatypes.JSON, idx *fieldIndex, subj policySubject) datatypes.JSON {
	if len(raw) == 0 {
		return raw
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return raw
	}
	stripped := stripHiddenFields(data, idx, subj)
	out, err := json.Marshal(stripped)
	if err != nil {
		return raw
	}
	return datatypes.JSON(out)
}

// isEmptyPermissions 判断权限策略是否为空（没有任何规则）。
//
// 空策略与「没有策略」等价，落库时直接删掉 permissions 键，
// 避免字段配置里堆一堆空数组。
func isEmptyPermissions(raw any) bool {
	switch v := raw.(type) {
	case nil:
		return true
	case map[string]any:
		for key, item := range v {
			// 条件可见 / 条件隐藏：只要有条件，就不算「空策略」。
			if key == "visibleWhen" || key == "hiddenWhen" {
				if group := parseConditionGroup(item); group != nil {
					return false
				}
				continue
			}
			roles, users := subjectList(item)
			if len(roles) > 0 || len(users) > 0 {
				return false
			}
			// 兼容直接给用户数组的写法（hiddenUsers / readOnlyUsers）。
			if len(roleList(item)) > 0 {
				return false
			}
			_ = key
		}
		return true
	case []any:
		return len(v) == 0
	case []string:
		return len(v) == 0
	}
	return false
}
