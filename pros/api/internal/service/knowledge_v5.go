package service

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// 知识库 5.0：模板自定义属性与公式、属性批量编辑与看板、评论划线锚点/
// @提及/表情回应/已读、正文任务块、大纲与目录、拼音检索、节点级权限、
// 分享白名单、协作者光标位置、历史版本的评论快照、业务标签词库。

// ---------------------------------------------------------------- 属性字段

// FieldDef 是一个自定义页面属性字段（飞书「页面属性」的扩展字段）。
type FieldDef struct {
	Key string `json:"key"`
	// Label 是显示名。
	Label string `json:"label"`
	// Type 是类型：text | number | date | select | multi | user | checkbox | formula。
	Type string `json:"type"`
	// Options 是单选/多选的候选项。
	Options []string `json:"options"`
	// Required 表示保存时必须有值。
	Required bool `json:"required"`
	// DefaultValue 是新建时的默认值。
	DefaultValue string `json:"defaultValue"`
	// Formula 是公式表达式：支持 {字段} 引用、+ - * / 与 remainingDays/daysBetween。
	Formula string `json:"formula"`
	// Hidden 表示在属性面板里隐藏。
	Hidden bool `json:"hidden"`
	// Order 是字段顺序。
	Order int `json:"order"`
}

// maxFieldDefs 限制自定义字段数量，避免属性面板被撑爆。
const maxFieldDefs = 24

func normalizeFieldDefs(in []FieldDef) ([]FieldDef, error) {
	if len(in) > maxFieldDefs {
		return nil, ErrValidation
	}
	out := make([]FieldDef, 0, len(in))
	seen := map[string]bool{}
	for i, f := range in {
		f.Key = strings.TrimSpace(f.Key)
		f.Label = strings.TrimSpace(f.Label)
		if f.Key == "" || f.Label == "" {
			return nil, ErrValidation
		}
		if seen[f.Key] {
			return nil, ErrValidation
		}
		seen[f.Key] = true
		switch f.Type {
		case "", "text":
			f.Type = "text"
		case "number", "date", "select", "multi", "user", "checkbox", "formula":
		default:
			return nil, ErrValidation
		}
		if len(f.Options) > 50 {
			return nil, ErrValidation
		}
		f.Formula = strings.TrimSpace(f.Formula)
		if f.Type == "formula" && f.Formula == "" {
			return nil, ErrValidation
		}
		if f.Order == 0 {
			f.Order = i + 1
		}
		out = append(out, f)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Order < out[j].Order })
	return out, nil
}

func fieldDefsFromJSON(raw datatypes.JSON) []FieldDef {
	if len(raw) == 0 {
		return nil
	}
	var defs []FieldDef
	if err := json.Unmarshal(raw, &defs); err != nil {
		return nil
	}
	return defs
}

func fieldValuesFromJSON(raw datatypes.JSON) map[string]any {
	values := map[string]any{}
	if len(raw) == 0 {
		return values
	}
	_ = json.Unmarshal(raw, &values)
	return values
}

// ---------------------------------------------------------------- 公式

// evalExpr 计算属性公式表达式。
//
// 支持：数字、{字段} 引用、+ - * / 与括号，以及 remainingDays/daysBetween/today 函数。
// 字段值可以是数字或日期（日期按「天」参与运算）。
func evalExpr(expr string, values map[string]float64) (float64, bool) {
	p := &exprParser{src: expr, values: values}
	p.skipSpace()
	v, ok := p.parseExpr()
	if !ok {
		return 0, false
	}
	p.skipSpace()
	if p.pos != len(p.src) {
		return 0, false
	}
	return v, true
}

type exprParser struct {
	src    string
	pos    int
	values map[string]float64
}

func (p *exprParser) skipSpace() {
	for p.pos < len(p.src) && (p.src[p.pos] == ' ' || p.src[p.pos] == '\t' || p.src[p.pos] == '\n') {
		p.pos++
	}
}

