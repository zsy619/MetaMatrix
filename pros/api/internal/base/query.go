package base

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm/clause"

	"metamatrix/api/internal/model"
)

// 查询相关错误。
var (
	ErrQueryInvalid  = errors.New("invalid query")
	ErrQueryTooLarge = errors.New("query exceeds limits")
)

// 查询规模上限，防止一条请求拖垮数据库。
const (
	MaxPageSize     = 500
	DefaultPageSize = 100
	MaxFilters      = 20
	MaxSorts        = 5
	MaxGroups       = 3
)

// Condition 是筛选条件。
type Condition struct {
	FieldID  string `json:"fieldId"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
}

// FilterGroup 是条件组，支持 AND / OR 与嵌套。
type FilterGroup struct {
	Logic      string        `json:"logic"`
	Conditions []Condition   `json:"conditions"`
	Children   []FilterGroup `json:"children"`
}

// SortRule 是排序规则。
type SortRule struct {
	FieldID string `json:"fieldId"`
	Order   string `json:"order"` // asc | desc
}

// GroupRule 是分组规则。
type GroupRule struct {
	FieldID string `json:"fieldId"`
	Order   string `json:"order"`
}

// QueryRequest 是统一查询请求。
type QueryRequest struct {
	TableID  string      `json:"tableId"`
	ViewID   string      `json:"viewId"`
	Filters  FilterGroup `json:"filters"`
	Sorts    []SortRule  `json:"sorts"`
	Groups   []GroupRule `json:"groups"`
	PageSize int         `json:"pageSize"`
	Cursor   string      `json:"cursor"`
	Keyword  string      `json:"keyword"`
}

// RecordRow 是返回给前端的一行记录。
type RecordRow struct {
	ID      uuid.UUID      `json:"id"`
	Version int64          `json:"version"`
	Fields  map[string]any `json:"fields"`
	Updated time.Time      `json:"updatedAt"`
	Group   string         `json:"group,omitempty"`
	// Visibility 是记录级可见范围（space / restricted）。
	Visibility string `json:"visibility,omitempty"`
	// CreatedBy 是记录创建者（受限记录只有他和管理者看得到）。
	CreatedBy string `json:"createdBy,omitempty"`
	// ConditionalHidden 是「因条件可见策略而对本行隐藏」的字段 ID 列表：
	// 这些字段的值不过网，界面据此显示占位符（而不是看起来像空值）。
	ConditionalHidden []string `json:"conditionalHidden,omitempty"`
}

// QueryResult 是查询返回结构。
type QueryResult struct {
	TableID        string      `json:"tableId"`
	ViewID         string      `json:"viewId,omitempty"`
	SchemaVersion  int64       `json:"schemaVersion"`
	Records        []RecordRow `json:"records"`
	Total          int64       `json:"total"`
	Page           PageInfo    `json:"page"`
	Fields         []FieldMeta `json:"fields"`
	ComputedFields []string    `json:"computedFields,omitempty"`
}

// PageInfo 描述分页信息。
type PageInfo struct {
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
	PageSize   int    `json:"pageSize"`
	Offset     int    `json:"offset"`
}

// FieldMeta 是字段的对外元信息（与前端字段注册表对齐）。
type FieldMeta struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Config    map[string]any `json:"config"`
	Required  bool           `json:"required"`
	IsPrimary bool           `json:"isPrimary"`
	SortOrder int            `json:"sortOrder"`
	Version   int64          `json:"version"`
	// ReadOnly 表示**当前用户**对该字段只读（字段级权限策略计算结果）。
	ReadOnly bool `json:"readOnly"`
	// Conditional 表示该字段配置了「条件可见」策略：
	// 只有满足条件的记录才看得到它（字段本身仍然存在于字段列表里）。
	Conditional bool `json:"conditional"`
}

// pageCursor 是解析后的分页游标。
//
// 两种形态：
//   - **keyset（v2）**：记录「最后一条的 sort_order + id」，配合 WHERE 条件翻页。
//     深翻页（第 1000 页）与第 1 页耗时同量级（不再 OFFSET 扫描前面所有行）。
//   - **offset（旧格式）**：`o:<n>`，仅为兼容历史客户端保留，仍按 OFFSET 翻页。
type pageCursor struct {
	// offset 是旧格式游标的偏移量。
	offset int
	// keyset 为 true 表示这是 keyset 游标。
	keyset bool
	// sortOrder / id 是 keyset 游标的锚点（最后一行的排序位与 ID）。
	sortOrder int64
	id        uuid.UUID
	// sortKey 为 true 表示这是「自定义排序字段」的 keyset 游标。
	sortKey bool
	// sortFieldID 是排序字段 ID（自定义排序游标用）。
	sortFieldID uuid.UUID
	// sortValue 是排序字段的锚点值（字符串形态）。
	sortValue string
	// sortValueNull 为 true 表示锚点行的排序值为 NULL。
	sortValueNull bool
}

// encodeCursor 把偏移量编码成不透明游标（旧格式，兼容保留）。
func encodeCursor(offset int) string {
	return base64.StdEncoding.EncodeToString([]byte("o:" + strconv.Itoa(offset)))
}

// encodeKeysetCursor 生成 keyset 游标（v2）。
func encodeKeysetCursor(sortOrder int64, id uuid.UUID) string {
	raw := fmt.Sprintf("k:%d:%s", sortOrder, id.String())
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

// encodeSortKeyCursor 生成「自定义排序字段」的 keyset 游标（v3）。
//
// 锚点 = (排序字段值, sort_order, id)，深翻页同样不需要 OFFSET 全表扫描。
func encodeSortKeyCursor(fieldID uuid.UUID, value string, isNull bool, sortOrder int64, id uuid.UUID) string {
	raw := fmt.Sprintf("k2:%s:%s:%d:%s", fieldID.String(), encodeCursorValue(value), sortOrder, id.String())
	if isNull {
		raw = fmt.Sprintf("k2n:%s:%d:%s", fieldID.String(), sortOrder, id.String())
	}
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

// encodeCursorValue 对锚点值做 URL 安全编码（值里可能含 ':' 与中文）。
func encodeCursorValue(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

// decodeCursorValue 解码锚点值。
func decodeCursorValue(value string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", ErrQueryInvalid
	}
	return string(raw), nil
}

// decodeCursor 解析游标。
//
// 兼容两种格式：`k:<sort_order>:<id>`（keyset）与 `o:<n>`（旧偏移量）。
func decodeCursor(cursor string) (pageCursor, error) {
	if cursor == "" {
		return pageCursor{}, nil
	}
	raw, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return pageCursor{}, ErrQueryInvalid
	}
	s := string(raw)
	switch {
	case strings.HasPrefix(s, "k:"):
		parts := strings.SplitN(strings.TrimPrefix(s, "k:"), ":", 2)
		if len(parts) != 2 {
			return pageCursor{}, ErrQueryInvalid
		}
		sortOrder, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		id, err := uuid.Parse(parts[1])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		return pageCursor{keyset: true, sortOrder: sortOrder, id: id}, nil
	case strings.HasPrefix(s, "k2n:"):
		parts := strings.SplitN(strings.TrimPrefix(s, "k2n:"), ":", 3)
		if len(parts) != 3 {
			return pageCursor{}, ErrQueryInvalid
		}
		fieldID, err := uuid.Parse(parts[0])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		sortOrder, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		id, err := uuid.Parse(parts[2])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		return pageCursor{
			keyset: true, sortKey: true, sortFieldID: fieldID,
			sortValueNull: true, sortOrder: sortOrder, id: id,
		}, nil
	case strings.HasPrefix(s, "k2:"):
		parts := strings.SplitN(strings.TrimPrefix(s, "k2:"), ":", 5)
		if len(parts) != 4 {
			return pageCursor{}, ErrQueryInvalid
		}
		fieldID, err := uuid.Parse(parts[0])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		value, err := decodeCursorValue(parts[1])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		sortOrder, err := strconv.ParseInt(parts[2], 10, 64)
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		id, err := uuid.Parse(parts[3])
		if err != nil {
			return pageCursor{}, ErrQueryInvalid
		}
		return pageCursor{
			keyset: true, sortKey: true, sortFieldID: fieldID,
			sortValue: value, sortOrder: sortOrder, id: id,
		}, nil
	case strings.HasPrefix(s, "o:"):
		n, err := strconv.Atoi(strings.TrimPrefix(s, "o:"))
		if err != nil || n < 0 {
			return pageCursor{}, ErrQueryInvalid
		}
		return pageCursor{offset: n}, nil
	default:
		return pageCursor{}, ErrQueryInvalid
	}
}

// countConditions 统计条件总数，用于限制查询规模。
func countConditions(g FilterGroup) int {
	total := len(g.Conditions)
	for _, child := range g.Children {
		total += countConditions(child)
	}
	return total
}

// fieldIndex 是查询期内的字段索引：ID → 定义 + 处理器。
type fieldIndex struct {
	byID     map[uuid.UUID]FieldMeta
	handlers map[uuid.UUID]FieldHandler
}

func (f *fieldIndex) handler(id uuid.UUID) (FieldHandler, bool) {
	h, ok := f.handlers[id]
	return h, ok
}

// buildFilterSQL 把筛选条件编译成 SQL 片段与参数。
//
// 约定：所有值都走参数化占位符，字段 ID 必须命中已加载的字段元数据，
// 操作符必须被字段能力允许 —— 客户端无法注入 SQL。
func (s *Service) buildFilterSQL(tableID uuid.UUID, idx *fieldIndex, g FilterGroup) (string, []any, error) {
	if countConditions(g) > MaxFilters {
		return "", nil, fmt.Errorf("%w: too many conditions", ErrQueryTooLarge)
	}
	logic := strings.ToUpper(strings.TrimSpace(g.Logic))
	if logic != "AND" && logic != "OR" {
		logic = "AND"
	}
	parts := []string{}
	args := []any{}

	for _, cond := range g.Conditions {
		fieldID, err := uuid.Parse(cond.FieldID)
		if err != nil {
			return "", nil, fmt.Errorf("%w: bad field id", ErrQueryInvalid)
		}
		meta, ok := idx.byID[fieldID]
		if !ok {
			return "", nil, fmt.Errorf("%w: unknown field %s", ErrQueryInvalid, cond.FieldID)
		}
		handler, ok := idx.handler(fieldID)
		if !ok {
			return "", nil, fmt.Errorf("%w: unsupported field type %s", ErrQueryInvalid, meta.Type)
		}
		if !handler.Definition().Capabilities.Filterable {
			return "", nil, fmt.Errorf("%w: field %s is not filterable", ErrQueryInvalid, meta.Name)
		}
		sql, params, err := s.conditionSQL(fieldID, handler, meta.Type, cond)
		if err != nil {
			return "", nil, err
		}
		parts = append(parts, sql)
		args = append(args, params...)
	}

	for _, child := range g.Children {
		sql, params, err := s.buildFilterSQL(tableID, idx, child)
		if err != nil {
			return "", nil, err
		}
		if sql == "" {
			continue
		}
		parts = append(parts, "("+sql+")")
		args = append(args, params...)
	}

	if len(parts) == 0 {
		return "", nil, nil
	}
	return strings.Join(parts, " "+logic+" "), args, nil
}

// conditionSQL 编译单个条件。
//
// 优先走字段处理器自身的扩展实现（FieldHandler 扩展 §12），
// 没有自定义实现时回落到通用实现 defaultConditionSQL。
func (s *Service) conditionSQL(fieldID uuid.UUID, handler FieldHandler, fieldType string, cond Condition) (string, []any, error) {
	if rh, ok := handler.(RichFieldHandler); ok {
		return rh.BuildFilter(fieldID, fieldType, cond)
	}
	return defaultConditionSQL(fieldID, handler.ProjectedType(), fieldType, cond)
}

// defaultConditionSQL 是通用筛选编译实现。
func defaultConditionSQL(fieldID uuid.UUID, projected string, fieldType string, cond Condition) (string, []any, error) {
	op := strings.ToLower(strings.TrimSpace(cond.Operator))

	// 空/非空判定：有非空投影值才算「非空」。原先 isempty 去找「全空行」再取反，
	// 会把已有文本或数字的记录也判成空。
	switch op {
	case "isempty", "isnotempty":
		emptyVal := "COALESCE(v.value_text,'') = '' AND COALESCE(v.value_number,0) = 0 AND COALESCE(v.value_bool,false) = false AND v.value_date IS NULL AND v.value_json IS NULL"
		nonEmpty := "SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND NOT (" + emptyVal + ")"
		if op == "isempty" {
			return "NOT EXISTS (" + nonEmpty + ")", []any{fieldID}, nil
		}
		return "EXISTS (" + nonEmpty + ")", []any{fieldID}, nil
	}

	// 值比较走投影表，文本用 ILIKE 模糊匹配。
	switch projected {
	case ProjectedNumber:
		num, ok := toFloat(cond.Value)
		if !ok {
			return "", nil, fmt.Errorf("%w: %s expects a numeric value", ErrQueryInvalid, op)
		}
		col := map[string]string{"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
		if col == "" {
			return "", nil, fmt.Errorf("%w: operator %s is not supported for numbers", ErrQueryInvalid, op)
		}
		return fmt.Sprintf("EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_number %s ?)", col), []any{fieldID, num}, nil
	case ProjectedDate:
		ts, err := parseTime(cond.Value)
		if err != nil {
			return "", nil, fmt.Errorf("%w: %s expects a date value", ErrQueryInvalid, op)
		}
		col := map[string]string{"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
		if col == "" {
			return "", nil, fmt.Errorf("%w: operator %s is not supported for dates", ErrQueryInvalid, op)
		}
		return fmt.Sprintf("EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_date %s ?)", col), []any{fieldID, ts}, nil
	case ProjectedBool:
		b := toBool(cond.Value)
		switch op {
		case "eq":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_bool = ?)", []any{fieldID, b}, nil
		case "ne":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_bool <> ?)", []any{fieldID, b}, nil
		default:
			return "", nil, fmt.Errorf("%w: operator %s is not supported for checkboxes", ErrQueryInvalid, op)
		}
	case ProjectedJSON:
		// 附件字段的值是 `url#文件名` 数组：按文件名做模糊匹配，而不是 JSON 包含判断。
		if fieldType == string(FieldAttachment) {
			text := fmt.Sprintf("%v", cond.Value)
			switch op {
			case "contains", "eq":
				return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json::text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
			case "notcontains", "ne":
				return "NOT EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json::text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
			}
		}
		values := stringSlice(cond.Value)
		switch op {
		case "contains", "eq":
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty value", ErrQueryInvalid)
			}
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json @> ?::jsonb)", []any{fieldID, jsonArrayArg(values)}, nil
		case "notcontains", "ne":
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty value", ErrQueryInvalid)
			}
			return "NOT EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json @> ?::jsonb)", []any{fieldID, jsonArrayArg(values)}, nil
		default:
			return "", nil, fmt.Errorf("%w: operator %s is not supported for multi-value fields", ErrQueryInvalid, op)
		}
	default:
		// 「关联文档」是多值文本（ID 以「、」连接）：条件值可以是单个 ID，也可以是 ID 数组，
		// 命中语义是「包含其中任意一个」。
		if fieldType == string(FieldDoc) {
			if sql, params, ok, err := docConditionSQL(fieldID, op, cond.Value); err != nil {
				return "", nil, err
			} else if ok {
				return sql, params, nil
			}
		}
		text := fmt.Sprintf("%v", cond.Value)
		switch op {
		case "eq", "is":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ?)", []any{fieldID, text}, nil
		case "ne", "isnot":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text <> ?)", []any{fieldID, text}, nil
		case "contains":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
		case "notcontains":
			return "NOT EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
		case "startswith":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, escapeLike(text) + "%"}, nil
		case "endswith":
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text)}, nil
		case "in":
			values := stringSlice(cond.Value)
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty in list", ErrQueryInvalid)
			}
			return "EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ANY(?))", []any{fieldID, values}, nil
		case "notin":
			values := stringSlice(cond.Value)
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty not-in list", ErrQueryInvalid)
			}
			return "NOT EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ANY(?))", []any{fieldID, values}, nil
		default:
			return "", nil, fmt.Errorf("%w: operator %s is not supported for text", ErrQueryInvalid, op)
		}
	}
}

