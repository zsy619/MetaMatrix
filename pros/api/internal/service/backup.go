package service

import (
	"encoding/json"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

const (
	backupVersion    = 1
	maxBackupExport  = 200
	maxBackupRestore = 50
)

// BackupDocument is one owned canvas inside a portable JSON bundle.
type BackupDocument struct {
	Title         string          `json:"title"`
	Notes         string          `json:"notes,omitempty"`
	TemplateID    *string         `json:"templateId,omitempty"`
	CanvasType    string          `json:"canvasType"`
	SchemaVersion int             `json:"schemaVersion"`
	UpdatedAt     time.Time       `json:"updatedAt,omitempty"`
	CurrentData   json.RawMessage `json:"currentData"`
}

// BackupBundle is a personal export. It does not include other accounts or archived rows.
type BackupBundle struct {
	Version    int              `json:"version"`
	ExportedAt time.Time        `json:"exportedAt"`
	Count      int              `json:"count"`
	Truncated  bool             `json:"truncated"`
	Documents  []BackupDocument `json:"documents"`
}

// BackupRestoreResult reports how many canvases were created as new documents.
type BackupRestoreResult struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

func (s *DocumentsService) ExportBackup(ownerID uuid.UUID) (*BackupBundle, error) {
	var docs []model.CanvasDocument
	err := s.db.Where("owner_user_id = ?", ownerID).
		Order("updated_at DESC").
		Limit(maxBackupExport + 1).
		Find(&docs).Error
	if err != nil {
		return nil, err
	}
	truncated := len(docs) > maxBackupExport
	if truncated {
		docs = docs[:maxBackupExport]
	}
	out := make([]BackupDocument, 0, len(docs))
	for _, doc := range docs {
		out = append(out, BackupDocument{
			Title:         doc.Title,
			Notes:         doc.Notes,
			TemplateID:    doc.TemplateID,
			CanvasType:    doc.CanvasType,
			SchemaVersion: doc.SchemaVersion,
			UpdatedAt:     doc.UpdatedAt,
			CurrentData:   json.RawMessage(doc.CurrentData),
		})
	}
	return &BackupBundle{
		Version:    backupVersion,
		ExportedAt: time.Now().UTC(),
		Count:      len(out),
		Truncated:  truncated,
		Documents:  out,
	}, nil
}

// RestoreBackup creates new canvases for the caller. It never reuses the source ids.
func (s *DocumentsService) RestoreBackup(ownerID uuid.UUID, bundle BackupBundle) (*BackupRestoreResult, error) {
	if bundle.Version != backupVersion {
		return nil, ErrValidation
	}
	if len(bundle.Documents) > maxBackupRestore {
		return nil, ErrValidation
	}
	result := &BackupRestoreResult{}
	for _, item := range bundle.Documents {
		if err := ValidateCanvasImport(item.CurrentData); err != nil {
			result.Skipped++
			continue
		}
		title := item.Title
		canvasType := item.CanvasType
		_, err := s.Create(ownerID, CreateDocumentInput{
			Title:      &title,
			Notes:      &item.Notes,
			CanvasType: &canvasType,
			TemplateID: item.TemplateID,
			Data:       item.CurrentData,
		})
		if err != nil {
			result.Skipped++
			continue
		}
		result.Imported++
	}
	return result, nil
}
