package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAggregateDocumentStatsWindows(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, loc) // Saturday

	idA := uuid.New()
	idB := uuid.New()
	idC := uuid.New()
	idD := uuid.New()
	tplA := "time-matrix"
	tplB := "y-model"
	tplD := "time-matrix"

	docs := []StatsDoc{
		{
			ID: idA, TemplateID: &tplA, CanvasType: "time_matrix",
			CreatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc),
		},
		{
			ID: idB, TemplateID: &tplB, CanvasType: "y_model",
			CreatedAt: time.Date(2026, 10, 1, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 10, 28, 15, 0, 0, 0, loc),
		},
		{
			ID: idC, TemplateID: &tplB, CanvasType: "y_model",
			CreatedAt: time.Date(2026, 9, 15, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 9, 20, 11, 0, 0, 0, loc),
		},
		{
			ID: idD, TemplateID: &tplD, CanvasType: "time_matrix",
			CreatedAt: time.Date(2026, 10, 20, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 10, 20, 9, 0, 0, 0, loc),
		},
	}
	revs := []StatsRev{
		{DocumentID: idA, CreatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc)},
		{DocumentID: idB, CreatedAt: time.Date(2026, 10, 1, 9, 0, 0, 0, loc)},
		{DocumentID: idB, CreatedAt: time.Date(2026, 10, 28, 15, 0, 0, 0, loc)},
		{DocumentID: idC, CreatedAt: time.Date(2026, 9, 15, 9, 0, 0, 0, loc)},
		{DocumentID: idD, CreatedAt: time.Date(2026, 10, 20, 9, 0, 0, 0, loc)},
	}

	stats := AggregateDocumentStats(docs, revs, now, loc, "7d", "week")

	if stats.Documents.Current != 4 || stats.Documents.Previous != 1 {
		t.Fatalf("documents current/previous = %d/%d, want 4/1", stats.Documents.Current, stats.Documents.Previous)
	}
	if stats.WeekCreated.Current != 1 || stats.WeekCreated.Previous != 1 {
		t.Fatalf("week created = %d/%d, want 1/1", stats.WeekCreated.Current, stats.WeekCreated.Previous)
	}
	if stats.MonthCreated.Current != 3 || stats.MonthCreated.Previous != 1 {
		t.Fatalf("month created = %d/%d, want 3/1", stats.MonthCreated.Current, stats.MonthCreated.Previous)
	}
	if stats.WeekEdited.Current != 1 || stats.WeekEdited.Previous != 0 {
		t.Fatalf("week edited = %d/%d, want 1/0", stats.WeekEdited.Current, stats.WeekEdited.Previous)
	}
	if stats.MonthEdited.Current != 1 || stats.MonthEdited.Previous != 1 {
		t.Fatalf("month edited = %d/%d, want 1/1", stats.MonthEdited.Current, stats.MonthEdited.Previous)
	}
	if stats.RangeCreated.Current != 1 || stats.RangeEdited.Current != 1 {
		t.Fatalf("7d created/edited = %d/%d, want 1/1", stats.RangeCreated.Current, stats.RangeEdited.Current)
	}
	if stats.Revisions.Current != 2 {
		t.Fatalf("7d revisions = %d, want 2", stats.Revisions.Current)
	}
	if stats.Revisions.Previous != 1 {
		t.Fatalf("previous 7d revisions = %d, want 1", stats.Revisions.Previous)
	}
	if stats.ActiveTemplates.Current != 2 {
		t.Fatalf("active templates = %d, want 2", stats.ActiveTemplates.Current)
	}
	if stats.Totals.Revisions != 5 || stats.Totals.Templates != 2 {
		t.Fatalf("totals rev/tpl = %d/%d, want 5/2", stats.Totals.Revisions, stats.Totals.Templates)
	}
	if stats.From != "2026-10-25" || stats.To != "2026-10-31" {
		t.Fatalf("range dates %s..%s", stats.From, stats.To)
	}
	if len(stats.Series) != 2 {
		t.Fatalf("week buckets = %d, want 2", len(stats.Series))
	}
	var created, edited, revisions int
	for _, b := range stats.Series {
		created += b.Created
		edited += b.Edited
		revisions += b.Revisions
	}
	if created != 1 || edited != 1 || revisions != 2 {
		t.Fatalf("series sums c/e/r = %d/%d/%d", created, edited, revisions)
	}
	if len(stats.Heatmap) != 53*7 {
		t.Fatalf("heatmap len = %d, want %d", len(stats.Heatmap), 53*7)
	}
	if stats.Heatmap[0].Date != "2025-10-27" {
		t.Fatalf("heatmap start = %s, want 2025-10-27", stats.Heatmap[0].Date)
	}
	heat := map[string]int{}
	for _, c := range stats.Heatmap {
		heat[c.Date] = c.Count
	}
	if heat["2026-10-30"] != 1 {
		t.Fatalf("heatmap 10-30 = %d, want 1 (initial revision only)", heat["2026-10-30"])
	}
	if heat["2026-10-28"] != 1 {
		t.Fatalf("heatmap 10-28 = %d, want 1", heat["2026-10-28"])
	}
	if len(stats.Templates) != 2 || stats.Templates[0].TemplateID != "time-matrix" || stats.Templates[0].Total != 2 {
		t.Fatalf("template order = %+v", stats.Templates)
	}
	if len(stats.Templates[0].Series) != len(stats.Series) {
		t.Fatalf("template series len mismatch")
	}
}

