package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"

	"metamatrix/api/internal/feishu"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

// 知识库导入：Word / Excel / Markdown / 纯文本 / HTML 落成知识库文档，
// 以及从飞书知识空间批量导入。

const (
	maxImportBytes = 20 << 20
	maxImportRows  = 500
)

// ImportFile 把上传的文件转成一篇文档，并在目录下建对应节点。
func (s *KnowledgeService) ImportFile(ownerID, projectID uuid.UUID, parentID *uuid.UUID, filename string, data []byte) (*model.KnowledgeNode, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	if len(data) == 0 || len(data) > maxImportBytes {
		return nil, ErrValidation
	}
	title, html, err := parseImportFile(filename, data)
	if err != nil {
		return nil, err
	}
	return s.createImportedDoc(ownerID, projectID, parentID, title, html)
}

// createImportedDoc 建文档 + 目录节点的公共路径（导入与飞书同步共用）。
func (s *KnowledgeService) createImportedDoc(ownerID, projectID uuid.UUID, parentID *uuid.UUID, title, html string) (*model.KnowledgeNode, error) {
	payload, err := json.Marshal(map[string]interface{}{"type": "doc", "html": html})
	if err != nil {
		return nil, err
	}
	canvasType := "doc"
	doc, err := s.docs().Create(ownerID, CreateDocumentInput{
		Title:      &title,
		CanvasType: &canvasType,
		ProjectID:  &projectID,
		Data:       payload,
	})
	if err != nil {
		return nil, err
	}
	node, err := s.Create(ownerID, projectID, KnowledgeNodeInput{
		ParentID:   parentID,
		NodeType:   "doc",
		Title:      title,
		DocumentID: &doc.ID,
	})
	if err != nil {
		return nil, err
	}
	return node, nil
}

// parseImportFile 按扩展名分派解析器，返回标题与 HTML 正文。
func parseImportFile(filename string, data []byte) (string, string, error) {
	base := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	if strings.TrimSpace(base) == "" {
		base = "导入文档"
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".docx":
		html, err := docxToHTML(data)
		return base, html, err
	case ".xlsx":
		html, err := xlsxToHTML(data)
		return base, html, err
	case ".md", ".markdown":
		return base, markdownToHTML(string(data)), nil
	case ".html", ".htm":
		return base, string(data), nil
	case ".txt", ".text":
		return base, textToHTML(string(data)), nil
	default:
		return "", "", ErrValidation
	}
}

// ---------------------------------------------------------------- Word

// docxToHTML 解析 docx 正文：按段落输出，标题样式映射成 h1/h2/h3。
func docxToHTML(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrValidation
	}
	var documentXML []byte
	for _, file := range zr.File {
		if file.Name == "word/document.xml" {
			rc, err := file.Open()
			if err != nil {
				return "", ErrValidation
			}
			documentXML, err = io.ReadAll(io.LimitReader(rc, maxImportBytes))
			rc.Close()
			break
		}
	}
	if len(documentXML) == 0 {
		return "", ErrValidation
	}
	type style struct {
		Val string `xml:"val,attr"`
	}
	type paraProps struct {
		Style style `xml:"pStyle"`
	}
	type runProps struct {
		Text string `xml:"t"`
		Bold bool   `xml:"b"`
	}
	type paragraph struct {
		Props paraProps  `xml:"pPr"`
		Runs  []runProps `xml:"r"`
	}
	type document struct {
		Paragraphs []paragraph `xml:"body>p"`
	}
	var doc document
	if err := xml.Unmarshal(documentXML, &doc); err != nil {
		return "", ErrValidation
	}
	var b strings.Builder
	for _, p := range doc.Paragraphs {
		text := ""
		for _, r := range p.Runs {
			text += r.Text
		}
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		tag := "p"
		switch {
		case strings.HasPrefix(p.Props.Style.Val, "Heading1"):
			tag = "h1"
		case strings.HasPrefix(p.Props.Style.Val, "Heading2"):
			tag = "h2"
		case strings.HasPrefix(p.Props.Style.Val, "Heading3"):
			tag = "h3"
		case strings.HasPrefix(p.Props.Style.Val, "Title"):
			tag = "h1"
		}
		b.WriteString("<" + tag + ">")
		b.WriteString(escapeHTML(text))
		b.WriteString("</" + tag + ">")
	}
	return b.String(), nil
}

// ---------------------------------------------------------------- Excel

