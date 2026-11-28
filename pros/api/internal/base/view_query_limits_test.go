package base

import "testing"

// 视图配置是用户数据，可能存着重复 / 超限的排序与分组规则。
// 解析时必须去重并截断，否则整条查询会被 MaxSorts / MaxGroups 拦成 422。
func TestParseViewQueryRulesSanitizes(t *testing.T) {
	sortsRaw := []any{
		map[string]any{"fieldId": "f1", "order": "asc"},
		map[string]any{"fieldId": "f1", "order": "desc"},
		map[string]any{"fieldId": "f2", "order": "asc"},
		map[string]any{"fieldId": "", "order": "asc"},
	}
	sorts, ok := parseSortRules(sortsRaw)
	if !ok {
		t.Fatalf("parseSortRules should succeed")
	}
	if len(sorts) != 2 {
		t.Fatalf("sorts should be deduped, got %d: %+v", len(sorts), sorts)
	}
	if sorts[0].FieldID != "f1" || sorts[0].Order != "asc" {
		t.Fatalf("first sort should keep the earliest rule, got %+v", sorts[0])
	}

	groupsRaw := make([]any, 0, MaxGroups+3)
	for i := 0; i < MaxGroups+3; i++ {
		groupsRaw = append(groupsRaw, map[string]any{
			"fieldId": "same",
			"order":   "asc",
		})
	}
	groups, ok := parseGroupRules(groupsRaw)
	if !ok {
		t.Fatalf("parseGroupRules should succeed")
	}
	if len(groups) != 1 {
		t.Fatalf("identical group rules should collapse to one, got %d: %+v", len(groups), groups)
	}

	overRaw := make([]any, 0, MaxGroups+2)
	for i := 0; i < MaxGroups+2; i++ {
		overRaw = append(overRaw, map[string]any{
			"fieldId": string(rune('a' + i)),
			"order":   "asc",
		})
	}
	over, ok := parseGroupRules(overRaw)
	if !ok {
		t.Fatalf("parseGroupRules should succeed")
	}
	if len(over) != MaxGroups {
		t.Fatalf("group rules should be capped at MaxGroups=%d, got %d", MaxGroups, len(over))
	}
}
