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

// DiffTextLines produces a line-level LCS diff.
func DiffTextLines(from, to string) []TextOp {
	a := splitLines(from)
	b := splitLines(to)
	n, m := len(a), len(b)
	// DP LCS lengths
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	var ops []TextOp
	i, j := 0, 0
	for i < n && j < m {
		if a[i] == b[j] {
			ops = append(ops, TextOp{Op: "equal", Text: a[i]})
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			ops = append(ops, TextOp{Op: "delete", Text: a[i]})
			i++
		} else {
			ops = append(ops, TextOp{Op: "insert", Text: b[j]})
			j++
		}
	}
	for ; i < n; i++ {
		ops = append(ops, TextOp{Op: "delete", Text: a[i]})
	}
	for ; j < m; j++ {
		ops = append(ops, TextOp{Op: "insert", Text: b[j]})
	}
	return mergeAdjacent(ops)
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
	out := []TextOp{ops[0]}
	for i := 1; i < len(ops); i++ {
		last := &out[len(out)-1]
		if last.Op == ops[i].Op {
			last.Text = last.Text + "\n" + ops[i].Text
		} else {
			out = append(out, ops[i])
		}
	}
	return out
}