func (p *exprParser) parseExpr() (float64, bool) {
	v, ok := p.parseTerm()
	if !ok {
		return 0, false
	}
	for {
		p.skipSpace()
		if p.pos >= len(p.src) {
			return v, true
		}
		op := p.src[p.pos]
		if op != '+' && op != '-' {
			return v, true
		}
		p.pos++
		rhs, ok := p.parseTerm()
		if !ok {
			return 0, false
		}
		if op == '+' {
			v += rhs
		} else {
			v -= rhs
		}
	}
}

func (p *exprParser) parseTerm() (float64, bool) {
	v, ok := p.parseFactor()
	if !ok {
		return 0, false
	}
	for {
		p.skipSpace()
		if p.pos >= len(p.src) {
			return v, true
		}
		op := p.src[p.pos]
		if op != '*' && op != '/' {
			return v, true
		}
		p.pos++
		rhs, ok := p.parseFactor()
		if !ok {
			return 0, false
		}
		if op == '*' {
			v *= rhs
		} else {
			if rhs == 0 {
				return 0, false
			}
			v /= rhs
		}
	}
}

func (p *exprParser) parseFactor() (float64, bool) {
	p.skipSpace()
	if p.pos >= len(p.src) {
		return 0, false
	}
	ch := p.src[p.pos]
	switch {
	case ch == '-':
		p.pos++
		v, ok := p.parseFactor()
		if !ok {
			return 0, false
		}
		return -v, true
	case ch == '(':
		p.pos++
		v, ok := p.parseExpr()
		if !ok {
			return 0, false
		}
		p.skipSpace()
		if p.pos >= len(p.src) || p.src[p.pos] != ')' {
			return 0, false
		}
		p.pos++
		return v, true
	case ch == '{':
		end := strings.IndexByte(p.src[p.pos:], '}')
		if end < 0 {
			return 0, false
		}
		key := strings.TrimSpace(p.src[p.pos+1 : p.pos+end])
		p.pos += end + 1
		v, ok := p.values[key]
		return v, ok
	case ch >= '0' && ch <= '9':
		start := p.pos
		for p.pos < len(p.src) && (p.src[p.pos] == '.' || (p.src[p.pos] >= '0' && p.src[p.pos] <= '9')) {
			p.pos++
		}
		f, err := strconv.ParseFloat(p.src[start:p.pos], 64)
		if err != nil {
			return 0, false
		}
		return f, true
	case isIdentStart(ch):
		start := p.pos
		for p.pos < len(p.src) && isIdentPart(p.src[p.pos]) {
			p.pos++
		}
		name := p.src[start:p.pos]
		p.skipSpace()
		if p.pos >= len(p.src) || p.src[p.pos] != '(' {
			return 0, false
		}
		p.pos++
		var args []float64
		p.skipSpace()
		if p.pos < len(p.src) && p.src[p.pos] == ')' {
			p.pos++
		} else {
			for {
				arg, ok := p.parseExpr()
				if !ok {
					return 0, false
				}
				args = append(args, arg)
				p.skipSpace()
				if p.pos >= len(p.src) {
					return 0, false
				}
				if p.src[p.pos] == ',' {
					p.pos++
					continue
				}
				if p.src[p.pos] == ')' {
					p.pos++
					break
				}
				return 0, false
			}
		}
		switch name {
		case "today":
			return todayDays(), true
		case "remainingDays":
			if len(args) != 1 {
				return 0, false
			}
			return math.Round(args[0] - todayDays()), true
		case "daysBetween":
			if len(args) != 2 {
				return 0, false
			}
			return math.Round(args[0] - args[1]), true
		}
		return 0, false
	}
	return 0, false
}

func isIdentStart(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_'
}

func isIdentPart(ch byte) bool {
	return isIdentStart(ch) || (ch >= '0' && ch <= '9')
}

