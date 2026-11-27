package base

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// 表配置包（第十六轮）
//
// 数据导出（CSV / Markdown）只导「值」，不导「结构与策略」：
// 字段类型、选项、公式、以及字段级权限策略（含条件可见）全部会丢。
// 配置包解决的是「把一张表的结构 + 策略整体搬到另一张表 / 另一个空间」。
//
// 关键点：包里的条件引用的是**导出时的字段 ID**，
// 导入时字段 ID 一定会变，所以必须做 ID 重映射，
// 否则「预算 > 10000 才看得到税额」这种条件会永远不成立（静默失效）。
// ---------------------------------------------------------------------------

// ConfigBundleFormatVersion 是配置包格式版本。
const ConfigBundleFormatVersion = 1

// ConfigBundle 是一张表的「结构 + 策略 + 视图」包。
type ConfigBundle struct {
	FormatVersion int       `json:"formatVersion"`
	ExportedAt    time.Time `json:"exportedAt"`
	// SignatureAlgorithm 是签名算法标识（HMAC-SHA256）。
	SignatureAlgorithm string `json:"signatureAlgorithm,omitempty"`
	// Signature 是包体签名（base64）。为空表示这是未签名的包（外部导入）。
	Signature string `json:"signature,omitempty"`
	Table         struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
	} `json:"table"`
	Fields []BundleField `json:"fields"`
	Views  []BundleView  `json:"views"`
}

// BundleField 是配置包里的一个字段。
type BundleField struct {
	// Key 是字段在包内的稳定引用键（导出时为原字段 ID）：
	// 条件可见等策略通过它引用别的字段，导入时据此重映射。
	Key       string         `json:"key"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Required  bool           `json:"required,omitempty"`
	IsPrimary bool           `json:"isPrimary,omitempty"`
	SortOrder int            `json:"sortOrder"`
	Config    map[string]any `json:"config,omitempty"`
	// Formula 是公式字段的表达式（公式存在 base_field_formulas 表，
	// 不在字段 config 里，所以要单独带一份）。
	Formula string `json:"formula,omitempty"`
}

// BundleView 是配置包里的一个视图（只含共享配置，个人偏好不导出）。
type BundleView struct {
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config,omitempty"`
}

// ExportTableConfig 导出一张表的配置包。
func (s *Service) ExportTableConfig(ctx context.Context, userID, projectID, tableID uuid.UUID) (*ConfigBundle, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ? AND status = 1", tableID).First(&table).Error; err != nil {
		return nil, ErrTableNotFound
	}
	bundle := &ConfigBundle{FormatVersion: ConfigBundleFormatVersion, ExportedAt: time.Now()}
	bundle.Table.Name = table.Name
	bundle.Table.Description = table.Description

	idx, err := s.loadFieldIndex(ctx, tableID)
	if err != nil {
		return nil, err
	}
	metas := make([]FieldMeta, 0, len(idx.byID))
	for _, meta := range idx.byID {
		metas = append(metas, meta)
	}
	sortFieldMetas(metas)
	for _, meta := range metas {
		formula := ""
		if meta.Type == string(FieldFormula) {
			var row BaseFieldFormula
			if err := s.db.WithContext(ctx).Where("field_id = ? AND status = 1", mustUUID(meta.ID)).
				First(&row).Error; err == nil {
				formula = row.Expression
			}
		}
		bundle.Fields = append(bundle.Fields, BundleField{
			Key:       meta.ID,
			Name:      meta.Name,
			Type:      meta.Type,
			Required:  meta.Required,
			IsPrimary: meta.IsPrimary,
			SortOrder: meta.SortOrder,
			Config:    meta.Config,
			Formula:   formula,
		})
	}

	views, err := s.ListViews(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	for _, view := range views {
		// 个人视图属于「某个人」，搬走没有意义 —— 不导出。
		if view.Scope == ViewScopePersonal {
			continue
		}
		// 个人偏好（personal 段）属于「某个人」，搬走没有意义 —— 不导出。
		cfg := map[string]any{}
		for k, v := range view.Config {
			if k == "personal" {
				continue
			}
			cfg[k] = v
		}
		bundle.Views = append(bundle.Views, BundleView{Name: view.Name, Type: view.Type, Config: cfg})
	}
	// 签名：导出即签名，导入方可校验「包是否被改过 / 是否来自本平台」。
	// 签名失败不阻断导出（拿不到密钥时仍允许导出未签名包，导入端会放行）。
	_ = s.SignBundle(bundle)
	return bundle, nil
}

