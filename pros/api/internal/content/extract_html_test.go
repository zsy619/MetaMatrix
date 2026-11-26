package content

import (
	"encoding/json"
	"testing"
)

func TestExtractHTMLBlocksTopLevelAndOneNest(t *testing.T) {
	html := `
<p data-block-id="11111111-1111-4111-8111-111111111111">Hello</p>
<div data-type="callout" data-block-id="22222222-2222-4222-8222-222222222222" data-variant="info">
  <p data-block-id="33333333-3333-4333-8333-333333333333">Nested</p>
  <div data-type="callout" data-block-id="44444444-4444-4444-8444-444444444444">
    <p data-block-id="55555555-5555-4555-8555-555555555555">Too deep</p>
  </div>
</div>
<div data-type="columns" data-block-id="66666666-6666-4666-8666-666666666666">
  <div data-type="column">
    <p data-block-id="77777777-7777-4777-8777-777777777777">Col</p>
  </div>
</div>
<div data-type="toggle-block" data-block-id="88888888-8888-4888-8888-888888888888">
  <p data-block-id="99999999-9999-4999-8999-999999999999">Toggle child</p>
</div>`

	blocks := ExtractHTMLBlocks(html)
	ids := make([]string, 0, len(blocks))
	byID := map[string]Block{}
	for _, b := range blocks {
		ids = append(ids, b.ID)
		byID[b.ID] = b
	}
	if _, ok := byID["55555555-5555-4555-8555-555555555555"]; ok {
		t.Fatalf("depth-2 child must be skipped, got ids=%v", ids)
	}
	want := []string{
		"11111111-1111-4111-8111-111111111111",
		"22222222-2222-4222-8222-222222222222",
		"33333333-3333-4333-8333-333333333333",
		"44444444-4444-4444-8444-444444444444",
		"66666666-6666-4666-8666-666666666666",
		"77777777-7777-4777-8777-777777777777",
		"88888888-8888-4888-8888-888888888888",
		"99999999-9999-4999-8999-999999999999",
	}
	if len(ids) != len(want) {
		t.Fatalf("ids = %v, want %v", ids, want)
	}
	for i, id := range want {
		if ids[i] != id {
			t.Fatalf("ids[%d] = %s, want %s (all=%v)", i, ids[i], id, ids)
		}
	}
	hello := byID["11111111-1111-4111-8111-111111111111"]
	if hello.Type != "paragraph" || hello.Depth != 0 || hello.ParentID != "" || hello.Text != "Hello" {
		t.Fatalf("hello = %+v", hello)
	}
	nested := byID["33333333-3333-4333-8333-333333333333"]
	if nested.Depth != 1 || nested.ParentID != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("nested = %+v", nested)
	}
	col := byID["77777777-7777-4777-8777-777777777777"]
	if col.Depth != 1 || col.ParentID != "66666666-6666-4666-8666-666666666666" || col.Text != "Col" {
		t.Fatalf("col = %+v", col)
	}
	callout := byID["22222222-2222-4222-8222-222222222222"]
	if callout.Type != "callout" || callout.Attrs["data-variant"] != "info" {
		t.Fatalf("callout = %+v", callout)
	}
	tog := byID["88888888-8888-4888-8888-888888888888"]
	if tog.Type != "toggleBlock" {
		t.Fatalf("toggle type = %q", tog.Type)
	}
}

func TestExtractDocBlocksReadsHTMLFieldOnly(t *testing.T) {
	raw, _ := json.Marshal(map[string]string{
		"type": "doc",
		"html": `<h2 data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">Title</h2>`,
	})
	blocks := ExtractDocBlocks(raw)
	if len(blocks) != 1 || blocks[0].Type != "heading" || blocks[0].Attrs["level"] != "2" {
		t.Fatalf("blocks = %+v", blocks)
	}
	canvas, _ := json.Marshal(map[string]interface{}{
		"type": "dual-triangle", "sections": []any{},
	})
	if got := ExtractDocBlocks(canvas); len(got) != 0 {
		t.Fatalf("canvas should not yield doc blocks, got %+v", got)
	}
}

func TestExtractHTMLBlocksSkipsNodesWithoutBlockID(t *testing.T) {
	html := `<p>no id</p><p data-block-id="not-a-uuid">bad</p><p data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">ok</p>`
	blocks := ExtractHTMLBlocks(html)
	if len(blocks) != 1 || blocks[0].Text != "ok" {
		t.Fatalf("blocks = %+v", blocks)
	}
}

func TestExtractHTMLBlocksKeepsLegacyAnchorKey(t *testing.T) {
	html := `<h2 id="h-intro" data-block-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">引言</h2>` +
		`<img data-block-id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" data-xref-id="fig-2" alt="图">`
	blocks := ExtractHTMLBlocks(html)
	if len(blocks) != 2 {
		t.Fatalf("blocks = %d, want 2", len(blocks))
	}
	if blocks[0].AnchorKey != "h-intro" || blocks[0].Type != "heading" {
		t.Fatalf("heading = %+v", blocks[0])
	}
	if blocks[1].AnchorKey != "fig-2" || blocks[1].Type != "image" {
		t.Fatalf("image = %+v", blocks[1])
	}
}

func TestExtractHTMLBlockRefsCapturesSourceAndTarget(t *testing.T) {
	src := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	dst := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	html := `<p data-block-id="` + src + `">见<span data-type="cross-ref" data-target="` + dst + `" data-label="§ 目标">§ 目标</span></p>` +
		`<h2 id="h-old" data-block-id="` + dst + `">目标</h2>`
	refs := ExtractHTMLBlockRefs(html)
	if len(refs) != 1 {
		t.Fatalf("refs = %#v", refs)
	}
	if refs[0].SourceID != src || refs[0].TargetKey != dst || refs[0].RefType != "crossref" || refs[0].Lost {
		t.Fatalf("ref = %+v", refs[0])
	}
}
