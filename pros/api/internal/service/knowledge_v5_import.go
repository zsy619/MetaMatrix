package service

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

// 知识库 5.0：导入增强（PPTX、docx 结构还原、预览映射、批量导入）与 docx 导出。

// ---------------------------------------------------------------- PPTX

// pptxToHTML 解析 pptx：每页幻灯片一节，抽取文本框内容。
func pptxToHTML(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrValidation
	}
	type slide struct {
		name string
		idx  int
	}
	slides := []slide{}
	contents := map[string][]byte{}
	for _, file := range zr.File {
		if !strings.HasPrefix(file.Name, "ppt/slides/slide") || !strings.HasSuffix(file.Name, ".xml") {
			continue
		}
		base := filepath.Base(file.Name)
		idx := 0
		num := strings.TrimSuffix(strings.TrimPrefix(base, "slide"), ".xml")
		if n, err := strconv.Atoi(num); err == nil {
			idx = n
		}
		rc, err := file.Open()
		if err != nil {
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(rc, maxImportBytes))
		rc.Close()
		if err != nil {
			continue
		}
		slides = append(slides, slide{name: base, idx: idx})
		contents[base] = raw
	}
	if len(slides) == 0 {
		return "", ErrValidation
	}
	sort.Slice(slides, func(i, j int) bool { return slides[i].idx < slides[j].idx })
	var b strings.Builder
	for _, sl := range slides {
		texts := extractPPTXText(contents[sl.name])
		if len(texts) == 0 {
			continue
		}
		b.WriteString("<h2>第 " + strconv.Itoa(sl.idx) + " 页</h2>")
		for _, t := range texts {
			b.WriteString("<p>" + escapeHTML(t) + "</p>")
		}
	}
	if b.Len() == 0 {
		return "", ErrValidation
	}
	return b.String(), nil
}

var pptxTextRe = regexp.MustCompile(`(?is)<a:t[^>]*>(.*?)</a:t>`)

// extractPPTXText 抽出幻灯片里的所有文本片段。
func extractPPTXText(raw []byte) []string {
	out := []string{}
	for _, m := range pptxTextRe.FindAllStringSubmatch(string(raw), -1) {
		text := strings.TrimSpace(unescapeXMLText(m[1]))
		if text == "" {
			continue
		}
		out = append(out, text)
	}
	return out
}

// unescapeXMLText 还原 XML 实体。
func unescapeXMLText(s string) string {
	r := strings.NewReplacer("&lt;", "<", "&gt;", ">", "&quot;", "\"", "&apos;", "'", "&amp;", "&")
	return r.Replace(s)
}

// ---------------------------------------------------------------- docx 结构还原

type docxRel struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

// docxToHTML 解析 docx 正文：保留标题层级、列表、表格与超链接。
func docxToHTML(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrValidation
	}
	var documentXML []byte
	rels := map[string]string{}
	for _, file := range zr.File {
		switch file.Name {
		case "word/document.xml":
			rc, err := file.Open()
			if err != nil {
				return "", ErrValidation
			}
			documentXML, err = io.ReadAll(io.LimitReader(rc, maxImportBytes))
			rc.Close()
			if err != nil {
				return "", ErrValidation
			}
		case "word/_rels/document.xml.rels":
			rc, err := file.Open()
			if err != nil {
				continue
			}
			raw, err := io.ReadAll(io.LimitReader(rc, maxImportBytes))
			rc.Close()
			if err != nil {
				continue
			}
			var list struct {
				Rels []docxRel `xml:"Relationship"`
			}
			if err := xml.Unmarshal(raw, &list); err == nil {
				for _, rel := range list.Rels {
					rels[rel.ID] = rel.Target
				}
			}
		}
	}
	if len(documentXML) == 0 {
		return "", ErrValidation
	}
	return docxDocumentToHTML(documentXML, rels)
}

