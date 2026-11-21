// Package ai 是一个极简的 OpenAI 兼容客户端。
//
// 只做知识库需要的四件事：对话补全、向量嵌入、语音转写、文本摘要。
// 好处是任何兼容 OpenAI 协议的网关（OpenAI / DeepSeek / 通义 / 自建 vLLM）都能直接用，
// 环境变量没配时客户端保持「未启用」，由调用方走本地降级逻辑。
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// Config 是 AI 服务的连接配置。
type Config struct {
	// BaseURL 是 API 根地址，例如 https://api.openai.com/v1。
	BaseURL string
	// APIKey 是密钥；为空表示不启用外部 AI。
	APIKey string
	// Model 是对话模型名。
	Model string
	// EmbeddingModel 是向量模型名；为空时复用 Model。
	EmbeddingModel string
}

// Client 是 AI 客户端。
type Client struct {
	cfg  Config
	http *http.Client
}

// New 构造客户端。BaseURL 缺省补成 OpenAI 的地址。
func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com/v1"
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.EmbeddingModel == "" {
		cfg.EmbeddingModel = cfg.Model
	}
	return &Client{cfg: cfg, http: &http.Client{Timeout: 60 * time.Second}}
}

// Enabled 报告是否配置了可用的外部 AI。
func (c *Client) Enabled() bool {
	return c != nil && c.cfg.APIKey != "" && c.cfg.Model != ""
}

// Mode 返回当前模式：ai（走外部模型）或 local（本地降级）。
func (c *Client) Mode() string {
	if c.Enabled() {
		return "ai"
	}
	return "local"
}

// Complete 走 /chat/completions 做一次补全。
func (c *Client) Complete(ctx context.Context, prompt string, maxTokens int) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("ai: not configured")
	}
	if maxTokens <= 0 {
		maxTokens = 512
	}
	body := map[string]interface{}{
		"model": c.cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "你是知识库写作助手，只输出正文内容，不要解释。"},
			{"role": "user", "content": prompt},
		},
		"max_tokens": maxTokens,
		"temperature": 0.3,
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := c.postJSON(ctx, "/chat/completions", body, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("ai: empty choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

// Embed 走 /embeddings 批量向量化。
func (c *Client) Embed(ctx context.Context, texts []string) ([][]float64, error) {
	if !c.Enabled() || c.cfg.EmbeddingModel == "" {
		return nil, fmt.Errorf("ai: embedding not configured")
	}
	body := map[string]interface{}{
		"model": c.cfg.EmbeddingModel,
		"input": texts,
	}
	var out struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if err := c.postJSON(ctx, "/embeddings", body, &out); err != nil {
		return nil, err
	}
	vectors := make([][]float64, 0, len(out.Data))
	for _, d := range out.Data {
		vectors = append(vectors, d.Embedding)
	}
	return vectors, nil
}

// Transcribe 走 /audio/transcriptions 把音频转成文字。
func (c *Client) Transcribe(ctx context.Context, filename string, audio []byte) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("ai: not configured")
	}
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audio); err != nil {
		return "", err
	}
	if err := w.WriteField("model", "whisper-1"); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+"/audio/transcriptions", &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ai: transcribe status %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return strings.TrimSpace(out.Text), nil
}

func (c *Client) postJSON(ctx context.Context, path string, body interface{}, out interface{}) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("ai: status %d: %s", resp.StatusCode, truncate(string(data), 300))
	}
	return json.Unmarshal(data, out)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
