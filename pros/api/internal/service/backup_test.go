package service

import (
	"testing"

	"github.com/google/uuid"
)

func TestRestoreBackupRejectsUnknownVersion(t *testing.T) {
	svc := NewDocumentsService(nil)
	_, err := svc.RestoreBackup(uuid.New(), BackupBundle{Version: 0})
	if err != ErrValidation {
		t.Fatalf("version = %v", err)
	}
	docs := make([]BackupDocument, maxBackupRestore+1)
	_, err = svc.RestoreBackup(uuid.New(), BackupBundle{Version: backupVersion, Documents: docs})
	if err != ErrValidation {
		t.Fatalf("too many = %v", err)
	}
}

func TestRestoreBackupSkipsInvalidCanvas(t *testing.T) {
	svc := NewDocumentsService(nil)
	got, err := svc.RestoreBackup(uuid.New(), BackupBundle{
		Version: backupVersion,
		Documents: []BackupDocument{{
			Title:       "坏的",
			CanvasType:  "canvas",
			CurrentData: []byte(`[]`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Imported != 0 || got.Skipped != 1 {
		t.Fatalf("got %+v", got)
	}
}
