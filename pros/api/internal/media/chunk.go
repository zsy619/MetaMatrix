package media

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultPartSize int64 = 4 * 1024 * 1024
	MinPartSize     int64 = 256 * 1024
	MaxPartSize     int64 = 8 * 1024 * 1024
	chunkTTL              = 24 * time.Hour
)

var ErrChunkIncomplete = errors.New("media upload is missing parts")

type chunkSession struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	OriginalName string    `json:"originalName"`
	MediaType    string    `json:"mediaType"`
	MimeType     string    `json:"mimeType"`
	CategoryID   string    `json:"categoryId"`
	SizeBytes    int64     `json:"sizeBytes"`
	PartSize     int64     `json:"partSize"`
	CreatedAt    time.Time `json:"createdAt"`
}

type PrepareInput struct {
	OriginalName string
	MediaType    string
	MimeType     string
	CategoryID   string
	SizeBytes    int64
	PartSize     int64
}

type ChunkStatus struct {
	UploadID  string `json:"uploadId"`
	SizeBytes int64  `json:"sizeBytes"`
	PartSize  int64  `json:"partSize"`
	PartCount int    `json:"partCount"`
	Received  []int  `json:"received"`
	Missing   []int  `json:"missing"`
}

func (s *Service) PrepareChunk(ctx context.Context, userID uuid.UUID, in PrepareInput) (ChunkStatus, error) {
	if in.SizeBytes <= 0 || in.SizeBytes > MaxUploadBytes {
		return ChunkStatus{}, ErrTooLarge
	}
	mediaType, err := normalizeType(in.MediaType, in.MimeType, in.OriginalName)
	if err != nil {
		return ChunkStatus{}, err
	}
	part := in.PartSize
	if part == 0 {
		part = DefaultPartSize
	}
	if part < MinPartSize || part > MaxPartSize {
		return ChunkStatus{}, ErrBadMediaType
	}
	session := chunkSession{
		ID:           uuid.NewString(),
		UserID:       userID.String(),
		OriginalName: cleanName(in.OriginalName),
		MediaType:    mediaType,
		MimeType:     in.MimeType,
		CategoryID:   strings.TrimSpace(in.CategoryID),
		SizeBytes:    in.SizeBytes,
		PartSize:     part,
		CreatedAt:    s.now(),
	}
	dir, err := s.chunkDir(session.ID)
	if err != nil {
		return ChunkStatus{}, err
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return ChunkStatus{}, err
	}
	if err := writeChunkMeta(dir, session); err != nil {
		return ChunkStatus{}, err
	}
	return s.chunkStatus(session)
}

func (s *Service) ChunkStatus(ctx context.Context, userID uuid.UUID, uploadID string) (ChunkStatus, error) {
	session, _, err := s.loadOwnChunk(userID, uploadID)
	if err != nil {
		return ChunkStatus{}, err
	}
	return s.chunkStatus(session)
}

func (s *Service) PutChunk(ctx context.Context, userID uuid.UUID, uploadID string, index int, r io.Reader) (ChunkStatus, error) {
	session, dir, err := s.loadOwnChunk(userID, uploadID)
	if err != nil {
		return ChunkStatus{}, err
	}
	count := partCount(session.SizeBytes, session.PartSize)
	if index < 0 || index >= count {
		return ChunkStatus{}, ErrBadMediaType
	}
	expect := session.PartSize
	if index == count-1 {
		last := session.SizeBytes % session.PartSize
		if last != 0 {
			expect = last
		}
	}
	partPath := filepath.Join(dir, partName(index))
	tmp, err := os.CreateTemp(dir, "part-*")
	if err != nil {
		return ChunkStatus{}, err
	}
	tmpName := tmp.Name()
	n, copyErr := io.Copy(tmp, io.LimitReader(r, expect+1))
	closeErr := tmp.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tmpName)
		if copyErr != nil {
			return ChunkStatus{}, copyErr
		}
		return ChunkStatus{}, closeErr
	}
	if n != expect {
		_ = os.Remove(tmpName)
		return ChunkStatus{}, ErrChunkIncomplete
	}
	if err := os.Rename(tmpName, partPath); err != nil {
		_ = os.Remove(tmpName)
		return ChunkStatus{}, err
	}
	_ = os.Chmod(partPath, 0o640)
	return s.chunkStatus(session)
}

