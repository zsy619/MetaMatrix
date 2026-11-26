package base

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestParseFormulaBasic(t *testing.T) {
	node, err := ParseFormula("IF({销售额} > 1000, {销售额} * 0.1, 0)")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if node.Type != "CallExpression" || node.Name != "IF" {
		t.Fatalf("unexpected root node: %+v", node)
	}
	deps := FormulaDependencies(node)
	if len(deps) != 1 || deps[0] != "销售额" {
		t.Fatalf("unexpected dependencies: %v", deps)
	}
}

func TestParseFormulaRejectsUnknownFunction(t *testing.T) {
	if _, err := ParseFormula("EVIL(1)"); err == nil {
		t.Fatal("expected unknown function error")
	}
}

func TestEvaluateFormulaArithmetic(t *testing.T) {
	node, err := ParseFormula("({a} + {b}) * 2")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	value, err := EvaluateFormula(node, EvalContext{FieldValues: map[string]any{"a": 3.0, "b": 4.0}})
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if value != 14.0 {
		t.Fatalf("expected 14, got %v", value)
	}
}

func TestEvaluateFormulaDivideByZero(t *testing.T) {
	node, _ := ParseFormula("{a} / {b}")
	_, err := EvaluateFormula(node, EvalContext{FieldValues: map[string]any{"a": 1.0, "b": 0.0}})
	if err == nil || !strings.Contains(err.Error(), ErrCodeDivide) {
		t.Fatalf("expected divide-by-zero, got %v", err)
	}
}

func TestEvaluateFormulaFunctions(t *testing.T) {
	node, _ := ParseFormula("ROUND(SUM(1,2,3.5), 1)")
	value, err := EvaluateFormula(node, EvalContext{})
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if value != 6.5 {
		t.Fatalf("expected 6.5, got %v", value)
	}
}

func TestDetectCycle(t *testing.T) {
	deps := map[string][]string{
		"A": {"B"},
		"B": {"C"},
		"C": {"A"},
	}
	cycle := DetectCycle(deps)
	if len(cycle) == 0 {
		t.Fatal("expected a cycle")
	}
	clean := map[string][]string{"A": {"B"}, "B": nil}
	if got := DetectCycle(clean); len(got) != 0 {
		t.Fatalf("expected no cycle, got %v", got)
	}
}

func TestRegistryCoversFieldTypes(t *testing.T) {
	reg := NewRegistry()
	for _, t2 := range []FieldType{
		FieldText, FieldLongText, FieldNumber, FieldCurrency, FieldPercent, FieldRating,
		FieldDate, FieldDateTime, FieldCheckbox, FieldSingleSelect, FieldMultiSelect,
		FieldEmail, FieldPhone, FieldURL, FieldUser, FieldAttachment, FieldFormula, FieldLink,
	} {
		if _, ok := reg.Get(t2); !ok {
			t.Fatalf("field type %s is not registered", t2)
		}
	}
	if err := reg.ValidateFieldType("unknown_type"); err == nil {
		t.Fatal("expected unsupported type error")
	}
}

func TestFieldValidationAndNormalize(t *testing.T) {
	reg := NewRegistry()
	text, _ := reg.Get(FieldText)
	if err := text.ValidateValue("hello", nil); err != nil {
		t.Fatalf("text validate failed: %v", err)
	}
	value, err := text.Normalize("  hi  ", nil)
	if err != nil || value != "hi" {
		t.Fatalf("unexpected normalized value: %v %v", value, err)
	}
	num, _ := reg.Get(FieldNumber)
	if err := num.ValidateValue("abc", nil); err == nil {
		t.Fatal("expected numeric validation error")
	}
	email, _ := reg.Get(FieldEmail)
	if err := email.ValidateValue("not-an-email", nil); err == nil {
		t.Fatal("expected email validation error")
	}
}

func TestLegacyTypeMapping(t *testing.T) {
	if legacyTypeMap["select"] != FieldSingleSelect {
		t.Fatal("select should map to single_select")
	}
	if legacyTypeMap["multiSelect"] != FieldMultiSelect {
		t.Fatal("multiSelect should map to multi_select")
	}
	if legacyTypeMap["person"] != FieldUser {
		t.Fatal("person should map to user")
	}
}

func TestMigratedViewConfigUsesFilterGroup(t *testing.T) {
	fieldID := uuid.New()
	view := legacyView{
		ID:        "v1",
		Name:      "表格视图",
		Type:      "grid",
		SortBy:    strPtr("f1"),
		SortOrder: "desc",
		GroupBy:   strPtr("f2"),
		Filters: []legacyFilter{
			{FieldID: "f1", Op: "is", Value: "星海"},
			{FieldID: "f2", Op: "empty"},
		},
	}
	cfg := migratedViewConfig(view, []legacyField{{ID: "f1", Width: 160}}, map[string]uuid.UUID{
		"f1": fieldID,
		"f2": fieldID,
	})

	filters, ok := cfg["filters"].(map[string]any)
	if !ok {
		t.Fatalf("filters must be a filter group, got %T", cfg["filters"])
	}
	if filters["logic"] != "AND" {
		t.Fatalf("unexpected logic: %v", filters["logic"])
	}
	conditions, ok := filters["conditions"].([]any)
	if !ok || len(conditions) != 2 {
		t.Fatalf("unexpected conditions: %v", filters["conditions"])
	}
	first := conditions[0].(map[string]any)
	if first["operator"] != "eq" || first["fieldId"] != fieldID.String() {
		t.Fatalf("unexpected first condition: %v", first)
	}
	second := conditions[1].(map[string]any)
	if second["operator"] != "isempty" {
		t.Fatalf("unexpected second condition: %v", second)
	}
	sorts := cfg["sorts"].([]any)
	if len(sorts) != 1 || sorts[0].(map[string]any)["order"] != "desc" {
		t.Fatalf("unexpected sorts: %v", sorts)
	}
}

func TestTopoOrderPutsDependenciesFirst(t *testing.T) {
	order := topoOrder(map[string][]string{
		"c": {"b"},
		"b": {"a"},
	})
	index := map[string]int{}
	for i, id := range order {
		index[id] = i
	}
	if index["a"] > index["b"] || index["b"] > index["c"] {
		t.Fatalf("unexpected topological order: %v", order)
	}
}

func strPtr(s string) *string { return &s }

func TestBuildKeywordConditionAddsDocTitleBranch(t *testing.T) {
	docField := uuid.New()
	nodeID := "11111111-2222-3333-4444-555555555502"
	baseCond := `EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.value_text ILIKE ?)`
	cond, args := buildKeywordCondition(baseCond, []any{"%星海%"}, []uuid.UUID{docField}, []string{nodeID}, "r.id")
	if !strings.Contains(cond, "dv.value_text ILIKE ?") {
		t.Fatalf("expected doc-title branch, got %s", cond)
	}
	if !strings.HasPrefix(cond, "(") {
		t.Fatalf("expected combined condition, got %s", cond)
	}
	if len(args) != 3 {
		t.Fatalf("expected 3 args, got %d (%v)", len(args), args)
	}
	if args[2] != "%"+nodeID+"%" {
		t.Fatalf("unexpected node id arg: %v", args[2])
	}
}

func TestBuildKeywordConditionWithoutDocFields(t *testing.T) {
	baseCond := `EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.value_text ILIKE ?)`
	cond, args := buildKeywordCondition(baseCond, []any{"%x%"}, nil, []string{"y"}, "r.id")
	if cond != baseCond || len(args) != 1 {
		t.Fatalf("expected unchanged condition, got %s / %v", cond, args)
	}
}
