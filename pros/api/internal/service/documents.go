package service

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"github.com/wI2L/jsondiff"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrDocumentNotFound = errors.New("document not found")
	ErrRevisionNotFound = errors.New("revision not found")
	ErrHeadConflict     = errors.New("head_revision_id conflict")
	// ErrSaveConflict 表示客户端持有的 save_version 已过期。
	// 它和 ErrHeadConflict 都映射成 409，但原因不同：前者是内容版本的
	// 乐观锁失败，后者是修订历史指针不一致。
	ErrSaveConflict    = errors.New("save_version conflict")
	ErrNotSnapshot     = errors.New("MVP only materializes snapshot revisions")
	ErrValidation      = errors.New("validation")
	ErrPayloadTooLarge = errors.New("payload too large")
	ErrInvalidHead     = errors.New("invalid expectedHeadRevisionId")
	// ErrOperationConflict 表示客户端复用了 operationId，却修改了请求载荷。
	// 这与普通的版本冲突不同：必须让调用方修正请求，不能自动覆盖首次结果。
	ErrOperationConflict = errors.New("operation_id payload conflict")
)

const (
	maxTitleRunes       = 255
	maxNotesRunes       = 8000
	maxTypeRunes        = 64
	maxCanvasBytes      = 2 << 20
	maxListLimit        = 100
	maxOperationIDRunes = 128
	// autoCheckpointRetention 只限制系统自动快照；手动存版、初始快照和恢复快照
	// 都承载明确的用户意图，不参与数量清理。
	autoCheckpointRetention = 50
)

type DocumentsService struct {
	db *gorm.DB
}

func NewDocumentsService(db *gorm.DB) *DocumentsService {
	return &DocumentsService{db: db}
}

type CreateDocumentInput struct {
	Title      *string
	Notes      *string
	CanvasType *string
	TemplateID *string
	// ProjectID 画布所属项目。可空：项目外的画布（历史画布）保持 project_id = NULL。
	ProjectID *uuid.UUID
	Data      json.RawMessage
}

type UpdateDocumentInput struct {
	Title                  *string
	Notes                  *string
	CurrentData            json.RawMessage
	ExpectedHeadRevisionID *string // nil = skip check; pointer to empty/"null" = expect null head
	HasExpected            bool
	// ExpectedSaveVersion 是本次写入期望的文档版本号。
	// nil 表示调用方没有提供（旧客户端），此时跳过版本比较，但仍然递增版本。
	ExpectedSaveVersion *int64
	Checkpoint          bool
	// OperationID 是调用方生成的幂等键。空字符串保留旧客户端的非幂等行为；
	// 非空时，同一事务内会去重并记录首次成功响应，网络重试可安全重放。
	OperationID string
}

type CreateRevisionInput struct {
	ExpectedHeadRevisionID *string
	HasExpected            bool
	ExpectedSaveVersion    *int64
	Label                  *string
}

type RestoreInput struct {
	RevisionID             uuid.UUID
	ExpectedHeadRevisionID *string
	HasExpected            bool
	ExpectedSaveVersion    *int64
	Label                  *string
}

func hashPayload(payload []byte) string {
	sum := sha256.Sum256(content.CanonicalHashBytes(payload))
	return hex.EncodeToString(sum[:])
}

func assertHead(actual *uuid.UUID, expected *string, hasExpected bool) error {
	if !hasExpected {
		return nil
	}
	var exp *uuid.UUID
	if expected != nil && *expected != "" {
		id, err := uuid.Parse(*expected)
		if err != nil {
			return ErrInvalidHead
		}
		exp = &id
	}
	a := ""
	e := ""
	if actual != nil {
		a = actual.String()
	}
	if exp != nil {
		e = exp.String()
	}
	if a != e {
		return ErrHeadConflict
	}
	return nil
}

// bumpSaveVersion 在事务内对文档执行一次原子“比较并交换 + 版本递增”。
//
// 这是所有写路径（保存、存版、恢复）唯一允许推进文档内容的入口：
//   - WHERE 同时限定文档 id、归属用户和期望版本；
//   - SET save_version = save_version + 1 由数据库原子完成；
//   - 只有影响行数恰好为 1 才算成功，否则返回 ErrSaveConflict。
//
// 因为条件与递增在同一条 UPDATE 里，两个并发请求即使都读到了同一个旧版本，
// 也只有一个能命中，另一个必然 0 行受影响。
func bumpSaveVersion(
	tx *gorm.DB,
	ownerID, docID uuid.UUID,
	expected *int64,
	updates map[string]interface{},
) error {
	updates["save_version"] = gorm.Expr("save_version + 1")
	q := tx.Model(&model.CanvasDocument{}).
		Where("id = ? AND owner_user_id = ?", docID, ownerID)
	if expected != nil {
		q = q.Where("save_version = ?", *expected)
	}
	res := q.Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return ErrSaveConflict
	}
	return nil
}

// pruneAutomaticCheckpoints 将每篇文档的自动 checkpoint 保持在最近 50 个。
//
// 只删除 label=auto-checkpoint 的完整快照，不碰手动/初始/恢复历史。超过保留数后，
// 若旧快照仍是某个文档 head，或被 patch 的 base_snapshot_id 引用，则额外保留；
// 因此 50 是普通自动历史的保留目标，而不是破坏恢复依赖的硬删除借口。
// ParentID 只是谱系提示，快照物化不依赖它，故不沿 ParentID 无上限保留整条链。
func pruneAutomaticCheckpoints(tx *gorm.DB, docID uuid.UUID) error {
	var candidateIDs []uuid.UUID
	if err := tx.Model(&model.CanvasRevision{}).
		Where("document_id = ? AND revision_type = ? AND label = ?", docID, "snapshot", "auto-checkpoint").
		Order("created_at DESC").Order("id ASC").
		Limit(-1).Offset(autoCheckpointRetention).
		Pluck("id", &candidateIDs).Error; err != nil {
		return err
	}
	if len(candidateIDs) == 0 {
		return nil
	}

	protected := make(map[uuid.UUID]struct{})
	var baseIDs []uuid.UUID
	if err := tx.Model(&model.CanvasRevision{}).
		Where("base_snapshot_id IN ?", candidateIDs).
		Distinct().Pluck("base_snapshot_id", &baseIDs).Error; err != nil {
		return err
	}
	for _, id := range baseIDs {
		protected[id] = struct{}{}
	}
	var headIDs []uuid.UUID
	if err := tx.Model(&model.CanvasDocument{}).
		Where("head_revision_id IN ?", candidateIDs).
		Distinct().Pluck("head_revision_id", &headIDs).Error; err != nil {
		return err
	}
	for _, id := range headIDs {
		protected[id] = struct{}{}
	}

	deletable := make([]uuid.UUID, 0, len(candidateIDs))
	for _, id := range candidateIDs {
		if _, keep := protected[id]; !keep {
			deletable = append(deletable, id)
		}
	}
	if len(deletable) == 0 {
		return nil
	}
	// 删除时再次限定文档、类型和标签，避免候选查询之后条件变化误伤其他历史。
	return tx.Where(
		"document_id = ? AND revision_type = ? AND label = ? AND id IN ?",
		docID, "snapshot", "auto-checkpoint", deletable,
	).Delete(&model.CanvasRevision{}).Error
}

// reloadDoc 在冲突后取回最新文档，让调用方能把最新版本号返回给客户端。
func (s *DocumentsService) reloadDoc(ownerID, docID uuid.UUID) *model.CanvasDocument {
	fresh, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil
	}
	return fresh
}

