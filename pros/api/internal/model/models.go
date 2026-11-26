package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type User struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email       string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	DisplayName string    `gorm:"type:varchar(128)" json:"displayName"`
	// Department / Role / AvatarURL back the @ mention directory.
	// They stay optional so existing rows remain valid.
	Department   string    `gorm:"type:varchar(128);index" json:"department"`
	Role         string    `gorm:"type:varchar(128)" json:"role"`
	AvatarURL    string    `gorm:"type:varchar(512)" json:"avatarUrl"`
	PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"`
	CreatedAt    time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (User) TableName() string { return "core_users" }

// Project 是画布的容器：一个项目下有多张画布。
//
// 为什么单独建表而画布内容仍留在 JSONB：
//   - 画布内容（节点、连线）属于「一份画布」，按 GLOBAL_RULES 统一放
//     kb_documents.current_data，不按画布类型建业务表。
//   - 项目本身是画布之外的实体，有独立的生命周期（新建、重命名、删除），
//     需要自己的表来回答「这个用户有哪些项目」。
type Project struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OwnerUserID uuid.UUID `gorm:"type:uuid;not null;index:idx_projects_owner_updated,priority:1" json:"ownerUserId"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	// Emoji 是项目的基本信息之一：一个表情让列表一眼能认出项目。
	Emoji string `gorm:"type:varchar(16);not null;default:'📁'" json:"emoji"`
	// Progress 是项目进度（0-100），由使用者自己维护。
	Progress int       `gorm:"not null;default:0" json:"progress"`
	CreatedAt time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null;index:idx_projects_owner_updated,priority:2,sort:desc" json:"updatedAt"`
}

func (Project) TableName() string { return "core_projects" }

