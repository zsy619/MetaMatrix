package base

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// D1：keyset 游标翻页 —— 数据量不变时，越往后翻耗时不应线性增长，
// 且不能漏行 / 重复行；旧版 offset 游标仍要能用。
func TestKeysetCursorPaginatesWithoutDuplicates(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()

	// 造 25 条记录。
	for i := 0; i < 25; i++ {
		if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "v"},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}
	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		res, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
			TableID:  f.tableID.String(),
			PageSize: 10,
			Cursor:   cursor,
		})
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		pages++
		if pages > 10 {
			t.Fatal("分页没有终止")
		}
		for _, r := range res.Records {
			if seen[r.ID.String()] {
				t.Fatalf("keyset 翻页出现重复记录：%s", r.ID)
			}
			seen[r.ID.String()] = true
		}
		if !res.Page.HasMore || res.Page.NextCursor == "" {
			break
		}
		cursor = res.Page.NextCursor
	}
	if len(seen) != 25 {
		t.Fatalf("keyset 翻页应取到 25 条，实际 %d", len(seen))
	}
	if pages != 3 {
		t.Fatalf("25 条 / 每页 10 条应翻 3 页，实际 %d", pages)
	}
}

// 旧格式游标（offset）必须继续可用，保证老客户端不被打断。
func TestLegacyOffsetCursorStillWorks(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "v"},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}
	legacy := encodeCursor(3)
	res, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID:  f.tableID.String(),
		PageSize: 10,
		Cursor:   legacy,
	})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if len(res.Records) != 2 {
		t.Fatalf("旧游标应返回剩余 2 条，实际 %d", len(res.Records))
	}
	if res.Page.Offset != 3 {
		t.Fatalf("旧游标应回报 offset=3，实际 %d", res.Page.Offset)
	}
}

// 非法游标必须报错，而不是静默从头开始。
func TestInvalidCursorRejected(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	if _, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID: f.tableID.String(),
		Cursor:  "not-a-cursor",
	}); err == nil {
		t.Fatal("非法游标应报错")
	}
}

// keyset 游标编码格式必须自洽（能解码回锚点）。
func TestKeysetCursorRoundTrip(t *testing.T) {
	id := uuid.New()
	cursor := encodeKeysetCursor(42, id)
	cur, err := decodeCursor(cursor)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if !cur.keyset || cur.sortOrder != 42 || cur.id != id {
		t.Fatalf("keyset 游标往返不一致：%+v", cur)
	}
}

// D1 回归：首页必须直接返回 keyset 游标。
//
// 之前的实现只在「收到的游标本身是 keyset」时才进入 keyset 模式，
// 于是首页永远只能吐出旧格式的 `o:<n>` 游标，客户端下一页拿到的仍是
// offset 游标 —— keyset 分支形同虚设，深翻页依旧全表扫描。
func TestFirstPageReturnsKeysetCursor(t *testing.T) {
	f := newConcFixture(t)
	ctx := context.Background()
	for i := 0; i < 25; i++ {
		if _, err := f.svc.CreateRecord(ctx, f.userA, f.projectID, f.tableID, RecordInput{
			Fields: map[string]any{f.fieldA.String(): "v"},
		}); err != nil {
			t.Fatalf("create record failed: %v", err)
		}
	}
	// 首页（不带游标）就应该拿到 keyset 游标。
	first, err := f.svc.Query(ctx, f.userA, f.projectID, QueryRequest{
		TableID:  f.tableID.String(),
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("first page query failed: %v", err)
	}
	if !first.Page.HasMore {
		t.Fatal("首页应报告还有下一页")
	}
	cur, err := decodeCursor(first.Page.NextCursor)
	if err != nil {
		t.Fatalf("首页游标无法解析：%v", err)
	}
	if !cur.keyset {
		t.Fatal("首页应返回 keyset 游标，否则 keyset 分支永远走不到")
	}
	if first.Page.Offset != -1 {
		t.Fatalf("keyset 模式不应报告绝对偏移量，实际 %d", first.Page.Offset)
	}
}