type xlsxSheet struct {
	Rows []xlsxRow `xml:"sheetData>row"`
}

type xlsxRow struct {
	Cells []xlsxCell `xml:"c"`
}

type xlsxCell struct {
	Ref  string `xml:"r,attr"`
	Type string `xml:"t,attr"`
	Val  string `xml:"v"`
	IS   struct {
		T string `xml:"t"`
	} `xml:"is"`
}

// xlsxToHTML 解析第一个工作表为 HTML 表格。
func xlsxToHTML(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrValidation
	}
	var shared []string
	var sheetXML []byte
	for _, file := range zr.File {
		switch file.Name {
		case "xl/sharedStrings.xml":
			rc, err := file.Open()
			if err != nil {
				return "", ErrValidation
			}
			raw, _ := io.ReadAll(io.LimitReader(rc, maxImportBytes))
			rc.Close()
			shared = parseSharedStrings(raw)
		case "xl/worksheets/sheet1.xml":
			rc, err := file.Open()
			if err != nil {
				return "", ErrValidation
			}
			sheetXML, _ = io.ReadAll(io.LimitReader(rc, maxImportBytes))
			rc.Close()
		}
	}
	if len(sheetXML) == 0 {
		return "", ErrValidation
	}
	var sheet xlsxSheet
	if err := xml.Unmarshal(sheetXML, &sheet); err != nil {
		return "", ErrValidation
	}
	var b strings.Builder
	b.WriteString("<table><tbody>")
	for i, row := range sheet.Rows {
		if i >= maxImportRows {
			break
		}
		b.WriteString("<tr>")
		for _, cell := range row.Cells {
			value := cell.Val
			switch cell.Type {
			case "s":
				idx, err := strconv.Atoi(cell.Val)
				if err == nil && idx >= 0 && idx < len(shared) {
					value = shared[idx]
				}
			case "inlineStr":
				value = cell.IS.T
			}
			tag := "td"
			if i == 0 {
				tag = "th"
			}
			b.WriteString("<" + tag + ">")
			b.WriteString(escapeHTML(value))
			b.WriteString("</" + tag + ">")
		}
		b.WriteString("</tr>")
	}
	b.WriteString("</tbody></table>")
	return b.String(), nil
}

// parseSharedStrings 读 sharedStrings.xml 里的字符串表。
func parseSharedStrings(raw []byte) []string {
	type si struct {
		Texts []string `xml:"t"`
	}
	type sst struct {
		Items []si `xml:"si"`
	}
	var doc sst
	if err := xml.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	out := make([]string, 0, len(doc.Items))
	for _, item := range doc.Items {
		out = append(out, strings.Join(item.Texts, ""))
	}
	return out
}

// ---------------------------------------------------------------- 纯文本 / Markdown

// textToHTML 把纯文本按空行分段。
func textToHTML(text string) string {
	paras := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n\n")
	var b strings.Builder
	for _, p := range paras {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		b.WriteString("<p>")
		b.WriteString(escapeHTML(strings.ReplaceAll(p, "\n", "<br>")))
		b.WriteString("</p>")
	}
	return b.String()
}

// markdownToHTML 支持标题、列表、代码块、粗体、斜体、行内代码与链接。
func markdownToHTML(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var b strings.Builder
	inCode := false
	inList := false
	closeList := func() {
		if inList {
			b.WriteString("</ul>")
			inList = false
		}
	}
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "```"):
			closeList()
			if inCode {
				b.WriteString("</code></pre>")
				inCode = false
			} else {
				b.WriteString("<pre><code>")
				inCode = true
			}
			continue
		}
		if inCode {
			b.WriteString(escapeHTML(line))
			b.WriteString("\n")
			continue
		}
		if trimmed == "" {
			closeList()
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			closeList()
			level := 0
			for level < 6 && strings.HasPrefix(trimmed, "#") {
				level++
				trimmed = strings.TrimPrefix(trimmed, "#")
			}
			trimmed = strings.TrimSpace(trimmed)
			b.WriteString(fmt.Sprintf("<h%d>%s</h%d>", level, inlineMarkdown(trimmed), level))
			continue
		}
		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			if !inList {
				b.WriteString("<ul>")
				inList = true
			}
			b.WriteString("<li>" + inlineMarkdown(strings.TrimSpace(trimmed[2:])) + "</li>")
			continue
		}
		closeList()
		b.WriteString("<p>" + inlineMarkdown(trimmed) + "</p>")
	}
	if inCode {
		b.WriteString("</code></pre>")
	}
	closeList()
	return b.String()
}

