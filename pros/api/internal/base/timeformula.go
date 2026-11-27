package base

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// 时间敏感公式（§7.7「按天重算 + 惰性补算」）。
//
// TODAY() 这类函数的取值依赖「当前时间」：昨天算出来的结果今天就过期了。
// 策略：
//   - **按天重算**：每天定点批量重算一遍含时间函数的表；
//   - **惰性补算**：用户打开表时，如果发现本表今天还没重算过，立刻补算一次
//     （避免用户看到昨天的值）；补算只影响「本表有变化的那几张表」。
//
// 为什么不让公式在每次读取时实时求值：
//   - 公式值是**落库**的（记录 JSON 里的字段值），实时求值等于每次查询都重写数据；
//   - 大表重算成本高，实时求值会让首屏变慢。

// timeSensitiveFuncs 是随时间变化的公式函数。
var timeSensitiveFuncs = []string{"TODAY", "NOW"}

// timeRecalcState 记录每张表「最后一次按天重算」的日期。
type timeRecalcState struct {
	mu   sync.Mutex
	days map[uuid.UUID]string // tableID → 2026-11-27
}

var timeRecalc = &timeRecalcState{days: map[uuid.UUID]string{}}

// todayKey 返回当天的键（本地时区）。
func todayKey() string {
	return time.Now().Format("2006-01-02")
}

// MarkRecalculated 记录某张表今天已经重算过。
func (s *Service) MarkRecalculated(tableID uuid.UUID) {
	timeRecalc.mu.Lock()
	defer timeRecalc.mu.Unlock()
	timeRecalc.days[tableID] = todayKey()
}

// NeedsTimeRecalc 判断某张表今天是否还需要（惰性）重算。
func (s *Service) NeedsTimeRecalc(tableID uuid.UUID) bool {
	timeRecalc.mu.Lock()
	defer timeRecalc.mu.Unlock()
	return timeRecalc.days[tableID] != todayKey()
}

// expressionIsTimeSensitive 判断表达式是否用到时间函数。
func expressionIsTimeSensitive(expr string) bool {
	upper := strings.ToUpper(expr)
	for _, fn := range timeSensitiveFuncs {
		if strings.Contains(upper, fn+"(") {
			return true
		}
	}
	return false
}

// RecalcTimeSensitiveTables 重算所有「含时间函数」的表。
//
// 返回被更新的记录数。跨天打开表格时由惰性补算触发，每日批处理也会调用。
func (s *Service) RecalcTimeSensitiveTables(ctx context.Context) (int, error) {
	var tables []BaseTable
	if err := s.db.WithContext(ctx).Where("status = 1").Find(&tables).Error; err != nil {
		return 0, err
	}
	updated := 0
	for _, table := range tables {
		var formulas []BaseFieldFormula
		if err := s.db.WithContext(ctx).
			Where("status = 1 AND calculation_mode = ?", "sync").
			Find(&formulas).Error; err != nil {
			return updated, err
		}
		sensitive := false
		for _, f := range formulas {
			if expressionIsTimeSensitive(f.Expression) {
				sensitive = true
				break
			}
		}
		if !sensitive {
			continue
		}
		if err := s.recalcTableFormulas(ctx, table.ID); err != nil {
			return updated, err
		}
		updated++
		s.MarkRecalculated(table.ID)
	}
	return updated, nil
}

// EnsureTableTimeRecalc 在用户打开表时做「惰性补算」。
//
// 今天还没重算过 → 立刻补算；否则直接返回。
func (s *Service) EnsureTableTimeRecalc(ctx context.Context, tableID uuid.UUID) error {
	if !s.NeedsTimeRecalc(tableID) {
		return nil
	}
	// 只有真的含时间函数才重算：先看一眼该表的公式定义。
	var formulas []BaseFieldFormula
	if err := s.db.WithContext(ctx).Where("status = 1 AND calculation_mode = ?", "sync").Find(&formulas).Error; err != nil {
		return err
	}
	sensitive := false
	for _, f := range formulas {
		if expressionIsTimeSensitive(f.Expression) {
			sensitive = true
			break
		}
	}
	if !sensitive {
		s.MarkRecalculated(tableID)
		return nil
	}
	if err := s.recalcTableFormulas(ctx, tableID); err != nil {
		return err
	}
	s.MarkRecalculated(tableID)
	return nil
}

// StartDailyTimeRecalc 启动「每日按天重算」的后台任务。
//
// 触发时机：
//   - 启动后立刻跑一次（补上服务停机期间错过的那天）；
//   - 之后每天 00:05 跑一次。
func (s *Service) StartDailyTimeRecalc(ctx context.Context) {
	go func() {
		// 启动补算（失败不阻断服务）。
		if _, err := s.RecalcTimeSensitiveTables(ctx); err != nil {
			log.Printf("base: daily time recalc failed: %v", err)
		}
		for {
			now := time.Now()
			next := time.Date(now.Year(), now.Month(), now.Day(), 0, 5, 0, 0, now.Location()).
				AddDate(0, 0, 1)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Until(next)):
				if _, err := s.RecalcTimeSensitiveTables(ctx); err != nil {
					log.Printf("base: daily time recalc failed: %v", err)
				}
			}
		}
	}()
}
