package service

import (
	"errors"
	"strings"

	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	BlockPermInherit  = ""
	BlockPermEdit     = "edit"
	BlockPermOwner    = "owner"
	BlockPermReadonly = "readonly"
)

// ErrBlockPermission 表示当前用户不能改这块，或不能设置块级权限。
var ErrBlockPermission = errors.New("no permission to edit this block")

func NormalizeBlockPermission(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "inherit", "default":
		return BlockPermInherit, nil
	case "edit", "editor", "write":
		return BlockPermEdit, nil
	case "owner", "admin":
		return BlockPermOwner, nil
	case "readonly", "read", "view":
		return BlockPermReadonly, nil
	default:
		return "", ErrValidation
	}
}

func CanSetBlockPermission(role string, canWrite bool) bool {
	if !canWrite {
		return false
	}
	r := strings.ToLower(strings.TrimSpace(role))
	return r == "owner" || r == SpaceRoleAdmin
}

func CanEditBlockContent(permission, role string, canWrite bool) bool {
	if !canWrite {
		return false
	}
	switch permission {
	case BlockPermInherit, BlockPermEdit:
		return true
	case BlockPermOwner:
		r := strings.ToLower(strings.TrimSpace(role))
		return r == "owner" || r == SpaceRoleAdmin
	case BlockPermReadonly:
		return false
	default:
		return true
	}
}

func actorDocAccess(db *gorm.DB, userID, docID uuid.UUID) (role string, canWrite bool, err error) {
	var doc model.CanvasDocument
	if err := db.Where("id = ?", docID).First(&doc).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, ErrDocumentNotFound
		}
		return "", false, err
	}
	if doc.OwnerUserID == userID {
		return "owner", true, nil
	}
	if doc.ProjectID == nil {
		return "", false, ErrDocumentNotFound
	}
	role = lookupSpaceRole(db, userID, *doc.ProjectID)
	if role == "" {
		return "", false, ErrDocumentNotFound
	}
	if spaceRoleRank(role) >= spaceRoleRank(SpaceRoleEditor) {
		return role, true, nil
	}
	return role, false, nil
}

// GuardLockedBlockMutations 阻止无权限者改或删已设权限的块。权限以数据库已存值为准。
func GuardLockedBlockMutations(tx *gorm.DB, docID uuid.UUID, data []byte, role string, canWrite bool) error {
	if !canWrite {
		return ErrCollabReadOnly
	}
	var existing []model.DocBlock
	if err := tx.Where("document_id = ? AND deleted_at IS NULL", docID).Find(&existing).Error; err != nil {
		return err
	}
	extracted := content.ExtractDocBlocks(data)
	next := make(map[uuid.UUID]content.Block, len(extracted))
	for _, b := range extracted {
		id, err := uuid.Parse(b.ID)
		if err != nil {
			continue
		}
		next[id] = b
	}
	for _, row := range existing {
		if CanEditBlockContent(row.Permission, role, canWrite) {
			continue
		}
		got, ok := next[row.ID]
		if !ok {
			return ErrBlockPermission
		}
		if blockSnapshotChanged(row, got) {
			return ErrBlockPermission
		}
	}
	return nil
}

func blockSnapshotChanged(prev model.DocBlock, next content.Block) bool {
	if prev.ContentText != next.Text || prev.BlockType != next.Type {
		return true
	}
	return string(prev.Attrs) != string(mustJSON(next.Attrs))
}

func (s *DocBlockService) UpdatePermission(actorID, docID, blockID uuid.UUID, raw string) (*model.DocBlock, error) {
	role, canWrite, err := actorDocAccess(s.db, actorID, docID)
	if err != nil {
		return nil, err
	}
	if !CanSetBlockPermission(role, canWrite) {
		if !canWrite {
			return nil, ErrCollabReadOnly
		}
		return nil, ErrBlockPermission
	}
	permission, err := NormalizeBlockPermission(raw)
	if err != nil {
		return nil, err
	}
	row, err := s.GetBlock(actorID, docID, blockID)
	if err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.DocBlock{}).
		Where("id = ? AND document_id = ?", blockID, docID).
		Update("permission", permission).Error; err != nil {
		return nil, err
	}
	row.Permission = permission
	return row, nil
}
