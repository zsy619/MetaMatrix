package base

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// baseRecordLinkSQLite 是 base_record_links 的 SQLite 影子模型。
type baseRecordLinkSQLite struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
	SourceTableID  uuid.UUID `gorm:"type:uuid;not null"`
	SourceRecordID uuid.UUID `gorm:"type:uuid;not null"`
	FieldID        uuid.UUID `gorm:"type:uuid;not null"`
	TargetTableID  uuid.UUID `gorm:"type:uuid;not null"`
	TargetRecordID uuid.UUID `gorm:"type:uuid;not null"`
	SortOrder      int       `gorm:"not null;default:0"`
	CreatedAt      time.Time `gorm:"type:datetime;not null"`
}

func (baseRecordLinkSQLite) TableName() string { return "base_record_links" }

// newRelationFixture 造一个「空间 + Base + 两张表 + 一个关联记录字段」的环境。
//
//	表 A（订单）：主字段「客户」+ 关联记录字段「合同」→ 目标表 B
//	表 B（合同）：主字段「合同号」
func newRelationFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, string, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:relations?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseTableSQLite{}, &baseFieldSQLite{},
		&baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseRecordGrantSQLite{},
		&baseRecordLinkSQLite{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS base_field_formulas (id uuid primary key, table_id uuid, field_id uuid, status integer)`,
		`CREATE TABLE IF NOT EXISTS base_operation_logs (
			id uuid primary key, project_id uuid, base_id uuid, table_id uuid, record_id uuid,
			operator_id uuid, operation varchar(32), before_data json, after_data json,
			request_id varchar(64), created_at datetime)`,
		`CREATE TABLE IF NOT EXISTS base_event_outboxes (
			id uuid primary key, project_id uuid, base_id uuid, table_id uuid,
			aggregate_type varchar(32), aggregate_id uuid, event_type varchar(64),
			payload json, status varchar(16), retry_count integer,
			created_at datetime, published_at datetime)`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("prepare table failed: %v", err)
		}
	}

	userID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, userID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	baseID := uuid.New()
	tableA := uuid.New()
	tableB := uuid.New()
	if err := db.Create(&BaseTable{ID: tableA, BaseID: baseID, Name: "订单", Status: 1}).Error; err != nil {
		t.Fatalf("create table A failed: %v", err)
	}
	if err := db.Create(&BaseTable{ID: tableB, BaseID: baseID, Name: "合同", Status: 1}).Error; err != nil {
		t.Fatalf("create table B failed: %v", err)
	}
	// 表 A：主字段 + 关联记录字段（目标表 B）。
	primaryA := uuid.New()
	if err := db.Create(&BaseField{
		ID: primaryA, TableID: tableA, Name: "客户", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create primary field failed: %v", err)
	}
	linkField := uuid.New()
	if err := db.Create(&BaseField{
		ID: linkField, TableID: tableA, Name: "合同", Type: "link", Status: 1, SortOrder: 1,
		Config: datatypes.JSON([]byte(`{"targetTableId":"` + tableB.String() + `","multiple":true}`)),
	}).Error; err != nil {
		t.Fatalf("create link field failed: %v", err)
	}
	// 表 B：主字段。
	primaryB := uuid.New()
	if err := db.Create(&BaseField{
		ID: primaryB, TableID: tableB, Name: "合同号", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create table B primary failed: %v", err)
	}
	return NewService(db), userID, projectID, baseID, tableA, linkField.String(), tableB
}

// 关联记录写入后必须落关系表，并且能查出正向 / 反向关系。
func TestLinkRelationsRoundTrip(t *testing.T) {
	svc, userID, projectID, _, tableA, linkField, tableB := newRelationFixture(t)
	ctx := context.Background()

	// 表 B 建一条合同记录。
	contract, err := svc.CreateRecord(ctx, userID, projectID, tableB, RecordInput{
		Fields: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create contract failed: %v", err)
	}

	// 表 A 建一条订单，关联该合同。
	order, err := svc.CreateRecord(ctx, userID, projectID, tableA, RecordInput{
		Fields: map[string]any{linkField: []string{contract.ID.String()}},
	})
	if err != nil {
		t.Fatalf("create order failed: %v", err)
	}

	// 关系表落库。
	var links []BaseRecordLink
	if err := svc.db.Where("source_record_id = ?", order.ID).Find(&links).Error; err != nil {
		t.Fatalf("query links failed: %v", err)
	}
	if len(links) != 1 || links[0].TargetRecordID != contract.ID {
		t.Fatalf("unexpected links: %+v", links)
	}
	if links[0].TargetTableID != tableB {
		t.Fatalf("target table = %s, want %s", links[0].TargetTableID, tableB)
	}

	// 正向关系。
	out, err := svc.ListRecordRelations(ctx, userID, projectID, order.ID)
	if err != nil {
		t.Fatalf("list relations failed: %v", err)
	}
	if len(out.Outbound) != 1 || out.Outbound[0].RecordID != contract.ID.String() {
		t.Fatalf("unexpected outbound: %+v", out.Outbound)
	}
	if out.Outbound[0].FieldName != "合同" {
		t.Fatalf("outbound field name = %q", out.Outbound[0].FieldName)
	}

	// 反向关系：合同记录应看到关联它的订单。
	in, err := svc.ListRecordRelations(ctx, userID, projectID, contract.ID)
	if err != nil {
		t.Fatalf("list inbound failed: %v", err)
	}
	if len(in.Inbound) != 1 || in.Inbound[0].RecordID != order.ID.String() {
		t.Fatalf("unexpected inbound: %+v", in.Inbound)
	}
}

// 关联到不存在的记录必须被拒绝。
func TestLinkRejectsUnknownRecord(t *testing.T) {
	svc, userID, projectID, _, tableA, linkField, _ := newRelationFixture(t)
	_, err := svc.CreateRecord(context.Background(), userID, projectID, tableA, RecordInput{
		Fields: map[string]any{linkField: []string{uuid.New().String()}},
	})
	if err == nil {
		t.Fatal("expected error for unknown linked record")
	}
}

// 关联记录候选列表：按关键字过滤并给出标题。
func TestListLinkTargets(t *testing.T) {
	svc, userID, projectID, _, tableA, linkField, tableB := newRelationFixture(t)
	ctx := context.Background()
	primaryB := uuid.New()
	if err := svc.db.Create(&BaseField{
		ID: primaryB, TableID: tableB, Name: "合同号", Type: "text", Status: 1, SortOrder: 0, IsPrimary: true,
	}).Error; err != nil {
		t.Fatalf("create field failed: %v", err)
	}
	contract, err := svc.CreateRecord(ctx, userID, projectID, tableB, RecordInput{
		Fields: map[string]any{primaryB.String(): "HT-2026-001"},
	})
	if err != nil {
		t.Fatalf("create contract failed: %v", err)
	}
	if _, err := svc.CreateRecord(ctx, userID, projectID, tableA, RecordInput{
		Fields: map[string]any{linkField: []string{contract.ID.String()}},
	}); err != nil {
		t.Fatalf("create order failed: %v", err)
	}

	targets, err := svc.ListLinkTargets(ctx, userID, projectID, tableB, "HT-2026", 10)
	if err != nil {
		t.Fatalf("list link targets failed: %v", err)
	}
	if len(targets) != 1 || targets[0].Title != "HT-2026-001" {
		t.Fatalf("unexpected targets: %+v", targets)
	}
}
