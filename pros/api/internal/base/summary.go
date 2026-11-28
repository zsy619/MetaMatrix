// 汇总行 / 列计算（E-07）。
//
// 需求：表格视图只有明细行，没有「按分组求和」的汇总带 —— 用户想看
// 「这个视图里一共多少钱」「每个分组各多少钱」只能自己导出到 Excel 再透视。
//
// 实现要点：
//   - 汇总口径**必须与筛选一致**：合计只统计「当前视图筛选后」的记录，
//     所以这里复用查询那套 WHERE 编译（buildFilterSQL + keyword + 记录可见范围），
//     绝不能另起一套口径（否则「合计 100」但列表只有 3 行，用户立刻不信任）。
//   - 聚合在 SQL 里做（COUNT/SUM/AVG/MIN/MAX），不在内存里遍历 ——
//     十万行的表不能为了画一条汇总带把全表拉进内存。
//   - 只统计**投影表**（base_record_values），不解析 JSONB ——
//     JSONB 解析是 CPU 大户，而投影表已经有类型化列了。
package base

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SummaryRequest 汇总请求。
type SummaryRequest struct {
	TableID string      `json:"tableId"`
	Filters FilterGroup `json:"filters"`
	Keyword string      `json:"keyword"`
	// Fields 参与汇总的字段与聚合函数（缺省按字段类型取默认聚合）。
	Fields []SummaryField `json:"fields"`
	// GroupFieldId 分组小计的分组字段（空 = 只要总计）。
	GroupFieldId string `json:"groupFieldId"`
	// Limit 分组小计最多返回多少组（防止分组过碎把接口打爆）。
	Limit int `json:"limit"`
}

// SummaryField 一个字段要算什么。
type SummaryField struct {
	FieldId string `json:"fieldId"`
	// Functions 取值：sum / avg / min / max / count / filled / empty。
	// 空 = 按类型取默认（数字类全算，文本类只算非空计数）。
	Functions []string `json:"functions"`
}

// SummaryValue 单个字段的聚合结果。
type SummaryValue struct {
	FieldId string   `json:"fieldId"`
	Sum     *float64 `json:"sum,omitempty"`
	Avg     *float64 `json:"avg,omitempty"`
	Min     *float64 `json:"min,omitempty"`
	Max     *float64 `json:"max,omitempty"`
	// Count 参与聚合的行数（数字字段 = 有值的行数）。
	Count int64 `json:"count"`
	// Filled 非空计数，Empty 空值计数。
	Filled int64 `json:"filled"`
	Empty  int64 `json:"empty"`
}

// SummaryGroup 一个分组的小计。
type SummaryGroup struct {
	Key    string         `json:"key"`
	Count  int64          `json:"count"`
	Values []SummaryValue `json:"values"`
}

// SummaryResult 汇总结果。
type SummaryResult struct {
	TableId string         `json:"tableId"`
	Total   int64          `json:"total"`
	Values  []SummaryValue `json:"values"`
	Groups  []SummaryGroup `json:"groups"`
}

// MaxSummaryFields 单次汇总最多处理多少个字段。
const MaxSummaryFields = 20

// MaxSummaryGroups 分组小计最多返回多少组。
const MaxSummaryGroups = 100

