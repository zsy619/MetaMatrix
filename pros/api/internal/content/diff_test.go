package content

import (
	"fmt"
	"math/rand"
	"reflect"
	"strings"
	"testing"
)

func TestDiffTextLinesProducesValidMinimalDiff(t *testing.T) {
	tests := []struct {
		name string
		from string
		to   string
	}{
		{name: "both empty"},
		{name: "empty source", to: "a\nb\n"},
		{name: "empty target", from: "a\nb\n"},
		{name: "identical", from: "a\nb\n", to: "a\nb\n"},
		{name: "trailing newline added", from: "a\nb", to: "a\nb\n"},
		{name: "trailing newline removed", from: "a\nb\n", to: "a\nb"},
		{name: "repeated lines", from: "a\nb\na\nb\na", to: "b\na\nb\na\na"},
		{name: "full replacement", from: "a\nb\nc", to: "x\ny\nz\nw"},
		{name: "insert and delete", from: "head\nleft\nright\ntail", to: "head\nright\nnew\ntail"},
		{name: "CRLF normalization", from: "a\r\nb\r\n", to: "a\nc\n"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ops := DiffTextLines(tt.from, tt.to)
			assertValidLineDiff(t, tt.from, tt.to, ops)

			// 同一输入必须得到完全相同的最优切分点和操作顺序。
			if again := DiffTextLines(tt.from, tt.to); !reflect.DeepEqual(ops, again) {
				t.Fatalf("diff is not deterministic:\nfirst:  %#v\nsecond: %#v", ops, again)
			}
		})
	}
}

func TestDiffTextLinesRandomMatchesLCSLength(t *testing.T) {
	rng := rand.New(rand.NewSource(20261117))
	alphabet := []string{"", "a", "b", "c", "重复"}
	for iteration := 0; iteration < 200; iteration++ {
		a := randomLines(rng, alphabet, rng.Intn(10))
		b := randomLines(rng, alphabet, rng.Intn(10))
		from, to := strings.Join(a, "\n"), strings.Join(b, "\n")
		// splitLines 对空字符串有专门语义；随机切片构造出的空字符串也应走同一入口。
		ops := DiffTextLines(from, to)
		assertValidLineDiff(t, from, to, ops)
	}
}

func TestDiffTextLinesLargeFullReplacementIsNotTruncated(t *testing.T) {
	const size = 1200
	from := make([]string, size)
	to := make([]string, size)
	for i := 0; i < size; i++ {
		from[i] = fmt.Sprintf("old-%04d", i)
		to[i] = fmt.Sprintf("new-%04d", i)
	}

	ops := DiffTextLines(strings.Join(from, "\n"), strings.Join(to, "\n"))
	if len(ops) != 2 || ops[0].Op != "delete" || ops[1].Op != "insert" {
		t.Fatalf("full replacement operations = %d, want one delete and one insert: %#v", len(ops), ops)
	}
	if got := len(strings.Split(ops[0].Text, "\n")); got != size {
		t.Fatalf("deleted lines = %d, want %d", got, size)
	}
	if got := len(strings.Split(ops[1].Text, "\n")); got != size {
		t.Fatalf("inserted lines = %d, want %d", got, size)
	}
	assertValidLineDiff(t, strings.Join(from, "\n"), strings.Join(to, "\n"), ops)
}

// assertValidLineDiff 同时验证三件事：能分别重建源文本和目标文本、操作类型合法、
// equal 行数确实达到 LCS 长度。这样不会把“能还原文本但被截断的非最优 diff”误判为正确。
func assertValidLineDiff(t *testing.T, from, to string, ops []TextOp) {
	t.Helper()
	var gotFrom, gotTo []string
	common := 0
	for _, op := range ops {
		lines := strings.Split(op.Text, "\n")
		switch op.Op {
		case "equal":
			gotFrom = append(gotFrom, lines...)
			gotTo = append(gotTo, lines...)
			common += len(lines)
		case "delete":
			gotFrom = append(gotFrom, lines...)
		case "insert":
			gotTo = append(gotTo, lines...)
		default:
			t.Fatalf("unknown operation %q", op.Op)
		}
	}
	if want := splitLines(from); !reflect.DeepEqual(gotFrom, want) {
		t.Fatalf("source reconstruction = %#v, want %#v", gotFrom, want)
	}
	if want := splitLines(to); !reflect.DeepEqual(gotTo, want) {
		t.Fatalf("target reconstruction = %#v, want %#v", gotTo, want)
	}
	if want := referenceLCSLength(splitLines(from), splitLines(to)); common != want {
		t.Fatalf("common lines = %d, want LCS length %d; ops = %#v", common, want, ops)
	}
}

// referenceLCSLength 仅用于小规模测试。生产代码不能采用这种 O(n*m) 矩阵。
func referenceLCSLength(a, b []string) int {
	dp := make([][]int, len(a)+1)
	for i := range dp {
		dp[i] = make([]int, len(b)+1)
	}
	for i := len(a) - 1; i >= 0; i-- {
		for j := len(b) - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	return dp[0][0]
}

func randomLines(rng *rand.Rand, alphabet []string, n int) []string {
	lines := make([]string, n)
	for i := range lines {
		lines[i] = alphabet[rng.Intn(len(alphabet))]
	}
	return lines
}

func BenchmarkDiffTextLinesLong(b *testing.B) {
	for _, size := range []int{1000, 4000} {
		from := make([]string, size)
		to := make([]string, size)
		for i := 0; i < size; i++ {
			from[i] = fmt.Sprintf("line-%04d", i)
			to[i] = from[i]
			if i%17 == 0 {
				to[i] = fmt.Sprintf("changed-%04d", i)
			}
		}
		fromText, toText := strings.Join(from, "\n"), strings.Join(to, "\n")
		b.Run(fmt.Sprintf("lines_%d", size), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = DiffTextLines(fromText, toText)
			}
		})
	}
}

func BenchmarkDiffTextLinesFullReplacement(b *testing.B) {
	const size = 4000
	from := make([]string, size)
	to := make([]string, size)
	for i := 0; i < size; i++ {
		from[i] = fmt.Sprintf("old-%04d", i)
		to[i] = fmt.Sprintf("new-%04d", i)
	}
	fromText, toText := strings.Join(from, "\n"), strings.Join(to, "\n")
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = DiffTextLines(fromText, toText)
	}
}
