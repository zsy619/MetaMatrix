package service

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 测试表只保留统计 SQL 实际读取的字段，避免迁移文档内容等无关大字段。
// 表名与生产模型一致，因此 DocumentsService 的 Model 和 Raw SQL 都走真实 SQLite 语法。
type statsSQLDocument struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	OwnerUserID uuid.UUID `gorm:"type:uuid;not null"`
	Title       string
	TemplateID  *string
	CanvasType  string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt
}

func (statsSQLDocument) TableName() string { return "kb_documents" }

type statsSQLRevision struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	DocumentID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorUserID *uuid.UUID
	CreatedAt    time.Time
}

func (statsSQLRevision) TableName() string { return "kb_revisions" }

func TestStatsSQLMatchesAggregateDocumentStats(t *testing.T) {
	db := newStatsSQLTestDB(t)
	service := NewDocumentsService(db)
	owner := statsTestUUID(1)
	other := statsTestUUID(2)
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, loc)
	tplA, tplB := "time-matrix", "y-model"

	docs := []StatsDoc{
		{ID: statsTestUUID(101), Title: "历史", TemplateID: &tplA, CanvasType: "time_matrix",
			CreatedAt: time.Date(2024, 1, 2, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2024, 1, 2, 9, 0, 0, 0, loc)},
		{ID: statsTestUUID(102), Title: "九月", TemplateID: &tplB, CanvasType: "y_model",
			CreatedAt: time.Date(2026, 9, 15, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 9, 20, 11, 0, 0, 0, loc)},
		{ID: statsTestUUID(103), Title: "上周", TemplateID: &tplB, CanvasType: "y_model",
			CreatedAt: time.Date(2026, 10, 1, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 10, 28, 15, 0, 0, 0, loc)},
		{ID: statsTestUUID(104), Title: "本周", TemplateID: &tplA, CanvasType: "time_matrix",
			CreatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 10, 30, 9, 0, 0, 0, loc)},
		{ID: statsTestUUID(105), Title: "  上海跨日  ", CanvasType: "custom",
			CreatedAt: time.Date(2026, 10, 31, 16, 30, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 10, 31, 16, 32, 0, 0, time.UTC)},
		{ID: statsTestUUID(106), Title: "无修订", CanvasType: "custom",
			CreatedAt: time.Date(2025, 1, 5, 9, 0, 0, 0, loc), UpdatedAt: time.Date(2025, 1, 5, 9, 0, 0, 0, loc)},
	}
	for _, doc := range docs {
		createStatsSQLDoc(t, db, owner, doc)
	}

	// 归档文档与他人的文档即使拥有更新的时间，也不能进入任何统计或最近编辑。
	archived := StatsDoc{ID: statsTestUUID(190), Title: "归档", CanvasType: "custom",
		CreatedAt: now.Add(-time.Hour), UpdatedAt: now}
	createStatsSQLDoc(t, db, owner, archived)
	if err := db.Model(&statsSQLDocument{}).Where("id = ?", archived.ID).
		Update("deleted_at", now).Error; err != nil {
		t.Fatalf("archive document: %v", err)
	}
	otherDoc := StatsDoc{ID: statsTestUUID(191), Title: "他人", CanvasType: "custom",
		CreatedAt: now.Add(-time.Hour), UpdatedAt: now}
	createStatsSQLDoc(t, db, other, otherDoc)

	revs := []StatsRev{
		// 多年前的连续三天用于验证范围外按日聚合仍能保留 Longest。
		{DocumentID: docs[0].ID, CreatedAt: time.Date(2024, 1, 1, 9, 0, 0, 0, loc)},
		{DocumentID: docs[0].ID, CreatedAt: time.Date(2024, 1, 1, 11, 0, 0, 0, loc)},
		{DocumentID: docs[0].ID, CreatedAt: time.Date(2024, 1, 2, 9, 0, 0, 0, loc)},
		{DocumentID: docs[0].ID, CreatedAt: time.Date(2024, 1, 3, 9, 0, 0, 0, loc)},
		{DocumentID: docs[1].ID, CreatedAt: docs[1].UpdatedAt},
		{DocumentID: docs[2].ID, CreatedAt: docs[2].CreatedAt},
		{DocumentID: docs[2].ID, CreatedAt: docs[2].UpdatedAt},
		{DocumentID: docs[3].ID, CreatedAt: docs[3].CreatedAt},
		// 热图覆盖本周剩余日期；更远的未来修订只进入总数，不进入当前窗口或最长活跃。
		{DocumentID: docs[3].ID, CreatedAt: time.Date(2026, 11, 7, 9, 0, 0, 0, loc)},
		{DocumentID: docs[3].ID, CreatedAt: time.Date(2026, 12, 1, 9, 0, 0, 0, loc)},
	}
	revisionNumber := 1000
	addRevision := func(docID uuid.UUID, createdAt time.Time, author *uuid.UUID) {
		revisionNumber++
		row := statsSQLRevision{ID: statsTestUUID(revisionNumber), DocumentID: docID, AuthorUserID: author, CreatedAt: createdAt}
		if err := db.Create(&row).Error; err != nil {
			t.Fatalf("create revision: %v", err)
		}
	}
	for _, rev := range revs {
		addRevision(rev.DocumentID, rev.CreatedAt, &owner)
	}
	// NULL 作者兼容历史快照；上海 11 月 1 日 00:30 对应 UTC 10 月 31 日 16:30。
	nullAuthorRev := StatsRev{DocumentID: docs[4].ID, CreatedAt: docs[4].UpdatedAt}
	revs = append(revs, nullAuthorRev)
	addRevision(nullAuthorRev.DocumentID, nullAuthorRev.CreatedAt, nil)

	// 下列三行不应出现在用于对照的旧聚合输入中。
	addRevision(archived.ID, now.Add(-time.Minute), &owner)
	addRevision(otherDoc.ID, now.Add(-time.Minute), &other)
	addRevision(docs[3].ID, now.Add(-time.Minute), &other)

	for _, tc := range []struct {
		rangeKey    string
		granularity string
	}{
		{rangeKey: "7d", granularity: "day"},
		{rangeKey: "30d", granularity: "week"},
		{rangeKey: "90d", granularity: "day"},
		{rangeKey: "year", granularity: "month"},
	} {
		t.Run(tc.rangeKey+"/"+tc.granularity, func(t *testing.T) {
			got, err := service.statsAtTime(owner, tc.rangeKey, tc.granularity, now)
			if err != nil {
				t.Fatalf("statsAtTime: %v", err)
			}
			want := AggregateDocumentStats(docs, revs, now, loc, tc.rangeKey, tc.granularity)
			if !reflect.DeepEqual(*got, want) {
				t.Fatalf("SQL stats differ from in-memory aggregation\ngot:  %#v\nwant: %#v", *got, want)
			}
			if got.Activity.Longest != 3 {
				t.Fatalf("historical longest streak = %d, want 3", got.Activity.Longest)
			}
		})
	}
}