// syncExtract rewrites content_text and rebuilds kb_content_blocks inside tx.
func syncExtract(tx *gorm.DB, docID uuid.UUID, data []byte, now time.Time, canvasType string) (string, error) {
	ext := content.Extract(data)
	if err := tx.Model(&model.CanvasDocument{}).Where("id = ?", docID).
		Update("content_text", ext.PlainText).Error; err != nil {
		return "", err
	}
	// Markdown 源码单独存一列：库里不再只有 HTML
	if err := tx.Model(&model.CanvasDocument{}).Where("id = ?", docID).
		Update("content_markdown", ext.Markdown).Error; err != nil {
		return "", err
	}
	if err := tx.Where("document_id = ?", docID).Delete(&model.CanvasContentBlock{}).Error; err != nil {
		return "", err
	}
	if len(ext.Blocks) == 0 {
		if err := syncDocBlocks(tx, docID, data, now); err != nil {
			return "", err
		}
		return ext.PlainText, rebuildRefs(tx, docID, data, now)
	}
	rows := make([]model.CanvasContentBlock, 0, len(ext.Blocks))
	for _, b := range ext.Blocks {
		rows = append(rows, model.CanvasContentBlock{
			ID:          uuid.New(),
			DocumentID:  docID,
			PanelID:     truncateStr(b.PanelID, 64),
			PanelTitle:  truncateStr(b.PanelTitle, 255),
			BlockPath:   truncateStr(b.BlockPath, 255),
			TextContent: b.Text,
			SortOrder:   b.SortOrder,
			UpdatedAt:   now,
		})
	}
	if err := tx.CreateInBatches(rows, 100).Error; err != nil {
		return "", err
	}
	if IsCanvasType(canvasType) {
		// 画布 JSON 没有 mention/embed 节点，引用索引只对知识库文档有意义。
		// 派生块表仍要走一遍：无 html 时只会把旧行软删，不影响画布全删全建路径。
		if err := syncDocBlocks(tx, docID, data, now); err != nil {
			return "", err
		}
		return ext.PlainText, nil
	}
	if err := syncDocBlocks(tx, docID, data, now); err != nil {
		return "", err
	}
	return ext.PlainText, rebuildRefs(tx, docID, data, now)
}

// rebuildRefs 全量重建 doc 的出向引用索引（mention/embed → core_page_references）。
// 非 doc 类型（画布 JSON）跳过：只有 doc 类型的 current_data 有 html 字段。
func rebuildRefs(tx *gorm.DB, docID uuid.UUID, data []byte, now time.Time) error {
	if err := RebuildPageReferences(tx, docID, datatypes.JSON(data), now); err != nil {
		return err
	}
	return syncDocBlockRefs(tx, docID, data, now)
}

func truncateStr(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func validateMeta(title, notes, canvasType, templateID *string) error {
	if title != nil && utf8.RuneCountInString(*title) > maxTitleRunes {
		return ErrValidation
	}
	if notes != nil && utf8.RuneCountInString(*notes) > maxNotesRunes {
		return ErrValidation
	}
	if canvasType != nil && utf8.RuneCountInString(strings.TrimSpace(*canvasType)) > maxTypeRunes {
		return ErrValidation
	}
	if templateID != nil && utf8.RuneCountInString(strings.TrimSpace(*templateID)) > maxTypeRunes {
		return ErrValidation
	}
	return nil
}

func validatePayload(data []byte) error {
	if len(data) > maxCanvasBytes {
		return ErrPayloadTooLarge
	}
	return nil
}

// DocCanvasType 是知识库富文本的 canvas_type。
//
// kb_documents 同时收画布和知识库文档，两者共用修订历史、乐观锁与抽取层。
// 「画布」不是一个表，而是 canvas_type <> 'doc' 的一个集合：画布消费端
// （项目列表计数、项目详情、画布选择器、引用图）统一用 IsCanvasType 判定，
// 不在调用点各自硬编码字符串。
const DocCanvasType = "doc"

// NodeGraphCanvasType 是项目节点画布的 canvas_type。
//
// 项目详情页里的「画布」只指这一类：节点画布是项目的一等资产，
// 而节点绑定的模板副本（canvas_type = 模板 id）与知识库富文本（'doc'）
// 都是别的内容类别，混进项目画布列表会变成打不开的假条目。
const NodeGraphCanvasType = "node-graph"

// 内容分类：把同一张 kb_documents 表里的不同内容切成互不重叠的集合。
//
// - CategoryCanvas    普通画布集合（除知识库富文本外的一切）
// - CategoryNodeGraph 项目节点画布集合（canvas_type = 'node-graph'）
// - CategoryDoc       知识库富文本集合（canvas_type = 'doc'）
const (
	CategoryCanvas    = "canvas"
	CategoryNodeGraph = "node-graph"
	CategoryDoc       = "doc"
)

// IsCategory 报告 category 是否是已知的内容分类。
func IsCategory(category string) bool {
	switch category {
	case CategoryCanvas, CategoryNodeGraph, CategoryDoc:
		return true
	default:
		return false
	}
}

// ApplyCategory 把内容分类翻译成 canvas_type 谓词。
//
// 空分类表示不按分类过滤，行为与旧调用方一致。
func ApplyCategory(q *gorm.DB, category string) *gorm.DB {
	switch category {
	case CategoryNodeGraph:
		return q.Where("canvas_type = ?", NodeGraphCanvasType)
	case CategoryDoc:
		return q.Where("canvas_type = ?", DocCanvasType)
	case CategoryCanvas:
		return q.Where("canvas_type <> ?", DocCanvasType)
	default:
		return q
	}
}

// IsCanvasType 报告这条记录属不属于「画布」集合。
//
// 空串视为画布：历史数据的 canvas_type 是默认值 'canvas'，也可能为空，
// 它们从来不是知识库文档，按画布处理与既有行为一致。
func IsCanvasType(canvasType string) bool {
	return canvasType != DocCanvasType
}

// ListFilter selects one owner's documents. Paged is false when the client
// omitted limit and offset, which preserves the historical full-list response.
type ListFilter struct {
	TemplateID string
	CanvasType string
	// ProjectID 只列出某个项目下的画布。nil 表示不过滤。
	ProjectID *uuid.UUID
	Limit     int
	Offset    int
	Paged     bool
	Archived  bool
	// ExcludeDoc 排除知识库富文本（canvas_type='doc'）。
	// 项目详情页只认画布，doc 混进去会成为打不开的假条目。
	ExcludeDoc bool
	// Category 按内容分类过滤（canvas / node-graph / doc）。
	// 空值表示不按分类过滤；它与 ExcludeDoc 可以同时使用。
	Category string
}

// ListCursorFilter 是可选的 keyset 分页参数。旧 ListFilter/offset 路径保持不变，
// 新调用方显式使用游标，避免深分页时 OFFSET 扫描大量已丢弃行。
type ListCursorFilter struct {
	TemplateID string
	CanvasType string
	// ProjectID 只列出某个项目下的画布。nil 表示不过滤。
	ProjectID *uuid.UUID
	Limit     int
	Cursor    string
	Archived  bool
	// ExcludeDoc 排除知识库富文本（canvas_type='doc'），语义同 ListFilter。
	ExcludeDoc bool
	// Category 按内容分类过滤，语义同 ListFilter。
	Category string
}

// DocumentCursorPage 只用于新的 keyset 请求，不改变旧接口的数组响应。
type DocumentCursorPage struct {
	Items      []model.DocumentSummary `json:"items"`
	NextCursor string                  `json:"nextCursor,omitempty"`
	HasMore    bool                    `json:"hasMore"`
	Limit      int                     `json:"limit"`
	Total      int64                   `json:"total"`
}

// RevisionListFilter 同时支持 offset 首次取页和 cursor 连续取页。
// 未传任何分页参数时，处理器仍调用旧的 ListRevisions 并返回完整数组。
type RevisionListFilter struct {
	Limit  int
	Offset int
	Cursor string
}

// RevisionPage 是分页修订响应；NextCursor 仅在还有下一页时出现。
type RevisionPage struct {
	Items      []model.RevisionSummary `json:"items"`
	NextCursor string                  `json:"nextCursor,omitempty"`
	HasMore    bool                    `json:"hasMore"`
	Limit      int                     `json:"limit"`
	Offset     int                     `json:"offset"`
}

// NormalizeListPage parses limit/offset. Empty inputs mean "not paged".
func NormalizeListPage(limitRaw, offsetRaw string) (limit, offset int, paged bool, err error) {
	limitRaw = strings.TrimSpace(limitRaw)
	offsetRaw = strings.TrimSpace(offsetRaw)
	if limitRaw == "" && offsetRaw == "" {
		return 0, 0, false, nil
	}
	limit = 50
	if limitRaw != "" {
		n, conv := atoiNonNeg(limitRaw)
		if conv != nil || n < 1 {
			return 0, 0, false, ErrValidation
		}
		if n > maxListLimit {
			n = maxListLimit
		}
		limit = n
	}
	if offsetRaw != "" {
		n, conv := atoiNonNeg(offsetRaw)
		if conv != nil || n < 0 {
			return 0, 0, false, ErrValidation
		}
		if n > 10000 {
			return 0, 0, false, ErrValidation
		}
		offset = n
	}
	return limit, offset, true, nil
}

func atoiNonNeg(s string) (int, error) {
	n := 0
	if s == "" {
		return 0, ErrValidation
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, ErrValidation
		}
		n = n*10 + int(r-'0')
		if n > 100000 {
			return 0, ErrValidation
		}
	}
	return n, nil
}