func escapeLike(s string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(s)
}

func jsonArrayArg(values []string) string {
	raw, _ := json.Marshal(values)
	return string(raw)
}

// orderJoin 描述一个用于分组 / 排序的投影表 JOIN。
type orderJoin struct {
	// alias 是该 JOIN 在 SQL 里的唯一别名（gv0 / sv0 …）。
	alias string
	// fieldID 是投影字段 ID。
	fieldID uuid.UUID
	// order 是该字段的排序方向（asc / desc）。
	order string
}

// planOrderJoins 为分组 / 排序生成**唯一别名**的投影 JOIN 计划。
//
// 旧实现把所有分组 JOIN 命名成 gv、所有排序 JOIN 命名成 sv：用户加第 2 条排序 /
// 分组时，Postgres 直接报 `table name "sv" specified more than once`（SQLSTATE 42712），
// 整个查询 500 —— 而前端明确支持多条（MAX_SORTS=5 / MAX_GROUPS=3），
// 所以这是「用户在筛选面板加第 2 条排序就整页报错」的真实故障。
//
// 修复要点：
//   - 别名带序号（gv0 / gv1 / sv0 / sv1），天然唯一；
//   - JOIN 与 ORDER BY **同源生成**（同一份 planOrderJoins 结果），
//     否则 ORDER BY 里的别名对不上，排序会静默失效。
//
// 别名序号取自规则在原始切片中的位置，因此被跳过的字段只是「空号」，不会造成重名。
func planOrderJoins(idx *fieldIndex, groups []GroupRule, sorts []SortRule) (groupJoins, sortJoins []orderJoin) {
	for i, g := range groups {
		fieldID, err := uuid.Parse(g.FieldID)
		if err != nil {
			continue
		}
		handler, ok := idx.handler(fieldID)
		if !ok || !handler.Definition().Capabilities.Groupable {
			continue
		}
		groupJoins = append(groupJoins, orderJoin{
			alias:   fmt.Sprintf("gv%d", i),
			fieldID: fieldID,
			order:   g.Order,
		})
	}
	for i, sort := range sorts {
		fieldID, err := uuid.Parse(sort.FieldID)
		if err != nil {
			continue
		}
		handler, ok := idx.handler(fieldID)
		if !ok || !handler.Definition().Capabilities.Sortable {
			continue
		}
		sortJoins = append(sortJoins, orderJoin{
			alias:   fmt.Sprintf("sv%d", i),
			fieldID: fieldID,
			order:   sort.Order,
		})
	}
	return groupJoins, sortJoins
}

