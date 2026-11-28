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

// baseAppSQLite 是 base_apps 的 SQLite 影子模型（时间列改 datetime）。
type baseAppSQLite struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey"`
	TenantID      uuid.UUID      `gorm:"type:uuid;not null;default:'00000000-0000-0000-0000-000000000000'"`
	ProjectID     uuid.UUID      `gorm:"type:uuid;not null"`
	NodeID        *uuid.UUID     `gorm:"type:uuid;uniqueIndex"`
	Name          string         `gorm:"type:varchar(128);not null;default:''"`
	Description   string         `gorm:"type:text;not null;default:''"`
	Icon          string         `gorm:"type:varchar(64);not null;default:''"`
	OwnerID       uuid.UUID      `gorm:"type:uuid;not null"`
	SchemaVersion int64          `gorm:"not null;default:1"`
	Migrated      string         `gorm:"type:varchar(64);not null;default:''"`
	Status        int            `gorm:"not null;default:1"`
	Settings      datatypes.JSON `gorm:"type:json;not null;default:'{}'"`
	CreatedAt     time.Time      `gorm:"type:datetime;not null"`
	UpdatedAt     time.Time      `gorm:"type:datetime;not null"`
	DeletedAt     gorm.DeletedAt `gorm:"index"`
}

func (baseAppSQLite) TableName() string { return "base_apps" }

// newBaseMetaFixture 造一个空间 + 管理员。
func newBaseMetaFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:basemeta?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(
		&baseAppSQLite{}, &baseTableSQLite{}, &baseFieldSQLite{},
		&baseRecordSQLite{}, &baseRecordValueSQLite{}, &baseViewSQLite{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS core_projects (id uuid primary key, owner_user_id uuid)`,
		`CREATE TABLE IF NOT EXISTS kb_members (id uuid primary key, project_id uuid, user_id uuid, role varchar(16))`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("prepare table failed: %v", err)
		}
	}
	adminID := uuid.New()
	projectID := uuid.New()
	if err := db.Exec(`INSERT INTO core_projects (id, owner_user_id) VALUES (?, ?)`, projectID, adminID).Error; err != nil {
		t.Fatalf("insert project failed: %v", err)
	}
	if err := db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, adminID, RoleAdmin).Error; err != nil {
		t.Fatalf("insert admin failed: %v", err)
	}
	return NewService(db), adminID, projectID
}

// A1：改 Base 元信息（名称 / 描述 / 图标）要立即生效，且不推进结构版本。
func TestUpdateBaseMeta(t *testing.T) {
	svc, adminID, projectID := newBaseMetaFixture(t)
	ctx := context.Background()

	created, err := svc.CreateBase(ctx, adminID, projectID, BaseUpdateInput{})
	if err != nil {
		t.Fatalf("create base failed: %v", err)
	}
	if created.Name == "" {
		t.Fatal("expected default base name")
	}

	name := "客户台账"
	desc := "2026 客户跟进"
	icon := "table"
	updated, err := svc.UpdateBase(ctx, adminID, projectID, created.ID, BaseUpdateInput{
		Name: &name, Description: &desc, Icon: &icon,
	})
	if err != nil {
		t.Fatalf("update base failed: %v", err)
	}
	if updated.Name != name || updated.Description != desc || updated.Icon != icon {
		t.Fatalf("meta not applied: %+v", updated)
	}
	if updated.SchemaVersion != created.SchemaVersion {
		t.Fatalf("schema version must not change on meta update: %d -> %d",
			created.SchemaVersion, updated.SchemaVersion)
	}

	// 空名称要拒绝。
	empty := "   "
	if _, err := svc.UpdateBase(ctx, adminID, projectID, created.ID, BaseUpdateInput{Name: &empty}); err == nil {
		t.Fatal("expected empty name rejected")
	}

	// 落库校验：重新读一次仍是新名字。
	reloaded, err := svc.GetBase(ctx, adminID, projectID, created.ID)
	if err != nil {
		t.Fatalf("get base failed: %v", err)
	}
	if reloaded.Name != name {
		t.Fatalf("name not persisted: %q", reloaded.Name)
	}
}

// A1：删除 Base 只有管理员能做；editor 越权要报 forbidden。
func TestDeleteBaseRequiresAdmin(t *testing.T) {
	svc, adminID, projectID := newBaseMetaFixture(t)
	ctx := context.Background()

	created, err := svc.CreateBase(ctx, adminID, projectID, BaseUpdateInput{})
	if err != nil {
		t.Fatalf("create base failed: %v", err)
	}
	editorID := uuid.New()
	if err := svc.db.Exec(`INSERT INTO kb_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.New(), projectID, editorID, RoleEditor).Error; err != nil {
		t.Fatalf("insert editor failed: %v", err)
	}
	if err := svc.DeleteBase(ctx, editorID, projectID, created.ID); err == nil {
		t.Fatal("expected editor forbidden to delete base")
	}
	if err := svc.DeleteBase(ctx, adminID, projectID, created.ID); err != nil {
		t.Fatalf("admin delete base failed: %v", err)
	}
	if _, err := svc.GetBase(ctx, adminID, projectID, created.ID); err == nil {
		t.Fatal("expected base gone after delete")
	}
}