// NormalizeRevisionPage 解析可选修订分页参数。三个参数都为空时 paged=false，
// 处理器会走历史数组响应；只要出现任一参数，默认就限制为 50 条。
// cursor 与 offset 互斥，避免调用方对“从哪里继续”产生两种互相矛盾的定义。
func NormalizeRevisionPage(limitRaw, offsetRaw, cursorRaw string) (filter RevisionListFilter, paged bool, err error) {
	limitRaw = strings.TrimSpace(limitRaw)
	offsetRaw = strings.TrimSpace(offsetRaw)
	cursorRaw = strings.TrimSpace(cursorRaw)
	if limitRaw == "" && offsetRaw == "" && cursorRaw == "" {
		return RevisionListFilter{}, false, nil
	}
	filter.Limit = 50
	if limitRaw != "" {
		n, conv := atoiNonNeg(limitRaw)
		if conv != nil || n < 1 {
			return RevisionListFilter{}, false, ErrValidation
		}
		if n > maxListLimit {
			n = maxListLimit
		}
		filter.Limit = n
	}
	if cursorRaw != "" && offsetRaw != "" {
		return RevisionListFilter{}, false, ErrValidation
	}
	if offsetRaw != "" {
		n, conv := atoiNonNeg(offsetRaw)
		if conv != nil {
			return RevisionListFilter{}, false, ErrValidation
		}
		filter.Offset = n
	}
	filter.Cursor = cursorRaw
	return filter, true, nil
}

// documentKeysetCursor 对应 updated_at DESC, id ASC 的稳定排序键。
type documentKeysetCursor struct {
	UpdatedAt time.Time `json:"u"`
	ID        uuid.UUID `json:"i"`
}

// revisionKeysetCursor 对应 created_at DESC, id ASC 的稳定排序键。
type revisionKeysetCursor struct {
	CreatedAt time.Time `json:"c"`
	ID        uuid.UUID `json:"i"`
}

func encodeKeysetCursor(value interface{}) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func decodeKeysetCursor(raw string, target interface{}) error {
	if strings.TrimSpace(raw) == "" {
		return ErrValidation
	}
	payload, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return ErrValidation
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return ErrValidation
	}
	return nil
}

func documentSummary(doc *model.CanvasDocument) *model.DocumentSummary {
	if doc == nil {
		return nil
	}
	return &model.DocumentSummary{
		ID:             doc.ID,
		Title:          doc.Title,
		Icon:           doc.Icon,
		Notes:          doc.Notes,
		TemplateID:     doc.TemplateID,
		CanvasType:     doc.CanvasType,
		ProjectID:      doc.ProjectID,
		SchemaVersion:  doc.SchemaVersion,
		SaveVersion:    doc.SaveVersion,
		HeadRevisionID: doc.HeadRevisionID,
		CreatedAt:      doc.CreatedAt,
		UpdatedAt:      doc.UpdatedAt,
	}
}

// SetIcon 更新画布标题图标。图标只有一个 emoji 字符，留空表示用默认图标。
func (s *DocumentsService) SetIcon(ownerID, docID uuid.UUID, icon string) (*model.DocumentSummary, error) {
	icon = strings.TrimSpace(icon)
	if utf8.RuneCountInString(icon) > 4 {
		return nil, ErrValidation
	}
	err := bumpSaveVersion(s.db, ownerID, docID, nil, map[string]interface{}{
		"icon":       icon,
		"updated_at": time.Now().UTC(),
	})
	if err != nil {
		if errors.Is(err, ErrSaveConflict) {
			return nil, ErrDocumentNotFound
		}
		return nil, err
	}
	fresh, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	return documentSummary(fresh), nil
}

