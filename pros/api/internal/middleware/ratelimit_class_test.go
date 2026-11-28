package middleware

import "testing"

// TestPathClassNormalizesResourceIDs 回归「限流维度」。
//
// 限流键原本用**完整路径**，路径里带表 ID / 记录 ID，
// 换一条记录就是新令牌桶 → 限流形同虚设。
// 归一化后同一类接口共用一个桶。
func TestPathClassNormalizesResourceIDs(t *testing.T) {
	a := PathClass("/projects/p1/base/tables/8f14e45f-ceea-167a-5a36-dedd4bea2543/records")
	b := PathClass("/projects/p1/base/tables/9a1b2c3d-4e5f-6789-abcd-ef0123456789/records")
	if a != b {
		t.Fatalf("同一类接口应归一化成同一个类别：%s vs %s", a, b)
	}
	if a != "/projects/p1/base/tables/:id/records" {
		t.Fatalf("归一化结果不对：%s", a)
	}
	// 不同接口类别不能混在一起。
	c := PathClass("/projects/p1/base/tables/8f14e45f-ceea-167a-5a36-dedd4bea2543")
	if c == a {
		t.Fatalf("不同接口类别不应归一成同一类：%s", c)
	}
	// 非 ID 段不能被误替换。
	d := PathClass("/projects/p1/base/tables")
	if d != "/projects/p1/base/tables" {
		t.Fatalf("非 ID 段被误替换：%s", d)
	}
}
