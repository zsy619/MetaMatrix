package base

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// 公式安全上限。
const (
	MaxFormulaNodes  = 1000
	MaxFormulaDepth  = 64
	MaxFormulaSteps  = 10000
	MaxFormulaLength = 2000
)

// 公式错误码：与前端展示的 #NAME? 等一一对应。
const (
	ErrCodeName   = "#NAME?"
	ErrCodeDivide = "#DIV/0!"
	ErrCodeRef    = "#REF?"
	ErrCodeValue  = "#VALUE!"
	ErrCodeParse  = "#PARSE!"
	ErrCodeCycle  = "#CYCLE!"
)

// FormulaError 是公式求值错误：带错误码，便于前端识别为可展示状态。
type FormulaError struct {
	Code    string
	Message string
}

func (e *FormulaError) Error() string { return e.Code + " " + e.Message }

func newFormulaError(code, msg string) error {
	return &FormulaError{Code: code, Message: msg}
}

// —— 词法 ——

type tokenKind int

const (
	tokNumber tokenKind = iota
	tokString
	tokIdent
	tokFieldRef
	tokOperator
	tokLParen
	tokRParen
	tokComma
	tokEOF
)

type token struct {
	kind tokenKind
	text string
	num  float64
	pos  int
}

func lexFormula(src string) ([]token, error) {
	tokens := []token{}
	i := 0
	for i < len(src) {
		ch := src[i]
		switch {
		case ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r':
			i++
		case ch == '{':
			end := strings.IndexByte(src[i:], '}')
			if end < 0 {
				return nil, newFormulaError(ErrCodeParse, "字段引用缺少右花括号")
			}
			name := strings.TrimSpace(src[i+1 : i+end])
			if name == "" {
				return nil, newFormulaError(ErrCodeParse, "字段引用为空")
			}
			tokens = append(tokens, token{kind: tokFieldRef, text: name, pos: i})
			i += end + 1
		case ch == '"' || ch == '\'':
			quote := ch
			j := i + 1
			var sb strings.Builder
			for j < len(src) && src[j] != quote {
				if src[j] == '\\' && j+1 < len(src) {
					j++
				}
				sb.WriteByte(src[j])
				j++
			}
			if j >= len(src) {
				return nil, newFormulaError(ErrCodeParse, "字符串没有闭合")
			}
			tokens = append(tokens, token{kind: tokString, text: sb.String(), pos: i})
			i = j + 1
		case ch >= '0' && ch <= '9':
			j := i
			for j < len(src) && (src[j] >= '0' && src[j] <= '9' || src[j] == '.') {
				j++
			}
			num, err := strconv.ParseFloat(src[i:j], 64)
			if err != nil {
				return nil, newFormulaError(ErrCodeParse, "数字格式错误")
			}
			tokens = append(tokens, token{kind: tokNumber, num: num, text: src[i:j], pos: i})
			i = j
		case isIdentStart(rune(ch)):
			j := i
			for j < len(src) && isIdentPart(rune(src[j])) {
				j++
			}
			tokens = append(tokens, token{kind: tokIdent, text: src[i:j], pos: i})
			i = j
		case strings.ContainsRune("+-*/%=<>!", rune(ch)):
			j := i
			if j+1 < len(src) && (src[j+1] == '=' || (ch == '<' && src[j+1] == '>')) {
				j++
			}
			tokens = append(tokens, token{kind: tokOperator, text: src[i : j+1], pos: i})
			i = j + 1
		case ch == '(':
			tokens = append(tokens, token{kind: tokLParen, text: "(", pos: i})
			i++
		case ch == ')':
			tokens = append(tokens, token{kind: tokRParen, text: ")", pos: i})
			i++
		case ch == ',':
			tokens = append(tokens, token{kind: tokComma, text: ",", pos: i})
			i++
		default:
			return nil, newFormulaError(ErrCodeParse, fmt.Sprintf("无法识别的字符 %q", string(ch)))
		}
	}
	tokens = append(tokens, token{kind: tokEOF, pos: len(src)})
	return tokens, nil
}

func isIdentStart(r rune) bool {
	return unicode.IsLetter(r) || r == '_'
}

func isIdentPart(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_'
}

// —— 语法 ——

// AST 节点。
type ASTNode struct {
	Type     string     `json:"type"`
	Value    any        `json:"value,omitempty"`
	Field    string     `json:"field,omitempty"`
	Operator string     `json:"operator,omitempty"`
	Left     *ASTNode   `json:"left,omitempty"`
	Right    *ASTNode   `json:"right,omitempty"`
	Argument *ASTNode   `json:"argument,omitempty"`
	Name     string     `json:"name,omitempty"`
	Args     []*ASTNode `json:"args,omitempty"`
}

