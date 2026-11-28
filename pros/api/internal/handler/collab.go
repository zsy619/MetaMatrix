package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
	"github.com/hertz-contrib/websocket"
)

// collabBackend 是协同 handler 依赖的服务面，便于鉴权测试注入桩实现。
type collabBackend interface {
	Authorize(userID, docID uuid.UUID) (*service.CollabAccess, error)
	Append(ownerID, docID, authorID uuid.UUID, in service.CollabOperationInput) (*service.CollabOperation, error)
	List(ownerID, docID uuid.UUID, after int64, limit int) ([]service.CollabOperation, error)
	Heartbeat(ownerID, docID uuid.UUID, editing bool, cursor string) error
	ListPresence(ownerID, docID uuid.UUID) ([]service.PresenceUser, error)
	Leave(ownerID, docID uuid.UUID) error
}

// CollabHandler 提供正文协同的 HTTP 操作日志与 Hertz WebSocket 通道。
type collabBus interface {
	Publish(docID uuid.UUID, body []byte)
	Start(handler func(docID uuid.UUID, body []byte))
	Close()
}

type CollabHandler struct {
	svc    collabBackend
	secret string
	hub    *collabHub
	bus    collabBus
}

func NewCollabHandler(svc collabBackend, secret string) *CollabHandler {
	return &CollabHandler{svc: svc, secret: secret, hub: newCollabHub()}
}

// SetBus 接入可选的跨实例总线。未设置时 presence / awareness 只在本实例广播。
func (h *CollabHandler) SetBus(bus collabBus) {
	if bus == nil {
		return
	}
	h.bus = bus
	bus.Start(h.onRemoteCollabEvent)
}

func (h *CollabHandler) onRemoteCollabEvent(docID uuid.UUID, body []byte) {
	var msg wsOut
	if err := json.Unmarshal(body, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "presence", "awareness", "awareness-sync", "awareness-leave":
		h.hub.broadcast(docID, nil, msg)
	}
}

func (h *CollabHandler) broadcastLocalAndRemote(docID uuid.UUID, except *collabClient, msg wsOut) {
	h.hub.broadcast(docID, except, msg)
	if h.bus == nil {
		return
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.bus.Publish(docID, raw)
}

type appendOperationBody struct {
	Kind    string `json:"kind"`
	Payload string `json:"payload"`
	HTML    string `json:"html"`
}

type operationJSON struct {
	Seq          int64  `json:"seq"`
	Kind         string `json:"kind"`
	Payload      string `json:"payload"`
	AuthorUserID string `json:"authorUserId"`
	SaveVersion  int64  `json:"saveVersion"`
}

func toOperationJSON(op service.CollabOperation) operationJSON {
	return operationJSON{
		Seq:          op.Seq,
		Kind:         op.Kind,
		Payload:      base64.StdEncoding.EncodeToString(op.Payload),
		AuthorUserID: op.AuthorUserID.String(),
		SaveVersion:  op.SaveVersion,
	}
}

// ListOperations GET /documents/:id/operations?after=
func (h *CollabHandler) ListOperations(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	after, _ := strconv.ParseInt(string(c.Query("after")), 10, 64)
	rows, err := h.svc.List(uid, docID, after, 0)
	if handleCollabErr(c, err) {
		return
	}
	out := make([]operationJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, toOperationJSON(row))
	}
	c.JSON(http.StatusOK, out)
}

// AppendOperation POST /documents/:id/operations
func (h *CollabHandler) AppendOperation(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body appendOperationBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid operation payload")
		return
	}
	raw, err := base64.StdEncoding.DecodeString(body.Payload)
	if err != nil || len(raw) == 0 {
		BadRequest(c, "payload must be non-empty base64")
		return
	}
	op, err := h.svc.Append(uid, docID, uid, service.CollabOperationInput{
		Kind:    body.Kind,
		Payload: raw,
		HTML:    body.HTML,
	})
	if handleCollabErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, toOperationJSON(*op))
}

func (h *CollabHandler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
	}
	return uid, ok
}

