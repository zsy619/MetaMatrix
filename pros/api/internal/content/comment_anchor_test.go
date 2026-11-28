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
