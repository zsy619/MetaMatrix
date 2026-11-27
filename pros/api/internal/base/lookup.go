package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// computedFieldSpec 描述一个「引用 / 汇总」字段的计算配置。
type computedFieldSpec struct {
	fieldID       uuid.UUID
	fieldType     FieldType
	targetTableID uuid.UUID
	targetFieldID uuid.UUID
	linkFieldID   uuid.UUID
	rollupType    string
}

// collectComputedSpecs 从表字段里挑出引用 / 汇总字段，并解析它们的配置。
func (s *Service) collectComputedSpecs(idx *fieldIndex) []computedFieldSpec {
	out := make([]computedFieldSpec, 0, 2)
	for id, meta := range idx.byID {
		switch FieldType(meta.Type) {
		case FieldLookup, FieldRollup:
		default:
			continue
		}
		spec := computedFieldSpec{fieldID: id, fieldType: FieldType(meta.Type)}
		if raw, ok := meta.Config["targetTableId"].(string); ok && raw != "" {
			if parsed, err := uuid.Parse(raw); err == nil {
				spec.targetTableID = parsed
			}
		}
		if raw, ok := meta.Config["targetFieldId"].(string); ok && raw != "" {
			if parsed, err := uuid.Parse(raw); err == nil {
				spec.targetFieldID = parsed
			}
		}
		if raw, ok := meta.Config["linkFieldId"].(string); ok && raw != "" {
			if parsed, err := uuid.Parse(raw); err == nil {
				spec.linkFieldID = parsed
			}
		}
		if raw, ok := meta.Config["rollupType"].(string); ok && raw != "" {
			spec.rollupType = raw
		}
		out = append(out, spec)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].fieldID.String() < out[j].fieldID.String() })
	return out
}

// resolveLinkField 找到承载关联关系的本地字段。
//
// 优先用配置里显式指定的 linkFieldId；
// 没指定时取本表中「目标表 = targetTableId」的第一个关联字段。
func (s *Service) resolveLinkField(idx *fieldIndex, spec computedFieldSpec) (uuid.UUID, bool) {
	if spec.linkFieldID != uuid.Nil {
		if meta, ok := idx.byID[spec.linkFieldID]; ok && meta.Type == string(FieldLink) {
			return spec.linkFieldID, true
		}
		return uuid.Nil, false
	}
	for id, meta := range idx.byID {
		if meta.Type != string(FieldLink) {
			continue
		}
		raw, _ := meta.Config["targetTableId"].(string)
		if raw == "" {
			continue
		}
		parsed, err := uuid.Parse(raw)
		if err != nil {
			continue
		}
		if spec.targetTableID == uuid.Nil || parsed == spec.targetTableID {
			return id, true
		}
	}
	return uuid.Nil, false
}

// RecalcLookupRollup 重算一张表里的引用 / 汇总字段，返回被更新的记录数。
//
// 计算时机遵循「跨表取值走异步 / 分批」的约定：
// 本方法由后台任务或用户手动触发（POST /tables/:tableId/lookup-rollup/recalc），
// 不进入同步写入链路，避免拖慢普通编辑。
func (s *Service) RecalcLookupRollup(ctx context.Context, userID, projectID, tableID uuid.UUID) (int, error) {
	if err := s.assertAccess(userID, projectID, RoleEditor); err != nil {
		return 0, err
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return 0, err
	}
	return s.recalcComputedFields(ctx, table, idx)
}