type parser struct {
	tokens []token
	pos    int
	nodes  int
}

func (p *parser) peek() token { return p.tokens[p.pos] }
func (p *parser) next() token { t := p.tokens[p.pos]; p.pos++; return t }
func (p *parser) atEOF() bool { return p.tokens[p.pos].kind == tokEOF }

// ParseFormula 解析公式表达式，返回 AST。
func ParseFormula(expr string) (*ASTNode, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return nil, newFormulaError(ErrCodeParse, "公式为空")
	}
	if len(expr) > MaxFormulaLength {
		return nil, newFormulaError(ErrCodeParse, "公式过长")
	}
	tokens, err := lexFormula(expr)
	if err != nil {
		return nil, err
	}
	p := &parser{tokens: tokens}
	node, err := p.parseExpression()
	if err != nil {
		return nil, err
	}
	if !p.atEOF() {
		return nil, newFormulaError(ErrCodeParse, "公式结尾有多余内容")
	}
	return node, nil
}

func (p *parser) parseExpression() (*ASTNode, error) {
	left, err := p.parseTerm()
	if err != nil {
		return nil, err
	}
	for {
		t := p.peek()
		if t.kind != tokOperator {
			return left, nil
		}
		switch strings.ToUpper(t.text) {
		case "AND", "OR":
			p.next()
			right, err := p.parseTerm()
			if err != nil {
				return nil, err
			}
			left = &ASTNode{Type: "BinaryExpression", Operator: strings.ToUpper(t.text), Left: left, Right: right}
			p.nodes++
			if p.nodes > MaxFormulaNodes {
				return nil, newFormulaError(ErrCodeParse, "公式过于复杂")
			}
		default:
			return left, nil
		}
	}
}

func (p *parser) parseTerm() (*ASTNode, error) {
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for {
		t := p.peek()
		if t.kind != tokOperator {
			return left, nil
		}
		switch t.text {
		case "+", "-", "*", "/", "%":
			p.next()
			right, err := p.parseUnary()
			if err != nil {
				return nil, err
			}
			left = &ASTNode{Type: "BinaryExpression", Operator: t.text, Left: left, Right: right}
			p.nodes++
			if p.nodes > MaxFormulaNodes {
				return nil, newFormulaError(ErrCodeParse, "公式过于复杂")
			}
		case "=", "!=", ">", "<", ">=", "<=":
			p.next()
			right, err := p.parseUnary()
			if err != nil {
				return nil, err
			}
			left = &ASTNode{Type: "BinaryExpression", Operator: t.text, Left: left, Right: right}
			p.nodes++
			if p.nodes > MaxFormulaNodes {
				return nil, newFormulaError(ErrCodeParse, "公式过于复杂")
			}
		default:
			return left, nil
		}
	}
}

