package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// BlobBackend 是附件对象存储。磁盘是默认实现；S3 / MinIO 走同一接口。
type BlobBackend interface {
	// Name 写入 MediaAsset.StorageDisk，例如 local 或 s3。
	Name() string
	Put(ctx context.Context, key string, r io.Reader, size int64) error
	Open(ctx context.Context, key string) (io.ReadCloser, int64, error)
	Remove(ctx context.Context, key string) error
}

// DiskBlobs 把对象写在 Root 下，行为与既有 WriteHashed / OpenRel / RemoveRel 一致。
type DiskBlobs struct {
	Root string
}

func (d DiskBlobs) Name() string { return "local" }

func (d DiskBlobs) Put(_ context.Context, key string, r io.Reader, size int64) error {
	dest, err := absInside(d.Root, key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		return err
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	defer f.Close()
	var reader io.Reader = r
	if size > 0 {
		reader = io.LimitReader(r, size)
	}
	if _, err := io.Copy(f, reader); err != nil {
		return err
	}
	return f.Sync()
}

func (d DiskBlobs) Open(_ context.Context, key string) (io.ReadCloser, int64, error) {
	f, err := OpenRel(d.Root, key)
	if err != nil {
		return nil, 0, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, 0, err
	}
	return f, info.Size(), nil
}

func (d DiskBlobs) Remove(_ context.Context, key string) error {
	return RemoveRel(d.Root, key)
}

// MemoryBlobs 是测试用的内存实现，不依赖真实 MinIO。
type MemoryBlobs struct {
	mu   sync.Mutex
	data map[string][]byte
}

func NewMemoryBlobs() *MemoryBlobs {
	return &MemoryBlobs{data: map[string][]byte{}}
}

func (m *MemoryBlobs) Name() string { return "s3" }

func (m *MemoryBlobs) Put(_ context.Context, key string, r io.Reader, size int64) error {
	var reader io.Reader = r
	if size > 0 {
		reader = io.LimitReader(r, size)
	}
	b, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.data == nil {
		m.data = map[string][]byte{}
	}
	cp := append([]byte(nil), b...)
	m.data[key] = cp
	return nil
}

func (m *MemoryBlobs) Open(_ context.Context, key string) (io.ReadCloser, int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b, ok := m.data[key]
	if !ok {
		return nil, 0, os.ErrNotExist
	}
	cp := append([]byte(nil), b...)
	return io.NopCloser(bytes.NewReader(cp)), int64(len(cp)), nil
}

func (m *MemoryBlobs) Remove(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.data, key)
	return nil
}

func (m *MemoryBlobs) Has(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.data[key]
	return ok
}

func (s *Service) blobs() BlobBackend {
	if s.Blobs != nil {
		return s.Blobs
	}
	return DiskBlobs{Root: s.Root}
}

// writeHashed 先在本地临时文件上算哈希，再写入当前对象后端。
// 磁盘后端直接走既有 WriteHashed，保持路径与权限不变。
func (s *Service) writeHashed(userID, mediaType, ext string, r io.Reader) (rel, sha string, size int64, err error) {
	backend := s.blobs()
	if backend.Name() == "local" {
		return WriteHashed(s.Root, userID, mediaType, ext, r)
	}
	if err = os.MkdirAll(filepath.Join(s.Root, "tmp"), 0o750); err != nil {
		return "", "", 0, err
	}
	tmp, err := os.CreateTemp(filepath.Join(s.Root, "tmp"), "up-*")
	if err != nil {
		return "", "", 0, err
	}
	tmpName := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}()
	sum := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, sum), io.LimitReader(r, MaxUploadBytes+1))
	if err != nil {
		return "", "", 0, err
	}
	if n > MaxUploadBytes {
		return "", "", 0, ErrTooLarge
	}
	if err = tmp.Sync(); err != nil {
		return "", "", 0, err
	}
	if _, err = tmp.Seek(0, io.SeekStart); err != nil {
		return "", "", 0, err
	}
	sha = hex.EncodeToString(sum.Sum(nil))
	rel = RelPath(userID, mediaType, sha, ext)
	if err = backend.Put(context.Background(), rel, tmp, n); err != nil {
		return "", "", 0, err
	}
	return rel, sha, n, nil
}

func (s *Service) openBlob(ctx context.Context, disk, key string) (io.ReadCloser, int64, error) {
	backend := s.blobs()
	if disk == "s3" || backend.Name() == "s3" {
		rc, size, err := backend.Open(ctx, key)
		if err == nil {
			return rc, size, nil
		}
		// 迁移过渡：对象存储读不到时，再试本地磁盘。
		if s.Root != "" {
			if f, ferr := OpenRel(s.Root, key); ferr == nil {
				info, sterr := f.Stat()
				if sterr != nil {
					_ = f.Close()
					return nil, 0, sterr
				}
				return f, info.Size(), nil
			}
		}
		return nil, 0, err
	}
	return DiskBlobs{Root: s.Root}.Open(ctx, key)
}

func (s *Service) removeBlob(ctx context.Context, disk, key string) error {
	backend := s.blobs()
	if disk == "s3" || backend.Name() == "s3" {
		_ = backend.Remove(ctx, key)
		if s.Root != "" {
			_ = RemoveRel(s.Root, key)
		}
		return nil
	}
	return RemoveRel(s.Root, key)
}

func sanitizeObjectKey(key string) string {
	return strings.TrimLeft(strings.ReplaceAll(key, "\\", "/"), "/")
}
