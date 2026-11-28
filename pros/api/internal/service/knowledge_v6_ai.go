package service

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"strings"
	"time"

	"metamatrix/api/internal/ai"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 知识库 6.0 智能化：写作补全（103）、录音转写与字幕转文档（104）、
// 会议纪要（105）、向量检索召回（106）。
//
// 所有能力都遵循同一原则：配置了外部模型就走模型，没配置就本地降级，
// 功能不因缺少外部服务而消失。

const (
	// chunkSize 是一个向量切片的目标字数。
	chunkSize = 420
	// embedDim 是本地哈希嵌入的维度。
	embedDim = 256
)

// SetAIClient 注入 AI 客户端。没调用时所有能力走本地降级。
func (s *KnowledgeService) SetAIClient(c *ai.Client) { s.ai = c }

// aiMode 返回当前模式：ai 或 local。
func (s *KnowledgeService) aiMode() string {
	if s.ai != nil && s.ai.Enabled() {
		return "ai"
	}
	return "local"
}

// ---------------------------------------------------------------- 写作补全（103）

// WritingSuggestion 是一次写作补全的结果。
type WritingSuggestion struct {
	Text string `json:"text"`
	// Mode 是 ai（模型生成）或 local（从知识库里找到的参考句）。
	Mode string `json:"mode"`
	// Source 是参考句的出处文档标题（local 模式）。
	Source string `json:"source"`
}

// SuggestWriting 给出下一句写作建议。
//
// AI 模式：把当前段落喂给模型，让它续写一句。
// 本地模式：在本人其它文档里找与当前段落关键词重合的句子作为参考，
// 没有模型也能用。
func (s *KnowledgeService) SuggestWriting(ctx context.Context, ownerID, docID uuid.UUID, paragraph string) (*WritingSuggestion, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return nil, err
	}
	paragraph = strings.TrimSpace(paragraph)
	if paragraph == "" {
		paragraph = truncateRunes(strings.TrimSpace(stripHTML(doc.ContentText)), 200)
	}
	if s.ai != nil && s.ai.Enabled() {
		prompt := "文档标题：" + doc.Title + "\n" +
			"当前段落：" + paragraph + "\n" +
			"请续写一句话（不超过 40 字），直接给出正文。"
		out, err := s.ai.Complete(ctx, prompt, 120)
		if err == nil && strings.TrimSpace(out) != "" {
			return &WritingSuggestion{Text: strings.TrimSpace(out), Mode: "ai"}, nil
		}
	}
	ref, title := s.referenceSentence(ownerID, docID, paragraph)
	if ref == "" {
		return &WritingSuggestion{Text: "", Mode: "local"}, nil
	}
	return &WritingSuggestion{Text: ref, Mode: "local", Source: title}, nil
}

// referenceSentence 在本人其它文档里找与当前段落最相关的一句话。
func (s *KnowledgeService) referenceSentence(ownerID, docID uuid.UUID, paragraph string) (string, string) {
	terms := map[string]bool{}
	for _, t := range tokenize(paragraph) {
		terms[t] = true
	}
	if len(terms) == 0 {
		return "", ""
	}
	var docs []model.CanvasDocument
	if err := s.db.Select("id, title, content_text").
		Where("owner_user_id = ? AND id <> ? AND deleted_at IS NULL", ownerID, docID).
		Limit(200).Find(&docs).Error; err != nil {
		return "", ""
	}
	best, bestTitle, bestScore := "", "", 0
	for _, d := range docs {
		for _, sentence := range splitSentences(strings.TrimSpace(stripHTML(d.ContentText))) {
			score := 0
			for _, t := range tokenize(sentence) {
				if terms[t] {
					score++
				}
			}
			if score > bestScore && len([]rune(sentence)) >= 8 {
				bestScore, best, bestTitle = score, sentence, d.Title
			}
		}
	}
	return best, bestTitle
}

// ---------------------------------------------------------------- 向量检索（106）

// SemanticHit 是一条向量召回结果。
type SemanticHit struct {
	DocumentID string  `json:"documentId"`
	Title      string  `json:"title"`
	Snippet    string  `json:"snippet"`
	Score      float64 `json:"score"`
}

