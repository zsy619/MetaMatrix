package media

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestResolveBlobBackendFallsBackWhenIncomplete(t *testing.T) {
	backend, note := ResolveBlobBackend(t.TempDir(), ObjectConfig{Mode: "auto"})
	if backend.Name() != "local" {
		t.Fatalf("backend = %s, want local", backend.Name())
	}
	if !strings.Contains(note, "incomplete") || !strings.Contains(note, "not switched") {
		t.Fatalf("note = %q", note)
	}
}

func TestServiceSaveOpenDeleteOnMemoryBlobs(t *testing.T) {
	svc, user, _ := testService(t)
	mem := NewMemoryBlobs()
	svc.Blobs = mem
	payload := []byte("object-store-bytes")
	view, err := svc.Save(context.Background(), user, SaveInput{
		OriginalName: "note.txt",
		MediaType:    "file",
		MimeType:     "text/plain",
		Body:         bytes.NewReader(payload),
	})
	if err != nil {
		t.Fatal(err)
	}
	if view.ID == "" {
		t.Fatal("missing asset id")
	}
	id, err := uuid.Parse(view.ID)
	if err != nil {
		t.Fatal(err)
	}
	row, err := svc.Store.Get(context.Background(), user, id)
	if err != nil {
		t.Fatal(err)
	}
	if row.StorageDisk != "s3" {
		t.Fatalf("StorageDisk = %q, want s3", row.StorageDisk)
	}
	if !mem.Has(row.StoragePath) {
		t.Fatalf("object missing at %s", row.StoragePath)
	}
	if countFiles(t, svc.Root) != 0 {
		t.Fatalf("local disk should stay empty except tmp, got %d files", countFiles(t, svc.Root))
	}

	expUnix := svc.now().Add(time.Minute).Unix()
	exp, sig := strconv.FormatInt(expUnix, 10), Sign(svc.Secret, user.String(), view.ID, expUnix)
	got, err := svc.Open(context.Background(), user, id, exp, sig, "")
	if err != nil {
		t.Fatal(err)
	}
	defer got.Body.Close()
	body, err := io.ReadAll(got.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, payload) {
		t.Fatalf("read %q, want %q", body, payload)
	}

	if err := svc.Delete(context.Background(), user, id); err != nil {
		t.Fatal(err)
	}
	if mem.Has(row.StoragePath) {
		t.Fatal("object still present after delete")
	}
}

func TestS3BlobsPutGetDeleteAgainstFakeServer(t *testing.T) {
	store := map[string][]byte{}
	var lastAuth, lastDate string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lastAuth = r.Header.Get("Authorization")
		lastDate = r.Header.Get("x-amz-date")
		key := strings.TrimPrefix(r.URL.Path, "/bucket/")
		switch r.Method {
		case http.MethodPut:
			b, _ := io.ReadAll(r.Body)
			store[key] = b
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			b, ok := store[key]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_, _ = w.Write(b)
		case http.MethodDelete:
			delete(store, key)
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	t.Cleanup(srv.Close)

	host := strings.TrimPrefix(srv.URL, "http://")
	blobs := NewS3Blobs(ObjectConfig{
		Endpoint:  host,
		Bucket:    "bucket",
		Region:    "us-east-1",
		AccessKey: "test-access",
		SecretKey: "test-secret",
		UseSSL:    false,
	}, srv.Client())
	blobs.now = func() time.Time { return time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC) }

	ctx := context.Background()
	if err := blobs.Put(ctx, "u/file/ab/ab.txt", bytes.NewReader([]byte("hi")), 2); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(lastAuth, "AWS4-HMAC-SHA256 Credential=test-access/") || lastDate == "" {
		t.Fatalf("missing sigv4 headers auth=%q date=%q", lastAuth, lastDate)
	}
	rc, size, err := blobs.Open(ctx, "u/file/ab/ab.txt")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(rc)
	_ = rc.Close()
	if size != 2 || string(got) != "hi" {
		t.Fatalf("get = %q size=%d", got, size)
	}
	if err := blobs.Remove(ctx, "u/file/ab/ab.txt"); err != nil {
		t.Fatal(err)
	}
}

func TestOpenFallsBackToLocalDisk(t *testing.T) {
	svc, user, _ := testService(t)
	payload := []byte("legacy-local")
	view, err := svc.Save(context.Background(), user, SaveInput{
		OriginalName: "old.bin",
		MediaType:    "file",
		Body:         bytes.NewReader(payload),
	})
	if err != nil {
		t.Fatal(err)
	}
	id, _ := uuid.Parse(view.ID)
	row, err := svc.Store.Get(context.Background(), user, id)
	if err != nil {
		t.Fatal(err)
	}
	// 资产登记为 s3，但对象其实还在本地：模拟尚未切完的过渡期。
	svc.Blobs = NewMemoryBlobs()
	if err := svc.Store.(*GormStore).db.Model(&row).Update("storage_disk", "s3").Error; err != nil {
		t.Fatal(err)
	}
	expUnix := svc.now().Add(time.Minute).Unix()
	exp, sig := strconv.FormatInt(expUnix, 10), Sign(svc.Secret, user.String(), view.ID, expUnix)
	got, err := svc.Open(context.Background(), user, id, exp, sig, "")
	if err != nil {
		t.Fatal(err)
	}
	defer got.Body.Close()
	body, err := io.ReadAll(got.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "legacy-local" {
		t.Fatalf("fallback read %q", body)
	}
}
