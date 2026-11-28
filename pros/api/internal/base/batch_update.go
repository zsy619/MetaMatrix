package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 批量更新的共享上下文。
//
// 旧实现是「逐行调 UpdateRecord」：每一行都要重查表结构、字段索引、
// 权限身份、目标记录、公式定义、投影字段，还要各自开一个事务。
// 100 行 = 几千次重复往返，实测 P50 837ms，并发一上来还会把连接池打满。
//
// 现在改成与批量创建同一套骨架：
//   - 共享上下文（表结构 / 字段元数据 / 权限身份 / 投影字段）取一次；
//   - 同一份补丁只归一化 + 校验一次；
//   - 目标记录一次查齐（带记录级可见范围过滤）；
//   - 分块事务（baseBatchChunk）+ 每行一个 SAVEPOINT；
//   - 投影「一次 DELETE + 一次批量 INSERT」，审计 / 事件收尾批量落库。
//
// 往返数与行数脱钩：100 行从「上千次 SQL」降到「每行 1 次 UPDATE + 每块常数次」。
type batchUpdateTarget struct {
	id     uuid.UUID
	rec    BaseRecord
	merged map[string]any
}

// batchUpdate 执行批量更新；strict=true 时任一行失败即整体报错。
func (s *Service) batchUpdate(
	ctx context.Context,
	userID, projectID, tableID uuid.UUID,
	ids []uuid.UUID,
	fields map[string]any,
	strict bool,
) ([]RecordRow, []BatchFailure) {
	rows := make([]RecordRow, 0, len(ids))
	failures := make([]BatchFailure, 0)
	if len(ids) == 0 {
		return rows, failures
	}
	// 共享上下文：表结构 / 字段元数据 / 权限身份 / 投影字段。
	io, err := s.newWriteIO(ctx, userID, projectID, tableID)
	if err != nil {
		return rows, batchAllFailed(len(ids), err)
	}
	// 补丁只归一化一次：同一批所有行改的是同一批字段。
	patch, err := s.normalizeValues(io.idx, fields)
	if err != nil {
		return rows, batchAllFailed(len(ids), err)
	}
	// 引用校验（文档 / 关联记录是否存在）与行无关，只查一次。
	if err := s.validateDocRefs(ctx, projectID, io.idx, patch); err != nil {
		return rows, batchAllFailed(len(ids), err)
	}
	if err := s.validateLinkRefs(ctx, io.table.BaseID, projectID, userID, io.idx, patch); err != nil {
		return rows, batchAllFailed(len(ids), err)
	}
	// 目标记录一次查齐（记录级可见范围在 SQL 里过滤）。
	recs, err := s.loadBatchRecords(ctx, userID, projectID, tableID, ids)
	if err != nil {
		return rows, batchAllFailed(len(ids), err)
	}
	// 条件可见字段的可见性依赖「本行旧值 + 本次提交」，必须逐行判断。
	targets := make([]batchUpdateTarget, 0, len(ids))
	for _, id := range ids {
		rec, ok := recs[id]
		if !ok {
			failures = append(failures, BatchFailure{
				Target: id.String(), Message: ErrRecordNotFound.Error(), Cause: ErrRecordNotFound,
			})
			continue
		}
		data := map[string]any{}
		if len(rec.Data) > 0 {
			_ = json.Unmarshal(rec.Data, &data)
		}
		merged := make(map[string]any, len(data)+len(patch))
		for k, v := range data {
			merged[k] = v
		}
		for k, v := range patch {
			merged[k] = v
		}
		if err := s.assertWritableFields(io.idx, io.subj, patch, merged); err != nil {
			failures = append(failures, BatchFailure{Target: id.String(), Message: err.Error(), Cause: err})
			continue
		}
		targets = append(targets, batchUpdateTarget{id: id, rec: rec, merged: merged})
	}
	if strict && len(failures) > 0 {
		return nil, failures
	}

	// 分块写入：每块一个事务，块内每行一个 SAVEPOINT。
	for start := 0; start < len(targets); start += baseBatchChunk {
		end := start + baseBatchChunk
		if end > len(targets) {
			end = len(targets)
		}
		rowsBefore := len(rows)
		failuresBefore := len(failures)
		tx := s.db.WithContext(ctx).Begin()
		if tx.Error != nil {
			failures = append(failures, batchChunkFailures(start, end, tx.Error)...)
			continue
		}
		io.probeTables(tx)
		formulas := io.tableFormulas(tx)
		auditsBefore := len(io.pendingAudits)
		eventsBefore := len(io.pendingEvents)
		// 投影行攒到块尾统一写：一次 DELETE + 一次批量 INSERT。
		projRows := make([]BaseRecordValue, 0, baseBatchChunk*4)
		projPairs := make([][2]any, 0, baseBatchChunk*4)
		chunkOK := true
		for j := start; j < end; j++ {
			target := targets[j]
			sp := fmt.Sprintf("sp_u_%d", j)
			if err := tx.Exec("SAVEPOINT " + sp).Error; err != nil {
				failures = append(failures, BatchFailure{Target: target.id.String(), Message: err.Error(), Cause: err})
				chunkOK = false
				break
			}
			rowAudits := len(io.pendingAudits)
			rowEvents := len(io.pendingEvents)
			row, rowsForRecord, err := s.persistBatchUpdate(
				ctx, userID, projectID, io, formulas, tx, target, patch,
			)
			if err != nil {
				// 回滚到本行存档点，事务恢复可写，后续行继续。
				_ = tx.Exec("ROLLBACK TO SAVEPOINT " + sp).Error
				io.truncatePending(rowAudits, rowEvents)
				failures = append(failures, BatchFailure{Target: target.id.String(), Message: err.Error(), Cause: err})
				if strict {
					chunkOK = false
					break
				}
				continue
			}
			rows = append(rows, *row)
			projRows = append(projRows, rowsForRecord...)
			for _, r := range rowsForRecord {
				projPairs = append(projPairs, [2]any{r.RecordID, r.FieldID})
			}
		}
		if chunkOK {
			// 投影统一落库（覆盖式写入：先删后插）。
			if err := deleteProjectionPairs(tx, projPairs); err != nil {
				tx.Rollback()
				rows = rows[:rowsBefore]
				failures = failures[:failuresBefore]
				failures = append(failures, batchChunkFailures(start, end, err)...)
				continue
			}
			if len(projRows) > 0 {
				if err := tx.CreateInBatches(&projRows, 200).Error; err != nil {
					tx.Rollback()
					rows = rows[:rowsBefore]
					failures = failures[:failuresBefore]
					failures = append(failures, batchChunkFailures(start, end, err)...)
					continue
				}
			}
			// 审计与事件批量落库（与记录同事务）。
			if err := io.flushPending(tx); err != nil {
				tx.Rollback()
				rows = rows[:rowsBefore]
				failures = failures[:failuresBefore]
				failures = append(failures, batchChunkFailures(start, end, err)...)
				continue
			}
			if err := tx.Commit().Error; err != nil {
				failures = append(failures, batchChunkFailures(start, end, err)...)
				rows = rows[:rowsBefore]
				continue
			}
		} else {
			tx.Rollback()
			rows = rows[:rowsBefore]
			failures = failures[:failuresBefore]
			io.truncatePending(auditsBefore, eventsBefore)
		}
	}
	return rows, failures
}

