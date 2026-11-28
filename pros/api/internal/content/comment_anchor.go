package content

import (
	"strings"
	"unicode/utf8"
)

type quoteHit struct {
	blockID string
	offset  int
	docOff  int
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func quoteIndexes(s, q string) []int {
	if q == "" {
		return nil
	}
	var out []int
	start := 0
	for start <= len(s) {
		i := strings.Index(s[start:], q)
		if i < 0 {
			return out
		}
		abs := start + i
		out = append(out, abs)
		start = abs + 1
	}
	return out
}

func collectQuoteHits(blocks []Block, q string) []quoteHit {
	var hits []quoteHit
	cursor := 0
	for _, b := range blocks {
		n := utf8.RuneCountInString(b.Text)
		for _, idx := range quoteIndexes(b.Text, q) {
			off := utf8.RuneCountInString(b.Text[:idx])
			hits = append(hits, quoteHit{blockID: b.ID, offset: off, docOff: cursor + off})
		}
		cursor += n
	}
	return hits
}

func pickClosestHit(hits []quoteHit, hint int) quoteHit {
	best := hits[0]
	bestDist := absInt(best.docOff - hint)
	for _, h := range hits[1:] {
		d := absInt(h.docOff - hint)
		if d < bestDist {
			best, bestDist = h, d
		}
	}
	return best
}

// ResolveCommentAnchor 把旧的原文片段 / 正文字符偏移映射到块 ID 与块内偏移。
// 引用出现多次时，优先选离 anchorFrom 最近的一次；对不上时 ok=false，调用方应保留旧 Anchor/Quote 作为降级路径。
func ResolveCommentAnchor(blocks []Block, quote string, anchorFrom int) (blockID string, offset int, ok bool) {
	q := strings.TrimSpace(quote)
	if q != "" {
		hits := collectQuoteHits(blocks, q)
		switch len(hits) {
		case 0:
			// 引用对不上时再走文档级偏移。
		case 1:
			return hits[0].blockID, hits[0].offset, true
		default:
			if anchorFrom >= 0 {
				hit := pickClosestHit(hits, anchorFrom)
				return hit.blockID, hit.offset, true
			}
			return hits[0].blockID, hits[0].offset, true
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

// MapCommentAnchor 在同一块正文改写后重算块内偏移。优先用唯一/最接近的引用，其次用前后缀对齐；引用被删掉且对不齐时 ok=false。
func MapCommentAnchor(oldText, newText, quote string, oldOffset int) (offset int, ok bool) {
	mapped, mappedOK := mapRuneOffset(oldText, newText, oldOffset)
	q := strings.TrimSpace(quote)
	if q != "" {
		idxs := quoteIndexes(newText, q)
		if len(idxs) == 1 {
			return utf8.RuneCountInString(newText[:idxs[0]]), true
		}
		if len(idxs) > 1 {
			hint := oldOffset
			if mappedOK {
				hint = mapped
			}
			best := idxs[0]
			bestOff := utf8.RuneCountInString(newText[:best])
			bestDist := absInt(bestOff - hint)
			for _, idx := range idxs[1:] {
				off := utf8.RuneCountInString(newText[:idx])
				d := absInt(off - hint)
				if d < bestDist {
					best, bestOff, bestDist = idx, off, d
				}
			}
			return bestOff, true
		}
		return 0, false
	}
	return mapped, mappedOK
}

func mapRuneOffset(oldText, newText string, off int) (int, bool) {
	oldR := []rune(oldText)
	newR := []rune(newText)
	if off < 0 {
		return 0, false
	}
	if off > len(oldR) {
		off = len(oldR)
	}
	prefix := 0
	for prefix < len(oldR) && prefix < len(newR) && oldR[prefix] == newR[prefix] {
		prefix++
	}
	suffix := 0
	for suffix < len(oldR)-prefix && suffix < len(newR)-prefix &&
		oldR[len(oldR)-1-suffix] == newR[len(newR)-1-suffix] {
		suffix++
	}
	if off <= prefix {
		return off, true
	}
	fromEnd := len(oldR) - off
	if fromEnd <= suffix {
		return len(newR) - fromEnd, true
	}
	return 0, false
}