func TestStatsSQLRevisionWindowIsBounded(t *testing.T) {
	db := newStatsSQLTestDB(t)
	service := NewDocumentsService(db)
	owner := statsTestUUID(10)
	loc := time.FixedZone("Asia/Shanghai", 8*3600)
	doc := StatsDoc{ID: statsTestUUID(200), CanvasType: "custom",
		CreatedAt: time.Date(2020, 1, 1, 0, 0, 0, 0, loc), UpdatedAt: time.Date(2026, 11, 1, 0, 0, 0, 0, loc)}
	createStatsSQLDoc(t, db, owner, doc)
	from := time.Date(2026, 11, 1, 0, 0, 0, 0, loc)
	to := from.AddDate(0, 0, 7)

	// 同一天写入 40 条旧修订，范围外数据后来应由 SQL 聚合成一天，而不是 40 条 StatsRev。
	for i := 0; i < 40; i++ {
		createStatsSQLRevision(t, db, statsTestUUID(2000+i), doc.ID, &owner, time.Date(2020, 1, 1, 1, i, 0, 0, loc))
	}
	createStatsSQLRevision(t, db, statsTestUUID(2101), doc.ID, &owner, from.Add(-time.Nanosecond))
	createStatsSQLRevision(t, db, statsTestUUID(2102), doc.ID, &owner, from)
	createStatsSQLRevision(t, db, statsTestUUID(2103), doc.ID, &owner, to.Add(-time.Nanosecond))
	createStatsSQLRevision(t, db, statsTestUUID(2104), doc.ID, &owner, to)

	revs, err := service.loadStatsRevisions(owner, from, to)
	if err != nil {
		t.Fatalf("loadStatsRevisions: %v", err)
	}
	if len(revs) != 2 {
		t.Fatalf("bounded revisions = %d, want 2; revisions: %#v", len(revs), revs)
	}
	for _, rev := range revs {
		if !inWindow(rev.CreatedAt, from, to) {
			t.Fatalf("revision escaped half-open window: %s", rev.CreatedAt)
		}
	}
	if !strings.Contains(statsRevisionQuery, "r.created_at >= ? AND r.created_at < ?") {
		t.Fatal("production revision query must carry both time bounds")
	}

	// 原始窗口外按文档和日期聚合，40 条历史修订只能形成一行，且计数不能丢失。
	dayQuery, err := statsRevisionDayQuery(db.Dialector.Name())
	if err != nil {
		t.Fatal(err)
	}
	var days []statsRevisionDay
	if err := db.Raw(dayQuery, owner, owner, from, to).Scan(&days).Error; err != nil {
		t.Fatalf("aggregate old revisions: %v", err)
	}
	if len(days) != 3 { // 40 条旧修订合并为一天，from 前一条和 to 上一条各占一天。
		t.Fatalf("aggregated days = %d, want 3: %#v", len(days), days)
	}
	var total int
	for _, day := range days {
		total += day.Count
	}
	if total != 42 {
		t.Fatalf("aggregated revision count = %d, want 42", total)
	}
}