// persistBatchUpdate 在事务内写一行（乐观锁 + 有限重试）。
//
// 每行只有一次 UPDATE；版本冲突时重新读一次该行再合并重试，
// 与单条更新的语义一致（后写者基于最新值合并，不覆盖别人的字段）。
func (s *Service) persistBatchUpdate(
	ctx context.Context,
	userID, projectID uuid.UUID,
	io *writeIO,
	formulas map[string]BaseFieldFormula,
	tx *gorm.DB,
	target batchUpdateTarget,
	patch map[string]any,
) (*RecordRow, []BaseRecordValue, error) {
	const maxConflictRetry = 3
	locked := target.rec
	for attempt := 0; ; attempt++ {
		base := map[string]any{}
		if len(locked.Data) > 0 {
			_ = json.Unmarshal(locked.Data, &base)
		}
		merged := make(map[string]any, len(base)+len(patch))
		for k, v := range base {
			merged[k] = v
		}
		for k, v := range patch {
			merged[k] = v
		}
		now := time.Now()
		applySystemFields(io.idx, merged, locked.CreatedAt, now, locked.CreatedBy, userID)
		computed, err := s.applyFormulas(io.table, io.idx, merged, formulas)
		if err != nil {
			return nil, nil, err
		}
		raw, _ := json.Marshal(computed)
		res := tx.Model(&BaseRecord{}).
			Where("id = ? AND version = ? AND deleted_at IS NULL", locked.ID, locked.Version).
			Updates(map[string]any{
				"data":       raw,
				"version":    gorm.Expr("version + 1"),
				"updated_by": userID,
				"updated_at": now,
			})
		if res.Error != nil {
			return nil, nil, res.Error
		}
		if res.RowsAffected == 0 {
			// 版本已被他人推进：重读该行后合并重试。
			if attempt+1 >= maxConflictRetry {
				return nil, nil, fmt.Errorf("%w: 记录已被他人修改", ErrVersionConflict)
			}
			var fresh BaseRecord
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND deleted_at IS NULL", target.id).First(&fresh).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return nil, nil, ErrRecordNotFound
				}
				return nil, nil, err
			}
			locked = fresh
			continue
		}
		// 关系表维护（表里没有 link 字段时零开销）。
		if err := s.syncRecordLinksWith(tx, io.table, io.idx, locked.ID, computed, io.hasLinks); err != nil {
			return nil, nil, err
		}
		// 审计与事件先进缓冲，块尾批量落库。
		io.pendingAudits = append(io.pendingAudits, newAuditRow(
			projectID, io.table.BaseID, &io.table.ID, &locked.ID, userID, "record.updated", base, computed, ""))
		io.pendingEvents = append(io.pendingEvents, newEventRow(
			projectID, io.table.BaseID, &io.table.ID, &locked.ID, "record", "record.updated", map[string]any{
				"version":  locked.Version + 1,
				"fieldIds": fieldIDsOf(patch),
			}))
		// 投影行只收集不写入，块尾统一 DELETE + INSERT。
		projRows := s.projectionRowsForRecord(projectID, io.table.ID, locked.ID, computed, io.projFields)
		stripped, condHidden := stripHiddenFieldsWithReasons(computed, io.idx, io.subj)
		return &RecordRow{
			ID:                locked.ID,
			Version:           locked.Version + 1,
			Fields:            stripped,
			Updated:           now,
			Visibility:        locked.Visibility,
			CreatedBy:         locked.CreatedBy.String(),
			ConditionalHidden: condHidden,
		}, projRows, nil
	}
}