func (s *DocumentsService) Create(ownerID uuid.UUID, in CreateDocumentInput) (*model.CanvasDocument, error) {
	if err := validateMeta(in.Title, in.Notes, in.CanvasType, in.TemplateID); err != nil {
		return nil, err
	}
	data := in.Data
	if len(data) == 0 || string(data) == "null" {
		data = []byte(`{}`)
	}
	if err := validatePayload(data); err != nil {
		return nil, err
	}
	if len(in.Data) > 0 && string(in.Data) != "null" {
		if err := ValidateCanvasImport(in.Data); err != nil {
			return nil, err
		}
	}
	var meta map[string]interface{}
	_ = json.Unmarshal(data, &meta)

	title := "Untitled"
	if in.Title != nil && *in.Title != "" {
		title = *in.Title
	} else if id, ok := meta["id"].(string); ok && id != "" {
		title = id
	}

	canvasType := "canvas"
	if in.CanvasType != nil && *in.CanvasType != "" {
		canvasType = *in.CanvasType
	} else if t, ok := meta["type"].(string); ok && t != "" {
		canvasType = t
	}

	schemaVersion := 1
	if sv, ok := meta["schemaVersion"].(float64); ok {
		schemaVersion = int(sv)
	}

	var templateID *string
	if in.TemplateID != nil && *in.TemplateID != "" {
		templateID = in.TemplateID
	}

	notes := ""
	if in.Notes != nil {
		notes = *in.Notes
	}

	now := time.Now().UTC()
	docID := uuid.New()
	revID := uuid.New()
	label := "initial"
	hash := hashPayload(data)
	ext := content.Extract(data)

	doc := &model.CanvasDocument{
		ID:             docID,
		OwnerUserID:    ownerID,
		CanvasType:     canvasType,
		Title:          title,
		Notes:          notes,
		SchemaVersion:  schemaVersion,
		SaveVersion:    1,
		CurrentData:    datatypes.JSON(data),
		ContentText:    ext.PlainText,
		HeadRevisionID: &revID,
		TemplateID:     templateID,
		ProjectID:      in.ProjectID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	rev := &model.CanvasRevision{
		ID:           revID,
		DocumentID:   docID,
		ParentID:     nil,
		RevisionType: "snapshot",
		Payload:      datatypes.JSON(data),
		AuthorUserID: &ownerID,
		Label:        &label,
		ContentHash:  &hash,
		CreatedAt:    now,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(doc).Error; err != nil {
			return err
		}
		if err := tx.Create(rev).Error; err != nil {
			return err
		}
		_, err := syncExtract(tx, docID, data, now, canvasType)
		if err != nil {
			return err
		}
		// 知识库文档创建时留首版快照；写失败不阻断创建。
		_ = SnapshotDocVersion(tx, doc)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}

// CloneTitleSuffix is appended to the source title when cloning a canvas.
const CloneTitleSuffix = "（副本）"

// CloneDocumentInput optionally overrides the metadata of the clone.
type CloneDocumentInput struct {
	Title *string
	Notes *string
}

// clonePayload returns a deep copy of a canvas payload.
//
// The copy owns its own backing array, so the clone row and the source row
// never share mutable state. The bytes are copied verbatim (no re-encoding),
// so the clone stores exactly the payload the source has in the database.
//
// Note: kb_documents.current_data is a JSONB column, so Postgres
// normalises the key order of whatever is written. The clone therefore has
// the same stored representation as its source (byte for byte), while the
// key order may differ from the very first client request that created the
// source document.
func clonePayload(src []byte) ([]byte, error) {
	if len(src) == 0 {
		return nil, ErrValidation
	}
	if !json.Valid(src) {
		return nil, ErrValidation
	}
	data := make([]byte, len(src))
	copy(data, src)
	if err := validatePayload(data); err != nil {
		return nil, err
	}
	return data, nil
}

// cloneTitle derives the title of a clone: an explicit non-blank override
// wins, otherwise the source title gets the "（副本）" suffix.
func cloneTitle(srcTitle string, override *string) string {
	title := srcTitle
	if override != nil && strings.TrimSpace(*override) != "" {
		title = strings.TrimSpace(*override)
	} else {
		title = strings.TrimSpace(srcTitle) + CloneTitleSuffix
	}
	return truncateStr(title, maxTitleRunes)
}

// cloneRows holds the rows a clone writes: the new document row and its
// initial revision.
type cloneRows struct {
	doc *model.CanvasDocument
	rev *model.CanvasRevision
}

// buildCloneRows turns a source document plus optional overrides into the rows
// a clone needs. It is pure: no database access, so the "new id, unchanged
// content" contract can be unit tested without a live database.
func buildCloneRows(ownerID uuid.UUID, src *model.CanvasDocument, in CloneDocumentInput, now time.Time) (*cloneRows, error) {
	if err := validateMeta(in.Title, in.Notes, nil, nil); err != nil {
		return nil, err
	}
	data, err := clonePayload(src.CurrentData)
	if err != nil {
		return nil, err
	}

	title := cloneTitle(src.Title, in.Title)

	notes := src.Notes
	if in.Notes != nil {
		notes = *in.Notes
	}

	newID := uuid.New()
	revID := uuid.New()
	label := "clone"
	hash := hashPayload(data)
	ext := content.Extract(data)

	return &cloneRows{
		doc: &model.CanvasDocument{
			ID:             newID,
			OwnerUserID:    ownerID,
			CanvasType:     src.CanvasType,
			Title:          title,
			Notes:          notes,
			SchemaVersion:  src.SchemaVersion,
			SaveVersion:    1,
			CurrentData:    datatypes.JSON(data),
			ContentText:    ext.PlainText,
			HeadRevisionID: &revID,
			TemplateID:     src.TemplateID,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		rev: &model.CanvasRevision{
			ID:           revID,
			DocumentID:   newID,
			ParentID:     nil,
			RevisionType: "snapshot",
			Payload:      datatypes.JSON(data),
			AuthorUserID: &ownerID,
			Label:        &label,
			ContentHash:  &hash,
			CreatedAt:    now,
		},
	}, nil
}

// Clone copies an owned document into a brand new row.
//
// The clone gets a fresh UUID, a deep copy of current_data (attachments and
// panel materials live inside current_data, so they are copied as well) and its
// own initial revision. The source document is never modified.
func (s *DocumentsService) Clone(ownerID, docID uuid.UUID, in CloneDocumentInput) (*model.CanvasDocument, error) {
	src, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}

	rows, err := buildCloneRows(ownerID, src, in, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	doc := rows.doc
	rev := rows.rev
	data := []byte(doc.CurrentData)

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(doc).Error; err != nil {
			return err
		}
		if err := tx.Create(rev).Error; err != nil {
			return err
		}
		_, err := syncExtract(tx, doc.ID, data, doc.CreatedAt, doc.CanvasType)
		return err
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *DocumentsService) List(ownerID uuid.UUID, f ListFilter) ([]model.DocumentSummary, int64, error) {
	scope := func() *gorm.DB {
		q := s.db.Model(&model.CanvasDocument{}).Where("owner_user_id = ?", ownerID)
		if f.Archived {
			q = q.Unscoped().Where("deleted_at IS NOT NULL")
		}
		if f.TemplateID != "" {
			q = q.Where("template_id = ?", f.TemplateID)
		}
		if f.CanvasType != "" {
			q = q.Where("canvas_type = ?", f.CanvasType)
		}
		if f.ExcludeDoc {
			q = q.Where("canvas_type <> ?", DocCanvasType)
		}
		q = ApplyCategory(q, f.Category)
		if f.ProjectID != nil {
			q = q.Where("project_id = ?", *f.ProjectID)
		}
		return q
	}
	var total int64
	if err := scope().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := scope().
		Select("id, title, icon, notes, template_id, canvas_type, project_id, schema_version, save_version, head_revision_id, created_at, updated_at").
		Order("updated_at DESC").
		Order("id ASC")
	if f.Paged {
		q = q.Limit(f.Limit).Offset(f.Offset)
	}
	var rows []model.DocumentSummary
	if err := q.Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	if rows == nil {
		rows = []model.DocumentSummary{}
	}
	return rows, total, nil
}

// ListKeyset 按 updated_at DESC, id ASC 做游标分页。
//
// 深页时使用“上一页最后一条”作为边界，而不是 OFFSET N：排序完全相同时由 id
// 决定先后，因此谓词同时覆盖 updated_at 更小，以及时间相同但 id 更大的行。
// 对静态数据集，每一行恰好出现一次，不会重漏。
func (s *DocumentsService) ListKeyset(ownerID uuid.UUID, f ListCursorFilter) (*DocumentCursorPage, error) {
	if f.Limit <= 0 {
		f.Limit = 50
	}
	if f.Limit > maxListLimit {
		f.Limit = maxListLimit
	}
	scope := func() *gorm.DB {
		q := s.db.Model(&model.CanvasDocument{}).Where("owner_user_id = ?", ownerID)
		if f.Archived {
			q = q.Unscoped().Where("deleted_at IS NOT NULL")
		}
		if f.TemplateID != "" {
			q = q.Where("template_id = ?", f.TemplateID)
		}
		if f.CanvasType != "" {
			q = q.Where("canvas_type = ?", f.CanvasType)
		}
		if f.ExcludeDoc {
			q = q.Where("canvas_type <> ?", DocCanvasType)
		}
		q = ApplyCategory(q, f.Category)
		if f.ProjectID != nil {
			q = q.Where("project_id = ?", *f.ProjectID)
		}
		return q
	}
	var total int64
	if err := scope().Count(&total).Error; err != nil {
		return nil, err
	}
	q := scope().Select("id, title, icon, notes, template_id, canvas_type, project_id, schema_version, save_version, head_revision_id, created_at, updated_at")
	if f.Cursor != "" {
		var cursor documentKeysetCursor
		if err := decodeKeysetCursor(f.Cursor, &cursor); err != nil || cursor.ID == uuid.Nil || cursor.UpdatedAt.IsZero() {
			return nil, ErrValidation
		}
		q = q.Where("(updated_at < ? OR (updated_at = ? AND id > ?))", cursor.UpdatedAt, cursor.UpdatedAt, cursor.ID)
	}
	// 多取一条只用于判断 hasMore，避免为了下一页状态再做一次 COUNT。
	var rows []model.DocumentSummary
	if err := q.Order("updated_at DESC").Order("id ASC").Limit(f.Limit + 1).Find(&rows).Error; err != nil {
		return nil, err
	}
	hasMore := len(rows) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	if rows == nil {
		rows = []model.DocumentSummary{}
	}
	page := &DocumentCursorPage{Items: rows, HasMore: hasMore, Limit: f.Limit, Total: total}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		next, err := encodeKeysetCursor(documentKeysetCursor{UpdatedAt: last.UpdatedAt, ID: last.ID})
		if err != nil {
			return nil, err
		}
		page.NextCursor = next
	}
	return page, nil
}

func (s *DocumentsService) GetOwned(ownerID, docID uuid.UUID) (*model.CanvasDocument, error) {
	var doc model.CanvasDocument
	err := s.db.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDocumentNotFound
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

// updateOperationFingerprint 对保存语义而不是原始 JSON 字节做指纹。
// currentData 先转成内容哈希，因此键顺序或无意义空白变化不会被误判为不同载荷；
// 指针字段仍保留“未传”和“显式空值”的区别，避免元数据更新语义被混淆。
func updateOperationFingerprint(in UpdateDocumentInput) (string, error) {
	fingerprint := struct {
		Title                  *string `json:"title"`
		Notes                  *string `json:"notes"`
		ContentHash            string  `json:"contentHash"`
		ExpectedHeadRevisionID *string `json:"expectedHeadRevisionId"`
		HasExpected            bool    `json:"hasExpectedHeadRevisionId"`
		ExpectedSaveVersion    *int64  `json:"expectedSaveVersion"`
		Checkpoint             bool    `json:"checkpoint"`
	}{
		Title:                  in.Title,
		Notes:                  in.Notes,
		ContentHash:            hashPayload(in.CurrentData),
		ExpectedHeadRevisionID: in.ExpectedHeadRevisionID,
		HasExpected:            in.HasExpected,
		ExpectedSaveVersion:    in.ExpectedSaveVersion,
		Checkpoint:             in.Checkpoint,
	}
	payload, err := json.Marshal(fingerprint)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

func (s *DocumentsService) Update(ownerID, docID uuid.UUID, in UpdateDocumentInput) (*model.CanvasDocument, error) {
	if err := validateMeta(in.Title, in.Notes, nil, nil); err != nil {
		return nil, err
	}
	if len(in.CurrentData) == 0 || string(in.CurrentData) == "null" {
		return nil, ErrValidation
	}
	if err := validatePayload(in.CurrentData); err != nil {
		return nil, err
	}
	operationID := strings.TrimSpace(in.OperationID)
	if in.OperationID != "" && operationID == "" {
		return nil, ErrValidation
	}
	if utf8.RuneCountInString(operationID) > maxOperationIDRunes {
		return nil, ErrValidation
	}
	requestHash, err := updateOperationFingerprint(in)
	if err != nil {
		return nil, err
	}

	doc := &model.CanvasDocument{}
	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var pendingOperation *model.DocumentSaveOperation
		if operationID != "" {
			candidate := &model.DocumentSaveOperation{
				OwnerUserID: ownerID,
				DocumentID:  docID,
				OperationID: operationID,
				RequestHash: requestHash,
				CreatedAt:   now,
				UpdatedAt:   now,
			}
			// 不能“先查再插”：两个并发重试会同时查不到，再把唯一键冲突变成 500。
			// INSERT ... ON CONFLICT DO NOTHING 让数据库裁决谁先占位；失败方随后读取
			// 赢家已提交的首次响应。由于占位和文档更新同事务，失败请求不会留下半成品。
			res := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "owner_user_id"}, {Name: "document_id"}, {Name: "operation_id"}},
				DoNothing: true,
			}).Create(candidate)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				var existing model.DocumentSaveOperation
				if err := tx.Where("owner_user_id = ? AND document_id = ? AND operation_id = ?", ownerID, docID, operationID).
					First(&existing).Error; err != nil {
					return err
				}
				if existing.RequestHash != requestHash {
					return ErrOperationConflict
				}
				if len(existing.Result) == 0 || existing.ResultSaveVersion < 1 {
					return errors.New("saved operation has no committed result")
				}
				if err := json.Unmarshal(existing.Result, doc); err != nil {
					return fmt.Errorf("decode saved operation result: %w", err)
				}
				// 命中幂等记录后直接提交（没有任何文档写入），返回首次响应。
				return nil
			}
			pendingOperation = candidate
		}

		// 行锁让未携带 expectedSaveVersion 的旧客户端也按先后顺序保存；新客户端仍由
		// bumpSaveVersion 的 WHERE save_version = ? 做最终 CAS，行锁不能替代版本检查。
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND owner_user_id = ?", docID, ownerID).First(doc).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDocumentNotFound
			}
			return err
		}
		if err := assertHead(doc.HeadRevisionID, in.ExpectedHeadRevisionID, in.HasExpected); err != nil {
			return err
		}

		newHash := hashPayload(in.CurrentData)
		contentChanged := hashPayload(doc.CurrentData) != newHash
		head := doc.HeadRevisionID
		createCheckpoint := in.Checkpoint
		if createCheckpoint && doc.HeadRevisionID != nil {
			// 自动 checkpoint 只和相邻 head 比较：内容没变或回到 head 内容时不重复
			// 创建相同快照。手动 CreateRevision 不经过这里，仍可按用户意愿连续存版。
			var previous model.CanvasRevision
			err := tx.Select("id, document_id, payload, content_hash").
				Where("id = ? AND document_id = ?", *doc.HeadRevisionID, docID).First(&previous).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err == nil {
				adjacentHash := newHash
				if previous.ContentHash != nil {
					adjacentHash = *previous.ContentHash
				} else {
					adjacentHash = hashPayload(previous.Payload)
				}
				createCheckpoint = adjacentHash != newHash
			}
		}
		if createCheckpoint {
			revID := uuid.New()
			label := "auto-checkpoint"
			rev := &model.CanvasRevision{
				ID:           revID,
				DocumentID:   docID,
				ParentID:     doc.HeadRevisionID,
				RevisionType: "snapshot",
				Payload:      datatypes.JSON(in.CurrentData),
				AuthorUserID: &ownerID,
				Label:        &label,
				ContentHash:  &newHash,
				CreatedAt:    now,
			}
			if err := tx.Create(rev).Error; err != nil {
				return err
			}
			head = &revID
		}
		updates := map[string]interface{}{
			"head_revision_id": head,
			"updated_at":       now,
		}
		if contentChanged {
			role, canWrite, err := actorDocAccess(tx, ownerID, docID)
			if err != nil {
				return err
			}
			if err := GuardLockedBlockMutations(tx, docID, in.CurrentData, role, canWrite); err != nil {
				return err
			}
			// 只有内容确实变化才重写大 JSON；元数据保存不再触碰 current_data。
			updates["current_data"] = datatypes.JSON(in.CurrentData)
		}
		if in.Title != nil && *in.Title != "" {
			updates["title"] = *in.Title
		}
		if in.Notes != nil {
			updates["notes"] = *in.Notes
		}
		// 版本比较与元数据/内容写入在同一条 UPDATE 里完成。即使内容哈希未变，
		// updated_at、title/notes 和 save_version 仍按一次真实保存推进。
		if err := bumpSaveVersion(tx, ownerID, docID, in.ExpectedSaveVersion, updates); err != nil {
			return err
		}
		if createCheckpoint {
			// 清理与新快照、head 推进在同一事务提交；失败时整次保存回滚，
			// 不会出现文档已前进而保留策略只执行一半的中间状态。
			if err := pruneAutomaticCheckpoints(tx, docID); err != nil {
				return err
			}
		}
		if contentChanged {
			// syncExtract 会删除并重建内容块；哈希未变时跳过可避免整块写放大和 ID 抖动。
			if _, err := syncExtract(tx, docID, in.CurrentData, now, doc.CanvasType); err != nil {
				return err
			}
			if err := appendDocAudit(tx, ownerID, docID, AuditActionSave, in.CurrentData); err != nil {
				return err
			}
		}
		if err := tx.Where("id = ?", docID).First(doc).Error; err != nil {
			return err
		}
		// 知识库文档保存时留一条历史快照（历史版本对比用）。
		// 写失败不阻断保存：知识库快照是增强能力，不能拖垮文档主链路。
		_ = SnapshotDocVersion(tx, doc)
		if pendingOperation != nil {
			result, err := json.Marshal(doc)
			if err != nil {
				return err
			}
			// 首次结果与文档写入在同一事务落库，重试恢复的是完整 DocumentFull 响应。
			if err := tx.Model(&model.DocumentSaveOperation{}).
				Where("owner_user_id = ? AND document_id = ? AND operation_id = ?", ownerID, docID, operationID).
				Updates(map[string]interface{}{
					"result_save_version": doc.SaveVersion,
					"result":              datatypes.JSON(result),
					"updated_at":          now,
				}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if errors.Is(err, ErrSaveConflict) {
		if fresh := s.reloadDoc(ownerID, docID); fresh != nil {
			doc = fresh
		}
	}
	return doc, err
}

const maxBatchIDs = 50

// NormalizeBatchIDs parses a batch payload. Empty or oversized lists are rejected.
func NormalizeBatchIDs(raw []string) ([]uuid.UUID, error) {
	if len(raw) == 0 || len(raw) > maxBatchIDs {
		return nil, ErrValidation
	}
	seen := map[uuid.UUID]struct{}{}
	out := make([]uuid.UUID, 0, len(raw))
	for _, item := range raw {
		id, err := uuid.Parse(strings.TrimSpace(item))
		if err != nil {
			return nil, ErrValidation
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil, ErrValidation
	}
	return out, nil
}

// Archive soft-deletes the caller's documents. Rows stay in kb_documents.
func (s *DocumentsService) Archive(ownerID uuid.UUID, ids []uuid.UUID) (int64, error) {
	res := s.db.Where("owner_user_id = ? AND id IN ?", ownerID, ids).Delete(&model.CanvasDocument{})
	return res.RowsAffected, res.Error
}

// RestoreArchived clears deleted_at for the caller's archived documents.
func (s *DocumentsService) RestoreArchived(ownerID uuid.UUID, ids []uuid.UUID) (int64, error) {
	res := s.db.Unscoped().Model(&model.CanvasDocument{}).
		Where("owner_user_id = ? AND id IN ? AND deleted_at IS NOT NULL", ownerID, ids).
		Update("deleted_at", nil)
	return res.RowsAffected, res.Error
}

// Rename 更新标题，并与普通保存共用 save_version 乐观锁。
//
// expectedSaveVersion 使用可变参数只是为了保留旧 Go 调用的源码兼容：省略时代表
// 旧客户端，无条件更新但仍 +1；传入时走原子 CAS。返回值是数据库中的最新摘要，
// 因此 HTTP 层不必用请求里的标题和内存里的旧版本拼一个可能过期的响应。
func (s *DocumentsService) Rename(ownerID, docID uuid.UUID, title string, versions ...*int64) (*model.DocumentSummary, error) {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > maxTitleRunes || len(versions) > 1 {
		return nil, ErrValidation
	}
	var expected *int64
	if len(versions) == 1 {
		expected = versions[0]
	}
	err := bumpSaveVersion(s.db, ownerID, docID, expected, map[string]interface{}{
		"title":      title,
		"updated_at": time.Now().UTC(),
	})
	if err != nil {
		if errors.Is(err, ErrSaveConflict) {
			fresh := s.reloadDoc(ownerID, docID)
			if fresh != nil {
				return documentSummary(fresh), err
			}
			// 更新 0 行且文档不存在，语义仍是 404；存在但版本不同才是 409。
			return nil, ErrDocumentNotFound
		}
		return nil, err
	}
	fresh, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	return documentSummary(fresh), nil
}

func (s *DocumentsService) Delete(ownerID, docID uuid.UUID) error {
	res := s.db.Where("id = ? AND owner_user_id = ?", docID, ownerID).Delete(&model.CanvasDocument{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrDocumentNotFound
	}
	return nil
}

func (s *DocumentsService) CreateRevision(ownerID, docID uuid.UUID, in CreateRevisionInput) (*model.CanvasDocument, *model.CanvasRevision, error) {
	doc, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, nil, err
	}
	if err := assertHead(doc.HeadRevisionID, in.ExpectedHeadRevisionID, in.HasExpected); err != nil {
		return doc, nil, err
	}
	now := time.Now().UTC()
	revID := uuid.New()
	label := "manual-snapshot"
	if in.Label != nil && *in.Label != "" {
		label = *in.Label
	}
	hash := hashPayload(doc.CurrentData)
	rev := &model.CanvasRevision{
		ID:           revID,
		DocumentID:   docID,
		ParentID:     doc.HeadRevisionID,
		RevisionType: "snapshot",
		Payload:      doc.CurrentData,
		AuthorUserID: &ownerID,
		Label:        &label,
		ContentHash:  &hash,
		CreatedAt:    now,
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rev).Error; err != nil {
			return err
		}
		// 存版同样消耗一次保存版本，避免与其它写路径交错时静默覆盖。
		return bumpSaveVersion(tx, ownerID, docID, in.ExpectedSaveVersion, map[string]interface{}{
			"head_revision_id": revID,
			"updated_at":       now,
		})
	})
	if err != nil {
		if errors.Is(err, ErrSaveConflict) {
			if fresh := s.reloadDoc(ownerID, docID); fresh != nil {
				return fresh, nil, err
			}
		}
		return nil, nil, err
	}
	// 重新读一次，拿到数据库里的最新 save_version，而不是在内存里猜。
	fresh, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, nil, err
	}
	return fresh, rev, nil
}

