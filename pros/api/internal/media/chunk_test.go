package media

import (
	"bytes"
	"context"
	"testing"
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
