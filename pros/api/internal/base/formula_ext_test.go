package base

import (
	"math"
	"strings"
	"testing"
	"time"
)

// evalExpr 解析并求值一条公式，失败直接 t.Fatal。
func evalExpr(t *testing.T, expr string, values map[string]any, now time.Time) any {
	t.Helper()
	node, err := ParseFormula(expr)
	if err != nil {
		t.Fatalf("parse %q failed: %v", expr, err)
	}
	value, err := EvaluateFormula(node, EvalContext{FieldValues: values, Now: now})
	if err != nil {
		t.Fatalf("evaluate %q failed: %v", expr, err)
	}
	return value
}

func TestFormulaLibraryCovers44Functions(t *testing.T) {
	if len(FormulaFunctions) < 44 {
		t.Fatalf("公式函数应不少于 44 个，实际 %d 个", len(FormulaFunctions))
	}
	// 盘点清单里点名要有的函数，一个都不能少。
	required := []string{
		"SUM", "AVERAGE", "COUNT", "MIN", "MAX", "CONCATENATE", "ROUND", "ABS",
		"IF", "AND", "OR", "NOT", "DATE", "TODAY",
		"NOW", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "WEEKDAY",
		"UPPER", "LOWER", "PROPER", "TRIM", "LEN", "LEFT", "RIGHT", "MID",
		"FIND", "SUBSTITUTE", "CONCAT",
		"FLOOR", "CEILING", "POWER", "MOD", "SQRT",
		"COALESCE", "IFERROR", "ISBLANK", "ISNUMBER", "ISTEXT", "SWITCH",
	}
	for _, name := range required {
		if _, ok := FormulaFunctions[name]; !ok {
			t.Errorf("缺少函数 %s", name)
		}
	}
}

func TestFormulaTextFunctions(t *testing.T) {
	cases := []struct {
		expr string
		want any
	}{
		{`UPPER("abc")`, "ABC"},
		{`LOWER("ABC")`, "abc"},
		{`PROPER("hello world")`, "Hello World"},
		{`TRIM("  a b  ")`, "a b"},
		{`LEN("中文abc")`, float64(5)},
		{`LEFT("abcdef", 3)`, "abc"},
		{`RIGHT("abcdef", 2)`, "ef"},
		{`MID("abcdef", 2, 3)`, "bcd"},
		{`FIND("cd", "abcdef")`, float64(3)},
		{`FIND("zz", "abcdef")`, float64(0)},
		{`SUBSTITUTE("a-b-c", "-", "+")`, "a+b+c"},
		{`CONCAT("a", "b", 1)`, "ab1"},
	}
	for _, c := range cases {
		got := evalExpr(t, c.expr, nil, time.Time{})
		if got != c.want {
			t.Errorf("%s = %v, 期望 %v", c.expr, got, c.want)
		}
	}
}

func TestFormulaTimeFunctions(t *testing.T) {
	now := time.Date(2026, 11, 27, 15, 4, 5, 0, time.UTC)
	cases := []struct {
		expr string
		want any
	}{
		{`NOW()`, "2026-11-27 15:04:05"},
		{`TODAY()`, "2026-11-27"},
		{`YEAR("2026-11-27 15:04:05")`, float64(2026)},
		{`MONTH("2026-11-27")`, float64(11)},
		{`DAY("2026-11-27")`, float64(27)},
		{`HOUR("2026-11-27 15:04:05")`, float64(15)},
		{`MINUTE("2026-11-27 15:04:05")`, float64(4)},
		{`SECOND("2026-11-27 15:04:05")`, float64(5)},
		{`WEEKDAY("2026-11-27")`, float64(5)}, // 2026-11-27 是周五
	}
	for _, c := range cases {
		got := evalExpr(t, c.expr, nil, now)
		if got != c.want {
			t.Errorf("%s = %v, 期望 %v", c.expr, got, c.want)
		}
	}
}