func handleCollabErr(c *app.RequestContext, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, service.ErrDocumentNotFound):
		NotFound(c, "document not found")
	case errors.Is(err, service.ErrValidation):
		Fail(c, http.StatusBadRequest, "validation failed", "validation_error")
	case errors.Is(err, service.ErrCollabReadOnly), errors.Is(err, service.ErrSpaceForbidden):
		Forbidden(c, "collab room is read-only")
	case errors.Is(err, service.ErrBlockPermission):
		Forbidden(c, "no permission to edit this block")
	case errors.Is(err, service.ErrSaveConflict):
		Conflict(c, err.Error(), nil)
	default:
		log.Printf("collab error: %v", err)
		Internal(c, "request failed")
	}
	return true
}

var collabUpgrader = websocket.HertzUpgrader{
	// 协同通道靠 JWT 鉴权，开发与同源部署下放行 Origin；生产可再收紧。
	CheckOrigin: func(ctx *app.RequestContext) bool { return true },
}

// ServeWS GET /documents/:id/collab 升级为协同 WebSocket。
// 鉴权接受 Bearer 或 query token，校验通过后再 Upgrade。
func (h *CollabHandler) ServeWS(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.AuthenticateToken(h.secret, middleware.TokenFromRequest(c))
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	access, err := h.svc.Authorize(uid, docID)
	if handleCollabErr(c, err) {
		return
	}
	_ = h.svc.Heartbeat(uid, docID, true, "")

	err = collabUpgrader.Upgrade(c, func(conn *websocket.Conn) {
		defer conn.Close()
		client := &collabClient{conn: conn, docID: docID, userID: uid, canWrite: access.CanWrite, role: access.Role}
		h.hub.add(client)
		defer h.depart(client)

		_ = client.writeJSON(wsOut{Type: "hello", CanWrite: boolPtr(access.CanWrite), Role: access.Role})

		if ops, err := h.svc.List(uid, docID, 0, 0); err == nil {
			payload := wsOut{Type: "ops", Ops: make([]operationJSON, 0, len(ops))}
			for _, op := range ops {
				payload.Ops = append(payload.Ops, toOperationJSON(op))
			}
			_ = client.writeJSON(payload)
		}
		if users, err := h.svc.ListPresence(uid, docID); err == nil {
			_ = client.writeJSON(wsOut{Type: "presence", Users: users})
		}
		// 请房间里已有连接再发一遍自己的 awareness，让新进房的人立刻看到光标。
		h.broadcastLocalAndRemote(docID, client, wsOut{Type: "awareness-sync"})

		done := make(chan struct{})
		defer close(done)
		go h.keepCollabAlive(client, done)

		conn.SetReadLimit(maxCollabPayloadJSON)
		_ = conn.SetReadDeadline(time.Now().Add(collabPongWait))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(collabPongWait))
		})
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(collabPongWait))
			h.handleWSMessage(client, message)
		}
	})
	if err != nil {
		log.Printf("collab websocket upgrade: %v", err)
	}
}

const maxCollabPayloadJSON = (4 << 20) + 4096
const maxAwarenessPayload = 64 << 10

type wsIn struct {
	Type    string `json:"type"`
	Kind    string `json:"kind"`
	After   int64  `json:"after"`
	Payload string `json:"payload"`
	HTML    string `json:"html"`
	Editing *bool  `json:"editing"`
	Cursor  string `json:"cursor"`
}

type wsOut struct {
	Type     string                 `json:"type"`
	Ops      []operationJSON        `json:"ops,omitempty"`
	Op       *operationJSON         `json:"op,omitempty"`
	Users    []service.PresenceUser `json:"users,omitempty"`
	Message  string                 `json:"message,omitempty"`
	Seq      int64                  `json:"seq,omitempty"`
	// canWrite 必须能发出 false：omitempty 会把「已收回写权限」丢掉，前端会误当成仍可写。
	CanWrite *bool                  `json:"canWrite,omitempty"`
	Role     string                 `json:"role,omitempty"`
	Payload  string                 `json:"payload,omitempty"`
	UserID   string                 `json:"userId,omitempty"`
}

