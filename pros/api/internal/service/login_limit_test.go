package service

import (
	"testing"
	"time"
)

func TestAttemptLimiterBlocksAndExpires(t *testing.T) {
	lim := NewAttemptLimiter(time.Minute, 3, 10)
	now := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	ip, email := "203.0.113.8", "demo@metamatrix.local"

	for i := 0; i < 3; i++ {
		ok, _ := lim.Allow(ip, email, now)
		if !ok {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
		lim.RecordFailure(ip, email, now)
	}
	ok, wait := lim.Allow(ip, email, now.Add(time.Second))
	if ok || wait < time.Second {
		t.Fatalf("fourth attempt allowed=%v wait=%s", ok, wait)
	}

	later := now.Add(time.Minute + time.Second)
	ok, _ = lim.Allow(ip, email, later)
	if !ok {
		t.Fatal("window should have expired")
	}
}

func TestAttemptLimiterIPCapAndReset(t *testing.T) {
	lim := NewAttemptLimiter(time.Minute, 8, 2)
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	ip := "203.0.113.9"

	lim.RecordFailure(ip, "a@example.com", now)
	lim.RecordFailure(ip, "b@example.com", now)
	ok, _ := lim.Allow(ip, "c@example.com", now)
	if ok {
		t.Fatal("ip cap should block a new email")
	}

	lim2 := NewAttemptLimiter(time.Minute, 2, 20)
	lim2.RecordFailure(ip, "a@example.com", now)
	lim2.RecordFailure(ip, "a@example.com", now)
	lim2.Reset(ip, "a@example.com")
	ok, _ = lim2.Allow(ip, "a@example.com", now)
	if !ok {
		t.Fatal("reset should clear the pair bucket")
	}
}
