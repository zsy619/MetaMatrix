package service

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	presenceRedisPrefix = "kb:presence:"
	collabBusChannel    = "kb:collab:presence"
)

func redisPresenceKey(docID, userID uuid.UUID) string {
	return presenceRedisPrefix + docID.String() + ":" + userID.String()
}

type redisPresenceRecord struct {
	UserID   string    `json:"userId"`
	Name     string    `json:"name"`
	Avatar   string    `json:"avatar"`
	Editing  bool      `json:"editing"`
	Cursor   string    `json:"cursor"`
	LastSeen time.Time `json:"lastSeen"`
}

type redisPresenceStore struct {
	rdb      *redis.Client
	fallback PresenceStore
}

func (s *redisPresenceStore) Backend() string { return "redis" }

func (s *hybridPresenceStore) Backend() string { return "memory-db" }

// PresenceBackend 返回存储实现名，便于启动日志与测试断言。未知实现视为内存+表。
func PresenceBackend(store PresenceStore) string {
	if s, ok := store.(interface{ Backend() string }); ok && s.Backend() != "" {
		return s.Backend()
	}
	return "memory-db"
}

func openPresenceRedis(redisURL string) (*redis.Client, error) {
	opt, err := redis.ParseURL(strings.TrimSpace(redisURL))
	if err != nil {
		return nil, err
	}
	opt.DialTimeout = 800 * time.Millisecond
	opt.ReadTimeout = 800 * time.Millisecond
	opt.WriteTimeout = 800 * time.Millisecond
	opt.MaxRetries = 0
	return redis.NewClient(opt), nil
}

// InstanceBus 把短暂的 presence / awareness 事件传到其他 API 实例。
// 没有 Redis 时是本机空总线；Redis 只做 pub/sub，不是文档持久化。
type InstanceBus interface {
	Publish(docID uuid.UUID, body []byte)
	Start(handler func(docID uuid.UUID, body []byte))
	Close()
	Backend() string
}

type localInstanceBus struct{}

// NewLocalInstanceBus 返回同实例空总线：Publish / Start 都是空操作。
func NewLocalInstanceBus() InstanceBus { return localInstanceBus{} }

func (localInstanceBus) Publish(uuid.UUID, []byte)     {}
func (localInstanceBus) Start(func(uuid.UUID, []byte)) {}
func (localInstanceBus) Close()                        {}
func (localInstanceBus) Backend() string               { return "local" }

type busEnvelope struct {
	Origin string          `json:"origin"`
	DocID  string          `json:"docId"`
	Body   json.RawMessage `json:"body"`
}

type redisInstanceBus struct {
	rdb    *redis.Client
	origin string
	cancel context.CancelFunc
}

func newRedisInstanceBus(rdb *redis.Client) *redisInstanceBus {
	return &redisInstanceBus{rdb: rdb, origin: uuid.New().String()}
}

func (b *redisInstanceBus) Backend() string { return "redis" }

func (b *redisInstanceBus) Publish(docID uuid.UUID, body []byte) {
	if b == nil || b.rdb == nil || len(body) == 0 {
		return
	}
	env, err := json.Marshal(busEnvelope{Origin: b.origin, DocID: docID.String(), Body: body})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := b.rdb.Publish(ctx, collabBusChannel, env).Err(); err != nil {
		log.Printf("presence redis publish failed: %v", err)
	}
}

func (b *redisInstanceBus) Start(handler func(docID uuid.UUID, body []byte)) {
	if b == nil || b.rdb == nil || handler == nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	b.cancel = cancel
	pubsub := b.rdb.Subscribe(ctx, collabBusChannel)
	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var env busEnvelope
				if err := json.Unmarshal([]byte(msg.Payload), &env); err != nil {
					continue
				}
				if env.Origin == b.origin {
					continue
				}
				docID, err := uuid.Parse(env.DocID)
				if err != nil {
					continue
				}
				handler(docID, env.Body)
			}
		}
	}()
}