// buildOrderSQL 编译排序片段。
//
// 返回的是可直接拼进 ORDER BY 的原始 SQL 片段（不含占位符）：
// 分组 / 排序列名来自字段类型白名单，排序值本身来自 LEFT JOIN 的投影表，
// 因此这里不需要绑定任何参数。
//
// JOIN 别名与 ORDER BY 表达式**必须来自同一份 planOrderJoins 计划**。
func (s *Service) buildOrderSQL(idx *fieldIndex, groupJoins, sortJoins []orderJoin) string {
	parts := []string{}

	for _, j := range groupJoins {
		handler, ok := idx.handler(j.fieldID)
		if !ok {
			continue
		}
		expr, err := sortExprFor(handler, j.fieldID, j.order, j.alias)
		if err != nil {
			continue
		}
		parts = append(parts, expr)
	}

	for _, j := range sortJoins {
		handler, ok := idx.handler(j.fieldID)
		if !ok {
			continue
		}
		expr, err := sortExprFor(handler, j.fieldID, j.order, j.alias)
		if err != nil {
			continue
		}
		parts = append(parts, expr)
	}

	// 手动排序位是默认次序；有用户排序时作为稳定的次级排序。
	parts = append(parts, "r.sort_order ASC")
	parts = append(parts, "r.id ASC")
	return strings.Join(parts, ", ")
}