func TestAggregateEmpty(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 3, 1, 8, 0, 0, 0, loc)
	stats := AggregateDocumentStats(nil, nil, now, loc, "bogus", "bogus")
	if stats.Range != "30d" || stats.Granularity != "day" {
		t.Fatalf("defaults = %s %s", stats.Range, stats.Granularity)
	}
	if len(stats.Series) != 30 {
		t.Fatalf("empty 30d days = %d", len(stats.Series))
	}
	if stats.Series[0].Created != 0 || stats.Documents.Current != 0 {
		t.Fatalf("empty stats not zero")
	}
	if stats.Templates == nil || stats.Heatmap == nil || stats.Recent == nil {
		t.Fatal("nil slices")
	}
	if stats.Activity.ActiveDays != 0 || stats.Activity.Streak != 0 || stats.Activity.Longest != 0 {
		t.Fatalf("empty activity = %+v", stats.Activity)
	}
}

func TestActivityStreakAndRecent(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, loc)
	idA := uuid.MustParse("00000000-0000-0000-0000-00000000000a")
	idB := uuid.MustParse("00000000-0000-0000-0000-00000000000b")
	tpl := "time-matrix"
	docs := []StatsDoc{
		{
			ID: idA, Title: "较新", TemplateID: &tpl, CanvasType: "time_matrix",
			CreatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc),
		},
		{
			ID: idB, Title: " 较早 ", TemplateID: &tpl, CanvasType: "time_matrix",
			CreatedAt: time.Date(2026, 10, 28, 9, 0, 0, 0, loc),
			UpdatedAt: time.Date(2026, 10, 29, 9, 0, 0, 0, loc),
		},
	}
	revs := []StatsRev{
		{DocumentID: idA, CreatedAt: docs[0].CreatedAt},
		{DocumentID: idB, CreatedAt: docs[1].CreatedAt},
	}
	stats := AggregateDocumentStats(docs, revs, now, loc, "7d", "day")
	if stats.Activity.ActiveDays != 3 || stats.Activity.Streak != 3 || stats.Activity.Longest != 3 {
		t.Fatalf("activity = %+v, want active 3 streak 3 longest 3", stats.Activity)
	}
	if len(stats.Recent) != 2 || stats.Recent[0].ID != idA.String() || stats.Recent[0].Title != "较新" {
		t.Fatalf("recent = %+v", stats.Recent)
	}
	if stats.Recent[1].Title != "较早" {
		t.Fatalf("title trim = %q", stats.Recent[1].Title)
	}
}

func TestEditThresholdAndShanghaiDay(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 11, 1, 10, 0, 0, 0, loc)
	base := time.Date(2026, 11, 1, 9, 0, 0, 0, loc)
	utcNight := time.Date(2026, 10, 31, 16, 30, 0, 0, time.UTC) // 2026-11-01 00:30 CST
	docs := []StatsDoc{
		{ID: uuid.New(), CreatedAt: base, UpdatedAt: base.Add(59 * time.Second)},
		{ID: uuid.New(), CreatedAt: base, UpdatedAt: base.Add(time.Minute), CanvasType: "time_matrix"},
		{ID: uuid.New(), CreatedAt: utcNight, UpdatedAt: utcNight, CanvasType: "time_matrix"},
	}
	stats := AggregateDocumentStats(docs, nil, now, loc, "7d", "day")
	if stats.RangeEdited.Current != 1 {
		t.Fatalf("substantive edits = %d, want 1", stats.RangeEdited.Current)
	}
	if stats.RangeCreated.Current != 3 {
		t.Fatalf("created = %d, want 3 (utc instant belongs to Nov 1)", stats.RangeCreated.Current)
	}
	heat := map[string]int{}
	for _, c := range stats.Heatmap {
		heat[c.Date] = c.Count
	}
	if heat["2026-11-01"] == 0 {
		t.Fatal("shanghai day bucket missing utc night create")
	}
}

