package base

import "testing"

func TestAggregateRollup(t *testing.T) {
	values := []any{1, "2.5", 2, "x", 2}
	if got := aggregateRollup("count", values); got != float64(5) {
		t.Fatalf("count=%v", got)
	}
	if got := aggregateRollup("countUnique", values); got != float64(4) {
		t.Fatalf("countUnique=%v", got)
	}
	if got := aggregateRollup("sum", values); got != 7.5 {
		t.Fatalf("sum=%v", got)
	}
	if got := aggregateRollup("avg", values); got != 1.875 {
		t.Fatalf("avg=%v", got)
	}
	if got := aggregateRollup("min", values); got != float64(1) {
		t.Fatalf("min=%v", got)
	}
	if got := aggregateRollup("max", values); got != 2.5 {
		t.Fatalf("max=%v", got)
	}
	if got := aggregateRollup("sum", nil); got != float64(0) {
		t.Fatalf("empty sum=%v", got)
	}
	if got := aggregateRollup("unknown", values); got != float64(0) {
		t.Fatalf("unknown=%v", got)
	}
}

func TestEqualComputedAndSanitizeConfig(t *testing.T) {
	if !equalComputed([]any{"a", 1}, []any{"a", 1}) {
		t.Fatal("equal slices should match")
	}
	if equalComputed([]any{"a"}, []any{"b"}) {
		t.Fatal("different slices should not match")
	}
	if !equalComputed(nil, nil) {
		t.Fatal("nil should match")
	}
	cfg := sanitizeComputedConfig(map[string]any{
		"targetTableId": "t1",
		"targetFieldId": "   ",
		"linkFieldId":   "",
		"rollupType":    "sum",
		"count":         3,
	})
	if _, ok := cfg["targetFieldId"]; ok {
		t.Fatal("blank targetFieldId should be dropped")
	}
	if _, ok := cfg["linkFieldId"]; ok {
		t.Fatal("empty linkFieldId should be dropped")
	}
	if cfg["targetTableId"] != "t1" || cfg["rollupType"] != "sum" {
		t.Fatalf("kept keys: %#v", cfg)
	}
	if cfg["count"] != 3 {
		t.Fatalf("non-string values should be kept: %#v", cfg)
	}
}
