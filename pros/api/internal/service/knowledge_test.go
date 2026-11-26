package service

import (
	"errors"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

// knowledgeNodeSQLite 是 kb_nodes 的 SQLite 影子模型：只把时间列换成 SQLite 认得的类型。
type knowledgeNodeSQLite struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ProjectID    uuid.UUID  `gorm:"type:uuid;not null"`
	ParentID     *uuid.UUID `gorm:"type:uuid"`
	NodeType     string     `gorm:"type:varchar(16);not null"`
	DocumentID   *uuid.UUID `gorm:"type:uuid"`
	Title        string     `gorm:"type:varchar(255);not null"`
	CreatedBy    uuid.UUID  `gorm:"type:uuid;index"`
	SortOrder    int        `gorm:"not null;default:0"`
	Icon         string     `gorm:"type:varchar(16);not null;default:'📄'"`
	Alias        string     `gorm:"type:varchar(64);not null;default:''"`
	Pinyin       string     `gorm:"type:varchar(255);not null;default:''"`
	Visibility   string     `gorm:"type:varchar(16);not null;default:'space'"`
	AllowedUsers string     `gorm:"type:varchar(512);not null;default:''"`
	Summary      string     `gorm:"type:varchar(255);not null;default:''"`
	Favorite     bool       `gorm:"not null;default:false"`
	Locked       bool       `gorm:"not null;default:false"`
	TrashedAt    *time.Time `gorm:"index"`
	ArchivedAt   *time.Time `gorm:"index"`
	CreatedAt    time.Time  `gorm:"not null"`
	UpdatedAt    time.Time  `gorm:"not null"`
}

func (knowledgeNodeSQLite) TableName() string { return "kb_nodes" }

func TestKnowledgeDocsNestAndShareTitleWithDocument(t *testing.T) {
	db := openProjectsSQLite(t)
	if err := db.AutoMigrate(&knowledgeNodeSQLite{}); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	project, err := NewProjectsService(db).Create(owner, "知识库", "")
	if err != nil {
		t.Fatal(err)
	}
	svc := NewKnowledgeService(db)

	parent, err := svc.CreateDocWithNode(owner, project.ID, nil, "父文档", "")
	if err != nil {
		t.Fatal(err)
	}
	// 没有文件夹：文档直接挂在文档下面。
	child, err := svc.CreateDocWithNode(owner, project.ID, &parent.ID, "子文档", "")
	if err != nil {
		t.Fatalf("doc under doc: %v", err)
	}

	// 在编辑器里改文档标题，目录树读到的就是新标题。
	if err := db.Model(&model.CanvasDocument{}).Where("id = ?", *child.DocumentID).Update("title", "编辑器改名").Error; err != nil {
		t.Fatal(err)
	}
	nodes, err := svc.Tree(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	titles := map[uuid.UUID]string{}
	for _, node := range nodes {
		titles[node.ID] = node.Title
	}
	if titles[child.ID] != "编辑器改名" {
		t.Fatalf("tree title = %q, want document title", titles[child.ID])
	}

	// 在目录树上改名，文档标题跟着变。
	renamed := "目录树改名"
	if _, err := svc.Update(owner, project.ID, parent.ID, &renamed, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	var doc model.CanvasDocument
	if err := db.First(&doc, "id = ?", *parent.DocumentID).Error; err != nil {
		t.Fatal(err)
	}
	if doc.Title != renamed {
		t.Fatalf("document title = %q, want %q", doc.Title, renamed)
	}

	// 别人的节点改名碰不到这篇文档。
	stranger := uuid.New()
	strangerProject, err := NewProjectsService(db).Create(stranger, "别人的项目", "")
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := svc.Create(stranger, strangerProject.ID, KnowledgeNodeInput{NodeType: "doc", Title: "挂别人的文档", DocumentID: parent.DocumentID})
	if err != nil {
		t.Fatal(err)
	}
	hijack := "被篡改"
	if _, err := svc.Update(stranger, strangerProject.ID, foreign.ID, &hijack, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	if err := db.First(&doc, "id = ?", *parent.DocumentID).Error; err != nil {
		t.Fatal(err)
	}
	if doc.Title != renamed {
		t.Fatalf("foreign rename leaked into document title: %q", doc.Title)
	}

	// 换图标：正常落库，清空回落到默认，超出列宽被拒。
	icon := "🚀"
	if node, err := svc.Update(owner, project.ID, child.ID, nil, &icon, nil, nil); err != nil || node.Icon != icon {
		t.Fatalf("set icon: node = %+v, err = %v", node, err)
	}
	icon = ""
	if node, err := svc.Update(owner, project.ID, child.ID, nil, &icon, nil, nil); err != nil || node.Icon != "📄" {
		t.Fatalf("reset icon: node = %+v, err = %v", node, err)
	}
	icon = strings.Repeat("🚀", 17)
	if _, err := svc.Update(owner, project.ID, child.ID, nil, &icon, nil, nil); !errors.Is(err, ErrValidation) {
		t.Fatalf("oversized icon error = %v, want ErrValidation", err)
	}

	// 删父文档节点，子节点一起移除；文档本身保留。
	if err := svc.Delete(owner, project.ID, parent.ID); err != nil {
		t.Fatal(err)
	}
	if nodes, err = svc.Tree(owner, project.ID); err != nil || len(nodes) != 0 {
		t.Fatalf("nodes left = %d, err = %v", len(nodes), err)
	}
	var docsLeft int64
	if err := db.Model(&model.CanvasDocument{}).Where("owner_user_id = ?", owner).Count(&docsLeft).Error; err != nil {
		t.Fatal(err)
	}
	if docsLeft != 2 {
		t.Fatalf("documents left = %d, want 2", docsLeft)
	}
}
