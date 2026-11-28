package mail

import (
	"context"
	"errors"
	"sync"
	"time"
)

const (
	DefaultRetryAttempts  = 2
	DefaultRetryWait      = 150 * time.Millisecond
	DefaultMailRateMax    = 20
	DefaultMailRateWindow = time.Minute
)

// ShouldRetry reports whether a send error is worth one more attempt.
// 未配置的传输不会重试；其它 SMTP / 网络错误最多再试一次。
func ShouldRetry(err error) bool {
	if err == nil || errors.Is(err, ErrNotConfigured) {
		return false
	}
	return true
}

// SendWithRetry 发送邮件，失败时按间隔再试（默认共 2 次）。wait <= 0 时不等待，便于测试。
func SendWithRetry(ctx context.Context, sender Sender, msg Message, attempts int, wait time.Duration) error {
	if sender == nil {
		return ErrNotConfigured
	}
	if attempts < 1 {
		attempts = DefaultRetryAttempts
	}
	var last error
	for i := 0; i < attempts; i++ {
		if i > 0 && wait > 0 {
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
		}
		last = sender.Send(ctx, msg)
		if last == nil || !ShouldRetry(last) {
			return last
		}
	}
	return last
}

// WindowLimiter 是单进程滑动窗口限流。跨实例不共享，不能当成集群限流。
type WindowLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	window time.Duration
	max    int
	now    func() time.Time
}

func NewWindowLimiter(max int, window time.Duration) *WindowLimiter {
	if max <= 0 {
		max = DefaultMailRateMax
	}
	if window <= 0 {
		window = DefaultMailRateWindow
	}
	return &WindowLimiter{
		hits:   map[string][]time.Time{},
		window: window,
		max:    max,
		now:    time.Now,
	}
}

func (l *WindowLimiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	now := l.now()
	cutoff := now.Add(-l.window)
	l.mu.Lock()
	defer l.mu.Unlock()
	kept := l.hits[key][:0]
	for _, ts := range l.hits[key] {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if cap(kept) == 0 {
		kept = nil
	}
	if len(kept) >= l.max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}