// ProjectSummary 是项目列表项：附带该项目的画布数量。
type ProjectSummary struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Emoji       string    `json:"emoji"`
	Progress    int       `json:"progress"`
	CanvasCount int64     `json:"canvasCount"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CanvasDocument struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	OwnerUserID   uuid.UUID `gorm:"type:uuid;not null;index:idx_docs_owner_updated,priority:1;index:idx_docs_owner_type,priority:1;index:idx_docs_owner_template,priority:1" json:"ownerUserId"`
	CanvasType    string    `gorm:"type:varchar(64);not null;index:idx_docs_owner_type,priority:2" json:"canvasType"`
	Title         string    `gorm:"type:varchar(255);not null" json:"title"`
	// Icon 是画布标题前的图标（emoji）。知识库目录树另有自己的节点图标列。
	Icon          string    `gorm:"type:varchar(16);not null;default:''" json:"icon"`
	Notes         string    `gorm:"type:text" json:"notes"`
	SchemaVersion int       `gorm:"not null;default:1" json:"schemaVersion"`
	// SaveVersion 是文档内容的单调递增版本号，专门用于并发控制。
	//
	// head_revision_id 只表达“当前指向哪个修订版”，普通自动保存不会推进它，
	// 所以它不能充当每次保存的并发令牌。SaveVersion 每次成功写入都会 +1，
	// 客户端带上读到的版本号，服务端用 WHERE save_version = ? 做原子比较并交换。
	SaveVersion    int64          `gorm:"not null;default:1" json:"saveVersion"`
	CurrentData    datatypes.JSON `gorm:"type:jsonb;not null" json:"currentData"`
	ContentText    string         `gorm:"type:text;not null;default:''" json:"-"`
	HeadRevisionID *uuid.UUID     `gorm:"type:uuid" json:"headRevisionId"`
	TemplateID     *string        `gorm:"type:varchar(64);index:idx_docs_owner_template,priority:2" json:"templateId"`
	// ProjectID 指向所属项目。可空：旧画布不属于任何项目，行为与迁移前完全一致。
	ProjectID *uuid.UUID     `gorm:"type:uuid;index" json:"projectId"`
	CreatedAt time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;not null;index:idx_docs_owner_updated,priority:2,sort:desc" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Owner     User                 `gorm:"foreignKey:OwnerUserID;constraint:OnDelete:CASCADE" json:"-"`
	Revisions []CanvasRevision     `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
	Blocks    []CanvasContentBlock `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
}

func (CanvasDocument) TableName() string { return "kb_documents" }

type CanvasRevision struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_revisions_document,priority:1" json:"documentId"`
	ParentID       *uuid.UUID     `gorm:"type:uuid" json:"parentId"`
	RevisionType   string         `gorm:"type:varchar(16);not null" json:"revisionType"` // snapshot | patch
	Payload        datatypes.JSON `gorm:"type:jsonb;not null" json:"payload,omitempty"`
	BaseSnapshotID *uuid.UUID     `gorm:"type:uuid" json:"baseSnapshotId"`
	AuthorUserID   *uuid.UUID     `gorm:"type:uuid" json:"authorUserId"`
	Label          *string        `gorm:"type:varchar(255)" json:"label"`
	ContentHash    *string        `gorm:"type:varchar(64)" json:"contentHash"`
	CreatedAt      time.Time      `gorm:"type:timestamptz;not null;index:idx_revisions_document,priority:2,sort:desc" json:"createdAt"`

	Document CanvasDocument `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
	Author   *User          `gorm:"foreignKey:AuthorUserID" json:"-"`
}

func (CanvasRevision) TableName() string { return "kb_revisions" }

// CanvasContentBlock is the structured extraction layer for search / AI.
type CanvasContentBlock struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	DocumentID  uuid.UUID `gorm:"type:uuid;not null;index:idx_blocks_document_panel,priority:1" json:"documentId"`
	PanelID     string    `gorm:"type:varchar(64);index:idx_blocks_document_panel,priority:2" json:"panelId"`
	PanelTitle  string    `gorm:"type:varchar(255)" json:"panelTitle"`
	BlockPath   string    `gorm:"type:varchar(255)" json:"blockPath"`
	TextContent string    `gorm:"type:text;not null" json:"textContent"`
	SortOrder   int       `gorm:"not null;default:0" json:"sortOrder"`
	UpdatedAt   time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`

	Document CanvasDocument `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
}

func (CanvasContentBlock) TableName() string { return "kb_content_blocks" }

// DocumentSummary is list response without full JSON payload.
type DocumentSummary struct {
	ID             uuid.UUID  `json:"id"`
	Title          string     `json:"title"`
	Icon           string     `json:"icon"`
	Notes          string     `json:"notes"`
	TemplateID     *string    `json:"templateId"`
	CanvasType     string     `json:"canvasType"`
	ProjectID      *uuid.UUID `json:"projectId"`
	SchemaVersion  int        `json:"schemaVersion"`
	SaveVersion    int64      `json:"saveVersion"`
	HeadRevisionID *uuid.UUID `json:"headRevisionId"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type RevisionSummary struct {
	ID             uuid.UUID  `json:"id"`
	DocumentID     uuid.UUID  `json:"documentId"`
	ParentID       *uuid.UUID `json:"parentId"`
	RevisionType   string     `json:"revisionType"`
	BaseSnapshotID *uuid.UUID `json:"baseSnapshotId"`
	AuthorUserID   *uuid.UUID `json:"authorUserId"`
	Label          *string    `json:"label"`
	ContentHash    *string    `json:"contentHash"`
	CreatedAt      time.Time  `json:"createdAt"`
}

// SearchHit is a search result with snippet.
type SearchHit struct {
	ID         uuid.UUID  `json:"id"`
	Title      string     `json:"title"`
	Notes      string     `json:"notes"`
	TemplateID *string    `json:"templateId"`
	CanvasType string     `json:"canvasType"`
	ProjectID  *uuid.UUID `json:"projectId"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
	Snippet    string     `json:"snippet"`
	Rank       float64    `json:"rank,omitempty"`
	PanelID    string     `json:"panelId,omitempty"`
	PanelTitle string     `json:"panelTitle,omitempty"`
}
