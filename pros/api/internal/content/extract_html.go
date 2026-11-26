package content

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

// D3：v1 只抽顶层身份块，以及 callout / toggle / column / tabPane / timelineItem 的一级子块。
// 更深的嵌套本轮不进入派生表。

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

var voidTags = map[string]bool{
	"area": true, "base": true, "br": true, "col": true, "embed": true,
	"hr": true, "img": true, "input": true, "link": true, "meta": true,
	"param": true, "source": true, "track": true, "wbr": true,
}

var tagBlockTypes = map[string]string{
	"p": "paragraph", "blockquote": "blockquote", "pre": "codeBlock",
	"ul": "bulletList", "ol": "orderedList", "table": "table",
	"hr": "horizontalRule", "img": "image", "h1": "heading", "h2": "heading",
	"h3": "heading", "h4": "heading", "h5": "heading", "h6": "heading",
}

var dataTypeAliases = map[string]string{
	"toggle-block":  "toggleBlock",
	"timeline-item": "timelineItem",
	"tab-pane":      "tabPane",
	"tabs-block":    "tabsBlock",
}

const maxDocBlockText = 8000

type htmlElem struct {
	tag      string
	attrs    map[string]string
	children []*htmlElem
	text     string
}

// ExtractDocBlocks 从 current_data 的 html 字段抽 B2 块。画布 JSON（无 html）返回空，不另写 Y.Doc 路径。
func ExtractDocBlocks(raw json.RawMessage) []Block {
	if len(raw) == 0 {
		return nil
	}
	var body struct {
		HTML string `json:"html"`
	}
	if err := json.Unmarshal(raw, &body); err != nil || strings.TrimSpace(body.HTML) == "" {
		return nil
	}
	return ExtractHTMLBlocks(body.HTML)
}

// ExtractHTMLBlocks 按 data-block-id 抽取顶层 + 一级嵌套块。没有合法 ID 的节点不入库，以免每次保存新生身份。
func ExtractHTMLBlocks(html string) []Block {
	roots := parseHTMLFragment(html)
	var out []Block
	collectDocBlocks(roots, nil, &out)
	for i := range out {
		out[i].SortOrder = i
	}
	return out
}

func collectDocBlocks(nodes []*htmlElem, ancestorIDs []string, out *[]Block) {
	for _, n := range nodes {
		if n == nil || n.tag == "" {
			continue
		}
		id := strings.TrimSpace(n.attrs["data-block-id"])
		if isBlockID(id) {
			depth := len(ancestorIDs)
			if depth <= 1 {
				parent := ""
				if depth > 0 {
					parent = ancestorIDs[len(ancestorIDs)-1]
				}
				*out = append(*out, Block{
					ID:        id,
					ParentID:  parent,
					Type:      blockTypeOf(n),
					Depth:     depth,
					Text:      truncate(innerText(n), maxDocBlockText),
					Attrs:     blockAttrs(n),
					AnchorKey: blockAnchorKey(n, id),
				})
			}
			next := append(append([]string{}, ancestorIDs...), id)
			collectDocBlocks(n.children, next, out)
			continue
		}
		collectDocBlocks(n.children, ancestorIDs, out)
	}
}

func isBlockID(id string) bool {
	return uuidPattern.MatchString(id)
}

func blockAnchorKey(n *htmlElem, blockID string) string {
	for _, key := range []string{"id", "data-xref-id", "data-bookmark-id"} {
		v := strings.TrimSpace(n.attrs[key])
		if v == "" || strings.EqualFold(v, blockID) {
			continue
		}
		return v
	}
	return ""
}

// BlockRef 是 HTML 里扫描到的一块引用（交叉引用 / mention / 画布嵌入）。
type BlockRef struct {
	SourceID  string
	TargetKey string
	RefType   string
	Label     string
	Lost      bool
}

