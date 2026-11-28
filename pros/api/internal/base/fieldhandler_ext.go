package base

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// 字段处理器扩展（技术文档 §12 FieldHandler 扩展）。
//
// 原 FieldHandler 只覆盖「校验 / 归一化 / 投影类型 / 文本形态」，
// 序列化、筛选构造、排序构造这三件事散落在 service / query 里，
// 导致新字段类型必须改多处才能接入查询链路。
//
// 这里补一个可选的扩展接口 RichFieldHandler：
//   - Serialize   值 → 存储列形态（投影表四列的取值）
//   - Deserialize 存储列形态 → 对外 API 值
//   - BuildFilter 条件 → SQL 片段 + 参数
//   - BuildSort   排序 → ORDER BY 片段
//
// 为避免改动 25 个既有 handler，采用「默认实现 + 按需覆盖」：
// 注册时若 handler 未实现扩展接口，则用 defaultRichHandler 兜底；
// defaultRichHandler 的语义与改造前的 query.go 完全一致，行为不变。

// SerializedValue 是一个字段值在存储层的形态。
//
// 与 base_record_values 的四列一一对应：Text / Number / Bool / Date / JSON。
type SerializedValue struct {
	// Type 是投影类型（ProjectedText / ProjectedNumber / ...）。
	Type string `json:"type"`
	// Text 是文本投影值。
	Text string `json:"text,omitempty"`
	// Number 是数值投影值。
	Number *float64 `json:"number,omitempty"`
	// Bool 是布尔投影值。
	Bool *bool `json:"bool,omitempty"`
	// Date 是日期投影值。
	Date *time.Time `json:"date,omitempty"`
	// JSON 是 JSON 投影值。
	JSON json.RawMessage `json:"json,omitempty"`
}

// RichFieldHandler 是字段处理器的扩展接口。
type RichFieldHandler interface {
	FieldHandler
	// Serialize 把对外的值转成存储层形态。
	Serialize(v any, cfg map[string]any) (SerializedValue, error)
	// Deserialize 把存储层形态转回对外的值。
	Deserialize(v SerializedValue, cfg map[string]any) (any, error)
	// BuildFilter 把筛选条件编译成 SQL 片段与参数。
	BuildFilter(fieldID uuid.UUID, fieldType string, cond Condition) (string, []any, error)
	// BuildSort 把排序规则编译成 ORDER BY 片段（alias 为投影表别名）。
	BuildSort(fieldID uuid.UUID, fieldType string, order string, alias string) (string, error)
}

// defaultRichHandler 提供通用扩展实现。
type defaultRichHandler struct {
	inner FieldHandler
}

// Definition 透传。
func (h defaultRichHandler) Definition() FieldDefinition { return h.inner.Definition() }

// ValidateConfig 透传。
func (h defaultRichHandler) ValidateConfig(cfg map[string]any) error {
	return h.inner.ValidateConfig(cfg)
}

// ValidateValue 透传。
func (h defaultRichHandler) ValidateValue(v any, cfg map[string]any) error {
	return h.inner.ValidateValue(v, cfg)
}

// Normalize 透传。
func (h defaultRichHandler) Normalize(v any, cfg map[string]any) (any, error) {
	return h.inner.Normalize(v, cfg)
}

// ProjectedType 透传。
func (h defaultRichHandler) ProjectedType() string { return h.inner.ProjectedType() }

// Text 透传。
func (h defaultRichHandler) Text(v any) string { return h.inner.Text(v) }

// Serialize 默认实现：与 syncProjection 的写入逻辑保持一致。
func (h defaultRichHandler) Serialize(v any, cfg map[string]any) (SerializedValue, error) {
	out := SerializedValue{Type: h.inner.ProjectedType()}
	switch out.Type {
	case ProjectedNumber:
		n, ok := toFloat(v)
		if !ok {
			return out, fmt.Errorf("%w: expects a numeric value", ErrFieldValueInvalid)
		}
		out.Number = &n
	case ProjectedDate:
		ts, err := parseTime(v)
		if err != nil {
			return out, fmt.Errorf("%w: expects a date value", ErrFieldValueInvalid)
		}
		out.Date = &ts
	case ProjectedBool:
		b := toBool(v)
		out.Bool = &b
	case ProjectedJSON:
		raw, err := json.Marshal(v)
		if err != nil {
			return out, fmt.Errorf("%w: value is not serializable", ErrFieldValueInvalid)
		}
		out.JSON = raw
	default:
		out.Text = h.inner.Text(v)
	}
	return out, nil
}

// Deserialize 默认实现：把投影列还原成对外的值。
func (h defaultRichHandler) Deserialize(v SerializedValue, cfg map[string]any) (any, error) {
	switch v.Type {
	case ProjectedNumber:
		if v.Number == nil {
			return nil, nil
		}
		return *v.Number, nil
	case ProjectedDate:
		if v.Date == nil {
			return nil, nil
		}
		return v.Date.Format(time.RFC3339), nil
	case ProjectedBool:
		if v.Bool == nil {
			return nil, nil
		}
		return *v.Bool, nil
	case ProjectedJSON:
		if len(v.JSON) == 0 {
			return nil, nil
		}
		var out any
		if err := json.Unmarshal(v.JSON, &out); err != nil {
			return nil, err
		}
		return out, nil
	default:
		return v.Text, nil
	}
}

// BuildFilter 默认实现：语义与改造前的 conditionSQL 完全一致。
func (h defaultRichHandler) BuildFilter(fieldID uuid.UUID, fieldType string, cond Condition) (string, []any, error) {
	return defaultConditionSQL(fieldID, h.inner.ProjectedType(), fieldType, cond)
}

// BuildSort 默认实现：按投影类型选择排序列。
func (h defaultRichHandler) BuildSort(fieldID uuid.UUID, fieldType string, order string, alias string) (string, error) {
	dir := "ASC"
	if strings.EqualFold(order, "desc") {
		dir = "DESC"
	}
	if alias == "" {
		alias = "sv"
	}
	return fmt.Sprintf("%s.%s %s NULLS LAST", alias, sortColumn(h.inner.ProjectedType()), dir), nil
}

// —— Registry 扩展 ——

// register 注册字段处理器；未实现扩展接口的自动套上默认实现。
func (r *Registry) register(h FieldHandler) {
	r.handlers[h.Definition().Type] = withRichHandler(h)
}

// withRichHandler 补齐扩展接口。
func withRichHandler(h FieldHandler) FieldHandler {
	if _, ok := h.(RichFieldHandler); ok {
		return h
	}
	return defaultRichHandler{inner: h}
}

// Rich 返回带扩展能力的字段处理器。
func (r *Registry) Rich(t FieldType) (RichFieldHandler, bool) {
	h, ok := r.handlers[t]
	if !ok {
		return nil, false
	}
	rh, ok := h.(RichFieldHandler)
	return rh, ok
}

// SerializeField 用字段类型对应的处理器把值序列化。
func (r *Registry) SerializeField(t FieldType, v any, cfg map[string]any) (SerializedValue, error) {
	rh, ok := r.Rich(t)
	if !ok {
		return SerializedValue{}, fmt.Errorf("%w: %s", ErrUnsupportedType, t)
	}
	return rh.Serialize(v, cfg)
}

// DeserializeField 用字段类型对应的处理器把存储值反序列化。
func (r *Registry) DeserializeField(t FieldType, v SerializedValue, cfg map[string]any) (any, error) {
	rh, ok := r.Rich(t)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedType, t)
	}
	return rh.Deserialize(v, cfg)
}
