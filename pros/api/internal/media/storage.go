package media

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	// MaxUploadBytes is a safety cap for a single streamed write. Chunked
	// resume is a later change; this only stops an unbounded reader.
	MaxUploadBytes int64 = 2 << 30
)

var (
	ErrPathEscape = errors.New("media path escapes storage root")
	ErrTooLarge   = errors.New("media file exceeds size cap")
)

// RelPath is the on-disk layout relative to the storage root:
// {user}/{type}/{sha[0:2]}/{sha}.{ext}
func RelPath(userID, mediaType, sha, ext string) string {
	return userID + "/" + mediaType + "/" + sha[:2] + "/" + sha + "." + ext
}

// SanitizeExt keeps a short lowercase suffix. It never trusts the rest of the filename.
func SanitizeExt(name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	i := strings.LastIndex(base, ".")
	if i < 0 || i == len(base)-1 {
		return "bin"
	}
	ext := strings.ToLower(base[i+1:])
	if len(ext) > 8 {
		return "bin"
	}
	for _, r := range ext {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return "bin"
		}
	}
	if ext == "" {
		return "bin"
	}
	return ext
}

// WriteHashed streams r to a temp file under root/tmp, hashes it, then renames
// onto the relative content path. The returned path is relative. The absolute
// location is not part of the result.
func WriteHashed(root, userID, mediaType, ext string, r io.Reader) (rel, sha string, size int64, err error) {
	if err = os.MkdirAll(filepath.Join(root, "tmp"), 0o750); err != nil {
		return "", "", 0, err
	}
	tmp, err := os.CreateTemp(filepath.Join(root, "tmp"), "up-*")
	if err != nil {
		return "", "", 0, err
	}
	tmpName := tmp.Name()
	defer func() {
		if tmp != nil {
			_ = tmp.Close()
		}
		if tmpName != "" {
			_ = os.Remove(tmpName)
		}
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
	if err = tmp.Close(); err != nil {
		return "", "", 0, err
	}
	tmp = nil

	sha = hex.EncodeToString(sum.Sum(nil))
	rel = RelPath(userID, mediaType, sha, ext)
	dest, err := absInside(root, rel)
	if err != nil {
		return "", "", 0, err
	}
	if err = os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		return "", "", 0, err
	}
	if err = os.Rename(tmpName, dest); err != nil {
		return "", "", 0, err
	}
	tmpName = ""
	if err = os.Chmod(dest, 0o640); err != nil {
		return "", "", 0, err
	}
	return rel, sha, n, nil
}

// OpenRel opens a relative storage path. Absolute paths and ".." are rejected.
func OpenRel(root, rel string) (*os.File, error) {
	dest, err := absInside(root, rel)
	if err != nil {
		return nil, err
	}
	return os.Open(dest)
}

// RemoveRel deletes one relative file. It refuses to delete the root itself.
func RemoveRel(root, rel string) error {
	dest, err := absInside(root, rel)
	if err != nil {
		return err
	}
	err = os.Remove(dest)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func absInside(root, rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	if rel == "" || filepath.IsAbs(rel) || strings.Contains(rel, "..") || strings.Contains(rel, "\\") {
		return "", ErrPathEscape
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	dest := filepath.Join(rootAbs, filepath.FromSlash(rel))
	destAbs, err := filepath.Abs(dest)
	if err != nil {
		return "", err
	}
	sep := string(os.PathSeparator)
	if destAbs != rootAbs && !strings.HasPrefix(destAbs, rootAbs+sep) {
		return "", ErrPathEscape
	}
	if destAbs == rootAbs {
		return "", ErrPathEscape
	}
	return destAbs, nil
}