// Summary 计算视图的汇总行 / 分组小计。
func (s *Service) Summary(ctx context.Context, userID, projectID uuid.UUID, req SummaryRequest) (*SummaryResult, error) {
	tableID, err := uuid.Parse(req.TableID)
	if err != nil {
		return nil, fmt.Errorf("%w: bad table id", ErrQueryInvalid)
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	_ = table
	// 字段级权限：隐藏字段既不返回元信息，也不参与汇总（否则能通过合计反推被隐藏的数值）。
	idx = filterIndexForSubject(idx, s.subjectOf(userID, projectID))

	ids, err := s.summaryFilteredIDs(ctx, userID, projectID, tableID, idx, req)
	if err != nil {
		return nil, err
	}

	fields := req.Fields
	if len(fields) == 0 {
		// 没指定就汇总全部可见字段（数字类给全套聚合，文本类给非空计数）。
		for id := range idx.byID {
			fields = append(fields, SummaryField{FieldId: id.String()})
		}
	}
	if len(fields) > MaxSummaryFields {
		fields = fields[:MaxSummaryFields]
	}

	result := &SummaryResult{TableId: tableID.String(), Values: []SummaryValue{}, Groups: []SummaryGroup{}}

	// 总行数（与列表口径一致）。
	var total int64
	if err := s.db.WithContext(ctx).Table("(?) AS ids", ids).Count(&total).Error; err != nil {
		return nil, err
	}
	result.Total = total

	for _, spec := range fields {
		fid, err := uuid.Parse(spec.FieldId)
		if err != nil {
			continue
		}
		handler, ok := idx.handler(fid)
		if !ok {
			continue
		}
		value, err := s.summaryField(ctx, tableID, fid, handler.ProjectedType(), ids, total)
		if err != nil {
			return nil, err
		}
		result.Values = append(result.Values, value)
	}

	// 分组小计。
	if req.GroupFieldId != "" {
		gid, err := uuid.Parse(req.GroupFieldId)
		if err == nil {
			if handler, ok := idx.handler(gid); ok {
				groups, err := s.summaryGroups(ctx, tableID, gid, handler.ProjectedType(), fields, idx, ids)
				if err != nil {
					return nil, err
				}
				result.Groups = groups
			}
		}
	}
	return result, nil
}

// summaryFilteredIDs 编译「筛选后记录 ID」的子查询。
//
// 与查询走同一套 WHERE：筛选条件 + 关键字 + 记录可见范围。
func (s *Service) summaryFilteredIDs(
	ctx context.Context,
	userID, projectID, tableID uuid.UUID,
	idx *fieldIndex,
	req SummaryRequest,
) (*gorm.DB, error) {
	sub := s.db.WithContext(ctx).Table("base_records AS r").
		Select("r.id").
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)
	sub = s.applyRecordScope(sub, userID, projectID, "r")

	filters := req.Filters
	if len(filters.Conditions) > 0 || len(filters.Children) > 0 {
		filters = s.resolveDocTitleFilters(ctx, projectID, idx, filters)
	}
	where, args, err := s.buildFilterSQL(tableID, idx, filters)
	if err != nil {
		return nil, err
	}
	if where != "" {
		sub = sub.Where(where, args...)
	}
	kwCond, kwArgs, _ := s.compileKeyword(ctx, projectID, tableID, idx, req.Keyword)
	if kwCond != "" {
		sub = sub.Where(kwCond, kwArgs...)
	}
	return sub, nil
}

// summaryField 聚合单个字段。
func (s *Service) summaryField(
	ctx context.Context,
	tableID, fieldID uuid.UUID,
	projected string,
	ids *gorm.DB,
	total int64,
) (SummaryValue, error) {
	out := SummaryValue{FieldId: fieldID.String()}
	filledCond := summaryFilledCond(projected)
	var agg struct {
		Filled int64    `gorm:"column:filled"`
		Sum    *float64 `gorm:"column:sum"`
		Avg    *float64 `gorm:"column:avg"`
		Min    *float64 `gorm:"column:min"`
		Max    *float64 `gorm:"column:max"`
	}
	selects := []string{"COUNT(*) FILTER (WHERE " + filledCond + ") AS filled"}
	if projected == ProjectedNumber {
		selects = append(selects,
			"SUM(v.value_number) AS sum",
			"AVG(v.value_number) AS avg",
			"MIN(v.value_number) AS min",
			"MAX(v.value_number) AS max",
		)
	}
	if err := s.db.WithContext(ctx).
		Table("base_record_values v").
		Select(strings.Join(selects, ", ")).
		Where("v.table_id = ? AND v.field_id = ? AND v.record_id IN (?)", tableID, fieldID, ids).
		Scan(&agg).Error; err != nil {
		return out, err
	}
	out.Filled = agg.Filled
	out.Count = agg.Filled
	if total > agg.Filled {
		out.Empty = total - agg.Filled
	}
	if projected == ProjectedNumber {
		out.Sum = agg.Sum
		out.Avg = agg.Avg
		out.Min = agg.Min
		out.Max = agg.Max
	}
	return out, nil
}