func TestMonthAndWeekBoundaries(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)

	march := time.Date(2026, 3, 31, 12, 0, 0, 0, loc)
	docs := []StatsDoc{
		{ID: uuid.New(), CreatedAt: time.Date(2026, 2, 28, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 2, 28, 9, 0, 0, 0, loc)},
		{ID: uuid.New(), CreatedAt: time.Date(2026, 1, 30, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 1, 30, 9, 0, 0, 0, loc)},
	}
	stats := AggregateDocumentStats(docs, nil, march, loc, "30d", "day")
	if stats.MonthCreated.Previous != 1 {
		t.Fatalf("march 31 previous month created = %d, want 1 (all of february)", stats.MonthCreated.Previous)
	}

	leap := time.Date(2024, 2, 29, 8, 0, 0, 0, loc)
	leapDocs := []StatsDoc{
		{ID: uuid.New(), CreatedAt: time.Date(2024, 1, 29, 8, 0, 0, 0, loc), UpdatedAt: time.Date(2024, 1, 29, 8, 0, 0, 0, loc)},
		{ID: uuid.New(), CreatedAt: time.Date(2024, 1, 30, 8, 0, 0, 0, loc), UpdatedAt: time.Date(2024, 1, 30, 8, 0, 0, 0, loc)},
	}
	leapStats := AggregateDocumentStats(leapDocs, nil, leap, loc, "7d", "day")
	if leapStats.MonthCreated.Previous != 1 {
		t.Fatalf("feb 29 previous month created = %d, want 1 (jan 29 only)", leapStats.MonthCreated.Previous)
	}

	sunday := time.Date(2026, 11, 1, 12, 0, 0, 0, loc)
	weekDocs := []StatsDoc{
		{ID: uuid.New(), CreatedAt: time.Date(2026, 10, 26, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 10, 26, 9, 0, 0, 0, loc)},
		{ID: uuid.New(), CreatedAt: time.Date(2026, 11, 1, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 11, 1, 9, 0, 0, 0, loc)},
		{ID: uuid.New(), CreatedAt: time.Date(2026, 10, 25, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 10, 25, 9, 0, 0, 0, loc)},
	}
	week := AggregateDocumentStats(weekDocs, nil, sunday, loc, "7d", "week")
	if week.WeekCreated.Current != 2 || week.WeekCreated.Previous != 1 {
		t.Fatalf("sunday week created = %d/%d, want 2/1", week.WeekCreated.Current, week.WeekCreated.Previous)
	}
}

func TestTemplateFallbackSortAndYearBuckets(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 1, 1, 8, 0, 0, 0, loc)
	empty := ""
	custom := "custom"
	docs := []StatsDoc{
		{ID: uuid.New(), TemplateID: &empty, CanvasType: "", CreatedAt: now, UpdatedAt: now},
		{ID: uuid.New(), TemplateID: nil, CanvasType: "custom", CreatedAt: now, UpdatedAt: now},
		{ID: uuid.New(), TemplateID: &custom, CanvasType: "custom", CreatedAt: now, UpdatedAt: now.Add(time.Minute)},
	}
	stats := AggregateDocumentStats(docs, nil, now, loc, "year", "month")
	if stats.Range != "year" || len(stats.Series) != 1 || stats.From != "2026-01-01" || stats.PreviousFrom != "2025-01-01" {
		t.Fatalf("year window %+v series %d", stats.From, len(stats.Series))
	}
	if stats.Templates[0].TemplateID != "custom" || stats.Templates[0].Total != 2 {
		t.Fatalf("template group = %+v", stats.Templates)
	}
	foundUnknown := false
	for _, tplt := range stats.Templates {
		if tplt.TemplateID == "unknown" && tplt.Total == 1 {
			foundUnknown = true
		}
		if tplt.TemplateID == "custom" && len(tplt.Series) == 1 && tplt.Series[0] != 2 {
			t.Fatalf("same bucket should count each canvas once, series=%v", tplt.Series)
		}
	}
	if !foundUnknown {
		t.Fatalf("missing unknown bucket: %+v", stats.Templates)
	}
	if stats.ActiveTemplates.Current != 2 {
		t.Fatalf("active templates = %d", stats.ActiveTemplates.Current)
	}
}

func TestResolveStatsOwnerIgnoresScope(t *testing.T) {
	me := uuid.New()
	other := uuid.New()
	if got := ResolveStatsOwner(me, "all"); got != me {
		t.Fatalf("scope all = %s", got)
	}
	if got := ResolveStatsOwner(me, other.String()); got != me {
		t.Fatalf("scope other = %s", got)
	}
	if got := ResolveStatsOwner(me, ""); got != me {
		t.Fatalf("scope empty = %s", got)
	}
}

func TestNilLocationDefaults(t *testing.T) {
	now := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	stats := AggregateDocumentStats(nil, nil, now, nil, "90d", "week")
	if stats.Timezone != "Asia/Shanghai" || stats.Granularity != "week" || stats.Range != "90d" {
		t.Fatalf("defaults %+v %s", stats.Range, stats.Granularity)
	}
	if len(stats.Series) < 13 || len(stats.Series) > 15 {
		t.Fatalf("90d weeks = %d", len(stats.Series))
	}
}