// IndexDocChunks 重建一篇文档的向量索引。
//
// 切片按段落合并到约 chunkSize 字；每片算一个向量。
// 外部模型可用时用真嵌入，否则用本地哈希嵌入（字符二元组 TF，256 维）。
func (s *KnowledgeService) IndexDocChunks(ctx context.Context, ownerID, projectID, docID uuid.UUID) (int, error) {
	doc, err := s.docs().GetOwned(ownerID, docID)
	if err != nil {
		return 0, err
	}
	text := strings.TrimSpace(stripHTML(doc.ContentText))
	chunks := splitChunks(text, chunkSize)
	now := time.Now().UTC()
	if err := s.db.Where("doc_id = ?", docID).Delete(&model.KnowledgeChunk{}).Error; err != nil {
		return 0, err
	}
	if len(chunks) == 0 {
		return 0, nil
	}
	vectors := s.embedChunks(ctx, chunks)
	rows := make([]model.KnowledgeChunk, 0, len(chunks))
	for i, chunk := range chunks {
		vec := vectors[i]
		rows = append(rows, model.KnowledgeChunk{
			ID: uuid.New(), ProjectID: projectID, DocID: docID, Seq: i,
			Text: chunk, Embedding: mustJSONVector(vec), UpdatedAt: now,
		})
	}
	if err := s.db.CreateInBatches(rows, 50).Error; err != nil {
		return 0, err
	}
	return len(rows), nil
}

// indexSpaceChunks 给空间里最近的文档建向量索引。
func (s *KnowledgeService) indexSpaceChunks(ctx context.Context, ownerID, projectID uuid.UUID, limit int) error {
	var docs []model.CanvasDocument
	if err := s.db.Select("id").
		Where("project_id = ? AND canvas_type = 'doc' AND deleted_at IS NULL", projectID).
		Order("updated_at DESC").Limit(limit).Find(&docs).Error; err != nil {
		return err
	}
	for _, d := range docs {
		if _, err := s.IndexDocChunks(ctx, ownerID, projectID, d.ID); err != nil {
			continue
		}
	}
	return nil
}

// embedChunks 批量算向量：优先用外部模型，失败或未配置时本地兜底。
func (s *KnowledgeService) embedChunks(ctx context.Context, chunks []string) [][]float64 {
	if s.ai != nil && s.ai.Enabled() {
		if vectors, err := s.ai.Embed(ctx, chunks); err == nil && len(vectors) == len(chunks) {
			out := make([][]float64, len(vectors))
			for i, v := range vectors {
				out[i] = normalize(v)
			}
			return out
		}
	}
	out := make([][]float64, len(chunks))
	for i, c := range chunks {
		out[i] = localEmbed(c)
	}
	return out
}

// SemanticSearch 在空间内做向量召回。
func (s *KnowledgeService) SemanticSearch(ctx context.Context, ownerID, projectID uuid.UUID, query string, limit int) ([]SemanticHit, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleViewer); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []SemanticHit{}, nil
	}
	var chunks []model.KnowledgeChunk
	if err := s.db.Where("project_id = ?", projectID).Find(&chunks).Error; err != nil {
		return nil, err
	}
	if len(chunks) == 0 {
		// 空间还没有向量索引：按需给最近更新的文档建索引。
		if err := s.indexSpaceChunks(ctx, ownerID, projectID, 30); err != nil {
			return []SemanticHit{}, nil
		}
		if err := s.db.Where("project_id = ?", projectID).Find(&chunks).Error; err != nil {
			return nil, err
		}
		if len(chunks) == 0 {
			return []SemanticHit{}, nil
		}
	}
	qvec := localEmbed(query)
	if s.ai != nil && s.ai.Enabled() {
		if vectors, err := s.ai.Embed(ctx, []string{query}); err == nil && len(vectors) == 1 {
			qvec = normalize(vectors[0])
		}
	}
	list := make([]scoredChunk, 0, len(chunks))
	for _, c := range chunks {
		vec := decodeVector(c.Embedding)
		list = append(list, scoredChunk{chunk: c, score: cosine(qvec, vec)})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].score > list[j].score })
	if len(list) > limit {
		list = list[:limit]
	}
	titles := map[uuid.UUID]string{}
	var docs []model.CanvasDocument
	s.db.Select("id, title").Where("id IN ?", chunkDocIDs(list)).Find(&docs)
	for _, d := range docs {
		titles[d.ID] = d.Title
	}
	out := make([]SemanticHit, 0, len(list))
	for _, item := range list {
		if item.score <= 0.01 {
			continue
		}
		out = append(out, SemanticHit{
			DocumentID: item.chunk.DocID.String(),
			Title:      titles[item.chunk.DocID],
			Snippet:    truncateRunes(item.chunk.Text, 160),
			Score:      item.score,
		})
	}
	return out, nil
}

