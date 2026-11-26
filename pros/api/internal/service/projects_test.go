package service

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// projectSQLite 是 core_projects 表的 SQLite 影子模型：只把时间列换成 SQLite 认得的类型，
// 列名与索引保持与生产模型一致，这样测的是真实的 SQL 路径。
type projectSQLite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	OwnerUserID uuid.UUID `gorm:"type:uuid;not null;index:idx_projects_owner_updated,priority:1"`
	Name        string    `gorm:"type:varchar(255);not null"`
	Emoji       string    `gorm:"type:varchar(16);not null;default:'📁'"`
	Progress    int       `gorm:"not null;default:0"`
	CreatedAt   time.Time `gorm:"not null"`
	UpdatedAt   time.Time `gorm:"not null;index:idx_projects_owner_updated,priority:2,sort:desc"`
}

func (projectSQLite) TableName() string { return "core_projects" }

// pageReferencesSQLite 是 core_page_references 的 SQLite 影子模型：保存时的事务会
// 全量重建该表，缺表会让项目删除测试直接报 no such table。
type pageReferencesSQLite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	SourceDocID uuid.UUID `gorm:"type:uuid;not null;index:idx_pr_source,priority:1"`
	TargetDocID uuid.UUID `gorm:"type:uuid;not null;index:idx_pr_target"`
	RefType     string    `gorm:"type:varchar(16);not null"`
	BlockType   string    `gorm:"type:varchar(16);not null;default:''"`
	TargetLabel string    `gorm:"type:varchar(255);not null;default:''"`
	CreatedAt   time.Time `gorm:"not null"`
}

func (pageReferencesSQLite) TableName() string { return "core_page_references" }