// sortExprFor 借助字段处理器的扩展实现生成排序表达式。
func sortExprFor(handler FieldHandler, fieldID uuid.UUID, order string, alias string) (string, error) {
	if rh, ok := handler.(RichFieldHandler); ok {
		return rh.BuildSort(fieldID, string(handler.Definition().Type), order, alias)
	}
	dir := "ASC"
	if strings.EqualFold(order, "desc") {
		dir = "DESC"
	}
	return fmt.Sprintf("%s.%s %s NULLS LAST", alias, sortColumn(handler.ProjectedType()), dir), nil
}

func sortColumn(projected string) string {
	switch projected {
	case ProjectedNumber:
		return "value_number"
	case ProjectedDate:
		return "value_date"
	case ProjectedBool:
		return "value_bool"
	case ProjectedJSON:
		return "value_json"
	default:
		return "value_text"
	}
}

// sortKeyPlan 描述「自定义排序字段」的 keyset 翻页方案。
//
// 只支持**单个**文本 / 数字排序字段：
//   - 文本列直接比较；
//   - 数字列用 CAST(... AS DOUBLE PRECISION) 比较（Postgres / SQLite 都支持）；
//   - 日期 / 布尔 / JSON 列的 NULL 语义在两种数据库里不一致，退回 OFFSET 翻页。
type sortKeyPlan struct {
	fieldID uuid.UUID
	// column 是比较用的列表达式（sv0.value_text / sv0.value_number）。
	column string
	// selectExpr 是把锚点值取回 Go 的表达式（数字列转成文本）。
	selectExpr string
	// asc 为 true 表示升序。
	asc bool
}

