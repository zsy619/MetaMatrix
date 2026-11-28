package base

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// TestMultiFieldSortAndGroupDoesNotFail 回归「多字段排序 / 分组直接 500」。
//
// 旧实现把所有分组 JOIN 命名成 gv、所有排序 JOIN 命名成 sv，
// 加第 2 条排序 / 分组时 Postgres 报
// `table name "sv" specified more than once`（SQLSTATE 42712），整个查询 500。
// 前端明确支持多条（MAX_SORTS=5 / MAX_GROUPS=3），所以这是真实故障。
//
// 本用例同时验证：
//   - 2 条排序 + 2 条分组不再报错；
//   - 排序结果**顺序正确** —— JOIN 别名改了但 ORDER BY 没跟着改的话，
//     排序会静默失效，所以每种组合都断言确切顺序。
//
// 排序语义（实现约定）：**分组在前、排序在后**，
// 即 GROUP BY 决定行分组次序，SORT 决定组内次序。
func TestMultiFieldSortAndGroupDoesNotFail(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	// 第三个字段：分组 / 排序分别落在不同字段上，
	// 任何一侧的别名写错都会让顺序偏掉。
	metaC, err := f.svc.CreateField(ctx, f.userA, f.projectID, f.tableID, FieldInput{Name: "字段C", Type: "text"})
	if err != nil {
		t.Fatalf("创建字段 C 失败：%v", err)
	}
	fieldC := uuid.MustParse(metaC.ID)

	mk := func(a, b, c string) uuid.UUID {
		row, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{
				f.fieldA.String(): a,
				f.fieldB.String(): b,
				fieldC.String():   c,
			},
		})
		if err != nil {
			t.Fatalf("创建记录失败：%v", err)
		}
		return row.ID
	}
	r1 := mk("A1", "B1", "C1")
	r2 := mk("A1", "B2", "C2")
	r3 := mk("A0", "B3", "C3")

	cases := []struct {
		name   string
		sorts  []SortRule
		groups []GroupRule
		want   []uuid.UUID
	}{
		{
			name:  "单排序",
			sorts: []SortRule{{FieldID: fieldC.String(), Order: "desc"}},
			want:  []uuid.UUID{r3, r2, r1},
		},
		{
			name: "双排序（曾 500）",
			sorts: []SortRule{
				{FieldID: f.fieldA.String(), Order: "asc"},
				{FieldID: fieldC.String(), Order: "desc"},
			},
			want: []uuid.UUID{r3, r2, r1},
		},
		{
			// 分组定组间次序（A 升序），排序定组内次序（C 降序 → r2 在 r1 前）。
			name:   "单分组 + 双排序（曾 500）",
			sorts:  []SortRule{{FieldID: fieldC.String(), Order: "desc"}, {FieldID: f.fieldB.String(), Order: "asc"}},
			groups: []GroupRule{{FieldID: f.fieldA.String(), Order: "asc"}},
			want:   []uuid.UUID{r3, r2, r1},
		},
		{
			// 双分组：分组列本身决定顺序（A 升 → C 升 → r3, r1, r2）。
			name:   "双分组 + 单排序（曾 500）",
			sorts:  []SortRule{{FieldID: f.fieldB.String(), Order: "desc"}},
			groups: []GroupRule{{FieldID: f.fieldA.String(), Order: "asc"}, {FieldID: fieldC.String(), Order: "asc"}},
			want:   []uuid.UUID{r3, r1, r2},
		},
		{
			name:   "仅双分组",
			groups: []GroupRule{{FieldID: f.fieldA.String(), Order: "asc"}, {FieldID: fieldC.String(), Order: "asc"}},
			want:   []uuid.UUID{r3, r1, r2},
		},
	}

	for _, c := range cases {
		res, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
			TableID: f.tableID.String(), PageSize: 50, Sorts: c.sorts, Groups: c.groups,
		})
		if err != nil {
			t.Fatalf("%s 查询失败（旧实现会报 42712 / 500）：%v", c.name, err)
		}
		if res.Total != 3 || len(res.Records) != 3 {
			t.Fatalf("%s 应返回 3 条，实际 total=%d rows=%d", c.name, res.Total, len(res.Records))
		}
		got := []uuid.UUID{res.Records[0].ID, res.Records[1].ID, res.Records[2].ID}
		for i := range c.want {
			if got[i] != c.want[i] {
				t.Fatalf("%s 第 %d 条顺序不对：got=%v want=%v", c.name, i, got, c.want)
			}
		}
	}
}
