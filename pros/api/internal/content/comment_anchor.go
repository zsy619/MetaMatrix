package content

import (
	"strings"
	"unicode/utf8"
)

// ResolveCommentAnchor 把旧的原文片段 / 正文字符偏移映射到块 ID 与块内偏移。
// 对不上时 ok=false，调用方应保留旧 Anchor/Quote 作为降级路径。
func ResolveCommentAnchor(blocks []Block, quote string, anchorFrom int) (blockID string, offset int, ok bool) {
	q := strings.TrimSpace(quote)
	if q != "" {
		for _, b := range blocks {
			idx := strings.Index(b.Text, q)
			if idx < 0 {
				continue
			}
			return b.ID, utf8.RuneCountInString(b.Text[:idx]), true
		}
	}
	if anchorFrom < 0 {
		return "", -1, false
	}
	cursor := 0
	for _, b := range blocks {
		n := utf8.RuneCountInString(b.Text)
		if anchorFrom < cursor+n || (n == 0 && anchorFrom == cursor) {
			off := anchorFrom - cursor
			if off < 0 {
				off = 0
			}
			if off > n {
				off = n
			}
			return b.ID, off, true
		}
		cursor += n
	}
	return "", -1, false
}
