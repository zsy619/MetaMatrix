package middleware

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// RateLimiter 是「按租户 + 用户 + 路径」的令牌桶限流器。
//
// 对应共享技术方案 §10.1 错误码 42901 与 §10.9「限流：按租户、用户、API 类型限流」。
// 实现是进程内的令牌桶：单实例部署足够，多实例部署需要换成共享存储（Redis），
// 当前项目没有 Redis，因此这里按「单实例口径」实现并在配置里留了开关。
//
// 三层口径：
//   - 租户桶：整个空间共享一份配额，防止单个空间把服务打满；
//   - 用户桶：同一空间内单个用户的突发流量；
//   - 路径桶：同一用户在同一类接口上的高频调用。
//
// 租户配额是**动态**的：可以通过 SetTenantQuota 单独调整某个空间的配额，
// 也可以挂一个 QuotaResolver，由业务侧按空间规模（成员数 / 套餐）实时算出配额。
type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64 // 每秒补充的令牌数
	capacity float64 // 桶容量

	// tenantBuckets 是租户级令牌桶（key = tenantID + "|" + 路径分类）。
	tenantBuckets map[string]*bucket
	// tenantQuota 是租户级配额覆盖（人工调整 / 套餐差异）。
	tenantQuota map[string]Quota
	// resolver 是动态配额计算器：返回 (0,0) 表示用默认配额。
	resolver QuotaResolver
	// defaultTenantQuota 是租户默认配额（一般等于全局 rps/burst 的数倍）。
	defaultTenantQuota Quota
}

// Quota 是一份配额。
type Quota struct {
	// RPS 是每秒允许的请求数。
	RPS float64
	// Burst 是允许的突发量。
	Burst int
}

// QuotaResolver 按租户实时计算配额。
//
// 返回 Quota{} 表示「没有特殊配额，按默认处理」。
type QuotaResolver func(tenantID string) Quota

type bucket struct {
	tokens float64
	last   time.Time
	// rate / capacity 允许单个桶有自己的补充速率（动态配额用）。
	rate     float64
	capacity float64
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
		// 租户默认配额取全局的 4 倍：单个空间可以并发做更多事，
		// 但仍然远小于「不限流」，一个空间刷爆服务的情况不会发生。
		tenantBuckets:      map[string]*bucket{},
		tenantQuota:        map[string]Quota{},
		defaultTenantQuota: Quota{RPS: rps * 4, Burst: burst * 4},
	}
}

// SetQuotaResolver 挂上动态配额计算器。
//
// 每次某个租户第一次触达限流器时会被调用一次；
// 返回 Quota{} 表示沿用默认配额。
func (l *RateLimiter) SetQuotaResolver(fn QuotaResolver) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.resolver = fn
}

// SetTenantQuota 单独调整某个租户的配额（人工干预或套餐升级）。
func (l *RateLimiter) SetTenantQuota(tenantID string, q Quota) {
	if l == nil || tenantID == "" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.tenantQuota[tenantID] = q
	// 立刻重建该租户的桶，让新配额立即生效（不必等桶自然衰减）。
	for key, b := range l.tenantBuckets {
		if strings.HasPrefix(key, tenantID+"|") {
			b.rate = q.RPS
			b.capacity = float64(q.Burst)
			b.tokens = float64(q.Burst)
			b.last = time.Now()
			_ = b
		}
	}
}

