package base

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
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
	return ch, func() { h.unsubscribe(id) }
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
	var rows []BaseEventOutbox
	if err := s.db.WithContext(ctx).
		Where("status = ?", "pending").
		Order("created_at ASC").
		Limit(200).
		Find(&rows).Error; err != nil {
		return
	}
	for _, row := range rows {
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
		now := time.Now()
		if err := s.db.WithContext(ctx).Model(&BaseEventOutbox{}).
			Where("id = ? AND status = ?", row.ID, "pending").
			Updates(map[string]any{"status": "published", "published_at": now}).Error; err != nil {
			log.Printf("base outbox publish failed: %v", err)
		}
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
