package service

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestResolvePresenceEmptyURLUsesMemoryDB(t *testing.T) {
	db := openCollabSQLite(t)
	store, bus, closer, backend := ResolvePresence(db, "  ")
	defer closer()
	if backend != "memory-db" {
		t.Fatalf("backend = %q, want memory-db", backend)
	}
	if PresenceBackend(store) != "memory-db" {
		t.Fatalf("store backend = %q", PresenceBackend(store))
	}
	if bus.Backend() != "local" {
		t.Fatalf("bus backend = %q, want local", bus.Backend())
	}
	doc, user := uuid.New(), uuid.New()
	store.Heartbeat(doc, user, "本地", "", true, "p1")
	users := store.List(doc)
	if len(users) != 1 || users[0].Name != "本地" {
		t.Fatalf("list = %+v", users)
	}
}

func TestResolvePresenceBadRedisFallsBackAndStillRuns(t *testing.T) {
	db := openCollabSQLite(t)
	store, bus, closer, backend := ResolvePresence(db, "redis://127.0.0.1:1/0")
	defer closer()
	if backend != "memory-db" {
		t.Fatalf("backend = %q, want memory-db fallback", backend)
	}
	if bus.Backend() != "local" {
		t.Fatalf("bus backend = %q, want local", bus.Backend())
	}
	doc, user := uuid.New(), uuid.New()
	store.Heartbeat(doc, user, "降级", "", true, "")
	users := store.List(doc)
	if len(users) != 1 || users[0].Name != "降级" {
		t.Fatalf("fallback list = %+v", users)
	}
}

func TestResolvePresenceInvalidURLFallsBack(t *testing.T) {
	db := openCollabSQLite(t)
	_, bus, closer, backend := ResolvePresence(db, "not-a-redis-url")
	defer closer()
	if backend != "memory-db" || bus.Backend() != "local" {
		t.Fatalf("backend=%q bus=%q", backend, bus.Backend())
	}
}

func TestResolvePresenceMiniredisUsesRedisBackend(t *testing.T) {
	db := openCollabSQLite(t)
	mr := miniredis.RunT(t)
	store, bus, closer, backend := ResolvePresence(db, "redis://"+mr.Addr()+"/0")
	defer closer()
	if backend != "redis" || PresenceBackend(store) != "redis" || bus.Backend() != "redis" {
		t.Fatalf("backend=%q store=%q bus=%q", backend, PresenceBackend(store), bus.Backend())
	}
}

func TestRedisPresenceVisibleAcrossStores(t *testing.T) {
	mr := miniredis.RunT(t)
	rdbA := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	rdbB := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdbA.Close(); _ = rdbB.Close() })
	a := &redisPresenceStore{rdb: rdbA}
	b := &redisPresenceStore{rdb: rdbB}
	doc := uuid.New()
	userA, userB := uuid.New(), uuid.New()
	a.Heartbeat(doc, userA, "甲", "", true, "p:1")
	b.Heartbeat(doc, userB, "乙", "", false, "p:2")
	users := a.List(doc)
	if len(users) != 2 {
		t.Fatalf("cross-store list = %+v, want 2", users)
	}
	names := map[string]string{}
	for _, u := range users {
		names[u.Name] = u.Cursor
	}
	if names["甲"] != "p:1" || names["乙"] != "p:2" {
		t.Fatalf("users = %+v", users)
	}
	a.Leave(doc, userA)
	left := b.List(doc)
	if len(left) != 1 || left[0].Name != "乙" {
		t.Fatalf("after leave = %+v", left)
	}
}

func TestRedisPresenceBusCrossInstance(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	a := newRedisInstanceBus(rdb)
	b := newRedisInstanceBus(rdb)
	got := make(chan string, 2)
	b.Start(func(_ uuid.UUID, body []byte) { got <- string(body) })
	a.Start(func(_ uuid.UUID, body []byte) { got <- "self:" + string(body) })
	defer a.Close()
	defer b.Close()

	doc := uuid.New()
	deadline := time.Now().Add(2 * time.Second)
	var received string
	for time.Now().Before(deadline) {
		a.Publish(doc, []byte(`{"type":"awareness","payload":"c1"}`))
		select {
		case received = <-got:
			if received == `{"type":"awareness","payload":"c1"}` {
				return
			}
			if len(received) >= 5 && received[:5] == "self:" {
				t.Fatalf("publisher received its own event: %s", received)
			}
		case <-time.After(50 * time.Millisecond):
		}
	}
	t.Fatalf("timeout waiting for cross-instance awareness, last=%q", received)
}
