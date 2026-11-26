package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ErrProjectNotFound 表示项目不存在或不属于当前用户。
var ErrProjectNotFound = errors.New("project not found")

// maxProjectNameRunes 限制项目名长度，与画布标题的上限同量级。
const maxProjectNameRunes = 120

// maxProjectEmojiRunes 限制表情长度：一个表情 + 少量修饰符就够。
const maxProjectEmojiRunes = 8

// defaultProjectEmoji 没选表情时用它兜底，列表里不至于空着。
const defaultProjectEmoji = "📁"

// validateProjectEmoji 清洗表情：去掉首尾空白与控制字符，超长截断。
func validateProjectEmoji(emoji string) string {
	emoji = strings.TrimSpace(emoji)
	if emoji == "" {
		return defaultProjectEmoji
	}
	if utf8.RuneCountInString(emoji) > maxProjectEmojiRunes {
		runes := []rune(emoji)
		emoji = string(runes[:maxProjectEmojiRunes])
	}
	return emoji
}

// clampProjectProgress 把进度限制在 0-100。
func clampProjectProgress(progress int) int {
	if progress < 0 {
		return 0
	}
	if progress > 100 {
		return 100
	}
	return progress
}

// ProjectsService 管理「项目」这一层实体。
//
// 画布内容本身仍然落在 kb_documents.current_data（JSONB），这里只管
// 项目这一层容器：新建、重命名、删除，以及回答「这个项目下有哪些画布」。
type ProjectsService struct {
	db *gorm.DB
}

// Refs 返回项目内每张画布引用了哪些画布。
//
// 用途是「能不能引用这张画布」的判断：自引用与 A→B→A 的环引用
// 都要在选择时拦下来，所以客户端需要知道整张引用图，而不是只看当前画布。
// 键是画布 id，值是它引用掉的画布 id 列表。
func (s *ProjectsService) Refs(ownerID, projectID uuid.UUID) (map[string][]string, error) {
	var rows []struct {
		ID          uuid.UUID
		CurrentData datatypes.JSON
	}
	// 引用图只描述画布之间的引用：知识库富文本不会出现在节点画布的选择器里，
	// 读进来只是让 map 多一堆解析失败的空 key。
	if err := s.db.Model(&model.CanvasDocument{}).
		Select("id, current_data").
		Where("owner_user_id = ? AND project_id = ? AND canvas_type <> ?", ownerID, projectID, DocCanvasType).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	refs := make(map[string][]string, len(rows))
	for _, row := range rows {
		var doc struct {
			Nodes []struct {
				Type        string `json:"type"`
				RefCanvasID string `json:"refCanvasId"`
			} `json:"nodes"`
		}
		// 画布内容是任意 JSON：解析失败就当这张画布没有引用，
		// 不能因为一张脏画布让整个项目读不出来。
		if err := json.Unmarshal(row.CurrentData, &doc); err != nil {
			refs[row.ID.String()] = []string{}
			continue
		}
		list := []string{}
		for _, node := range doc.Nodes {
			if node.Type == "canvasRef" && node.RefCanvasID != "" {
				list = append(list, node.RefCanvasID)
			}
		}
		refs[row.ID.String()] = list
	}
	return refs, nil
}

func NewProjectsService(db *gorm.DB) *ProjectsService {
	return &ProjectsService{db: db}
}

func validateProjectName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || utf8.RuneCountInString(trimmed) > maxProjectNameRunes {
		return "", ErrValidation
	}
	return trimmed, nil
}

