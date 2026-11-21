package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// KnowledgeMember 是知识空间成员与角色（清单 069）。
//
// 空间 = 项目下的知识空间。角色：admin（可管理成员）| editor（可编辑）| viewer（只读）。
// 项目所有者天然是 admin，不需要写进表里。
type KnowledgeMember struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_knowledge_member,priority:1" json:"projectId"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_knowledge_member,priority:2" json:"userId"`
	// Role 是 admin | editor | viewer。
	Role      string    `gorm:"type:varchar(16);not null;default:'viewer'" json:"role"`
	CreatedBy uuid.UUID `gorm:"type:uuid;not null" json:"createdBy"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (KnowledgeMember) TableName() string { return "knowledge_members" }

// KnowledgePresence 是 presence 的共享存储（清单 078）。
//
// 原来 presence 只在进程内存里，多实例部署时看不到别的实例上的在线用户。
// 这里落库并按 TTL 清理：在线状态是瞬时信息，心跳覆盖同一行，不会制造垃圾行。
type KnowledgePresence struct {
	DocID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"docId"`
	UserID   uuid.UUID `gorm:"type:uuid;primaryKey" json:"userId"`
	Name     string    `gorm:"type:varchar(64);not null;default:''" json:"name"`
	Avatar   string    `gorm:"type:varchar(512);not null;default:''" json:"avatar"`
	Editing  bool      `gorm:"not null;default:false" json:"editing"`
	Cursor   string    `gorm:"type:varchar(255);not null;default:''" json:"cursor"`
	LastSeen time.Time `gorm:"type:timestamptz;not null;index:idx_presence_seen" json:"lastSeen"`
}

func (KnowledgePresence) TableName() string { return "knowledge_presence" }

// DocCRDTUpdate 是协同编辑的增量日志（清单 079）。
//
// 服务端只做「追加 + 读取」，不做合并：Yjs 的更新本身可交换、可幂等，
// 客户端拉到同一批更新后各自合并即可得到一致结果。
// Seq 是全局自增序号，客户端用 after=seq 拉增量。
type DocCRDTUpdate struct {
	ID    int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	DocID uuid.UUID `gorm:"type:uuid;not null;index:idx_crdt_doc" json:"docId"`
	// Kind 是 update（增量）| snapshot（合并后的全量快照）。
	Kind         string    `gorm:"type:varchar(16);not null;default:'update'" json:"kind"`
	Payload      []byte    `gorm:"type:bytea" json:"payload"`
	AuthorUserID uuid.UUID `gorm:"type:uuid;not null" json:"authorUserId"`
	CreatedAt    time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
}

func (DocCRDTUpdate) TableName() string { return "doc_crdt_updates" }

// KnowledgeChunk 是文档的向量切片（清单 106）。
//
// Embedding 是 JSON 数组：本地用哈希嵌入（无外部依赖），配置了 embedding
// 服务则用真嵌入。检索时在 Go 里算余弦相似度，不依赖 pgvector。
type KnowledgeChunk struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_chunk_project" json:"projectId"`
	DocID     uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_chunk_doc_seq,priority:1" json:"docId"`
	Seq       int       `gorm:"not null;uniqueIndex:idx_chunk_doc_seq,priority:2" json:"seq"`
	Text      string    `gorm:"type:text;not null" json:"text"`
	// Embedding 是归一化后的向量。
	Embedding datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"embedding"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (KnowledgeChunk) TableName() string { return "knowledge_chunks" }
