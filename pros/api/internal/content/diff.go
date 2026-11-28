package content

import (
	"encoding/json"
	"strings"

	"github.com/wI2L/jsondiff"
)

// TextOp is a simple text diff operation.
type TextOp struct {
	Op   string `json:"op"` // equal | insert | delete
	Text string `json:"text"`
}

// DiffTextLines 生成行级 LCS diff。
//
// 这里使用 Hirschberg 分治，而不是保存完整的 (n+1)*(m+1) DP 矩阵：
// 每次只用两行计算左、右半段的 LCS 长度，找出目标文本的最佳切分点后递归。
// 因而结果仍然对应一个真正的最长公共子序列，但峰值内存为 O(n+m)，
// 不会在全量替换等病态输入上退化成矩阵大小的内存占用。
func DiffTextLines(from, to string) []TextOp {
	a := splitLines(from)
	b := splitLines(to)
	ops := appendLineDiff(nil, a, b)
	return mergeAdjacent(ops)
}

// appendLineDiff 先剥离公共首尾，再递归计算中间真正发生变化的部分。
// 公共首尾优化让“长文档只改几行”的常见场景无需扫描整个笛卡尔积；
// 同时，首尾相同行必须按原顺序直接输出，不能改变末尾空行（末尾换行）的语义。
func appendLineDiff(ops []TextOp, a, b []string) []TextOp {
	prefix := 0
	for prefix < len(a) && prefix < len(b) && a[prefix] == b[prefix] {
		ops = append(ops, TextOp{Op: "equal", Text: a[prefix]})
		prefix++
	}
	a = a[prefix:]
	b = b[prefix:]

	suffix := 0
	for suffix < len(a) && suffix < len(b) && a[len(a)-1-suffix] == b[len(b)-1-suffix] {
		suffix++
	}

	middleA := a[:len(a)-suffix]
	middleB := b[:len(b)-suffix]
	ops = appendLineDiffMiddle(ops, middleA, middleB)

	// 上面只切分切片，没有复制原始行；后缀仍可按 a 的原顺序恢复。
	for i := len(a) - suffix; i < len(a); i++ {
		ops = append(ops, TextOp{Op: "equal", Text: a[i]})
	}
	return ops
}

func appendLineDiffMiddle(ops []TextOp, a, b []string) []TextOp {
	switch {
	case len(a) == 0:
		for _, line := range b {
			ops = append(ops, TextOp{Op: "insert", Text: line})
		}
		return ops
	case len(b) == 0:
		for _, line := range a {
			ops = append(ops, TextOp{Op: "delete", Text: line})
		}
		return ops
	case len(a) == 1:
		// 单边只剩一行时无需再分治。选择 b 中第一个匹配项，结果与
		// 原 DP 在“长度相同时优先删除”的方向一致，也保证重复行输出稳定。
		match := -1
		for i, line := range b {
			if line == a[0] {
				match = i
				break
			}
		}
		if match < 0 {
			ops = append(ops, TextOp{Op: "delete", Text: a[0]})
			for _, line := range b {
				ops = append(ops, TextOp{Op: "insert", Text: line})
			}
			return ops
		}
		for _, line := range b[:match] {
			ops = append(ops, TextOp{Op: "insert", Text: line})
		}
		ops = append(ops, TextOp{Op: "equal", Text: a[0]})
		for _, line := range b[match+1:] {
			ops = append(ops, TextOp{Op: "insert", Text: line})
		}
		return ops
	}

	mid := len(a) / 2
	left := lcsPrefixLengths(a[:mid], b)
	right := lcsSuffixLengths(a[mid:], b)

	// k 表示 b 有多少行属于左半段。只在严格变大时更新，等价于在多个
	// 最优切分点中稳定地选择最左侧；无公共行时因此先删除 a、再插入 b。
	split, best := 0, -1
	for k := 0; k <= len(b); k++ {
		score := left[k] + right[k]
		if score > best {
			split, best = k, score
		}
	}

	// 后续递归只使用 split，显式解除引用可让运行时及时回收本层行数组，
	// 避免深递归时把各层临时数组全部保留到回溯结束。
	left = nil
	right = nil
	ops = appendLineDiff(ops, a[:mid], b[:split])
	ops = appendLineDiff(ops, a[mid:], b[split:])
	return ops
}

