package content

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

// Preferred keys collected first when walking objects.
var preferredKeys = map[string]bool{
	"text": true, "title": true, "prompt": true, "label": true,
	"name": true, "content": true, "description": true,
}

var skipKeys = map[string]bool{
	"dataurl": true, "dataUrl": true, "DataUrl": true,
	"mime": true, "mimetype": true, "mimeType": true,
	"size": true, "color": true, "bgcolor": true, "bgColor": true,
	"fontfamily": true, "fontFamily": true, "fontsize": true, "fontSize": true,
	"fontweight": true, "fontWeight": true, "style": true,
	"pattern": true, "position": true, "kind": true,
	"createdat": true, "createdAt": true, "updatedat": true, "updatedAt": true,
	"schemaversion": true, "schemaVersion": true,
	"id": true, "type": true, "templateid": true, "templateId": true,
	"headrevisionid": true, "headRevisionId": true,
	"contenthash": true, "contentHash": true,
}

var dataURLRe = regexp.MustCompile(`(?i)^data:[^;]+;base64,`)
var urlLikeRe = regexp.MustCompile(`(?i)^https?://`)

const maxURLLen = 200
const maxStringLen = 8000

// Block is one extracted text unit (panel / path scoped).
type Block struct {
	PanelID    string
	PanelTitle string
	BlockPath  string
	Text       string
	SortOrder  int
}

// AttachmentMeta describes an attachment without embedding huge payloads.
type AttachmentMeta struct {
	PanelID   string `json:"panelId"`
	Name      string `json:"name"`
	Mime      string `json:"mime,omitempty"`
	URLOrKind string `json:"urlOrKind"`
}

// ExtractResult is the full extraction from a canvas JSON document.
type ExtractResult struct {
	PlainText   string
	Blocks      []Block
	Attachments []AttachmentMeta
}