// projectionRowsForRecord 计算一条记录的投影行（不落库）。
func (s *Service) projectionRowsForRecord(
	tenantID, tableID, recordID uuid.UUID,
	data map[string]any,
	fields []BaseField,
) []BaseRecordValue {
	rows := make([]BaseRecordValue, 0, len(fields))
	for _, f := range fields {
		handler, ok := s.registry.Get(FieldType(f.Type))
		if !ok || !handler.Definition().Capabilities.Indexable {
			continue
		}
		value, exists := data[f.ID.String()]
		if !exists {
			continue
		}
		row, ok := projectionRow(handler, tableID, recordID, f.ID, tenantID, value)
		if !ok {
			continue
		}
		rows = append(rows, row)
	}
	return rows
}

// deleteProjectionPairs 按 (记录, 字段) 精确删除旧投影。
//
// 不用「按记录删全部字段」是为了避免把没被本次写入覆盖的字段投影一起删掉
// （那会造成「字段值还在、投影没了」的查询错位）。
func deleteProjectionPairs(tx *gorm.DB, pairs [][2]any) error {
	if len(pairs) == 0 {
		return nil
	}
	const perStatement = 500
	for start := 0; start < len(pairs); start += perStatement {
		end := start + perStatement
		if end > len(pairs) {
			end = len(pairs)
		}
		chunk := pairs[start:end]
		placeholders := make([]string, 0, len(chunk))
		args := make([]any, 0, len(chunk)*2)
		for _, p := range chunk {
			placeholders = append(placeholders, "(?, ?)")
			args = append(args, p[0], p[1])
		}
		sql := "DELETE FROM base_record_values WHERE (record_id, field_id) IN (" + strings.Join(placeholders, ",") + ")"
		if err := tx.Exec(sql, args...).Error; err != nil {
			return err
		}
	}
	return nil
}

// loadBatchRecords 一次查齐批量更新的目标记录（带记录级可见范围过滤）。
func (s *Service) loadBatchRecords(
	ctx context.Context,
	userID, projectID, tableID uuid.UUID,
	ids []uuid.UUID,
) (map[uuid.UUID]BaseRecord, error) {
	out := make(map[uuid.UUID]BaseRecord, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var recs []BaseRecord
	q := s.db.WithContext(ctx).
		Where("table_id = ? AND deleted_at IS NULL AND id IN ?", tableID, ids)
	// 记录级可见范围在 SQL 里过滤（与查询引擎同一口径）。
	// 不能逐行调 recordScopeAllows：那会让每行都去查一次空间角色，
	// 100 行就是 100 次重复往返，正好把这次优化抵消掉。
	q = s.applyRecordScope(q, userID, projectID, "")
	if err := q.Find(&recs).Error; err != nil {
		return nil, err
	}
	for _, rec := range recs {
		out[rec.ID] = rec
	}
	return out, nil
}