// docxDocumentToHTML 用流式解析把 document.xml 转成 HTML。
func docxDocumentToHTML(raw []byte, rels map[string]string) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	var out strings.Builder
	var para struct {
		text     strings.Builder
		style    string
		numbered bool
		bold     bool
		link     string
		active   bool
	}
	var listDepth int
	var listKind string
	inTable := false
	var row []string
	var cell strings.Builder
	inCell := false

	flushPara := func() {
		if !para.active {
			return
		}
		text := strings.TrimSpace(para.text.String())
		para.active = false
		para.style = ""
		para.numbered = false
		para.bold = false
		para.link = ""
		para.text.Reset()
		if text == "" {
			return
		}
		tag := "p"
		switch {
		case strings.HasPrefix(para.style, "Heading1"):
			tag = "h1"
		case strings.HasPrefix(para.style, "Heading2"):
			tag = "h2"
		case strings.HasPrefix(para.style, "Heading3"):
			tag = "h3"
		case strings.HasPrefix(para.style, "Heading4"):
			tag = "h4"
		case strings.HasPrefix(para.style, "Title"):
			tag = "h1"
		}
		html := escapeHTML(text)
		if para.bold {
			html = "<strong>" + html + "</strong>"
		}
		if inTable {
			cell.WriteString(html)
			return
		}
		if para.numbered {
			if listKind != "ol" {
				if listDepth > 0 {
					out.WriteString("</ul>")
					listDepth--
				}
				out.WriteString("<ol>")
				listKind = "ol"
				listDepth++
			}
			out.WriteString("<li>" + html + "</li>")
			return
		}
		if listDepth > 0 {
			out.WriteString("</ul>")
			listDepth = 0
			listKind = ""
		}
		out.WriteString("<" + tag + ">" + html + "</" + tag + ">")
	}
	closeLists := func() {
		if listDepth > 0 {
			out.WriteString("</ul>")
			listDepth = 0
			listKind = ""
		}
	}

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", ErrValidation
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "p":
				para.active = true
				para.text.Reset()
				para.style = ""
				para.numbered = false
				para.bold = false
				para.link = ""
			case "pStyle":
				var v struct {
					Val string `xml:"val,attr"`
				}
				_ = dec.DecodeElement(&v, &t)
				para.style = v.Val
			case "numPr":
				para.numbered = true
			case "b":
				para.bold = true
			case "hyperlink":
				for _, attr := range t.Attr {
					if attr.Name.Local == "id" {
						para.link = rels[attr.Value]
					}
				}
			case "tbl":
				inTable = true
				row = nil
				out.WriteString("<table><tbody>")
			case "tr":
				row = []string{}
			case "tc":
				inCell = true
				cell.Reset()
			case "t":
				var text string
				_ = dec.DecodeElement(&text, &t)
				if para.active {
					para.text.WriteString(text)
				} else if inCell {
					cell.WriteString(escapeHTML(text))
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "p":
				flushPara()
			case "tc":
				if inCell {
					row = append(row, strings.TrimSpace(cell.String()))
					inCell = false
				}
			case "tr":
				cells := ""
				for _, c := range row {
					cells += "<td>" + c + "</td>"
				}
				out.WriteString("<tr>" + cells + "</tr>")
			case "tbl":
				out.WriteString("</tbody></table>")
				inTable = false
			}
		}
	}
	flushPara()
	closeLists()
	return out.String(), nil
}

// ---------------------------------------------------------------- 导入预览与批量

// ImportPreview 是导入前的预览结果：字段映射界面用。
type ImportPreview struct {
	Filename string   `json:"filename"`
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Headings []string `json:"headings"`
	Columns  []string `json:"columns"`
	Preview  string   `json:"preview"`
}

// PreviewImport 解析上传文件但不落库：给出标题、章节与表格列，供字段映射。
func (s *KnowledgeService) PreviewImport(filename string, data []byte) (*ImportPreview, error) {
	if len(data) == 0 || len(data) > maxImportBytes {
		return nil, ErrValidation
	}
	title, html, err := parseImportFile(filename, data)
	if err != nil {
		return nil, err
	}
	preview := &ImportPreview{
		Filename: filename,
		Kind:     strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), "."),
		Title:    title,
		Headings: []string{},
		Columns:  []string{},
	}
	for _, item := range OutlineFromHTML(html) {
		preview.Headings = append(preview.Headings, item.Text)
	}
	preview.Columns = tableColumns(html)
	if len(preview.Headings) == 0 {
		text := strings.TrimSpace(stripHTML(html))
		if len([]rune(text)) > 200 {
			text = string([]rune(text)[:200]) + "…"
		}
		preview.Headings = append(preview.Headings, text)
	}
	preview.Preview = html
	if len(preview.Preview) > 4000 {
		preview.Preview = preview.Preview[:4000] + "…"
	}
	return preview, nil
}

var tableRowRe = regexp.MustCompile(`(?is)<tr[^>]*>(.*?)</tr>`)
var tableCellRe = regexp.MustCompile(`(?is)<t[dh][^>]*>(.*?)</t[dh]>`)

