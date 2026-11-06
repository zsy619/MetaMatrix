package media

import (
	"context"
	"errors"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrNotFound         = errors.New("media not found")
	ErrReferenced       = errors.New("media is referenced")
	ErrCategoryNotEmpty = errors.New("category is not empty")
	ErrCategoryCycle    = errors.New("category parent cycle")
	ErrBadMediaType     = errors.New("unsupported media type")
)

type ListFilter struct {
	MediaType  string
	CategoryID *uuid.UUID
	Limit      int
	Offset     int
}

type Store interface {
	InsertOrGet(ctx context.Context, asset *model.MediaAsset) (created bool, err error)
	FindByHash(ctx context.Context, userID uuid.UUID, sha string) (*model.MediaAsset, error)
	Get(ctx context.Context, userID, id uuid.UUID) (*model.MediaAsset, error)
	List(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]model.MediaAsset, int64, error)
	UpdateFeishu(ctx context.Context, userID, id uuid.UUID, token, parentType, parentNode, status string) error
	CountReferences(ctx context.Context, userID, assetID uuid.UUID) (int64, error)
	DeleteAsset(ctx context.Context, userID, id uuid.UUID) error
	AddReference(ctx context.Context, ref *model.MediaReference) error
	DeleteReference(ctx context.Context, userID, assetID, refID uuid.UUID) error
	ListCategories(ctx context.Context, userID uuid.UUID) ([]model.MediaCategory, error)
	CreateCategory(ctx context.Context, cat *model.MediaCategory) error
	UpdateCategory(ctx context.Context, userID, id uuid.UUID, name *string, parentID *uuid.UUID, parentSet bool, sort *int) error
	DeleteCategory(ctx context.Context, userID, id uuid.UUID) error
}

type GormStore struct {
	db *gorm.DB
}

func NewGormStore(db *gorm.DB) *GormStore { return &GormStore{db: db} }

func (s *GormStore) InsertOrGet(ctx context.Context, asset *model.MediaAsset) (bool, error) {
	res := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "sha256"}},
		DoNothing: true,
	}).Create(asset)
	if res.Error != nil {
		return false, res.Error
	}
	if res.RowsAffected > 0 {
		return true, nil
	}
	existing, err := s.FindByHash(ctx, asset.UserID, asset.SHA256)
	if err != nil {
		return false, err
	}
	*asset = *existing
	return false, nil
}

func (s *GormStore) FindByHash(ctx context.Context, userID uuid.UUID, sha string) (*model.MediaAsset, error) {
	var row model.MediaAsset
	err := s.db.WithContext(ctx).Where("user_id = ? AND sha256 = ?", userID, sha).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *GormStore) Get(ctx context.Context, userID, id uuid.UUID) (*model.MediaAsset, error) {
	var row model.MediaAsset
	err := s.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *GormStore) List(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]model.MediaAsset, int64, error) {
	q := s.db.WithContext(ctx).Model(&model.MediaAsset{}).Where("user_id = ?", userID)
	if filter.MediaType != "" {
		q = q.Where("media_type = ?", filter.MediaType)
	}
	if filter.CategoryID != nil {
		q = q.Where("category_id = ?", *filter.CategoryID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []model.MediaAsset
	err := q.Order("created_at DESC").Limit(filter.Limit).Offset(filter.Offset).Find(&rows).Error
	return rows, total, err
}

func (s *GormStore) UpdateFeishu(ctx context.Context, userID, id uuid.UUID, token, parentType, parentNode, status string) error {
	res := s.db.WithContext(ctx).Model(&model.MediaAsset{}).
		Where("user_id = ? AND id = ?", userID, id).
		Updates(map[string]interface{}{
			"feishu_media_token": token,
			"feishu_parent_type": parentType,
			"feishu_parent_node": parentNode,
			"feishu_sync_status": status,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GormStore) CountReferences(ctx context.Context, userID, assetID uuid.UUID) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&model.MediaReference{}).
		Where("user_id = ? AND asset_id = ?", userID, assetID).
		Count(&n).Error
	return n, err
}

func (s *GormStore) DeleteAsset(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.CountReferences(ctx, userID, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrReferenced
	}
	res := s.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).Delete(&model.MediaAsset{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GormStore) AddReference(ctx context.Context, ref *model.MediaReference) error {
	if _, err := s.Get(ctx, ref.UserID, ref.AssetID); err != nil {
		return err
	}
	return s.db.WithContext(ctx).Create(ref).Error
}

func (s *GormStore) DeleteReference(ctx context.Context, userID, assetID, refID uuid.UUID) error {
	res := s.db.WithContext(ctx).
		Where("user_id = ? AND asset_id = ? AND id = ?", userID, assetID, refID).
		Delete(&model.MediaReference{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GormStore) ListCategories(ctx context.Context, userID uuid.UUID) ([]model.MediaCategory, error) {
	var rows []model.MediaCategory
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("sort_order ASC, created_at ASC").Find(&rows).Error
	return rows, err
}

func (s *GormStore) CreateCategory(ctx context.Context, cat *model.MediaCategory) error {
	if err := s.checkParent(ctx, cat.UserID, cat.ID, cat.ParentID); err != nil {
		return err
	}
	return s.db.WithContext(ctx).Create(cat).Error
}

func (s *GormStore) UpdateCategory(ctx context.Context, userID, id uuid.UUID, name *string, parentID *uuid.UUID, parentSet bool, sort *int) error {
	var row model.MediaCategory
	err := s.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	updates := map[string]interface{}{}
	if name != nil {
		updates["name"] = *name
	}
	if parentSet {
		if err := s.checkParent(ctx, userID, id, parentID); err != nil {
			return err
		}
		updates["parent_id"] = parentID
	}
	if sort != nil {
		updates["sort_order"] = *sort
	}
	if len(updates) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&model.MediaCategory{}).Where("user_id = ? AND id = ?", userID, id).Updates(updates).Error
}

func (s *GormStore) DeleteCategory(ctx context.Context, userID, id uuid.UUID) error {
	var assets int64
	if err := s.db.WithContext(ctx).Model(&model.MediaAsset{}).Where("user_id = ? AND category_id = ?", userID, id).Count(&assets).Error; err != nil {
		return err
	}
	var children int64
	if err := s.db.WithContext(ctx).Model(&model.MediaCategory{}).Where("user_id = ? AND parent_id = ?", userID, id).Count(&children).Error; err != nil {
		return err
	}
	if assets > 0 || children > 0 {
		return ErrCategoryNotEmpty
	}
	res := s.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).Delete(&model.MediaCategory{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GormStore) checkParent(ctx context.Context, userID, self uuid.UUID, parentID *uuid.UUID) error {
	if parentID == nil {
		return nil
	}
	if *parentID == self {
		return ErrCategoryCycle
	}
	seen := map[uuid.UUID]bool{self: true}
	cur := *parentID
	for i := 0; i < 16; i++ {
		if seen[cur] {
			return ErrCategoryCycle
		}
		seen[cur] = true
		var row model.MediaCategory
		err := s.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, cur).First(&row).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if row.ParentID == nil {
			return nil
		}
		cur = *row.ParentID
	}
	return ErrCategoryCycle
}