// List 返回当前用户的项目列表，按最近更新排序。
func (s *ProjectsService) List(ownerID uuid.UUID) ([]model.ProjectSummary, error) {
	rows := []model.ProjectSummary{}
	err := s.db.Model(&model.Project{}).
		Select(`core_projects.id, core_projects.name, core_projects.emoji, core_projects.progress,
			core_projects.created_at, core_projects.updated_at,
			(SELECT COUNT(*) FROM kb_documents d
			  WHERE d.project_id = core_projects.id AND d.deleted_at IS NULL
			    AND d.canvas_type = ?) AS canvas_count`,
			NodeGraphCanvasType).
		Where("core_projects.owner_user_id = ?", ownerID).
		Order("core_projects.updated_at DESC").
		Order("core_projects.id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// Get 返回单个项目。
func (s *ProjectsService) Get(ownerID, id uuid.UUID) (*model.Project, error) {
	var p model.Project
	if err := s.db.Where("id = ? AND owner_user_id = ?", id, ownerID).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return &p, nil
}

// Create 新建项目。emoji 为空时用默认表情。
func (s *ProjectsService) Create(ownerID uuid.UUID, name, emoji string) (*model.Project, error) {
	clean, err := validateProjectName(name)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	p := &model.Project{
		ID:          uuid.New(),
		OwnerUserID: ownerID,
		Name:        clean,
		Emoji:       validateProjectEmoji(emoji),
		Progress:    0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// ProjectUpdate 是项目基本信息的补丁：只更新传进来的字段。
//
// 为什么用指针：重命名不该顺手把进度清零，表情也不该被默认值覆盖。
type ProjectUpdate struct {
	Name     *string
	Emoji    *string
	Progress *int
}

// Update 更新项目基本信息（名称 / 表情 / 进度）。
func (s *ProjectsService) Update(ownerID, id uuid.UUID, in ProjectUpdate) (*model.Project, error) {
	fields := map[string]interface{}{}
	if in.Name != nil {
		clean, err := validateProjectName(*in.Name)
		if err != nil {
			return nil, err
		}
		fields["name"] = clean
	}
	if in.Emoji != nil {
		fields["emoji"] = validateProjectEmoji(*in.Emoji)
	}
	if in.Progress != nil {
		fields["progress"] = clampProjectProgress(*in.Progress)
	}
	if len(fields) == 0 {
		return s.Get(ownerID, id)
	}
	fields["updated_at"] = time.Now().UTC()
	res := s.db.Model(&model.Project{}).
		Where("id = ? AND owner_user_id = ?", id, ownerID).
		Updates(fields)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrProjectNotFound
	}
	return s.Get(ownerID, id)
}

// Delete 删除项目，同时删除项目下的画布。
//
// 为什么连画布一起删：画布只存在于项目里，项目没了画布就成了没人找得到的孤儿。
// 删除是硬删除（绕开软删除），因此子表（修订、内容块、保存幂等记录）要显式清理——
// 不能指望外键级联，那取决于 AutoMigrate 是否已经建好约束。
func (s *ProjectsService) Delete(ownerID, id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var owned int64
		if err := tx.Model(&model.Project{}).
			Where("id = ? AND owner_user_id = ?", id, ownerID).
			Count(&owned).Error; err != nil {
			return err
		}
		if owned == 0 {
			return ErrProjectNotFound
		}

		var docIDs []uuid.UUID
		if err := tx.Model(&model.CanvasDocument{}).
			Where("project_id = ?", id).
			Pluck("id", &docIDs).Error; err != nil {
			return err
		}
		if len(docIDs) > 0 {
			if err := tx.Where("document_id IN ?", docIDs).Delete(&model.CanvasRevision{}).Error; err != nil {
				return err
			}
			if err := tx.Where("document_id IN ?", docIDs).Delete(&model.CanvasContentBlock{}).Error; err != nil {
				return err
			}
			if err := tx.Where("document_id IN ?", docIDs).Delete(&model.DocumentSaveOperation{}).Error; err != nil {
				return err
			}
			if err := tx.Unscoped().Where("id IN ?", docIDs).Delete(&model.CanvasDocument{}).Error; err != nil {
				return err
			}
		}

		return tx.Unscoped().Where("id = ? AND owner_user_id = ?", id, ownerID).Delete(&model.Project{}).Error
	})
}
