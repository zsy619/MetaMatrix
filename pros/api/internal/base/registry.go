package base

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// FieldType 是字段类型标识。新增类型只需注册一个 FieldHandler。
type FieldType string

// 首批字段类型。
const (
	FieldText         FieldType = "text"
	FieldLongText     FieldType = "long_text"
	FieldNumber       FieldType = "number"
	FieldCurrency     FieldType = "currency"
	FieldPercent      FieldType = "percent"
	FieldRating       FieldType = "rating"
	FieldDate         FieldType = "date"
	FieldDateTime     FieldType = "datetime"
	FieldCheckbox     FieldType = "checkbox"
	FieldSingleSelect FieldType = "single_select"
	FieldMultiSelect  FieldType = "multi_select"
	FieldEmail        FieldType = "email"
	FieldPhone        FieldType = "phone"
	FieldURL          FieldType = "url"
	FieldUser         FieldType = "user"
	FieldAttachment   FieldType = "attachment"
	FieldFormula      FieldType = "formula"
	FieldLink         FieldType = "link"
	FieldDoc          FieldType = "doc"
	// FieldLookup 引用字段：把关联记录里的某个字段「引」过来（可多值）。
	FieldLookup FieldType = "lookup"
	// FieldRollup 汇总字段：对关联记录里的某个字段做聚合（求和 / 平均 / 计数…）。
	FieldRollup FieldType = "rollup"
)

// 字段值在查询投影表里的物理列类型。
const (
	ProjectedText   = "text"
	ProjectedNumber = "number"
	ProjectedDate   = "date"
	ProjectedBool   = "bool"
	ProjectedJSON   = "json"
)

// ErrUnsupportedType 表示字段类型未注册。
var ErrUnsupportedType = errors.New("unsupported field type")

// FieldCapabilities 描述字段类型支持哪些能力。
// Query Engine 会据此拒绝不支持的筛选/排序/分组操作。
type FieldCapabilities struct {
	Editable   bool `json:"editable"`
	Filterable bool `json:"filterable"`
	Sortable   bool `json:"sortable"`
	Groupable  bool `json:"groupable"`
	Indexable  bool `json:"indexable"`
	Computed   bool `json:"computed"`
}

// FieldDefinition 是字段类型的元数据声明。
type FieldDefinition struct {
	Type         FieldType         `json:"type"`
	Label        string            `json:"label"`
	Icon         string            `json:"icon"`
	Version      int               `json:"version"`
	Color        string            `json:"color"`
	Description  string            `json:"description"`
	ConfigSchema map[string]any    `json:"configSchema"`
	Capabilities FieldCapabilities `json:"capabilities"`
}

// FieldHandler 是字段类型的统一处理接口。
//
// 约定：字段处理器不直接拼 SQL，筛选/排序表达式由 Query Engine 在受控体系内构建。
type FieldHandler interface {
	Definition() FieldDefinition
	// ValidateConfig 校验字段配置（选项、精度等）。
	ValidateConfig(cfg map[string]any) error
	// ValidateValue 校验字段值。
	ValidateValue(v any, cfg map[string]any) error
	// Normalize 把任意输入归一化为存储值。
	Normalize(v any, cfg map[string]any) (any, error)
	// ProjectedType 返回查询投影的物理类型。
	ProjectedType() string
	// Text 给出用于展示/搜索的文本形态。
	Text(v any) string
}

// —— 通用工具 ——

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func stringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			out = append(out, fmt.Sprintf("%v", item))
		}
		return out
	case nil:
		return nil
	default:
		return []string{fmt.Sprintf("%v", v)}
	}
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func toBool(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		return s == "true" || s == "1" || s == "yes"
	default:
		return false
	}
}

