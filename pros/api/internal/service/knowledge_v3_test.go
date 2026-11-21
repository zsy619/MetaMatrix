package service

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 3.0 的 SQLite 影子模型。
type knowledgeNodeDataSQLite struct {
	NodeID    uuid.UUID      `gorm:"type:uuid;primaryKey"`
	Kind      string         `gorm:"type:varchar(16);not null"`
	Data      datatypes.JSON `gorm:"type:jsonb;not null"`
	CreatedAt time.Time      `gorm:"not null"`
	UpdatedAt time.Time      `gorm:"not null"`
}

func (knowledgeNodeDataSQLite) TableName() string { return "knowledge_node_data" }

type knowledgeShareSQLite struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey"`
	DocumentID   uuid.UUID  `gorm:"type:uuid;not null;index"`
	ProjectID    uuid.UUID  `gorm:"type:uuid;not null;index"`
	Token        string     `gorm:"type:varchar(64);not null;uniqueIndex"`
	Role         string     `gorm:"type:varchar(16);not null;default:'view'"`
	CreatedBy    uuid.UUID  `gorm:"type:uuid;not null"`
	ExpiresAt    *time.Time `gorm:"index"`
	PasswordHash string     `gorm:"type:varchar(64);not null;default:''"`
	AllowCopy    bool       `gorm:"not null;default:true"`
	CreatedAt    time.Time  `gorm:"not null"`
}

func (knowledgeShareSQLite) TableName() string { return "knowledge_shares" }

type knowledgeDocVersionSQLite struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	DocumentID   uuid.UUID `gorm:"type:uuid;not null;index"`
	Title        string    `gorm:"type:varchar(255);not null;default:''"`
	HTML         string    `gorm:"type:text;not null;default:''"`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null;index"`
	SaveVersion  int64     `gorm:"not null;default:0"`
	Label        string    `gorm:"type:varchar(64);not null;default:''"`
	CreatedAt    time.Time `gorm:"not null;index"`
}

func (knowledgeDocVersionSQLite) TableName() string { return "knowledge_doc_versions" }

func openKnowledgeV3SQLite(t *testing.T) (*gorm.DB, uuid.UUID, *model.Project, *KnowledgeService) {
	t.Helper()
	db := openProjectsSQLite(t)
	if err := db.AutoMigrate(
		&knowledgeNodeSQLite{},
		&knowledgeNodeDataSQLite{},
		&knowledgeShareSQLite{},
		&knowledgeDocVersionSQLite{},
		&docCommentSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	project, err := NewProjectsService(db).Create(owner, "知识库 3.0", "")
	if err != nil {
		t.Fatal(err)
	}
	return db, owner, project, NewKnowledgeService(db)
}

func TestKnowledgeV3MarkdownImportCreatesDocAndNode(t *testing.T) {
	_, owner, project, svc := openKnowledgeV3SQLite(t)
	md := "# 导入标题\n\n- 第一条\n- 第二条\n"
	node, err := svc.ImportFile(owner, project.ID, nil, "导入.md", []byte(md))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if node.Title != "导入" || node.DocumentID == nil {
		t.Fatalf("node = %+v", node)
	}
	var doc model.CanvasDocument
	if err := svc.db.First(&doc, "id = ?", *node.DocumentID).Error; err != nil {
		t.Fatal(err)
	}
	var payload struct {
		HTML string `json:"html"`
	}
	if err := json.Unmarshal(doc.CurrentData, &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(payload.HTML, "<h1>导入标题</h1>") {
		t.Fatalf("html = %s", payload.HTML)
	}
	if !strings.Contains(payload.HTML, "<li>第一条</li>") {
		t.Fatalf("list missing: %s", payload.HTML)
	}
}

func TestKnowledgeV3SheetNodeData(t *testing.T) {
	_, owner, project, svc := openKnowledgeV3SQLite(t)
	node, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "sheet", Title: "多维表格"})
	if err != nil {
		t.Fatal(err)
	}
	// 默认返回空骨架。
	row, err := svc.GetNodeData(owner, project.ID, node.ID)
	if err != nil {
		t.Fatal(err)
	}
	if row.Kind != "sheet" || !strings.Contains(string(row.Data), "列 1") {
		t.Fatalf("default data = %+v", row)
	}
	payload := json.RawMessage(`{"columns":["名称","负责人"],"rows":[["需求评审","张三"]]}`)
	saved, err := svc.SaveNodeData(owner, project.ID, node.ID, "sheet", payload)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if !strings.Contains(string(saved.Data), "需求评审") {
		t.Fatalf("saved = %s", string(saved.Data))
	}
	// 类型不匹配要拒绝。
	if _, err := svc.SaveNodeData(owner, project.ID, node.ID, "mindmap", payload); err == nil {
		t.Fatal("mismatched kind must fail")
	}
}