// recalcComputedFields 是真正的计算实现（不重复做权限校验）。
func (s *Service) recalcComputedFields(ctx context.Context, table *BaseTable, idx *fieldIndex) (int, error) {
	specs := s.collectComputedSpecs(idx)
	if len(specs) == 0 {
		return 0, nil
	}
	// 关联关系（源表 → 目标记录）
	var links []BaseRecordLink
	if err := s.db.WithContext(ctx).Where("source_table_id = ?", table.ID).Find(&links).Error; err != nil {
		return 0, err
	}
	linkedByRecord := map[uuid.UUID][]BaseRecordLink{}
	for _, l := range links {
		linkedByRecord[l.SourceRecordID] = append(linkedByRecord[l.SourceRecordID], l)
	}

	var records []BaseRecord
	if err := s.db.WithContext(ctx).Where("table_id = ? AND deleted_at IS NULL", table.ID).Find(&records).Error; err != nil {
		return 0, err
	}

	updated := 0
	for _, rec := range records {
		data := map[string]any{}
		if len(rec.Data) > 0 {
			_ = json.Unmarshal(rec.Data, &data)
		}
		changed := false
		for _, spec := range specs {
			linkField, ok := s.resolveLinkField(idx, spec)
			if !ok {
				continue
			}
			values, err := s.collectLinkedValues(ctx, spec, linkedByRecord[rec.ID], linkField)
			if err != nil {
				return updated, err
			}
			var computed any
			if spec.fieldType == FieldRollup {
				computed = aggregateRollup(spec.rollupType, values)
			} else {
				computed = values
			}
			key := spec.fieldID.String()
			if equalComputed(data[key], computed) {
				continue
			}
			data[key] = computed
			changed = true
		}
		if !changed {
			continue
		}
		raw, _ := json.Marshal(data)
		if err := s.db.WithContext(ctx).Model(&BaseRecord{}).Where("id = ?", rec.ID).
			Updates(map[string]any{"data": raw, "version": gorm.Expr("version + 1")}).Error; err != nil {
			return updated, err
		}
		if err := s.syncAllProjections(s.db.WithContext(ctx), table.ID, rec.ID, data); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}

// collectLinkedValues 取出一条记录通过某个关联字段连出去的所有目标字段值。
func (s *Service) collectLinkedValues(ctx context.Context, spec computedFieldSpec, links []BaseRecordLink, linkField uuid.UUID) ([]any, error) {
	if spec.targetFieldID == uuid.Nil {
		return []any{}, nil
	}
	targets := make([]uuid.UUID, 0, len(links))
	for _, l := range links {
		if l.FieldID != linkField {
			continue
		}
		targets = append(targets, l.TargetRecordID)
	}
	if len(targets) == 0 {
		return []any{}, nil
	}
	var records []BaseRecord
	if err := s.db.WithContext(ctx).Where("id IN ? AND deleted_at IS NULL", targets).Find(&records).Error; err != nil {
		return nil, err
	}
	values := make([]any, 0, len(records))
	for _, r := range records {
		data := map[string]any{}
		if len(r.Data) > 0 {
			_ = json.Unmarshal(r.Data, &data)
		}
		if v, ok := data[spec.targetFieldID.String()]; ok && v != nil {
			values = append(values, v)
		}
	}
	return values, nil
}

// aggregateRollup 按聚合方式计算汇总值。
func aggregateRollup(kind string, values []any) any {
	switch kind {
	case "count":
		return float64(len(values))
	case "countUnique":
		seen := map[string]struct{}{}
		for _, v := range values {
			seen[fmt.Sprintf("%v", v)] = struct{}{}
		}
		return float64(len(seen))
	case "sum", "avg", "min", "max":
		nums := make([]float64, 0, len(values))
		for _, v := range values {
			if f, ok := toFloat(v); ok {
				nums = append(nums, f)
			}
		}
		if len(nums) == 0 {
			return float64(0)
		}
		switch kind {
		case "sum":
			total := 0.0
			for _, n := range nums {
				total += n
			}
			return total
		case "avg":
			total := 0.0
			for _, n := range nums {
				total += n
			}
			return total / float64(len(nums))
		case "min":
			out := nums[0]
			for _, n := range nums {
				if n < out {
					out = n
				}
			}
			return out
		default: // max
			out := nums[0]
			for _, n := range nums {
				if n > out {
					out = n
				}
			}
			return out
		}
	default:
		return float64(0)
	}
}

// equalComputed 比较计算值是否发生变化（避免无意义的版本号推进）。
func equalComputed(old, next any) bool {
	oldRaw, _ := json.Marshal(old)
	nextRaw, _ := json.Marshal(next)
	return string(oldRaw) == string(nextRaw)
}

// RecalcDependentsOfTable 重算所有「依赖这张表」的引用 / 汇总字段。
//
// 目标表的数据变了，引用它的表要跟着更新；这里按目标表反查依赖方。
func (s *Service) RecalcDependentsOfTable(ctx context.Context, targetTableID uuid.UUID) (int, error) {
	var target BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", targetTableID).First(&target).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, err
	}
	var tables []BaseTable
	if err := s.db.WithContext(ctx).Where("base_id = ? AND status = 1", target.BaseID).Find(&tables).Error; err != nil {
		return 0, err
	}
	updated := 0
	for _, tbl := range tables {
		if tbl.ID == targetTableID {
			continue
		}
		idx, err := s.loadFieldIndex(ctx, tbl.ID)
		if err != nil {
			continue
		}
		depends := false
		for _, spec := range s.collectComputedSpecs(idx) {
			if spec.targetTableID == targetTableID {
				depends = true
				break
			}
		}
		if !depends {
			continue
		}
		n, err := s.recalcComputedFields(ctx, &tbl, idx)
		if err != nil {
			return updated, err
		}
		updated += n
	}
	return updated, nil
}

// scheduleDependentRecalc 在后台异步重算依赖方（写目标表之后调用）。
func (s *Service) scheduleDependentRecalc(tableID uuid.UUID) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if _, err := s.RecalcDependentsOfTable(ctx, tableID); err != nil {
			// 依赖重算失败不影响主流程，只记录。
			fmt.Printf("base: recalc dependents of %s failed: %v\n", tableID, err)
		}
	}()
}

// ComputedFieldSummary 描述一个引用 / 汇总字段的当前状态（给界面用）。
type ComputedFieldSummary struct {
	FieldID     string `json:"fieldId"`
	FieldName   string `json:"fieldName"`
	Type        string `json:"type"`
	TargetTable string `json:"targetTableId"`
	TargetField string `json:"targetFieldId"`
	LinkField   string `json:"linkFieldId"`
	RollupType  string `json:"rollupType"`
}

// ListComputedFields 列出某张表的引用 / 汇总字段及其配置。
func (s *Service) ListComputedFields(ctx context.Context, userID, projectID, tableID uuid.UUID) ([]ComputedFieldSummary, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	_, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	out := make([]ComputedFieldSummary, 0, 2)
	for _, spec := range s.collectComputedSpecs(idx) {
		meta := idx.byID[spec.fieldID]
		out = append(out, ComputedFieldSummary{
			FieldID:     spec.fieldID.String(),
			FieldName:   meta.Name,
			Type:        meta.Type,
			TargetTable: spec.targetTableID.String(),
			TargetField: spec.targetFieldID.String(),
			LinkField:   spec.linkFieldID.String(),
			RollupType:  spec.rollupType,
		})
	}
	return out, nil
}

// sanitizeComputedConfig 去掉空配置项，避免前端拿到一串空字符串。
func sanitizeComputedConfig(cfg map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range cfg {
		if s, ok := v.(string); ok && strings.TrimSpace(s) == "" {
			continue
		}
		out[k] = v
	}
	return out
}
