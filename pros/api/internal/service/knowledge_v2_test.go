package service

import (
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 2.0 的 SQLite 影子模型：只把时间列换成 SQLite 认得的类型，
// 列与索引与真实 schema 一致。
type knowledgeTemplateSQLite struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID *uuid.UUID     `gorm:"type:uuid;index"`
	ProjectID   *uuid.UUID     `gorm:"type:uuid;index"`
	Key         string         `gorm:"type:varchar(64);not null"`
	Label       string         `gorm:"type:varchar(64);not null"`
	Icon        string         `gorm:"type:varchar(16);not null;default:'📄'"`
	Category    string         `gorm:"type:varchar(32);not null;default:'通用'"`
	Scope       string         `gorm:"type:varchar(16);not null;default:'personal'"`
	HTML        string         `gorm:"type:text;not null;default:''"`
	Properties  datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'"`
	Builtin     bool           `gorm:"not null;default:false"`
	Published   bool           `gorm:"not null;default:false"`
	PublishedAt *time.Time     `gorm:""`
	PublishedBy *uuid.UUID     `gorm:"type:uuid"`
	SortOrder   int            `gorm:"not null;default:0"`
	CreatedAt   time.Time      `gorm:"not null"`
	UpdatedAt   time.Time      `gorm:"not null"`
}

func (knowledgeTemplateSQLite) TableName() string { return "kb_templates" }

type docPropertySQLite struct {
	DocID          uuid.UUID      `gorm:"type:uuid;primaryKey"`
	OwnerUserID    uuid.UUID      `gorm:"type:uuid;not null;index"`
	Status         string         `gorm:"type:varchar(16);not null;default:'draft'"`
	ReviewerUserID *uuid.UUID     `gorm:"type:uuid"`
	DueAt          *time.Time     `gorm:"index"`
	Tags           string         `gorm:"type:varchar(255);not null;default:''"`
	Summary        string         `gorm:"type:varchar(255);not null;default:''"`
	CoverColor     string         `gorm:"type:varchar(32);not null;default:''"`
	CoverURL       string         `gorm:"type:varchar(512);not null;default:''"`
	Members        string         `gorm:"type:varchar(512);not null;default:''"`
	Priority       string         `gorm:"type:varchar(16);not null;default:'normal'"`
	Milestone      string         `gorm:"type:varchar(64);not null;default:''"`
	Sprint         string         `gorm:"type:varchar(64);not null;default:''"`
	Number         float64        `gorm:"not null;default:0"`
	Fields         datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'"`
	FieldValues    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'"`
	CreatedAt      time.Time      `gorm:"not null"`
	UpdatedAt      time.Time      `gorm:"not null"`
}

func (docPropertySQLite) TableName() string { return "kb_doc_properties" }

type docCommentSQLite struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey"`
	DocID        uuid.UUID      `gorm:"type:uuid;not null;index:idx_dc_doc"`
	AuthorUserID uuid.UUID      `gorm:"type:uuid;not null"`
	ParentID     *uuid.UUID     `gorm:"type:uuid;index"`
	Quote        string         `gorm:"type:text;not null;default:''"`
	Anchor       int            `gorm:"not null;default:-1"`
	AnchorFrom   int            `gorm:"not null;default:-1"`
	AnchorTo     int            `gorm:"not null;default:-1"`
	BlockID      *uuid.UUID     `gorm:"type:uuid;index:idx_dc_block"`
	BlockOffset  int            `gorm:"not null;default:-1"`
	YRel         string         `gorm:"type:text;not null;default:''"`
	Mentions     string         `gorm:"type:varchar(512);not null;default:''"`
	Reactions    datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'"`
	Content      string         `gorm:"type:text;not null"`
	Resolved     bool           `gorm:"not null;default:false"`
	CreatedAt    time.Time      `gorm:"not null"`
	UpdatedAt    time.Time      `gorm:"not null"`
}

func (docCommentSQLite) TableName() string { return "kb_comments" }

