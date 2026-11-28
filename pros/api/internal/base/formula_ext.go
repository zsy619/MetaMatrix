package base

import (
	"math"
	"strings"
	"time"
	"unicode"
)

// —— 公式函数扩展库（第二批） ——
//
// 第一批只给了 14 个函数（SUM / AVERAGE / COUNT / MIN / MAX / CONCATENATE / ROUND /
// ABS / IF / AND / OR / NOT / DATE / TODAY），实际业务里最常用的一批
// 「文本处理 / 时间提取 / 容错」函数全部缺失，导致不少能算的东西只能靠手填。
//
// 本文件补齐 30 个函数，把函数库从 14 个扩到 44 个：
//
//	时间：NOW / YEAR / MONTH / DAY / HOUR / MINUTE / SECOND / WEEKDAY
//	文本：UPPER / LOWER / PROPER / TRIM / LEN / LEFT / RIGHT / MID / FIND / SUBSTITUTE / CONCAT
//	数值：FLOOR / CEILING / POWER / MOD / SQRT
//	容错：COALESCE / IFERROR / ISBLANK / ISNUMBER / ISTEXT
//	分支：SWITCH
//
// 约定：
//   - 所有函数都是**纯函数**，不访问数据库、不做 IO；
//   - 时间类函数统一走 formulaNow(ctx)，便于测试注入固定时间；
//   - 参数越界 / 类型不对一律返回可读的中文错误，不 panic。

// formulaNow 取公式求值的「当前时间」：优先用上下文注入的 Now（测试可控），否则用系统时间。
func formulaNow(ctx EvalContext) time.Time {
	if !ctx.Now.IsZero() {
		return ctx.Now
	}
	return time.Now()
}

// formulaTimeArg 把参数解析成时间。
func formulaTimeArg(v any) (time.Time, error) {
	switch t := v.(type) {
	case time.Time:
		return t, nil
	case string:
		ts, err := parseTime(t)
		if err != nil {
			return time.Time{}, newFormulaError(ErrCodeValue, "无法解析为时间："+t)
		}
		return ts, nil
	case float64:
		// Excel 序列号：以 1899-12-30 为基准（修正 1900 闰年 bug）。
		base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
		return base.Add(time.Duration(t * float64(24*time.Hour))), nil
	default:
		return time.Time{}, newFormulaError(ErrCodeValue, "参数不是时间")
	}
}

// formulaNum 取数值参数。
func formulaNum(v any, fn string) (float64, error) {
	n, ok := toFloat(v)
	if !ok {
		return 0, newFormulaError(ErrCodeValue, fn+" 参数不是数字")
	}
	return n, nil
}

// formulaInt 取整数参数（四舍五入）。
func formulaInt(v any, fn string) (int, error) {
	n, err := formulaNum(v, fn)
	if err != nil {
		return 0, err
	}
	return int(math.Round(n)), nil
}

// formulaText 取文本参数。
func formulaText(v any) string {
	return valueToText(v)
}

// formulaProper 每个单词首字母大写（其余小写）。
func formulaProper(s string) string {
	out := []rune(s)
	newWord := true
	for i, r := range out {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if newWord {
				out[i] = unicode.ToUpper(r)
				newWord = false
			} else {
				out[i] = unicode.ToLower(r)
			}
		default:
			newWord = true
		}
	}
	return string(out)
}

// formulaTrim 去掉首尾空白（含全角空格）。
func formulaTrim(s string) string {
	return strings.TrimSpace(strings.Trim(s, "　"))
}

// formulaSlice 按 rune 截取（start 从 1 开始，符合表格软件习惯）。
func formulaSlice(s string, start, length int) string {
	runes := []rune(s)
	if start < 1 {
		start = 1
	}
	if start > len(runes) {
		return ""
	}
	end := start - 1 + length
	if length <= 0 || end > len(runes) {
		end = len(runes)
	}
	return string(runes[start-1 : end])
}