// ExtractDocBlockRefs 从 current_data.html 抽块级引用。
func ExtractDocBlockRefs(raw json.RawMessage) []BlockRef {
	if len(raw) == 0 {
		return nil
	}
	var body struct {
		HTML string `json:"html"`
	}
	if err := json.Unmarshal(raw, &body); err != nil || strings.TrimSpace(body.HTML) == "" {
		return nil
	}
	return ExtractHTMLBlockRefs(body.HTML)
}

// ExtractHTMLBlockRefs 按最近祖先 data-block-id 记录引用源。
func ExtractHTMLBlockRefs(html string) []BlockRef {
	var out []BlockRef
	walkBlockRefs(parseHTMLFragment(html), "", &out)
	return out
}

func walkBlockRefs(nodes []*htmlElem, source string, out *[]BlockRef) {
	for _, n := range nodes {
		if n == nil {
			continue
		}
		next := source
		if id := strings.TrimSpace(n.attrs["data-block-id"]); isBlockID(id) {
			next = id
		}
		dt := strings.TrimSpace(n.attrs["data-type"])
		switch dt {
		case "cross-ref", "crossRef":
			*out = append(*out, BlockRef{
				SourceID:  next,
				TargetKey: firstAttr(n, "data-target", "data-id"),
				RefType:   "crossref",
				Label:     firstNonEmpty(strings.TrimSpace(n.attrs["data-label"]), innerText(n)),
				Lost:      n.attrs["data-lost"] == "true",
			})
		case "mention":
			*out = append(*out, BlockRef{
				SourceID:  next,
				TargetKey: strings.TrimSpace(n.attrs["data-id"]),
				RefType:   "mention",
				Label:     innerText(n),
			})
		case "canvasEmbed":
			*out = append(*out, BlockRef{
				SourceID:  next,
				TargetKey: firstAttr(n, "data-doc-id", "data-id"),
				RefType:   "embed",
			})
		}
		walkBlockRefs(n.children, next, out)
	}
}