// chunkDocIDs 收集命中切片涉及的文档 ID。
func chunkDocIDs(items []scoredChunk) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	out := []uuid.UUID{}
	for _, item := range items {
		if seen[item.chunk.DocID] {
			continue
		}
		seen[item.chunk.DocID] = true
		out = append(out, item.chunk.DocID)
	}
	return out
}

// ---------------------------------------------------------------- 会议纪要（105）

// MeetingInput 是一次会议的输入。
type MeetingInput struct {
	Title     string   `json:"title"`
	Time      string   `json:"time"`
	Attendees []string `json:"attendees"`
	Agenda    string   `json:"agenda"`
	Notes     string   `json:"notes"`
	// Transcript 是会议转写文本。
	Transcript string `json:"transcript"`
	// Source 是日程来源（ics 文本或事件标题），用于「日程触发纪要」。
	Source string `json:"source"`
}

// MeetingAction 是一条待办。
type MeetingAction struct {
	Text  string `json:"text"`
	Owner string `json:"owner"`
	Due   string `json:"due"`
}

// MeetingMinutes 是一份会议纪要。
type MeetingMinutes struct {
	Title     string          `json:"title"`
	Time      string          `json:"time"`
	Attendees []string        `json:"attendees"`
	Topics    []string        `json:"topics"`
	Decisions []string        `json:"decisions"`
	Actions   []MeetingAction `json:"actions"`
	Summary   string          `json:"summary"`
	Mode      string          `json:"mode"`
}

// BuildMeetingMinutes 从会议记录生成纪要。
//
// 有模型时让模型整理，没有模型时用规则抽取：议题取标题行，
// 结论取含「结论/决定/确定/因此」的句子，待办取含「负责/待办/完成/截止/@人」的句子。
func (s *KnowledgeService) BuildMeetingMinutes(ctx context.Context, in MeetingInput) (*MeetingMinutes, error) {
	source := strings.TrimSpace(in.Transcript)
	if strings.TrimSpace(in.Notes) != "" {
		if source == "" {
			source = strings.TrimSpace(in.Notes)
		} else {
			source = source + "\n" + strings.TrimSpace(in.Notes)
		}
	}
	if source == "" {
		source = strings.TrimSpace(in.Agenda)
	}
	attendees := in.Attendees
	if attendees == nil {
		attendees = []string{}
	}
	minutes := &MeetingMinutes{
		Title: in.Title, Time: in.Time, Attendees: attendees,
		Topics: []string{}, Decisions: []string{}, Actions: []MeetingAction{}, Mode: "local",
	}
	if minutes.Title == "" {
		minutes.Title = "会议纪要"
	}
	sentences := splitSentences(strings.TrimSpace(stripHTML(source)))
	for _, sentence := range sentences {
		lower := strings.ToLower(sentence)
		switch {
		case strings.Contains(sentence, "结论") || strings.Contains(sentence, "决定") ||
			strings.Contains(sentence, "确定") || strings.Contains(sentence, "因此"):
			minutes.Decisions = append(minutes.Decisions, sentence)
		case strings.Contains(sentence, "负责") || strings.Contains(sentence, "待办") ||
			strings.Contains(sentence, "跟进") || strings.Contains(sentence, "完成") ||
			strings.Contains(sentence, "截止") || strings.Contains(lower, "todo"):
			minutes.Actions = append(minutes.Actions, MeetingAction{Text: sentence})
		}
	}
	// 「张三负责 xxx」这种句式：负责人取「负责」前面的名字。
	for i := range minutes.Actions {
		if minutes.Actions[i].Owner != "" {
			continue
		}
		idx := strings.Index(minutes.Actions[i].Text, "负责")
		if idx <= 0 {
			continue
		}
		owner := strings.TrimSpace(minutes.Actions[i].Text[:idx])
		owner = strings.Trim(owner, "，,：: ")
		if len([]rune(owner)) > 12 {
			owner = string([]rune(owner)[len([]rune(owner))-12:])
		}
		if owner != "" {
			minutes.Actions[i].Owner = owner
		}
	}
	for _, line := range strings.Split(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			minutes.Topics = append(minutes.Topics, strings.TrimSpace(strings.TrimLeft(trimmed, "# ")))
			continue
		}
		// 「@张三 负责 xxx」这类句式补全负责人。
		if idx := strings.Index(trimmed, "@"); idx >= 0 {
			rest := trimmed[idx+1:]
			end := strings.IndexAny(rest, " \t，,：:")
			name := rest
			if end > 0 {
				name = rest[:end]
			}
			for i := range minutes.Actions {
				if minutes.Actions[i].Owner == "" && strings.Contains(minutes.Actions[i].Text, trimmed) {
					minutes.Actions[i].Owner = name
				}
			}
		}
	}
	if len(minutes.Topics) == 0 {
		minutes.Topics = extractKeywords(source, 5)
	}
	minutes.Summary = summarizeText(source, 180)
	if s.ai != nil && s.ai.Enabled() {
		prompt := "把下面的会议记录整理成 JSON，字段：title,time,attendees(数组),topics(数组)," +
			"decisions(数组),actions(数组，元素含 text/owner/due),summary。\n\n会议记录：\n" + source
		if out, err := s.ai.Complete(ctx, prompt, 900); err == nil {
			if parsed, ok := parseMinutesJSON(out); ok {
				parsed.Mode = "ai"
				return parsed, nil
			}
		}
	}
	return minutes, nil
}