// parseTime 解析日期/时间字符串，失败返回 error。
func parseTime(v any) (time.Time, error) {
	switch t := v.(type) {
	case time.Time:
		return t, nil
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return time.Time{}, errors.New("empty date")
		}
		layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05", "2006-01-02 15:04", "2006-01-02"}
		for _, layout := range layouts {
			if ts, err := time.Parse(layout, s); err == nil {
				return ts, nil
			}
		}
		return time.Time{}, fmt.Errorf("invalid date: %s", s)
	default:
		return time.Time{}, errors.New("invalid date type")
	}
}

// —— 字段处理器实现 ——

type textHandler struct{}

func (textHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldText, Label: "文本", Icon: "text", Version: 1, Color: "#3390ec",
		Description: "单行文本，适合姓名、标题这类短内容",
		ConfigSchema: map[string]any{
			"maxLength": map[string]any{"type": "integer", "default": 200, "min": 1, "max": 2000},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
}
func (h textHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["maxLength"]; ok {
		n, ok := toFloat(v)
		if !ok || n <= 0 || n > 2000 {
			return errors.New("maxLength must be between 1 and 2000")
		}
	}
	return nil
}
func (h textHandler) ValidateValue(v any, cfg map[string]any) error {
	if v == nil {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return errors.New("text value must be a string")
	}
	if max, ok := cfg["maxLength"]; ok {
		if n, ok := toFloat(max); ok && float64(len([]rune(s))) > n {
			return fmt.Errorf("length exceeds %d", int(n))
		}
	}
	return nil
}
func (h textHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return "", nil
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s), nil
	}
	return fmt.Sprintf("%v", v), nil
}
func (h textHandler) ProjectedType() string { return ProjectedText }
func (h textHandler) Text(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}

type longTextHandler struct{}

func (longTextHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldLongText, Label: "长文本", Icon: "document", Version: 1, Color: "#8b5cf6",
		Description:  "多行文本，适合备注、描述这类长内容",
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: false, Groupable: false, Indexable: true},
	}
}
func (h longTextHandler) ValidateConfig(map[string]any) error { return nil }
func (h longTextHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	if _, ok := v.(string); !ok {
		return errors.New("long text value must be a string")
	}
	return nil
}
func (h longTextHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return "", nil
	}
	s, _ := v.(string)
	return s, nil
}
func (h longTextHandler) ProjectedType() string { return ProjectedText }
func (h longTextHandler) Text(v any) string {
	s, _ := v.(string)
	return s
}

type numberHandler struct {
	kind    FieldType
	label   string
	icon    string
	color   string
	minimum *float64
	maximum *float64
}

