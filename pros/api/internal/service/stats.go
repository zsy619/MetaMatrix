package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

const statsTimezone = "Asia/Shanghai"

// StatsDoc is one canvas document reduced to the timestamps stats needs.
type StatsDoc struct {
	ID         uuid.UUID
	Title      string
	TemplateID *string
	CanvasType string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// StatsRev is one revision timestamp owned by the user.
type StatsRev struct {
	DocumentID uuid.UUID
	CreatedAt  time.Time
}

// Compare is a current window against the previous window of the same length.
type Compare struct {
	Current  int `json:"current"`
	Previous int `json:"previous"`
}

// StatsBucket is one day, week, or month in the selected range.
type StatsBucket struct {
	Start     string `json:"start"`
	Created   int    `json:"created"`
	Edited    int    `json:"edited"`
	Revisions int    `json:"revisions"`
}

// TemplateStat is usage of one template id (or canvas type when template id is empty).
type TemplateStat struct {
	TemplateID string `json:"templateId"`
	CanvasType string `json:"canvasType"`
	Total      int    `json:"total"`
	Created    int    `json:"created"`
	Edited     int    `json:"edited"`
	Series     []int  `json:"series"`
}

// HeatCell is one day on the activity calendar (Monday-start weeks).
type HeatCell struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// DocumentStats is the workspace analytics payload.
// Edited counts use each document's latest updated_at, not every historical save.
// Revision counts include every snapshot row.
type DocumentStats struct {
	Range           string         `json:"range"`
	Granularity     string         `json:"granularity"`
	Timezone        string         `json:"timezone"`
	From            string         `json:"from"`
	To              string         `json:"to"`
	PreviousFrom    string         `json:"previousFrom"`
	PreviousTo      string         `json:"previousTo"`
	Documents       Compare        `json:"documents"`
	WeekCreated     Compare        `json:"weekCreated"`
	MonthCreated    Compare        `json:"monthCreated"`
	WeekEdited      Compare        `json:"weekEdited"`
	MonthEdited     Compare        `json:"monthEdited"`
	Revisions       Compare        `json:"revisions"`
	ActiveTemplates Compare        `json:"activeTemplates"`
	RangeCreated    Compare        `json:"rangeCreated"`
	RangeEdited     Compare        `json:"rangeEdited"`
	Totals          StatsTotals    `json:"totals"`
	Activity        ActivityStats  `json:"activity"`
	Series          []StatsBucket  `json:"series"`
	Templates       []TemplateStat `json:"templates"`
	Heatmap         []HeatCell     `json:"heatmap"`
	Recent          []RecentEdit   `json:"recent"`
}

// StatsTotals are all-time figures, independent of the selected range.
type StatsTotals struct {
	Revisions int `json:"revisions"`
	Templates int `json:"templates"`
}

// ActivityStats is derived from the same daily activity map as the heatmap.
// ActiveDays counts days inside the selected window. Streak is the current run
// ending today, or yesterday when today has no activity yet. Longest is the
// longest run on or before today across all loaded history.
type ActivityStats struct {
	ActiveDays         int `json:"activeDays"`
	PreviousActiveDays int `json:"previousActiveDays"`
	Streak             int `json:"streak"`
	Longest            int `json:"longest"`
}

// RecentEdit is one of the caller's canvases, newest update first.
// 数据库主路径通过独立 ORDER BY + LIMIT 查询获得，避免为最近编辑额外载入完整列表。
type RecentEdit struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	TemplateID *string `json:"templateId"`
	CanvasType string  `json:"canvasType"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
}

func statsLocation() *time.Location {
	loc, err := time.LoadLocation(statsTimezone)
	if err != nil {
		return time.FixedZone(statsTimezone, 8*3600)
	}
	return loc
}

func normalizeStatsRange(s string) string {
	switch s {
	case "7d", "30d", "90d", "year":
		return s
	default:
		return "30d"
	}
}

func normalizeStatsGranularity(s string) string {
	switch s {
	case "day", "week", "month":
		return s
	default:
		return "day"
	}
}

func startOfDay(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

func startOfWeek(t time.Time, loc *time.Location) time.Time {
	d := startOfDay(t, loc)
	wd := int(d.Weekday())
	if wd == 0 {
		wd = 7
	}
	return d.AddDate(0, 0, -(wd - 1))
}

func startOfMonth(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
}

// statsWindow 集中定义所有查询和内存聚合共用的半开时间区间。
// SQL 与兼容入口必须调用同一函数，否则“近 7 天”和上一年比较窗口可能出现一天偏差。
type statsWindow struct {
	today        time.Time
	from         time.Time
	to           time.Time
	previousFrom time.Time
	previousTo   time.Time
	heatFrom     time.Time
	heatUntil    time.Time
}

func newStatsWindow(now time.Time, loc *time.Location, rangeKey string) statsWindow {
	now = now.In(loc)
	today := startOfDay(now, loc)
	to := today.AddDate(0, 0, 1)

	var from time.Time
	switch rangeKey {
	case "7d":
		from = today.AddDate(0, 0, -6)
	case "90d":
		from = today.AddDate(0, 0, -89)
	case "year":
		from = time.Date(today.Year(), 1, 1, 0, 0, 0, 0, loc)
	default:
		from = today.AddDate(0, 0, -29)
	}

	span := to.Sub(from)
	var previousFrom, previousTo time.Time
	if rangeKey == "year" {
		previousFrom = time.Date(today.Year()-1, 1, 1, 0, 0, 0, 0, loc)
		previousTo = previousFrom.Add(span)
	} else {
		previousTo = from
		previousFrom = from.Add(-span)
	}

	weekStart := startOfWeek(now, loc)
	return statsWindow{
		today:        today,
		from:         from,
		to:           to,
		previousFrom: previousFrom,
		previousTo:   previousTo,
		heatFrom:     weekStart.AddDate(0, 0, -52*7),
		heatUntil:    weekStart.AddDate(0, 0, 7),
	}
}

func ymd(t time.Time, loc *time.Location) string {
	return t.In(loc).Format("2006-01-02")
}

func inWindow(t, from, to time.Time) bool {
	return !t.Before(from) && t.Before(to)
}

func isSubstantiveEdit(created, updated time.Time) bool {
	return updated.Sub(created) >= time.Minute
}

func docKey(d StatsDoc) (id, canvas string) {
	canvas = d.CanvasType
	if d.TemplateID != nil && *d.TemplateID != "" {
		return *d.TemplateID, canvas
	}
	if canvas == "" {
		canvas = "unknown"
	}
	return canvas, canvas
}

func countCreated(docs []StatsDoc, from, to time.Time) int {
	n := 0
	for _, d := range docs {
		if inWindow(d.CreatedAt, from, to) {
			n++
		}
	}
	return n
}

func countEdited(docs []StatsDoc, from, to time.Time) int {
	n := 0
	for _, d := range docs {
		if isSubstantiveEdit(d.CreatedAt, d.UpdatedAt) && inWindow(d.UpdatedAt, from, to) {
			n++
		}
	}
	return n
}

func countRevisions(revs []StatsRev, from, to time.Time) int {
	n := 0
	for _, r := range revs {
		if inWindow(r.CreatedAt, from, to) {
			n++
		}
	}
	return n
}

func activeTemplateCount(docs []StatsDoc, from, to time.Time) int {
	set := map[string]struct{}{}
	for _, d := range docs {
		touched := inWindow(d.CreatedAt, from, to) ||
			(isSubstantiveEdit(d.CreatedAt, d.UpdatedAt) && inWindow(d.UpdatedAt, from, to))
		if !touched {
			continue
		}
		id, _ := docKey(d)
		set[id] = struct{}{}
	}
	return len(set)
}

func bucketStarts(from, to time.Time, granularity string, loc *time.Location) []time.Time {
	var starts []time.Time
	switch granularity {
	case "week":
		cur := startOfWeek(from, loc)
		for cur.Before(to) {
			starts = append(starts, cur)
			cur = cur.AddDate(0, 0, 7)
		}
	case "month":
		cur := startOfMonth(from, loc)
		for cur.Before(to) {
			starts = append(starts, cur)
			cur = cur.AddDate(0, 1, 0)
		}
	default:
		cur := startOfDay(from, loc)
		for cur.Before(to) {
			starts = append(starts, cur)
			cur = cur.AddDate(0, 0, 1)
		}
	}
	if len(starts) == 0 {
		starts = append(starts, startOfDay(from, loc))
	}
	return starts
}

func bucketIndex(starts []time.Time, t time.Time) int {
	if len(starts) == 0 || t.Before(starts[0]) {
		return -1
	}
	lo, hi := 0, len(starts)-1
	for lo < hi {
		mid := (lo + hi + 1) / 2
		if !t.Before(starts[mid]) {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo
}

// statsRevisionDay 是 SQL 已按“文档 + 上海自然日”压缩的修订记录。
// 它只用于补充原始范围之外的活跃历史，避免把历史每一行修订都读进 Go。
type statsRevisionDay struct {
	DocumentID uuid.UUID
	Day        string
	Count      int `gorm:"column:revision_count"`
}

type statsRevisionCounts struct {
	Total    int `gorm:"column:total_revisions"`
	Current  int `gorm:"column:current_revisions"`
	Previous int `gorm:"column:previous_revisions"`
}

// statsAggregateOptions 携带 SQL 已经算好的统计结果。recent 为 nil 时仍沿用
// 兼容入口的内存排序；非 nil（包括空切片）时表示最近编辑已由独立 LIMIT 查询提供。
type statsAggregateOptions struct {
	aggregatedRevisionDays []statsRevisionDay
	revisionCounts         statsRevisionCounts
	recent                 []RecentEdit
}

// AggregateDocumentStats folds document and revision timestamps into dashboard stats.
// now is the clock; loc is the calendar timezone (Asia/Shanghai in production).
// 该入口保留给已有调用方和兼容性测试；数据库主路径使用下面的内部聚合入口。
func AggregateDocumentStats(docs []StatsDoc, revs []StatsRev, now time.Time, loc *time.Location, rangeKey, granularity string) DocumentStats {
	return aggregateDocumentStats(docs, revs, now, loc, rangeKey, granularity, nil)
}

func aggregateDocumentStats(docs []StatsDoc, revs []StatsRev, now time.Time, loc *time.Location, rangeKey, granularity string, options *statsAggregateOptions) DocumentStats {
	if loc == nil {
		loc = statsLocation()
	}
	rangeKey = normalizeStatsRange(rangeKey)
	granularity = normalizeStatsGranularity(granularity)
	window := newStatsWindow(now, loc, rangeKey)
	today := window.today
	from, to := window.from, window.to
	prevFrom, prevTo := window.previousFrom, window.previousTo

	thisWeek := startOfWeek(now, loc)
	nextWeek := thisWeek.AddDate(0, 0, 7)
	daysIntoWeek := int(today.Sub(thisWeek).Hours()/24) + 1
	if daysIntoWeek < 1 {
		daysIntoWeek = 1
	}
	lastWeek := thisWeek.AddDate(0, 0, -7)
	lastWeekEnd := lastWeek.AddDate(0, 0, daysIntoWeek)

	thisMonth := startOfMonth(now, loc)
	nextMonth := thisMonth.AddDate(0, 1, 0)
	lastMonth := thisMonth.AddDate(0, -1, 0)
	daysIntoMonth := int(today.Sub(thisMonth).Hours()/24) + 1
	if daysIntoMonth < 1 {
		daysIntoMonth = 1
	}
	lastMonthEnd := lastMonth.AddDate(0, 0, daysIntoMonth)
	if !lastMonthEnd.Before(thisMonth) {
		lastMonthEnd = thisMonth
	}

	existedBeforeMonth := 0
	allTemplates := map[string]struct{}{}
	for _, d := range docs {
		if d.CreatedAt.Before(thisMonth) {
			existedBeforeMonth++
		}
		id, _ := docKey(d)
		allTemplates[id] = struct{}{}
	}

	starts := bucketStarts(from, to, granularity, loc)
	createdSeries := make([]int, len(starts))
	editedSeries := make([]int, len(starts))
	revSeries := make([]int, len(starts))

	type acc struct {
		id, canvas      string
		total           int
		created, edited int
		series          []int
	}
	byTpl := map[string]*acc{}
	order := make([]string, 0)

	bumpSeries := func(series []int, t time.Time, from, to time.Time) int {
		if !inWindow(t, from, to) {
			return -1
		}
		i := bucketIndex(starts, t)
		if i < 0 || i >= len(series) {
			return -1
		}
		series[i]++
		return i
	}

	for _, d := range docs {
		id, canvas := docKey(d)
		a := byTpl[id]
		if a == nil {
			a = &acc{id: id, canvas: canvas, series: make([]int, len(starts))}
			byTpl[id] = a
			order = append(order, id)
		}
		if a.canvas == "" {
			a.canvas = canvas
		}
		a.total++
		marked := map[int]struct{}{}
		if i := bumpSeries(createdSeries, d.CreatedAt, from, to); i >= 0 {
			a.created++
			marked[i] = struct{}{}
		}
		if isSubstantiveEdit(d.CreatedAt, d.UpdatedAt) {
			if i := bumpSeries(editedSeries, d.UpdatedAt, from, to); i >= 0 {
				a.edited++
				marked[i] = struct{}{}
			}
		}
		for i := range marked {
			a.series[i]++
		}
	}

	for _, r := range revs {
		bumpSeries(revSeries, r.CreatedAt, from, to)
	}

	buckets := make([]StatsBucket, len(starts))
	for i, st := range starts {
		buckets[i] = StatsBucket{
			Start:     ymd(st, loc),
			Created:   createdSeries[i],
			Edited:    editedSeries[i],
			Revisions: revSeries[i],
		}
	}

	templates := make([]TemplateStat, 0, len(order))
	for _, id := range order {
		a := byTpl[id]
		templates = append(templates, TemplateStat{
			TemplateID: a.id,
			CanvasType: a.canvas,
			Total:      a.total,
			Created:    a.created,
			Edited:     a.edited,
			Series:     a.series,
		})
	}
	sort.Slice(templates, func(i, j int) bool {
		if templates[i].Total != templates[j].Total {
			return templates[i].Total > templates[j].Total
		}
		return templates[i].TemplateID < templates[j].TemplateID
	})

	heat := map[string]int{}
	revDays := map[uuid.UUID]map[string]int{}
	for _, r := range revs {
		day := ymd(r.CreatedAt, loc)
		heat[day]++
		if revDays[r.DocumentID] == nil {
			revDays[r.DocumentID] = map[string]int{}
		}
		revDays[r.DocumentID][day]++
	}
	if options != nil {
		// 范围外修订已在 SQL 中压缩成“每文档每天一行”。这里合并计数而不是
		// 伪造 StatsRev 逐行展开，既保留活跃/去重语义，也避免历史数据量反弹。
		for _, r := range options.aggregatedRevisionDays {
			heat[r.Day] += r.Count
			if revDays[r.DocumentID] == nil {
				revDays[r.DocumentID] = map[string]int{}
			}
			revDays[r.DocumentID][r.Day] += r.Count
		}
	}
	for _, d := range docs {
		if isSubstantiveEdit(d.CreatedAt, d.UpdatedAt) {
			day := ymd(d.UpdatedAt, loc)
			if revDays[d.ID][day] == 0 {
				heat[day]++
			}
		} else if len(revDays[d.ID]) == 0 {
			heat[ymd(d.CreatedAt, loc)]++
		}
	}

	heatmap := make([]HeatCell, 0, 53*7)
	for cur := window.heatFrom; cur.Before(window.heatUntil); cur = cur.AddDate(0, 0, 1) {
		key := ymd(cur, loc)
		heatmap = append(heatmap, HeatCell{Date: key, Count: heat[key]})
	}

	activity := ActivityStats{
		ActiveDays:         countActiveDays(heat, from, to, loc),
		PreviousActiveDays: countActiveDays(heat, prevFrom, prevTo, loc),
		Streak:             currentStreak(heat, today, loc),
		Longest:            longestStreak(heat, today, loc),
	}

	var revisionCounts statsRevisionCounts
	var recent []RecentEdit
	if options != nil {
		revisionCounts = options.revisionCounts
		recent = options.recent
	} else {
		revisionCounts = statsRevisionCounts{
			Total:    len(revs),
			Current:  countRevisions(revs, from, to),
			Previous: countRevisions(revs, prevFrom, prevTo),
		}
	}
	// SQL 主路径传入非 nil recent 时直接采用 LIMIT 查询结果，不能再对全量
	// docs 做一次内存排序；兼容入口（options 为 nil）仍维持原有行为。
	if recent == nil {
		recent = recentEdits(docs, loc, 8)
	}

	return DocumentStats{
		Range:        rangeKey,
		Granularity:  granularity,
		Timezone:     statsTimezone,
		From:         ymd(from, loc),
		To:           ymd(today, loc),
		PreviousFrom: ymd(prevFrom, loc),
		PreviousTo:   ymd(prevTo.Add(-time.Nanosecond), loc),
		Documents: Compare{
			Current:  len(docs),
			Previous: existedBeforeMonth,
		},
		WeekCreated: Compare{
			Current:  countCreated(docs, thisWeek, nextWeek),
			Previous: countCreated(docs, lastWeek, lastWeekEnd),
		},
		MonthCreated: Compare{
			Current:  countCreated(docs, thisMonth, nextMonth),
			Previous: countCreated(docs, lastMonth, lastMonthEnd),
		},
		WeekEdited: Compare{
			Current:  countEdited(docs, thisWeek, nextWeek),
			Previous: countEdited(docs, lastWeek, lastWeekEnd),
		},
		MonthEdited: Compare{
			Current:  countEdited(docs, thisMonth, nextMonth),
			Previous: countEdited(docs, lastMonth, lastMonthEnd),
		},
		Revisions: Compare{
			Current:  revisionCounts.Current,
			Previous: revisionCounts.Previous,
		},
		ActiveTemplates: Compare{
			Current:  activeTemplateCount(docs, from, to),
			Previous: activeTemplateCount(docs, prevFrom, prevTo),
		},
		RangeCreated: Compare{
			Current:  countCreated(docs, from, to),
			Previous: countCreated(docs, prevFrom, prevTo),
		},
		RangeEdited: Compare{
			Current:  countEdited(docs, from, to),
			Previous: countEdited(docs, prevFrom, prevTo),
		},
		Totals: StatsTotals{
			Revisions: revisionCounts.Total,
			Templates: len(allTemplates),
		},
		Activity:  activity,
		Series:    buckets,
		Templates: templates,
		Heatmap:   heatmap,
		Recent:    recent,
	}
}

func countActiveDays(heat map[string]int, from, to time.Time, loc *time.Location) int {
	n := 0
	for cur := startOfDay(from, loc); cur.Before(to); cur = cur.AddDate(0, 0, 1) {
		if heat[ymd(cur, loc)] > 0 {
			n++
		}
	}
	return n
}

func currentStreak(heat map[string]int, today time.Time, loc *time.Location) int {
	day := startOfDay(today, loc)
	if heat[ymd(day, loc)] == 0 {
		day = day.AddDate(0, 0, -1)
		if heat[ymd(day, loc)] == 0 {
			return 0
		}
	}
	n := 0
	for heat[ymd(day, loc)] > 0 {
		n++
		day = day.AddDate(0, 0, -1)
		if n > 3660 {
			break
		}
	}
	return n
}

func longestStreak(heat map[string]int, today time.Time, loc *time.Location) int {
	today = startOfDay(today, loc)
	days := make([]time.Time, 0, len(heat))
	for key, count := range heat {
		if count <= 0 {
			continue
		}
		t, err := time.ParseInLocation("2006-01-02", key, loc)
		if err != nil || t.After(today) {
			continue
		}
		days = append(days, t)
	}
	sort.Slice(days, func(i, j int) bool { return days[i].Before(days[j]) })
	best, run := 0, 0
	var prev time.Time
	for i, d := range days {
		if i == 0 || !d.Equal(prev.AddDate(0, 0, 1)) {
			run = 1
		} else {
			run++
		}
		if run > best {
			best = run
		}
		prev = d
	}
	return best
}

func recentEdits(docs []StatsDoc, loc *time.Location, limit int) []RecentEdit {
	if limit <= 0 {
		limit = 8
	}
	cp := append([]StatsDoc(nil), docs...)
	sort.Slice(cp, func(i, j int) bool {
		if !cp[i].UpdatedAt.Equal(cp[j].UpdatedAt) {
			return cp[i].UpdatedAt.After(cp[j].UpdatedAt)
		}
		return cp[i].ID.String() < cp[j].ID.String()
	})
	if len(cp) > limit {
		cp = cp[:limit]
	}
	out := make([]RecentEdit, 0, len(cp))
	for _, d := range cp {
		var tpl *string
		if d.TemplateID != nil {
			v := strings.TrimSpace(*d.TemplateID)
			if v != "" {
				tpl = &v
			}
		}
		canvas := d.CanvasType
		if canvas == "" {
			canvas = "unknown"
		}
		out = append(out, RecentEdit{
			ID:         d.ID.String(),
			Title:      strings.TrimSpace(d.Title),
			TemplateID: tpl,
			CanvasType: canvas,
			CreatedAt:  d.CreatedAt.In(loc).Format(time.RFC3339),
			UpdatedAt:  d.UpdatedAt.In(loc).Format(time.RFC3339),
		})
	}
	return out
}

const statsRecentLimit = 8

// statsRevisionScope 是所有修订统计共用的权限与归档边界，任何 COUNT、按日聚合
// 或原始行查询都不能省略它。kb_revisions 本身没有软删字段，归档文档通过 JOIN 排除。
const statsRevisionScope = `
FROM kb_revisions r
INNER JOIN kb_documents d ON d.id = r.document_id
WHERE d.owner_user_id = ? AND d.deleted_at IS NULL
  AND (r.author_user_id IS NULL OR r.author_user_id = ?)
`

// statsRevisionQuery 只读取原始行必须覆盖的最大窗口。时间条件是半开区间 [from, to)，
// 与 AggregateDocumentStats 的 inWindow 完全一致，近 7 天请求不会再把全部历史修订加载到 Go。
const statsRevisionQuery = `
SELECT r.document_id, r.created_at` + statsRevisionScope + `
  AND r.created_at >= ? AND r.created_at < ?
`

// statsRevisionCountQuery 把全量总数、当前窗口和上一窗口三个可分批聚合的计数
// 合并为一次数据库扫描。SUM(CASE...) 同时兼容 PostgreSQL 与 SQLite，空表由 COALESCE 归零。
const statsRevisionCountQuery = `
SELECT COUNT(*) AS total_revisions,
       COALESCE(SUM(CASE WHEN r.created_at >= ? AND r.created_at < ? THEN 1 ELSE 0 END), 0) AS current_revisions,
       COALESCE(SUM(CASE WHEN r.created_at >= ? AND r.created_at < ? THEN 1 ELSE 0 END), 0) AS previous_revisions` + statsRevisionScope

// statsRevisionDayQueryFormat 聚合原始窗口之外的修订，补齐全历史活跃与最长连续活跃。
// 排除窗口是为了与 statsRevisionQuery 不重不漏；按文档和日期分组后，即使历史修订很多，
// 传到 Go 的也只是每天每文档一行，并且保留“文档当天已有修订则编辑不重复计数”的信息。
const statsRevisionDayQueryFormat = `
SELECT r.document_id, %[1]s AS day, COUNT(*) AS revision_count` + statsRevisionScope + `
  AND (r.created_at < ? OR r.created_at >= ?)
GROUP BY r.document_id, %[1]s
`

func statsRevisionDayQuery(dialect string) (string, error) {
	var dayExpression string
	switch dialect {
	case "postgres":
		// timestamptz AT TIME ZONE 会得到上海本地 wall time，再格式化为自然日。
		dayExpression = "TO_CHAR(r.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')"
	case "sqlite":
		// SQLite 没有时区名称数据库；业务固定 Asia/Shanghai，现代时间戳按 UTC+8 转换。
		dayExpression = "strftime('%Y-%m-%d', r.created_at, '+8 hours')"
	default:
		return "", fmt.Errorf("stats: unsupported SQL dialect %q", dialect)
	}
	return fmt.Sprintf(statsRevisionDayQueryFormat, dayExpression), nil
}

// ResolveStatsOwner forces personal scope. Callers cannot widen stats with a scope query.
func ResolveStatsOwner(authenticated uuid.UUID, _ string) uuid.UUID {
	return authenticated
}

func (s *DocumentsService) Stats(ownerID uuid.UUID, rangeKey, granularity string) (*DocumentStats, error) {
	return s.statsAtTime(ownerID, rangeKey, granularity, time.Now())
}

// statsAtTime 让数据库路径与纯内存兼容路径可以使用同一个固定时钟做逐字段对照测试。
func (s *DocumentsService) statsAtTime(ownerID uuid.UUID, rangeKey, granularity string, now time.Time) (*DocumentStats, error) {
	loc := statsLocation()
	rangeKey = normalizeStatsRange(rangeKey)
	granularity = normalizeStatsGranularity(granularity)
	window := newStatsWindow(now, loc, rangeKey)

	var docs []StatsDoc
	err := s.db.Model(&model.CanvasDocument{}).
		Select("id", "title", "template_id", "canvas_type", "created_at", "updated_at").
		Where("owner_user_id = ?", ownerID).
		Find(&docs).Error
	if err != nil {
		return nil, err
	}

	// 最近编辑是独立的数据库 LIMIT 查询，不再依赖“先读全部文档再排序”的结果；
	// 文档聚合仍需全量文档来计算模板总量，但最近编辑的读取数量明确有上限。
	recentDocs, err := s.loadRecentStatsDocs(ownerID, statsRecentLimit)
	if err != nil {
		return nil, err
	}
	recent := recentEdits(recentDocs, loc, statsRecentLimit)

	var counts statsRevisionCounts
	err = s.db.Raw(
		statsRevisionCountQuery,
		window.from, window.to,
		window.previousFrom, window.previousTo,
		ownerID, ownerID,
	).Scan(&counts).Error
	if err != nil {
		return nil, err
	}

	// 原始修订需要覆盖当前序列、上一比较窗口、热图和连续活跃。取这些窗口的并集，
	// 而不是只查当前 7 天，否则热图及 PreviousActiveDays 会被意外清零。
	from := window.previousFrom
	if window.heatFrom.Before(from) {
		from = window.heatFrom
	}
	to := window.heatUntil
	revs, err := s.loadStatsRevisions(ownerID, from, to)
	if err != nil {
		return nil, err
	}

	dayQuery, err := statsRevisionDayQuery(s.db.Dialector.Name())
	if err != nil {
		return nil, err
	}
	var revisionDays []statsRevisionDay
	err = s.db.Raw(dayQuery, ownerID, ownerID, from, to).Scan(&revisionDays).Error
	if err != nil {
		return nil, err
	}

	out := aggregateDocumentStats(docs, revs, now, loc, rangeKey, granularity, &statsAggregateOptions{
		aggregatedRevisionDays: revisionDays,
		revisionCounts:         counts,
		recent:                 recent,
	})
	return &out, nil
}

// loadStatsRevisions 是唯一把原始修订时间戳扫描进 Go 的入口，强制调用方提供有界窗口。
func (s *DocumentsService) loadStatsRevisions(ownerID uuid.UUID, from, to time.Time) ([]StatsRev, error) {
	var revs []StatsRev
	err := s.db.Raw(statsRevisionQuery, ownerID, ownerID, from, to).Scan(&revs).Error
	return revs, err
}

// loadRecentStatsDocs 把排序和截断都留在数据库，UUID 次序用于相同 updated_at 时稳定分页。
func (s *DocumentsService) loadRecentStatsDocs(ownerID uuid.UUID, limit int) ([]StatsDoc, error) {
	if limit <= 0 {
		limit = statsRecentLimit
	}
	var docs []StatsDoc
	err := s.db.Model(&model.CanvasDocument{}).
		Select("id", "title", "template_id", "canvas_type", "created_at", "updated_at").
		Where("owner_user_id = ?", ownerID).
		Order("updated_at DESC").
		Order("id ASC").
		Limit(limit).
		Find(&docs).Error
	return docs, err
}