// ---------------------------------------------------------------- 录音与字幕转文档（104）

// TranscribeAudio 把录音转成文字。
//
// 有模型时走 speech-to-text；没有模型时返回明确错误，让前端提示改用字幕导入。
func (s *KnowledgeService) TranscribeAudio(ctx context.Context, ownerID, projectID uuid.UUID, filename string, data []byte) (string, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", ErrValidation
	}
	if len(data) > 32<<20 {
		return "", ErrValidation
	}
	if s.ai == nil || !s.ai.Enabled() {
		return "", ErrValidation
	}
	text, err := s.ai.Transcribe(ctx, filename, data)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(text), nil
}

// CreateDocFromTranscript 用转写文本（或字幕）创建一篇文档节点。
func (s *KnowledgeService) CreateDocFromTranscript(ownerID, projectID uuid.UUID, parentID *uuid.UUID, title, transcript string) (*model.KnowledgeNode, error) {
	if err := s.assertSpaceAccess(ownerID, projectID, SpaceRoleEditor); err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "录音转写"
	}
	transcript = strings.TrimSpace(transcript)
	if transcript == "" {
		return nil, ErrValidation
	}
	paragraphs := make([]string, 0, 16)
	for _, line := range strings.Split(transcript, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		paragraphs = append(paragraphs, "<p>"+escapeHTML(line)+"</p>")
	}
	htmlDoc := "<h1>" + escapeHTML(title) + "</h1>" + strings.Join(paragraphs, "")
	content := datatypes.JSON([]byte(`{"type":"doc","html":` + mustJSONString(htmlDoc) + `}`))
	text := strings.Join(paragraphs, "")

	now := time.Now().UTC()
	docID := uuid.New()
	revID := uuid.New()
	hash := hashPayload([]byte(content))
	doc := &model.CanvasDocument{
		ID:             docID,
		OwnerUserID:    ownerID,
		CanvasType:     "doc",
		Title:          title,
		SchemaVersion:  1,
		SaveVersion:    1,
		CurrentData:    content,
		ContentText:    text,
		HeadRevisionID: &revID,
		ProjectID:      &projectID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	rev := &model.CanvasRevision{
		ID:           revID,
		DocumentID:   docID,
		RevisionType: "snapshot",
		Payload:      content,
		AuthorUserID: &ownerID,
		Label:        ptrString("transcript"),
		ContentHash:  &hash,
		CreatedAt:    now,
	}
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(doc).Error; err != nil {
			return err
		}
		return tx.Create(rev).Error
	}); err != nil {
		return nil, err
	}
	return s.Create(ownerID, projectID, KnowledgeNodeInput{
		ParentID:   parentID,
		NodeType:   "doc",
		Title:      title,
		Icon:       "🎙️",
		DocumentID: &docID,
	})
}

