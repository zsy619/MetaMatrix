package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/content"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"github.com/wI2L/jsondiff"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var (
	ErrDocumentNotFound = errors.New("document not found")
	ErrRevisionNotFound = errors.New("revision not found")
	ErrHeadConflict     = errors.New("head_revision_id conflict")
	ErrNotSnapshot      = errors.New("MVP only materializes snapshot revisions")
	ErrValidation       = errors.New("validation")
	ErrPayloadTooLarge  = errors.New("payload too large")
	ErrInvalidHead      = errors.New("invalid expectedHeadRevisionId")
)

const (
	maxTitleRunes  = 255
	maxNotesRunes  = 8000
	maxTypeRunes   = 64
	maxCanvasBytes = 2 << 20
	maxListLimit   = 100
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
	Data       json.RawMessage
}

type UpdateDocumentInput struct {
	Title                  *string
	Notes                  *string
	CurrentData            json.RawMessage
	ExpectedHeadRevisionID *string // nil = skip check; pointer to empty/"null" = expect null head
	HasExpected            bool
	Checkpoint             bool
}

type CreateRevisionInput struct {
	ExpectedHeadRevisionID *string
	HasExpected            bool
	Label                  *string
}

type RestoreInput struct {
	RevisionID             uuid.UUID
	ExpectedHeadRevisionID *string
	HasExpected            bool
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

// syncExtract rewrites content_text and rebuilds canvas_content_blocks inside tx.
func syncExtract(tx *gorm.DB, docID uuid.UUID, data []byte, now time.Time) (string, error) {
	ext := content.Extract(data)
	if err := tx.Model(&model.CanvasDocument{}).Where("id = ?", docID).
		Update("content_text", ext.PlainText).Error; err != nil {
		return "", err
	}
	if err := tx.Where("document_id = ?", docID).Delete(&model.CanvasContentBlock{}).Error; err != nil {
		return "", err
	}
	if len(ext.Blocks) == 0 {
		return ext.PlainText, nil
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
	return ext.PlainText, nil
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

// ListFilter selects one owner's documents. Paged is false when the client
// omitted limit and offset, which preserves the historical full-list response.
type ListFilter struct {
	TemplateID string
	CanvasType string
	Limit      int
	Offset     int
	Paged      bool
	Archived   bool
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
		CurrentData:    datatypes.JSON(data),
		ContentText:    ext.PlainText,
		HeadRevisionID: &revID,
		TemplateID:     templateID,
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
		_, err := syncExtract(tx, docID, data, now)
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
		return q
	}
	var total int64
	if err := scope().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := scope().
		Select("id, title, notes, template_id, canvas_type, schema_version, head_revision_id, created_at, updated_at").
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

func (s *DocumentsService) Update(ownerID, docID uuid.UUID, in UpdateDocumentInput) (*model.CanvasDocument, error) {
	doc, err := s.GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	if err := validateMeta(in.Title, in.Notes, nil, nil); err != nil {
		return nil, err
	}
	if err := assertHead(doc.HeadRevisionID, in.ExpectedHeadRevisionID, in.HasExpected); err != nil {
		return doc, err
	}
	if len(in.CurrentData) == 0 || string(in.CurrentData) == "null" {
		return nil, ErrValidation
	}
	if err := validatePayload(in.CurrentData); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		head := doc.HeadRevisionID
		if in.Checkpoint {
			revID := uuid.New()
			label := "auto-checkpoint"
			hash := hashPayload(in.CurrentData)
			rev := &model.CanvasRevision{
				ID:           revID,
				DocumentID:   docID,
				ParentID:     doc.HeadRevisionID,
				RevisionType: "snapshot",
				Payload:      datatypes.JSON(in.CurrentData),
				AuthorUserID: &ownerID,
				Label:        &label,
				ContentHash:  &hash,
				CreatedAt:    now,
			}
			if err := tx.Create(rev).Error; err != nil {
				return err
			}
			head = &revID
		}
		updates := map[string]interface{}{
			"current_data":     datatypes.JSON(in.CurrentData),
			"head_revision_id": head,
			"updated_at":       now,
		}
		if in.Title != nil && *in.Title != "" {
			updates["title"] = *in.Title
		}
		if in.Notes != nil {
			updates["notes"] = *in.Notes
		}
		if err := tx.Model(&model.CanvasDocument{}).Where("id = ?", docID).Updates(updates).Error; err != nil {
			return err
		}
		if _, err := syncExtract(tx, docID, in.CurrentData, now); err != nil {
			return err
		}
		return tx.Where("id = ?", docID).First(doc).Error
	})
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

// Archive soft-deletes the caller's documents. Rows stay in canvas_documents.
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
		return tx.Model(doc).Updates(map[string]interface{}{
			"head_revision_id": revID,
			"updated_at":       now,
		}).Error
	})
	if err != nil {
		return nil, nil, err
	}
	doc.HeadRevisionID = &revID
	doc.UpdatedAt = now
	return doc, rev, nil
}