func (s *DocumentsService) ListRevisions(ownerID, docID uuid.UUID) ([]model.RevisionSummary, error) {
	if _, err := s.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	var rows []model.RevisionSummary
	err := s.db.Model(&model.CanvasRevision{}).
		Select("id, document_id, parent_id, revision_type, base_snapshot_id, author_user_id, label, content_hash, created_at").
		Where("document_id = ?", docID).
		// id 只是同时间戳下的稳定次序，不改变旧客户端看到的时间倒序。
		Order("created_at DESC").Order("id ASC").
		Find(&rows).Error
	return rows, err
}

// ListRevisionsPage 提供显式分页；旧 ListRevisions 的完整数组契约保持不变。
// 游标排序键与文档 keyset 同理，只是时间列换成 created_at。
func (s *DocumentsService) ListRevisionsPage(ownerID, docID uuid.UUID, f RevisionListFilter) (*RevisionPage, error) {
	if _, err := s.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	if f.Limit <= 0 {
		f.Limit = 50
	}
	if f.Limit > maxListLimit {
		f.Limit = maxListLimit
	}
	q := s.db.Model(&model.CanvasRevision{}).
		Select("id, document_id, parent_id, revision_type, base_snapshot_id, author_user_id, label, content_hash, created_at").
		Where("document_id = ?", docID)
	if f.Cursor != "" {
		var cursor revisionKeysetCursor
		if err := decodeKeysetCursor(f.Cursor, &cursor); err != nil || cursor.ID == uuid.Nil || cursor.CreatedAt.IsZero() {
			return nil, ErrValidation
		}
		q = q.Where("(created_at < ? OR (created_at = ? AND id > ?))", cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
	}
	var rows []model.RevisionSummary
	if err := q.Order("created_at DESC").Order("id ASC").
		Limit(f.Limit + 1).Offset(f.Offset).Find(&rows).Error; err != nil {
		return nil, err
	}
	hasMore := len(rows) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	if rows == nil {
		rows = []model.RevisionSummary{}
	}
	page := &RevisionPage{Items: rows, HasMore: hasMore, Limit: f.Limit, Offset: f.Offset}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		next, err := encodeKeysetCursor(revisionKeysetCursor{CreatedAt: last.CreatedAt, ID: last.ID})
		if err != nil {
			return nil, err
		}
		page.NextCursor = next
	}
	return page, nil
}

