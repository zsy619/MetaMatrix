package mail

import (
	"context"
	"errors"
	"testing"
	"time"
)

type seqSender struct {
	errs []error
	n    int
	got  []Message
}

func (s *seqSender) Send(_ context.Context, msg Message) error {
	s.got = append(s.got, msg)
	if s.n < len(s.errs) {
		err := s.errs[s.n]
		s.n++
		return err
	}
	s.n++
	return nil
}

func (s *seqSender) Describe() string { return "seq" }

func TestSendWithRetrySucceedsOnSecondAttempt(t *testing.T) {
	s := &seqSender{errs: []error{errors.New("temp down")}}
	err := SendWithRetry(context.Background(), s, Message{To: "a@b.c", Subject: "x"}, 2, 0)
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if s.n != 2 {
		t.Fatalf("attempts = %d, want 2", s.n)
	}
}

func TestSendWithRetryDoesNotRetryNotConfigured(t *testing.T) {
	s := &seqSender{errs: []error{ErrNotConfigured}}
	err := SendWithRetry(context.Background(), s, Message{To: "a@b.c"}, 3, 0)
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err = %v", err)
	}
	if s.n != 1 {
		t.Fatalf("attempts = %d, want 1", s.n)
	}
}

func TestWindowLimiterCapsHitsInsideWindow(t *testing.T) {
	l := NewWindowLimiter(2, time.Minute)
	fixed := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return fixed }
	if !l.Allow("a@b.c") || !l.Allow("a@b.c") {
		t.Fatal("first two should pass")
	}
	if l.Allow("a@b.c") {
		t.Fatal("third inside window should be limited")
	}
	if !l.Allow("other@b.c") {
		t.Fatal("different key should pass")
	}
	l.now = func() time.Time { return fixed.Add(time.Minute + time.Second) }
	if !l.Allow("a@b.c") {
		t.Fatal("after window should pass again")
	}
}
