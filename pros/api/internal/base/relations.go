package base

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// 关联记录（link 字段）关系化
//
// 目标：
//  1. link 字段的取值必须指向**同一 Base 内**真实存在的记录（写库前校验）；
//  2. 关系落地到 base_record_links（source → target），随记录写入同步维护；
//  3. 提供「正向 / 反向」关系查询，记录详情里能看到「谁关联了我、我关联了谁」；
//  4. 提供目标表记录选项接口，驱动前端的关联记录选择器。
// ---------------------------------------------------------------------------

// RecordRelation 描述一条关联关系。
type RecordRelation struct {
	// Direction：outbound = 本记录关联了对方；inbound = 对方关联了本记录。
	Direction string `json:"direction"`
	// TableID / TableName 是「关联方」所在的数据表。
	TableID   string `json:"tableId"`
	TableName string `json:"tableName"`
	// FieldID / FieldName 是承载关联的 link 字段。
	FieldID   string `json:"fieldId"`
	FieldName string `json:"fieldName"`
	// RecordID / RecordTitle 是关联到的记录。
	RecordID    string `json:"recordId"`
	RecordTitle string `json:"recordTitle"`
	// TargetTableID 是被指向的表（用于跳转）。
	TargetTableID string `json:"targetTableId"`
}

// RecordRelationSet 是一次关系查询的完整结果。
type RecordRelationSet struct {
	RecordID string           `json:"recordId"`
	Outbound []RecordRelation `json:"outbound"`
	Inbound  []RecordRelation `json:"inbound"`
}

