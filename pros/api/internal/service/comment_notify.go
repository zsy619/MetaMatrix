package service

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

// SetMailSender 注入评论通知用的邮件通道。未配置时邮件路记日志并跳过，不影响站内通知。
func (s *KnowledgeService) SetMailSender(sender mail.Sender) {
	s.mail = sender
}

func (s *KnowledgeService) notifyNewComment(comment *model.DocComment) {
	if comment == nil {
		return
	}
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("comment notify panic: %v", rec)
		}
	}()
	title := s.documentTitle(comment.DocID)
	kindFor := func(userID uuid.UUID) string {
		if comment.ParentID != nil {
			var parent model.DocComment
			if err := s.db.Where("id = ?", *comment.ParentID).First(&parent).Error; err == nil && parent.AuthorUserID == userID {
				return "reply"
			}
		}
		for _, m := range strings.Split(comment.Mentions, ",") {
			if strings.TrimSpace(m) == userID.String() {
				return "mention"
			}
		}
		return "comment"
	}
	for _, userID := range s.commentRecipients(comment) {
		if userID == comment.AuthorUserID {
			continue
		}
		kind := kindFor(userID)
		body := strings.TrimSpace(comment.Content)
		if utf8.RuneCountInString(body) > 200 {
			body = string([]rune(body)[:200])
		}
		n := model.UserNotification{
			ID:        uuid.New(),
			UserID:    userID,
			ActorID:   comment.AuthorUserID,
			DocID:     &comment.DocID,
			CommentID: &comment.ID,
			Kind:      kind,
			Title:     notifyTitle(kind, title),
			Body:      body,
			CreatedAt: time.Now().UTC(),
		}
		if err := s.db.Create(&n).Error; err != nil {
			log.Printf("in-app comment notification skipped: %v", err)
			continue
		}
		s.deliverCommentMail(userID, n.Title, body)
	}
}

func notifyTitle(kind, docTitle string) string {
	if strings.TrimSpace(docTitle) == "" {
		docTitle = "文档"
	}
	switch kind {
	case "reply":
		return "有人回复了你在《" + docTitle + "》中的评论"
	case "mention":
		return "有人在《" + docTitle + "》中提到了你"
	default:
		return "《" + docTitle + "》有新评论"
	}
}

func (s *KnowledgeService) documentTitle(docID uuid.UUID) string {
	var doc model.CanvasDocument
	if err := s.db.Select("id", "title").Where("id = ?", docID).First(&doc).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(doc.Title)
}

func (s *KnowledgeService) commentRecipients(comment *model.DocComment) []uuid.UUID {
	seen := map[uuid.UUID]struct{}{}
	add := func(id uuid.UUID) {
		if id == uuid.Nil {
			return
		}
		seen[id] = struct{}{}
	}
	var doc model.CanvasDocument
	if err := s.db.Select("id", "owner_user_id").Where("id = ?", comment.DocID).First(&doc).Error; err == nil {
		add(doc.OwnerUserID)
	}
	if comment.ParentID != nil {
		var parent model.DocComment
		if err := s.db.Where("id = ?", *comment.ParentID).First(&parent).Error; err == nil {
			add(parent.AuthorUserID)
		}
	}
	for _, raw := range strings.Split(comment.Mentions, ",") {
		id, err := uuid.Parse(strings.TrimSpace(raw))
		if err == nil {
			add(id)
		}
	}
	out := make([]uuid.UUID, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	return out
}

func (s *KnowledgeService) deliverCommentMail(userID uuid.UUID, subject, body string) {
	if s.mail == nil {
		log.Printf("comment mail skipped: transport not set; in-app notification kept")
		return
	}
	var user model.User
	if err := s.db.Select("id", "email").Where("id = ?", userID).First(&user).Error; err != nil {
		return
	}
	email := strings.TrimSpace(user.Email)
	if email == "" {
		return
	}
	err := s.mail.Send(context.Background(), mail.Message{
		To:      email,
		Subject: subject,
		Text:    body,
	})
	if err == nil {
		return
	}
	if errors.Is(err, mail.ErrNotConfigured) {
		log.Printf("comment mail skipped: SMTP not configured; in-app notification kept")
		return
	}
	log.Printf("comment mail skipped: %v; in-app notification kept", err)
}

// ListNotifications 列出当前用户的站内通知，新的在前。
func (s *KnowledgeService) ListNotifications(userID uuid.UUID, unreadOnly bool, limit int) ([]model.UserNotification, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := s.db.Where("user_id = ?", userID)
	if unreadOnly {
		q = q.Where("read_at IS NULL")
	}
	var rows []model.UserNotification
	err := q.Order("created_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// MarkNotificationRead 把一条属于当前用户的通知标为已读。
func (s *KnowledgeService) MarkNotificationRead(userID, id uuid.UUID) error {
	now := time.Now().UTC()
	res := s.db.Model(&model.UserNotification{}).
		Where("id = ? AND user_id = ? AND read_at IS NULL", id, userID).
		Update("read_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		var n int64
		if err := s.db.Model(&model.UserNotification{}).Where("id = ? AND user_id = ?", id, userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return ErrNodeNotFound
		}
	}
	return nil
}