func init() {
	// —— 时间 ——

	FormulaFunctions["NOW"] = formulaFunc{0, 0, func(ctx EvalContext, args []any) (any, error) {
		return formulaNow(ctx).Format("2006-01-02 15:04:05"), nil
	}}

	FormulaFunctions["YEAR"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(ts.Year()), nil
	}}

	FormulaFunctions["MONTH"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(int(ts.Month())), nil
	}}

	FormulaFunctions["DAY"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(ts.Day()), nil
	}}

	FormulaFunctions["HOUR"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(ts.Hour()), nil
	}}

	FormulaFunctions["MINUTE"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(ts.Minute()), nil
	}}

	FormulaFunctions["SECOND"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		return float64(ts.Second()), nil
	}}

	// WEEKDAY：1 = 周一 … 7 = 周日（与 ISO-8601 一致）。
	FormulaFunctions["WEEKDAY"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		ts, err := formulaTimeArg(args[0])
		if err != nil {
			return nil, err
		}
		wd := int(ts.Weekday())
		if wd == 0 {
			wd = 7
		}
		return float64(wd), nil
	}}

	// —— 文本 ——

	FormulaFunctions["UPPER"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return strings.ToUpper(formulaText(args[0])), nil
	}}

	FormulaFunctions["LOWER"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return strings.ToLower(formulaText(args[0])), nil
	}}

	FormulaFunctions["PROPER"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return formulaProper(formulaText(args[0])), nil
	}}

	FormulaFunctions["TRIM"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return formulaTrim(formulaText(args[0])), nil
	}}

	FormulaFunctions["LEN"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return float64(len([]rune(formulaText(args[0])))), nil
	}}

	FormulaFunctions["LEFT"] = formulaFunc{1, 2, func(_ EvalContext, args []any) (any, error) {
		n := 1
		if len(args) > 1 {
			v, err := formulaInt(args[1], "LEFT")
			if err != nil {
				return nil, err
			}
			n = v
		}
		return formulaSlice(formulaText(args[0]), 1, n), nil
	}}

	FormulaFunctions["RIGHT"] = formulaFunc{1, 2, func(_ EvalContext, args []any) (any, error) {
		runes := []rune(formulaText(args[0]))
		n := 1
		if len(args) > 1 {
			v, err := formulaInt(args[1], "RIGHT")
			if err != nil {
				return nil, err
			}
			n = v
		}
		if n <= 0 {
			return "", nil
		}
		if n > len(runes) {
			n = len(runes)
		}
		return string(runes[len(runes)-n:]), nil
	}}

	FormulaFunctions["MID"] = formulaFunc{3, 3, func(_ EvalContext, args []any) (any, error) {
		start, err := formulaInt(args[1], "MID")
		if err != nil {
			return nil, err
		}
		length, err := formulaInt(args[2], "MID")
		if err != nil {
			return nil, err
		}
		return formulaSlice(formulaText(args[0]), start, length), nil
	}}

	// FIND：区分大小写，返回位置（从 1 开始）；找不到返回 0。
	FormulaFunctions["FIND"] = formulaFunc{2, 2, func(_ EvalContext, args []any) (any, error) {
		needle := formulaText(args[0])
		hay := formulaText(args[1])
		if needle == "" {
			return float64(1), nil
		}
		idx := strings.Index(hay, needle)
		if idx < 0 {
			return float64(0), nil
		}
		return float64(len([]rune(hay[:idx])) + 1), nil
	}}

	// SUBSTITUTE(text, old, new)：把文本里的旧片段替换成新片段。
	FormulaFunctions["SUBSTITUTE"] = formulaFunc{3, 3, func(_ EvalContext, args []any) (any, error) {
		text := formulaText(args[0])
		old := formulaText(args[1])
		if old == "" {
			return text, nil
		}
		return strings.ReplaceAll(text, old, formulaText(args[2])), nil
	}}

	// CONCAT：不限参数字符串拼接（CONCATENATE 的别名，语义一致）。
	FormulaFunctions["CONCAT"] = formulaFunc{1, 255, func(_ EvalContext, args []any) (any, error) {
		var sb strings.Builder
		for _, a := range args {
			sb.WriteString(formulaText(a))
		}
		return sb.String(), nil
	}}

	// —— 数值 ——

	FormulaFunctions["FLOOR"] = formulaFunc{1, 2, func(_ EvalContext, args []any) (any, error) {
		n, err := formulaNum(args[0], "FLOOR")
		if err != nil {
			return nil, err
		}
		if len(args) > 1 {
			step, err := formulaNum(args[1], "FLOOR")
			if err != nil {
				return nil, err
			}
			if step == 0 {
				return nil, newFormulaError(ErrCodeValue, "FLOOR 步长不能为 0")
			}
			return math.Floor(n/step) * step, nil
		}
		return math.Floor(n), nil
	}}

	FormulaFunctions["CEILING"] = formulaFunc{1, 2, func(_ EvalContext, args []any) (any, error) {
		n, err := formulaNum(args[0], "CEILING")
		if err != nil {
			return nil, err
		}
		if len(args) > 1 {
			step, err := formulaNum(args[1], "CEILING")
			if err != nil {
				return nil, err
			}
			if step == 0 {
				return nil, newFormulaError(ErrCodeValue, "CEILING 步长不能为 0")
			}
			return math.Ceil(n/step) * step, nil
		}
		return math.Ceil(n), nil
	}}

	FormulaFunctions["POWER"] = formulaFunc{2, 2, func(_ EvalContext, args []any) (any, error) {
		base, err := formulaNum(args[0], "POWER")
		if err != nil {
			return nil, err
		}
		exp, err := formulaNum(args[1], "POWER")
		if err != nil {
			return nil, err
		}
		return math.Pow(base, exp), nil
	}}

	FormulaFunctions["MOD"] = formulaFunc{2, 2, func(_ EvalContext, args []any) (any, error) {
		a, err := formulaNum(args[0], "MOD")
		if err != nil {
			return nil, err
		}
		b, err := formulaNum(args[1], "MOD")
		if err != nil {
			return nil, err
		}
		if b == 0 {
			return nil, newFormulaError(ErrCodeValue, "MOD 除数不能为 0")
		}
		return math.Mod(a, b), nil
	}}

	FormulaFunctions["SQRT"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		n, err := formulaNum(args[0], "SQRT")
		if err != nil {
			return nil, err
		}
		if n < 0 {
			return nil, newFormulaError(ErrCodeValue, "SQRT 参数不能为负数")
		}
		return math.Sqrt(n), nil
	}}

	// —— 容错 ——

	// COALESCE：返回第一个非空参数。
	FormulaFunctions["COALESCE"] = formulaFunc{1, 255, func(_ EvalContext, args []any) (any, error) {
		for _, a := range args {
			if a != nil && valueToText(a) != "" {
				return a, nil
			}
		}
		return nil, nil
	}}

	// IFERROR：第一个参数算错时返回第二个参数。
	// 真正的「吞错」逻辑在求值器里（见 EvaluateFormula 的 IFERROR 特判）。
	FormulaFunctions["IFERROR"] = formulaFunc{2, 2, func(_ EvalContext, args []any) (any, error) {
		return args[0], nil
	}}

	FormulaFunctions["ISBLANK"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		return args[0] == nil || valueToText(args[0]) == "", nil
	}}

	FormulaFunctions["ISNUMBER"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		_, ok := toFloat(args[0])
		return ok, nil
	}}

	FormulaFunctions["ISTEXT"] = formulaFunc{1, 1, func(_ EvalContext, args []any) (any, error) {
		_, ok := args[0].(string)
		return ok, nil
	}}

	// —— 分支 ——

	// SWITCH(表达式, 值1, 结果1, 值2, 结果2, …, 默认值)
	FormulaFunctions["SWITCH"] = formulaFunc{3, 254, func(_ EvalContext, args []any) (any, error) {
		target := valueToText(args[0])
		rest := args[1:]
		for i := 0; i+1 < len(rest); i += 2 {
			if valueToText(rest[i]) == target {
				return rest[i+1], nil
			}
		}
		if len(rest)%2 == 1 {
			return rest[len(rest)-1], nil
		}
		return nil, nil
	}}
}
