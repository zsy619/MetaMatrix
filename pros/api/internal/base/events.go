package base

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BaseEvent 是推送给客户端的业务事件。
//
// 结构与 WebSocket 版本完全一致：后续把 SSE 换成 WS 只换传输层，客户端不变。
type BaseEvent struct {
	EventID    uuid.UUID      `json:"eventId"`
	EventType  string         `json:"eventType"`
	ProjectID  uuid.UUID      `json:"projectId"`
	BaseID     uuid.UUID      `json:"baseId"`
	TableID    *uuid.UUID     `json:"tableId,omitempty"`
	RecordID   *uuid.UUID     `json:"recordId,omitempty"`
	Version    int64          `json:"version,omitempty"`
	OperatorID uuid.UUID      `json:"operatorId,omitempty"`
	Payload    map[string]any `json:"payload,omitempty"`
	Timestamp  time.Time      `json:"timestamp"`
}

// EventHub 负责把已提交的业务事件广播给订阅者。
type EventHub struct {
	mu     sync.RWMutex
	nextID int64
	subs   map[int64]chan BaseEvent
	byProj map[uuid.UUID]map[int64]chan BaseEvent
	closed bool
}

// NewEventHub 创建事件中心。
func NewEventHub() *EventHub {
	return &EventHub{
		subs:   map[int64]chan BaseEvent{},
		byProj: map[uuid.UUID]map[int64]chan BaseEvent{},
	}
}

// Subscribe 订阅某个空间的全部事件。
func (h *EventHub) Subscribe(projectID uuid.UUID) (<-chan BaseEvent, func()) {
	ch := make(chan BaseEvent, 64)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		close(ch)
		return ch, func() {}
	}
	h.nextID++
	id := h.nextID
	h.subs[id] = ch
	if h.byProj[projectID] == nil {
		h.byProj[projectID] = map[int64]chan BaseEvent{}
	}
	h.byProj[projectID][id] = ch
	ObserveSubscriberInc()
	var once sync.Once
	return ch, func() {
		once.Do(func() {
			h.unsubscribe(id)
			ObserveSubscriberDec()
		})
	}
}

func (h *EventHub) unsubscribe(id int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if ch, ok := h.subs[id]; ok {
		delete(h.subs, id)
		close(ch)
		for _, set := range h.byProj {
			delete(set, id)
		}
	}
}

// Publish 广播事件。
func (h *EventHub) Publish(event BaseEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.closed {
		return
	}
	for _, ch := range h.byProj[event.ProjectID] {
		select {
		case ch <- event:
		default:
			// 订阅端消费不过来时丢弃该事件：客户端会通过版本号发现跳跃并重新拉取。
		}
	}
}

// Close 关闭事件中心。
func (h *EventHub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for id, ch := range h.subs {
		close(ch)
		delete(h.subs, id)
	}
	h.byProj = map[uuid.UUID]map[int64]chan BaseEvent{}
}

// StartOutboxPublisher 启动 Outbox 发布器：把已提交事件推送出去并标记已发布。
//
// 这是「事务后广播」的执行端：业务事务只写 outbox，发布器异步读取并广播，
// 保证客户端不会收到「库里还不存在」的事件。
func (s *Service) StartOutboxPublisher(ctx context.Context) {
	// 启动时把水位对齐到「此刻」：历史事件不重放（客户端重连靠 Last-Event-ID 补拉）。
	// 不对齐的话会一次性把整张 outbox 表推给所有订阅者。
	s.advanceOutboxCursor(time.Now(), uuid.New())
	go func() {
		ticker := time.NewTicker(700 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.publishPending(ctx)
			}
		}
	}()
}