// summaryGroups 分组小计。
func (s *Service) summaryGroups(
	ctx context.Context,
	tableID, groupID uuid.UUID,
	groupProjected string,
	fields []SummaryField,
	idx *fieldIndex,
	ids *gorm.DB,
) ([]SummaryGroup, error) {
	// 分组键取值表达式（按投影类型选列）。
	keyExpr := "g.value_text"
	switch groupProjected {
	case ProjectedNumber:
		keyExpr = "g.value_number"
	case ProjectedDate:
		keyExpr = "g.value_date"
	case ProjectedBool:
		keyExpr = "g.value_bool"
	}
	type groupRow struct {
		Key   string `gorm:"column:key"`
		Count int64  `gorm:"column:count"`
	}
	var rows []groupRow
	if err := s.db.WithContext(ctx).
		Table("base_record_values g").
		Select(keyExpr+" AS key, COUNT(*) AS count").
		Where("g.table_id = ? AND g.field_id = ? AND g.record_id IN (?)", tableID, groupID, ids).
		Group(keyExpr).
		Order("count DESC").
		Limit(MaxSummaryGroups).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	groups := make([]SummaryGroup, 0, len(rows))
	for _, row := range rows {
		g := SummaryGroup{Key: row.Key, Count: row.Count, Values: []SummaryValue{}}
		// 每组再算一次各字段的聚合（分组数有上限，代价可控）。
		for _, spec := range fields {
			fid, err := uuid.Parse(spec.FieldId)
			if err != nil {
				continue
			}
			handler, ok := idx.handler(fid)
			if !ok {
				continue
			}
			value, err := s.summaryFieldInGroup(ctx, tableID, fid, handler.ProjectedType(), groupID, keyExpr, groupProjected, row.Key, ids)
			if err != nil {
				return nil, err
			}
			g.Values = append(g.Values, value)
		}
		groups = append(groups, g)
	}
	return groups, nil
}

// summaryFieldInGroup 聚合「某个分组内」的单字段。
func (s *Service) summaryFieldInGroup(
	ctx context.Context,
	tableID, fieldID uuid.UUID,
	projected string,
	groupID uuid.UUID,
	keyExpr string,
	groupProjected string,
	key string,
	ids *gorm.DB,
) (SummaryValue, error) {
	out := SummaryValue{FieldId: fieldID.String()}
	filledCond := strings.ReplaceAll(summaryFilledCond(projected), "v.", "m.")
	selects := []string{"COUNT(*) FILTER (WHERE " + filledCond + ") AS filled"}
	if projected == ProjectedNumber {
		selects = append(selects,
			"SUM(m.value_number) AS sum",
			"AVG(m.value_number) AS avg",
			"MIN(m.value_number) AS min",
			"MAX(m.value_number) AS max",
		)
	}
	var agg struct {
		Filled int64    `gorm:"column:filled"`
		Sum    *float64 `gorm:"column:sum"`
		Avg    *float64 `gorm:"column:avg"`
		Min    *float64 `gorm:"column:min"`
		Max    *float64 `gorm:"column:max"`
	}
	if err := s.db.WithContext(ctx).
		Table("base_record_values g JOIN base_record_values m ON m.record_id = g.record_id").
		Select(strings.Join(selects, ", ")).
		Where("g.table_id = ? AND g.field_id = ? AND m.field_id = ? AND g.record_id IN (?)",
			tableID, groupID, fieldID, ids).
		Where(keyExpr+" = ?", summaryGroupKeyValue(groupProjected, key)).
		Scan(&agg).Error; err != nil {
		return out, err
	}
	out.Filled = agg.Filled
	out.Count = agg.Filled
	if projected == ProjectedNumber {
		out.Sum = agg.Sum
		out.Avg = agg.Avg
		out.Min = agg.Min
		out.Max = agg.Max
	}
	return out, nil
}

// summaryFilledCond 判定「该字段在这行里有值」的表达式。
func summaryFilledCond(projected string) string {
	switch projected {
	case ProjectedNumber:
		return "v.value_number IS NOT NULL"
	case ProjectedDate:
		return "v.value_date IS NOT NULL"
	case ProjectedBool:
		return "v.value_bool IS NOT NULL"
	case ProjectedJSON:
		return "v.value_json IS NOT NULL"
	default:
		return "COALESCE(v.value_text,'') <> ''"
	}
}

// summaryGroupKeyValue 把分组键文本还原成可比较的值。
func summaryGroupKeyValue(projected, key string) any {
	switch projected {
	case ProjectedNumber:
		if f, err := strconv.ParseFloat(key, 64); err == nil {
			return f
		}
		return key
	case ProjectedBool:
		switch strings.ToLower(key) {
		case "true", "t", "1":
			return true
		case "false", "f", "0":
			return false
		}
		return key
	default:
		return key
	}
}