func TestStatsSQLRecentUsesIndependentLimit(t *testing.T) {
	db := newStatsSQLTestDB(t)
	service := NewDocumentsService(db)
	owner := statsTestUUID(20)
	other := statsTestUUID(21)
	base := time.Date(2026, 11, 1, 8, 0, 0, 0, time.UTC)
	for i := 0; i < 12; i++ {
		doc := StatsDoc{ID: statsTestUUID(300 + i), Title: fmt.Sprintf("文档 %02d", i), CanvasType: "custom",
			CreatedAt: base, UpdatedAt: base.Add(time.Duration(i+1) * time.Minute)}
		createStatsSQLDoc(t, db, owner, doc)
	}
	archived := StatsDoc{ID: statsTestUUID(390), Title: "归档", CreatedAt: base, UpdatedAt: base.Add(time.Hour)}
	createStatsSQLDoc(t, db, owner, archived)
	if err := db.Model(&statsSQLDocument{}).Where("id = ?", archived.ID).Update("deleted_at", base).Error; err != nil {
		t.Fatal(err)
	}
	createStatsSQLDoc(t, db, other, StatsDoc{ID: statsTestUUID(391), Title: "他人", CreatedAt: base, UpdatedAt: base.Add(time.Hour)})

	var recentSQL string
	if err := db.Callback().Query().After("gorm:query").Register("stats_test:capture_recent_limit", func(tx *gorm.DB) {
		sql := tx.Statement.SQL.String()
		if strings.Contains(sql, "updated_at DESC") {
			recentSQL = sql
		}
	}); err != nil {
		t.Fatal(err)
	}
	recent, err := service.loadRecentStatsDocs(owner, statsRecentLimit)
	if err != nil {
		t.Fatalf("loadRecentStatsDocs: %v", err)
	}
	if len(recent) != statsRecentLimit {
		t.Fatalf("recent rows = %d, want %d", len(recent), statsRecentLimit)
	}
	if recent[0].ID != statsTestUUID(311) || recent[7].ID != statsTestUUID(304) {
		t.Fatalf("recent order/limit = %#v", recent)
	}
	if !strings.Contains(recentSQL, "LIMIT 8") {
		t.Fatalf("recent query did not apply SQL LIMIT: %q", recentSQL)
	}
}

func TestStatsSQLEmptyMatchesAggregate(t *testing.T) {
	db := newStatsSQLTestDB(t)
	service := NewDocumentsService(db)
	now := time.Date(2026, 6, 15, 8, 0, 0, 0, time.UTC)
	got, err := service.statsAtTime(statsTestUUID(999), "invalid", "invalid", now)
	if err != nil {
		t.Fatalf("empty stats: %v", err)
	}
	want := AggregateDocumentStats(nil, nil, now, statsLocation(), "invalid", "invalid")
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("empty SQL stats differ\ngot:  %#v\nwant: %#v", *got, want)
	}
}

func newStatsSQLTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&statsSQLDocument{}, &statsSQLRevision{}); err != nil {
		t.Fatalf("migrate stats tables: %v", err)
	}
	return db
}

func createStatsSQLDoc(t *testing.T, db *gorm.DB, owner uuid.UUID, doc StatsDoc) {
	t.Helper()
	row := statsSQLDocument{
		ID: doc.ID, OwnerUserID: owner, Title: doc.Title, TemplateID: doc.TemplateID,
		CanvasType: doc.CanvasType, CreatedAt: doc.CreatedAt, UpdatedAt: doc.UpdatedAt,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create document: %v", err)
	}
}

func createStatsSQLRevision(t *testing.T, db *gorm.DB, id, documentID uuid.UUID, author *uuid.UUID, createdAt time.Time) {
	t.Helper()
	row := statsSQLRevision{ID: id, DocumentID: documentID, AuthorUserID: author, CreatedAt: createdAt}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create revision: %v", err)
	}
}

func statsTestUUID(n int) uuid.UUID {
	return uuid.MustParse(fmt.Sprintf("00000000-0000-0000-0000-%012x", n))
}