func openProjectsSQLite(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:projects-"+uuid.NewString()+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(
		&projectSQLite{},
		&backupUserSQLite{},
		&backupDocumentSQLite{},
		&backupRevisionSQLite{},
		&backupContentBlockSQLite{},
		&documentSaveOperationSQLite{},
		&pageReferencesSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestProjectsServiceCreateListRename(t *testing.T) {
	db := openProjectsSQLite(t)
	svc := NewProjectsService(db)
	owner := uuid.New()

	created, err := svc.Create(owner, "  我的项目  ", "")
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "我的项目" {
		t.Fatalf("name = %q, want trimmed", created.Name)
	}
	if created.Emoji != defaultProjectEmoji {
		t.Fatalf("emoji = %q, want default %q", created.Emoji, defaultProjectEmoji)
	}

	rows, err := svc.List(owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ID != created.ID || rows[0].CanvasCount != 0 {
		t.Fatalf("list = %+v", rows)
	}
	if rows[0].Emoji != defaultProjectEmoji || rows[0].Progress != 0 {
		t.Fatalf("list attrs = emoji %q progress %d", rows[0].Emoji, rows[0].Progress)
	}

	// 别人的项目既看不到也改不了。
	if _, err := svc.Update(uuid.New(), created.ID, ProjectUpdate{Name: strptr("改名")}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("update other owner error = %v, want ErrProjectNotFound", err)
	}

	renamed, err := svc.Update(owner, created.ID, ProjectUpdate{Name: strptr("新名字")})
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Name != "新名字" {
		t.Fatalf("renamed = %q", renamed.Name)
	}

	// 表情与进度单独更新；没传的字段保持原样。
	withAttrs, err := svc.Update(owner, created.ID, ProjectUpdate{
		Emoji:    strptr("🚀"),
		Progress: intptr(42),
	})
	if err != nil {
		t.Fatal(err)
	}
	if withAttrs.Emoji != "🚀" || withAttrs.Progress != 42 {
		t.Fatalf("attrs = emoji %q progress %d", withAttrs.Emoji, withAttrs.Progress)
	}
	if withAttrs.Name != "新名字" {
		t.Fatalf("name changed by attrs update: %q", withAttrs.Name)
	}

	// 进度越界要被夹到 0-100。
	clamped, err := svc.Update(owner, created.ID, ProjectUpdate{Progress: intptr(180)})
	if err != nil {
		t.Fatal(err)
	}
	if clamped.Progress != 100 {
		t.Fatalf("progress = %d, want clamped to 100", clamped.Progress)
	}

	if _, err := svc.Create(owner, "   ", ""); !errors.Is(err, ErrValidation) {
		t.Fatalf("blank name error = %v, want ErrValidation", err)
	}
}

func strptr(s string) *string { return &s }
func intptr(i int) *int       { return &i }

func TestProjectsServiceDeleteRemovesCanvases(t *testing.T) {
	db := openProjectsSQLite(t)
	projSvc := NewProjectsService(db)
	docSvc := NewDocumentsService(db)
	owner := uuid.New()

	project, err := projSvc.Create(owner, "项目 A", "")
	if err != nil {
		t.Fatal(err)
	}
	payload := json.RawMessage(`{"id":"canvas-a","type":"node-graph","schemaVersion":1}`)
	doc, err := docSvc.Create(owner, CreateDocumentInput{
		Title:      strptr("画布 A"),
		CanvasType: strptr("node-graph"),
		ProjectID:  &project.ID,
		Data:       payload,
	})
	if err != nil {
		t.Fatal(err)
	}
	if doc.ProjectID == nil || *doc.ProjectID != project.ID {
		t.Fatalf("doc project = %v", doc.ProjectID)
	}

	// 项目下的画布按项目过滤时能查到。
	rows, total, err := docSvc.List(owner, ListFilter{ProjectID: &project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(rows) != 1 || rows[0].ProjectID == nil || *rows[0].ProjectID != project.ID {
		t.Fatalf("project filter rows = %+v total = %d", rows, total)
	}

	if err := projSvc.Delete(owner, project.ID); err != nil {
		t.Fatal(err)
	}

	// 画布与项目同生共死：项目没了，画布也不能留在原地。
	var count int64
	if err := db.Unscoped().Model(&model.CanvasDocument{}).Where("id = ?", doc.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("canvas rows left = %d", count)
	}
	var revisions int64
	if err := db.Model(&model.CanvasRevision{}).Where("document_id = ?", doc.ID).Count(&revisions).Error; err != nil {
		t.Fatal(err)
	}
	if revisions != 0 {
		t.Fatalf("revision rows left = %d", revisions)
	}

	// 重复删除返回「找不到」，而不是静默成功。
	if err := projSvc.Delete(owner, project.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("second delete error = %v, want ErrProjectNotFound", err)
	}
}

func TestProjectsServiceRefsReturnsReferenceGraph(t *testing.T) {
	db := openProjectsSQLite(t)
	projSvc := NewProjectsService(db)
	docSvc := NewDocumentsService(db)
	owner := uuid.New()

	project, err := projSvc.Create(owner, "项目 B", "")
	if err != nil {
		t.Fatal(err)
	}
	canvasB, err := docSvc.Create(owner, CreateDocumentInput{
		Title:      strptr("画布 B"),
		CanvasType: strptr("node-graph"),
		ProjectID:  &project.ID,
		Data:       json.RawMessage(`{"id":"canvas-b","type":"node-graph","schemaVersion":1,"nodes":[],"edges":[]}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	payload := json.RawMessage(`{"id":"canvas-c","type":"node-graph","schemaVersion":1,"nodes":[` +
		`{"id":"n1","type":"canvasRef","refCanvasId":"` + canvasB.ID.String() + `"},` +
		`{"id":"n2","type":"richtext","content":"hello"}],"edges":[]}`)
	canvasC, err := docSvc.Create(owner, CreateDocumentInput{
		Title:      strptr("画布 C"),
		CanvasType: strptr("node-graph"),
		ProjectID:  &project.ID,
		Data:       payload,
	})
	if err != nil {
		t.Fatal(err)
	}

	refs, err := projSvc.Refs(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	got := refs[canvasC.ID.String()]
	if len(got) != 1 || got[0] != canvasB.ID.String() {
		t.Fatalf("refs[%s] = %v", canvasC.ID, got)
	}
	if len(refs[canvasB.ID.String()]) != 0 {
		t.Fatalf("refs[%s] = %v, want empty", canvasB.ID, refs[canvasB.ID.String()])
	}
}
