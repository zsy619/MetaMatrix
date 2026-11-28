package media

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	// sequentialChunkReader 只在当前分片被读取时持有一个文件描述符。
	// 旧实现先把所有分片 os.Open 再 io.MultiReader，大文件数千分片时会耗尽进程 FD；
	// 新实现每读完一个分片立即关闭，再打开下一个，合并顺序与 MultiReader 完全一致。
	body := &sequentialChunkReader{dir: dir, count: status.PartCount}
	defer func() { _ = body.Close() }()
	view, err := s.Save(ctx, userID, SaveInput{
		OriginalName: session.OriginalName,
		MediaType:    session.MediaType,
		MimeType:     session.MimeType,
		CategoryID:   session.CategoryID,
		Body:         body,
	})
	if err != nil {
		return AssetView{}, err
	}
	// 只有 Save 完整写盘、计算哈希并成功登记资产后才删除会话；
	// 任一分片读取失败或数据库保存失败都会保留分片，调用方可以断点重试。
	_ = os.RemoveAll(dir)
	return view, nil
}

// sequentialChunkReader 是 io.MultiReader 的懒打开等价实现。
// current 是唯一可能打开的分片；index 始终指向下一个待打开分片。
type sequentialChunkReader struct {
	dir     string
	count   int
	index   int
	current *os.File
}

func (r *sequentialChunkReader) Read(p []byte) (int, error) {
	for {
		if r.current == nil {
			if r.index >= r.count {
				return 0, io.EOF
			}
			f, err := os.Open(filepath.Join(r.dir, partName(r.index)))
			if err != nil {
				return 0, err
			}
			r.current = f
			r.index++
		}

		n, readErr := r.current.Read(p)
		if errors.Is(readErr, io.EOF) {
			// defer 在循环里会累积 FD，所以必须在每次 EOF 的当下显式关闭。
			closeErr := r.current.Close()
			r.current = nil
			if closeErr != nil {
				return n, closeErr
			}
			if n > 0 {
				return n, nil
			}
			continue
		}
		if readErr != nil {
			_ = r.current.Close()
			r.current = nil
			return n, readErr
		}
		return n, nil
	}
}

func (r *sequentialChunkReader) Close() error {
	r.index = r.count
	if r.current == nil {
		return nil
	}
	err := r.current.Close()
	r.current = nil
	return err
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
	if err := validateChunkSession(uploadID, session); err != nil {
		// 损坏或错绑的元数据不能驱动读取、合并或删除，统一按不可见会话处理。
		return chunkSession{}, "", ErrNotFound
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

// CleanupExpiredChunks 可由服务启动时和后台 ticker 定期直接调用。
// 它扫描 uploads 根目录，不依赖用户再次访问会话；发现损坏数据时继续处理其他目录，
// 最后通过 errors.Join 汇总错误，便于启动日志或周期任务监控发现问题。
func (s *Service) CleanupExpiredChunks() error {
	uploadsRoot, err := absInside(s.Root, "uploads")
	if err != nil {
		return err
	}
	rootInfo, err := os.Lstat(uploadsRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	// RemoveAll 会跟随 uploads 这个中间符号链接定位目标，因此链接目录必须拒绝，
	// 否则一个伪造的 uploads 链接可能把清理操作导向存储根之外。
	if rootInfo.Mode()&os.ModeSymlink != 0 || !rootInfo.IsDir() {
		return ErrPathEscape
	}
	entries, err := os.ReadDir(uploadsRoot)
	if err != nil {
		return err
	}

	now := s.now()
	var cleanupErrors []error
	for _, entry := range entries {
		dir, err := s.chunkDir(entry.Name())
		if err != nil {
			// 非 UUID 文件/目录不是本分片协议创建的数据，不删除也不当作会话。
			continue
		}
		info, err := os.Lstat(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("inspect chunk session %s: %w", entry.Name(), err))
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			continue
		}

		session, err := readChunkMeta(dir)
		if err != nil {
			// 无法解析就无法证明归属和创建时间。保留现场并报告，而不是按目录时间猜着删。
			cleanupErrors = append(cleanupErrors, fmt.Errorf("read chunk session %s: %w", entry.Name(), err))
			continue
		}
		if err := validateChunkSession(entry.Name(), session); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("validate chunk session %s: %w", entry.Name(), err))
			continue
		}
		if !now.After(session.CreatedAt.Add(chunkTTL)) {
			continue
		}
		if err := os.RemoveAll(dir); err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("remove expired chunk session %s: %w", entry.Name(), err))
		}
	}
	return errors.Join(cleanupErrors...)
}

// validateChunkSession 校验元数据与目录的绑定关系及清理所需的归属字段。
// 清理任务没有登录用户上下文，能依赖的最低归属证明就是有效 UserID、匹配的会话 ID，
// 以及 PrepareChunk 写入的合法大小参数；任何一项损坏都选择保留而非误删。
func validateChunkSession(uploadID string, session chunkSession) error {
	if session.ID != uploadID {
		return ErrBadMediaType
	}
	if _, err := uuid.Parse(session.UserID); err != nil {
		return ErrBadMediaType
	}
	if session.CreatedAt.IsZero() || session.SizeBytes <= 0 || session.SizeBytes > MaxUploadBytes {
		return ErrBadMediaType
	}
	if session.PartSize < MinPartSize || session.PartSize > MaxPartSize {
		return ErrBadMediaType
	}
	return nil
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