func (s *Service) publishPending(ctx context.Context) {
	rows := s.readOutboxSince(ctx, s.outboxCursor(), 200)
	for _, row := range rows {
		// 推进本实例水位：多实例部署时，每个实例各自读全量并推给自己的订阅者，
		// 事件不会因为「被别的实例先标记 published」而漏发。
		s.advanceOutboxCursor(row.CreatedAt, row.ID)
		event := BaseEvent{
			EventID:   row.ID,
			EventType: row.EventType,
			ProjectID: row.ProjectID,
			BaseID:    row.BaseID,
			TableID:   row.TableID,
			Timestamp: row.CreatedAt,
		}
		if row.AggregateID != uuid.Nil {
			id := row.AggregateID
			event.RecordID = &id
		}
		if len(row.Payload) > 0 {
			_ = json.Unmarshal(row.Payload, &event.Payload)
		}
		if event.Payload != nil {
			// 兜底：SSE 只广播「哪些字段变了」，绝不广播字段值。
			// 字段值可能落在被隐藏 / 只读字段上，广播出去会绕过字段级权限策略。
			delete(event.Payload, "fields")
			if v, ok := event.Payload["version"].(float64); ok {
				event.Version = int64(v)
			}
		}
		s.events.Publish(event)
		ObserveOutboxPublished()
		now := time.Now()
		if row.Status == OutboxStatusPending {
			if err := s.db.WithContext(ctx).Model(&BaseEventOutbox{}).
				Where("id = ? AND status = ?", row.ID, OutboxStatusPending).
				Updates(map[string]any{"status": OutboxStatusPublished, "published_at": now}).Error; err != nil {
				log.Printf("base outbox publish failed: %v", err)
				ObserveOutboxFailed()
				// 标记失败：累计重试次数，超出上限进入死信队列。
				s.markOutboxFailed(ctx, row.ID)
			}
		}
	}
}

// Outbox 事件状态。
const (
	// OutboxStatusPending 待发布。
	OutboxStatusPending = "pending"
	// OutboxStatusPublished 已发布。
	OutboxStatusPublished = "published"
	// OutboxStatusDead 死信：重试次数超限，不再自动投递。
	OutboxStatusDead = "dead"
)

// markOutboxFailed 记录一次发布失败。
//
// 重试次数超过上限时把事件转入死信队列：
//   - 死信事件不再自动投递（避免无限重试把发布器拖垮）；
//   - 运维可以在 /base/metrics 与死信列表里看到它们，人工重投或直接清理。
func (s *Service) markOutboxFailed(ctx context.Context, eventID uuid.UUID) {
	maxRetries := s.MaintenanceConfig().OutboxMaxRetries
	res := s.db.WithContext(ctx).Model(&BaseEventOutbox{}).
		Where("id = ? AND status = ?", eventID, OutboxStatusPending).
		Updates(map[string]any{
			"status":      OutboxStatusPending,
			"retry_count": gorm.Expr("retry_count + 1"),
		})
	if res.Error != nil {
		return
	}
	var row BaseEventOutbox
	if err := s.db.WithContext(ctx).Select("retry_count").Where("id = ?", eventID).First(&row).Error; err != nil {
		return
	}
	if row.RetryCount >= maxRetries {
		if err := s.db.WithContext(ctx).Model(&BaseEventOutbox{}).
			Where("id = ? AND status = ?", eventID, OutboxStatusPending).
			Update("status", OutboxStatusDead).Error; err == nil {
			ObserveOutboxDead()
			log.Printf("base outbox dead letter: event %s exceeded %d retries", eventID, maxRetries)
		}
	}
}

// readOutboxSince 读取水位之后的事件。
func (s *Service) readOutboxSince(ctx context.Context, cursor outboxCursor, limit int) []BaseEventOutbox {
	var rows []BaseEventOutbox
	q := s.db.WithContext(ctx).Order("created_at ASC, id ASC").Limit(limit)
	if cursor.Time.IsZero() {
		if err := q.Find(&rows).Error; err != nil {
			return nil
		}
		return rows
	}
	// 同一时刻可能有多个事件（created_at 精度到微秒，仍可能撞车），
	// 因此水位是「时间 + ID」二元组：时间相同时按 ID 继续往后走。
	if err := q.Where("created_at > ? OR (created_at = ? AND id > ?)",
		cursor.Time, cursor.Time, cursor.ID).Find(&rows).Error; err != nil {
		return nil
	}
	return rows
}