func (h numberHandler) Definition() FieldDefinition {
	def := FieldDefinition{
		Type: h.kind, Label: h.label, Icon: h.icon, Version: 1, Color: h.color,
		Description: "数值字段，可参与公式、统计与排序",
		ConfigSchema: map[string]any{
			"precision": map[string]any{"type": "integer", "default": 2, "min": 0, "max": 6},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
	if h.minimum != nil {
		def.ConfigSchema["min"] = *h.minimum
	}
	if h.maximum != nil {
		def.ConfigSchema["max"] = *h.maximum
	}
	return def
}
func (h numberHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["precision"]; ok {
		n, ok := toFloat(v)
		if !ok || n < 0 || n > 6 {
			return errors.New("precision must be between 0 and 6")
		}
	}
	return nil
}
func (h numberHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil || v == "" {
		return nil
	}
	if _, ok := toFloat(v); !ok {
		return errors.New("number value must be numeric")
	}
	return nil
}
func (h numberHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil || v == "" {
		return float64(0), nil
	}
	f, ok := toFloat(v)
	if !ok {
		return nil, errors.New("number value must be numeric")
	}
	return f, nil
}
func (h numberHandler) ProjectedType() string { return ProjectedNumber }
func (h numberHandler) Text(v any) string {
	f, ok := toFloat(v)
	if !ok {
		return ""
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

type ratingHandler struct{}

func (ratingHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldRating, Label: "评分", Icon: "star", Version: 1, Color: "#f7bc2f",
		Description: "0–5 星评分",
		ConfigSchema: map[string]any{
			"max": map[string]any{"type": "integer", "default": 5, "min": 1, "max": 10},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
}
func (ratingHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["max"]; ok {
		n, ok := toFloat(v)
		if !ok || n < 1 || n > 10 {
			return errors.New("max must be between 1 and 10")
		}
	}
	return nil
}
func (ratingHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil || v == "" {
		return nil
	}
	f, ok := toFloat(v)
	if !ok || f < 0 || f > 10 {
		return errors.New("rating must be a number between 0 and 10")
	}
	return nil
}
func (ratingHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil || v == "" {
		return float64(0), nil
	}
	f, ok := toFloat(v)
	if !ok {
		return nil, errors.New("rating must be numeric")
	}
	return f, nil
}
func (ratingHandler) ProjectedType() string { return ProjectedNumber }
func (ratingHandler) Text(v any) string {
	f, ok := toFloat(v)
	if !ok {
		return ""
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

type dateHandler struct{ kind FieldType }

func (h dateHandler) Definition() FieldDefinition {
	label, icon, desc := "日期", "calendar", "日期字段，可按日分组与筛选"
	if h.kind == FieldDateTime {
		label, icon, desc = "日期时间", "clock", "精确到分钟的日期时间"
	}
	return FieldDefinition{
		Type: h.kind, Label: label, Icon: icon, Version: 1, Color: "#0ea5a4",
		Description: desc,
		ConfigSchema: map[string]any{
			"includeTime": map[string]any{"type": "boolean", "default": h.kind == FieldDateTime},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
}
func (h dateHandler) ValidateConfig(map[string]any) error { return nil }
func (h dateHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil || v == "" {
		return nil
	}
	if _, err := parseTime(v); err != nil {
		return err
	}
	return nil
}
func (h dateHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil || v == "" {
		return "", nil
	}
	ts, err := parseTime(v)
	if err != nil {
		return nil, err
	}
	if h.kind == FieldDate {
		return ts.Format("2006-01-02"), nil
	}
	return ts.Format("2006-01-02 15:04:05"), nil
}
func (h dateHandler) ProjectedType() string { return ProjectedDate }
func (h dateHandler) Text(v any) string {
	s, _ := v.(string)
	return s
}

type checkboxHandler struct{}

func (checkboxHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldCheckbox, Label: "复选框", Icon: "check", Version: 1, Color: "#4fae4e",
		Description:  "是 / 否开关",
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
}
func (checkboxHandler) ValidateConfig(map[string]any) error { return nil }
func (checkboxHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	switch v.(type) {
	case bool, float64, int, string:
		return nil
	default:
		return errors.New("checkbox value must be boolean")
	}
}
func (checkboxHandler) Normalize(v any, _ map[string]any) (any, error) {
	return toBool(v), nil
}
func (checkboxHandler) ProjectedType() string { return ProjectedBool }
func (checkboxHandler) Text(v any) string {
	if toBool(v) {
		return "true"
	}
	return "false"
}

type selectHandler struct{ multi bool }

func (h selectHandler) Definition() FieldDefinition {
	label, icon, color := "单选", "select", "#e53935"
	cap := FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true}
	if h.multi {
		label, icon, color = "多选", "multi-select", "#e53935"
	}
	return FieldDefinition{
		Type: h.kind(), Label: label, Icon: icon, Version: 1, Color: color,
		Description: "从预设选项中选择",
		ConfigSchema: map[string]any{
			"options": map[string]any{"type": "array", "default": []any{}},
		},
		Capabilities: cap,
	}
}
func (h selectHandler) kind() FieldType {
	if h.multi {
		return FieldMultiSelect
	}
	return FieldSingleSelect
}
func (h selectHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["options"]; ok {
		if _, ok := v.([]any); !ok {
			return errors.New("options must be an array")
		}
	}
	return nil
}
func (h selectHandler) ValidateValue(v any, cfg map[string]any) error {
	if v == nil || v == "" {
		return nil
	}
	allowed := optionNames(cfg)
	if len(allowed) == 0 {
		return nil
	}
	values := stringSlice(v)
	for _, item := range values {
		found := false
		for _, opt := range allowed {
			if opt == item {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("unknown option: %s", item)
		}
	}
	return nil
}
func (h selectHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		if h.multi {
			return []string{}, nil
		}
		return "", nil
	}
	if h.multi {
		return stringSlice(v), nil
	}
	items := stringSlice(v)
	if len(items) == 0 {
		return "", nil
	}
	return items[0], nil
}
func (h selectHandler) ProjectedType() string {
	if h.multi {
		return ProjectedJSON
	}
	return ProjectedText
}
func (h selectHandler) Text(v any) string {
	return strings.Join(stringSlice(v), ", ")
}

func optionNames(cfg map[string]any) []string {
	raw, ok := cfg["options"].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		switch t := item.(type) {
		case string:
			out = append(out, t)
		case map[string]any:
			if name, ok := t["name"].(string); ok {
				out = append(out, name)
			}
		}
	}
	return out
}

type contactHandler struct {
	kind FieldType
}

func (h contactHandler) Definition() FieldDefinition {
	label, icon, color, desc := "邮箱", "message", "#3390ec", "邮箱地址"
	switch h.kind {
	case FieldPhone:
		label, icon, color, desc = "电话", "phone", "#3390ec", "电话号码"
	case FieldURL:
		label, icon, color, desc = "链接", "link", "#3390ec", "URL 地址"
	}
	return FieldDefinition{
		Type: h.kind, Label: label, Icon: icon, Version: 1, Color: color, Description: desc,
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: false, Indexable: true},
	}
}
func (h contactHandler) ValidateConfig(map[string]any) error { return nil }
func (h contactHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil || v == "" {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return errors.New("value must be a string")
	}
	if h.kind == FieldEmail && !strings.Contains(s, "@") {
		return errors.New("invalid email")
	}
	if h.kind == FieldURL && !strings.Contains(s, "://") {
		return errors.New("invalid url")
	}
	return nil
}
func (h contactHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return "", nil
	}
	s, _ := v.(string)
	return strings.TrimSpace(s), nil
}
func (h contactHandler) ProjectedType() string { return ProjectedText }
func (h contactHandler) Text(v any) string {
	s, _ := v.(string)
	return s
}

type userHandler struct{}

func (userHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldUser, Label: "人员", Icon: "user", Version: 1, Color: "#3390ec",
		Description: "空间成员，可多选",
		ConfigSchema: map[string]any{
			"multiple": map[string]any{"type": "boolean", "default": true},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: true, Groupable: true, Indexable: true},
	}
}
func (userHandler) ValidateConfig(map[string]any) error { return nil }
func (userHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	if _, ok := v.(string); ok {
		return nil
	}
	if _, ok := v.([]string); ok {
		return nil
	}
	if _, ok := v.([]any); ok {
		return nil
	}
	return errors.New("user value must be a user id or a list of user ids")
}
func (userHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return []string{}, nil
	}
	if s, ok := v.(string); ok {
		if s == "" {
			return []string{}, nil
		}
		return []string{s}, nil
	}
	return stringSlice(v), nil
}
func (userHandler) ProjectedType() string { return ProjectedJSON }
func (userHandler) Text(v any) string {
	return strings.Join(stringSlice(v), ", ")
}

type attachmentHandler struct{}

func (attachmentHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldAttachment, Label: "附件", Icon: "paperclip", Version: 1, Color: "#8b5cf6",
		Description: "素材库文件引用",
		ConfigSchema: map[string]any{
			"maxCount": map[string]any{"type": "integer", "default": 10, "min": 1, "max": 50},
		},
		// 可索引：附件值里带文件名，索引后关键字搜索能按文件名命中（值仍以 JSON 投影存储）。
		// 可筛选：按「文件名包含」过滤（走 value_json 文本匹配，不做 JSON 包含判断）。
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: false, Groupable: false, Indexable: true},
	}
}
func (attachmentHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["maxCount"]; ok {
		n, ok := toFloat(v)
		if !ok || n < 1 || n > 50 {
			return errors.New("maxCount must be between 1 and 50")
		}
	}
	return nil
}
func (attachmentHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	if _, ok := v.([]any); !ok {
		if _, ok := v.([]string); !ok {
			return errors.New("attachment value must be a list")
		}
	}
	return nil
}
func (attachmentHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return []any{}, nil
	}
	return stringSlice(v), nil
}
func (attachmentHandler) ProjectedType() string { return ProjectedJSON }
func (attachmentHandler) Text(v any) string {
	return fmt.Sprintf("%d 个附件", len(stringSlice(v)))
}

