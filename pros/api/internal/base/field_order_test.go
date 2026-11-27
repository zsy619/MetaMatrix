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

// baseTableSQLite / baseFieldSQLite 是 SQLite 影子模型：
// 字段与 model.BaseTable / model.BaseField 保持一致，只把时间列改成 datetime，
// 否则 SQLite 会按字符串存 timestamptz，扫回 time.Time 直接失败。
type baseTableSQLite struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey"`
	BaseID         uuid.UUID      `gorm:"type:uuid;not null"`
	Name           string         `gorm:"type:varchar(128);not null;default:''"`
	Description    string         `gorm:"type:text;not null;default:''"`
	PrimaryFieldID *uuid.UUID     `gorm:"type:uuid"`
	SortOrder      int            `gorm:"not null;default:0"`
	SchemaVersion  int64          `gorm:"not null;default:1"`
	Settings       datatypes.JSON `gorm:"type:json;not null;default:'{}'"`
	Status         int            `gorm:"not null;default:1"`
	CreatedAt      time.Time      `gorm:"type:datetime;not null"`
	UpdatedAt      time.Time      `gorm:"type:datetime;not null"`
	DeletedAt      gorm.DeletedAt `gorm:"index"`
}

func (baseTableSQLite) TableName() string { return "base_tables" }

type baseFieldSQLite struct {
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey"`
	TableID    uuid.UUID      `gorm:"type:uuid;not null"`
	Name       string         `gorm:"type:varchar(128);not null;default:''"`
	Type       string         `gorm:"type:varchar(48);not null;default:'text'"`
	Config     datatypes.JSON `gorm:"type:json;not null;default:'{}'"`
	Required   bool           `gorm:"not null;default:false"`
	UniqueFlag bool           `gorm:"not null;default:false"`
	IsPrimary  bool           `gorm:"not null;default:false"`
	IsSystem   bool           `gorm:"not null;default:false"`
	SortOrder  int            `gorm:"not null;default:0"`
	Version    int64          `gorm:"not null;default:1"`
	Status     int            `gorm:"not null;default:1"`
	CreatedAt  time.Time      `gorm:"type:datetime;not null"`
	UpdatedAt  time.Time      `gorm:"type:datetime;not null"`
}

func (baseFieldSQLite) TableName() string { return "base_fields" }

// newFieldOrderFixture 造一个「项目 + 表 + 三个字段」的最小环境。
func newFieldOrderFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:fieldorder?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(&baseTableSQLite{}, &baseFieldSQLite{}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`).Error; err != nil {
		t.Fatalf("create core_projects failed: %v", err)
	}
	userID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, userID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	tableID := uuid.New()
	if err := db.Create(&BaseTable{ID: tableID, BaseID: uuid.New(), Name: "表1", Status: 1}).Error; err != nil {
		t.Fatalf("create table failed: %v", err)
	}
	for i, name := range []string{"字段A", "字段B", "字段C"} {
		if err := db.Create(&BaseField{
			ID: uuid.New(), TableID: tableID, Name: name, Type: "text", Status: 1, SortOrder: i,
		}).Error; err != nil {
			t.Fatalf("create field failed: %v", err)
		}
	}
	return NewService(db), userID, projectID, tableID
}

// 只传 required 时不应把字段名清空（部分更新的根因回归测试）。
func TestUpdateFieldPartialKeepsName(t *testing.T) {
	svc, userID, projectID, tableID := newFieldOrderFixture(t)
	fields, err := svc.ListFields(context.Background(), userID, projectID, tableID)
	if err != nil {
		t.Fatalf("list fields failed: %v", err)
	}
	if len(fields) != 3 {
		t.Fatalf("expected 3 fields, got %d", len(fields))
	}
	required := true
	meta, err := svc.UpdateField(context.Background(), userID, projectID, uuid.MustParse(fields[0].ID), FieldUpdateInput{
		Required: &required,
	})
	if err != nil {
		t.Fatalf("update field failed: %v", err)
	}
	if meta.Name != "字段A" {
		t.Fatalf("name should be kept, got %q", meta.Name)
	}
	if !meta.Required {
		t.Fatal("required should be true")
	}
}

// 重排：顺序以服务端返回的 sort_order 为准，且必须传全部字段。
func TestReorderFields(t *testing.T) {
	svc, userID, projectID, tableID := newFieldOrderFixture(t)
	fields, err := svc.ListFields(context.Background(), userID, projectID, tableID)
	if err != nil {
		t.Fatalf("list fields failed: %v", err)
	}
	ids := []string{fields[2].ID, fields[0].ID, fields[1].ID}
	uuidIDs := []uuid.UUID{uuid.MustParse(ids[0]), uuid.MustParse(ids[1]), uuid.MustParse(ids[2])}
	metas, err := svc.ReorderFields(context.Background(), userID, projectID, tableID, uuidIDs)
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}
	if metas[0].ID != ids[0] || metas[1].ID != ids[1] || metas[2].ID != ids[2] {
		t.Fatalf("unexpected order: %+v", metas)
	}
	for i, meta := range metas {
		if meta.SortOrder != i {
			t.Fatalf("field %d sortOrder = %d, want %d", i, meta.SortOrder, i)
		}
	}
	// 缺项必须报错，避免出现同序字段导致排序不稳定。
	if _, err := svc.ReorderFields(context.Background(), userID, projectID, tableID, uuidIDs[:2]); err == nil {
		t.Fatal("expected mismatch error")
	}
}
