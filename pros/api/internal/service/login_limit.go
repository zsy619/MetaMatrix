package service

import (
	"sync"
	"time"
)

// AttemptLimiter counts failures in a sliding window. It keeps no business rows:
// the map lives in process memory and resets on restart.
type AttemptLimiter struct {
	mu      sync.Mutex
	window  time.Duration
	perPair int
	perIP   int
	events  map[string][]time.Time
}

func NewAttemptLimiter(window time.Duration, perPair, perIP int) *AttemptLimiter {
	if window <= 0 {
		window = 15 * time.Minute
	}
	if perPair < 1 {
		perPair = 8
	}
	if perIP < 1 {
		perIP = 30
	}
	return &AttemptLimiter{
		window:  window,
		perPair: perPair,
		perIP:   perIP,
		events:  map[string][]time.Time{},
	}
}

func pairKey(ip, email string) string { return "pair:" + ip + "|" + email }
func ipKey(ip string) string          { return "ip:" + ip }

// Allow reports whether another login attempt may proceed.
// retryAfter is how long until the oldest failure in the blocking bucket expires.
func (l *AttemptLimiter) Allow(ip, email string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if ok, wait := l.allowLocked(ipKey(ip), l.perIP, now); !ok {
		return false, wait
	}
	return l.allowLocked(pairKey(ip, email), l.perPair, now)
}

// RecordFailure stores a failed credential check.
func (l *AttemptLimiter) RecordFailure(ip, email string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.hitLocked(ipKey(ip), now)
	l.hitLocked(pairKey(ip, email), now)
}

// Reset clears the pair bucket after a successful login. The IP bucket stays,
// so one success does not erase other failures from the same address.
func (l *AttemptLimiter) Reset(ip, email string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.events, pairKey(ip, email))
}

func (l *AttemptLimiter) allowLocked(key string, max int, now time.Time) (bool, time.Duration) {
	l.pruneLocked(key, now)
	hits := l.events[key]
	if len(hits) < max {
		return true, 0
	}
	wait := l.window - now.Sub(hits[0])
	if wait < time.Second {
		wait = time.Second
	}
	return false, wait
}

func (l *AttemptLimiter) hitLocked(key string, now time.Time) {
	l.pruneLocked(key, now)
	l.events[key] = append(l.events[key], now)
}

func (l *AttemptLimiter) pruneLocked(key string, now time.Time) {
	hits := l.events[key]
	if len(hits) == 0 {
		return
	}
	cut := now.Add(-l.window)
	i := 0
	for i < len(hits) && !hits[i].After(cut) {
		i++
	}
	if i == 0 {
		return
	}
	if i >= len(hits) {
		delete(l.events, key)
		return
	}
	l.events[key] = hits[i:]
}
