package content

import "testing"

func TestResolveCommentAnchorByQuoteAndOffset(t *testing.T) {
	blocks := []Block{
		{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Text: "hello 世界"},
		{ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Text: "下一块"},
	}
	id, off, ok := ResolveCommentAnchor(blocks, "世界", -1)
	if !ok || id != blocks[0].ID || off != 6 {
		t.Fatalf("quote = %s %d %v", id, off, ok)
	}
	id, off, ok = ResolveCommentAnchor(blocks, "", 9)
	if !ok || id != blocks[1].ID || off != 1 {
		t.Fatalf("offset = %s %d %v", id, off, ok)
	}
	if _, _, ok := ResolveCommentAnchor(blocks, "没有", -1); ok {
		t.Fatal("unmatched quote should degrade")
	}
}

func TestResolveCommentAnchorPrefersClosestDuplicateQuote(t *testing.T) {
	blocks := []Block{
		{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Text: "foo note foo"},
		{ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Text: "foo later"},
	}
	// "foo" 出现三次：偏移 0、9、13。靠近 9 的应落在第一块 offset 9。
	id, off, ok := ResolveCommentAnchor(blocks, "foo", 9)
	if !ok || id != blocks[0].ID || off != 9 {
		t.Fatalf("closest = %s %d %v", id, off, ok)
	}
	id, off, ok = ResolveCommentAnchor(blocks, "foo", 13)
	if !ok || id != blocks[1].ID || off != 0 {
		t.Fatalf("second block = %s %d %v", id, off, ok)
	}
}

func TestMapCommentAnchorFollowsInsertAndDropsDeletedQuote(t *testing.T) {
	off, ok := MapCommentAnchor("hello 世界", "ABC hello 世界", "世界", 6)
	if !ok || off != 10 {
		t.Fatalf("insert = %d %v", off, ok)
	}
	if _, ok := MapCommentAnchor("hello 世界", "hello", "世界", 6); ok {
		t.Fatal("deleted quote should not map")
	}
	off, ok = MapCommentAnchor("hello 世界", "hello 世界！！", "", 6)
	if !ok || off != 6 {
		t.Fatalf("suffix append without quote = %d %v", off, ok)
	}
}