// tableColumns 取 HTML 表格的表头列名。
func tableColumns(html string) []string {
	row := tableRowRe.FindString(html)
	if row == "" {
		return []string{}
	}
	cols := []string{}
	for _, m := range tableCellRe.FindAllStringSubmatch(row, -1) {
		cols = append(cols, strings.TrimSpace(stripHTML(m[1])))
	}
	return cols
}

// ImportFileInput 是批量导入里的一个文件。
type ImportFileInput struct {
	Filename string
	Data     []byte
}

// ImportResult 是批量导入里单个文件的结果。
type ImportResult struct {
	Filename string `json:"filename"`
	NodeID   string `json:"nodeId"`
	Title    string `json:"title"`
	Error    string `json:"error"`
}

// ImportFiles 批量导入：逐个文件处理，单个失败不影响其余文件。
func (s *KnowledgeService) ImportFiles(ownerID, projectID uuid.UUID, parentID *uuid.UUID, files []ImportFileInput) ([]ImportResult, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	if len(files) == 0 || len(files) > 50 {
		return nil, ErrValidation
	}
	results := make([]ImportResult, 0, len(files))
	for _, f := range files {
		res := ImportResult{Filename: f.Filename}
		node, err := s.ImportFile(ownerID, projectID, parentID, f.Filename, f.Data)
		if err != nil {
			res.Error = err.Error()
		} else {
			res.NodeID = node.ID.String()
			res.Title = node.Title
		}
		results = append(results, res)
	}
	return results, nil
}

// ---------------------------------------------------------------- docx 导出

// ExportDocumentDocx 导出一篇文档为 .docx：与导入对称，便于回写 Word/飞书。
func (s *KnowledgeService) ExportDocumentDocx(ownerID, docID uuid.UUID) ([]byte, string, error) {
	var doc model.CanvasDocument
	if err := s.db.Where("id = ? AND owner_user_id = ?", docID, ownerID).First(&doc).Error; err != nil {
		return nil, "", ErrDocumentNotFound
	}
	name := strings.TrimSpace(doc.Title)
	if name == "" {
		name = "document"
	}
	body := buildDocxBody(extractDocHTML(doc.CurrentData))
	return buildDocx(name, body), name + ".docx", nil
}

// buildDocxBody 把 HTML 片段转成 WordprocessingML 段落。
func buildDocxBody(html string) string {
	var b strings.Builder
	for _, block := range splitHTMLBlocks(html) {
		tag, text := block.tag, block.text
		if text == "" {
			continue
		}
		style := ""
		switch tag {
		case "h1":
			style = `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>`
		case "h2":
			style = `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>`
		case "h3":
			style = `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>`
		case "li":
			style = `<w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr>`
		}
		b.WriteString("<w:p>" + style + "<w:r><w:t xml:space=\"preserve\">" + escapeHTML(text) + "</w:t></w:r></w:p>")
	}
	return b.String()
}

type htmlBlock struct {
	tag  string
	text string
}

var blockOpenRe = regexp.MustCompile(`(?is)<(h[1-6]|p|li)([^>]*)>`)

// splitHTMLBlocks 按块级标签切分正文。
//
// 不用反向引用（Go 的 regexp 不支持 ），改成自己找配对的结束标签。
func splitHTMLBlocks(html string) []htmlBlock {
	out := []htmlBlock{}
	locs := blockOpenRe.FindAllStringSubmatchIndex(html, -1)
	for _, loc := range locs {
		tag := html[loc[2]:loc[3]]
		start := loc[1]
		closeIdx := strings.Index(strings.ToLower(html[start:]), "</"+tag+">")
		if closeIdx < 0 {
			continue
		}
		inner := html[start : start+closeIdx]
		text := strings.TrimSpace(stripHTML(inner))
		if text == "" {
			continue
		}
		out = append(out, htmlBlock{tag: tag, text: text})
	}
	return out
}

// buildDocx 组装最小可用的 docx 包。
func buildDocx(title, body string) []byte {
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	add := func(name, content string) {
		w, err := zw.Create(name)
		if err != nil {
			return
		}
		_, _ = w.Write([]byte(content))
	}
	add("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)
	add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
	add("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
	add("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`)
	add("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+
		`<w:p><w:r><w:t xml:space="preserve">`+escapeHTML(title)+`</w:t></w:r></w:p>`+
		body+`<w:sectPr/></w:body></w:document>`)
	_ = zw.Close()
	return buf.Bytes()
}
