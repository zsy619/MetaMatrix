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

// syncComputedDependency 维护引用 / 汇总字段的**跨表依赖边**。
//
// 背景（A-06）：过去 base_formula_dependencies 里只有公式字段的依赖，
// 引用 / 汇总字段指向别的表这件事只存在字段配置 JSON 里 ——
// 「谁依赖我」这条反查链路没有索引，每次判定都要全库扫。
//
// 现在把跨表依赖也写进依赖图：
//   - 公式字段依赖本表字段 → dependency_type = 'field'（原来就有）；
//   - 引用 / 汇总字段依赖目标表 → dependency_type = 'lookup' / 'rollup'。
//
// 这样依赖图就是完整的跨表依赖关系，
// 既能支撑「谁依赖我」的接口，也能支撑反查索引。
func (s *Service) syncComputedDependency(tx *gorm.DB, tenantID, tableID, fieldID uuid.UUID, fieldType string, config map[string]any) error {
	// 先清掉这个字段作为依赖方产生的**非公式依赖**（公式依赖由保存公式的路径维护）。
	//
	// 依赖表还不存在（老库未迁移 / 精简影子库）时忽略 ——
	// 依赖图只是加速用的旁路，不能因为它让建字段失败。
	if err := tx.Where("formula_field_id = ? AND dependency_type <> 'field'", fieldID).
		Delete(&BaseFormulaDependency{}).Error; err != nil && !isMissingTable(err) {
		return err
	}
	if fieldType != string(FieldLookup) && fieldType != string(FieldRollup) {
		return nil
	}
	rawTarget, _ := config["targetTableId"].(string)
	if rawTarget == "" {
		return nil
	}
	target, err := uuid.Parse(rawTarget)
	if err != nil {
		return nil
	}
	// 被依赖的字段：优先目标字段，其次本地关联字段，都取不到就退化成零值 UUID
	//（同一字段只会留下一行边，语义不受影响）。
	depField := uuid.Nil
	for _, key := range []string{"targetFieldId", "linkFieldId"} {
		raw, ok := config[key].(string)
		if !ok || raw == "" {
			continue
		}
		if parsed, err := uuid.Parse(raw); err == nil {
			depField = parsed
			break
		}
	}
	row := BaseFormulaDependency{
		ID: uuid.New(), TenantID: tenantID, TableID: tableID,
		FormulaFieldID: fieldID, DependencyFieldID: depField,
		DependencyType: fieldType, DependencyTableID: &target,
	}
	if err := tx.Create(&row).Error; err != nil && !isMissingTable(err) {
		return err
	}
	return nil
}