type formulaHandler struct{}

func (formulaHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldFormula, Label: "公式", Icon: "function", Version: 1, Color: "#8b5cf6",
		Description: "由其他字段计算得到，服务端权威求值",
		ConfigSchema: map[string]any{
			"expression": map[string]any{"type": "string", "default": ""},
		},
		Capabilities: FieldCapabilities{Editable: false, Filterable: true, Sortable: true, Groupable: true, Indexable: true, Computed: true},
	}
}
func (formulaHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["expression"]; ok {
		if _, ok := v.(string); !ok {
			return errors.New("expression must be a string")
		}
	}
	return nil
}
func (formulaHandler) ValidateValue(v any, _ map[string]any) error    { return nil }
func (formulaHandler) Normalize(v any, _ map[string]any) (any, error) { return v, nil }
func (formulaHandler) ProjectedType() string                          { return ProjectedText }
func (formulaHandler) Text(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", v)
	}
}

type linkHandler struct{}

func (linkHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldLink, Label: "关联记录", Icon: "relation", Version: 1, Color: "#f7bc2f",
		Description: "关联到同一空间的其他表的记录",
		ConfigSchema: map[string]any{
			"targetTableId": map[string]any{"type": "string", "default": ""},
			"multiple":      map[string]any{"type": "boolean", "default": true},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: false, Groupable: false, Indexable: true},
	}
}
func (linkHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["targetTableId"]; ok {
		if _, ok := v.(string); !ok {
			return errors.New("targetTableId must be a string")
		}
	}
	return nil
}
func (linkHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	if _, ok := v.(string); ok {
		return nil
	}
	if _, ok := v.([]any); ok {
		return nil
	}
	if _, ok := v.([]string); ok {
		return nil
	}
	return errors.New("link value must be a record id or a list of record ids")
}
func (linkHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return []string{}, nil
	}
	if s, ok := v.(string); ok {
		if s == "" {
			return []string{}, nil
		}
		return []string{s}, nil
	}
	return stringSlice(v), nil
}

