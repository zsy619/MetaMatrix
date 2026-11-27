package middleware

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
)

// RateLimiter 是「按用户 + 路径」的令牌桶限流器。
//
// 对应共享技术方案 §10.1 错误码 42901 与 §10.9「限流：按租户、用户、API 类型限流」。
// 实现是进程内的令牌桶：单实例部署足够，多实例部署需要换成共享存储（Redis），
// 当前项目没有 Redis，因此这里按「单实例口径」实现并在配置里留了开关。
type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64 // 每秒补充的令牌数
	capacity float64 // 桶容量
}

type bucket struct {
	tokens float64
	last   time.Time
}

// NewRateLimiter 构造限流器。
//
// rps：每秒允许的请求数；burst：允许的突发量。
// rps <= 0 表示不限流（关闭）。
func NewRateLimiter(rps float64, burst int) *RateLimiter {
	if rps <= 0 {
		return nil
	}
	if burst <= 0 {
		burst = int(rps) + 1
	}
	return &RateLimiter{
		buckets:  map[string]*bucket{},
		rate:     rps,
		capacity: float64(burst),
	}
}

// Allow 判断是否放行，并消耗一个令牌。
func (l *RateLimiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, last: now}
		l.buckets[key] = b
	}
	// 按时间补充令牌。
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * l.rate
		if b.tokens > l.capacity {
			b.tokens = l.capacity
		}
		b.last = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens -= 1
	return true
}

// RateLimit 返回一个 Hertz 中间件：超限直接返回 42901。
//
// 限流维度：用户 ID + 请求路径（不含 ID 段），
// 这样「同一个接口的大量调用」会被限住，而不同接口互不影响。
func RateLimit(limiter *RateLimiter) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		if limiter == nil {
			c.Next(ctx)
			return
		}
		uid, ok := UserIDFromCtx(c)
		if !ok {
			c.Next(ctx)
			return
		}
		key := uid.String() + "|" + string(c.Request.URI().Path())
		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, map[string]any{
				"code":    "42901",
				"message": "请求过于频繁，请稍后再试",
				"data":    map[string]any{"detail": "rate limited"},
			})
			c.Abort()
			return
		}
		c.Next(ctx)
	}
}