// ConfigImportResult 是配置包导入结果。
type ConfigImportResult struct {
	Table *TableInfo `json:"table"`
	// Warnings 记录「包里带了但没能落地」的项（例如引用了包外字段的公式）。
	Warnings []string `json:"warnings"`
}

// MergeTableConfig 把配置包**合并进一张已有的表**（按字段名匹配）。
//
// 语义：
//   - 已存在的同名字段 → 跳过（不覆盖已有字段的类型与策略），并在 warnings 里说明；
//   - 不存在的字段 → 新建，并按需回填权限策略与公式；
//   - 条件引用了「包里没有但目标表已有」的字段 → 直接复用目标表字段 ID，条件照样生效；
//   - 视图按名字去重，已存在的视图跳过。
func (s *Service) MergeTableConfig(ctx context.Context, userID, projectID, targetTableID uuid.UUID, bundle *ConfigBundle) (*ConfigImportResult, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	if err := s.validateConfigBundle(bundle); err != nil {
		return nil, err
	}
	if err := s.VerifyBundle(bundle); err != nil {
		return nil, err
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ? AND status = 1", targetTableID).First(&table).Error; err != nil {
		return nil, ErrTableNotFound
	}
	idx, err := s.loadFieldIndex(ctx, targetTableID)
	if err != nil {
		return nil, err
	}
	existingByName := map[string]FieldMeta{}
	for _, meta := range idx.byID {
		existingByName[meta.Name] = meta
	}
	// 公式可用字段名 = 包内字段名 ∪ 目标表已有字段名。
	availableNames := map[string]bool{}
	for _, f := range bundle.Fields {
		availableNames[f.Name] = true
	}
	for name := range existingByName {
		availableNames[name] = true
	}

	remap := map[string]string{}
	remapByName := map[string]uuid.UUID{}
	var warnings []string
	type pendingField struct {
		fieldID uuid.UUID
		cfg     map[string]any
	}
	var pending []pendingField

	for _, f := range bundle.Fields {
		if exist, ok := existingByName[f.Name]; ok {
			// 同名字段已存在：保留目标表原有的类型与策略，只登记引用关系。
			remap[f.Key] = exist.ID
			remapByName[f.Name] = mustUUID(exist.ID)
			warnings = append(warnings, fmt.Sprintf("字段「%s」已存在，按字段名跳过", f.Name))
			continue
		}
		meta, err := s.CreateField(ctx, userID, projectID, targetTableID, FieldInput{
			Name:      f.Name,
			Type:      f.Type,
			Config:    stripPermissions(f.Config),
			Required:  f.Required,
			IsPrimary: f.IsPrimary,
			SortOrder: f.SortOrder,
		})
		if err != nil {
			return nil, err
		}
		if f.Key != "" {
			remap[f.Key] = meta.ID
		}
		remapByName[f.Name] = mustUUID(meta.ID)
		pending = append(pending, pendingField{fieldID: mustUUID(meta.ID), cfg: f.Config})
	}

	// 回填权限策略（引用关系此时已完整）。
	for _, p := range pending {
		if p.cfg == nil || p.cfg["permissions"] == nil {
			continue
		}
		mapped := remapFieldRefs(p.cfg, remap)
		if _, err := s.UpdateField(ctx, userID, projectID, p.fieldID, FieldUpdateInput{Config: mapped}); err != nil {
			return nil, err
		}
	}

	// 公式：只给新建的公式字段还原。
	for _, f := range bundle.Fields {
		if strings.TrimSpace(f.Formula) == "" {
			continue
		}
		fieldID, ok := remapByName[f.Name]
		if !ok || fieldID == uuid.Nil {
			continue
		}
		if _, exist := existingByName[f.Name]; exist {
			warnings = append(warnings, fmt.Sprintf("公式字段「%s」已存在，保留原公式", f.Name))
			continue
		}
		if missing := formulaMissingFields(f.Formula, availableNames); len(missing) > 0 {
			warnings = append(warnings, fmt.Sprintf("公式「%s」引用了不存在的字段（%s），已跳过", f.Name, strings.Join(missing, "、")))
			continue
		}
		if err := s.SaveFormula(ctx, userID, projectID, fieldID, f.Formula); err != nil {
			warnings = append(warnings, fmt.Sprintf("公式「%s」还原失败：%s", f.Name, err.Error()))
		}
	}

	// 视图：按名字去重。
	views, err := s.ListViews(ctx, userID, projectID, targetTableID)
	if err != nil {
		return nil, err
	}
	viewNames := map[string]bool{}
	for _, v := range views {
		viewNames[v.Name] = true
	}
	for _, v := range bundle.Views {
		if viewNames[v.Name] {
			warnings = append(warnings, fmt.Sprintf("视图「%s」已存在，按名字跳过", v.Name))
			continue
		}
		cfg := map[string]any{}
		for k, val := range v.Config {
			if k == "personal" {
				continue
			}
			cfg[k] = val
		}
		viewType := v.Type
		if viewType == "" {
			viewType = "grid"
		}
		if _, err := s.CreateView(ctx, userID, projectID, targetTableID, v.Name, viewType, cfg, ViewScopeShared); err != nil {
			return nil, err
		}
	}

	info, err := s.tableInfo(ctx, &table)
	if err != nil {
		return nil, err
	}
	return &ConfigImportResult{Table: info, Warnings: warnings}, nil
}