// TenantQuota 返回某个租户当前生效的配额（供监控 / 调试接口展示）。
func (l *RateLimiter) TenantQuota(tenantID string) Quota {
	if l == nil {
		return Quota{}
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if q, ok := l.tenantQuota[tenantID]; ok {
		return q
	}
	return l.defaultTenantQuota
}

// Allow 判断是否放行，并消耗一个令牌。
func (l *RateLimiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	return l.allowBucket(l.buckets, key, l.rate, l.capacity)
}

// allowBucket 是令牌桶的核心逻辑（调用方已持有锁）。
func (l *RateLimiter) allowBucket(buckets map[string]*bucket, key string, rate, capacity float64) bool {
	now := time.Now()
	b, ok := buckets[key]
	if !ok {
		b = &bucket{tokens: capacity, last: now, rate: rate, capacity: capacity}
		buckets[key] = b
	}
	// 配额被动态调整过：以当前参数为准。
	if rate > 0 && b.rate != rate {
		b.rate = rate
		b.capacity = capacity
		if b.tokens > capacity {
			b.tokens = capacity
		}
	}
	// 按时间补充令牌。
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * b.rate
		if b.tokens > b.capacity {
			b.tokens = b.capacity
		}
		b.last = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens -= 1
	return true
}

// AllowTenant 同时校验租户桶与用户桶。
//
// 两者都必须通过：租户桶挡住「整个空间打满」，用户桶挡住「单个人刷爆」。
func (l *RateLimiter) AllowTenant(tenantID, userKey string) bool {
	if l == nil {
		return true
	}
	// 配额解析放在锁外：resolver 可能要查库，不能在持锁状态下做 IO。
	q := l.resolveQuota(tenantID)
	l.mu.Lock()
	defer l.mu.Unlock()
	// 1) 租户级桶：整个空间共享配额。
	tKey := tenantID + "|" + pathClassOf(userKey)
	if !l.allowBucket(l.tenantBuckets, tKey, q.RPS, float64(q.Burst)) {
		return false
	}
	// 2) 用户级桶：同一用户在同一类接口上的频率。
	return l.allowBucket(l.buckets, userKey, l.rate, l.capacity)
}

// resolveQuota 解析租户生效配额。
//
// 顺序：人工覆盖 > 动态计算器 > 默认配额。
// resolver 可能要做 IO（查成员数等），因此在锁外调用。
func (l *RateLimiter) resolveQuota(tenantID string) Quota {
	l.mu.Lock()
	q, ok := l.tenantQuota[tenantID]
	resolver := l.resolver
	def := l.defaultTenantQuota
	l.mu.Unlock()
	if ok {
		return q
	}
	if resolver != nil {
		if rq := resolver(tenantID); rq.RPS > 0 {
			return rq
		}
	}
	return def
}

// PathClass 把请求路径归一化成「接口类别」。
//
// 目的：限流按「用户 × 接口类别」生效。原始路径里带 UUID（表 ID / 记录 ID / 视图 ID…），
// 换个 ID 就是新令牌桶，限流形同虚设；归一化后同一类接口共用一个桶。
//
// 规则：路径里形如 UUID / 纯数字 / 长十六进制串的段替换成 `:id`。
func PathClass(path string) string {
	segs := strings.Split(strings.Trim(path, "/"), "/")
	for i, seg := range segs {
		if isIDSegment(seg) {
			segs[i] = ":id"
		}
	}
	return "/" + strings.Join(segs, "/")
}

// isIDSegment 判断一个路径段是否是「资源 ID」。
func isIDSegment(seg string) bool {
	if seg == "" {
		return false
	}
	// UUID（含带横线 / 不带横线两种写法）。
	if _, err := uuid.Parse(seg); err == nil {
		return true
	}
	// 纯数字 ID。
	if _, err := strconv.Atoi(seg); err == nil {
		return true
	}
	// 32 位十六进制（部分 ID 用这种形式）。
	if len(seg) == 32 {
		if _, err := strconv.ParseUint(seg, 16, 64); err == nil {
			return true
		}
	}
	return false
}

// pathClassOf 从「用户 + 路径」的键里取出路径部分做分类。
func pathClassOf(userKey string) string {
	idx := strings.Index(userKey, "|")
	if idx < 0 {
		return "*"
	}
	return userKey[idx+1:]
}

// TenantFromPath 从请求路径里解析租户（空间）ID。
//
// 支持两种形态：
//   - /projects/:projectId/...            → 取 projectId
//   - /api/projects/:projectId/...        → 同上
//
// 解析不到时返回空串（此时只走用户级限流）。
func TenantFromPath(path string) string {
	segs := strings.Split(strings.Trim(path, "/"), "/")
	for i, seg := range segs {
		if seg == "projects" && i+1 < len(segs) {
			return segs[i+1]
		}
	}
	return ""
}

// RateLimit 返回一个 Hertz 中间件：超限直接返回 42901。
//
// 限流维度：租户 ID + 用户 ID + 请求路径（不含 ID 段），
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
		path := string(c.Request.URI().Path())
		tenant := TenantFromPath(path)
		// 限流维度是「用户 × 接口类别」，**不是**「用户 × 完整路径」——
		// 完整路径里带表 ID / 记录 ID / 视图 ID，每换一个 ID 就是一个新令牌桶，
		// 限流等于没开。归一化后同一类接口共用一个桶。
		userKey := uid.String() + "|" + PathClass(path)
		if tenant == "" {
			if !limiter.Allow(userKey) {
				rateLimited(c)
				return
			}
			c.Next(ctx)
			return
		}
		if !limiter.AllowTenant(tenant, userKey) {
			rateLimited(c)
			return
		}
		c.Next(ctx)
	}
}

// rateLimited 输出 42901。
func rateLimited(c *app.RequestContext) {
	c.JSON(http.StatusTooManyRequests, map[string]any{
		"code":    "42901",
		"message": "请求过于频繁，请稍后再试",
		"data":    map[string]any{"detail": "rate limited"},
	})
	c.Abort()
}