func (s *Service) FinishChunk(ctx context.Context, userID uuid.UUID, uploadID string) (AssetView, error) {
	session, dir, err := s.loadOwnChunk(userID, uploadID)
	if err != nil {
		return AssetView{}, err
	}
	status, err := s.chunkStatus(session)
	if err != nil {
		return AssetView{}, err
	}
	if len(status.Missing) > 0 {
		return AssetView{}, ErrChunkIncomplete
	}
	files := make([]*os.File, status.PartCount)
	readers := make([]io.Reader, status.PartCount)
	defer func() {
		for _, f := range files {
			if f != nil {
				_ = f.Close()
			}
		}
	}()
	for i := 0; i < status.PartCount; i++ {
		f, err := os.Open(filepath.Join(dir, partName(i)))
		if err != nil {
			return AssetView{}, err
		}
		files[i] = f
		readers[i] = f
	}
	view, err := s.Save(ctx, userID, SaveInput{
		OriginalName: session.OriginalName,
		MediaType:    session.MediaType,
		MimeType:     session.MimeType,
		CategoryID:   session.CategoryID,
		Body:         io.MultiReader(readers...),
	})
	if err != nil {
		return AssetView{}, err
	}
	_ = os.RemoveAll(dir)
	return view, nil
}

func (s *Service) loadOwnChunk(userID uuid.UUID, uploadID string) (chunkSession, string, error) {
	dir, err := s.chunkDir(uploadID)
	if err != nil {
		return chunkSession{}, "", err
	}
	session, err := readChunkMeta(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return chunkSession{}, "", ErrNotFound
		}
		return chunkSession{}, "", err
	}
	if session.UserID != userID.String() {
		return chunkSession{}, "", ErrNotFound
	}
	if s.now().After(session.CreatedAt.Add(chunkTTL)) {
		_ = os.RemoveAll(dir)
		return chunkSession{}, "", ErrNotFound
	}
	return session, dir, nil
}

func (s *Service) chunkDir(uploadID string) (string, error) {
	id := strings.TrimSpace(uploadID)
	if _, err := uuid.Parse(id); err != nil {
		return "", ErrBadMediaType
	}
	return absInside(s.Root, "uploads/"+id)
}

func (s *Service) chunkStatus(session chunkSession) (ChunkStatus, error) {
	dir, err := s.chunkDir(session.ID)
	if err != nil {
		return ChunkStatus{}, err
	}
	count := partCount(session.SizeBytes, session.PartSize)
	received := make([]int, 0, count)
	missing := make([]int, 0)
	for i := 0; i < count; i++ {
		info, err := os.Stat(filepath.Join(dir, partName(i)))
		if err != nil {
			missing = append(missing, i)
			continue
		}
		expect := session.PartSize
		if i == count-1 {
			last := session.SizeBytes % session.PartSize
			if last != 0 {
				expect = last
			}
		}
		if info.Size() != expect {
			missing = append(missing, i)
			continue
		}
		received = append(received, i)
	}
	return ChunkStatus{
		UploadID:  session.ID,
		SizeBytes: session.SizeBytes,
		PartSize:  session.PartSize,
		PartCount: count,
		Received:  received,
		Missing:   missing,
	}, nil
}

func partCount(size, part int64) int {
	n := int(size / part)
	if size%part != 0 {
		n++
	}
	if n == 0 {
		return 1
	}
	return n
}

func partName(index int) string {
	return "part-" + strconv.Itoa(index)
}

func writeChunkMeta(dir string, session chunkSession) error {
	raw, err := json.Marshal(session)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "meta.json"), raw, 0o640)
}

func readChunkMeta(dir string) (chunkSession, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		return chunkSession{}, err
	}
	var session chunkSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return chunkSession{}, err
	}
	return session, nil
}
