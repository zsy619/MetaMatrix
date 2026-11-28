package base

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func testTextFieldIndex(t *testing.T) (uuid.UUID, *fieldIndex) {
	t.Helper()
	id := uuid.New()
	reg := NewRegistry()
	handler, ok := reg.Get(FieldText)
	if !ok {
		t.Fatal("text field handler missing")
	}
	idx := &fieldIndex{
		byID: map[uuid.UUID]FieldMeta{
			id: {ID: id.String(), Name: "名称", Type: string(FieldText)},
		},
		handlers: map[uuid.UUID]FieldHandler{id: handler},
	}
	return id, idx
}

func TestConditionSQLEmptyChecksFilledText(t *testing.T) {
	id, idx := testTextFieldIndex(t)
	handler, _ := idx.handler(id)
	svc := &Service{}

	emptySQL, emptyArgs, err := svc.conditionSQL(id, handler, string(FieldText), Condition{Operator: "isempty"})
	if err != nil {
		t.Fatalf("isempty: %v", err)
	}
	if len(emptyArgs) != 1 || emptyArgs[0] != id {
		t.Fatalf("isempty args = %#v", emptyArgs)
	}
	if !strings.Contains(emptySQL, "NOT EXISTS") {
		t.Fatalf("isempty should be NOT EXISTS: %s", emptySQL)
	}
	if !strings.Contains(emptySQL, "AND NOT (") {
		t.Fatalf("isempty should negate the all-empty predicate, got %s", emptySQL)
	}

	filledSQL, filledArgs, err := svc.conditionSQL(id, handler, string(FieldText), Condition{Operator: "isnotempty"})
	if err != nil {
		t.Fatalf("isnotempty: %v", err)
	}
	if len(filledArgs) != 1 || filledArgs[0] != id {
		t.Fatalf("isnotempty args = %#v", filledArgs)
	}
	if !strings.HasPrefix(filledSQL, "EXISTS (") {
		t.Fatalf("isnotempty should be EXISTS: %s", filledSQL)
	}
	if !strings.Contains(filledSQL, "AND NOT (") {
		t.Fatalf("isnotempty should require a non-empty projection, got %s", filledSQL)
	}
	// 已有文本的投影行必须能被 isnotempty 命中，而不能被 isempty 命中。
	if !strings.Contains(filledSQL, "value_text") {
		t.Fatalf("expected value_text in %s", filledSQL)
	}
}

func TestBuildFilterSQLNotContainsAndStartsWith(t *testing.T) {
	id, idx := testTextFieldIndex(t)
	svc := &Service{}
	tableID := uuid.New()
	sql, args, err := svc.buildFilterSQL(tableID, idx, FilterGroup{
		Logic: "AND",
		Conditions: []Condition{
			{FieldID: id.String(), Operator: "notcontains", Value: "弃"},
			{FieldID: id.String(), Operator: "startswith", Value: "前%缀"},
		},
	})
	if err != nil {
		t.Fatalf("buildFilterSQL: %v", err)
	}
	if !strings.Contains(sql, "NOT EXISTS") || !strings.Contains(sql, "ILIKE") {
		t.Fatalf("expected NOT EXISTS ILIKE for notcontains, got %s", sql)
	}
	if !strings.Contains(sql, " AND ") {
		t.Fatalf("expected AND join, got %s", sql)
	}
	if len(args) != 4 {
		t.Fatalf("args len=%d %#v", len(args), args)
	}
	if args[1] != "%弃%" {
		t.Fatalf("notcontains pattern = %#v", args[1])
	}
	// startswith 必须把 % 和 _ 转义后再加后缀通配符
	if args[3] != "前\\%缀%" {
		t.Fatalf("startswith escaped pattern = %#v", args[3])
	}
}
