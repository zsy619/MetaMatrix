package base

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
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
}

// encodeCursor 把偏移量编码成不透明游标。
func encodeCursor(offset int) string {
	return base64.StdEncoding.EncodeToString([]byte("o:" + strconv.Itoa(offset)))
}

// decodeCursor 解析游标，返回偏移量。
func decodeCursor(cursor string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	raw, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return 0, ErrQueryInvalid
	}
	s := string(raw)
	if !strings.HasPrefix(s, "o:") {
		return 0, ErrQueryInvalid
	}
	n, err := strconv.Atoi(strings.TrimPrefix(s, "o:"))
	if err != nil || n < 0 {
		return 0, ErrQueryInvalid
	}
	return n, nil
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
		sql, params, err := s.conditionSQL(fieldID, handler, cond)
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
func (s *Service) conditionSQL(fieldID uuid.UUID, handler FieldHandler, cond Condition) (string, []any, error) {
	op := strings.ToLower(strings.TrimSpace(cond.Operator))
	projected := handler.ProjectedType()

	// 空/非空判定统一走投影表存在性判断。
	switch op {
	case "isempty", "isnotempty":
		sub := "SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ?"
		if op == "isempty" {
			sub += " AND COALESCE(v.value_text,'') = '' AND COALESCE(v.value_number,0) = 0 AND COALESCE(v.value_bool,false) = false AND v.value_date IS NULL AND v.value_json IS NULL"
			return "NOT EXISTS (" + sub + ")", []any{fieldID}, nil
		}
		return "EXISTS (" + sub + ")", []any{fieldID}, nil
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
		return fmt.Sprintf("EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_number %s ?)", col), []any{fieldID, num}, nil
	case ProjectedDate:
		ts, err := parseTime(cond.Value)
		if err != nil {
			return "", nil, fmt.Errorf("%w: %s expects a date value", ErrQueryInvalid, op)
		}
		col := map[string]string{"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
		if col == "" {
			return "", nil, fmt.Errorf("%w: operator %s is not supported for dates", ErrQueryInvalid, op)
		}
		return fmt.Sprintf("EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_date %s ?)", col), []any{fieldID, ts}, nil
	case ProjectedBool:
		b := toBool(cond.Value)
		switch op {
		case "eq":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_bool = ?)", []any{fieldID, b}, nil
		case "ne":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_bool <> ?)", []any{fieldID, b}, nil
		default:
			return "", nil, fmt.Errorf("%w: operator %s is not supported for checkboxes", ErrQueryInvalid, op)
		}
	case ProjectedJSON:
		values := stringSlice(cond.Value)
		switch op {
		case "contains", "eq":
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty value", ErrQueryInvalid)
			}
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json @> ?::jsonb)", []any{fieldID, jsonArrayArg(values)}, nil
		case "notcontains", "ne":
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty value", ErrQueryInvalid)
			}
			return "NOT EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_json @> ?::jsonb)", []any{fieldID, jsonArrayArg(values)}, nil
		default:
			return "", nil, fmt.Errorf("%w: operator %s is not supported for multi-value fields", ErrQueryInvalid, op)
		}
	default:
		text := fmt.Sprintf("%v", cond.Value)
		switch op {
		case "eq", "is":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ?)", []any{fieldID, text}, nil
		case "ne", "isnot":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text <> ?)", []any{fieldID, text}, nil
		case "contains":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
		case "notcontains":
			return "NOT EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text) + "%"}, nil
		case "startswith":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, escapeLike(text) + "%"}, nil
		case "endswith":
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text ILIKE ?)", []any{fieldID, "%" + escapeLike(text)}, nil
		case "in":
			values := stringSlice(cond.Value)
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty in list", ErrQueryInvalid)
			}
			return "EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ANY(?))", []any{fieldID, values}, nil
		case "notin":
			values := stringSlice(cond.Value)
			if len(values) == 0 {
				return "", nil, fmt.Errorf("%w: empty not-in list", ErrQueryInvalid)
			}
			return "NOT EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = r.id AND v.field_id = ? AND v.value_text = ANY(?))", []any{fieldID, values}, nil
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
func (s *Service) buildOrderSQL(idx *fieldIndex, sorts []SortRule, groups []GroupRule) (string, []any) {
	parts := []string{}
	args := []any{}

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
		args = append(args, fieldID)
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
		args = append(args, fieldID)
	}

	parts = append(parts, "r.id ASC")
	return strings.Join(parts, ", "), args
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
	offset, err := decodeCursor(req.Cursor)
	if err != nil {
		return nil, err
	}

	// 统计与取数共用同一别名 r，保证筛选条件里的 r.id 可用。
	base := s.db.WithContext(ctx).Table("base_record AS r").
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)

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

	orderSQL, orderArgs := s.buildOrderSQL(idx, req.Sorts, req.Groups)

	query := s.db.WithContext(ctx).Table("base_record AS r").
		Select("r.id AS id, r.version AS version, r.data AS data, r.updated_at AS updated_at").
		Where("r.table_id = ? AND r.deleted_at IS NULL", tableID)
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
		query = query.Joins("LEFT JOIN base_record_value gv ON gv.record_id = r.id AND gv.field_id = ?", fieldID)
	}
	for _, sort := range req.Sorts {
		fieldID, err := uuid.Parse(sort.FieldID)
		if err != nil {
			continue
		}
		query = query.Joins("LEFT JOIN base_record_value sv ON sv.record_id = r.id AND sv.field_id = ?", fieldID)
	}
	if orderSQL != "" {
		query = query.Order(clause.Expr{SQL: orderSQL, Vars: orderArgs})
	}
	query = query.Limit(pageSize).Offset(offset)

	type rawRow struct {
		ID        uuid.UUID      `gorm:"column:id"`
		Version   int64          `gorm:"column:version"`
		Data      datatypes.JSON `gorm:"column:data"`
		UpdatedAt time.Time      `gorm:"column:updated_at"`
	}
	var raw []rawRow
	if err := query.Scan(&raw).Error; err != nil {
		return nil, err
	}

	rows := make([]RecordRow, 0, len(raw))
	for _, item := range raw {
		fields := map[string]any{}
		if len(item.Data) > 0 {
			_ = json.Unmarshal(item.Data, &fields)
		}
		rows = append(rows, RecordRow{
			ID:      item.ID,
			Version: item.Version,
			Fields:  fields,
			Updated: item.UpdatedAt,
		})
	}

	// 公式字段的值在写入时已由服务端算好并存进记录，这里不需要再算一次。
	result := &QueryResult{
		TableID:       tableID.String(),
		ViewID:        req.ViewID,
		SchemaVersion: table.SchemaVersion,
		Records:       rows,
		Total:         total,
		Fields:        fieldMetas(idx),
		Page: PageInfo{
			HasMore:  int64(offset+len(rows)) < total,
			PageSize: pageSize,
			Offset:   offset,
		},
	}
	if int64(offset+len(rows)) < total {
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
	cond := fmt.Sprintf(`EXISTS (SELECT 1 FROM base_record_value v WHERE v.record_id = %s AND v.value_text ILIKE ?)`, recordAlias)
	args := []any{like}

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
		parts = append(parts, `EXISTS (SELECT 1 FROM base_record_value dv WHERE dv.record_id = `+recordAlias+` AND dv.field_id IN (?) AND dv.value_text ILIKE ?)`)
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
