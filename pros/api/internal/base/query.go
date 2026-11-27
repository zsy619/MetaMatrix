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
func (s *Service) conditionSQL(fieldID uuid.UUID, handler FieldHandler, fieldType string, cond Condition) (string, []any, error) {
	op := strings.ToLower(strings.TrimSpace(cond.Operator))
	projected := handler.ProjectedType()

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

// buildOrderSQL 编译排序片段。
//
// 返回的是可直接拼进 ORDER BY 的原始 SQL 片段（不含占位符）：
// 分组 / 排序列名来自字段类型白名单，排序值本身来自 LEFT JOIN 的投影表，
// 因此这里不需要绑定任何参数。
func (s *Service) buildOrderSQL(idx *fieldIndex, sorts []SortRule, groups []GroupRule) string {
	parts := []string{}

	for _, g := range groups {
		fieldID, err := uuid.Parse(g.FieldID)
		if err != nil {
			continue
		}
		handler, ok := idx.handler(fieldID)
		if !ok || !handler.Definition().Capabilities.Groupable {
			continue
		}
		col := sortColumn(handler.ProjectedType())
		dir := "ASC"
		if strings.EqualFold(g.Order, "desc") {
			dir = "DESC"
		}
		parts = append(parts, fmt.Sprintf("gv.%s %s NULLS LAST", col, dir))
	}

	for _, sort := range sorts {
		fieldID, err := uuid.Parse(sort.FieldID)
		if err != nil {
			continue
		}
		handler, ok := idx.handler(fieldID)
		if !ok || !handler.Definition().Capabilities.Sortable {
			continue
		}
		col := sortColumn(handler.ProjectedType())
		dir := "ASC"
		if strings.EqualFold(sort.Order, "desc") {
			dir = "DESC"
		}
		parts = append(parts, fmt.Sprintf("sv.%s %s NULLS LAST", col, dir))
	}

	// 手动排序位是默认次序；有用户排序时作为稳定的次级排序。
	parts = append(parts, "r.sort_order ASC")
	parts = append(parts, "r.id ASC")
	return strings.Join(parts, ", ")
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

// Query 执行统一查询：筛选、排序、分组、分页都在服务端完成。
func (s *Service) Query(ctx context.Context, userID, projectID uuid.UUID, req QueryRequest) (*QueryResult, error) {
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
	if kw := strings.TrimSpace(req.Keyword); kw != "" {
		cond, args := s.keywordCondition(ctx, projectID, idx, kw, "r.id")
		base = base.Where(cond, args...)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, err
	}

	orderSQL := s.buildOrderSQL(idx, req.Sorts, req.Groups)

	query := s.db.WithContext(ctx).Table("base_records AS r").
		Select("r.id AS id, r.version AS version, r.data AS data, r.updated_at AS updated_at, r.visibility AS visibility, r.created_by AS created_by, r.sort_order AS sort_order").
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)
	// 记录级可见范围：取数与计数必须用同一套过滤，否则 total 与实际行数对不上。
	query = s.applyRecordScope(query, userID, projectID, "r")
	if where != "" {
		query = query.Where(where, args...)
	}
	if kw := strings.TrimSpace(req.Keyword); kw != "" {
		cond, args := s.keywordCondition(ctx, projectID, idx, kw, "r.id")
		query = query.Where(cond, args...)
	}
	// 分组/排序需要的投影联表。
	for _, g := range req.Groups {
		fieldID, err := uuid.Parse(g.FieldID)
		if err != nil {
			continue
		}
		query = query.Joins("LEFT JOIN base_record_values gv ON gv.record_id = r.id AND gv.field_id = ?", fieldID)
	}
	for _, sort := range req.Sorts {
		fieldID, err := uuid.Parse(sort.FieldID)
		if err != nil {
			continue
		}
		query = query.Joins("LEFT JOIN base_record_values sv ON sv.record_id = r.id AND sv.field_id = ?", fieldID)
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
	canUseKeyset := len(req.Sorts) == 0 && len(req.Groups) == 0
	useKeyset := canUseKeyset && (cur.keyset || cur.offset == 0)
	if useKeyset && cur.keyset {
		// 已经有锚点 → 直接用 (sort_order, id) 定位。
		query = query.Where("(r.sort_order > ? OR (r.sort_order = ? AND r.id > ?))", cur.sortOrder, cur.sortOrder, cur.id)
	}
	if useKeyset {
		// 多取一条用来判断「还有没有下一页」，取完再裁掉。
		query = query.Limit(pageSize + 1)
	} else {
		query = query.Limit(pageSize).Offset(offset)
	}

	type rawRow struct {
		ID         uuid.UUID      `gorm:"column:id"`
		SortOrder  int64          `gorm:"column:sort_order"`
		Version    int64          `gorm:"column:version"`
		Data       datatypes.JSON `gorm:"column:data"`
		UpdatedAt  time.Time      `gorm:"column:updated_at"`
		Visibility string         `gorm:"column:visibility"`
		CreatedBy  uuid.UUID      `gorm:"column:created_by"`
	}
	var raw []rawRow
	if err := query.Scan(&raw).Error; err != nil {
		return nil, err
	}

	keysetHasMore := useKeyset && len(raw) > pageSize
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

// keywordCondition 构造「关键字搜索」的 SQL 片段。
//
// 除了直接命中投影文本，额外支持「关联文档」字段按**文档标题**检索：
// 关键字先在当前空间的目录树里找出标题命中的节点 ID，再回表匹配 doc 字段的投影值。
func (s *Service) keywordCondition(ctx context.Context, projectID uuid.UUID, idx *fieldIndex, kw, recordAlias string) (string, []any) {
	like := "%" + escapeLike(kw) + "%"
	// 字段级权限：关键字搜索只扫**当前角色可见**的字段，
	// 否则访客能靠「搜到 / 搜不到」反推隐藏字段的内容。
	visibleIDs := make([]uuid.UUID, 0, len(idx.byID))
	for id := range idx.byID {
		visibleIDs = append(visibleIDs, id)
	}
	fieldGuard := ""
	fieldGuardJSON := ""
	fieldArgs := []any{}
	if len(visibleIDs) > 0 {
		fieldGuard = " AND v.field_id IN ?"
		fieldGuardJSON = " AND vj.field_id IN ?"
		fieldArgs = append(fieldArgs, visibleIDs)
	}
	// 文本投影：普通文本 / 单选 / 日期字符串等。
	cond := fmt.Sprintf(`EXISTS (SELECT 1 FROM base_record_values v WHERE v.record_id = %s AND v.value_text ILIKE ?%s)`, recordAlias, fieldGuard)
	// JSON 投影：附件（值里带文件名）、关联记录（值里带记录 ID）等。
	// 附件字段投影成 JSON，只扫 value_text 搜不到文件名，这里补一条 JSON 文本匹配。
	jsonCond := fmt.Sprintf(`EXISTS (SELECT 1 FROM base_record_values vj WHERE vj.record_id = %s AND vj.value_json IS NOT NULL AND vj.value_json::text ILIKE ?%s)`, recordAlias, fieldGuardJSON)
	cond = "(" + cond + " OR " + jsonCond + ")"
	args := []any{like}
	args = append(args, fieldArgs...)
	args = append(args, like)
	args = append(args, fieldArgs...)

	docIDs := s.docFieldIDs(idx)
	if len(docIDs) == 0 {
		return cond, args
	}
	nodeIDs := s.docKeywordNodeIDs(ctx, projectID, kw)
	return buildKeywordCondition(cond, args, docIDs, nodeIDs, recordAlias)
}

// buildKeywordCondition 把「按文档标题命中」的分支拼进关键字条件。
//
// 单独拆出来是为了能脱离数据库做单测。
func buildKeywordCondition(cond string, args []any, docFieldIDs []uuid.UUID, nodeIDs []string, recordAlias string) (string, []any) {
	if len(docFieldIDs) == 0 || len(nodeIDs) == 0 {
		return cond, args
	}
	parts := make([]string, 0, len(nodeIDs))
	docArgs := make([]any, 0, len(nodeIDs)*2)
	for _, nodeID := range nodeIDs {
		parts = append(parts, `EXISTS (SELECT 1 FROM base_record_values dv WHERE dv.record_id = `+recordAlias+` AND dv.field_id IN (?) AND dv.value_text ILIKE ?)`)
		docArgs = append(docArgs, docFieldIDs, "%"+escapeLike(nodeID)+"%")
	}
	return "(" + cond + " OR " + strings.Join(parts, " OR ") + ")", append(args, docArgs...)
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
