package base

import (
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Base Engine 的进程内指标（技术文档 §15.2 性能验收 + §16.3 可观测性）。
//
// 为什么自己实现而不是引 Prometheus SDK：
//   - 依赖越少，部署越简单（当前项目连 Redis 都没有引入）；
//   - 需要的指标很有限（QPS / P95 / 慢查询 / Outbox 堆积 / 幂等冲突）；
//   - 暴露格式直接复用全局 /metrics 的 Prometheus 文本，采集端不用改。
//
// 所有计数器都是进程内状态，重启归零 —— 这是刻意的：
// 真正的历史指标应该落在时序库里，本模块只回答「现在健康吗」。
var (
	metricsMu sync.Mutex
	// latencySamples 保存最近 N 次查询耗时，用于算 P95。
	latencySamples = make([]float64, 0, 1024)
	latencyCursor  int
	// queryCountByType 记录各类操作的成功 / 失败次数。
	queryCountByType = map[string]*int64{}
	// slowQueries 慢查询计数（超过 slowQueryThreshold）。
	slowQueries atomic.Int64
	// outboxPublished / outboxFailed 事件投递统计。
	outboxPublished atomic.Int64
	outboxFailed    atomic.Int64
	// outboxDead 进入死信队列的事件数。
	outboxDead atomic.Int64
	// idempotencyConflicts 幂等键冲突次数。
	idempotencyConflicts atomic.Int64
	// activeSubscribers 当前 SSE 订阅数。
	activeSubscribers atomic.Int64
	// slowQueryThreshold 慢查询阈值（毫秒）。
	slowQueryThreshold = 500
	// latencyWindow 查询耗时采样窗口大小。
	latencyWindow = 1024
)

// initMetrics 初始化指标计数表。
func init() {
	for _, op := range []string{
		OpQuery, OpCreateRecord, OpUpdateRecord, OpDeleteRecord,
		OpBatch, OpFormula, OpImport, OpConfig,
	} {
		v := int64(0)
		queryCountByType[op] = &v
	}
}

// 操作类型常量（用于指标分类）。
const (
	OpQuery        = "query"
	OpCreateRecord = "record.create"
	OpUpdateRecord = "record.update"
	OpDeleteRecord = "record.delete"
	OpBatch        = "record.batch"
	OpFormula      = "formula"
	OpImport       = "import"
	OpConfig       = "config"
)

// ObserveOperation 记录一次操作的耗时与成败。
func ObserveOperation(op string, duration time.Duration, err error) {
	metricsMu.Lock()
	if counter, ok := queryCountByType[op]; ok {
		atomic.AddInt64(counter, 1)
	}
	latencyMillis := float64(duration.Microseconds()) / 1000
	if len(latencySamples) < latencyWindow {
		latencySamples = append(latencySamples, latencyMillis)
	} else {
		latencySamples[latencyCursor] = latencyMillis
		latencyCursor = (latencyCursor + 1) % latencyWindow
	}
	metricsMu.Unlock()
	if latencyMillis > float64(slowQueryThreshold) {
		slowQueries.Add(1)
	}
	if err != nil {
		ObserveError()
	}
}

// ObserveError 记录一次业务错误。
func ObserveError() { errorTotal.Add(1) }

// errorTotal 业务错误总数。
var errorTotal atomic.Int64

// ObserveOutboxPublished 记录一次事件成功投递。
func ObserveOutboxPublished() { outboxPublished.Add(1) }

// ObserveOutboxFailed 记录一次事件投递失败。
func ObserveOutboxFailed() { outboxFailed.Add(1) }

// ObserveOutboxDead 记录一条进入死信队列的事件。
func ObserveOutboxDead() { outboxDead.Add(1) }

// ObserveIdempotencyConflict 记录一次幂等键冲突。
func ObserveIdempotencyConflict() { idempotencyConflicts.Add(1) }

// ObserveSubscriberInc / Dec 跟踪 SSE 订阅数。
func ObserveSubscriberInc() { activeSubscribers.Add(1) }

// ObserveSubscriberDec 跟踪 SSE 订阅数。
func ObserveSubscriberDec() { activeSubscribers.Add(-1) }

// BaseMetricsSnapshot 是 Base Engine 的指标快照。
type BaseMetricsSnapshot struct {
	Operations           map[string]int64 `json:"operations"`
	Errors               int64            `json:"errors"`
	SlowQueries          int64            `json:"slowQueries"`
	P50Millis            float64          `json:"p50Millis"`
	P95Millis            float64          `json:"p95Millis"`
	P99Millis            float64          `json:"p99Millis"`
	SlowThresholdMs      int              `json:"slowThresholdMillis"`
	OutboxPublished      int64            `json:"outboxPublished"`
	OutboxFailed         int64            `json:"outboxFailed"`
	OutboxDead           int64            `json:"outboxDead"`
	IdempotencyConflicts int64            `json:"idempotencyConflicts"`
	ActiveSubscribers    int64            `json:"activeSubscribers"`
}

// SnapshotBaseMetrics 采样当前指标。
func SnapshotBaseMetrics() BaseMetricsSnapshot {
	metricsMu.Lock()
	samples := make([]float64, len(latencySamples))
	copy(samples, latencySamples)
	metricsMu.Unlock()
	sortFloats(samples)
	out := BaseMetricsSnapshot{
		Operations:           map[string]int64{},
		Errors:               errorTotal.Load(),
		SlowQueries:          slowQueries.Load(),
		SlowThresholdMs:      slowQueryThreshold,
		OutboxPublished:      outboxPublished.Load(),
		OutboxFailed:         outboxFailed.Load(),
		OutboxDead:           outboxDead.Load(),
		IdempotencyConflicts: idempotencyConflicts.Load(),
		ActiveSubscribers:    activeSubscribers.Load(),
	}
	for op, counter := range queryCountByType {
		out.Operations[op] = atomic.LoadInt64(counter)
	}
	if len(samples) > 0 {
		out.P50Millis = percentile(samples, 0.50)
		out.P95Millis = percentile(samples, 0.95)
		out.P99Millis = percentile(samples, 0.99)
	}
	return out
}

// PrometheusBaseMetrics 输出 Base Engine 的 Prometheus 文本指标。
func PrometheusBaseMetrics() string {
	snap := SnapshotBaseMetrics()
	buf := ""
	buf += "# HELP metamatrix_base_operations_total Base Engine operations by type.\n"
	buf += "# TYPE metamatrix_base_operations_total counter\n"
	for op, count := range snap.Operations {
		buf += "metamatrix_base_operations_total{op=\"" + op + "\"} " + itoa(count) + "\n"
	}
	buf += "# HELP metamatrix_base_errors_total Base Engine business errors.\n"
	buf += "# TYPE metamatrix_base_errors_total counter\n"
	buf += "metamatrix_base_errors_total " + itoa(snap.Errors) + "\n"
	buf += "# HELP metamatrix_base_slow_queries_total Queries slower than the threshold.\n"
	buf += "# TYPE metamatrix_base_slow_queries_total counter\n"
	buf += "metamatrix_base_slow_queries_total " + itoa(snap.SlowQueries) + "\n"
	buf += "# HELP metamatrix_base_query_latency_milliseconds Query latency percentiles.\n"
	buf += "# TYPE metamatrix_base_query_latency_milliseconds gauge\n"
	buf += "metamatrix_base_query_latency_milliseconds{quantile=\"0.5\"} " + ftoa(snap.P50Millis) + "\n"
	buf += "metamatrix_base_query_latency_milliseconds{quantile=\"0.95\"} " + ftoa(snap.P95Millis) + "\n"
	buf += "metamatrix_base_query_latency_milliseconds{quantile=\"0.99\"} " + ftoa(snap.P99Millis) + "\n"
	buf += "# HELP metamatrix_base_outbox_published_total Events published from the outbox.\n"
	buf += "# TYPE metamatrix_base_outbox_published_total counter\n"
	buf += "metamatrix_base_outbox_published_total " + itoa(snap.OutboxPublished) + "\n"
	buf += "# HELP metamatrix_base_outbox_failed_total Events that failed to publish.\n"
	buf += "# TYPE metamatrix_base_outbox_failed_total counter\n"
	buf += "metamatrix_base_outbox_failed_total " + itoa(snap.OutboxFailed) + "\n"
	buf += "# HELP metamatrix_base_outbox_dead_total Events moved to the dead letter queue.\n"
	buf += "# TYPE metamatrix_base_outbox_dead_total counter\n"
	buf += "metamatrix_base_outbox_dead_total " + itoa(snap.OutboxDead) + "\n"
	buf += "# HELP metamatrix_base_idempotency_conflicts_total Idempotency key conflicts.\n"
	buf += "# TYPE metamatrix_base_idempotency_conflicts_total counter\n"
	buf += "metamatrix_base_idempotency_conflicts_total " + itoa(snap.IdempotencyConflicts) + "\n"
	buf += "# HELP metamatrix_base_active_subscribers Current SSE subscribers.\n"
	buf += "# TYPE metamatrix_base_active_subscribers gauge\n"
	buf += "metamatrix_base_active_subscribers " + itoa(snap.ActiveSubscribers) + "\n"
	return buf
}

// sortFloats 升序排序（样本量小，直接插入排序即可）。
func sortFloats(values []float64) {
	for i := 1; i < len(values); i++ {
		v := values[i]
		j := i - 1
		for j >= 0 && values[j] > v {
			values[j+1] = values[j]
			j--
		}
		values[j+1] = v
	}
}

// percentile 取分位数（线性插值）。
func percentile(sorted []float64, q float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	pos := q * float64(len(sorted)-1)
	lower := int(pos)
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := pos - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

// itoa 把 int64 转成字符串（避免为一个小工具引入 strconv 之外的依赖）。
func itoa(v int64) string {
	return strconv.FormatInt(v, 10)
}

// ftoa 把 float64 转成字符串（保留 3 位小数）。
func ftoa(v float64) string {
	return strconv.FormatFloat(v, 'f', 3, 64)
}
