package service

import (
	"sort"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

const statsTimezone = "Asia/Shanghai"

// StatsDoc is one canvas document reduced to the timestamps stats needs.
type StatsDoc struct {
	ID         uuid.UUID
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
	Series          []StatsBucket  `json:"series"`
	Templates       []TemplateStat `json:"templates"`
	Heatmap         []HeatCell     `json:"heatmap"`
}

// StatsTotals are all-time figures, independent of the selected range.
type StatsTotals struct {
	Revisions int `json:"revisions"`
	Templates int `json:"templates"`
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

// AggregateDocumentStats folds document and revision timestamps into dashboard stats.
// now is the clock; loc is the calendar timezone (Asia/Shanghai in production).
func AggregateDocumentStats(docs []StatsDoc, revs []StatsRev, now time.Time, loc *time.Location, rangeKey, granularity string) DocumentStats {
	if loc == nil {
		loc = statsLocation()
	}
	rangeKey = normalizeStatsRange(rangeKey)
	granularity = normalizeStatsGranularity(granularity)
	now = now.In(loc)
	today := startOfDay(now, loc)
	end := today.AddDate(0, 0, 1)

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
	to := end
	span := to.Sub(from)
	var prevFrom, prevTo time.Time
	if rangeKey == "year" {
		prevFrom = time.Date(today.Year()-1, 1, 1, 0, 0, 0, 0, loc)
		prevTo = prevFrom.Add(span)
	} else {
		prevTo = from
		prevFrom = from.Add(-span)
	}

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

	weekStart := startOfWeek(now, loc)
	heatFrom := weekStart.AddDate(0, 0, -52*7)
	heatUntil := weekStart.AddDate(0, 0, 7)
	heatmap := make([]HeatCell, 0, 53*7)
	for cur := heatFrom; cur.Before(heatUntil); cur = cur.AddDate(0, 0, 1) {
		key := ymd(cur, loc)
		heatmap = append(heatmap, HeatCell{Date: key, Count: heat[key]})
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
			Current:  countRevisions(revs, from, to),
			Previous: countRevisions(revs, prevFrom, prevTo),
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
			Revisions: len(revs),
			Templates: len(allTemplates),
		},
		Series:    buckets,
		Templates: templates,
		Heatmap:   heatmap,
	}
}

func (s *DocumentsService) Stats(ownerID uuid.UUID, rangeKey, granularity string) (*DocumentStats, error) {
	var docs []StatsDoc
	err := s.db.Model(&model.CanvasDocument{}).
		Select("id", "template_id", "canvas_type", "created_at", "updated_at").
		Where("owner_user_id = ?", ownerID).
		Find(&docs).Error
	if err != nil {
		return nil, err
	}
	var revs []StatsRev
	err = s.db.Raw(`
SELECT r.document_id, r.created_at
FROM canvas_revisions r
INNER JOIN canvas_documents d ON d.id = r.document_id
WHERE d.owner_user_id = ?
`, ownerID).Scan(&revs).Error
	if err != nil {
		return nil, err
	}
	out := AggregateDocumentStats(docs, revs, time.Now(), statsLocation(), rangeKey, granularity)
	return &out, nil
}