// validateConfigBundle 校验配置包（版本 / 字段数 / 字段名 / 字段类型）。
func (s *Service) validateConfigBundle(bundle *ConfigBundle) error {
	if bundle == nil {
		return fmt.Errorf("%w: 配置包为空", ErrFieldValueInvalid)
	}
	if bundle.FormatVersion != ConfigBundleFormatVersion {
		return fmt.Errorf("%w: 不支持的配置包版本 %d", ErrFieldValueInvalid, bundle.FormatVersion)
	}
	if len(bundle.Fields) == 0 {
		return fmt.Errorf("%w: 配置包里没有字段", ErrFieldValueInvalid)
	}
	if len(bundle.Fields) > 60 {
		return fmt.Errorf("%w: 单表字段数不能超过 60", ErrFieldValueInvalid)
	}
	for _, f := range bundle.Fields {
		if strings.TrimSpace(f.Name) == "" {
			return fmt.Errorf("%w: 字段名不能为空", ErrFieldValueInvalid)
		}
		if err := s.registry.ValidateFieldType(f.Type); err != nil {
			return fmt.Errorf("%w: 字段「%s」%s", ErrFieldValueInvalid, f.Name, err.Error())
		}
	}
	return nil
}

// ImportTableConfig 从配置包新建一张表（不覆盖原表）。
func (s *Service) ImportTableConfig(ctx context.Context, userID, projectID, baseID uuid.UUID, bundle *ConfigBundle) (*ConfigImportResult, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	if err := s.validateConfigBundle(bundle); err != nil {
		return nil, err
	}
	if err := s.VerifyBundle(bundle); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(bundle.Table.Name)
	if name == "" {
		name = "导入的表"
	}
	// 自己建表（不走 CreateTable）：CreateTable 会自动补一个「名称」主字段，
	// 那样导入后会多出一个重复字段。
	table := BaseTable{
		ID:          uuid.New(),
		BaseID:      baseID,
		Name:        name,
		Description: strings.TrimSpace(bundle.Table.Description),
		SortOrder:   int(time.Now().Unix()),
		Status:      1,
	}
	if err := s.db.WithContext(ctx).Create(&table).Error; err != nil {
		return nil, err
	}
	newTableID := table.ID

	// 字段 ID 重映射表：原字段 ID → 新字段 ID。
	remap := map[string]string{}
	// 字段名 → 新字段 ID（公式引用的是字段名）。
	remapByName := map[string]uuid.UUID{}
	// 包内字段名集合（判断公式引用的字段是否在包内）。
	bundleNames := map[string]bool{}
	for _, f := range bundle.Fields {
		bundleNames[f.Name] = true
	}
	var primaryID *uuid.UUID
	createdFields := 0
	var warnings []string

	// 第一遍：只建字段结构（不带权限策略）。
	// 策略里的条件可能引用**排序靠后**的字段（例如「税额」引用「预算」，
	// 而预算被排在后面），一次性建字段会拿不到重映射表 → 条件被误丢。
	type pendingField struct {
		fieldID uuid.UUID
		cfg     map[string]any
	}
	var pending []pendingField
	for _, f := range bundle.Fields {
		meta, err := s.CreateField(ctx, userID, projectID, newTableID, FieldInput{
			Name:      f.Name,
			Type:      f.Type,
			Config:    stripPermissions(f.Config),
			Required:  f.Required,
			IsPrimary: f.IsPrimary,
			SortOrder: f.SortOrder,
		})
		if err != nil {
			return nil, err
		}
		if f.Key != "" {
			remap[f.Key] = meta.ID
		}
		remapByName[f.Name] = mustUUID(meta.ID)
		pending = append(pending, pendingField{
			fieldID: mustUUID(meta.ID),
			cfg:     f.Config,
		})
		createdFields++
		if f.IsPrimary {
			if pid, err := uuid.Parse(meta.ID); err == nil {
				primaryID = &pid
			}
		}
	}

	// 第二遍：重映射完成后回填字段级权限策略（含条件可见）。
	for _, p := range pending {
		if p.cfg == nil || p.cfg["permissions"] == nil {
			continue
		}
		mapped := remapFieldRefs(p.cfg, remap)
		if _, err := s.UpdateField(ctx, userID, projectID, p.fieldID, FieldUpdateInput{Config: mapped}); err != nil {
			return nil, err
		}
	}
	if primaryID == nil && createdFields > 0 {
		// 包里没有标记主字段 → 用第一个字段兜底（表必须有主字段）。
		first := bundle.Fields[0]
		if fid, err := uuid.Parse(remap[first.Key]); err == nil {
			primaryID = &fid
		}
	}
	if primaryID != nil {
		table.PrimaryFieldID = primaryID
		if err := s.db.WithContext(ctx).Model(&BaseTable{}).
			Where("id = ?", table.ID).Update("primary_field_id", *primaryID).Error; err != nil {
			return nil, err
		}
	}
	if err := s.bumpSchema(s.db.WithContext(ctx), table.ID); err != nil {
		return nil, err
	}

	// 视图：只导入共享配置。
	for _, v := range bundle.Views {
		cfg := map[string]any{}
		for k, val := range v.Config {
			if k == "personal" {
				continue
			}
			cfg[k] = val
		}
		viewType := v.Type
		if viewType == "" {
			viewType = "grid"
		}
		if _, err := s.CreateView(ctx, userID, projectID, newTableID, v.Name, viewType, cfg, ViewScopeShared); err != nil {
			return nil, err
		}
	}

	// 公式：公式引用的是字段名（{预算}），字段名在新表里不变，所以可以直接落地。
	// 但引用了包外字段（跨表引用）的公式无法还原 —— 跳过并给出提示，
	// 绝不能塞一个「永远算错」的公式进去。
	for _, f := range bundle.Fields {
		if strings.TrimSpace(f.Formula) == "" {
			continue
		}
		fieldID, ok := remapByName[f.Name]
		if !ok || fieldID == uuid.Nil {
			continue
		}
		if missing := formulaMissingFields(f.Formula, bundleNames); len(missing) > 0 {
			warnings = append(warnings, fmt.Sprintf("公式「%s」引用了配置包外的字段（%s），已跳过", f.Name, strings.Join(missing, "、")))
			continue
		}
		if err := s.SaveFormula(ctx, userID, projectID, fieldID, f.Formula); err != nil {
			warnings = append(warnings, fmt.Sprintf("公式「%s」还原失败：%s", f.Name, err.Error()))
		}
	}

	info, err := s.tableInfo(ctx, &BaseTable{ID: newTableID, BaseID: baseID, Name: name, Description: bundle.Table.Description})
	if err != nil {
		return nil, err
	}
	return &ConfigImportResult{Table: info, Warnings: warnings}, nil
}