// planSortKey 判断当前查询能否走「自定义排序字段」的 keyset 翻页。
//
// alias 由调用方从 planOrderJoins 计划里取 —— 必须与实际 JOIN 出来的别名一致，
// 否则 keyset 的 WHERE 条件引用了一个不存在的表别名。
func planSortKey(idx *fieldIndex, sorts []SortRule, groups []GroupRule, sortJoins []orderJoin) *sortKeyPlan {
	if len(groups) != 0 || len(sorts) != 1 {
		return nil
	}
	if len(sortJoins) != 1 {
		return nil
	}
	join := sortJoins[0]
	handler, ok := idx.handler(join.fieldID)
	if !ok || !handler.Definition().Capabilities.Sortable {
		return nil
	}
	switch handler.ProjectedType() {
	case ProjectedText:
		return &sortKeyPlan{
			fieldID: join.fieldID, column: join.alias + ".value_text",
			selectExpr: join.alias + ".value_text", asc: !strings.EqualFold(sorts[0].Order, "desc"),
		}
	case ProjectedNumber:
		return &sortKeyPlan{
			fieldID: join.fieldID, column: join.alias + ".value_number",
			selectExpr: "CAST(" + join.alias + ".value_number AS TEXT)",
			asc:        !strings.EqualFold(sorts[0].Order, "desc"),
		}
	default:
		return nil
	}
}

// whereClauseForSortKey 构造 keyset 的 WHERE 条件。
//
// NULL 处理：排序列用 NULLS LAST，所以 NULL 行永远排在最后。
//   - 锚点非 NULL：条件 = (值更大 或 值相同且 (sort_order, id) 更大) 或 该列为 NULL；
//   - 锚点为 NULL：条件 = 该列为 NULL 且 (sort_order, id) 更大（避免重复吐 NULL 行）。
func whereClauseForSortKey(plan *sortKeyPlan, cur pageCursor) (string, []any) {
	cmp := plan.column + " > ?"
	eq := plan.column + " = ?"
	if strings.HasSuffix(plan.column, ".value_number") {
		cmp = plan.column + " > CAST(? AS DOUBLE PRECISION)"
		eq = plan.column + " = CAST(? AS DOUBLE PRECISION)"
	}
	if !plan.asc {
		cmp = plan.column + " < ?"
		if strings.HasSuffix(plan.column, ".value_number") {
			cmp = plan.column + " < CAST(? AS DOUBLE PRECISION)"
		}
	}
	tie := "(r.sort_order > ? OR (r.sort_order = ? AND r.id > ?))"
	if cur.sortValueNull {
		return "(" + plan.column + " IS NULL AND " + tie + ")",
			[]any{cur.sortOrder, cur.sortOrder, cur.id}
	}
	clause := "(" + cmp + " OR (" + eq + " AND " + tie + ") OR " + plan.column + " IS NULL)"
	return clause, []any{
		cur.sortValue, cur.sortValue,
		cur.sortOrder, cur.sortOrder, cur.id,
	}
}

// Query 执行统一查询：筛选、排序、分组、分页都在服务端完成。
func (s *Service) Query(ctx context.Context, userID, projectID uuid.UUID, req QueryRequest) (*QueryResult, error) {
	started := time.Now()
	result, err := s.query(ctx, userID, projectID, req)
	ObserveOperation(OpQuery, time.Since(started), err)
	return result, err
}