// lcsPrefixLengths 返回 a 与 b 的每个前缀 b[:j] 的 LCS 长度。
// 任意时刻只保留上一行和当前行，空间为 O(len(b))。
func lcsPrefixLengths(a, b []string) []int {
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for i := range a {
		current[0] = 0
		for j := 1; j <= len(b); j++ {
			if a[i] == b[j-1] {
				current[j] = previous[j-1] + 1
			} else if previous[j] >= current[j-1] {
				current[j] = previous[j]
			} else {
				current[j] = current[j-1]
			}
		}
		previous, current = current, previous
	}
	return previous
}

// lcsSuffixLengths 是 lcsPrefixLengths 的反向版本：返回值下标 j 对应
// a 与 b[j:] 的 LCS 长度。两个方向的分数相加即可找到 Hirschberg 切分点。
func lcsSuffixLengths(a, b []string) []int {
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for i := len(a) - 1; i >= 0; i-- {
		current[len(b)] = 0
		for j := len(b) - 1; j >= 0; j-- {
			if a[i] == b[j] {
				current[j] = previous[j+1] + 1
			} else if previous[j] >= current[j+1] {
				current[j] = previous[j]
			} else {
				current[j] = current[j+1]
			}
		}
		previous, current = current, previous
	}
	return previous
}

// UnifiedDiff renders a simple unified-style string from TextOps.
func UnifiedDiff(ops []TextOp) string {
	var b strings.Builder
	for _, op := range ops {
		switch op.Op {
		case "insert":
			b.WriteString("+ ")
			b.WriteString(op.Text)
			b.WriteByte('\n')
		case "delete":
			b.WriteString("- ")
			b.WriteString(op.Text)
			b.WriteByte('\n')
		default:
			b.WriteString("  ")
			b.WriteString(op.Text)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

// JSONPatchRFC6902 returns RFC6902 patch transforming fromJSON → toJSON.
func JSONPatchRFC6902(fromJSON, toJSON []byte) ([]jsondiff.Operation, error) {
	if len(fromJSON) == 0 {
		fromJSON = []byte(`{}`)
	}
	if len(toJSON) == 0 {
		toJSON = []byte(`{}`)
	}
	patch, err := jsondiff.CompareJSON(fromJSON, toJSON)
	if err != nil {
		return nil, err
	}
	return patch, nil
}

// CanonicalHashBytes returns stable JSON bytes (re-marshal) for hashing when possible.
func CanonicalHashBytes(raw []byte) []byte {
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return raw
	}
	out, err := json.Marshal(v)
	if err != nil {
		return raw
	}
	return out
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.Split(s, "\n")
}

func mergeAdjacent(ops []TextOp) []TextOp {
	if len(ops) == 0 {
		return ops
	}
	out := make([]TextOp, 0, len(ops))
	for start := 0; start < len(ops); {
		end := start + 1
		for end < len(ops) && ops[end].Op == ops[start].Op {
			end++
		}

		merged := ops[start]
		if end-start > 1 {
			// 逐次 last.Text + line 会反复复制已经合并的前缀，在全量替换时
			// 产生 O(n²) 的总分配。先算精确容量，再一次性写入，保持线性内存与时间。
			size := len(merged.Text)
			for i := start + 1; i < end; i++ {
				size += 1 + len(ops[i].Text)
			}
			var text strings.Builder
			text.Grow(size)
			text.WriteString(merged.Text)
			for i := start + 1; i < end; i++ {
				text.WriteByte('\n')
				text.WriteString(ops[i].Text)
			}
			merged.Text = text.String()
		}
		out = append(out, merged)
		start = end
	}
	return out
}