// outboxCursor 是本实例的事件读取水位。
type outboxCursor struct {
	Time time.Time
	ID   uuid.UUID
}

// outboxCursor 取当前水位。
func (s *Service) outboxCursor() outboxCursor {
	s.outboxMu.Lock()
	defer s.outboxMu.Unlock()
	return s.outboxAt
}

// advanceOutboxCursor 推进水位。
func (s *Service) advanceOutboxCursor(createdAt time.Time, id uuid.UUID) {
	s.outboxMu.Lock()
	defer s.outboxMu.Unlock()
	if createdAt.After(s.outboxAt.Time) ||
		(createdAt.Equal(s.outboxAt.Time) && id.String() > s.outboxAt.ID.String()) {
		s.outboxAt = outboxCursor{Time: createdAt, ID: id}
	}
}

// ReplaySince 回放 lastEventID 之后的事件（断线补拉）。
//
// 客户端在 SSE 帧里记住最后一个 eventId，重连时带上 `Last-Event-ID`，
// 服务端把这段窗口内错过的事件按顺序补发，避免「断线期间别人改了数据，
// 自己这边一直看着旧值」——事件体只带字段 ID 不带值，补发不会泄露内容。
func (s *Service) ReplaySince(ctx context.Context, projectID uuid.UUID, lastEventID string, limit int) ([]BaseEvent, error) {
	lastEventID = strings.TrimSpace(lastEventID)
	if lastEventID == "" {
		return nil, nil
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var anchor BaseEventOutbox
	if err := s.db.WithContext(ctx).
		Where("id = ? AND project_id = ?", lastEventID, projectID).
		First(&anchor).Error; err != nil {
		// 锚点不在库里（被清理 / 跨空间）：不补发，客户端会走一次全量刷新。
		return nil, nil
	}
	var rows []BaseEventOutbox
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND created_at > ?", projectID, anchor.CreatedAt).
		Order("created_at ASC, id ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BaseEvent, 0, len(rows))
	for _, row := range rows {
		event := BaseEvent{
			EventID:   row.ID,
			EventType: row.EventType,
			ProjectID: row.ProjectID,
			BaseID:    row.BaseID,
			TableID:   row.TableID,
			Timestamp: row.CreatedAt,
			Payload:   map[string]any{},
		}
		if len(row.Payload) > 0 {
			_ = json.Unmarshal(row.Payload, &event.Payload)
		}
		// 兜底：补发也不带字段值。
		delete(event.Payload, "fields")
		if v, ok := event.Payload["version"].(float64); ok {
			event.Version = int64(v)
		}
		if row.AggregateID != uuid.Nil {
			id := row.AggregateID
			event.RecordID = &id
		}
		out = append(out, event)
	}
	return out, nil
}

// ReplaySinceTime 回放某个时间水位之后的事件（增量同步）。
//
// 与 ReplaySince 的区别：客户端不需要记住事件 ID，只要给一个时间点
// （例如「上次同步到的时刻」）就能拿到增量；适合「定时拉取增量」的场景。
func (s *Service) ReplaySinceTime(ctx context.Context, projectID uuid.UUID, since time.Time, limit int) ([]BaseEvent, error) {
	if since.IsZero() {
		return nil, nil
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var rows []BaseEventOutbox
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND created_at > ?", projectID, since).
		Order("created_at ASC, id ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BaseEvent, 0, len(rows))
	for _, row := range rows {
		event := BaseEvent{
			EventID:   row.ID,
			EventType: row.EventType,
			ProjectID: row.ProjectID,
			BaseID:    row.BaseID,
			TableID:   row.TableID,
			Timestamp: row.CreatedAt,
			Payload:   map[string]any{},
		}
		if len(row.Payload) > 0 {
			_ = json.Unmarshal(row.Payload, &event.Payload)
		}
		delete(event.Payload, "fields")
		if v, ok := event.Payload["version"].(float64); ok {
			event.Version = int64(v)
		}
		if row.AggregateID != uuid.Nil {
			id := row.AggregateID
			event.RecordID = &id
		}
		out = append(out, event)
	}
	return out, nil
}