// inlineMarkdown 处理行内 Markdown 标记。
func inlineMarkdown(text string) string {
	text = escapeHTML(text)
	text = strings.ReplaceAll(text, "**", "<strong>")
	text = strings.ReplaceAll(text, "```", "<code>")
	text = strings.ReplaceAll(text, "`", "<code>")
	text = strings.ReplaceAll(text, "*", "<em>")
	return text
}

func escapeHTML(s string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;")
	return replacer.Replace(s)
}

// ---------------------------------------------------------------- 飞书导入

// ConfigureFeishu 配置飞书开放平台凭证与机器人 webhook。
func (s *KnowledgeService) ConfigureFeishu(appID, appSecret, webhook, baseURL string) {
	s.feishuAppID = appID
	s.feishuAppSecret = appSecret
	s.feishuWebhook = webhook
	s.feishuBaseURL = baseURL
}

// FeishuConfigured 返回飞书凭证是否可用。
func (s *KnowledgeService) FeishuConfigured() bool {
	return s.feishuAppID != "" && s.feishuAppSecret != ""
}

// ImportFeishuSpace 把飞书知识空间的一级节点导入成本项目的知识库节点。
func (s *KnowledgeService) ImportFeishuSpace(ctx context.Context, ownerID, projectID uuid.UUID, spaceToken string, parentID *uuid.UUID) (int, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return 0, err
	}
	if !s.FeishuConfigured() {
		return 0, ErrValidation
	}
	client := feishu.New(s.feishuAppID, s.feishuAppSecret)
	if s.feishuBaseURL != "" {
		client.BaseURL = s.feishuBaseURL
	}
	nodes, err := client.ListSpaceNodes(ctx, spaceToken)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, node := range nodes {
		title := strings.TrimSpace(node.Title)
		if title == "" {
			title = "飞书文档"
		}
		html := ""
		if node.ObjToken != "" {
			if content, err := client.DocContent(ctx, node.ObjToken); err == nil {
				html = markdownToHTML(content)
			}
		}
		if _, err := s.createImportedDoc(ownerID, projectID, parentID, title, html); err != nil {
			continue
		}
		count++
	}
	return count, nil
}

// ImportFeishuDoc 导入单篇飞书文档：粘贴飞书文档链接即可（087）。
//
// docToken 可以是 obj_token，也可以是完整的飞书文档链接（会从中解析 token）。
func (s *KnowledgeService) ImportFeishuDoc(ctx context.Context, ownerID, projectID uuid.UUID, docToken string, parentID *uuid.UUID) (*model.KnowledgeNode, error) {
	if err := s.assertProjectOwned(ownerID, projectID); err != nil {
		return nil, err
	}
	if !s.FeishuConfigured() {
		return nil, ErrValidation
	}
	token := ParseFeishuDocToken(docToken)
	if token == "" {
		return nil, ErrValidation
	}
	client := feishu.New(s.feishuAppID, s.feishuAppSecret)
	if s.feishuBaseURL != "" {
		client.BaseURL = s.feishuBaseURL
	}
	content, err := client.DocContent(ctx, token)
	if err != nil {
		return nil, err
	}
	title := "飞书文档 " + token
	return s.createImportedDoc(ownerID, projectID, parentID, title, markdownToHTML(content))
}

// ParseFeishuDocToken 从粘贴的链接或裸 token 里取出飞书文档 token。
func ParseFeishuDocToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if idx := strings.Index(raw, "/docx/"); idx >= 0 {
		rest := raw[idx+len("/docx/"):]
		if end := strings.IndexAny(rest, "?#"); end >= 0 {
			rest = rest[:end]
		}
		return strings.TrimSpace(rest)
	}
	if idx := strings.Index(raw, "/docs/"); idx >= 0 {
		rest := raw[idx+len("/docs/"):]
		if end := strings.IndexAny(rest, "?#"); end >= 0 {
			rest = rest[:end]
		}
		return strings.TrimSpace(rest)
	}
	return raw
}

// NotifyFeishu 把一条消息发到飞书群机器人。
func (s *KnowledgeService) NotifyFeishu(ctx context.Context, text string) error {
	if s.feishuWebhook == "" {
		return ErrValidation
	}
	return feishu.SendWebhookText(ctx, s.feishuWebhook, text)
}