func TestKnowledgeV3ShareResolveAndRevoke(t *testing.T) {
	_, owner, project, svc := openKnowledgeV3SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "周报", "📄")
	if err != nil {
		t.Fatal(err)
	}
	// 给文档写上正文，验证分享页能读到内容。
	if _, err := svc.docs().Update(owner, *node.DocumentID, UpdateDocumentInput{
		CurrentData: json.RawMessage(`{"type":"doc","html":"<p>本周完成</p>"}`),
	}); err != nil {
		t.Fatal(err)
	}
	share, err := svc.CreateShare(owner, *node.DocumentID, "comment", nil)
	if err != nil {
		t.Fatalf("share: %v", err)
	}
	doc, err := svc.ResolveShare(share.Token)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if doc.Role != "comment" || !strings.Contains(doc.HTML, "本周完成") {
		t.Fatalf("shared = %+v", doc)
	}
	if err := svc.RevokeShare(owner, share.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ResolveShare(share.Token); err == nil {
		t.Fatal("revoked share must not resolve")
	}
}

func TestKnowledgeV3SearchByAuthorAndGraph(t *testing.T) {
	db, owner, project, svc := openKnowledgeV3SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "预算表", "<p>年度预算</p>")
	if err != nil {
		t.Fatal(err)
	}
	// 节点作者就是创建者。
	if err := db.Model(&model.KnowledgeNode{}).Where("id = ?", node.ID).
		Update("created_by", owner).Error; err != nil {
		t.Fatal(err)
	}
	hits, err := svc.SearchSpace(owner, project.ID, KnowledgeSearchFilter{Query: "预算"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("expected search hit")
	}
	hits, err = svc.SearchSpace(owner, project.ID, KnowledgeSearchFilter{AuthorID: owner.String()})
	if err != nil {
		t.Fatalf("search by author: %v", err)
	}
	if len(hits) != 1 || hits[0].NodeID != node.ID.String() {
		t.Fatalf("author hits = %+v", hits)
	}
	other := uuid.New()
	hits, err = svc.SearchSpace(owner, project.ID, KnowledgeSearchFilter{AuthorID: other.String()})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 0 {
		t.Fatalf("unexpected hits: %+v", hits)
	}
	graph, err := svc.BuildGraph(owner, project.ID)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	if len(graph.Nodes) != 1 {
		t.Fatalf("graph nodes = %d", len(graph.Nodes))
	}
}

func TestKnowledgeV3VersionSnapshotAndDiff(t *testing.T) {
	db, owner, project, svc := openKnowledgeV3SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "版本文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	doc, err := svc.docs().GetOwned(owner, docID)
	if err != nil {
		t.Fatal(err)
	}
	if err := SnapshotDocVersion(db, doc); err != nil {
		t.Fatal(err)
	}
	// 再存一版内容，形成可对比的两个版本。
	if _, err := svc.docs().Update(owner, docID, UpdateDocumentInput{
		CurrentData: json.RawMessage(`{"type":"doc","html":"<p>第二版内容</p>"}`),
	}); err != nil {
		t.Fatal(err)
	}
	versions, err := svc.ListDocVersions(owner, docID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) < 2 {
		t.Fatalf("versions = %d, want >= 2", len(versions))
	}
	diff, err := svc.VersionDiff(owner, docID, versions[1].ID, versions[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(diff, "第二版内容") {
		t.Fatalf("diff missing change: %q", diff)
	}
}