// formulaMissingFields 找出公式里引用了、但不在配置包内的字段名。
func formulaMissingFields(expression string, names map[string]bool) []string {
	missing := []string{}
	seen := map[string]bool{}
	for _, part := range strings.Split(expression, "{") {
		end := strings.IndexByte(part, '}')
		if end < 0 {
			continue
		}
		name := strings.TrimSpace(part[:end])
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		if !names[name] {
			missing = append(missing, name)
		}
	}
	return missing
}

// remapFieldRefs 把配置里对「其它字段」的引用改成新表里的字段 ID。
//
// 目前只有条件可见 / 条件隐藏会跨字段引用。
// 引用的字段不在包里（跨表引用）时，条件被丢弃 —— 宁可少一条策略，
// 也不要留一条永远不成立的「假策略」。
func remapFieldRefs(cfg map[string]any, remap map[string]string) map[string]any {
	if cfg == nil {
		return nil
	}
	out := make(map[string]any, len(cfg))
	for k, v := range cfg {
		out[k] = v
	}
	perms, ok := out["permissions"].(map[string]any)
	if !ok {
		return out
	}
	newPerms := make(map[string]any, len(perms))
	for k, v := range perms {
		newPerms[k] = v
	}
	for _, key := range []string{"visibleWhen", "hiddenWhen"} {
		group, ok := newPerms[key].(map[string]any)
		if !ok {
			continue
		}
		conds, _ := group["conditions"].([]any)
		kept := make([]any, 0, len(conds))
		for _, item := range conds {
			cond, ok := item.(map[string]any)
			if !ok {
				continue
			}
			oldID, _ := cond["fieldId"].(string)
			newID, ok := remap[oldID]
			if !ok || newID == "" {
				// 引用的字段不在包里 → 丢弃这条条件。
				continue
			}
			next := make(map[string]any, len(cond))
			for k, v := range cond {
				next[k] = v
			}
			next["fieldId"] = newID
			kept = append(kept, next)
		}
		if len(kept) == 0 {
			delete(newPerms, key)
			continue
		}
		nextGroup := make(map[string]any, len(group))
		for k, v := range group {
			nextGroup[k] = v
		}
		nextGroup["conditions"] = kept
		newPerms[key] = nextGroup
	}
	out["permissions"] = newPerms
	return out
}

// stripPermissions 复制一份配置并去掉权限策略（第一遍建字段时用）。
func stripPermissions(cfg map[string]any) map[string]any {
	if cfg == nil {
		return nil
	}
	out := make(map[string]any, len(cfg))
	for k, v := range cfg {
		if k == "permissions" {
			continue
		}
		out[k] = v
	}
	return out
}

// mustUUID 把字段 ID 字符串转成 UUID；非法时返回 Nil。
func mustUUID(id string) uuid.UUID {
	pid, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil
	}
	return pid
}

// 供 handler 序列化使用。
var _ = json.Marshal
