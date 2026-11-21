package service

import (
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 6.0 的 SQLite 影子模型：时间列换成 SQLite 认得的类型。
type knowledgeMemberSQLite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_knowledge_member,priority:1"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_knowledge_member,priority:2"`
	Role      string    `gorm:"type:varchar(16);not null;default:'viewer'"`
	CreatedBy uuid.UUID `gorm:"type:uuid;not null"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

func (knowledgeMemberSQLite) TableName() string { return "knowledge_members" }

type knowledgePresenceSQLite struct {
	DocID    uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID   uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name     string    `gorm:"type:varchar(64);not null;default:''"`
	Avatar   string    `gorm:"type:varchar(512);not null;default:''"`
	Editing  bool      `gorm:"not null;default:false"`
	Cursor   string    `gorm:"type:varchar(255);not null;default:''"`
	LastSeen time.Time `gorm:"not null;index:idx_presence_seen"`
}

func (knowledgePresenceSQLite) TableName() string { return "knowledge_presence" }

type docCRDTUpdateSQLite struct {
	ID           int64     `gorm:"primaryKey;autoIncrement"`
	DocID        uuid.UUID `gorm:"type:uuid;not null;index:idx_crdt_doc"`
	Kind         string    `gorm:"type:varchar(16);not null;default:'update'"`
	Payload      []byte    `gorm:""`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null"`
	CreatedAt    time.Time `gorm:"not null"`
}

func (docCRDTUpdateSQLite) TableName() string { return "doc_crdt_updates" }

type knowledgeChunkSQLite struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey"`
	ProjectID uuid.UUID      `gorm:"type:uuid;not null;index:idx_chunk_project"`
	DocID     uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:idx_chunk_doc_seq,priority:1"`
	Seq       int            `gorm:"not null;uniqueIndex:idx_chunk_doc_seq,priority:2"`
	Text      string         `gorm:"type:text;not null"`
	Embedding datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'"`
	UpdatedAt time.Time      `gorm:"not null"`
}

func (knowledgeChunkSQLite) TableName() string { return "knowledge_chunks" }

func openKnowledgeV6SQLite(t *testing.T) (*gorm.DB, uuid.UUID, *model.Project, *KnowledgeService) {
	t.Helper()
	db, owner, project, svc := openKnowledgeV5SQLite(t)
	if err := db.AutoMigrate(
		&knowledgeMemberSQLite{},
		&knowledgePresenceSQLite{},
		&docCRDTUpdateSQLite{},
		&knowledgeChunkSQLite{},
	); err != nil {
		t.Fatal(err)
	}
	return db, owner, project, svc
}

func TestKnowledgeV6MembersAndRoles(t *testing.T) {
	_, owner, project, svc := openKnowledgeV6SQLite(t)
	memberUser := model.User{ID: uuid.New(), Email: "member@metamatrix.local", DisplayName: "成员"}
	if err := svc.db.Create(&memberUser).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetMemberRole(owner, project.ID, memberUser.ID, SpaceRoleEditor); err != nil {
		t.Fatal(err)
	}
	members, err := svc.ListMembers(owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	// 测试夹具里没有 owner 用户行，只有刚加入的成员。
	if len(members) != 1 || members[0].Role != SpaceRoleEditor {
		t.Fatalf("members = %+v, want one editor", members)
	}
	if got := svc.SpaceRole(memberUser.ID, project.ID); got != SpaceRoleEditor {
		t.Fatalf("space role = %q, want editor", got)
	}
	// 成员可以读空间；非成员按「项目不存在」处理。
	if _, err := svc.ListMembers(memberUser.ID, project.ID); err != nil {
		t.Fatalf("member should read space, got %v", err)
	}
	stranger := model.User{ID: uuid.New(), Email: "stranger@metamatrix.local"}
	if err := svc.db.Create(&stranger).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListMembers(stranger.ID, project.ID); err != ErrProjectMissing {
		t.Fatalf("expected project missing, got %v", err)
	}
	if err := svc.RemoveMember(owner, project.ID, memberUser.ID); err != nil {
		t.Fatal(err)
	}
	if got := svc.SpaceRole(memberUser.ID, project.ID); got != "" {
		t.Fatalf("role after removal = %q, want empty", got)
	}
}

func TestKnowledgeV6TemplatePublishAndCRDT(t *testing.T) {
	_, owner, _, svc := openKnowledgeV6SQLite(t)
	tpl := model.KnowledgeTemplate{
		ID: uuid.New(), Key: "team-demo", Label: "团队模板", Scope: "team",
		OwnerUserID: &owner, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	if err := svc.db.Create(&tpl).Error; err != nil {
		t.Fatal(err)
	}
	published, err := svc.PublishTemplate(owner, tpl.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !published.Published {
		t.Fatal("expected template published")
	}
	if _, err := svc.PublishTemplate(owner, tpl.ID, false); err != nil {
		t.Fatal(err)
	}
	var stored model.KnowledgeTemplate
	svc.db.Where("id = ?", tpl.ID).First(&stored)
	if stored.Published {
		t.Fatal("expected template unpublished")
	}

	// 协同增量：追加后能按 seq 读回。
	docID := uuid.New()
	seq, err := svc.AppendCRDT(docID, owner, "update", []byte{1, 2, 3})
	if err != nil {
		t.Fatal(err)
	}
	if seq <= 0 {
		t.Fatalf("seq = %d, want > 0", seq)
	}
	updates, err := svc.CRDTUpdates(docID, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(updates) != 1 || len(updates[0].Payload) != 3 {
		t.Fatalf("updates = %+v, want one payload of 3 bytes", updates)
	}
}

func TestKnowledgeV6SemanticAndMinutes(t *testing.T) {
	_, owner, project, svc := openKnowledgeV6SQLite(t)
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "季度复盘", "📄")
	if err != nil {
		t.Fatal(err)
	}
	docID := *node.DocumentID
	// 写入正文后建索引。
	if err := svc.db.Exec("UPDATE canvas_documents SET content_text = ? WHERE id = ?",
		"增长来自渠道优化，转化率提升明显。下一步聚焦留存。", docID).Error; err != nil {
		t.Fatal(err)
	}
	count, err := svc.IndexDocChunks(t.Context(), owner, project.ID, docID)
	if err != nil {
		t.Fatal(err)
	}
	if count == 0 {
		t.Fatal("expected at least one chunk")
	}
	hits, err := svc.SemanticSearch(t.Context(), owner, project.ID, "渠道优化", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected semantic hit")
	}

	minutes, err := svc.BuildMeetingMinutes(t.Context(), MeetingInput{
		Title:      "周会",
		Transcript: "# 渠道进展\n张三负责渠道优化，下周完成。\n结论：先做渠道，暂缓投放。\n",
		Attendees:  []string{"张三"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(minutes.Topics) == 0 {
		t.Fatal("expected topics")
	}
	if len(minutes.Actions) == 0 {
		t.Fatal("expected action items")
	}
	if len(minutes.Decisions) == 0 {
		t.Fatal("expected decisions")
	}
}
