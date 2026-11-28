package base

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// newRecordSortFixture 造一个「项目 + 表 + 一个数值字段」的最小环境。
func newRecordSortFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:recordsort?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(&baseTableSQLite{}, &baseFieldSQLite{}, &baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseRecordLinkSQLite{}, &baseRecordReverseLinkSQLite{}, &baseRecordGrantSQLite{}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`).Error; err != nil {
		t.Fatalf("create core_projects failed: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS base_field_formulas (id uuid primary key, table_id uuid, field_id uuid, status integer)`).Error; err != nil {
		t.Fatalf("create base_field_formulas failed: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS base_operation_logs (
		id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
		operator_id uuid, operation varchar(32), before_data json, after_data json,
		request_id varchar(64), created_at datetime)`).Error; err != nil {
		t.Fatalf("create base_operation_logs failed: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS base_event_outboxes (
		id uuid primary key, tenant_id uuid, project_id uuid, base_id uuid, table_id uuid,
		aggregate_type varchar(32), aggregate_id uuid, event_type varchar(64),
		payload json, status varchar(16), retry_count integer,
		created_at datetime, published_at datetime)`).Error; err != nil {
		t.Fatalf("create base_event_outboxes failed: %v", err)
	}
	userID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, userID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "排序表", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	fieldID := uuid.New()
	if err := db.Create(&BaseField{
		ID: fieldID, TableID: tableID, Name: "金额", Type: "number", Status: 1, SortOrder: 0,
	}).Error; err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	return NewService(db), userID, projectID, tableID, fieldID.String()
}

// 查询结果必须按记录的手动排序位（sort_order）返回。
//
// 回归背景：之前 ORDER BY 用 clause.Expr 传给 GORM，会被静默丢弃，
// 导致「用户排序 / 分组排序 / 手动排序」全部不生效（记录恒按库表物理顺序返回）。
func TestQueryRespectsRecordSortOrder(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	var ids []uuid.UUID
	for i := 0; i < 3; i++ {
		row, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
			Fields: map[string]any{fieldID: 100 + i},
		})
		if err != nil {
			t.Fatalf("create record failed: %v", err)
		}
		ids = append(ids, row.ID)
	}

	// 手工打乱 sort_order：第三条排到最前。
	if err := svc.db.Model(&BaseRecord{}).Where("id = ?", ids[2]).Update("sort_order", -1).Error; err != nil {
		t.Fatalf("update sort_order failed: %v", err)
	}

	res, err := svc.Query(ctx, userID, projectID, QueryRequest{TableID: tableID.String(), PageSize: 10})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if len(res.Records) != 3 {
		t.Fatalf("expected 3 records, got %d", len(res.Records))
	}
	want := []uuid.UUID{ids[2], ids[0], ids[1]}
	for i, row := range res.Records {
		if row.ID != want[i] {
			t.Fatalf("record %d = %s, want %s", i, row.ID, want[i])
		}
	}
}

// 用户排序（sorts）必须真正落到 SQL 上——这是同一个 GORM Order 用法的回归。
func TestQueryRespectsUserSort(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	values := []float64{30, 10, 20}
	for _, v := range values {
		if _, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
			Fields: map[string]any{fieldID: v},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}

	res, err := svc.Query(ctx, userID, projectID, QueryRequest{
		TableID:  tableID.String(),
		PageSize: 10,
		Sorts:    []SortRule{{FieldID: fieldID, Order: "asc"}},
	})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	got := []float64{}
	for _, row := range res.Records {
		if v, ok := row.Fields[fieldID].(float64); ok {
			got = append(got, v)
		}
	}
	if len(got) != 3 || got[0] != 10 || got[1] != 20 || got[2] != 30 {
		t.Fatalf("sorted values = %v, want [10 20 30]", got)
	}
}

// 手动重排记录后，顺序应落库并被查询读到。
func TestReorderRecordsPersistsOrder(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	var ids []uuid.UUID
	for i := 0; i < 3; i++ {
		row, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
			Fields: map[string]any{fieldID: 100 + i},
		})
		if err != nil {
			t.Fatalf("create record failed: %v", err)
		}
		ids = append(ids, row.ID)
	}

	target := []uuid.UUID{ids[2], ids[0], ids[1]}
	if err := svc.ReorderRecords(ctx, userID, projectID, tableID, target); err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	var got []uuid.UUID
	if err := svc.db.Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", tableID).
		Order("sort_order ASC").Pluck("id", &got).Error; err != nil {
		t.Fatalf("pluck failed: %v", err)
	}
	if len(got) != 3 || got[0] != target[0] || got[1] != target[1] || got[2] != target[2] {
		t.Fatalf("stored order = %v, want %v", got, target)
	}
}

// 保持 datatypes 引用，避免影子模型被裁剪。
var _ = datatypes.JSON{}

// 自定义排序 + keyset 翻页：逐页取回全部记录，且不重复、不遗漏。
func TestQuerySortKeysetPaging(t *testing.T) {
	svc, userID, projectID, tableID, fieldID := newRecordSortFixture(t)
	ctx := context.Background()

	values := []float64{50, 10, 40, 20, 30}
	for _, v := range values {
		if _, err := svc.CreateRecord(ctx, userID, projectID, tableID, RecordInput{
			Fields: map[string]any{fieldID: v},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}

	seen := []float64{}
	cursor := ""
	for page := 0; page < 10; page++ {
		res, err := svc.Query(ctx, userID, projectID, QueryRequest{
			TableID:  tableID.String(),
			PageSize: 2,
			Sorts:    []SortRule{{FieldID: fieldID, Order: "asc"}},
			Cursor:   cursor,
		})
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		for _, row := range res.Records {
			if v, ok := row.Fields[fieldID].(float64); ok {
				seen = append(seen, v)
			}
		}
		if !res.Page.HasMore {
			break
		}
		cursor = res.Page.NextCursor
	}
	want := []float64{10, 20, 30, 40, 50}
	if len(seen) != len(want) {
		t.Fatalf("paged values = %v, want %v", seen, want)
	}
	for i := range want {
		if seen[i] != want[i] {
			t.Fatalf("paged values = %v, want %v", seen, want)
		}
	}
}