func (s *DocumentsService) Materialize(ownerID, docID, revID uuid.UUID) (map[string]interface{}, error) {
	if _, err := s.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	var rev model.CanvasRevision
	err := s.db.Where("id = ? AND document_id = ?", revID, docID).First(&rev).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrRevisionNotFound
	}
	if err != nil {
		return nil, err
	}
	if rev.RevisionType != "snapshot" {
		return nil, ErrNotSnapshot
	}
	var data interface{}
	_ = json.Unmarshal(rev.Payload, &data)
	return map[string]interface{}{
		"documentId":   docID,
		"revisionId":   rev.ID,
		"revisionType": rev.RevisionType,
		"label":        rev.Label,
		"createdAt":    rev.CreatedAt,
		"contentHash":  rev.ContentHash,
		"data":         data,
	}, nil
}

func (s *DocumentsService) Restore(ownerID, docID uuid.UUID, in RestoreInput) (*model.CanvasDocument, error) {
	doc, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	if err := assertHead(doc.HeadRevisionID, in.ExpectedHeadRevisionID, in.HasExpected); err != nil {
		return doc, err
	}
	preview, err := s.Materialize(ownerID, docID, in.RevisionID)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(preview["data"])
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	newRevID := uuid.New()
	label := fmt.Sprintf("restore:%s", in.RevisionID.String())
	if in.Label != nil && *in.Label != "" {
		label = *in.Label
	}
	hash := hashPayload(payload)
	rev := &model.CanvasRevision{
		ID:           newRevID,
		DocumentID:   docID,
		ParentID:     doc.HeadRevisionID,
		RevisionType: "snapshot",
		Payload:      datatypes.JSON(payload),
		AuthorUserID: &ownerID,
		Label:        &label,
		ContentHash:  &hash,
		CreatedAt:    now,
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rev).Error; err != nil {
			return err
		}
		// 恢复本质上是“用旧快照覆盖当前内容”，必须和普通保存共用同一把
		// 版本锁，否则一次恢复可以覆盖掉别人刚保存的内容。
		if err := bumpSaveVersion(tx, ownerID, docID, in.ExpectedSaveVersion, map[string]interface{}{
			"current_data":     datatypes.JSON(payload),
			"head_revision_id": newRevID,
			"updated_at":       now,
		}); err != nil {
			return err
		}
		if _, err := syncExtract(tx, docID, payload, now, doc.CanvasType); err != nil {
			return err
		}
		return appendDocAudit(tx, ownerID, docID, AuditActionRestore, payload)
	})
	if err != nil {
		if errors.Is(err, ErrSaveConflict) {
			if fresh := s.reloadDoc(ownerID, docID); fresh != nil {
				return fresh, err
			}
		}
		return nil, err
	}
	return s.GetOwned(ownerID, docID)
}