func (p *parser) parseUnary() (*ASTNode, error) {
	t := p.peek()
	if t.kind == tokOperator && (t.text == "-" || t.text == "+") {
		p.next()
		operand, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		if t.text == "-" {
			return &ASTNode{Type: "UnaryExpression", Operator: "-", Argument: operand}, nil
		}
		return operand, nil
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() (*ASTNode, error) {
	t := p.next()
	switch t.kind {
	case tokNumber:
		return &ASTNode{Type: "NumberLiteral", Value: t.num}, nil
	case tokString:
		return &ASTNode{Type: "StringLiteral", Value: t.text}, nil
	case tokFieldRef:
		return &ASTNode{Type: "FieldReference", Field: t.text}, nil
	case tokIdent:
		upper := strings.ToUpper(t.text)
		switch upper {
		case "TRUE":
			return &ASTNode{Type: "BooleanLiteral", Value: true}, nil
		case "FALSE":
			return &ASTNode{Type: "BooleanLiteral", Value: false}, nil
		}
		if p.peek().kind != tokLParen {
			return nil, newFormulaError(ErrCodeName, "未知的标识符 "+t.text)
		}
		if _, ok := FormulaFunctions[upper]; !ok {
			return nil, newFormulaError(ErrCodeName, "未知函数 "+t.text)
		}
		p.next() // (
		args := []*ASTNode{}
		if p.peek().kind != tokRParen {
			for {
				arg, err := p.parseExpression()
				if err != nil {
					return nil, err
				}
				args = append(args, arg)
				if p.peek().kind == tokComma {
					p.next()
					continue
				}
				break
			}
		}
		if p.peek().kind != tokRParen {
			return nil, newFormulaError(ErrCodeParse, "函数缺少右括号")
		}
		p.next()
		p.nodes++
		if p.nodes > MaxFormulaNodes {
			return nil, newFormulaError(ErrCodeParse, "公式过于复杂")
		}
		return &ASTNode{Type: "CallExpression", Name: upper, Args: args}, nil
	case tokLParen:
		node, err := p.parseExpression()
		if err != nil {
			return nil, err
		}
		if p.peek().kind != tokRParen {
			return nil, newFormulaError(ErrCodeParse, "缺少右括号")
		}
		p.next()
		return node, nil
	default:
		return nil, newFormulaError(ErrCodeParse, "公式语法错误")
	}
}

// —— 函数注册表 ——

// formulaFunc 是白名单函数。
type formulaFunc struct {
	minArgs int
	maxArgs int
	compute func(ctx EvalContext, args []any) (any, error)
}

// FormulaFunctions 是允许在公式中调用的函数集合。
// 新增函数只需在这里注册一行，解析器与求值器无需改动。
var FormulaFunctions = map[string]formulaFunc{
	"SUM": {0, 255, func(_ EvalContext, args []any) (any, error) {
		return aggregate(args, func(nums []float64) float64 {
			s := 0.0
			for _, n := range nums {
				s += n
			}
			return s
		})
	}},
	"AVERAGE": {0, 255, func(_ EvalContext, args []any) (any, error) {
		return aggregate(args, func(nums []float64) float64 {
			if len(nums) == 0 {
				return 0
			}
			s := 0.0
			for _, n := range nums {
				s += n
			}
			return s / float64(len(nums))
		})
	}},
	"COUNT": {0, 255, func(_ EvalContext, args []any) (any, error) {
		return aggregate(args, func(nums []float64) float64 { return float64(len(nums)) })
	}},
	"MIN": {0, 255, func(_ EvalContext, args []any) (any, error) {
		return aggregate(args, func(nums []float64) float64 {
			if len(nums) == 0 {
				return 0
			}
			m := nums[0]
			for _, n := range nums {
				if n < m {
					m = n
				}
			}
			return m
		})
	}},
	"MAX": {0, 255, func(_ EvalContext, args []any) (any, error) {
		return aggregate(args, func(nums []float64) float64 {
			if len(nums) == 0 {
				return 0
			}
			m := nums[0]
			for _, n := range nums {
				if n > m {
					m = n
				}
			}
			return m
		})
	}},
	"CONCATENATE": {1, 255, func(_ EvalContext, args []any) (any, error) {
		var sb strings.Builder
		for _, a := range args {
			sb.WriteString(valueToText(a))
		}
		return sb.String(), nil
	}},
	"ROUND": {1, 2, func(_ EvalContext, args []any) (any, error) {
		if len(args) == 0 {
			return nil, newFormulaError(ErrCodeValue, "ROUND 缺少参数")
		}
		n, ok := toFloat(args[0])
		if !ok {
			return nil, newFormulaError(ErrCodeValue, "ROUND 参数不是数字")
		}
		digits := 0
		if len(args) > 1 {
			d, ok := toFloat(args[1])
			if !ok {
				return nil, newFormulaError(ErrCodeValue, "ROUND 位数不是数字")
			}
			digits = int(d)
		}
		shift := math.Pow(10, float64(digits))
		return math.Round(n*shift) / shift, nil
	}},
	"ABS": {1, 1, func(_ EvalContext, args []any) (any, error) {
		n, ok := toFloat(args[0])
		if !ok {
			return nil, newFormulaError(ErrCodeValue, "ABS 参数不是数字")
		}
		return math.Abs(n), nil
	}},
	"IF": {2, 3, func(_ EvalContext, args []any) (any, error) {
		if len(args) < 2 {
			return nil, newFormulaError(ErrCodeValue, "IF 参数不足")
		}
		if truthy(args[0]) {
			return args[1], nil
		}
		if len(args) == 3 {
			return args[2], nil
		}
		return nil, nil
	}},
	"AND": {1, 255, func(_ EvalContext, args []any) (any, error) {
		for _, a := range args {
			if !truthy(a) {
				return false, nil
			}
		}
		return true, nil
	}},
	"OR": {1, 255, func(_ EvalContext, args []any) (any, error) {
		for _, a := range args {
			if truthy(a) {
				return true, nil
			}
		}
		return false, nil
	}},
	"NOT": {1, 1, func(_ EvalContext, args []any) (any, error) { return !truthy(args[0]), nil }},
	"DATE": {1, 3, func(_ EvalContext, args []any) (any, error) {
		y, m, d := 1970, 1, 1
		h, mi := 0, 0
		if len(args) > 0 {
			v, ok := toFloat(args[0])
			if !ok {
				return nil, newFormulaError(ErrCodeValue, "DATE 年份不是数字")
			}
			y = int(v)
		}
		if len(args) > 1 {
			v, _ := toFloat(args[1])
			m = int(v)
		}
		if len(args) > 2 {
			v, _ := toFloat(args[2])
			d = int(v)
		}
		if len(args) > 3 {
			v, _ := toFloat(args[3])
			h = int(v)
		}
		if len(args) > 4 {
			v, _ := toFloat(args[4])
			mi = int(v)
		}
		return time.Date(y, time.Month(m), d, h, mi, 0, 0, time.UTC).Format("2006-01-02 15:04:05"), nil
	}},
	"TODAY": {0, 0, func(ctx EvalContext, args []any) (any, error) {
		return formulaNow(ctx).Format("2006-01-02"), nil
	}},
}

func aggregate(args []any, fn func([]float64) float64) (any, error) {
	nums := []float64{}
	for _, a := range args {
		if list, ok := a.([]any); ok {
			for _, item := range list {
				if n, ok := toFloat(item); ok {
					nums = append(nums, n)
				}
			}
			continue
		}
		if n, ok := toFloat(a); ok {
			nums = append(nums, n)
		}
	}
	return fn(nums), nil
}

func truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		return s != "" && s != "false" && s != "0"
	default:
		return true
	}
}

