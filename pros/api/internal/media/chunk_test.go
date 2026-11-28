package media

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestChunkResumeKeepsHashAndIsolatesSession(t *testing.T) {
	svc, user, other := testService(t)
	ctx := context.Background()
	part := int(MinPartSize)
	payload := bytes.Repeat([]byte{7}, part*2+10)
	status, err := svc.PrepareChunk(ctx, user, PrepareInput{
		OriginalName: "big.bin",
		MediaType:    "file",
		SizeBytes:    int64(len(payload)),
		PartSize:     int64(part),
	})
	if err != nil {
		t.Fatal(err)
	}
	if status.PartCount != 3 || len(status.Missing) != 3 {
		t.Fatalf("status %+v", status)
	}
	if _, err := svc.PutChunk(ctx, user, status.UploadID, 0, bytes.NewReader(payload[:part])); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.PutChunk(ctx, user, status.UploadID, 2, bytes.NewReader(payload[part*2:])); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.FinishChunk(ctx, user, status.UploadID); err != ErrChunkIncomplete {
		t.Fatalf("finish with hole: %v", err)
	}
	mid, err := svc.ChunkStatus(ctx, user, status.UploadID)
	if err != nil {
		t.Fatal(err)
	}
	if len(mid.Missing) != 1 || mid.Missing[0] != 1 {
		t.Fatalf("missing %+v", mid.Missing)
	}
	if _, err := svc.ChunkStatus(ctx, other, status.UploadID); err != ErrNotFound {
		t.Fatalf("other user status: %v", err)
	}
	if _, err := svc.PutChunk(ctx, other, status.UploadID, 1, bytes.NewReader(payload[part:part*2])); err != ErrNotFound {
		t.Fatalf("other user part: %v", err)
	}
	// Same part again is a resume, not a second object.
	if _, err := svc.PutChunk(ctx, user, status.UploadID, 0, bytes.NewReader(payload[:part])); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.PutChunk(ctx, user, status.UploadID, 1, bytes.NewReader(payload[part:part*2])); err != nil {
		t.Fatal(err)
	}
	view, err := svc.FinishChunk(ctx, user, status.UploadID)
	if err != nil {
		t.Fatal(err)
	}
	if !view.Created || view.SHA256 != shaOf(payload) || view.SizeBytes != int64(len(payload)) {
		t.Fatalf("view %+v", view)
	}
	if _, err := svc.ChunkStatus(ctx, user, status.UploadID); err != ErrNotFound {
		t.Fatal("session left after finish")
	}
	again, err := svc.Save(ctx, user, SaveInput{OriginalName: "whole.bin", Body: bytes.NewReader(payload)})
	if err != nil {
		t.Fatal(err)
	}
	if again.Created || again.ID != view.ID {
		t.Fatalf("whole upload did not dedup: %+v", again)
	}
	if countFiles(t, svc.Root) != 1 {
		t.Fatalf("files = %d", countFiles(t, svc.Root))
	}
}

func TestCleanupExpiredChunksWithoutVisits(t *testing.T) {
	svc, user, _ := testService(t)
	ctx := context.Background()
	now := time.Unix(1_700_000_000, 0)
	svc.Now = func() time.Time { return now }
	prepare := func() ChunkStatus {
		t.Helper()
		status, err := svc.PrepareChunk(ctx, user, PrepareInput{
			OriginalName: "ttl.bin",
			MediaType:    "file",
			SizeBytes:    MinPartSize,
			PartSize:     MinPartSize,
		})
		if err != nil {
			t.Fatal(err)
		}
		return status
	}
	expired := prepare()
	expiredDir, err := svc.chunkDir(expired.UploadID)
	if err != nil {
		t.Fatal(err)
	}

	// 无人调用 ChunkStatus/PutChunk，仅推进时钟后直接运行启动/周期清理。
	now = now.Add(chunkTTL + time.Hour)
	fresh := prepare()
	freshDir, err := svc.chunkDir(fresh.UploadID)
	if err != nil {
		t.Fatal(err)
	}
	corruptID := uuid.NewString()
	corruptDir, err := svc.chunkDir(corruptID)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(corruptDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(corruptDir, "meta.json"), []byte("{broken"), 0o640); err != nil {
		t.Fatal(err)
	}

	// 损坏会话会产生可见错误，但不能阻断另一个已验证过期会话的删除。
	if err := svc.CleanupExpiredChunks(); err == nil {
		t.Fatal("corrupt session should be reported")
	}
	if _, err := os.Stat(expiredDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expired session still exists: %v", err)
	}
	if info, err := os.Stat(freshDir); err != nil || !info.IsDir() {
		t.Fatalf("fresh session was removed: %v", err)
	}
	// 无法证明归属和 CreatedAt 的损坏目录必须保留，禁止按目录 mtime 猜测删除。
	if info, err := os.Stat(corruptDir); err != nil || !info.IsDir() {
		t.Fatalf("corrupt session should be retained: %v", err)
	}
}

func TestCleanupExpiredChunksRejectsUploadsSymlink(t *testing.T) {
	svc, _, _ := testService(t)
	outside := t.TempDir()
	keep := filepath.Join(outside, "keep")
	if err := os.WriteFile(keep, []byte("do not delete"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(svc.Root, "uploads")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := svc.CleanupExpiredChunks(); !errors.Is(err, ErrPathEscape) {
		t.Fatalf("symlink cleanup = %v", err)
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatalf("cleanup followed uploads symlink: %v", err)
	}
}