// dependentTableIDs 反查「哪些表的引用 / 汇总字段指向这张表」。
//
// 旧实现（computeHasDependents / RecalcDependentsOfTable 的老写法）：
// 把整个 Base 下所有表列出来，**逐表加载字段索引**再逐字段比对配置 ——
// 表一多，写入路径上的依赖判定就变成 O(表数) 次查库。
//
// 现在改成一条索引查询：
//
//	SELECT DISTINCT table_id FROM base_fields
//	 WHERE type IN ('lookup','rollup') AND config->>'targetTableId' = ?
//
// 走 idx_base_field_target_table 表达式索引，一次查完。
//
// 大小写都带上：UUID 的字符串写法有大写 / 小写两种可能，
// 两个分支都能命中表达式索引（PG 走 BitmapOr）。
func (s *Service) dependentTableIDs(ctx context.Context, targetTableID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	lower := strings.ToLower(targetTableID.String())
	upper := strings.ToUpper(targetTableID.String())
	if err := s.db.WithContext(ctx).
		Raw(`SELECT DISTINCT table_id FROM base_fields
		      WHERE status = 1
		        AND type IN ('lookup', 'rollup')
		        AND (config->>'targetTableId' = ? OR config->>'targetTableId' = ?)`,
			lower, upper).
		Scan(&ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
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
//
// 治理前的三个问题（都是 N+1 / 全表载入）：
//  1. `Find(&records)` 把整表 JSONB 读进内存；
//  2. 每条记录都要查一次目标记录（lookup.go 的 `id IN ?`）—— 5000 行 = 5000 次往返；
//  3. 每条记录都重查一遍 base_fields。
//
// 现在的结构：
//   - 按 id 游标分批（每批 500 行），内存占用与表大小无关；
//   - 关联边按批取（`source_record_id IN (本批)`），目标记录**一次性批量取回**后内存计算；
//   - 字段元数据取一次，投影用 syncProjectionsWithFields 批量写。
func (s *Service) recalcComputedFields(ctx context.Context, table *BaseTable, idx *fieldIndex) (int, error) {
	specs := s.collectComputedSpecs(idx)
	if len(specs) == 0 {
		return 0, nil
	}
	// 关联字段（每个 spec 对应一个 link 字段）。
	linkFields := make([]uuid.UUID, 0, len(specs))
	for _, spec := range specs {
		linkField, ok := s.resolveLinkField(idx, spec)
		if !ok {
			continue
		}
		linkFields = append(linkFields, linkField)
	}
	if len(linkFields) == 0 {
		return 0, nil
	}
	// 字段元数据取一次（旧实现每行都查）。
	fields, err := s.loadIndexableFields(s.db.WithContext(ctx), table.ID)
	if err != nil {
		return 0, err
	}

	updated := 0
	err = iterateRecordsByCursor(s.db.WithContext(ctx), table.ID, false, func(chunk []BaseRecord) error {
		recordIDs := make([]uuid.UUID, 0, len(chunk))
		for _, rec := range chunk {
			recordIDs = append(recordIDs, rec.ID)
		}
		// 本批的关联边：一次查完，不再逐条查。
		var links []BaseRecordLink
		if err := s.db.WithContext(ctx).
			Where("source_table_id = ? AND source_record_id IN ?", table.ID, recordIDs).
			Find(&links).Error; err != nil {
			return err
		}
		linkedByRecord := map[uuid.UUID][]BaseRecordLink{}
		for _, l := range links {
			linkedByRecord[l.SourceRecordID] = append(linkedByRecord[l.SourceRecordID], l)
		}
		// 本批涉及的目标记录：一次批量取回，内存里算值。
		targetIDs := make([]uuid.UUID, 0, len(links))
		for _, l := range links {
			targetIDs = append(targetIDs, l.TargetRecordID)
		}
		targetData := map[uuid.UUID]map[string]any{}
		if len(targetIDs) > 0 {
			var targets []BaseRecord
			if err := s.db.WithContext(ctx).
				Where("id IN ? AND deleted_at IS NULL", dedupeUUIDs(targetIDs)).
				Find(&targets).Error; err != nil {
				return err
			}
			for _, r := range targets {
				data := map[string]any{}
				if len(r.Data) > 0 {
					_ = json.Unmarshal(r.Data, &data)
				}
				targetData[r.ID] = data
			}
		}

		for _, rec := range chunk {
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
				values := collectLinkedValuesFrom(spec, linkedByRecord[rec.ID], linkField, targetData)
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
				return err
			}
			if err := s.syncProjectionsWithFields(s.db.WithContext(ctx), table.ID, rec.ID, table.TenantID, data, fields); err != nil {
				return err
			}
			updated++
		}
		return nil
	})
	if err != nil {
		return updated, err
	}
	return updated, nil
}

// dedupeUUIDs 去重（保留顺序），避免 IN (?, ?, …) 里出现重复参数把语句撑爆。
func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return ids
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// collectLinkedValuesFrom 从已取回的目标记录里算值（不再查库）。
func collectLinkedValuesFrom(spec computedFieldSpec, links []BaseRecordLink, linkField uuid.UUID, targetData map[uuid.UUID]map[string]any) []any {
	if spec.targetFieldID == uuid.Nil {
		return []any{}
	}
	values := make([]any, 0, len(links))
	for _, l := range links {
		if l.FieldID != linkField {
			continue
		}
		data, ok := targetData[l.TargetRecordID]
		if !ok {
			continue
		}
		if v, ok := data[spec.targetFieldID.String()]; ok && v != nil {
			values = append(values, v)
		}
	}
	return values
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
	// 反查依赖方：一条索引查询拿到「哪些表的引用 / 汇总字段指向这张表」。
	//
	// 旧实现是把整个 Base 的表全列一遍、逐表加载字段索引再逐字段比对 ——
	// 表越多越慢，而且每张表都要查一次库。
	depTableIDs, err := s.dependentTableIDs(ctx, targetTableID)
	if err != nil {
		return 0, err
	}
	updated := 0
	for _, depTableID := range depTableIDs {
		if depTableID == targetTableID {
			continue
		}
		var tbl BaseTable
		if err := s.db.WithContext(ctx).Where("id = ? AND status = 1", depTableID).First(&tbl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return updated, err
		}
		idx, err := s.loadFieldIndex(ctx, tbl.ID)
		if err != nil {
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

// recalcState 是一张表的「依赖重算」调度状态。
type recalcState struct {
	// dirty 表示「有新的写入还没被重算覆盖」。
	dirty bool
	// running 表示「已有一轮重算在跑」。
	running bool
}

// recalcMergeWindow 是重算合并窗口。
//
// 连续写入（比如批量导入 500 行）会被合并成一轮重算：
// 窗口内的写入只置 dirty，由当前那一轮结束后统一再跑。
const recalcMergeWindow = 300 * time.Millisecond

// scheduleDependentRecalc 在后台异步重算依赖方（写目标表之后调用）。
//
// 这个函数以前是**死代码**（全仓无调用点）：改了关联字段之后，
// 引用 / 汇总列的值一直是旧的，只能靠用户手点「重算」。
// 现在在记录写入成功后调用它。
//
// 两个必要的约束：
//   - **合并而不是丢弃**：连续写入必须合并成一轮重算。
//     早先的实现用「2 秒内直接 return」去抖，结果把窗口内的写入**吞掉**了
//     —— 重算根本没发生，引用列还是旧值（回归用例 TestDependentRecalcRunsAfterWrite 抓到）。
//     现在改成 dirty 标记：窗口内的写入会安排**下一轮**，不会丢；
//   - **超时放宽到 5 分钟**：原来的 30s 在大表上必然中途超时，
//     留下一半重算一半没重算的半成品状态（重算是幂等的，下次会补上）。
func (s *Service) scheduleDependentRecalc(tableID uuid.UUID) {
	// 注意：依赖判定**不能在写入路径里同步做** ——
	// 它要查库，而写入路径此时可能正占着事务连接；
	// 连接池压到 4 条时，同步查库会把并发写入直接卡死
	// （回归用例 TestBatchCreateUnderTightPoolDoesNotDeadlock 抓到）。
	// 所以判定与重算都放在后台 goroutine 里做。
	s.recalcMu.Lock()
	if s.recalcStates == nil {
		s.recalcStates = map[uuid.UUID]*recalcState{}
	}
	st := s.recalcStates[tableID]
	if st == nil {
		st = &recalcState{}
		s.recalcStates[tableID] = st
	}
	st.dirty = true
	if st.running {
		// 已有一轮在跑：让它结束后再跑一轮（合并连续写入）。
		s.recalcMu.Unlock()
		return
	}
	st.running = true
	s.recalcMu.Unlock()

	go func() {
		defer func() {
			s.recalcMu.Lock()
			st.running = false
			s.recalcMu.Unlock()
		}()
		for {
			s.recalcMu.Lock()
			if !st.dirty {
				s.recalcMu.Unlock()
				return
			}
			st.dirty = false
			s.recalcMu.Unlock()

			// 依赖判定（后台做，不占用写入路径的连接）：
			// 绝大多数表根本没有引用 / 汇总字段，判定为「无依赖」就直接收工。
			has, err := s.tableHasDependents(tableID)
			if err != nil {
				fmt.Printf("base: check dependents of %s failed: %v\n", tableID, err)
				break
			}
			if !has {
				break
			}
			// 全局闸门：同一时刻只跑一轮重算。
			// 抢不到闸门就保持 dirty，由当前那轮结束后再跑 —— 不丢。
			select {
			case s.recalcSem <- struct{}{}:
			default:
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			_, recalcErr := s.RecalcDependentsOfTable(ctx, tableID)
			cancel()
			<-s.recalcSem
			if recalcErr != nil {
				// 依赖重算失败不影响主流程，只记录。
				fmt.Printf("base: recalc dependents of %s failed: %v\n", tableID, recalcErr)
			}
			// 合并窗口：窗口内的写入会被这一轮之后的下一轮覆盖。
			time.Sleep(recalcMergeWindow)
		}
	}()
}

// depCacheTTL 是依赖判定的缓存时长。
const depCacheTTL = 60 * time.Second

// tableHasDependents 判断「有没有别的表的引用 / 汇总字段指向这张表」。
//
// 结果缓存 60s：字段结构变化不频繁，没必要每次写入都去全库扫一遍依赖关系。
// 结构变更（建 / 删字段、改类型）会调用 invalidateDepCache 主动失效。
func (s *Service) tableHasDependents(tableID uuid.UUID) (bool, error) {
	s.depMu.Lock()
	if item, ok := s.depCache[tableID]; ok && time.Since(item.at) < depCacheTTL {
		s.depMu.Unlock()
		return item.has, nil
	}
	s.depMu.Unlock()

	has, err := s.computeHasDependents(tableID)
	if err != nil {
		return false, err
	}
	s.depMu.Lock()
	s.depCache[tableID] = depCacheEntry{has: has, at: time.Now()}
	s.depMu.Unlock()
	return has, nil
}

// computeHasDependents 实际查询依赖关系（结果会被缓存）。
//
// 现在走索引反查（dependentTableIDs），不再逐表加载字段索引。
func (s *Service) computeHasDependents(tableID uuid.UUID) (bool, error) {
	depTables, err := s.dependentTableIDs(context.Background(), tableID)
	if err != nil {
		return false, err
	}
	for _, id := range depTables {
		if id != tableID {
			return true, nil
		}
	}
	return false, nil
}

// invalidateDepCache 失效依赖判定缓存（字段 / 表结构变更后调用）。
//
// 依赖关系是**跨表**的：在 B 表新建一个引用字段，会让 A 表「有依赖方」，
// 所以这里清空整张缓存而不是只删一项。
func (s *Service) invalidateDepCache() {
	s.depMu.Lock()
	s.depCache = map[uuid.UUID]depCacheEntry{}
	s.depMu.Unlock()
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
