package model

import (
	"time"

	"github.com/google/uuid"
)

// KnowledgeNode 是知识库目录树的一个节点。
//
// 目录树与文档解耦：节点只存父子关系和排序，文档内容仍在 canvas_documents。
// document_id 为 NULL 表示文件夹；非 NULL 指向一篇 canvas_documents。
// 文档被删后 document_id 置 NULL（ON DELETE SET NULL），节点保留为「已失效」占位，
// 与 nodeGraph 画布引用节点的失效语义一致。
type KnowledgeNode struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ProjectID  uuid.UUID  `gorm:"type:uuid;not null;index:idx_kn_project_parent,priority:1;index:idx_kn_project_sort,priority:1" json:"projectId"`
	ParentID   *uuid.UUID `gorm:"type:uuid;index:idx_kn_project_parent,priority:2" json:"parentId"`
	NodeType   string     `gorm:"type:varchar(16);not null" json:"nodeType"` // folder | doc | canvas | note | sheet
	DocumentID *uuid.UUID `gorm:"type:uuid" json:"documentId"`
	Title      string     `gorm:"type:varchar(255);not null" json:"title"`
	// CreatedBy 是节点创建者：作者维度检索与图谱归属用它。
	// 可空是为了让存量行在加列时不必回填。
	CreatedBy *uuid.UUID `gorm:"type:uuid;index" json:"createdBy"`
	SortOrder int        `gorm:"not null;default:0;index:idx_kn_project_sort,priority:2,sort:asc" json:"sortOrder"`
	Icon      string     `gorm:"type:varchar(16);not null;default:'📄'" json:"icon"`
	// Alias 是别名/短链：飞书知识库允许节点用短名被引用。
	Alias string `gorm:"type:varchar(64);not null;default:''" json:"alias"`
	// Summary 是节点摘要：目录卡片与搜索结果用它代替全文。
	Summary string `gorm:"type:varchar(255);not null;default:''" json:"summary"`
	// Favorite 是收藏标记。
	Favorite bool `gorm:"not null;default:false" json:"favorite"`
	// Locked 是编辑锁：锁定后他人只读。
	Locked bool `gorm:"not null;default:false" json:"locked"`
	// TrashedAt 非空表示节点在回收站（软删除），Tree 默认不返回。
	TrashedAt *time.Time `gorm:"index" json:"trashedAt"`
	// ArchivedAt 非空表示节点归档：仍可访问，但不出现在默认目录视图。
	ArchivedAt *time.Time `gorm:"index" json:"archivedAt"`
	// DocumentCanvasType / DocumentTemplateID 是拼上来的文档信息，不是本表的列：
	// 目录树要靠它判断节点指向的是哪张画布、用哪个模板打开。
	DocumentCanvasType  string `gorm:"-" json:"documentCanvasType"`
	DocumentTemplateID string `gorm:"-" json:"documentTemplateId"`
	CreatedAt           time.Time `gorm:"type:timestamptz;not null" json:"createdAt"`
	UpdatedAt           time.Time `gorm:"type:timestamptz;not null" json:"updatedAt"`
}

func (KnowledgeNode) TableName() string { return "knowledge_nodes" }