// docHandler 关联知识库文档。
//
// 值是知识库节点 ID 列表（kb_nodes.id），
// 空间归属校验在 service 层做（registry 只管形状）。
type docHandler struct{}

func (docHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldDoc, Label: "关联文档", Icon: "document", Version: 1, Color: "#3390ec",
		Description: "关联当前空间的文档，画布与文档之间互跳",
		ConfigSchema: map[string]any{
			"multiple": map[string]any{"type": "boolean", "default": true},
		},
		Capabilities: FieldCapabilities{Editable: true, Filterable: true, Sortable: false, Groupable: false, Indexable: true},
	}
}

func (docHandler) ValidateConfig(cfg map[string]any) error {
	if v, ok := cfg["multiple"]; ok {
		if _, ok := v.(bool); !ok {
			return errors.New("multiple must be a boolean")
		}
	}
	return nil
}

func (docHandler) ValidateValue(v any, _ map[string]any) error {
	if v == nil {
		return nil
	}
	if _, ok := v.(string); ok {
		return nil
	}
	if _, ok := v.([]any); ok {
		return nil
	}
	if _, ok := v.([]string); ok {
		return nil
	}
	return errors.New("doc value must be a knowledge node id or a list of ids")
}

func (docHandler) Normalize(v any, _ map[string]any) (any, error) {
	if v == nil {
		return []string{}, nil
	}
	if s, ok := v.(string); ok {
		if s == "" {
			return []string{}, nil
		}
		return []string{s}, nil
	}
	return stringSlice(v), nil
}

