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
	if stats.Scope != "me" || stats.UserID != "" {
		t.Fatalf("scope/user = %s %s", stats.Scope, stats.UserID)
	}
	if stats.Activity.ActiveDays != 2 || stats.Activity.ActiveDaysPrev != 1 {
		t.Fatalf("active days = %d/%d, want 2/1", stats.Activity.ActiveDays, stats.Activity.ActiveDaysPrev)
	}
	if stats.Activity.Streak != 1 || stats.Activity.LongestStreak != 1 {
		t.Fatalf("streak/longest = %d/%d, want 1/1", stats.Activity.Streak, stats.Activity.LongestStreak)
	}
	if len(stats.CanvasTypes) != 2 || stats.CanvasTypes[0].CanvasType != "time_matrix" || stats.CanvasTypes[0].Total != 2 {
		t.Fatalf("canvas types = %+v", stats.CanvasTypes)
	}
	if stats.CanvasTypes[0].Created != 1 || stats.CanvasTypes[0].Edited != 0 {
		t.Fatalf("time_matrix range created/edited = %d/%d", stats.CanvasTypes[0].Created, stats.CanvasTypes[0].Edited)
	}
	if stats.CanvasTypes[1].CanvasType != "y_model" || stats.CanvasTypes[1].Edited != 1 {
		t.Fatalf("y_model = %+v", stats.CanvasTypes[1])
	}
	if len(stats.Recent) != 4 || stats.Recent[0].ID != idA || stats.Recent[0].TemplateID != "time-matrix" {
		t.Fatalf("recent = %+v", stats.Recent)
	}
}

func TestActivityStreakIncludesToday(t *testing.T) {
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 11, 1, 18, 0, 0, 0, loc)
	mk := func(month time.Month, day, hour int) time.Time {
		return time.Date(2026, month, day, hour, 0, 0, 0, loc)
	}
	var docs []StatsDoc
	var revs []StatsRev
	for _, day := range []int{20, 28, 29, 30, 31} {
		id := uuid.New()
		created := mk(time.October, day, 9)
		title := "矩阵"
		docs = append(docs, StatsDoc{
			ID: id, Title: title, CanvasType: "time_matrix",
			CreatedAt: created, UpdatedAt: created,
		})
		revs = append(revs, StatsRev{DocumentID: id, CreatedAt: created})
	}
	idToday := uuid.New()
	tpl := "y-model"
	docs = append(docs, StatsDoc{
		ID: idToday, Title: "今天改过", TemplateID: &tpl, CanvasType: "y_model",
		CreatedAt: mk(time.October, 1, 9),
		UpdatedAt: mk(time.November, 1, 10),
	})
	revs = append(revs, StatsRev{DocumentID: idToday, CreatedAt: mk(time.November, 1, 10)})

	stats := AggregateDocumentStats(docs, revs, now, loc, "30d", "day")
	if stats.Activity.Streak != 5 {
		t.Fatalf("streak = %d, want 5 (Oct 28–Nov 1)", stats.Activity.Streak)
	}
	if stats.Activity.LongestStreak != 5 {
		t.Fatalf("longest = %d, want 5", stats.Activity.LongestStreak)
	}
	if stats.Activity.ActiveDays != 6 {
		t.Fatalf("active days = %d, want 6", stats.Activity.ActiveDays)
	}
	if len(stats.Recent) != 6 || stats.Recent[0].ID != idToday || stats.Recent[0].Title != "今天改过" {
		t.Fatalf("recent head = %+v", stats.Recent)
	}
	if stats.CanvasTypes[0].CanvasType != "time_matrix" || stats.CanvasTypes[0].Total != 5 {
		t.Fatalf("types = %+v", stats.CanvasTypes)
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
	if stats.Templates == nil || stats.Heatmap == nil || stats.CanvasTypes == nil || stats.Recent == nil {
		t.Fatal("nil slices")
	}
	if stats.Activity.Streak != 0 || stats.Activity.ActiveDays != 0 || stats.Scope != "me" {
		t.Fatalf("empty activity = %+v scope %s", stats.Activity, stats.Scope)
	}
}