func valueToText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			parts = append(parts, valueToText(item))
		}
		return strings.Join(parts, ", ")
	default:
		return fmt.Sprintf("%v", v)
	}
}

// —— 求值 ——

// EvalContext 提供公式求值需要的字段值。
type EvalContext struct {
	// FieldValues 是「字段名 → 值」与「字段 ID → 值」的合并视图。
	FieldValues map[string]any
	// Now 是公式中 TODAY() 使用的时间，便于测试。
	Now time.Time
}

// EvaluateFormula 在给定上下文中求值。
//
// 安全约束：AST 节点数与深度已在解析期限制；求值期限制执行步数与总耗时；
// 只允许调用白名单函数；不做任何字符串求值。
func EvaluateFormula(node *ASTNode, ctx EvalContext) (any, error) {
	steps := 0
	deadline := time.Now().Add(2 * time.Second)
	var evalNode func(n *ASTNode, depth int) (any, error)

	evalNode = func(n *ASTNode, depth int) (any, error) {
		steps++
		if steps > MaxFormulaSteps {
			return nil, newFormulaError(ErrCodeValue, "公式计算步骤超限")
		}
		if depth > MaxFormulaDepth {
			return nil, newFormulaError(ErrCodeValue, "公式嵌套过深")
		}
		if time.Now().After(deadline) {
			return nil, newFormulaError(ErrCodeValue, "公式计算超时")
		}
		if n == nil {
			return nil, nil
		}
		switch n.Type {
		case "NumberLiteral":
			if f, ok := n.Value.(float64); ok {
				return f, nil
			}
			return n.Value, nil
		case "StringLiteral":
			return n.Value, nil
		case "BooleanLiteral":
			return n.Value, nil
		case "FieldReference":
			if ctx.FieldValues == nil {
				return nil, newFormulaError(ErrCodeRef, "找不到字段 "+n.Field)
			}
			v, ok := ctx.FieldValues[n.Field]
			if !ok {
				return nil, newFormulaError(ErrCodeRef, "找不到字段 "+n.Field)
			}
			return v, nil
		case "UnaryExpression":
			arg, err := evalNode(n.Argument, depth+1)
			if err != nil {
				return nil, err
			}
			num, ok := toFloat(arg)
			if !ok {
				return nil, newFormulaError(ErrCodeValue, "不支持的负数运算")
			}
			return -num, nil
		case "BinaryExpression":
			left, err := evalNode(n.Left, depth+1)
			if err != nil {
				return nil, err
			}
			right, err := evalNode(n.Right, depth+1)
			if err != nil {
				return nil, err
			}
			return evalBinary(n.Operator, left, right)
		case "CallExpression":
			fn, ok := FormulaFunctions[n.Name]
			if !ok {
				return nil, newFormulaError(ErrCodeName, "未知函数 "+n.Name)
			}
			if len(n.Args) < fn.minArgs || len(n.Args) > fn.maxArgs {
				return nil, newFormulaError(ErrCodeValue, fmt.Sprintf("%s 参数数量不正确", n.Name))
			}
			args := make([]any, 0, len(n.Args))
			for i, a := range n.Args {
				v, err := evalNode(a, depth+1)
				if err != nil {
					// IFERROR 是唯一「能吞掉参数错误」的函数：
					// 第一个参数求值失败时，直接返回兜底值。
					if n.Name == "IFERROR" && i == 0 {
						fallback, ferr := evalNode(n.Args[1], depth+1)
						if ferr != nil {
							return nil, ferr
						}
						return fallback, nil
					}
					return nil, err
				}
				args = append(args, v)
			}
			return fn.compute(ctx, args)
		default:
			return nil, newFormulaError(ErrCodeParse, "未知节点 "+n.Type)
		}
	}
	return evalNode(node, 0)
}

