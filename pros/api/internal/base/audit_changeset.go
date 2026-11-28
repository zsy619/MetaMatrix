package base

import (
	"encoding/json"
	"sort"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// 审计的**字段级变更集**（A-05）。
//
// 背景：审计行里存的是 before / after 两份**完整快照**。
// 快照能看出「现在是什么样」，看不出「到底改了哪几个字段」——
// 100 个字段的记录改了一个值，前后两份快照各自 100 个字段，
// 审计列表没法据此做「变更历史回放」。
//
// 变更集把这个诉求补上：每条审计额外记一份
// [{fieldId, kind, before, after}]，只包含**真正变化的字段**。
//
// 语义：
//   - added    —— 字段在变更前不存在，变更后有值；
//   - removed  —— 变更前有值，变更后不存在；
//   - modified —— 两边都有值且不相等。
//
// 安全性：变更集里带值，和 before / after 一样受字段级可见性约束 ——
// 隐藏字段的变更条目在读出时会被剥掉（见 ListAuditEntries）。

// FieldChange 是一条字段级变更。
type FieldChange struct {
	FieldID string `json:"fieldId"`
	// Kind：added / removed / modified。
	Kind   string `json:"kind"`
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
}

// diffAuditValues 计算两份快照之间的字段级差异。
//
// before / after 都是「字段 ID → 值」的映射（值已经被归一化过）。
// 返回结果按字段 ID 排序，保证同一批变更的输出稳定可比较。
func diffAuditValues(before, after map[string]any) []FieldChange {
	if len(before) == 0 && len(after) == 0 {
		return nil
	}
	keys := make(map[string]bool, len(before)+len(after))
	for k := range before {
		keys[k] = true
	}
	for k := range after {
		keys[k] = true
	}
	ordered := make([]string, 0, len(keys))
	for k := range keys {
		ordered = append(ordered, k)
	}
	sort.Strings(ordered)

	changes := make([]FieldChange, 0, len(ordered))
	for _, key := range ordered {
		oldVal, hadOld := before[key]
		newVal, hadNew := after[key]
		switch {
		case !hadOld && hadNew:
			changes = append(changes, FieldChange{FieldID: key, Kind: "added", After: newVal})
		case hadOld && !hadNew:
			changes = append(changes, FieldChange{FieldID: key, Kind: "removed", Before: oldVal})
		case hadOld && hadNew:
			if auditValuesEqual(oldVal, newVal) {
				continue
			}
			changes = append(changes, FieldChange{FieldID: key, Kind: "modified", Before: oldVal, After: newVal})
		}
	}
	if len(changes) == 0 {
		return nil
	}
	return changes
}

// auditValuesEqual 比较两个字段值是否「没有实质变化」。
//
// 数值要按数值比（JSON 反序列化后 1 和 1.0 都是 float64），
// 其余按归一化后的 JSON 文本比 —— 顺序不同的数组视为不同值
// （数组顺序在多维表格里是有意义的）。
func auditValuesEqual(a, b any) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if af, ok := auditToFloat(a); ok {
		if bf, ok := auditToFloat(b); ok {
			return af == bf
		}
	}
	ab, err1 := json.Marshal(a)
	bb, err2 := json.Marshal(b)
	if err1 != nil || err2 != nil {
		return false
	}
	return string(ab) == string(bb)
}

func auditToFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

// buildChangeSet 生成变更集并序列化成 JSONB。
func buildChangeSet(before, after map[string]any) datatypes.JSON {
	changes := diffAuditValues(before, after)
	if len(changes) == 0 {
		return nil
	}
	raw, err := json.Marshal(changes)
	if err != nil {
		return nil
	}
	return datatypes.JSON(raw)
}

// stripHiddenChangeSet 剥掉变更集里命中隐藏字段的条目。
//
// 与 before / after 快照走同一套可见性口径：
// 访客看不到的字段，审计里也不该出现它的值。
func stripHiddenChangeSet(raw datatypes.JSON, idx *fieldIndex, subj policySubject) datatypes.JSON {
	if len(raw) == 0 || idx == nil {
		return raw
	}
	var changes []FieldChange
	if err := json.Unmarshal(raw, &changes); err != nil {
		return raw
	}
	kept := make([]FieldChange, 0, len(changes))
	for _, ch := range changes {
		fieldID, err := uuid.Parse(ch.FieldID)
		if err != nil {
			// 认不出来的字段 ID（比如历史脏数据）直接丢掉，避免泄露。
			continue
		}
		meta, ok := idx.byID[fieldID]
		if !ok {
			continue
		}
		if hiddenFor(meta, subj) {
			continue
		}
		kept = append(kept, ch)
	}
	if len(kept) == 0 {
		return nil
	}
	out, err := json.Marshal(kept)
	if err != nil {
		return raw
	}
	return datatypes.JSON(out)
}
