package base

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"metamatrix/api/internal/model"
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
// 规则（跨 Base 关联）：
//   - 目标表必须属于**同一个空间**（同一 project）下的任意 Base；
//   - 目标记录必须存在、未删除，且对当前操作者**可见**（记录级可见范围生效）。
func (s *Service) validateLinkRefs(ctx context.Context, baseID, projectID, userID uuid.UUID, idx *fieldIndex, values map[string]any) error {
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
			// 目标记录必须属于同一个空间（允许跨 Base 引用），且对操作者可见。
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
			var targetApp model.BaseApp
			if err := s.db.WithContext(ctx).
				Select("project_id").Where("id = ? AND status = 1", targetTable.BaseID).
				First(&targetApp).Error; err != nil {
				// 查不到 Base 元信息（精简部署 / 历史数据）：退回到「同 Base 才允许」。
				if targetTable.BaseID != baseID {
					return fmt.Errorf("%w: %s 关联的记录不在当前空间", ErrFieldValueInvalid, spec.fieldName)
				}
			} else if targetApp.ProjectID != projectID {
				return fmt.Errorf("%w: %s 关联的记录不在当前空间", ErrFieldValueInvalid, spec.fieldName)
			}
			// 记录级可见范围：看不见的记录不能被关联（否则等于绕过权限拿到线索）。
			if userID != uuid.Nil {
				if _, err := s.scopeLoadRecord(ctx, userID, projectID, targetID); err != nil {
					return fmt.Errorf("%w: %s 关联的记录不可见", ErrFieldValueInvalid, spec.fieldName)
				}
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
	// 关系表可能还没迁移（老库 / 精简影子库）：先判断再写，
	// 否则失败的语句会毒死 Postgres 事务，把记录写入一起打回。
	return s.syncRecordLinksWith(tx, table, idx, recordID, data, tx.Migrator().HasTable(&BaseRecordLink{}))
}

// syncRecordLinksWith 是 syncRecordLinks 的「已知关系表是否存在」版本。
//
// 批量写入时表是否存在只需要探一次（每行探一次 = 每行一次
// information_schema 查询，500 行白白多 500 次往返）。
func (s *Service) syncRecordLinksWith(tx *gorm.DB, table *BaseTable, idx *fieldIndex, recordID uuid.UUID, data map[string]any, hasLinkTable bool) error {
	if !hasLinkTable {
		return nil
	}
	specs := linkFieldSpecs(idx)
	if len(specs) == 0 {
		// 本表没有 link 字段 → 没有任何关联关系要维护。
		//
		// 少两次 DELETE 往返：批量写入时这两条语句会被放大 N 倍。
		// 历史关联不会残留 —— 删除 link 字段时已在 DeleteField 里一并清理。
		return nil
	}
	if err := tx.Where("source_table_id = ? AND source_record_id = ?", table.ID, recordID).
		Delete(&BaseRecordLink{}).Error; err != nil {
		return err
	}
	// 反向关系表同步清理（派生索引，删掉本记录产生的旧反向边）。
	// 表还不存在（老库未迁移）时忽略：反查会退回旧的全表扫描。
	if err := tx.Where("source_record_id = ?", recordID).
		Delete(&BaseRecordReverseLink{}).Error; err != nil &&
		!strings.Contains(err.Error(), "no such table") {
		return err
	}
	for _, spec := range specs {
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
				TenantID:       table.TenantID,
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
			// 反向关系（派生索引）：target → source，供「谁关联了我」走索引反查。
			// 反向表可能还没迁移（老库 / 精简影子库）：先判断表存在再写，
			// 否则失败的 INSERT 会让 Postgres 事务进入 aborted 状态，把主流程一起打回。
			if !tx.Migrator().HasTable(&BaseRecordReverseLink{}) {
				continue
			}
			reverse := BaseRecordReverseLink{
				ID:             uuid.New(),
				TenantID:       table.TenantID,
				ProjectID:      table.TenantID,
				SourceTableID:  table.ID,
				SourceRecordID: recordID,
				FieldID:        spec.fieldID,
				TargetTableID:  targetTableID,
				TargetRecordID: targetID,
				SortOrder:      i,
				CreatedAt:      time.Now(),
			}
			if err := tx.Create(&reverse).Error; err != nil {
				// 反向表是派生索引，写失败不阻断主流程（反查会退回旧的全表扫描）。
				_ = err
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
	// 优先走反向关系表（走索引，跨 Base 也能反查）；没有记录时退回旧的全表扫描。
	if rows, err := s.inboundRelationsFromIndex(ctx, recordID, visibleUser); err == nil && len(rows) > 0 {
		return rows, nil
	}
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
	page, err := s.ListLinkTargetsPage(ctx, userID, projectID, tableID, keyword, limit, "", nil)
	if err != nil {
		return nil, err
	}
	return page.Items, nil
}

// LinkTargetPage 是一页关联候选（游标分页）。
type LinkTargetPage struct {
	Items []LinkTarget `json:"items"`
	// NextCursor 为空表示没有更多了。
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
}

// ListLinkTargetsPage 分页列出关联候选（支持远程搜索 + 游标翻页）。
//
// 约定：
//   - keyword 非空时按「主字段 / 任意文本值」模糊匹配（远程搜索）；
//   - cursor 是上一页最后一行的 (sort_order, id)，用它做 keyset 翻页；
//   - targetTableID 非空时跨表取候选（支持跨 Base 关联）。
func (s *Service) ListLinkTargetsPage(
	ctx context.Context,
	userID, projectID, tableID uuid.UUID,
	keyword string,
	limit int,
	cursor string,
	targetTableID *uuid.UUID,
) (LinkTargetPage, error) {
	if err := s.assertAccess(userID, projectID, RoleViewer); err != nil {
		return LinkTargetPage{}, err
	}
	table, _, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return LinkTargetPage{}, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	// 目标表：默认当前表；跨表时目标表必须在同一空间内。
	targetTable := *table
	if targetTableID != nil && *targetTableID != uuid.Nil && *targetTableID != table.ID {
		if err := s.assertTableInSpace(ctx, projectID, *targetTableID, &targetTable); err != nil {
			return LinkTargetPage{}, err
		}
	}
	q := s.db.WithContext(ctx).Model(&BaseRecord{}).
		Where("table_id = ? AND deleted_at IS NULL", targetTable.ID)
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
	// 游标（keyset）：按 (sort_order, id) 续翻，避免深翻页时全表扫描。
	if cursor != "" {
		lastSort, lastID, ok := decodeLinkCursor(cursor)
		if ok {
			q = q.Where("(sort_order > ? OR (sort_order = ? AND id > ?))", lastSort, lastSort, lastID)
		}
	}
	var rows []BaseRecord
	if err := q.Order("sort_order ASC, id ASC").Limit(limit + 1).Find(&rows).Error; err != nil {
		return LinkTargetPage{}, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]LinkTarget, 0, len(rows))
	for _, row := range rows {
		data := map[string]any{}
		if len(row.Data) > 0 {
			_ = json.Unmarshal(row.Data, &data)
		}
		out = append(out, LinkTarget{
			ID:       row.ID.String(),
			TableID:  targetTable.ID.String(),
			Title:    recordTitleFrom(data, targetTable.PrimaryFieldID),
			Subtitle: targetTable.Name,
		})
	}
	page := LinkTargetPage{Items: out, HasMore: hasMore}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		page.NextCursor = encodeLinkCursor(last.SortOrder, last.ID)
	}
	return page, nil
}

// assertTableInSpace 校验目标表属于同一空间，并写入目标表。
func (s *Service) assertTableInSpace(ctx context.Context, projectID, tableID uuid.UUID, out *BaseTable) error {
	var tb BaseTable
	if err := s.db.WithContext(ctx).Where("id = ? AND status = 1", tableID).First(&tb).Error; err != nil {
		return fmt.Errorf("%w: 目标表不存在", ErrFieldValueInvalid)
	}
	var app model.BaseApp
	if err := s.db.WithContext(ctx).
		Select("project_id").Where("id = ? AND status = 1", tb.BaseID).
		First(&app).Error; err != nil {
		return fmt.Errorf("%w: 目标表不在当前空间", ErrFieldValueInvalid)
	}
	if app.ProjectID != projectID {
		return fmt.Errorf("%w: 目标表不在当前空间", ErrFieldValueInvalid)
	}
	*out = tb
	return nil
}

// encodeLinkCursor 生成游标。
func encodeLinkCursor(sortOrder int64, id uuid.UUID) string {
	return fmt.Sprintf("%d:%s", sortOrder, id.String())
}

// decodeLinkCursor 解析游标；格式非法时返回 false（调用方按「从头开始」处理）。
func decodeLinkCursor(cursor string) (int64, uuid.UUID, bool) {
	parts := strings.SplitN(cursor, ":", 2)
	if len(parts) != 2 {
		return 0, uuid.Nil, false
	}
	sortOrder, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, uuid.Nil, false
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return 0, uuid.Nil, false
	}
	return sortOrder, id, true
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

// inboundRelationsFromIndex 用反向关系表反查「谁关联了我」。
//
// 反向表是派生索引：写入时与 base_record_links 同步维护。
// 老数据可能没写进反向表，所以查不到时由调用方退回全表扫描。
func (s *Service) inboundRelationsFromIndex(ctx context.Context, recordID uuid.UUID, visibleUser *recordViewer) ([]RecordRelation, error) {
	var rows []BaseRecordReverseLink
	if err := s.db.WithContext(ctx).
		Where("target_record_id = ?", recordID).
		Order("created_at ASC, id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	out := make([]RecordRelation, 0, len(rows))
	for _, row := range rows {
		var source BaseRecord
		if err := s.db.WithContext(ctx).
			Where("id = ? AND deleted_at IS NULL", row.SourceRecordID).
			First(&source).Error; err != nil {
			continue
		}
		if visibleUser != nil && !s.recordScopeAllows(source, visibleUser.userID, visibleUser.projectID) {
			continue
		}
		var tb BaseTable
		if err := s.db.WithContext(ctx).Where("id = ?", row.SourceTableID).First(&tb).Error; err != nil {
			continue
		}
		fieldName := ""
		var field BaseField
		if err := s.db.WithContext(ctx).Where("id = ?", row.FieldID).First(&field).Error; err == nil {
			fieldName = field.Name
		}
		title, err := s.recordTitle(ctx, source.ID, visibleUser)
		if err != nil {
			title = "未命名记录"
		}
		out = append(out, RecordRelation{
			Direction:     "inbound",
			TableID:       tb.ID.String(),
			TableName:     tb.Name,
			FieldID:       row.FieldID.String(),
			FieldName:     fieldName,
			RecordID:      source.ID.String(),
			RecordTitle:   title,
			TargetTableID: tb.ID.String(),
		})
	}
	return out, nil
}
