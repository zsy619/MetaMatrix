// 跨表复制 / 移动记录（E-03）。
//
// 为什么要有：
// 多维表格的真实用法是「一张表是主数据，另一张表是台账 / 关联表」，
// 用户经常要把一条记录搬到另一张表（或者复制一份过去）。
// 以前只能「新建一条 + 手动把每个字段抄一遍」—— 字段一多就没人愿意做。
//
// 字段映射口径：**按字段名**（大小写不敏感、忽略首尾空格），
// 并且只搬运**类型相同**的字段 —— 类型不同就跳过，不做隐式转换。
// 理由：隐式转换（「1,200」→ 1200）会让用户在目标表里看到自己没写过的东西，
// 比少搬一个字段更危险。
package base

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// TransferMode 跨表操作模式。
const (
	// TransferModeCopy 复制（源记录保留）。
	TransferModeCopy = "copy"
	// TransferModeMove 移动（源记录删除）。
	TransferModeMove = "move"
)

// TransferRecordInput 跨表复制 / 移动的入参。
type TransferRecordInput struct {
	// RecordID 源记录。
	RecordID string `json:"recordId"`
	// TargetTableID 目标表。
	TargetTableID string `json:"targetTableId"`
	// Mode copy / move，默认 copy。
	Mode string `json:"mode"`
}

// TransferRecordResult 跨表操作结果。
type TransferRecordResult struct {
	SourceRecordID string `json:"sourceRecordId"`
	TargetTableID  string `json:"targetTableId"`
	TargetRecordID string `json:"targetRecordId"`
	// CopiedFields 实际搬运过去的字段（源字段名 → 目标字段名）。
	CopiedFields map[string]string `json:"copiedFields"`
	// SkippedFields 被跳过的字段及原因。
	SkippedFields map[string]string `json:"skippedFields"`
}

// TransferRecord 把一条记录复制 / 移动到同空间的另一张表。
func (s *Service) TransferRecord(
	ctx context.Context,
	userID, projectID uuid.UUID,
	sourceTableID uuid.UUID,
	in TransferRecordInput,
) (*TransferRecordResult, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return nil, err
	}
	recordID, err := uuid.Parse(in.RecordID)
	if err != nil {
		return nil, fmt.Errorf("%w: 记录 ID 非法", ErrFieldValueInvalid)
	}
	targetTableID, err := uuid.Parse(in.TargetTableID)
	if err != nil {
		return nil, fmt.Errorf("%w: 目标表 ID 非法", ErrFieldValueInvalid)
	}
	if targetTableID == sourceTableID {
		return nil, fmt.Errorf("%w: 目标表与当前表相同", ErrFieldValueInvalid)
	}
	mode := strings.TrimSpace(in.Mode)
	if mode == "" {
		mode = TransferModeCopy
	}
	if mode != TransferModeCopy && mode != TransferModeMove {
		return nil, fmt.Errorf("%w: 模式只能是 copy 或 move", ErrFieldValueInvalid)
	}

	// 源记录（按可见范围加载）。
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
		return nil, err
	}
	if rec.TableID != sourceTableID {
		return nil, fmt.Errorf("%w: 记录不属于当前表", ErrFieldValueInvalid)
	}
	// 目标表必须同空间。
	targetTable, _, err := s.loadTableSchema(ctx, userID, projectID, targetTableID)
	if err != nil {
		return nil, err
	}
	sourceIdx, err := s.loadFieldIndex(ctx, sourceTableID)
	if err != nil {
		return nil, err
	}
	targetIdx, err := s.loadFieldIndex(ctx, targetTableID)
	if err != nil {
		return nil, err
	}

	sourceData := map[string]any{}
	if len(rec.Data) > 0 {
		_ = json.Unmarshal(rec.Data, &sourceData)
	}

	// 按字段名建立映射（只取可写、非计算字段）。
	targetByName := map[string]FieldMeta{}
	for _, meta := range targetIdx.byID {
		if isComputedFieldType(meta.Type) {
			continue
		}
		targetByName[normalizeFieldKey(meta.Name)] = meta
	}

	copied := map[string]string{}
	skipped := map[string]string{}
	fields := map[string]any{}
	for _, meta := range sourceIdx.byID {
		value, ok := sourceData[meta.ID]
		if !ok || value == nil {
			continue
		}
		if isComputedFieldType(meta.Type) {
			skipped[meta.Name] = "计算字段由目标表自己算"
			continue
		}
		target, ok := targetByName[normalizeFieldKey(meta.Name)]
		if !ok {
			skipped[meta.Name] = "目标表没有同名字段"
			continue
		}
		if target.Type != meta.Type {
			skipped[meta.Name] = fmt.Sprintf("类型不同（%s → %s）", meta.Type, target.Type)
			continue
		}
		fields[target.ID] = value
		copied[meta.Name] = target.Name
	}
	if len(fields) == 0 {
		return nil, fmt.Errorf("%w: 没有可搬运的同名字段", ErrFieldValueInvalid)
	}

	// 在目标表建记录。
	created, err := s.createRecord(ctx, userID, projectID, targetTable.ID, RecordInput{Fields: fields})
	if err != nil {
		return nil, err
	}
	// 移动模式：删掉源记录。
	if mode == TransferModeMove {
		if err := s.DeleteRecord(ctx, userID, projectID, recordID); err != nil {
			return nil, err
		}
	}
	return &TransferRecordResult{
		SourceRecordID: recordID.String(),
		TargetTableID:  targetTable.ID.String(),
		TargetRecordID: created.ID.String(),
		CopiedFields:   copied,
		SkippedFields:  skipped,
	}, nil
}

// normalizeFieldKey 字段名归一化（比对用）。
func normalizeFieldKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// isComputedFieldType 是否是只读计算字段（公式 / 引用 / 汇总 / 系统字段）。
func isComputedFieldType(fieldType string) bool {
	switch fieldType {
	case "formula", "lookup", "rollup", "created_at", "updated_at", "created_by", "updated_by":
		return true
	}
	return false
}