func (docHandler) ProjectedType() string { return ProjectedText }

func (docHandler) Text(v any) string {
	ids := stringSlice(v)
	return strings.Join(ids, "、")
}
func (linkHandler) ProjectedType() string { return ProjectedJSON }
func (linkHandler) Text(v any) string {
	return strings.Join(stringSlice(v), ", ")
}

// Registry 是字段类型注册表：新增字段类型只注册 handler，不改 Record Engine。
type Registry struct {
	handlers map[FieldType]FieldHandler
}

// NewRegistry 返回内置的字段注册表。

// —— Lookup / Rollup ——
//
// 两者都是**计算字段**：值由服务端按关联关系算出来，界面上不可直接编辑。
// 配置：
//
//	{"targetTableId": "...", "targetFieldId": "...", "linkFieldId": "...", "rollupType": "sum"}
//
// linkFieldId 可省略，省略时自动使用本表中指向 targetTableId 的第一个关联字段。

type lookupHandler struct{}

func (lookupHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldLookup, Label: "引用字段", Icon: "lookup", Version: 1, Color: "#0ea5e9",
		Description: "把关联记录里的字段值引过来（跨表取值）",
		ConfigSchema: map[string]any{
			"targetTableId": map[string]any{"type": "string", "default": ""},
			"targetFieldId": map[string]any{"type": "string", "default": ""},
			"linkFieldId":   map[string]any{"type": "string", "default": ""},
		},
		Capabilities: FieldCapabilities{Editable: false, Filterable: true, Sortable: true, Groupable: true, Indexable: true, Computed: true},
	}
}

func (lookupHandler) ValidateConfig(cfg map[string]any) error {
	return validateComputedConfig(cfg)
}

func (lookupHandler) ValidateValue(v any, _ map[string]any) error    { return nil }
func (lookupHandler) Normalize(v any, _ map[string]any) (any, error) { return v, nil }
func (lookupHandler) ProjectedType() string                          { return ProjectedJSON }
func (lookupHandler) Text(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			parts = append(parts, fmt.Sprintf("%v", item))
		}
		return strings.Join(parts, ", ")
	case []string:
		return strings.Join(t, ", ")
	default:
		return fmt.Sprintf("%v", v)
	}
}

type rollupHandler struct{}

func (rollupHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: FieldRollup, Label: "汇总字段", Icon: "rollup", Version: 1, Color: "#f97316",
		Description: "对关联记录里的字段做聚合（求和 / 平均 / 计数 / 去重计数）",
		ConfigSchema: map[string]any{
			"targetTableId": map[string]any{"type": "string", "default": ""},
			"targetFieldId": map[string]any{"type": "string", "default": ""},
			"linkFieldId":   map[string]any{"type": "string", "default": ""},
			"rollupType":    map[string]any{"type": "string", "default": "sum", "enum": []any{"sum", "avg", "count", "countUnique", "min", "max"}},
		},
		Capabilities: FieldCapabilities{Editable: false, Filterable: true, Sortable: true, Groupable: true, Indexable: true, Computed: true},
	}
}