func (h *CollabHandler) handleWSMessage(client *collabClient, message []byte) {
	var in wsIn
	if err := json.Unmarshal(message, &in); err != nil {
		_ = client.writeJSON(wsOut{Type: "error", Message: "invalid message"})
		return
	}
	switch in.Type {
	case "ping":
		if !h.enforceAccess(client) {
			return
		}
		_ = client.writeJSON(wsOut{Type: "pong"})
		_ = h.svc.Heartbeat(client.userID, client.docID, true, in.Cursor)
	case "sync":
		ops, err := h.svc.List(client.userID, client.docID, in.After, 0)
		if err != nil {
			_ = client.writeJSON(wsOut{Type: "error", Message: "sync failed"})
			return
		}
		out := wsOut{Type: "ops", Ops: make([]operationJSON, 0, len(ops))}
		for _, op := range ops {
			out.Ops = append(out.Ops, toOperationJSON(op))
		}
		_ = client.writeJSON(out)
	case "update":
		if !h.enforceAccess(client) {
			return
		}
		raw, err := base64.StdEncoding.DecodeString(in.Payload)
		if err != nil || len(raw) == 0 {
			_ = client.writeJSON(wsOut{Type: "error", Message: "payload must be non-empty base64"})
			return
		}
		op, err := h.svc.Append(client.userID, client.docID, client.userID, service.CollabOperationInput{
			Kind:    in.Kind,
			Payload: raw,
			HTML:    in.HTML,
		})
		if err != nil {
			if isCollabWriteDenied(err) {
				h.revokeAndKick(client, "collab room is read-only")
				return
			}
			_ = client.writeJSON(wsOut{Type: "error", Message: "append failed"})
			return
		}
		msg := wsOut{Type: "update", Op: ptrOp(toOperationJSON(*op)), Seq: op.Seq}
		h.hub.broadcast(client.docID, client, msg)
	case "presence":
		editing := true
		if in.Editing != nil {
			editing = *in.Editing
		}
		if err := h.svc.Heartbeat(client.userID, client.docID, editing, in.Cursor); err != nil {
			_ = client.writeJSON(wsOut{Type: "error", Message: "presence failed"})
			return
		}
		if users, err := h.svc.ListPresence(client.userID, client.docID); err == nil {
			h.broadcastLocalAndRemote(client.docID, nil, wsOut{Type: "presence", Users: users})
		}
	case "awareness":
		// awareness 是短暂的光标/选区状态，不落库；浏览者也可以上报，以便别人看见只读光标。
		raw, err := base64.StdEncoding.DecodeString(in.Payload)
		if err != nil || len(raw) == 0 || len(raw) > maxAwarenessPayload {
			_ = client.writeJSON(wsOut{Type: "error", Message: "payload must be non-empty base64"})
			return
		}
		h.broadcastLocalAndRemote(client.docID, client, wsOut{Type: "awareness", Payload: in.Payload})
	case "awareness-sync":
		h.broadcastLocalAndRemote(client.docID, client, wsOut{Type: "awareness-sync"})
	default:
		_ = client.writeJSON(wsOut{Type: "error", Message: "unknown type"})
	}
}

func ptrOp(op operationJSON) *operationJSON { return &op }

type collabClient struct {
	conn     *websocket.Conn
	docID    uuid.UUID
	userID   uuid.UUID
	canWrite bool
	role     string
	kicked   bool
	mu       sync.Mutex
	// writeFn 便于单测注入，不经过真实 WebSocket。
	writeFn func(v any) error
	// closeFn 便于单测注入关闭；生产环境关闭底层连接，打断 ReadMessage。
	closeFn func()
}

func boolPtr(v bool) *bool { return &v }

func canWriteOf(msg wsOut) bool {
	return msg.CanWrite != nil && *msg.CanWrite
}

func (c *collabClient) closeConn() {
	c.mu.Lock()
	if c.kicked {
		c.mu.Unlock()
		return
	}
	c.kicked = true
	closeFn := c.closeFn
	conn := c.conn
	c.mu.Unlock()
	if closeFn != nil {
		closeFn()
		return
	}
	if conn != nil {
		_ = conn.Close()
	}
}