type knowledgeEventSQLite struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ProjectID   uuid.UUID  `gorm:"type:uuid;not null;index:idx_ke_project"`
	EventType   string     `gorm:"type:varchar(32);not null"`
	NodeID      *uuid.UUID `gorm:"type:uuid;index"`
	DocumentID  *uuid.UUID `gorm:"type:uuid;index"`
	ActorUserID uuid.UUID  `gorm:"type:uuid;not null"`
	Payload     string     `gorm:"type:text;not null;default:''"`
	CreatedAt   time.Time  `gorm:"not null;index:idx_ke_created"`
}

func (knowledgeEventSQLite) TableName() string { return "kb_events" }

type knowledgeViewSQLite struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;index:idx_kv_user"`
	DocID    uuid.UUID `gorm:"type:uuid;not null;index:idx_kv_doc"`
	ViewedAt time.Time `gorm:"not null;index:idx_kv_user"`
}

func (knowledgeViewSQLite) TableName() string { return "kb_views" }

type userNotificationSQLite struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index:idx_un_user_created,priority:1"`
	ActorID   uuid.UUID  `gorm:"type:uuid;not null"`
	DocID     *uuid.UUID `gorm:"type:uuid;index"`
	CommentID *uuid.UUID `gorm:"type:uuid;index"`
	Kind      string     `gorm:"type:varchar(32);not null"`
	Title     string     `gorm:"type:varchar(255);not null;default:''"`
	Body      string     `gorm:"type:text;not null;default:''"`
	ReadAt    *time.Time `gorm:"index"`
	CreatedAt time.Time  `gorm:"not null;index:idx_un_user_created,priority:2"`
}

func (userNotificationSQLite) TableName() string { return "core_user_notifications" }

