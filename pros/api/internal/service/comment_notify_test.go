package service

import (
	"testing"
	"time"

	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

func TestCommentNotifyWritesInAppAndMailAndDegradesWithoutSMTP(t *testing.T) {
	db, owner, project, svc := openKnowledgeV2SQLite(t)
	author := uuid.New()
	mentioned := uuid.New()
	now := time.Now().UTC()
	for _, u := range []struct {
		id    uuid.UUID
		email string
	}{
		{owner, "owner@notify.test"},
		{author, "author@notify.test"},
		{mentioned, "mention@notify.test"},
	} {
		if err := db.Create(&model.User{
			ID: u.id, Email: u.email, PasswordHash: "x", CreatedAt: now, UpdatedAt: now,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "周报", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&knowledgeMemberSQLite{}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetMemberRole(owner, project.ID, author, SpaceRoleEditor); err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	svc.SetMailSender(rec)

	comment, err := svc.AddCommentDetailed(author, *node.DocumentID, nil, "", "请看这段", -1, -1, []string{mentioned.String()}, nil, -1)
	if err != nil {
		t.Fatal(err)
	}

	notes, err := svc.ListNotifications(owner, false, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 || notes[0].Kind != "comment" || notes[0].CommentID == nil || *notes[0].CommentID != comment.ID {
		t.Fatalf("owner notes = %+v", notes)
	}
	mentions, err := svc.ListNotifications(mentioned, true, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(mentions) != 1 || mentions[0].Kind != "mention" {
		t.Fatalf("mention notes = %+v", mentions)
	}
	self, err := svc.ListNotifications(author, false, 20)
	if err != nil || len(self) != 0 {
		t.Fatalf("author should not be notified, got %+v err=%v", self, err)
	}
	if len(rec.messages) != 2 {
		t.Fatalf("mail = %d, want 2 (owner + mention); %v", len(rec.messages), rec.messages)
	}

	reply, err := svc.AddCommentDetailed(author, *node.DocumentID, &comment.ID, "", "收到", -1, -1, nil, nil, -1)
	if err != nil {
		t.Fatal(err)
	}
	_ = reply
	// 回复：作者是 author，原评论作者也是 author，不应给自己发；owner 再收一条 comment。
	ownerAll, err := svc.ListNotifications(owner, false, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(ownerAll) != 2 {
		t.Fatalf("owner after reply = %d, want 2", len(ownerAll))
	}

	if err := svc.MarkNotificationRead(owner, notes[0].ID); err != nil {
		t.Fatal(err)
	}
	unread, err := svc.ListNotifications(owner, true, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(unread) != 1 {
		t.Fatalf("unread after mark = %d, want 1", len(unread))
	}

	// SMTP 未配置时评论写入仍成功，站内通知仍落库。
	svc2 := NewKnowledgeService(db)
	svc2.SetMailSender(mail.DisabledSender{})
	if _, err := svc2.AddCommentDetailed(author, *node.DocumentID, nil, "", "没有邮件也要记下", -1, -1, nil, nil, -1); err != nil {
		t.Fatalf("comment write failed without SMTP: %v", err)
	}
	after, err := svc2.ListNotifications(owner, false, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 3 {
		t.Fatalf("in-app after disabled mail = %d, want 3", len(after))
	}
}

func TestCommentNotifyIsIdempotentPerUserAndComment(t *testing.T) {
	db, owner, project, svc := openKnowledgeV2SQLite(t)
	author := uuid.New()
	now := time.Now().UTC()
	for _, u := range []struct {
		id    uuid.UUID
		email string
	}{
		{owner, "owner@idem.test"},
		{author, "author@idem.test"},
	} {
		if err := db.Create(&model.User{
			ID: u.id, Email: u.email, PasswordHash: "x", CreatedAt: now, UpdatedAt: now,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	node, err := svc.CreateDocWithNode(owner, project.ID, nil, "幂等", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&knowledgeMemberSQLite{}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetMemberRole(owner, project.ID, author, SpaceRoleEditor); err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	svc.SetMailSender(rec)
	svc.mailRetryWait = -1
	comment, err := svc.AddCommentDetailed(author, *node.DocumentID, nil, "", "只通知一次", -1, -1, nil, nil, -1)
	if err != nil {
		t.Fatal(err)
	}
	svc.notifyNewComment(comment)
	notes, err := svc.ListNotifications(owner, false, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 {
		t.Fatalf("notes = %d, want 1 after replay", len(notes))
	}
	if len(rec.messages) != 1 {
		t.Fatalf("mail = %d, want 1 after replay", len(rec.messages))
	}
}