func TestFormulaNumberFunctions(t *testing.T) {
	cases := []struct {
		expr string
		want float64
	}{
		{`FLOOR(3.7)`, 3},
		{`CEILING(3.2)`, 4},
		{`FLOOR(7, 5)`, 5},
		{`CEILING(7, 5)`, 10},
		{`POWER(2, 10)`, 1024},
		{`MOD(10, 3)`, 1},
		{`SQRT(16)`, 4},
	}
	for _, c := range cases {
		got := evalExpr(t, c.expr, nil, time.Time{})
		f, ok := got.(float64)
		if !ok || math.Abs(f-c.want) > 1e-9 {
			t.Errorf("%s = %v, 期望 %v", c.expr, got, c.want)
		}
	}
}

func TestFormulaCoalesceAndIfError(t *testing.T) {
	if got := evalExpr(t, `COALESCE("", "", "兜底")`, nil, time.Time{}); got != "兜底" {
		t.Errorf("COALESCE = %v, 期望 兜底", got)
	}
	// 第一个参数是 1/0（除零）→ IFERROR 应吞掉错误返回兜底值。
	got := evalExpr(t, `IFERROR(1 / 0, "算错了")`, nil, time.Time{})
	if got != "算错了" {
		t.Errorf("IFERROR = %v, 期望 算错了", got)
	}
	// 无错时返回原值。
	got = evalExpr(t, `IFERROR(1 / 1, "算错了")`, nil, time.Time{})
	if got != float64(1) {
		t.Errorf("IFERROR 正常路径 = %v, 期望 1", got)
	}
}

func TestFormulaPredicateAndSwitch(t *testing.T) {
	if got := evalExpr(t, `ISBLANK("")`, nil, time.Time{}); got != true {
		t.Errorf("ISBLANK(\"\") = %v, 期望 true", got)
	}
	if got := evalExpr(t, `ISNUMBER("12")`, nil, time.Time{}); got != true {
		t.Errorf("ISNUMBER = %v, 期望 true", got)
	}
	if got := evalExpr(t, `ISTEXT("x")`, nil, time.Time{}); got != true {
		t.Errorf("ISTEXT = %v, 期望 true", got)
	}
	if got := evalExpr(t, `SWITCH("b", "a", 1, "b", 2, 0)`, nil, time.Time{}); got != float64(2) {
		t.Errorf("SWITCH 命中 = %v, 期望 2", got)
	}
	if got := evalExpr(t, `SWITCH("z", "a", 1, "b", 2, 99)`, nil, time.Time{}); got != float64(99) {
		t.Errorf("SWITCH 默认 = %v, 期望 99", got)
	}
}

// 新的函数必须能被解析器接受（此前这些函数一律报「未知函数」）。
func TestFormulaParserAcceptsNewFunctions(t *testing.T) {
	exprs := []string{
		`NOW()`, `UPPER({名称})`, `LEN({名称})`, `COALESCE({备注}, "无")`,
		`IFERROR({金额} / 0, 0)`, `SWITCH({状态}, "赢", 1, 0)`,
	}
	for _, expr := range exprs {
		if _, err := ParseFormula(expr); err != nil {
			t.Errorf("解析 %q 失败: %v", expr, err)
		}
	}
}

// 参数类型不对时给可读错误，而不是 panic。
func TestFormulaNewFunctionsRejectBadArgs(t *testing.T) {
	node, _ := ParseFormula(`MOD(1, 0)`)
	if _, err := EvaluateFormula(node, EvalContext{}); err == nil || !strings.Contains(err.Error(), "MOD") {
		t.Fatalf("MOD 除零应报错，实际 %v", err)
	}
	node, _ = ParseFormula(`SQRT(-1)`)
	if _, err := EvaluateFormula(node, EvalContext{}); err == nil {
		t.Fatal("SQRT 负数应报错")
	}
	node, _ = ParseFormula(`YEAR("不是日期")`)
	if _, err := EvaluateFormula(node, EvalContext{}); err == nil {
		t.Fatal("YEAR 非法日期应报错")
	}
}
