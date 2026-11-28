package base

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// searchableJSONText 把 JSON 型字段的值压成一段**可搜文本**。
//
// 背景：附件 / 成员 / 关联记录这些字段的值是 JSON 数组，
// 关键字检索原来只能走 `value_json::text ILIKE ?` ——
// 每行都要把 JSONB 序列化成文本再比，而且走不了任何索引
//（`jsonb::text` 不是 IMMUTABLE，建不了表达式索引），
// 是整个检索路径上最贵的一段。
//
// 现在把可搜内容**顺手落到 value_text**（和文本字段一样），
// 于是这些字段能跟着 GIN 三值组索引走，JSON 分支可以整体去掉。
//
// 规则：
//   - 字符串：原样收（附件名、成员 ID、关联记录 ID 都走这里）；
//   - 数字 / 布尔：转成文本收（关联字段的值可能是数字形态的 ID）；
//   - 数组 / 对象：递归展开，用空格连接（顺序稳定，便于结果可复现）。
func searchableJSONText(value any) string {
	parts := make([]string, 0, 4)
	collectSearchableText(value, &parts)
	return strings.Join(parts, " ")
}

func collectSearchableText(value any, parts *[]string) {
	switch v := value.(type) {
	case nil:
		return
	case string:
		if s := strings.TrimSpace(v); s != "" {
			*parts = append(*parts, s)
		}
	case bool:
		*parts = append(*parts, fmt.Sprintf("%t", v))
	case float64:
		*parts = append(*parts, strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%f", v), "0"), "."))
	case float32:
		collectSearchableText(float64(v), parts)
	case int:
		*parts = append(*parts, fmt.Sprintf("%d", v))
	case int64:
		*parts = append(*parts, fmt.Sprintf("%d", v))
	case json.Number:
		*parts = append(*parts, v.String())
	case []any:
		for _, item := range v {
			collectSearchableText(item, parts)
		}
	case map[string]any:
		// 只收值，不收键名 —— 键名（如 "name"）会造成检索噪音。
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			collectSearchableText(v[k], parts)
		}
	default:
		// 其它类型（结构体等）：走 JSON 编码再展开，保证不漏内容。
		raw, err := json.Marshal(v)
		if err != nil {
			return
		}
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return
		}
		collectSearchableText(decoded, parts)
	}
}