func (s *DocumentsService) ListRevisions(ownerID, docID uuid.UUID) ([]model.RevisionSummary, error) {
	if _, err := s.GetOwned(ownerID, docID); err != nil {
		return nil, err
	}
	var rows []model.RevisionSummary
	err := s.db.Model(&model.CanvasRevision{}).
		Select("id, document_id, parent_id, revision_type, base_snapshot_id, author_user_id, label, content_hash, created_at").
		Where("document_id = ?", docID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
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
		if err := tx.Model(doc).Updates(map[string]interface{}{
			"current_data":     datatypes.JSON(payload),
			"head_revision_id": newRevID,
			"updated_at":       now,
		}).Error; err != nil {
			return err
		}
		_, err := syncExtract(tx, docID, payload, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetOwned(ownerID, docID)
}

// --- Search / Diff / AI ---

type SearchInput struct {
	Q          string
	TemplateID string
	Limit      int
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
		err := query.Select("id, title, notes, template_id, canvas_type, created_at, updated_at, left(content_text, 160) AS snippet").
			Order("updated_at DESC").Limit(limit).Find(&rows).Error
		return rows, err
	}

	like := "%" + escapeLike(q) + "%"
	var rows []model.SearchHit
	// FTS (simple) + ILIKE fallback on title/content_text; order by rank then updated_at
	sql := `
SELECT id, title, notes, template_id, canvas_type, created_at, updated_at,
  CASE
    WHEN content_text ILIKE ? THEN left(content_text, 200)
    WHEN title ILIKE ? THEN title
    ELSE left(content_text, 160)
  END AS snippet,
  CASE
    WHEN content_tsv @@ plainto_tsquery('simple', ?) THEN ts_rank(content_tsv, plainto_tsquery('simple', ?))
    WHEN title ILIKE ? THEN 0.5
    WHEN content_text ILIKE ? THEN 0.3
    ELSE 0
  END AS rank
FROM canvas_documents
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
		err2 := fq.Select("id, title, notes, template_id, canvas_type, created_at, updated_at, left(content_text, 160) AS snippet").
			Order("updated_at DESC").Limit(limit).Find(&fb).Error
		return fb, err2
	}
	for i := range rows {
		rows[i].Snippet = highlightSnippet(rows[i].Snippet, q)
	}
	return rows, nil
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
	for _, h := range hits {
		ctx, err := s.AIContext(ownerID, h.ID)
		if err != nil {
			continue
		}
		pt := ctx.PlainText
		if utf8.RuneCountInString(pt) > 4000 {
			r := []rune(pt)
			pt = string(r[:4000]) + "…"
		}
		out = append(out, AICorpusItem{
			DocumentID: ctx.DocumentID,
			Title:      ctx.Title,
			TemplateID: ctx.TemplateID,
			CanvasType: ctx.CanvasType,
			UpdatedAt:  ctx.UpdatedAt,
			Summary:    ctx.Summary,
			Panels:     ctx.Panels,
			PlainText:  pt,
		})
	}
	return out, nil
}
