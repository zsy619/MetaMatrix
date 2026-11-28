//go:build darwin || linux || freebsd || netbsd || openbsd

package media

import (
	"bytes"
	"context"
	"syscall"
	"testing"
)

func TestFinishChunkWithMorePartsThanFDLimit(t *testing.T) {
	var original syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &original); err != nil {
		t.Skipf("getrlimit unavailable: %v", err)
	}
	const fdLimit = uint64(48)
	if original.Cur < fdLimit || original.Max < fdLimit {
		t.Skipf("descriptor hard/current limit too small: %+v", original)
	}
	limited := original
	limited.Cur = fdLimit
	if err := syscall.Setrlimit(syscall.RLIMIT_NOFILE, &limited); err != nil {
		t.Skipf("setrlimit unavailable: %v", err)
	}
	defer func() {
		if err := syscall.Setrlimit(syscall.RLIMIT_NOFILE, &original); err != nil {
			t.Errorf("restore descriptor limit: %v", err)
		}
	}()

	svc, user, _ := testService(t)
	ctx := context.Background()
	// 分片数明显大于整个进程可用的 FD 数。旧的“全部打开后 MultiReader”
	// 会在这里失败；逐个打开、读取、关闭的实现只需要常量级额外 FD。
	const partCount = 72
	part := int(MinPartSize)
	payload := bytes.Repeat([]byte{0x5a}, part*partCount)
	status, err := svc.PrepareChunk(ctx, user, PrepareInput{
		OriginalName: "fd-bound.bin",
		MediaType:    "file",
		SizeBytes:    int64(len(payload)),
		PartSize:     int64(part),
	})
	if err != nil {
		t.Fatal(err)
	}
	if status.PartCount != partCount {
		t.Fatalf("part count = %d", status.PartCount)
	}
	for i := 0; i < partCount; i++ {
		start := i * part
		if _, err := svc.PutChunk(ctx, user, status.UploadID, i, bytes.NewReader(payload[start:start+part])); err != nil {
			t.Fatalf("put part %d: %v", i, err)
		}
	}
	view, err := svc.FinishChunk(ctx, user, status.UploadID)
	if err != nil {
		t.Fatal(err)
	}
	if view.SHA256 != shaOf(payload) || view.SizeBytes != int64(len(payload)) {
		t.Fatalf("merged view = %+v", view)
	}
}