func openKnowledgeV2SQLite(t *testing.T) (*gorm.DB, uuid.UUID, *model.Project, *KnowledgeService) {
	t.Helper()
	db := openProjectsSQLite(t)
	if err := db.AutoMigrate(
		&knowledgeNodeSQLite{},
		&knowledgeTemplateSQLite{},
		&docPropertySQLite{},
		&docCommentSQLite{},
		&knowledgeEventSQLite{},
		&knowledgeViewSQLite{},
		&userNotificationSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	project, err := NewProjectsService(db).Create(owner, "知识库 2.0", "")
	if err != nil {
		t.Fatal(err)
	}
	return db, owner, project, NewKnowledgeService(db)
}

func TestKnowledgeV2TemplatesSeedAndScope(t *testing.T) {
	db, owner, project, svc := openKnowledgeV2SQLite(t)
	if err := SeedBuiltinTemplates(db); err != nil {
		t.Fatal(err)
	}
	// 幂等：再种一次不会翻倍。
	if err := SeedBuiltinTemplates(db); err != nil {
		t.Fatal(err)
	}
	templates, err := svc.ListTemplates(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(templates) < 8 {
		t.Fatalf("builtin templates = %d, want >= 8", len(templates))
	}
	mine, err := svc.CreateTemplate(owner, project.ID, KnowledgeTemplateInput{
		Label: "我的模板",
		HTML:  "<p>x</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if mine.Builtin {
		t.Fatal("user template must not be builtin")
	}
	templates, err = svc.ListTemplates(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, tpl := range templates {
		if tpl.ID == mine.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("user template missing from list")
	}
	if err := svc.DeleteTemplate(owner, mine.ID); err != nil {
		t.Fatal(err)
	}
}

func TestKnowledgeV2NodeMetaTrashAndCopy(t *testing.T) {
	_, owner, project, svc := openKnowledgeV2SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "产品方案", "")
	if err != nil {
		t.Fatal(err)
	}
	// 收藏 + 别名 + 摘要。
	updated, err := svc.UpdateNodeMeta(owner, project.ID, node.ID, NodeMetaInput{
		Favorite: boolPtr(true),
		Alias:    strPtr("方案"),
		Summary:  strPtr("一期范围"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !updated.Favorite || updated.Alias != "方案" || updated.Summary != "一期范围" {
		t.Fatalf("meta not applied: %+v", updated)
	}
	// 回收站：默认树里不再出现，回收站里能捞回来。
	if _, err := svc.UpdateNodeMeta(owner, project.ID, node.ID, NodeMetaInput{Trashed: boolPtr(true)}); err != nil {
		t.Fatal(err)
	}
	nodes, err := svc.Tree(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 0 {
		t.Fatalf("trashed node still in tree: %d", len(nodes))
	}
	trash, err := svc.ListTrash(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(trash) != 1 {
		t.Fatalf("trash = %d, want 1", len(trash))
	}
	if _, err := svc.UpdateNodeMeta(owner, project.ID, node.ID, NodeMetaInput{Trashed: boolPtr(false)}); err != nil {
		t.Fatal(err)
	}
	nodes, err = svc.Tree(owner, project.ID)
	if err != nil || len(nodes) != 1 {
		t.Fatalf("restored tree = %d, err = %v", len(nodes), err)
	}
	// 复制节点：文档内容一起复制。
	copied, err := svc.CopyNode(owner, project.ID, node.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if copied.DocumentID == nil || *copied.DocumentID == *node.DocumentID {
		t.Fatalf("copy did not create a new document: %+v", copied)
	}
	if !strings.Contains(copied.Title, "副本") {
		t.Fatalf("copy title = %q", copied.Title)
	}
}

func TestKnowledgeV2DocPropertiesCommentsAndSummary(t *testing.T) {
	db, owner, project, svc := openKnowledgeV2SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "周会纪要", "")
	if err != nil {
		t.Fatal(err)
	}
	props, err := svc.UpsertDocProps(owner, *node.DocumentID, DocPropsInput{
		Status:  strPtr("published"),
		Tags:    strPtr("会议,纪要"),
		Summary: strPtr("第一周进展"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if props.Status != "published" || props.Tags != "会议,纪要" {
		t.Fatalf("props = %+v", props)
	}
	comment, err := svc.AddComment(owner, *node.DocumentID, nil, "这句要改", "这里的口径不对")
	if err != nil {
		t.Fatal(err)
	}
	comments, err := svc.ListComments(owner, *node.DocumentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(comments) != 1 {
		t.Fatalf("comments = %d, want 1", len(comments))
	}
	if _, err := svc.UpdateComment(owner, comment.ID, nil, boolPtr(true)); err != nil {
		t.Fatal(err)
	}
	comments, err = svc.ListComments(owner, *node.DocumentID)
	if err != nil {
		t.Fatal(err)
	}
	if !comments[0].Resolved {
		t.Fatal("comment should be resolved")
	}
	// 最近浏览：同一文档只留一条。
	if err := svc.TouchView(owner, *node.DocumentID); err != nil {
		t.Fatal(err)
	}
	if err := svc.TouchView(owner, *node.DocumentID); err != nil {
		t.Fatal(err)
	}
	recent, err := svc.ListRecentViews(owner, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(recent) != 1 || recent[0].DocID != *node.DocumentID {
		t.Fatalf("recent = %+v", recent)
	}
	summary, err := svc.SpaceSummary(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if summary.NodeCount != 1 || summary.DocCount != 1 {
		t.Fatalf("summary counts = %+v", summary)
	}
	if summary.TagCount != 2 {
		t.Fatalf("tag count = %d, want 2", summary.TagCount)
	}
	// 导出：保留层级与正文。
	if err := db.Model(&model.CanvasDocument{}).Where("id = ?", *node.DocumentID).
		Update("content_text", "第一周进展").Error; err != nil {
		t.Fatal(err)
	}
	md, err := svc.ExportTreeMarkdown(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(md, "周会纪要") {
		t.Fatalf("export missing title: %s", md)
	}
}

func TestKnowledgeV2HTMLToMarkdown(t *testing.T) {
	md := htmlToMarkdown(`<h1>标题</h1><p>正文<strong>加粗</strong></p><ul><li>条目一</li></ul>`)
	if !strings.Contains(md, "# 标题") ||
		!strings.Contains(md, "正文**加粗**") ||
		!strings.Contains(md, "- 条目一") {
		t.Fatalf("markdown = %q", md)
	}
}

func strPtr(s string) *string { return &s }