// --- Search / Diff / AI ---

type SearchInput struct {
	Q          string
	TemplateID string
	Limit      int
	ProjectID  string
	// ExcludeDoc 只搜画布：工作台的全文搜索面向画布，
	// 知识库文档有自己的搜索入口（KnowledgeTree）。
	ExcludeDoc bool
}

func (s *DocumentsService) Search(ownerID uuid.UUID, in SearchInput) ([]model.SearchHit, error) {
	q := strings.TrimSpace(in.Q)
	limit := in.Limit
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if q == "" {
		var rows []model.SearchHit
		query := s.db.Model(&model.CanvasDocument{}).Where("owner_user_id = ?", ownerID)
		if in.TemplateID != "" {
			query = query.Where("template_id = ?", in.TemplateID)
		}
		if in.ProjectID != "" {
			query = query.Where("project_id = ?", in.ProjectID)
		}
		if in.ExcludeDoc {
			query = query.Where("canvas_type <> ?", DocCanvasType)
		}
		err := query.Select("id, title, notes, template_id, canvas_type, created_at, updated_at, substr(content_text, 1, 160) AS snippet").
			Order("updated_at DESC").Limit(limit).Find(&rows).Error
		return rows, err
	}

	like := "%" + escapeLike(q) + "%"
	var rows []model.SearchHit
	// FTS (simple) + ILIKE fallback on title/content_text; order by rank then updated_at
	sql := `
SELECT id, title, notes, template_id, canvas_type, created_at, updated_at,
  CASE
    WHEN content_text ILIKE ? THEN substr(content_text, 1, 200)
    WHEN title ILIKE ? THEN title
    ELSE substr(content_text, 1, 160)
  END AS snippet,
  CASE
    WHEN content_tsv @@ plainto_tsquery('simple', ?) THEN ts_rank(content_tsv, plainto_tsquery('simple', ?))
    WHEN title ILIKE ? THEN 0.5
    WHEN content_text ILIKE ? THEN 0.3
    ELSE 0
  END AS rank
FROM kb_documents
WHERE owner_user_id = ? AND deleted_at IS NULL
  AND (
    content_tsv @@ plainto_tsquery('simple', ?)
    OR title ILIKE ?
    OR content_text ILIKE ?
  )`
	args := []interface{}{like, like, q, q, like, like, ownerID, q, like, like}
	if in.TemplateID != "" {
		sql += ` AND template_id = ?`
		args = append(args, in.TemplateID)
	}
	if in.ProjectID != "" {
		sql += ` AND project_id = ?`
		args = append(args, in.ProjectID)
	}
	if in.ExcludeDoc {
		sql += ` AND canvas_type <> ?`
		args = append(args, DocCanvasType)
	}
	sql += ` ORDER BY rank DESC, updated_at DESC LIMIT ?`
	args = append(args, limit)

	err := s.db.Raw(sql, args...).Scan(&rows).Error
	if err != nil {
		// Fallback without content_tsv if column missing
		var fb []model.SearchHit
		fq := s.db.Model(&model.CanvasDocument{}).
			Where("owner_user_id = ? AND (title ILIKE ? OR content_text ILIKE ?)", ownerID, like, like)
		if in.TemplateID != "" {
			fq = fq.Where("template_id = ?", in.TemplateID)
		}
		if in.ProjectID != "" {
			fq = fq.Where("project_id = ?", in.ProjectID)
		}
		if in.ExcludeDoc {
			fq = fq.Where("canvas_type <> ?", DocCanvasType)
		}
		err2 := fq.Select("id, title, notes, template_id, canvas_type, created_at, updated_at, substr(content_text, 1, 160) AS snippet").
			Order("updated_at DESC").Limit(limit).Find(&fb).Error
		if err2 != nil {
			return nil, err2
		}
		for i := range fb {
			fb[i].Snippet = highlightSnippet(fb[i].Snippet, q)
		}
		s.attachBlockMatches(fb, q)
		return fb, nil
	}
	for i := range rows {
		rows[i].Snippet = highlightSnippet(rows[i].Snippet, q)
	}
	s.attachBlockMatches(rows, q)
	return rows, nil
}

type blockMatch struct {
	DocumentID  uuid.UUID
	PanelID     string
	PanelTitle  string
	TextContent string
}

// attachBlockMatches fills the first content block that contains the query.
// The block table is shared by every canvas type; this does not add a table.
func (s *DocumentsService) attachBlockMatches(rows []model.SearchHit, q string) {
	if s.db == nil || len(rows) == 0 || strings.TrimSpace(q) == "" {
		return
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	var matches []blockMatch
	err := s.db.Raw(`
SELECT DISTINCT ON (document_id) document_id, panel_id, panel_title, substr(text_content, 1, 180) AS text_content
FROM kb_content_blocks
WHERE document_id IN ? AND text_content ILIKE ? ESCAPE '\'
ORDER BY document_id, sort_order
`, ids, "%"+escapeLike(q)+"%").Scan(&matches).Error
	if err != nil {
		return
	}
	byID := make(map[uuid.UUID]blockMatch, len(matches))
	for _, match := range matches {
		byID[match.DocumentID] = match
	}
	for i := range rows {
		match, ok := byID[rows[i].ID]
		if !ok {
			continue
		}
		rows[i].PanelID = match.PanelID
		rows[i].PanelTitle = match.PanelTitle
		if match.TextContent != "" {
			rows[i].Snippet = highlightSnippet(match.TextContent, q)
		}
	}
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func highlightSnippet(snippet, q string) string {
	if q == "" || snippet == "" {
		return snippet
	}
	// case-insensitive simple wrap
	lower := strings.ToLower(snippet)
	lq := strings.ToLower(q)
	idx := strings.Index(lower, lq)
	if idx < 0 {
		return snippet
	}
	end := idx + len(q)
	// adjust for multi-byte: use rune-safe by operating on original with byte index from ToLower (same len for ASCII/CJK)
	if end > len(snippet) {
		end = len(snippet)
	}
	return snippet[:idx] + "«" + snippet[idx:end] + "»" + snippet[end:]
}

type DiffResult struct {
	From               map[string]interface{} `json:"from"`
	To                 map[string]interface{} `json:"to"`
	ContentHashChanged bool                   `json:"contentHashChanged"`
	TextDiff           []content.TextOp       `json:"textDiff"`
	Unified            string                 `json:"unified,omitempty"`
	JSONPatch          []jsondiff.Operation   `json:"jsonPatch"`
}

func (s *DocumentsService) Diff(ownerID, docID, ridA uuid.UUID, against *uuid.UUID) (*DiffResult, error) {
	doc, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}

	fromJSON, fromMeta, fromHash, err := s.loadRevisionOrCurrent(doc, ridA, false)
	if err != nil {
		return nil, err
	}

	var toJSON []byte
	var toMeta map[string]interface{}
	var toHash string
	if against != nil {
		toJSON, toMeta, toHash, err = s.loadRevisionOrCurrent(doc, *against, false)
		if err != nil {
			return nil, err
		}
	} else {
		toJSON = []byte(doc.CurrentData)
		toHash = hashPayload(toJSON)
		toMeta = map[string]interface{}{
			"kind":        "current",
			"documentId":  doc.ID,
			"contentHash": toHash,
			"updatedAt":   doc.UpdatedAt,
		}
	}

	// Convention: from = ridA, to = against || current
	fromText := content.Extract(json.RawMessage(fromJSON)).PlainText
	toText := content.Extract(json.RawMessage(toJSON)).PlainText
	ops := content.DiffTextLines(fromText, toText)
	patch, err := content.JSONPatchRFC6902(fromJSON, toJSON)
	if err != nil {
		return nil, err
	}
	if patch == nil {
		patch = []jsondiff.Operation{}
	}
	return &DiffResult{
		From:               fromMeta,
		To:                 toMeta,
		ContentHashChanged: fromHash != toHash,
		TextDiff:           ops,
		Unified:            content.UnifiedDiff(ops),
		JSONPatch:          patch,
	}, nil
}

func (s *DocumentsService) loadRevisionOrCurrent(doc *model.CanvasDocument, revID uuid.UUID, _ bool) ([]byte, map[string]interface{}, string, error) {
	var rev model.CanvasRevision
	err := s.db.Where("id = ? AND document_id = ?", revID, doc.ID).First(&rev).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, "", ErrRevisionNotFound
	}
	if err != nil {
		return nil, nil, "", err
	}
	if rev.RevisionType != "snapshot" {
		return nil, nil, "", ErrNotSnapshot
	}
	hash := ""
	if rev.ContentHash != nil {
		hash = *rev.ContentHash
	} else {
		hash = hashPayload(rev.Payload)
	}
	meta := map[string]interface{}{
		"kind":         "revision",
		"revisionId":   rev.ID,
		"label":        rev.Label,
		"createdAt":    rev.CreatedAt,
		"contentHash":  rev.ContentHash,
		"revisionType": rev.RevisionType,
	}
	return []byte(rev.Payload), meta, hash, nil
}