func (b *redisInstanceBus) Close() {
	if b != nil && b.cancel != nil {
		b.cancel()
	}
}

// ResolvePresence 按 REDIS_URL 选择 presence 后端与跨实例总线。
// 未配置或连不上时退回内存+kb_presence 与本机总线，进程仍能启动。
// Redis 只承担短暂在线状态和光标广播，不是文档或 Yjs 持久化。
func ResolvePresence(db *gorm.DB, redisURL string) (store PresenceStore, bus InstanceBus, closer func(), backend string) {
	hybrid := newHybridPresenceStore(db)
	local := NewLocalInstanceBus()
	closer = func() {}
	redisURL = strings.TrimSpace(redisURL)
	if redisURL == "" {
		return hybrid, local, closer, "memory-db"
	}
	rdb, err := openPresenceRedis(redisURL)
	if err != nil {
		log.Printf("presence redis disabled (url): %v; falling back to same-instance memory+kb_presence", err)
		return hybrid, local, closer, "memory-db"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		log.Printf("presence redis disabled (ping): %v; falling back to same-instance memory+kb_presence", err)
		return hybrid, local, closer, "memory-db"
	}
	store = &redisPresenceStore{rdb: rdb, fallback: hybrid}
	busImpl := newRedisInstanceBus(rdb)
	closer = func() {
		busImpl.Close()
		if err := rdb.Close(); err != nil {
			log.Printf("presence redis close: %v", err)
		}
	}
	return store, busImpl, closer, "redis"
}

func (s *redisPresenceStore) Heartbeat(docID, userID uuid.UUID, name, avatar string, editing bool, cursor string) {
	rec := redisPresenceRecord{
		UserID: userID.String(), Name: name, Avatar: avatar,
		Editing: editing, Cursor: cursor, LastSeen: time.Now().UTC(),
	}
	raw, err := json.Marshal(rec)
	if err != nil {
		if s.fallback != nil {
			s.fallback.Heartbeat(docID, userID, name, avatar, editing, cursor)
		}
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := s.rdb.Set(ctx, redisPresenceKey(docID, userID), raw, presenceTTL).Err(); err != nil {
		log.Printf("presence redis heartbeat failed: doc=%s user=%s err=%v", docID, userID, err)
		if s.fallback != nil {
			s.fallback.Heartbeat(docID, userID, name, avatar, editing, cursor)
		}
	}
}

func (s *redisPresenceStore) Leave(docID, userID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := s.rdb.Del(ctx, redisPresenceKey(docID, userID)).Err(); err != nil {
		log.Printf("presence redis leave failed: doc=%s user=%s err=%v", docID, userID, err)
	}
	if s.fallback != nil {
		s.fallback.Leave(docID, userID)
	}
}

func (s *redisPresenceStore) List(docID uuid.UUID) []PresenceUser {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	pattern := presenceRedisPrefix + docID.String() + ":*"
	var keys []string
	iter := s.rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		log.Printf("presence redis list failed: doc=%s err=%v", docID, err)
		if s.fallback != nil {
			return s.fallback.List(docID)
		}
		return []PresenceUser{}
	}
	if len(keys) == 0 {
		return []PresenceUser{}
	}
	vals, err := s.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		if s.fallback != nil {
			return s.fallback.List(docID)
		}
		return []PresenceUser{}
	}
	out := make([]PresenceUser, 0, len(vals))
	for _, v := range vals {
		raw, ok := v.(string)
		if !ok || raw == "" {
			continue
		}
		var rec redisPresenceRecord
		if err := json.Unmarshal([]byte(raw), &rec); err != nil {
			continue
		}
		out = append(out, PresenceUser{
			UserID: rec.UserID, Name: rec.Name, Avatar: rec.Avatar,
			Editing: rec.Editing, Cursor: rec.Cursor, LastSeen: rec.LastSeen,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].LastSeen.Equal(out[j].LastSeen) {
			return out[i].LastSeen.After(out[j].LastSeen)
		}
		return out[i].UserID < out[j].UserID
	})
	return out
}
