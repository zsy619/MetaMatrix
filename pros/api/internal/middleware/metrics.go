package middleware

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// Process counters for /health and /metrics. Nothing is persisted.
var (
	startedAt      = time.Now()
	requestsTotal  atomic.Int64
	status2xx      atomic.Int64
	status4xx      atomic.Int64
	status5xx      atomic.Int64
	loginFailures  atomic.Int64
	loginThrottled atomic.Int64
	metricsMu      sync.Mutex
)

// ObserveStatus records one completed HTTP response.
func ObserveStatus(code int) {
	if code <= 0 {
		code = 200
	}
	requestsTotal.Add(1)
	switch {
	case code >= 500:
		status5xx.Add(1)
	case code >= 400:
		status4xx.Add(1)
	default:
		status2xx.Add(1)
	}
}

// ObserveLoginFailure counts a rejected credential check.
func ObserveLoginFailure() { loginFailures.Add(1) }

// ObserveLoginThrottled counts a login rejected by the in-memory limiter.
func ObserveLoginThrottled() { loginThrottled.Add(1) }

// MetricsSnapshot is the JSON shape shared with /health.
type MetricsSnapshot struct {
	UptimeSeconds int64 `json:"uptimeSeconds"`
	Requests      struct {
		Total int64 `json:"total"`
		S2xx  int64 `json:"2xx"`
		S4xx  int64 `json:"4xx"`
		S5xx  int64 `json:"5xx"`
	} `json:"requests"`
	Auth struct {
		LoginFailures int64 `json:"loginFailures"`
		RateLimited   int64 `json:"rateLimited"`
	} `json:"auth"`
}

// Snapshot copies the current counters.
func Snapshot() MetricsSnapshot {
	metricsMu.Lock()
	defer metricsMu.Unlock()
	var snap MetricsSnapshot
	snap.UptimeSeconds = int64(time.Since(startedAt).Seconds())
	snap.Requests.Total = requestsTotal.Load()
	snap.Requests.S2xx = status2xx.Load()
	snap.Requests.S4xx = status4xx.Load()
	snap.Requests.S5xx = status5xx.Load()
	snap.Auth.LoginFailures = loginFailures.Load()
	snap.Auth.RateLimited = loginThrottled.Load()
	return snap
}

// PrometheusText is a small exposition document for scrapers.
func PrometheusText() string {
	snap := Snapshot()
	return fmt.Sprintf(`# HELP metamatrix_process_uptime_seconds Process uptime.
# TYPE metamatrix_process_uptime_seconds gauge
metamatrix_process_uptime_seconds %d
# HELP metamatrix_http_requests_total Completed HTTP responses.
# TYPE metamatrix_http_requests_total counter
metamatrix_http_requests_total{class="2xx"} %d
metamatrix_http_requests_total{class="4xx"} %d
metamatrix_http_requests_total{class="5xx"} %d
# HELP metamatrix_login_failures_total Rejected login attempts.
# TYPE metamatrix_login_failures_total counter
metamatrix_login_failures_total %d
# HELP metamatrix_login_rate_limited_total Logins rejected by the in-memory limiter.
# TYPE metamatrix_login_rate_limited_total counter
metamatrix_login_rate_limited_total %d
`,
		snap.UptimeSeconds,
		snap.Requests.S2xx,
		snap.Requests.S4xx,
		snap.Requests.S5xx,
		snap.Auth.LoginFailures,
		snap.Auth.RateLimited,
	)
}
