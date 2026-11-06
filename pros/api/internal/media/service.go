package media

import (
	"context"
	"encoding/hex"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

var allowedTypes = map[string]bool{"image": true, "audio": true, "video": true, "file": true}

// Service owns hashing, isolation, and signing. userID is always an argument
// supplied by the authenticated handler.
type Service struct {
	Store   Store
	Root    string
	Secret  string
	Feishu  FeishuCreds
	Now     func() time.Time
	SyncNow bool // tests run Feishu inline; production schedules it
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

type CheckInput struct {
	SHA256    string
	MediaType string
}

type CheckResult struct {
	Exists       bool   `json:"exists"`
	ID           string `json:"id,omitempty"`
	InsertedPath string `json:"insertedPath,omitempty"`
	SHA256       string `json:"sha256"`
}

func (s *Service) Check(ctx context.Context, userID uuid.UUID, in CheckInput) (CheckResult, error) {
	sha, err := normalizeSHA(in.SHA256)
	if err != nil {
		return CheckResult{}, err
	}
	row, err := s.Store.FindByHash(ctx, userID, sha)
	if err == ErrNotFound {
		return CheckResult{Exists: false, SHA256: sha}, nil
	}
	if err != nil {
		return CheckResult{}, err
	}
	return CheckResult{Exists: true, ID: row.ID.String(), InsertedPath: StablePath(row.ID.String()), SHA256: row.SHA256}, nil
}

type SaveInput struct {
	OriginalName string
	MediaType    string
	MimeType     string
	CategoryID   string
	Body         io.Reader
}

type AssetView struct {
	ID               string    `json:"id"`
	MediaType        string    `json:"mediaType"`
	OriginalName     string    `json:"originalName"`
	MimeType         string    `json:"mimeType"`
	SizeBytes        int64     `json:"sizeBytes"`
	SHA256           string    `json:"sha256"`
	CategoryID       string    `json:"categoryId,omitempty"`
	Status           string    `json:"status"`
	FeishuMediaToken string    `json:"feishuMediaToken,omitempty"`
	FeishuParentType string    `json:"feishuParentType,omitempty"`
	FeishuParentNode string    `json:"feishuParentNode,omitempty"`
	FeishuSyncStatus string    `json:"feishuSyncStatus"`
	InsertedPath     string    `json:"insertedPath"`
	PreviewURL       string    `json:"previewUrl"`
	Created          bool      `json:"created"`
	CreatedAt        time.Time `json:"createdAt"`
}

func (s *Service) Save(ctx context.Context, userID uuid.UUID, in SaveInput) (AssetView, error) {
	mediaType, err := normalizeType(in.MediaType, in.MimeType, in.OriginalName)
	if err != nil {
		return AssetView{}, err
	}
	var categoryID *uuid.UUID
	if strings.TrimSpace(in.CategoryID) != "" {
		id, err := uuid.Parse(in.CategoryID)
		if err != nil {
			return AssetView{}, err
		}
		cats, err := s.Store.ListCategories(ctx, userID)
		if err != nil {
			return AssetView{}, err
		}
		owned := false
		for _, c := range cats {
			if c.ID == id {
				owned = true
				break
			}
		}
		if !owned {
			return AssetView{}, ErrNotFound
		}
		categoryID = &id
	}
	ext := SanitizeExt(in.OriginalName)
	rel, sha, size, err := WriteHashed(s.Root, userID.String(), mediaType, ext, in.Body)
	if err != nil {
		return AssetView{}, err
	}
	plan := PlanFeishu(mediaType, size, s.Feishu)
	mimeType := strings.TrimSpace(in.MimeType)
	if mimeType == "" {
		mimeType = mime.TypeByExtension("." + ext)
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	asset := &model.MediaAsset{
		ID:               uuid.New(),
		UserID:           userID,
		CategoryID:       categoryID,
		MediaType:        mediaType,
		OriginalName:     cleanName(in.OriginalName),
		StoragePath:      rel,
		StorageDisk:      "local",
		MimeType:         mimeType,
		SizeBytes:        size,
		SHA256:           sha,
		FeishuParentType: plan.ParentType,
		FeishuParentNode: plan.ParentNode,
		FeishuSyncStatus: plan.Status,
		Status:           "ready",
		CreatedAt:        s.now(),
	}
	created, err := s.Store.InsertOrGet(ctx, asset)
	if err != nil {
		return AssetView{}, err
	}
	if created && plan.Mode != "skip" {
		if s.SyncNow {
			_ = s.SyncFeishu(ctx, userID, asset.ID)
			reloaded, gerr := s.Store.Get(ctx, userID, asset.ID)
			if gerr == nil {
				asset = reloaded
			}
		} else {
			go func(uid, id uuid.UUID) {
				_ = s.SyncFeishu(context.Background(), uid, id)
			}(userID, asset.ID)
		}
	}
	return s.view(asset, created), nil
}

func (s *Service) SyncFeishu(ctx context.Context, userID, id uuid.UUID) error {
	row, err := s.Store.Get(ctx, userID, id)
	if err != nil {
		return err
	}
	plan := PlanFeishu(row.MediaType, row.SizeBytes, s.Feishu)
	if plan.Mode == "skip" {
		return s.Store.UpdateFeishu(ctx, userID, id, "", "", "", FeishuStatusNotConfigured)
	}
	f, err := OpenRel(s.Root, row.StoragePath)
	if err != nil {
		_ = s.Store.UpdateFeishu(ctx, userID, id, "", plan.ParentType, plan.ParentNode, FeishuStatusFailed)
		return err
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, MaxUploadBytes))
	if err != nil {
		_ = s.Store.UpdateFeishu(ctx, userID, id, "", plan.ParentType, plan.ParentNode, FeishuStatusFailed)
		return err
	}
	token, err := (FeishuClient{Creds: s.Feishu}).Upload(ctx, plan, row.OriginalName, row.MimeType, body)
	if err != nil {
		_ = s.Store.UpdateFeishu(ctx, userID, id, "", plan.ParentType, plan.ParentNode, FeishuStatusFailed)
		return err
	}
	return s.Store.UpdateFeishu(ctx, userID, id, token, plan.ParentType, plan.ParentNode, FeishuStatusSynced)
}

func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (AssetView, error) {
	row, err := s.Store.Get(ctx, userID, id)
	if err != nil {
		return AssetView{}, err
	}
	return s.view(row, false), nil
}

type ListResult struct {
	Items  []AssetView `json:"items"`
	Total  int64       `json:"total"`
	Limit  int         `json:"limit"`
	Offset int         `json:"offset"`
}

func (s *Service) List(ctx context.Context, userID uuid.UUID, filter ListFilter) (ListResult, error) {
	if filter.MediaType != "" {
		if _, err := normalizeType(filter.MediaType, "", ""); err != nil {
			return ListResult{}, err
		}
	}
	if filter.Limit <= 0 {
		filter.Limit = 20
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	rows, total, err := s.Store.List(ctx, userID, filter)
	if err != nil {
		return ListResult{}, err
	}
	items := make([]AssetView, 0, len(rows))
	for i := range rows {
		items = append(items, s.view(&rows[i], false))
	}
	return ListResult{Items: items, Total: total, Limit: filter.Limit, Offset: filter.Offset}, nil
}

func (s *Service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	row, err := s.Store.Get(ctx, userID, id)
	if err != nil {
		return err
	}
	if err := s.Store.DeleteAsset(ctx, userID, id); err != nil {
		return err
	}
	return RemoveRel(s.Root, row.StoragePath)
}

type ReadResult struct {
	Mime    string
	Size    int64
	Range   ByteRange
	Partial bool
	Body    io.ReadCloser
}

func (s *Service) Open(ctx context.Context, userID, id uuid.UUID, expRaw, sig, rangeHeader string) (ReadResult, error) {
	if err := Verify(s.Secret, userID.String(), id.String(), expRaw, sig, s.now()); err != nil {
		return ReadResult{}, err
	}
	row, err := s.Store.Get(ctx, userID, id)
	if err != nil {
		return ReadResult{}, err
	}
	f, err := OpenRel(s.Root, row.StoragePath)
	if err != nil {
		return ReadResult{}, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return ReadResult{}, err
	}
	br, partial, err := ParseRange(rangeHeader, info.Size())
	if err != nil {
		f.Close()
		return ReadResult{}, err
	}
	if partial || br.Start > 0 {
		if _, err = f.Seek(br.Start, io.SeekStart); err != nil {
			f.Close()
			return ReadResult{}, err
		}
	}
	return ReadResult{
		Mime:    row.MimeType,
		Size:    info.Size(),
		Range:   br,
		Partial: partial,
		Body:    &limitedFile{f: f, remain: br.Length()},
	}, nil
}

// limitedFile does not embed *os.File: that would promote WriteTo and ignore the limit.
type limitedFile struct {
	f      *os.File
	remain int64
}

func (l *limitedFile) Read(p []byte) (int, error) {
	if l.remain <= 0 {
		return 0, io.EOF
	}
	if int64(len(p)) > l.remain {
		p = p[:l.remain]
	}
	n, err := l.f.Read(p)
	l.remain -= int64(n)
	return n, err
}

func (l *limitedFile) Close() error { return l.f.Close() }

type RefInput struct {
	RefType string
	RefID   string
}

func (s *Service) AddReference(ctx context.Context, userID, assetID uuid.UUID, in RefInput) (*model.MediaReference, error) {
	refType := strings.TrimSpace(in.RefType)
	if refType != "document" && refType != "chart" && refType != "other" {
		return nil, ErrBadMediaType
	}
	refID := strings.TrimSpace(in.RefID)
	if refID == "" || len(refID) > 128 || strings.Contains(refID, "..") {
		return nil, ErrBadMediaType
	}
	ref := &model.MediaReference{
		ID:           uuid.New(),
		UserID:       userID,
		AssetID:      assetID,
		RefType:      refType,
		RefID:        refID,
		InsertedPath: StablePath(assetID.String()),
		CreatedAt:    s.now(),
	}
	if err := s.Store.AddReference(ctx, ref); err != nil {
		return nil, err
	}
	return ref, nil
}

func (s *Service) DeleteReference(ctx context.Context, userID, assetID, refID uuid.UUID) error {
	return s.Store.DeleteReference(ctx, userID, assetID, refID)
}

func (s *Service) ListCategories(ctx context.Context, userID uuid.UUID) ([]model.MediaCategory, error) {
	return s.Store.ListCategories(ctx, userID)
}

func (s *Service) CreateCategory(ctx context.Context, userID uuid.UUID, name string, parentID *uuid.UUID, sort int) (*model.MediaCategory, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 128 {
		return nil, ErrBadMediaType
	}
	cat := &model.MediaCategory{
		ID:        uuid.New(),
		UserID:    userID,
		Name:      name,
		ParentID:  parentID,
		SortOrder: sort,
		CreatedAt: s.now(),
	}
	if err := s.Store.CreateCategory(ctx, cat); err != nil {
		return nil, err
	}
	return cat, nil
}

func (s *Service) UpdateCategory(ctx context.Context, userID, id uuid.UUID, name *string, parentID *uuid.UUID, parentSet bool, sort *int) error {
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" || utf8.RuneCountInString(trimmed) > 128 {
			return ErrBadMediaType
		}
		name = &trimmed
	}
	return s.Store.UpdateCategory(ctx, userID, id, name, parentID, parentSet, sort)
}

func (s *Service) DeleteCategory(ctx context.Context, userID, id uuid.UUID) error {
	return s.Store.DeleteCategory(ctx, userID, id)
}

func (s *Service) view(row *model.MediaAsset, created bool) AssetView {
	preview, _ := SignedPath(s.Secret, row.UserID.String(), row.ID.String(), s.now())
	cat := ""
	if row.CategoryID != nil {
		cat = row.CategoryID.String()
	}
	return AssetView{
		ID:               row.ID.String(),
		MediaType:        row.MediaType,
		OriginalName:     row.OriginalName,
		MimeType:         row.MimeType,
		SizeBytes:        row.SizeBytes,
		SHA256:           row.SHA256,
		CategoryID:       cat,
		Status:           row.Status,
		FeishuMediaToken: row.FeishuMediaToken,
		FeishuParentType: row.FeishuParentType,
		FeishuParentNode: row.FeishuParentNode,
		FeishuSyncStatus: row.FeishuSyncStatus,
		InsertedPath:     StablePath(row.ID.String()),
		PreviewURL:       preview,
		Created:          created,
		CreatedAt:        row.CreatedAt,
	}
}

func normalizeSHA(raw string) (string, error) {
	sha := strings.ToLower(strings.TrimSpace(raw))
	if len(sha) != 64 {
		return "", ErrBadMediaType
	}
	if _, err := hex.DecodeString(sha); err != nil {
		return "", ErrBadMediaType
	}
	return sha, nil
}

func normalizeType(explicit, mimeType, name string) (string, error) {
	t := strings.ToLower(strings.TrimSpace(explicit))
	if t == "" {
		mt := strings.ToLower(mimeType)
		switch {
		case strings.HasPrefix(mt, "image/"):
			t = "image"
		case strings.HasPrefix(mt, "audio/"):
			t = "audio"
		case strings.HasPrefix(mt, "video/"):
			t = "video"
		default:
			ext := SanitizeExt(name)
			switch ext {
			case "png", "jpg", "jpeg", "gif", "webp", "bmp":
				t = "image"
			case "mp3", "wav", "m4a", "aac", "flac", "ogg":
				t = "audio"
			case "mp4", "webm", "mov", "m4v":
				t = "video"
			default:
				t = "file"
			}
		}
	}
	if !allowedTypes[t] {
		return "", ErrBadMediaType
	}
	return t, nil
}

func cleanName(name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	base = strings.TrimSpace(base)
	if base == "" || base == "." || base == ".." {
		return "file"
	}
	if utf8.RuneCountInString(base) > 255 {
		rs := []rune(base)
		base = string(rs[:255])
	}
	return base
}