type AIContext struct {
	DocumentID      uuid.UUID                `json:"documentId"`
	Title           string                   `json:"title"`
	Notes           string                   `json:"notes"`
	TemplateID      *string                  `json:"templateId"`
	CanvasType      string                   `json:"canvasType"`
	CreatedAt       time.Time                `json:"createdAt"`
	UpdatedAt       time.Time                `json:"updatedAt"`
	Summary         string                   `json:"summary"`
	Panels          []map[string]string      `json:"panels"`
	PlainText       string                   `json:"plainText"`
	AttachmentsMeta []content.AttachmentMeta `json:"attachmentsMeta"`
}

func (s *DocumentsService) AIContext(ownerID, docID uuid.UUID) (*AIContext, error) {
	doc, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	ext := content.Extract(json.RawMessage(doc.CurrentData))
	plain := ext.PlainText
	if plain == "" {
		plain = doc.ContentText
	}
	panels := content.GroupPanels(ext.Blocks)
	if len(panels) == 0 {
		var blocks []model.CanvasContentBlock
		_ = s.db.Where("document_id = ?", docID).Order("sort_order ASC").Find(&blocks).Error
		tmp := make([]content.Block, 0, len(blocks))
		for _, b := range blocks {
			tmp = append(tmp, content.Block{
				PanelID: b.PanelID, PanelTitle: b.PanelTitle,
				BlockPath: b.BlockPath, Text: b.TextContent, SortOrder: b.SortOrder,
			})
		}
		panels = content.GroupPanels(tmp)
	}
	return &AIContext{
		DocumentID:      doc.ID,
		Title:           doc.Title,
		Notes:           doc.Notes,
		TemplateID:      doc.TemplateID,
		CanvasType:      doc.CanvasType,
		CreatedAt:       doc.CreatedAt,
		UpdatedAt:       doc.UpdatedAt,
		Summary:         content.SummaryN(plain, 400),
		Panels:          panels,
		PlainText:       plain,
		AttachmentsMeta: ext.Attachments,
	}, nil
}

type AICorpusItem struct {
	DocumentID uuid.UUID           `json:"documentId"`
	Title      string              `json:"title"`
	TemplateID *string             `json:"templateId"`
	CanvasType string              `json:"canvasType"`
	UpdatedAt  time.Time           `json:"updatedAt"`
	Summary    string              `json:"summary"`
	Panels     []map[string]string `json:"panels"`
	PlainText  string              `json:"plainText"`
}

func (s *DocumentsService) AICorpus(ownerID uuid.UUID, templateID, q string, limit int) ([]AICorpusItem, error) {
	if limit <= 0 || limit > 30 {
		limit = 10
	}
	hits, err := s.Search(ownerID, SearchInput{Q: q, TemplateID: templateID, Limit: limit})
	if err != nil {
		return nil, err
	}
	out := make([]AICorpusItem, 0, len(hits))
	if len(hits) == 0 {
		return out, nil
	}

	ids := make([]uuid.UUID, 0, len(hits))
	for _, hit := range hits {
		ids = append(ids, hit.ID)
	}
	var docs []model.CanvasDocument
	// Search 已经按 owner 过滤；批量读取再次限定 owner，既消除逐篇 AIContext 的
	// N+1，也在搜索与读取之间文档被转移/删除时保持权限边界。
	if err := s.db.Where("owner_user_id = ? AND id IN ?", ownerID, ids).Find(&docs).Error; err != nil {
		return nil, err
	}
	docByID := make(map[uuid.UUID]*model.CanvasDocument, len(docs))
	for i := range docs {
		docByID[docs[i].ID] = &docs[i]
	}

	// 先按 Search 的 hits 顺序构造结果。只有 currentData 无法提供面板时，才需要
	// 回退到内容块表；所有回退文档合并在一次 IN 查询里，而不是逐篇 SELECT。
	panelFallbackIDs := make([]uuid.UUID, 0)
	for _, hit := range hits {
		doc, ok := docByID[hit.ID]
		if !ok {
			// 旧实现会静默 continue；至少留下可观测日志，便于发现搜索后删除等竞态。
			log.Printf("ai corpus document unavailable: owner_user_id=%s document_id=%s", ownerID, hit.ID)
			continue
		}
		ext := content.Extract(json.RawMessage(doc.CurrentData))
		plain := ext.PlainText
		if plain == "" {
			plain = doc.ContentText
		}
		panels := content.GroupPanels(ext.Blocks)
		if len(panels) == 0 {
			panelFallbackIDs = append(panelFallbackIDs, doc.ID)
		}
		pt := plain
		if utf8.RuneCountInString(pt) > 4000 {
			r := []rune(pt)
			pt = string(r[:4000]) + "…"
		}
		out = append(out, AICorpusItem{
			DocumentID: doc.ID,
			Title:      doc.Title,
			TemplateID: doc.TemplateID,
			CanvasType: doc.CanvasType,
			UpdatedAt:  doc.UpdatedAt,
			Summary:    content.SummaryN(plain, 400),
			Panels:     panels,
			PlainText:  pt,
		})
	}
	if len(panelFallbackIDs) > 0 {
		var blocks []model.CanvasContentBlock
		if err := s.db.Where("document_id IN ?", panelFallbackIDs).
			Order("document_id ASC").Order("sort_order ASC").Find(&blocks).Error; err != nil {
			// 批量回退失败仍返回已解析的正文，但错误必须可观测，不能静默降级。
			log.Printf("ai corpus fallback blocks failed: owner_user_id=%s error=%v", ownerID, err)
			return out, nil
		}
		blocksByDocument := make(map[uuid.UUID][]content.Block)
		for _, block := range blocks {
			blocksByDocument[block.DocumentID] = append(blocksByDocument[block.DocumentID], content.Block{
				PanelID: block.PanelID, PanelTitle: block.PanelTitle,
				BlockPath: block.BlockPath, Text: block.TextContent, SortOrder: block.SortOrder,
			})
		}
		for i := range out {
			if len(out[i].Panels) == 0 {
				out[i].Panels = content.GroupPanels(blocksByDocument[out[i].DocumentID])
			}
		}
	}
	return out, nil
}