// query 是 Query 的真实实现（耗时统计包在 Query 里）。
func (s *Service) query(ctx context.Context, userID, projectID uuid.UUID, req QueryRequest) (*QueryResult, error) {
	tableID, err := uuid.Parse(req.TableID)
	if err != nil {
		return nil, fmt.Errorf("%w: bad table id", ErrQueryInvalid)
	}
	table, idx, err := s.loadTableSchema(ctx, userID, projectID, tableID)
	if err != nil {
		return nil, err
	}
	// 惰性补算：跨天打开表格时，先把 TODAY() 这类时间敏感公式重算一遍，
	// 否则用户会看到昨天的值。失败不阻断查询（最坏情况是显示旧值）。
	if err := s.EnsureTableTimeRecalc(ctx, tableID); err != nil {
		log.Printf("base: lazy time recalc for %s failed: %v", tableID, err)
	}
	// 字段级权限：隐藏字段对当前角色既不返回元信息，也不返回值。
	subj := s.subjectOf(userID, projectID)
	rawIdx := idx
	idx = filterIndexForSubject(idx, subj)
	if len(req.Sorts) > MaxSorts {
		return nil, fmt.Errorf("%w: too many sorts", ErrQueryTooLarge)
	}
	if len(req.Groups) > MaxGroups {
		return nil, fmt.Errorf("%w: too many groups", ErrQueryTooLarge)
	}
	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = DefaultPageSize
	}
	if pageSize > MaxPageSize {
		pageSize = MaxPageSize
	}
	cur, err := decodeCursor(req.Cursor)
	if err != nil {
		return nil, err
	}
	offset := cur.offset
	// 分组 / 排序的投影 JOIN 计划：**别名唯一**，且 JOIN 与 ORDER BY 同源。
	groupJoins, sortJoins := planOrderJoins(idx, req.Groups, req.Sorts)
	// 自定义排序字段的 keyset 方案（单字段、文本 / 数字）。
	sortPlan := planSortKey(idx, req.Sorts, req.Groups, sortJoins)
	if cur.keyset && sortPlan != nil && cur.sortFieldID != sortPlan.fieldID {
		// 游标来自另一个排序字段的查询 → 拒绝，避免串页。
		return nil, ErrQueryInvalid
	}

	// keyset 翻页的判定**提前算**：后面「统计走窗口函数还是独立 COUNT」要用它。
	//
	// 判定内容与下面拼查询时完全一致，只是提前：
	//   - canUseKeyset：没有自定义排序 / 分组时才能用 (sort_order, id) 当锚点；
	//   - useKeyset：首页也要进入 keyset 模式，否则客户端永远拿不到 keyset 游标；
	//   - useSortKey：自定义排序字段的锚点 = (排序值, sort_order, id)。
	canUseKeyset := len(req.Sorts) == 0 && len(req.Groups) == 0
	useKeyset := canUseKeyset && (cur.keyset || cur.offset == 0)
	useSortKey := sortPlan != nil

	// ORDER BY 片段提前算：窗口计数的适用性判断依赖它（见下面 countWindow）。
	orderSQL := s.buildOrderSQL(idx, groupJoins, sortJoins)

	// 统计与取数共用同一别名 r，保证筛选条件里的 r.id 可用。
	base := s.db.WithContext(ctx).Table("base_records AS r").
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)
	// 记录级可见范围：在 SQL 层注入（不是查完再在内存里删），
	// 否则分页总数 / 筛选 / 排序都会算错，且受限记录的值会先进内存。
	base = s.applyRecordScope(base, userID, projectID, "r")

	// 「关联文档」字段的条件值允许写文档标题：先把标题解析成节点 ID。
	if len(req.Filters.Conditions) > 0 || len(req.Filters.Children) > 0 {
		req.Filters = s.resolveDocTitleFilters(ctx, projectID, idx, req.Filters)
	}

	where, args, err := s.buildFilterSQL(tableID, idx, req.Filters)
	if err != nil {
		return nil, err
	}
	if where != "" {
		base = base.Where(where, args...)
	}
	// 关键字条件**只编译一次**：计数查询与取数查询共用同一份 SQL 与参数。
	//
	// 旧实现两边各编译一次，连「按文档标题找节点」的库查询都跑了两遍。
	// completeIDs（完整命中集合）目前只用于判断「命中集合是否完整」，
	// 计数改由窗口计数一次带出，这里不再单独消费。
	kwCond, kwArgs, _ := s.compileKeyword(ctx, projectID, tableID, idx, req.Keyword)
	if kwCond != "" {
		base = base.Where(kwCond, kwArgs...)
	}

	// 统计与取数**只扫一次**（P-02）。
	//
	// 旧实现：先 `base.Count()` 扫一遍 WHERE，再跑取数查询把同样的 WHERE 又扫一遍 ——
	// 同样的活干两遍。关键字搜索最吃亏：投影表是整个库最大的一张表，
	// 「搜 10 条」要把投影表扫两遍。
	//
	// 现在改成「取数查询上挂一个窗口计数」，一次扫描同时拿到数据与总数：
	//
	//	SELECT r.*, COUNT(*) OVER () AS total_count FROM ...
	//
	// 什么时候用窗口计数、什么时候用独立 COUNT：
	//
	//   - **有关键字时用窗口计数**。关键字的代价在「扫投影表」上，
	//     独立 COUNT 会把这次扫描再做一遍 —— 实测 20 万行投影表上
	//     命中 2 万行时，一次关键字扫描 40ms，两次就是 80ms。
	//     窗口计数把这 40ms 省掉了（代价是要把命中集排一遍序，
	//     但排序比重复扫投影表便宜）。
	//   - **没有关键字时用独立 COUNT**。这时 COUNT 走的是记录主表的
	//     索引扫描（毫秒级），而窗口计数会阻止 Postgres 用 top-N 堆排序
	//     提前收尾 —— 没有关键字可省，不划算。
	//   - **带翻页锚点时一律用独立 COUNT**。锚点加在 WHERE 里，
	//     窗口计数会变成「还剩多少条」而不是「一共有多少条」，语义会变。
	//
	// 前提：排序 / 分组的 LEFT JOIN 必须是 1:1，否则一条记录会被 JOIN 出来多次、
	// 总数虚高 —— 由 `ensureBaseValueUniqueIndex` 的 (record_id, field_id)
	// 唯一索引兜底。
	countWindow := kwCond != "" && !cur.keyset
	var total int64
	if !countWindow {
		if err := base.Count(&total).Error; err != nil {
			return nil, err
		}
	}

	selectCols := "r.id AS id, r.version AS version, r.data AS data, r.updated_at AS updated_at, r.visibility AS visibility, r.created_by AS created_by, r.sort_order AS sort_order"
	if sortPlan != nil {
		// 追加排序列投影：用于生成「自定义排序」的 keyset 游标锚点。
		selectCols += ", " + sortPlan.selectExpr + " AS sort_key_value"
	}
	if countWindow {
		// 窗口计数：同一次扫描里顺带把总条数带回来（P-02）。
		selectCols += ", COUNT(*) OVER () AS total_count"
	}
	query := s.db.WithContext(ctx).Table("base_records AS r").
		Select(selectCols).
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)
	// 记录级可见范围：取数与计数必须用同一套过滤，否则 total 与实际行数对不上。
	query = s.applyRecordScope(query, userID, projectID, "r")
	if where != "" {
		query = query.Where(where, args...)
	}
	if kwCond != "" {
		query = query.Where(kwCond, kwArgs...)
	}
	// 分组/排序需要的投影联表。**别名必须唯一**，否则第 2 个排序 / 分组会让
	// Postgres 报 `table name "sv" specified more than once`（HTTP 500）。
	for _, j := range groupJoins {
		query = query.Joins(
			"LEFT JOIN base_record_values "+j.alias+" ON "+j.alias+".record_id = r.id AND "+j.alias+".field_id = ?",
			j.fieldID)
	}
	for _, j := range sortJoins {
		query = query.Joins(
			"LEFT JOIN base_record_values "+j.alias+" ON "+j.alias+".record_id = r.id AND "+j.alias+".field_id = ?",
			j.fieldID)
	}
	if orderSQL != "" {
		// 注意：GORM 的 Order 只认 string / clause.OrderBy / clause.OrderByColumn，
		// 传 clause.Expr 会被静默丢弃（排序不生效）。这里用 Raw 片段保证拼出的
		// 多列 ORDER BY 原样落到 SQL 上。
		query = query.Order(clause.OrderBy{
			Columns: []clause.OrderByColumn{{
				Column: clause.Column{Name: orderSQL, Raw: true},
			}},
		})
	}
	// keyset 翻页：按 (sort_order, id) 走索引，避免深翻页的 OFFSET 全表扫描。
	// 仅在「没有自定义排序 / 分组」时启用 —— 自定义排序的主键列不固定，
	// 用 (sort_order, id) 做锚点会漏行或重复。
	//
	// 关键：**首页也要进入 keyset 模式**，否则首页只能吐出旧格式的 `o:<n>` 游标，
	// 客户端下一页拿到的仍是 offset 游标，keyset 永远走不到（形同虚设）。
	// 因此这里的判定是「无自定义排序 / 分组」，而不是「收到的游标是不是 keyset」。
	if useSortKey && cur.keyset {
		clause, args := whereClauseForSortKey(sortPlan, cur)
		query = query.Where(clause, args...)
	}
	if useKeyset && cur.keyset && !useSortKey {
		// 已经有锚点 → 直接用 (sort_order, id) 定位。
		query = query.Where("(r.sort_order > ? OR (r.sort_order = ? AND r.id > ?))", cur.sortOrder, cur.sortOrder, cur.id)
	}
	if useKeyset || useSortKey {
		// 多取一条用来判断「还有没有下一页」，取完再裁掉。
		query = query.Limit(pageSize + 1)
	} else {
		query = query.Limit(pageSize).Offset(offset)
	}

	type rawRow struct {
		ID           uuid.UUID      `gorm:"column:id"`
		SortOrder    int64          `gorm:"column:sort_order"`
		Version      int64          `gorm:"column:version"`
		Data         datatypes.JSON `gorm:"column:data"`
		UpdatedAt    time.Time      `gorm:"column:updated_at"`
		Visibility   string         `gorm:"column:visibility"`
		CreatedBy    uuid.UUID      `gorm:"column:created_by"`
		SortKeyValue *string        `gorm:"column:sort_key_value"`
		TotalCount   *int64         `gorm:"column:total_count"`
	}
	var raw []rawRow
	if err := query.Scan(&raw).Error; err != nil {
		return nil, err
	}
	if countWindow && len(raw) > 0 && raw[0].TotalCount != nil {
		// 窗口计数只在有行时才有值；结果集为空 → 总数就是 0（保持不变）。
		total = *raw[0].TotalCount
	}

	keysetHasMore := (useKeyset || useSortKey) && len(raw) > pageSize
	if keysetHasMore {
		raw = raw[:pageSize]
	}
	rows := make([]RecordRow, 0, len(raw))
	for _, item := range raw {
		fields := map[string]any{}
		if len(item.Data) > 0 {
			_ = json.Unmarshal(item.Data, &fields)
		}
		fields, condHidden := stripHiddenFieldsWithReasons(fields, rawIdx, subj)
		rows = append(rows, RecordRow{
			ID:                item.ID,
			Version:           item.Version,
			Fields:            fields,
			Updated:           item.UpdatedAt,
			Visibility:        item.Visibility,
			CreatedBy:         item.CreatedBy.String(),
			ConditionalHidden: condHidden,
		})
	}

	// 公式字段的值在写入时已由服务端算好并存进记录，这里不需要再算一次。
	result := &QueryResult{
		TableID:       tableID.String(),
		ViewID:        req.ViewID,
		SchemaVersion: table.SchemaVersion,
		Records:       rows,
		Total:         total,
		Fields:        fieldMetasForSubject(idx, subj),
		Page: PageInfo{
			HasMore:  int64(offset+len(rows)) < total,
			PageSize: pageSize,
			Offset:   offset,
		},
	}
	if useKeyset {
		// keyset 模式没有绝对偏移量，用「是否取满一页」判断还有没有下一页。
		result.Page.HasMore = keysetHasMore
		result.Page.Offset = -1
		if len(rows) > 0 && result.Page.HasMore {
			last := raw[len(raw)-1]
			result.Page.NextCursor = encodeKeysetCursor(last.SortOrder, last.ID)
		}
	} else if useSortKey {
		// 自定义排序的 keyset 游标：锚点带上排序字段值。
		result.Page.HasMore = keysetHasMore
		result.Page.Offset = -1
		if len(rows) > 0 && result.Page.HasMore {
			last := raw[len(rows)-1]
			value := ""
			isNull := last.SortKeyValue == nil
			if last.SortKeyValue != nil {
				value = *last.SortKeyValue
			}
			result.Page.NextCursor = encodeSortKeyCursor(
				sortPlan.fieldID, value, isNull, last.SortOrder, last.ID,
			)
		}
	} else if int64(offset+len(rows)) < total {
		result.Page.NextCursor = encodeCursor(offset + len(rows))
	}
	return result, nil
}