func (rollupHandler) ValidateConfig(cfg map[string]any) error {
	if err := validateComputedConfig(cfg); err != nil {
		return err
	}
	if v, ok := cfg["rollupType"]; ok {
		kind, ok := v.(string)
		if !ok {
			return errors.New("rollupType must be a string")
		}
		switch kind {
		case "sum", "avg", "count", "countUnique", "min", "max":
		default:
			return fmt.Errorf("unsupported rollupType %q", kind)
		}
	}
	return nil
}

func (rollupHandler) ValidateValue(v any, _ map[string]any) error    { return nil }
func (rollupHandler) Normalize(v any, _ map[string]any) (any, error) { return v, nil }
func (rollupHandler) ProjectedType() string                          { return ProjectedNumber }
func (rollupHandler) Text(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// validateComputedConfig 校验计算字段（引用 / 汇总）的公共配置。
func validateComputedConfig(cfg map[string]any) error {
	for _, key := range []string{"targetTableId", "targetFieldId", "linkFieldId"} {
		if v, ok := cfg[key]; ok {
			if _, ok := v.(string); !ok {
				return fmt.Errorf("%s must be a string", key)
			}
		}
	}
	return nil
}

func NewRegistry() *Registry {
	r := &Registry{handlers: map[FieldType]FieldHandler{}}
	r.register(textHandler{})
	r.register(longTextHandler{})
	r.register(numberHandler{kind: FieldNumber, label: "数字", icon: "number", color: "#3390ec"})
	r.register(numberHandler{kind: FieldCurrency, label: "金额", icon: "money", color: "#4fae4e"})
	r.register(numberHandler{kind: FieldPercent, label: "百分比", icon: "percent", color: "#4fae4e"})
	r.register(ratingHandler{})
	r.register(dateHandler{kind: FieldDate})
	r.register(dateHandler{kind: FieldDateTime})
	r.register(checkboxHandler{})
	r.register(selectHandler{multi: false})
	r.register(selectHandler{multi: true})
	r.register(contactHandler{kind: FieldEmail})
	r.register(contactHandler{kind: FieldPhone})
	r.register(contactHandler{kind: FieldURL})
	r.register(userHandler{})
	r.register(attachmentHandler{})
	r.register(formulaHandler{})
	r.register(linkHandler{})
	r.register(docHandler{})
	r.register(lookupHandler{})
	r.register(rollupHandler{})
	// 系统字段（只读，服务端自动维护）。
	r.register(systemFieldHandler{kind: FieldCreatedAt, label: "创建时间", icon: "clock", color: "#8b5cf6", projected: ProjectedDate})
	r.register(systemFieldHandler{kind: FieldUpdatedAt, label: "更新时间", icon: "clock", color: "#8b5cf6", projected: ProjectedDate})
	r.register(systemFieldHandler{kind: FieldCreatedBy, label: "创建人", icon: "user", color: "#3390ec", projected: ProjectedText})
	r.register(systemFieldHandler{kind: FieldUpdatedBy, label: "更新人", icon: "user", color: "#3390ec", projected: ProjectedText})
	return r
}

func (r *Registry) register(h FieldHandler) {
	r.handlers[h.Definition().Type] = h
}

// Get 返回字段处理器。
func (r *Registry) Get(t FieldType) (FieldHandler, bool) {
	h, ok := r.handlers[t]
	return h, ok
}

// Definitions 返回全部字段类型定义（按 label 排序）。
func (r *Registry) Definitions() []FieldDefinition {
	out := make([]FieldDefinition, 0, len(r.handlers))
	for _, h := range r.handlers {
		out = append(out, h.Definition())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

// ValidateFieldType 校验字段类型是否已注册。
func (r *Registry) ValidateFieldType(t string) error {
	if _, ok := r.handlers[FieldType(t)]; !ok {
		return fmt.Errorf("%w: %s", ErrUnsupportedType, t)
	}
	return nil
}