// todayDays 返回今天的「天序号」（UTC 零点）。
func todayDays() float64 {
	now := time.Now().UTC()
	return float64(now.Unix() / 86400)
}

// daysFromTime 把时间换算成天序号。
func daysFromTime(t time.Time) float64 {
	return float64(t.UTC().Unix() / 86400)
}

// valueToNumber 把属性值转成参与公式的数字：数字串直接转，日期串按天。
func valueToNumber(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0, false
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f, true
		}
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"} {
			if ts, err := time.Parse(layout, s); err == nil {
				return daysFromTime(ts), true
			}
		}
	}
	return 0, false
}

// computeFields 算出公式字段的结果。
func computeFields(defs []FieldDef, values map[string]any, base map[string]float64) map[string]float64 {
	out := map[string]float64{}
	for k, v := range base {
		out[k] = v
	}
	for _, f := range defs {
		if f.Type != "formula" || f.Formula == "" {
			continue
		}
		v, ok := evalExpr(f.Formula, out)
		if !ok {
			continue
		}
		out[f.Key] = v
	}
	return out
}

// ---------------------------------------------------------------- 模板属性

// UpdateTemplateProperties 改模板携带的属性定义。
func (s *KnowledgeService) UpdateTemplateProperties(ownerID, templateID uuid.UUID, defs []FieldDef) (*model.KnowledgeTemplate, error) {
	tpl, err := s.loadTemplateForOwner(ownerID, templateID)
	if err != nil {
		return nil, err
	}
	clean, err := normalizeFieldDefs(defs)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}
	tpl.Properties = datatypes.JSON(raw)
	tpl.UpdatedAt = time.Now().UTC()
	if err := s.db.Model(&model.KnowledgeTemplate{}).Where("id = ?", tpl.ID).
		Updates(map[string]any{"properties": tpl.Properties, "updated_at": tpl.UpdatedAt}).Error; err != nil {
		return nil, err
	}
	return tpl, nil
}

// loadTemplateForOwner 取模板并校验归属：内置模板人人可用，个人模板仅自己。
func (s *KnowledgeService) loadTemplateForOwner(ownerID, templateID uuid.UUID) (*model.KnowledgeTemplate, error) {
	var tpl model.KnowledgeTemplate
	if err := s.db.Where("id = ?", templateID).First(&tpl).Error; err != nil {
		return nil, ErrNodeNotFound
	}
	if !tpl.Builtin && tpl.OwnerUserID != nil && *tpl.OwnerUserID != ownerID {
		return nil, ErrNodeNotFound
	}
	return &tpl, nil
}

// CreateDocFromTemplate 用模板创建节点 + 文档：注入占位符并写入属性默认值。
func (s *KnowledgeService) CreateDocFromTemplate(ownerID, projectID uuid.UUID, parentID *uuid.UUID, templateID uuid.UUID, title string) (*model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	tpl, err := s.loadTemplateForOwner(ownerID, templateID)
	if err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = tpl.Label
	}
	html := s.renderTemplateHTML(tpl, title, ownerID)
	node, err := s.createImportedDoc(ownerID, projectID, parentID, title, html)
	if err != nil {
		return nil, err
	}
	defs := fieldDefsFromJSON(tpl.Properties)
	if len(defs) == 0 {
		return node, nil
	}
	values := map[string]any{}
	for _, f := range defs {
		if f.DefaultValue != "" {
			values[f.Key] = f.DefaultValue
		}
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}
	props, err := s.GetDocProps(ownerID, *node.DocumentID)
	if err != nil {
		return nil, err
	}
	props.Fields = tpl.Properties
	props.FieldValues = datatypes.JSON(raw)
	props.UpdatedAt = time.Now().UTC()
	if err := s.db.Save(props).Error; err != nil {
		return nil, err
	}
	return node, nil
}

