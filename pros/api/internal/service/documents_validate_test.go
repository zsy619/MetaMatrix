package service

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestAssertHead(t *testing.T) {
	id := uuid.New()
	raw := id.String()
	if err := assertHead(&id, &raw, true); err != nil {
		t.Fatal(err)
	}
	if err := assertHead(nil, nil, true); err != nil {
		t.Fatal(err)
	}
	other := uuid.New().String()
	if err := assertHead(&id, &other, true); err != ErrHeadConflict {
		t.Fatalf("mismatch = %v", err)
	}
	bad := "not-a-uuid"
	if err := assertHead(&id, &bad, true); err != ErrInvalidHead {
		t.Fatalf("bad uuid = %v", err)
	}
	if err := assertHead(nil, &raw, false); err != nil {
		t.Fatal("unchecked head should pass")
	}
}

func TestValidateMetaAndPayload(t *testing.T) {
	title := strings.Repeat("题", 256)
	if err := validateMeta(&title, nil, nil, nil); err != ErrValidation {
		t.Fatalf("title = %v", err)
	}
	notes := strings.Repeat("n", 8001)
	if err := validateMeta(nil, &notes, nil, nil); err != ErrValidation {
		t.Fatalf("notes = %v", err)
	}
	ok := "时间矩阵"
	if err := validateMeta(&ok, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	big := make([]byte, maxCanvasBytes+1)
	if err := validatePayload(big); err != ErrPayloadTooLarge {
		t.Fatalf("payload = %v", err)
	}
	if err := validatePayload([]byte(`{"type":"time_matrix"}`)); err != nil {
		t.Fatal(err)
	}
}

func TestNormalizeBatchIDs(t *testing.T) {
	id := uuid.New().String()
	got, err := NormalizeBatchIDs([]string{id, id, "  " + id})
	if err != nil || len(got) != 1 {
		t.Fatalf("dedupe = %v %v", got, err)
	}
	if _, err = NormalizeBatchIDs(nil); err != ErrValidation {
		t.Fatalf("empty = %v", err)
	}
	if _, err = NormalizeBatchIDs([]string{"nope"}); err != ErrValidation {
		t.Fatalf("bad = %v", err)
	}
	many := make([]string, 51)
	for i := range many {
		many[i] = uuid.New().String()
	}
	if _, err = NormalizeBatchIDs(many); err != ErrValidation {
		t.Fatalf("oversize = %v", err)
	}
}

func TestNormalizeListPage(t *testing.T) {
	limit, offset, paged, err := NormalizeListPage("", "")
	if err != nil || paged || limit != 0 || offset != 0 {
		t.Fatalf("unpaged = %d %d %v %v", limit, offset, paged, err)
	}
	limit, offset, paged, err = NormalizeListPage("20", "40")
	if err != nil || !paged || limit != 20 || offset != 40 {
		t.Fatalf("page = %d %d %v %v", limit, offset, paged, err)
	}
	limit, _, paged, err = NormalizeListPage("500", "")
	if err != nil || !paged || limit != maxListLimit {
		t.Fatalf("clamp = %d %v %v", limit, paged, err)
	}
	if _, _, _, err = NormalizeListPage("0", ""); err != ErrValidation {
		t.Fatalf("zero limit = %v", err)
	}
	if _, _, _, err = NormalizeListPage("x", ""); err != ErrValidation {
		t.Fatalf("bad limit = %v", err)
	}
	if _, _, _, err = NormalizeListPage("", "-1"); err != ErrValidation {
		t.Fatalf("neg offset = %v", err)
	}
}
