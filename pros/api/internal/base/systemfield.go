package base

import (
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// —— 系统字段（只读） ——
//
// 这四类字段的值**不由用户填写**，而是由服务端在写入记录时自动落库：
//
//	created_at —— 记录创建时间
//	updated_at —— 记录最后更新时间
//	created_by —— 记录创建人（用户 ID）
//	updated_by —— 记录最后更新人（用户 ID）
//
// 为什么落库而不是查询时算：
//   - 落库后能进入 base_record_values 投影，**筛选 / 排序 / 分组全部可用**；
//     查询时现算的话只能返回给前端看，一排序就露馅。
//   - 值与记录同事务写入，不会出现「记录改了但创建时间漂移」。
//
// 为什么标 Computed：
//   - 复用计算字段的既有约定 —— normalizeValues 会跳过客户端传入值，
//     避免用户伪造「我是别人创建的」。
//
// 未实现：user_group（用户分组）。通讯录目前没有分组体系，
// 等 `directory` 侧补上分组后再补这个类型，否则只能做成没有数据源的空字段。

const (
	// FieldCreatedAt 创建时间（系统字段）。
	FieldCreatedAt FieldType = "created_at"
	// FieldUpdatedAt 最后更新时间（系统字段）。
	FieldUpdatedAt FieldType = "updated_at"
	// FieldCreatedBy 创建人（系统字段，值为用户 ID）。
	FieldCreatedBy FieldType = "created_by"
	// FieldUpdatedBy 最后更新人（系统字段，值为用户 ID）。
	FieldUpdatedBy FieldType = "updated_by"
)

// systemFieldHandler 是系统字段的通用处理器。
//
// 所有系统字段都是只读、不可编辑、可筛选可排序、值由服务端写。
type systemFieldHandler struct {
	kind      FieldType
	label     string
	icon      string
	color     string
	projected string
}

func (h systemFieldHandler) Definition() FieldDefinition {
	return FieldDefinition{
		Type: h.kind, Label: h.label, Icon: h.icon, Version: 1, Color: h.color,
		Description:  "系统字段，由服务端自动维护，不可编辑",
		ConfigSchema: map[string]any{},
		Capabilities: FieldCapabilities{
			Editable: false, Filterable: true, Sortable: true, Groupable: true,
			Indexable: true, Computed: true,
		},
	}
}

func (h systemFieldHandler) ValidateConfig(map[string]any) error { return nil }
func (h systemFieldHandler) ValidateValue(any, map[string]any) error {
	return nil
}
func (h systemFieldHandler) Normalize(v any, _ map[string]any) (any, error) { return v, nil }
func (h systemFieldHandler) ProjectedType() string                          { return h.projected }
func (h systemFieldHandler) Text(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case time.Time:
		return t.Format("2006-01-02 15:04:05")
	default:
		return fmt.Sprintf("%v", v)
	}
}

// IsSystemField 判断字段类型是否为系统字段。
func IsSystemField(t FieldType) bool {
	switch t {
	case FieldCreatedAt, FieldUpdatedAt, FieldCreatedBy, FieldUpdatedBy:
		return true
	default:
		return false
	}
}

// applySystemFields 把系统字段的值写进记录数据。
//
// createdAt / createdBy 传记录的**原始**创建信息（更新场景下从记录里取），
// updatedAt / updatedBy 传本次写入的时刻与操作人。
func applySystemFields(idx *fieldIndex, data map[string]any, createdAt, updatedAt time.Time, createdBy, updatedBy uuid.UUID) {
	if idx == nil {
		return
	}
	if updatedAt.IsZero() {
		updatedAt = time.Now()
	}
	if createdAt.IsZero() {
		createdAt = updatedAt
	}
	for id, meta := range idx.byID {
		switch FieldType(meta.Type) {
		case FieldCreatedAt:
			data[id.String()] = createdAt.Format("2006-01-02 15:04:05")
		case FieldUpdatedAt:
			data[id.String()] = updatedAt.Format("2006-01-02 15:04:05")
		case FieldCreatedBy:
			if createdBy != uuid.Nil {
				data[id.String()] = createdBy.String()
			}
		case FieldUpdatedBy:
			if updatedBy != uuid.Nil {
				data[id.String()] = updatedBy.String()
			}
		}
	}
}