func firstAttr(n *htmlElem, keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(n.attrs[k]); v != "" {
			return v
		}
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func blockTypeOf(n *htmlElem) string {
	if dt := strings.TrimSpace(n.attrs["data-type"]); dt != "" {
		if alias, ok := dataTypeAliases[dt]; ok {
			return alias
		}
		return dt
	}
	tag := strings.ToLower(n.tag)
	if typ, ok := tagBlockTypes[tag]; ok {
		return typ
	}
	if typ, ok := tagBlockTypes[strings.ToLower(strings.TrimSpace(n.tag))]; ok {
		return typ
	}
	if tag == "" {
		return "unknown"
	}
	return tag
}

func blockAttrs(n *htmlElem) map[string]string {
	out := map[string]string{}
	tag := strings.ToLower(n.tag)
	if strings.HasPrefix(tag, "h") && len(tag) == 2 && tag[1] >= '1' && tag[1] <= '6' {
		out["level"] = tag[1:]
	}
	for k, v := range n.attrs {
		lk := strings.ToLower(k)
		if lk == "data-block-id" || lk == "class" || lk == "style" {
			continue
		}
		if strings.HasPrefix(lk, "data-") || lk == "id" || lk == "alt" || lk == "src" || lk == "href" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func innerText(n *htmlElem) string {
	if n == nil {
		return ""
	}
	if n.tag == "" {
		return n.text
	}
	var b strings.Builder
	for _, c := range n.children {
		t := strings.TrimSpace(innerText(c))
		if t == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(t)
	}
	return b.String()
}

func parseHTMLFragment(s string) []*htmlElem {
	p := htmlParser{s: s}
	return p.readChildren("")
}

type htmlParser struct {
	s string
	i int
}

func (p *htmlParser) readChildren(untilTag string) []*htmlElem {
	var out []*htmlElem
	for p.i < len(p.s) {
		if p.s[p.i] != '<' {
			text := p.readText()
			if text != "" {
				out = append(out, &htmlElem{text: text})
			}
			continue
		}
		if strings.HasPrefix(p.s[p.i:], "<!--") {
			p.skipUntil("-->")
			continue
		}
		if strings.HasPrefix(p.s[p.i:], "<!") {
			p.skipUntil(">")
			continue
		}
		if strings.HasPrefix(p.s[p.i:], "</") {
			tag, ok := p.readCloseTag()
			if ok && untilTag != "" && strings.EqualFold(tag, untilTag) {
				return out
			}
			// 多余的结束标签忽略。
			continue
		}
		el, closed := p.readOpenTag()
		if el == nil {
			p.i++
			continue
		}
		if !closed && !voidTags[el.tag] {
			el.children = p.readChildren(el.tag)
		}
		out = append(out, el)
	}
	return out
}

func (p *htmlParser) readText() string {
	start := p.i
	for p.i < len(p.s) && p.s[p.i] != '<' {
		p.i++
	}
	return collapseWS(unescapeHTML(p.s[start:p.i]))
}

func (p *htmlParser) readOpenTag() (*htmlElem, bool) {
	if p.i >= len(p.s) || p.s[p.i] != '<' {
		return nil, false
	}
	p.i++
	p.skipSpace()
	tag := p.readName()
	if tag == "" {
		return nil, false
	}
	tag = strings.ToLower(tag)
	attrs := map[string]string{}
	for {
		p.skipSpace()
		if p.i >= len(p.s) {
			break
		}
		if p.s[p.i] == '>' {
			p.i++
			return &htmlElem{tag: tag, attrs: attrs}, false
		}
		if p.s[p.i] == '/' && p.i+1 < len(p.s) && p.s[p.i+1] == '>' {
			p.i += 2
			return &htmlElem{tag: tag, attrs: attrs}, true
		}
		name := p.readName()
		if name == "" {
			p.i++
			continue
		}
		p.skipSpace()
		val := ""
		if p.i < len(p.s) && p.s[p.i] == '=' {
			p.i++
			p.skipSpace()
			val = p.readAttrValue()
		}
		attrs[strings.ToLower(name)] = val
	}
	return &htmlElem{tag: tag, attrs: attrs}, false
}

func (p *htmlParser) readCloseTag() (string, bool) {
	if !strings.HasPrefix(p.s[p.i:], "</") {
		return "", false
	}
	p.i += 2
	p.skipSpace()
	tag := strings.ToLower(p.readName())
	p.skipUntil(">")
	return tag, tag != ""
}

func (p *htmlParser) readName() string {
	start := p.i
	for p.i < len(p.s) {
		c := p.s[p.i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == ':' || c == '_' {
			p.i++
			continue
		}
		break
	}
	return p.s[start:p.i]
}

func (p *htmlParser) readAttrValue() string {
	if p.i >= len(p.s) {
		return ""
	}
	q := p.s[p.i]
	if q == '"' || q == '\'' {
		p.i++
		start := p.i
		for p.i < len(p.s) && p.s[p.i] != q {
			p.i++
		}
		val := p.s[start:p.i]
		if p.i < len(p.s) {
			p.i++
		}
		return unescapeHTML(val)
	}
	start := p.i
	for p.i < len(p.s) && !unicode.IsSpace(rune(p.s[p.i])) && p.s[p.i] != '>' && p.s[p.i] != '/' {
		p.i++
	}
	return unescapeHTML(p.s[start:p.i])
}

func (p *htmlParser) skipSpace() {
	for p.i < len(p.s) && unicode.IsSpace(rune(p.s[p.i])) {
		p.i++
	}
}

func (p *htmlParser) skipUntil(token string) {
	if idx := strings.Index(p.s[p.i:], token); idx >= 0 {
		p.i += idx + len(token)
		return
	}
	p.i = len(p.s)
}

func collapseWS(s string) string {
	return strings.TrimSpace(strings.Join(strings.Fields(s), " "))
}

func unescapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", `"`)
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	return s
}