// fieldMetas 输出字段元信息列表。
func fieldMetas(idx *fieldIndex) []FieldMeta {
	out := make([]FieldMeta, 0, len(idx.byID))
	for _, meta := range idx.byID {
		out = append(out, meta)
	}
	return out
}

// docFieldIDs 取表内全部「关联文档」类型字段 ID。
func (s *Service) docFieldIDs(idx *fieldIndex) []uuid.UUID {
	out := make([]uuid.UUID, 0, 2)
	for id, meta := range idx.byID {
		if meta.Type == string(FieldDoc) {
			out = append(out, id)
		}
	}
	return out
}

// docKeywordNodeIDs 找出标题命中关键字的知识库节点（最多 20 个，避免拼出巨大的 SQL）。
func (s *Service) docKeywordNodeIDs(ctx context.Context, projectID uuid.UUID, kw string) []string {
	var ids []uuid.UUID
	like := "%" + escapeLike(kw) + "%"
	if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND trashed_at IS NULL AND title ILIKE ?", projectID, like).
		Limit(20).
		Pluck("id", &ids).Error; err != nil {
		return nil
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
}

// docConditionSQL 编译「关联文档」字段的条件。
//
// 值可以是：
//   - 单个节点 ID；
//   - 节点 ID 数组（命中其中任意一个即算命中）。
//
// 返回 ok=false 表示该操作符走通用文本分支。
func docConditionSQL(fieldID uuid.UUID, op string, value any) (string, []any, bool, error) {
	values := stringSlice(value)
	switch op {
	case "contains", "eq", "is", "in":
		values = multiValueArgs(values)
		if len(values) == 0 {
			return "", nil, false, fmt.Errorf("%w: empty value", ErrQueryInvalid)
		}
		parts := make([]string, 0, len(values))
		args := make([]any, 0, len(values)*2+1)
		for _, item := range values {
			parts = append(parts, "v.value_text ILIKE ?")
			args = append(args, "%"+escapeLike(item)+"%")
		}
		return fmt.Sprintf("EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND (%s))", strings.Join(parts, " OR ")),
			append([]any{fieldID}, args...), true, nil
	case "notcontains", "ne":
		values = multiValueArgs(values)
		if len(values) == 0 {
			return "", nil, false, fmt.Errorf("%w: empty value", ErrQueryInvalid)
		}
		parts := make([]string, 0, len(values))
		args := make([]any, 0, len(values)*2+1)
		for _, item := range values {
			parts = append(parts, "v.value_text ILIKE ?")
			args = append(args, "%"+escapeLike(item)+"%")
		}
		return fmt.Sprintf("NOT EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = r.id AND v.field_id = ? AND (%s))", strings.Join(parts, " OR ")),
			append([]any{fieldID}, args...), true, nil
	default:
		return "", nil, false, nil
	}
}

// multiValueArgs 摊平多值条件里的嵌套数组（前端多选会传二维数组）。
func multiValueArgs(values []string) []string {
	out := make([]string, 0, len(values))
	for _, item := range values {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}

// resolveDocTitleFilters 把「关联文档」字段条件里的**标题文本**解析成节点 ID 列表。
//
// 之所以要这一步：`doc` 字段存的是节点 ID，用户在筛选面板里按直觉写的是文档标题，
// 直接拿标题去匹配 ID 永远命中不了。这里把标题反查成 ID，再走正常的多值匹配。
//
// 已经是 UUID 的值原样保留；解析不到标题时也原样保留（自然不命中）。
func (s *Service) resolveDocTitleFilters(ctx context.Context, projectID uuid.UUID, idx *fieldIndex, g FilterGroup) FilterGroup {
	out := g
	out.Logic = g.Logic
	out.Conditions = make([]Condition, 0, len(g.Conditions))
	for _, cond := range g.Conditions {
		fieldID, err := uuid.Parse(cond.FieldID)
		if err == nil {
			if meta, ok := idx.byID[fieldID]; ok && meta.Type == string(FieldDoc) {
				cond.Value = s.resolveDocConditionValue(ctx, projectID, cond.Value)
			}
		}
		out.Conditions = append(out.Conditions, cond)
	}
	if len(g.Children) > 0 {
		out.Children = make([]FilterGroup, 0, len(g.Children))
		for _, child := range g.Children {
			out.Children = append(out.Children, s.resolveDocTitleFilters(ctx, projectID, idx, child))
		}
	}
	return out
}

// resolveDocConditionValue 解析条件值：UUID 原样返回；否则按标题反查节点 ID。
func (s *Service) resolveDocConditionValue(ctx context.Context, projectID uuid.UUID, value any) any {
	raw := stringSlice(value)
	if len(raw) == 0 {
		return value
	}
	resolved := make([]string, 0, len(raw))
	changed := false
	for _, item := range raw {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, err := uuid.Parse(trimmed); err == nil {
			resolved = append(resolved, trimmed)
			continue
		}
		ids := s.docTitleNodeIDs(ctx, projectID, trimmed)
		if len(ids) == 0 {
			resolved = append(resolved, trimmed)
			continue
		}
		resolved = append(resolved, ids...)
		changed = true
	}
	if !changed {
		return value
	}
	if len(resolved) == 1 {
		return resolved[0]
	}
	return resolved
}

// docTitleNodeIDs 按标题反查知识库节点（最多 20 个）。
func (s *Service) docTitleNodeIDs(ctx context.Context, projectID uuid.UUID, title string) []string {
	var ids []uuid.UUID
	like := "%" + escapeLike(title) + "%"
	if err := s.db.WithContext(ctx).Model(&model.KnowledgeNode{}).
		Where("project_id = ? AND trashed_at IS NULL AND title ILIKE ?", projectID, like).
		Limit(20).
		Pluck("id", &ids).Error; err != nil {
		return nil
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
}