// mustJSONString 把字符串序列化成 JSON 字符串字面量。
func mustJSONString(s string) string {
	raw, err := json.Marshal(s)
	if err != nil {
		return `""`
	}
	return string(raw)
}

// scoredChunk 是带相似度的切片。
type scoredChunk struct {
	chunk model.KnowledgeChunk
	score float64
}

// mustJSONVector 把向量序列化成 JSON 数组。
func mustJSONVector(vec []float64) datatypes.JSON {
	raw, err := json.Marshal(vec)
	if err != nil {
		return datatypes.JSON([]byte("[]"))
	}
	return datatypes.JSON(raw)
}

// parseMinutesJSON 解析模型输出的会议纪要 JSON。
//
// 模型经常带 markdown 代码块或前后解释，这里只截取最外层的 JSON 对象。
func parseMinutesJSON(raw string) (*MeetingMinutes, bool) {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end <= start {
		return nil, false
	}
	var parsed struct {
		Title     string          `json:"title"`
		Time      string          `json:"time"`
		Attendees []string        `json:"attendees"`
		Topics    []string        `json:"topics"`
		Decisions []string        `json:"decisions"`
		Actions   []MeetingAction `json:"actions"`
		Summary   string          `json:"summary"`
	}
	if err := json.Unmarshal([]byte(raw[start:end+1]), &parsed); err != nil {
		return nil, false
	}
	return &MeetingMinutes{
		Title: parsed.Title, Time: parsed.Time, Attendees: parsed.Attendees,
		Topics: parsed.Topics, Decisions: parsed.Decisions,
		Actions: parsed.Actions, Summary: parsed.Summary, Mode: "ai",
	}, true
}

// ---------------------------------------------------------------- 向量工具

// localEmbed 是本地哈希嵌入：字符二元组 TF → 256 维 → L2 归一化。
//
// 没有外部 embedding 服务时也能跑：同义/共现词会有一定重合，
// 至少比纯关键词多一层召回。
func localEmbed(text string) []float64 {
	vec := make([]float64, embedDim)
	chars := []rune(strings.ToLower(strings.TrimSpace(text)))
	if len(chars) == 0 {
		return vec
	}
	for i := 0; i < len(chars); i++ {
		vec[int(chars[i])%embedDim] += 1
		if i+1 < len(chars) {
			bi := chars[i]*31 + chars[i+1]
			vec[int(bi%embedDim)] += 0.5
		}
	}
	return normalize(vec)
}

func normalize(vec []float64) []float64 {
	var sum float64
	for _, v := range vec {
		sum += v * v
	}
	if sum == 0 {
		return vec
	}
	norm := math.Sqrt(sum)
	out := make([]float64, len(vec))
	for i, v := range vec {
		out[i] = v / norm
	}
	return out
}

func cosine(a, b []float64) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var dot float64
	for i := 0; i < n; i++ {
		dot += a[i] * b[i]
	}
	return dot
}

func decodeVector(raw datatypes.JSON) []float64 {
	if len(raw) == 0 {
		return nil
	}
	var out []float64
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

// splitChunks 按段落切块，长段落再按句号切。
func splitChunks(text string, size int) []string {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	paragraphs := strings.Split(text, "\n")
	chunks := []string{}
	current := ""
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if len([]rune(current))+len([]rune(p)) < size {
			if current != "" {
				current += "\n"
			}
			current += p
			continue
		}
		if current != "" {
			chunks = append(chunks, current)
			current = ""
		}
		if len([]rune(p)) <= size {
			current = p
			continue
		}
		sentences := splitSentences(p)
		for _, s := range sentences {
			if len([]rune(current))+len([]rune(s)) > size && current != "" {
				chunks = append(chunks, current)
				current = ""
			}
			if current != "" {
				current += " "
			}
			current += s
		}
	}
	if strings.TrimSpace(current) != "" {
		chunks = append(chunks, current)
	}
	return chunks
}

func summarizeText(text string, limit int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	sentences := splitSentences(text)
	out := ""
	for _, s := range sentences {
		if len([]rune(out))+len([]rune(s)) > limit {
			break
		}
		if out != "" {
			out += " "
		}
		out += s
	}
	return out
}
