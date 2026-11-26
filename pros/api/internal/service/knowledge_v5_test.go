package service

import (
	"encoding/json"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type docCommentReadSQLite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_dcr_user_doc"`
	DocID     uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_dcr_user_doc"`
	ReadAt    time.Time `gorm:"not null"`
	CreatedAt time.Time `gorm:"not null"`
}

func (docCommentReadSQLite) TableName() string { return "doc_comment_reads" }

type knowledgeTagDictSQLite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index"`
	Tag       string    `gorm:"type:varchar(64);not null;uniqueIndex:idx_ktd_project_tag"`
	Category  string    `gorm:"type:varchar(32);not null;default:''"`
	Aliases   string    `gorm:"type:varchar(255);not null;default:''"`
	CreatedAt time.Time `gorm:"not null"`
}

func (knowledgeTagDictSQLite) TableName() string { return "knowledge_tag_dict" }

func openKnowledgeV5SQLite(t *testing.T) (*gorm.DB, uuid.UUID, *model.Project, *KnowledgeService) {
	t.Helper()
	db, owner, project, svc := openKnowledgeV2SQLite(t)
	if err := db.AutoMigrate(&docCommentReadSQLite{}, &knowledgeTagDictSQLite{}, &knowledgeDocVersionSQLite{}); err != nil {
		t.Fatal(err)
	}
	return db, owner, project, svc
}

func TestKnowledgeV5FormulaAndRequiredFields(t *testing.T) {
	_, owner, project, svc := openKnowledgeV5SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "带公式的文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	defs := []FieldDef{
		{Key: "budget", Label: "预算", Type: "number"},
		{Key: "cost", Label: "成本", Type: "number"},
		{Key: "rest", Label: "剩余", Type: "formula", Formula: "{budget} - {cost}"},
		{Key: "owner", Label: "负责人", Type: "text", Required: true},
	}
	if _, err := svc.SetDocFields(owner, docID, defs, map[string]any{"budget": "100", "cost": "30"}); err != nil {
		t.Fatal(err)
	}
	props, err := svc.GetDocProps(owner, docID)
	if err != nil {
		t.Fatal(err)
	}
	if got := props.Computed["rest"]; got != 70 {
		t.Fatalf("computed rest = %v, want 70", got)
	}
	// 必填字段缺值时拒绝保存。
	if _, err := svc.UpsertDocProps(owner, docID, DocPropsInput{Status: strPtr("draft")}); err != ErrValidation {
		t.Fatalf("expected validation error, got %v", err)
	}
	if _, err := svc.SetDocFields(owner, docID, defs, map[string]any{"owner": "张三"}); err != nil {
		t.Fatal(err)
	}
}

func TestKnowledgeV5TasksAndOutline(t *testing.T) {
	_, owner, project, svc := openKnowledgeV5SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "任务文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	html := `<h1>标题</h1><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>写周报</p></li><li data-type="taskItem" data-checked="true"><p>评审</p></li></ul><h2>附录</h2><p>正文</p>`
	if err := svc.saveDocHTML(owner, docID, htmlPayload(html)); err != nil {
		t.Fatal(err)
	}
	tasks, err := svc.ListDocTasks(owner, docID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 || tasks[0].Text != "写周报" {
		t.Fatalf("unexpected tasks: %+v", tasks)
	}
	if err := svc.SetDocTask(owner, docID, 0, true); err != nil {
		t.Fatal(err)
	}
	tasks, _ = svc.ListDocTasks(owner, docID)
	if !tasks[0].Checked {
		t.Fatal("task 0 should be checked")
	}
	outline, err := svc.DocOutline(owner, docID)
	if err != nil {
		t.Fatal(err)
	}
	if len(outline) != 2 || outline[1].Text != "附录" {
		t.Fatalf("unexpected outline: %+v", outline)
	}
	if err := svc.ReorderOutline(owner, docID, []int{1, 0}); err != nil {
		t.Fatal(err)
	}
	outline, _ = svc.DocOutline(owner, docID)
	if outline[0].Text != "附录" {
		t.Fatalf("outline not reordered: %+v", outline)
	}
}

func TestKnowledgeV5CommentAnchorsReactionsAndACL(t *testing.T) {
	_, owner, project, svc := openKnowledgeV5SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "评论文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	comment, err := svc.AddCommentDetailed(owner, docID, nil, "原文", "改这里", 10, 20, []string{owner.String()}, nil, -1)
	if err != nil {
		t.Fatal(err)
	}
	if comment.AnchorFrom != 10 || comment.AnchorTo != 20 || comment.Mentions == "" {
		t.Fatalf("unexpected comment: %+v", comment)
	}
	if _, err := svc.ToggleReaction(owner, comment.ID, "👍"); err != nil {
		t.Fatal(err)
	}
	updated, _ := svc.ToggleReaction(owner, comment.ID, "👍")
	var reactions map[string][]string
	if err := json.Unmarshal(updated.Reactions, &reactions); err != nil {
		t.Fatal(err)
	}
	if len(reactions["👍"]) != 0 {
		t.Fatalf("reaction should be toggled off: %+v", reactions)
	}
	// 已读标记：读过之后评论不再是未读。
	if err := svc.MarkCommentsRead(owner, docID); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.ListCommentsFiltered(owner, docID, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected no unread comments, got %d", len(rows))
	}
	// 私有节点：未授权用户看不到。
	folder, err := svc.Create(owner, project.ID, KnowledgeNodeInput{NodeType: "folder", Title: "私密目录"})
	if err != nil {
		t.Fatal(err)
	}
	folder, err = svc.SetNodeAccess(owner, project.ID, folder.ID, NodeAccessInput{Visibility: "private"})
	if err != nil {
		t.Fatal(err)
	}
	other := uuid.New()
	if svc.nodeVisible(other, *folder) {
		t.Fatal("private folder should be hidden from others")
	}
	if !svc.nodeVisible(owner, *folder) {
		t.Fatal("owner should still see own private folder")
	}
}

func TestKnowledgeV5TagDictAndDocxExport(t *testing.T) {
	_, owner, project, svc := openKnowledgeV5SQLite(t)
	if _, err := svc.AddTagDict(owner, project.ID, "交付", "阶段", "上线"); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.ListTagDict(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Tag != "交付" {
		t.Fatalf("unexpected dict: %+v", rows)
	}
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "导出文档", "📄")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.saveDocHTML(owner, *node.DocumentID, htmlPayload("<h1>标题</h1><p>正文内容</p>")); err != nil {
		t.Fatal(err)
	}
	data, filename, err := svc.ExportDocumentDocx(owner, *node.DocumentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 || filename != "导出文档.docx" {
		t.Fatalf("unexpected docx export: %d bytes %s", len(data), filename)
	}
}

var _ = datatypes.JSON{}