// LinkTarget 是关联记录选择器的一条候选（目标表记录）。
type LinkTarget struct {
	ID       string `json:"id"`
	TableID  string `json:"tableId"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
}

// linkFieldSpec 描述一个 link 字段及其目标表。
type linkFieldSpec struct {
	fieldID   uuid.UUID
	fieldName string
	// targetTableID 为空表示「同 Base 内任意表」。
	targetTableID uuid.UUID
}

// linkFieldSpecs 取出表内全部 link 字段。
func linkFieldSpecs(idx *fieldIndex) []linkFieldSpec {
	out := make([]linkFieldSpec, 0, 2)
	for id, meta := range idx.byID {
		if meta.Type != string(FieldLink) {
			continue
		}
		spec := linkFieldSpec{fieldID: id, fieldName: meta.Name}
		if raw, ok := meta.Config["targetTableId"].(string); ok && raw != "" {
			if parsed, err := uuid.Parse(raw); err == nil {
				spec.targetTableID = parsed
			}
		}
		out = append(out, spec)
	}
	return out
}

// validateLinkRefs 校验 link 字段的值指向真实存在的记录。
//
// 规则：
//   - 目标表必须属于同一个 Base（跨 Base 引用不允许）；
//   - 目标记录必须存在且未删除。
func (s *Service) validateLinkRefs(ctx context.Context, baseID uuid.UUID, idx *fieldIndex, values map[string]any) error {
	for _, spec := range linkFieldSpecs(idx) {
		raw, ok := values[spec.fieldID.String()]
		if !ok {
			continue
		}
		ids := stringSlice(raw)
		if len(ids) == 0 {
			continue
		}
		for _, rawID := range ids {
			targetID, err := uuid.Parse(rawID)
			if err != nil {
				return fmt.Errorf("%w: %s 关联的记录 ID 非法", ErrFieldValueInvalid, spec.fieldName)
			}
			q := s.db.WithContext(ctx).Model(&BaseRecord{}).
				Where("id = ? AND deleted_at IS NULL", targetID)
			if spec.targetTableID != uuid.Nil {
				q = q.Where("table_id = ?", spec.targetTableID)
			}
			var count int64
			if err := q.Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return fmt.Errorf("%w: %s 关联的记录不存在", ErrFieldValueInvalid, spec.fieldName)
			}
			// 目标记录必须属于同一个 Base（跨 Base 引用不允许）。
			var target BaseRecord
			if err := s.db.WithContext(ctx).
				Select("table_id").Where("id = ? AND deleted_at IS NULL", targetID).
				First(&target).Error; err != nil {
				return err
			}
			var targetTable BaseTable
			if err := s.db.WithContext(ctx).
				Select("base_id").Where("id = ?", target.TableID).
				First(&targetTable).Error; err != nil {
				return err
			}
			if targetTable.BaseID != baseID {
				return fmt.Errorf("%w: %s 关联的记录不在当前表格空间", ErrFieldValueInvalid, spec.fieldName)
			}
		}
	}
	return nil
}

// syncRecordLinks 重写某记录的全部关联关系。
//
// 只维护本表 link 字段产生的 source → target 关系；
// 目标表由字段配置决定（未配置时取记录实际所在表）。
func (s *Service) syncRecordLinks(tx *gorm.DB, table *BaseTable, idx *fieldIndex, recordID uuid.UUID, data map[string]any) error {
	if err := tx.Where("source_table_id = ? AND source_record_id = ?", table.ID, recordID).
		Delete(&BaseRecordLink{}).Error; err != nil {
		return err
	}
	for _, spec := range linkFieldSpecs(idx) {
		raw, ok := data[spec.fieldID.String()]
		if !ok {
			continue
		}
		ids := stringSlice(raw)
		for i, rawID := range ids {
			targetID, err := uuid.Parse(rawID)
			if err != nil {
				continue
			}
			targetTableID := spec.targetTableID
			if targetTableID == uuid.Nil {
				// 未配置目标表时，记录实际所属表即目标表。
				var target BaseRecord
				if err := tx.Select("table_id").Where("id = ?", targetID).First(&target).Error; err != nil {
					continue
				}
				targetTableID = target.TableID
			}
			link := BaseRecordLink{
				ID:             uuid.New(),
				SourceTableID:  table.ID,
				SourceRecordID: recordID,
				FieldID:        spec.fieldID,
				TargetTableID:  targetTableID,
				TargetRecordID: targetID,
				SortOrder:      i,
				CreatedAt:      time.Now(),
			}
			if err := tx.Create(&link).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// ListRecordRelations 查询一条记录的正向与反向关联关系。
//
// 正向：记录自身的 link 字段指向了谁。
// 反向：同 Base 内哪些记录的 link 字段指向了它。
func (s *Service) ListRecordRelations(ctx context.Context, userID, projectID, recordID uuid.UUID) (*RecordRelationSet, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	rec, err := s.scopeLoadRecord(ctx, userID, projectID, recordID)
	if err != nil {
		return nil, err
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, rec.TableID)
	if err != nil {
		return nil, err
	}
	data := map[string]any{}
	if len(rec.Data) > 0 {
		_ = json.Unmarshal(rec.Data, &data)
	}

	out := &RecordRelationSet{RecordID: recordID.String(), Outbound: []RecordRelation{}, Inbound: []RecordRelation{}}

	// 正向：本记录的 link 字段。
	for _, spec := range linkFieldSpecs(idx) {
		ids := stringSlice(data[spec.fieldID.String()])
		for _, rawID := range ids {
			targetID, err := uuid.Parse(rawID)
			if err != nil {
				continue
			}
			target, err := s.recordBrief(ctx, targetID, &recordViewer{userID: userID, projectID: projectID})
			if err != nil {
				continue
			}
			out.Outbound = append(out.Outbound, RecordRelation{
				Direction:     "outbound",
				TableID:       table.ID.String(),
				TableName:     table.Name,
				FieldID:       spec.fieldID.String(),
				FieldName:     spec.fieldName,
				RecordID:      targetID.String(),
				RecordTitle:   target.Title,
				TargetTableID: target.TableID,
			})
		}
	}

	// 反向：同 Base 内其它表的 link 字段指向了本记录。
	inbound, err := s.inboundRelations(ctx, table.BaseID, recordID, &recordViewer{userID: userID, projectID: projectID})
	if err != nil {
		return nil, err
	}
	out.Inbound = inbound
	return out, nil
}

// inboundRelations 扫描同 Base 内所有表的 link 字段，找出指向本记录的记录。
//
// 事实来源是记录自身的 JSONB（与文档反向引用同一思路），
// 因此老数据（关系表未回填）也能立刻查出结果。
func (s *Service) inboundRelations(ctx context.Context, baseID uuid.UUID, recordID uuid.UUID, visibleUser *recordViewer) ([]RecordRelation, error) {
	out := []RecordRelation{}
	var tables []BaseTable
	if err := s.db.WithContext(ctx).Where("base_id = ? AND deleted_at IS NULL", baseID).Find(&tables).Error; err != nil {
		return nil, err
	}
	for i := range tables {
		tb := tables[i]
		idx, err := s.loadFieldIndex(ctx, tb.ID)
		if err != nil {
			return nil, err
		}
		specs := linkFieldSpecs(idx)
		if len(specs) == 0 {
			continue
		}
		needle := recordID.String()
		var rows []BaseRecord
		if err := s.db.WithContext(ctx).
			Where("table_id = ? AND deleted_at IS NULL AND CAST(data AS TEXT) LIKE ?", tb.ID, "%"+needle+"%").
			Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			if row.ID == recordID {
				continue
			}
			// 反向关系的来源记录也可能受限：受限记录不应当在别人的关系列表里露头。
			if visibleUser != nil && !s.recordScopeAllows(row, visibleUser.userID, visibleUser.projectID) {
				continue
			}
			data := map[string]any{}
			if len(row.Data) > 0 {
				_ = json.Unmarshal(row.Data, &data)
			}
			for _, spec := range specs {
				for _, rawID := range stringSlice(data[spec.fieldID.String()]) {
					if rawID != needle {
						continue
					}
					title, err := s.recordTitle(ctx, row.ID, visibleUser)
					if err != nil {
						title = "未命名记录"
					}
					out = append(out, RecordRelation{
						Direction:     "inbound",
						TableID:       tb.ID.String(),
						TableName:     tb.Name,
						FieldID:       spec.fieldID.String(),
						FieldName:     spec.fieldName,
						RecordID:      row.ID.String(),
						RecordTitle:   title,
						TargetTableID: tb.ID.String(),
					})
				}
			}
		}
	}
	return out, nil
}

// ListLinkTargets 列出目标表的记录候选，供前端「关联记录」选择器使用。
func (s *Service) ListLinkTargets(ctx context.Context, userID, projectID, tableID uuid.UUID, keyword string, limit int) ([]LinkTarget, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return nil, err
	}
	table, _, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := s.db.WithContext(ctx).Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", table.ID)
	// 记录级可见范围：受限记录不能出现在候选里（否则等于泄露标题）。
	q = s.applyRecordScope(q, userID, projectID, "")
	kw := strings.TrimSpace(keyword)
	if kw != "" {
		like := "%" + escapeLike(kw) + "%"
		q = q.Where(`EXISTS (
			SELECT 1 FROM base_record_values v
			WHERE v.record_id = base_records.id AND LOWER(v.value_text) LIKE LOWER(?)
		)`, like)
	}
	var rows []BaseRecord
	if err := q.Order("sort_order ASC, id ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]LinkTarget, 0, len(rows))
	for _, row := range rows {
		data := map[string]any{}
		if len(row.Data) > 0 {
			_ = json.Unmarshal(row.Data, &data)
		}
		out = append(out, LinkTarget{
			ID:       row.ID.String(),
			TableID:  table.ID.String(),
			Title:    recordTitleFrom(data, table.PrimaryFieldID),
			Subtitle: table.Name,
		})
	}
	return out, nil
}

// recordBrief 取记录的最小信息（所属表 + 标题）。
//
// visibleUser 非 nil 时按记录级可见范围校验：受限记录对无权者按「不存在」处理，
// 避免通过标题泄露受限记录的存在与内容。
func (s *Service) recordBrief(ctx context.Context, recordID uuid.UUID, visibleUser *recordViewer) (LinkTarget, error) {
	var rec BaseRecord
	if err := s.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", recordID).First(&rec).Error; err != nil {
		return LinkTarget{}, err
	}
	if visibleUser != nil && !s.recordScopeAllows(rec, visibleUser.userID, visibleUser.projectID) {
		return LinkTarget{}, ErrRecordNotFound
	}
	var table BaseTable
	if err := s.db.WithContext(ctx).Where("id = ?", rec.TableID).First(&table).Error; err != nil {
		return LinkTarget{}, err
	}
	data := map[string]any{}
	if len(rec.Data) > 0 {
		_ = json.Unmarshal(rec.Data, &data)
	}
	return LinkTarget{
		ID:       rec.ID.String(),
		TableID:  rec.TableID.String(),
		Title:    recordTitleFrom(data, table.PrimaryFieldID),
		Subtitle: table.Name,
	}, nil
}

// recordViewer 标识「以谁的身份看」，用于记录级可见范围校验。
type recordViewer struct {
	userID    uuid.UUID
	projectID uuid.UUID
}

// recordTitle 取记录标题（主字段值）。
func (s *Service) recordTitle(ctx context.Context, recordID uuid.UUID, visibleUser *recordViewer) (string, error) {
	brief, err := s.recordBrief(ctx, recordID, visibleUser)
	if err != nil {
		return "", err
	}
	return brief.Title, nil
}

// recordTitleFrom 从记录数据里取标题：主字段 → 第一个有值的文本字段 → 未命名。
func recordTitleFrom(data map[string]any, primaryFieldID *uuid.UUID) string {
	if primaryFieldID != nil {
		if v, ok := data[primaryFieldID.String()]; ok {
			if s := titleString(v); s != "" {
				return s
			}
		}
	}
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	// 固定顺序，避免 map 遍历随机导致标题抖动。
	for _, k := range sortedKeys(keys) {
		if s := titleString(data[k]); s != "" {
			return s
		}
	}
	return "未命名记录"
}

// sortedKeys 稳定排序。
func sortedKeys(keys []string) []string {
	out := append([]string{}, keys...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// titleString 把字段值转成可读标题。
func titleString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", t), "0"), ".")
	case bool:
		if t {
			return "是"
		}
		return "否"
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			if s := titleString(item); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "、")
	case []string:
		return strings.Join(t, "、")
	default:
		return ""
	}
}