// renderTemplateHTML 替换模板占位符：{标题} {日期} {负责人} {作者}。
func (s *KnowledgeService) renderTemplateHTML(tpl *model.KnowledgeTemplate, title string, ownerID uuid.UUID) string {
	author := s.userName(&ownerID)
	repl := strings.NewReplacer(
		"{标题}", title,
		"{日期}", time.Now().Format("2006-01-02"),
		"{负责人}", author,
		"{作者}", author,
	)
	return repl.Replace(tpl.HTML)
}

// ---------------------------------------------------------------- 属性读写

// SetDocFields 改文档的自定义字段定义与取值。
func (s *KnowledgeService) SetDocFields(ownerID, docID uuid.UUID, defs []FieldDef, values map[string]any) (*model.DocProperty, error) {
	props, err := s.GetDocProps(ownerID, docID)
	if err != nil {
		return nil, err
	}
	clean, err := normalizeFieldDefs(defs)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}
	merged := fieldValuesFromJSON(props.FieldValues)
	for k, v := range values {
		merged[k] = v
	}
	// 只保留已定义字段的值，避免脏数据堆积。
	allowed := map[string]bool{}
	for _, f := range clean {
		allowed[f.Key] = true
	}
	for k := range merged {
		if !allowed[k] {
			delete(merged, k)
		}
	}
	valueRaw, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	props.Fields = datatypes.JSON(raw)
	props.FieldValues = datatypes.JSON(valueRaw)
	props.UpdatedAt = time.Now().UTC()
	if err := s.db.Save(props).Error; err != nil {
		return nil, err
	}
	decorateDocProps(props)
	return props, nil
}

// BatchUpdateDocProps 批量改多篇文档的属性。
func (s *KnowledgeService) BatchUpdateDocProps(ownerID uuid.UUID, docIDs []uuid.UUID, in DocPropsInput) (int, error) {
	if len(docIDs) == 0 || len(docIDs) > 200 {
		return 0, ErrValidation
	}
	updated := 0
	for _, docID := range docIDs {
		if _, err := s.UpsertDocProps(ownerID, docID, in); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}

// DocBoardItem 是属性看板的一行：一篇文档 + 它的关键属性。
type DocBoardItem struct {
	DocID     uuid.UUID  `json:"docId"`
	NodeID    uuid.UUID  `json:"nodeId"`
	Title     string     `json:"title"`
	Icon      string     `json:"icon"`
	Status    string     `json:"status"`
	Priority  string     `json:"priority"`
	Reviewer  *uuid.UUID `json:"reviewerUserId"`
	Members   string     `json:"members"`
	Tags      string     `json:"tags"`
	Number    float64    `json:"number"`
	DueAt     *time.Time `json:"dueAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// DocPropsBoard 列出空间里所有挂载文档的关键属性：驱动看板视图。
func (s *KnowledgeService) DocPropsBoard(ownerID, projectID uuid.UUID) ([]DocBoardItem, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	var nodes []model.KnowledgeNode
	if err := s.db.Where("project_id = ? AND trashed_at IS NULL AND document_id IS NOT NULL", projectID).
		Order("sort_order ASC").Find(&nodes).Error; err != nil {
		return nil, err
	}
	items := make([]DocBoardItem, 0, len(nodes))
	for _, n := range nodes {
		if n.DocumentID == nil {
			continue
		}
		item := DocBoardItem{
			DocID:  *n.DocumentID,
			NodeID: n.ID,
			Title:  n.Title,
			Icon:   n.Icon,
		}
		var props model.DocProperty
		if err := s.db.Where("doc_id = ?", *n.DocumentID).First(&props).Error; err == nil {
			item.Status = props.Status
			item.Priority = props.Priority
			item.Reviewer = props.ReviewerUserID
			item.Members = props.Members
			item.Tags = props.Tags
			item.Number = props.Number
			item.DueAt = props.DueAt
		}
		if item.Status == "" {
			item.Status = "draft"
		}
		item.UpdatedAt = n.UpdatedAt
		items = append(items, item)
	}
	return items, nil
}
