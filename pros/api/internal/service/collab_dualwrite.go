package service

import (
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"metamatrix/api/internal/model"
)

// DualWriteReport 描述 Yjs 操作日志与 current_data 双写的一致性。
// A2 期仍是双写：本报告只做校验，不把保存改成只写 Y.Doc。
type DualWriteReport struct {
	HasCurrentHTML      bool   `json:"hasCurrentHtml"`
	CurrentHTMLHash     string `json:"currentHtmlHash"`
	HeadRevisionHash    string `json:"headRevisionHash"`
	HeadMatchesCurrent  bool   `json:"headMatchesCurrent"`
	LastOpSeq           int64  `json:"lastOpSeq"`
	LastHTMLSaveVersion int64  `json:"lastHtmlSaveVersion"`
	OpsWithoutHTML      int64  `json:"opsWithoutHtml"`
	Consistent          bool   `json:"consistent"`
	Reason              string `json:"reason"`
}

func currentDataHTML(data datatypes.JSON) (string, bool) {
	if len(data) == 0 {
		return "", false
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return "", false
	}
	html, _ := m["html"].(string)
	return html, strings.TrimSpace(html) != ""
}

// InspectDualWrite 对照操作日志与 current_data / 修订头，说明双写是否落后。
// 不写入、不改保存管线。
func (s *CollabService) InspectDualWrite(docID uuid.UUID) (*DualWriteReport, error) {
	var doc model.CanvasDocument
	if err := s.db.Where("id = ?", docID).First(&doc).Error; err != nil {
		return nil, err
	}
	_, hasHTML := currentDataHTML(doc.CurrentData)
	report := &DualWriteReport{HasCurrentHTML: hasHTML}
	if hasHTML {
		report.CurrentHTMLHash = hashPayload(doc.CurrentData)
	}
	if doc.HeadRevisionID != nil {
		var rev model.CanvasRevision
		err := s.db.Select("id, document_id, payload, content_hash").
			Where("id = ? AND document_id = ?", *doc.HeadRevisionID, doc.ID).First(&rev).Error
		if err == nil {
			if rev.ContentHash != nil {
				report.HeadRevisionHash = *rev.ContentHash
			} else {
				report.HeadRevisionHash = hashPayload(rev.Payload)
			}
			report.HeadMatchesCurrent = report.HeadRevisionHash != "" && report.HeadRevisionHash == report.CurrentHTMLHash
		}
	} else if hasHTML {
		report.HeadMatchesCurrent = true
	}

	var lastSeq, lastHTML, lastHTMLSeq, opsWithout int64
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ?", docID).
		Select("COALESCE(MAX(seq), 0)").Scan(&lastSeq).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND save_version > 0", docID).
		Select("COALESCE(MAX(save_version), 0)").Scan(&lastHTML).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND save_version > 0", docID).
		Select("COALESCE(MAX(seq), 0)").Scan(&lastHTMLSeq).Error; err != nil {
		return nil, err
	}
	// 只计「最近一次 HTML 双写之后」仍未带导出的增量：更早的裸增量已被后续双写追上。
	if err := s.db.Model(&model.DocOperation{}).
		Where("document_id = ? AND save_version = 0 AND seq > ?", docID, lastHTMLSeq).
		Count(&opsWithout).Error; err != nil {
		return nil, err
	}
	report.LastOpSeq = lastSeq
	report.LastHTMLSaveVersion = lastHTML
	report.OpsWithoutHTML = opsWithout

	switch {
	case lastSeq == 0:
		report.Consistent = true
		report.Reason = "no_ops"
	case opsWithout > 0 && !hasHTML:
		report.Consistent = false
		report.Reason = "current_data_missing_html"
	case opsWithout > 0:
		report.Consistent = false
		report.Reason = "ops_ahead_of_current_data"
	case !hasHTML:
		report.Consistent = false
		report.Reason = "current_data_missing_html"
	default:
		report.Consistent = true
		report.Reason = "dual_write_in_sync"
	}
	return report, nil
}
