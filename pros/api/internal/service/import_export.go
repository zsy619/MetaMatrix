package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

// ValidateCanvasImport checks a canvas JSON object before it is stored.
// It does not invent fields. Invalid documents return ErrValidation or ErrPayloadTooLarge.
func ValidateCanvasImport(data []byte) error {
	if err := validatePayload(data); err != nil {
		return err
	}
	if len(data) == 0 || string(data) == "null" {
		return ErrValidation
	}
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return ErrValidation
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return ErrValidation
	}
	typ, _ := obj["type"].(string)
	typ = strings.TrimSpace(typ)
	if typ == "" || utf8.RuneCountInString(typ) > maxTypeRunes {
		return ErrValidation
	}
	switch sv := obj["schemaVersion"].(type) {
	case nil:
		return nil
	case float64:
		if sv < 1 || sv > 100 || sv != float64(int(sv)) {
			return ErrValidation
		}
	default:
		return ErrValidation
	}
	return nil
}

// CanvasMarkdown renders a readable export from the stored JSON.
// Only string fields that are already in the document are included.
func CanvasMarkdown(title string, data []byte) (string, error) {
	if err := ValidateCanvasImport(data); err != nil {
		return "", err
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return "", ErrValidation
	}
	var b strings.Builder
	name := strings.TrimSpace(title)
	if name == "" {
		if id, ok := obj["id"].(string); ok {
			name = strings.TrimSpace(id)
		}
	}
	if name == "" {
		name = "未命名画布"
	}
	fmt.Fprintf(&b, "# %s\n\n", name)
	if typ, ok := obj["type"].(string); ok && typ != "" {
		fmt.Fprintf(&b, "类型：%s\n\n", typ)
	}
	writeMarkdownValue(&b, obj, 2)
	return strings.TrimSpace(b.String()) + "\n", nil
}

func writeMarkdownValue(b *strings.Builder, v any, depth int) {
	if depth > 6 {
		return
	}
	switch val := v.(type) {
	case map[string]any:
		if text, ok := val["text"].(string); ok && strings.TrimSpace(stripTags(text)) != "" {
			fmt.Fprintf(b, "%s\n\n", strings.TrimSpace(stripTags(text)))
		}
		if title, ok := val["title"].(string); ok && strings.TrimSpace(title) != "" && depth <= 4 {
			fmt.Fprintf(b, "%s %s\n\n", strings.Repeat("#", depth), strings.TrimSpace(stripTags(title)))
		}
		for _, key := range []string{"formulaText", "notes", "keyword"} {
			if s, ok := val[key].(string); ok && strings.TrimSpace(s) != "" {
				fmt.Fprintf(b, "%s\n\n", strings.TrimSpace(stripTags(s)))
			}
		}
		for _, child := range val {
			writeMarkdownValue(b, child, depth+1)
		}
	case []any:
		for _, child := range val {
			writeMarkdownValue(b, child, depth)
		}
	}
}

func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '<':
			in = true
		case r == '>':
			in = false
		case !in:
			b.WriteRune(r)
		}
	}
	return b.String()
}
