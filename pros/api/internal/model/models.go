package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	DisplayName  string    `gorm:"type:varchar(128)" json:"displayName"`
	PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"`
	CreatedAt    time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (User) TableName() string { return "users" }

type CanvasDocument struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	OwnerUserID    uuid.UUID      `gorm:"type:uuid;not null;index:idx_docs_owner_updated,priority:1;index:idx_docs_owner_type,priority:1;index:idx_docs_owner_template,priority:1" json:"ownerUserId"`
	CanvasType     string         `gorm:"type:varchar(64);not null;index:idx_docs_owner_type,priority:2" json:"canvasType"`
	Title          string         `gorm:"type:varchar(255);not null" json:"title"`
	Notes          string         `gorm:"type:text" json:"notes"`
	SchemaVersion  int            `gorm:"not null;default:1" json:"schemaVersion"`
	CurrentData    datatypes.JSON `gorm:"type:jsonb;not null" json:"currentData"`
	ContentText    string         `gorm:"type:text;not null;default:''" json:"-"`
	HeadRevisionID *uuid.UUID     `gorm:"type:uuid" json:"headRevisionId"`
	TemplateID     *string        `gorm:"type:varchar(64);index:idx_docs_owner_template,priority:2" json:"templateId"`
	CreatedAt      time.Time      `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt      time.Time      `gorm:"type:timestamptz;not null;index:idx_docs_owner_updated,priority:2,sort:desc" json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	Owner     User                 `gorm:"foreignKey:OwnerUserID;constraint:OnDelete:CASCADE" json:"-"`
	Revisions []CanvasRevision     `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
	Blocks    []CanvasContentBlock `gorm:"foreignKey:DocumentID;constraint:OnDelete:CASCADE" json:"-"`
}

func (CanvasDocument) TableName() string { return "canvas_documents" }

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

func (CanvasRevision) TableName() string { return "canvas_revisions" }

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

func (CanvasContentBlock) TableName() string { return "canvas_content_blocks" }

// DocumentSummary is list response without full JSON payload.
type DocumentSummary struct {
	ID             uuid.UUID  `json:"id"`
	Title          string     `json:"title"`
	Notes          string     `json:"notes"`
	TemplateID     *string    `json:"templateId"`
	CanvasType     string     `json:"canvasType"`
	SchemaVersion  int        `json:"schemaVersion"`
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
	ID         uuid.UUID `json:"id"`
	Title      string    `json:"title"`
	Notes      string    `json:"notes"`
	TemplateID *string   `json:"templateId"`
	CanvasType string    `json:"canvasType"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Snippet    string    `json:"snippet"`
	Rank       float64   `json:"rank,omitempty"`
}