// Extract walks JSON and collects searchable / AI-ready text.
func Extract(raw json.RawMessage) ExtractResult {
	var root interface{}
	if err := json.Unmarshal(raw, &root); err != nil || root == nil {
		return ExtractResult{}
	}
	var blocks []Block
	var atts []AttachmentMeta
	var texts []string
	order := 0

	var walk func(v interface{}, path string, panelID, panelTitle string)
	walk = func(v interface{}, path string, panelID, panelTitle string) {
		switch t := v.(type) {
		case map[string]interface{}:
			// Detect panel-ish containers (not leaf items under items[])
			pid, ptitle := panelID, panelTitle
			if id, ok := t["id"].(string); ok && id != "" && isPanelContainer(path, t) {
				pid = id
			}
			if title, ok := asString(t["title"]); ok && title != "" && (ptitle == "" || isPanelContainer(path, t)) {
				ptitle = truncate(title, 255)
			}
			// Attachments array
			if attsRaw, ok := t["attachments"].([]interface{}); ok {
				for _, a := range attsRaw {
					if am, ok := a.(map[string]interface{}); ok {
						atts = append(atts, attachmentFromMap(am, pid))
					}
				}
			}
			// Preferred keys first
			keys := make([]string, 0, len(t))
			for k := range t {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			pref := make([]string, 0)
			rest := make([]string, 0)
			for _, k := range keys {
				lk := strings.ToLower(k)
				if skipKeys[k] || skipKeys[lk] {
					continue
				}
				if preferredKeys[k] || preferredKeys[lk] {
					pref = append(pref, k)
				} else {
					rest = append(rest, k)
				}
			}
			for _, k := range append(pref, rest...) {
				childPath := pathJoin(path, k)
				val := t[k]
				if s, ok := val.(string); ok {
					// Attachment metadata is exported separately; don't pollute plainText.
					if strings.Contains(strings.ToLower(childPath), "attachments/") {
						continue
					}
					if keepString(k, s) {
						texts = append(texts, s)
						blocks = append(blocks, Block{
							PanelID:    pid,
							PanelTitle: ptitle,
							BlockPath:  childPath,
							Text:       s,
							SortOrder:  order,
						})
						order++
					}
					continue
				}
				// items[].text special-case: walk arrays under items
				walk(val, childPath, pid, ptitle)
			}
		case []interface{}:
			for i, item := range t {
				walk(item, pathJoin(path, indexKey(i)), panelID, panelTitle)
			}
		case string:
			if keepString("", t) {
				texts = append(texts, t)
				blocks = append(blocks, Block{
					PanelID:    panelID,
					PanelTitle: panelTitle,
					BlockPath:  path,
					Text:       t,
					SortOrder:  order,
				})
				order++
			}
		}
	}

	walk(root, "", "", "")
	plain := strings.TrimSpace(strings.Join(dedupePreserve(texts), "\n"))
	return ExtractResult{PlainText: plain, Blocks: blocks, Attachments: atts}
}

func looksLikePanelPath(path string) bool {
	p := strings.ToLower(path)
	return strings.Contains(p, "quadrant") ||
		strings.Contains(p, "panel") ||
		strings.Contains(p, "block") ||
		strings.Contains(p, "section") ||
		strings.HasSuffix(p, "cells") ||
		path == "" || path == "root"
}

// isPanelContainer: object under panel-ish path that is NOT an items[] leaf.
func isPanelContainer(path string, m map[string]interface{}) bool {
	if path == "" {
		return true
	}
	p := strings.ToLower(path)
	if strings.Contains(p, "/items/[") || strings.HasSuffix(p, "/items") {
		return false
	}
	if strings.Contains(p, "/attachments/[") || strings.HasSuffix(p, "/attachments") {
		return false
	}
	if strings.Contains(p, "/markers/[") {
		return false
	}
	// map entry under quadrants/panels/blocks/sections
	if looksLikePanelPath(path) {
		_, hasItems := m["items"]
		_, hasTitle := m["title"]
		_, hasText := m["text"]
		// Prefer containers (have items or title without being a pure text leaf)
		if hasItems || (hasTitle && !hasText) || hasTitle {
			return true
		}
		// quadrants/top-left style path segment
		if strings.Contains(p, "quadrants/") || strings.Contains(p, "panels/") ||
			strings.Contains(p, "blocks/") || strings.Contains(p, "sections/") {
			return true
		}
	}
	return false
}

func attachmentFromMap(m map[string]interface{}, panelID string) AttachmentMeta {
	name, _ := asString(m["name"])
	mime, _ := asString(m["mimeType"])
	if mime == "" {
		mime, _ = asString(m["mime"])
	}
	kind, _ := asString(m["kind"])
	url, _ := asString(m["url"])
	urlOrKind := kind
	if url != "" {
		urlOrKind = truncate(url, 256)
	} else if _, ok := m["dataUrl"]; ok {
		urlOrKind = "dataUrl"
	}
	if urlOrKind == "" {
		urlOrKind = "attachment"
	}
	return AttachmentMeta{PanelID: panelID, Name: name, Mime: mime, URLOrKind: urlOrKind}
}

func keepString(key, s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	lk := strings.ToLower(key)
	if lk == "dataurl" || strings.Contains(lk, "dataurl") {
		return false
	}
	if dataURLRe.MatchString(s) {
		return false
	}
	if urlLikeRe.MatchString(s) && len(s) > maxURLLen {
		return false
	}
	if utf8.RuneCountInString(s) > maxStringLen {
		return false
	}
	// skip pure hex / uuid-ish short ids when key is id-like (already skipped)
	return true
}

func asString(v interface{}) (string, bool) {
	s, ok := v.(string)
	if !ok {
		return "", false
	}
	return strings.TrimSpace(s), s != ""
}

func pathJoin(base, key string) string {
	if base == "" {
		return key
	}
	return base + "/" + key
}

func indexKey(i int) string {
	return "[" + itoa(i) + "]"
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [20]byte
	pos := len(b)
	n := i
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		pos--
		b[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func dedupePreserve(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// GroupPanels merges blocks by panel for AI context.
func GroupPanels(blocks []Block) []map[string]string {
	type acc struct {
		title string
		parts []string
	}
	order := make([]string, 0)
	m := map[string]*acc{}
	for _, b := range blocks {
		key := b.PanelID
		if key == "" {
			key = b.BlockPath
		}
		if key == "" {
			key = "_root"
		}
		a, ok := m[key]
		if !ok {
			a = &acc{title: b.PanelTitle}
			m[key] = a
			order = append(order, key)
		}
		if a.title == "" && b.PanelTitle != "" {
			a.title = b.PanelTitle
		}
		a.parts = append(a.parts, b.Text)
	}
	out := make([]map[string]string, 0, len(order))
	for _, k := range order {
		a := m[k]
		out = append(out, map[string]string{
			"panelId": k,
			"title":   a.title,
			"text":    strings.Join(dedupePreserve(a.parts), "\n"),
		})
	}
	return out
}

// SummaryN returns the first n runes of plain text.
func SummaryN(plain string, n int) string {
	r := []rune(strings.TrimSpace(plain))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n]) + "…"
}