// enforceAccess 在写入或心跳时重新鉴权。
// 写权限被收回，或鉴权失败时：通知前端立刻只读，并关掉已建立的套接字（不只拒绝这一次 update）。
// 本来就是浏览者的连接保持打开，以便继续收增量。
func (h *CollabHandler) enforceAccess(client *collabClient) bool {
	wasWrite := client.canWrite
	err := h.refreshWriteAccess(client)
	if err != nil {
		h.revokeAndKick(client, "collab access revoked")
		return false
	}
	if wasWrite && !client.canWrite {
		h.revokeAndKick(client, "collab room is read-only")
		return false
	}
	return true
}

func (h *CollabHandler) revokeAndKick(client *collabClient, reason string) {
	client.canWrite = false
	_ = client.writeJSON(wsOut{
		Type:     "revoked",
		CanWrite: boolPtr(false),
		Role:     client.role,
		Message:  reason,
	})
	client.closeConn()
}

const (
	collabPingInterval = 20 * time.Second
	collabPongWait     = 60 * time.Second
)

func (c *collabClient) writeJSON(v any) error {
	if c.writeFn != nil {
		return c.writeFn(v)
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.writeRaw(websocket.TextMessage, b)
}

// refreshWriteAccess 在提交增量前重新鉴权，避免连接建立后权限被收回仍继续写入。
// 角色或写权限变化时补发 hello，让前端更新只读状态。已建立的套接字不会被主动踢下线。
func (h *CollabHandler) refreshWriteAccess(client *collabClient) error {
	access, err := h.svc.Authorize(client.userID, client.docID)
	if err != nil {
		client.canWrite = false
		client.role = ""
		return err
	}
	changed := client.canWrite != access.CanWrite || client.role != access.Role
	client.canWrite = access.CanWrite
	client.role = access.Role
	if changed {
		_ = client.writeJSON(wsOut{Type: "hello", CanWrite: boolPtr(access.CanWrite), Role: access.Role})
	}
	return nil
}

func isCollabWriteDenied(err error) bool {
	return errors.Is(err, service.ErrCollabReadOnly) ||
		errors.Is(err, service.ErrDocumentNotFound) ||
		errors.Is(err, service.ErrSpaceForbidden)
}

func (c *collabClient) writeRaw(messageType int, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteMessage(messageType, data)
}

func (h *CollabHandler) keepCollabAlive(client *collabClient, done <-chan struct{}) {
	ticker := time.NewTicker(collabPingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if !h.enforceAccess(client) {
				return
			}
			if err := client.writeRaw(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type collabHub struct {
	mu    sync.Mutex
	rooms map[uuid.UUID]map[*collabClient]struct{}
}

func newCollabHub() *collabHub {
	return &collabHub{rooms: make(map[uuid.UUID]map[*collabClient]struct{})}
}

func (h *collabHub) add(c *collabClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[c.docID]
	if !ok {
		room = make(map[*collabClient]struct{})
		h.rooms[c.docID] = room
	}
	room[c] = struct{}{}
}

func (h *collabHub) remove(c *collabClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[c.docID]
	if !ok {
		return
	}
	delete(room, c)
	if len(room) == 0 {
		delete(h.rooms, c.docID)
	}
}

func (h *collabHub) hasUser(docID, userID uuid.UUID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.rooms[docID] {
		if c.userID == userID {
			return true
		}
	}
	return false
}

// depart 在连接结束时从房间移除；若该用户没有其它连接，立刻踢出在线名单并广播。
func (h *CollabHandler) depart(client *collabClient) {
	h.hub.remove(client)
	if h.hub.hasUser(client.docID, client.userID) {
		return
	}
	_ = h.svc.Leave(client.userID, client.docID)
	h.broadcastLocalAndRemote(client.docID, nil, wsOut{Type: "awareness-leave", UserID: client.userID.String()})
	if users, err := h.svc.ListPresence(client.userID, client.docID); err == nil {
		h.broadcastLocalAndRemote(client.docID, nil, wsOut{Type: "presence", Users: users})
	}
}

func (h *collabHub) broadcast(docID uuid.UUID, except *collabClient, msg wsOut) {
	h.mu.Lock()
	clients := make([]*collabClient, 0)
	if room, ok := h.rooms[docID]; ok {
		for c := range room {
			if c != except {
				clients = append(clients, c)
			}
		}
	}
	h.mu.Unlock()
	for _, c := range clients {
		_ = c.writeJSON(msg)
	}
}