func evalBinary(op string, left, right any) (any, error) {
	switch op {
	case "AND":
		return truthy(left) && truthy(right), nil
	case "OR":
		return truthy(left) || truthy(right), nil
	case "=":
		return valueToText(left) == valueToText(right), nil
	case "!=":
		return valueToText(left) != valueToText(right), nil
	}

	lf, lok := toFloat(left)
	rf, rok := toFloat(right)
	if lok && rok {
		switch op {
		case ">":
			return lf > rf, nil
		case "<":
			return lf < rf, nil
		case ">=":
			return lf >= rf, nil
		case "<=":
			return lf <= rf, nil
		}
	}

	switch op {
	case "+":
		if ls, ok := left.(string); ok {
			if rs, ok := right.(string); ok {
				return ls + rs, nil
			}
		}
		if lok && rok {
			return lf + rf, nil
		}
		return nil, newFormulaError(ErrCodeValue, "无法相加")
	case "-":
		if lok && rok {
			return lf - rf, nil
		}
		return nil, newFormulaError(ErrCodeValue, "无法相减")
	case "*":
		if lok && rok {
			return lf * rf, nil
		}
		return nil, newFormulaError(ErrCodeValue, "无法相乘")
	case "/":
		if lok && rok {
			if rf == 0 {
				return nil, newFormulaError(ErrCodeDivide, "除数为零")
			}
			return lf / rf, nil
		}
		return nil, newFormulaError(ErrCodeValue, "无法相除")
	case "%":
		if lok && rok {
			if rf == 0 {
				return nil, newFormulaError(ErrCodeDivide, "除数为零")
			}
			return math.Mod(lf, rf), nil
		}
		return nil, newFormulaError(ErrCodeValue, "无法取模")
	}
	return nil, newFormulaError(ErrCodeValue, "不支持的运算符 "+op)
}

// FormulaDependencies 提取公式引用的字段名。
func FormulaDependencies(node *ASTNode) []string {
	seen := map[string]bool{}
	out := []string{}
	var walk func(n *ASTNode)
	walk = func(n *ASTNode) {
		if n == nil {
			return
		}
		switch n.Type {
		case "FieldReference":
			if !seen[n.Field] {
				seen[n.Field] = true
				out = append(out, n.Field)
			}
		case "UnaryExpression":
			walk(n.Argument)
		case "BinaryExpression":
			walk(n.Left)
			walk(n.Right)
		case "CallExpression":
			for _, a := range n.Args {
				walk(a)
			}
		}
	}
	walk(node)
	return out
}

// DetectCycle 在依赖图（字段 → 依赖字段）中检测循环依赖。
func DetectCycle(deps map[string][]string) []string {
	state := map[string]int{} // 0 未访问，1 访问中，2 已完成
	var stack []string
	var cycle []string

	var visit func(node string) bool
	visit = func(node string) bool {
		switch state[node] {
		case 1:
			// 找到环的起点
			for i, item := range stack {
				if item == node {
					cycle = append([]string{}, stack[i:]...)
					cycle = append(cycle, node)
					return true
				}
			}
			cycle = []string{node}
			return true
		case 2:
			return false
		}
		state[node] = 1
		stack = append(stack, node)
		for _, next := range deps[node] {
			if visit(next) {
				return true
			}
		}
		stack = stack[:len(stack)-1]
		state[node] = 2
		return false
	}

	for node := range deps {
		if visit(node) {
			return cycle
		}
	}
	return nil
}

// ErrFormulaCycle 表示公式存在循环依赖。
var ErrFormulaCycle = errors.New("formula dependency cycle")
