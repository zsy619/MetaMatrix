package service

import (
	"bytes"
	"strings"
	"testing"
)

func TestClonePayloadCopiesBytesVerbatim(t *testing.T) {
	src := []byte(`{"id":"dual-triangle","type":"dual-triangle","schemaVersion":1,"order":[3,1,2],"big":12345678901234567890}`)
	got, err := clonePayload(src)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, src) {
		t.Fatalf("payload changed: %s", got)
	}
	// The copy must not share the backing array with the source.
	got[0] = '['
	if src[0] != '{' {
		t.Fatal("clone payload shares memory with the source")
	}
}

func TestClonePayloadRejectsInvalidJSON(t *testing.T) {
	if _, err := clonePayload(nil); err != ErrValidation {
		t.Fatalf("empty = %v", err)
	}
	if _, err := clonePayload([]byte(`{"a":`)); err != ErrValidation {
		t.Fatalf("broken = %v", err)
	}
}

func TestClonePayloadRejectsOversizedPayload(t *testing.T) {
	big := make([]byte, maxCanvasBytes+1)
	for i := range big {
		big[i] = 'a'
	}
	big[0] = '"'
	big[len(big)-1] = '"'
	if _, err := clonePayload(big); err != ErrPayloadTooLarge {
		t.Fatalf("oversized = %v", err)
	}
}

func TestCloneTitle(t *testing.T) {
	if got := cloneTitle("需求评审", nil); got != "需求评审"+CloneTitleSuffix {
		t.Fatalf("suffix = %q", got)
	}
	blank := "   "
	if got := cloneTitle("需求评审", &blank); got != "需求评审"+CloneTitleSuffix {
		t.Fatalf("blank override = %q", got)
	}
	custom := "新的副本"
	if got := cloneTitle("需求评审", &custom); got != custom {
		t.Fatalf("override = %q", got)
	}
	long := strings.Repeat("题", maxTitleRunes+10)
	if got := cloneTitle(long, nil); len([]rune(got)) != maxTitleRunes {
		t.Fatalf("truncated length = %d", len([]rune(got)))
	}
}
