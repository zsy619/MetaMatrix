package service

import "testing"

func TestValidateCanvasImport(t *testing.T) {
	if err := ValidateCanvasImport([]byte(`{"type":"time_matrix","schemaVersion":1}`)); err != nil {
		t.Fatal(err)
	}
	if err := ValidateCanvasImport([]byte(`[]`)); err != ErrValidation {
		t.Fatalf("array = %v", err)
	}
	if err := ValidateCanvasImport([]byte(`{"schemaVersion":1}`)); err != ErrValidation {
		t.Fatalf("missing type = %v", err)
	}
	if err := ValidateCanvasImport([]byte(`{"type":"time_matrix","schemaVersion":"1"}`)); err != ErrValidation {
		t.Fatalf("string version = %v", err)
	}
	if err := ValidateCanvasImport([]byte(`not json`)); err != ErrValidation {
		t.Fatalf("junk = %v", err)
	}
}

func TestCanvasMarkdown(t *testing.T) {
	raw := []byte(`{"type":"time_matrix","schemaVersion":1,"blocks":[{"title":"重要且紧急","items":[{"text":"<p>先做这一件</p>"}]}]}`)
	md, err := CanvasMarkdown("本周", raw)
	if err != nil {
		t.Fatal(err)
	}
	if !containsAll(md, "# 本周", "重要且紧急", "先做这一件", "time_matrix") {
		t.Fatalf("markdown = %s", md)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !contains(s, p) {
			return false
		}
	}
	return true
}

func contains(s, part string) bool {
	return len(part) == 0 || (len(s) >= len(part) && (s == part || len(s) > 0 && (indexOf(s, part) >= 0)))
}

func indexOf(s, part string) int {
	for i := 0; i+len(part) <= len(s); i++ {
		if s[i:i+len(part)] == part {
			return i
		}
	}
	return -1
}
