package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// MediaCategory is one user's folder. user_id always comes from the login, never from the client.
type MediaCategory struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"userId"`
	Name      string     `gorm:"type:varchar(128);not null" json:"name"`
	ParentID  *uuid.UUID `gorm:"type:uuid;index" json:"parentId"`
	SortOrder int        `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt time.Time  `gorm:"not null" json:"createdAt"`
}

func (MediaCategory) TableName() string { return "media_category" }

// MediaAsset is one stored file. storage_path is relative to the disk root and is not serialized.
// The unique key is (user_id, sha256): the same bytes may exist once per user, not globally.
type MediaAsset struct {
	ID               uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	UserID           uuid.UUID      `gorm:"type:uuid;not null;uniqueIndex:uniq_media_user_sha,priority:1;index" json:"userId"`
	CategoryID       *uuid.UUID     `gorm:"type:uuid;index" json:"categoryId"`
	MediaType        string         `gorm:"type:varchar(16);not null;index" json:"mediaType"`
	OriginalName     string         `gorm:"type:varchar(255);not null" json:"originalName"`
	StoragePath      string         `gorm:"type:varchar(512);not null" json:"-"`
	StorageDisk      string         `gorm:"type:varchar(32);not null;default:local" json:"-"`
	MimeType         string         `gorm:"type:varchar(128);not null" json:"mimeType"`
	SizeBytes        int64          `gorm:"not null" json:"sizeBytes"`
	SHA256           string         `gorm:"type:char(64);not null;uniqueIndex:uniq_media_user_sha,priority:2" json:"sha256"`
	FeishuMediaToken string         `gorm:"type:varchar(128)" json:"feishuMediaToken"`
	FeishuParentType string         `gorm:"type:varchar(32)" json:"feishuParentType"`
	FeishuParentNode string         `gorm:"type:varchar(128)" json:"feishuParentNode"`
	FeishuSyncStatus string         `gorm:"type:varchar(32);not null;default:not_configured" json:"feishuSyncStatus"`
	Status           string         `gorm:"type:varchar(16);not null;default:ready" json:"status"`
	Metadata         datatypes.JSON `gorm:"type:jsonb" json:"metadata"`
	CreatedAt        time.Time      `gorm:"not null" json:"createdAt"`
}

func (MediaAsset) TableName() string { return "media_asset" }

// MediaReference records where an asset is used. user_id is the owner, taken from the login.
// inserted_path is the stable internal route (/media/{id}), never a disk path.
type MediaReference struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	AssetID      uuid.UUID `gorm:"type:uuid;not null;index" json:"assetId"`
	RefType      string    `gorm:"type:varchar(32);not null" json:"refType"`
	RefID        string    `gorm:"type:varchar(128);not null" json:"refId"`
	InsertedPath string    `gorm:"type:varchar(255);not null" json:"insertedPath"`
	CreatedAt    time.Time `gorm:"not null" json:"createdAt"`
}

func (MediaReference) TableName() string { return "media_reference" }
