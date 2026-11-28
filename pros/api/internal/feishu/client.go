// Package feishu 提供飞书开放平台的最小客户端：租户 token、知识空间节点列表、
// 文档正文与群机器人通知。
//
// 只封装知识库导入需要的接口，避免引入完整 SDK。
package feishu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Client 是飞书开放平台客户端。
type Client struct {
	AppID     string
	AppSecret string
	// BaseURL 允许指向自建网关或测试服务器；空值用官方地址。
	BaseURL string
	HTTP    *http.Client

	mu       sync.Mutex
	token    string
	tokenExp time.Time
}

// New 建一个客户端。
func New(appID, appSecret string) *Client {
	return &Client{
		AppID:     appID,
		AppSecret: appSecret,
		BaseURL:   "https://open.feishu.cn",
		HTTP:      &http.Client{Timeout: 20 * time.Second},
	}
}

// Configured 返回是否配置了应用凭证。
func (c *Client) Configured() bool { return c.AppID != "" && c.AppSecret != "" }

// SpaceNode 是知识空间里的一个节点。
type SpaceNode struct {
	Token           string `json:"node_token"`
	ObjToken        string `json:"obj_token"`
	ObjType         string `json:"obj_type"`
	Title           string `json:"title"`
	ParentNodeToken string `json:"parent_node_token"`
	HasChild        bool   `json:"has_child"`
}

// TenantToken 取租户访问令牌，并在有效期内复用。
func (c *Client) TenantToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	if c.token != "" && time.Now().Before(c.tokenExp) {
		token := c.token
		c.mu.Unlock()
		return token, nil
	}
	c.mu.Unlock()

	body := map[string]string{"app_id": c.AppID, "app_secret": c.AppSecret}
	var resp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			TenantAccessToken string `json:"tenant_access_token"`
			Expire            int    `json:"expire"`
		} `json:"data"`
	}
	if err := c.do(ctx, http.MethodPost, "/open-apis/auth/v3/tenant_access_token/internal", "", body, &resp); err != nil {
		return "", err
	}
	if resp.Code != 0 || resp.Data.TenantAccessToken == "" {
		return "", fmt.Errorf("feishu auth failed: code=%d msg=%s", resp.Code, resp.Msg)
	}
	c.mu.Lock()
	c.token = resp.Data.TenantAccessToken
	expire := resp.Data.Expire
	if expire <= 0 {
		expire = 7200
	}
	c.tokenExp = time.Now().Add(time.Duration(expire-60) * time.Second)
	c.mu.Unlock()
	return resp.Data.TenantAccessToken, nil
}

// ListSpaceNodes 列出知识空间的一级节点。
func (c *Client) ListSpaceNodes(ctx context.Context, spaceToken string) ([]SpaceNode, error) {
	token, err := c.TenantToken(ctx)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Items     []SpaceNode `json:"items"`
			HasMore   bool        `json:"has_more"`
			PageToken string      `json:"page_token"`
		} `json:"data"`
	}
	path := fmt.Sprintf("/open-apis/wiki/v2/spaces/%s/nodes?page_size=50", spaceToken)
	if err := c.do(ctx, http.MethodGet, path, token, nil, &resp); err != nil {
		return nil, err
	}
	if resp.Code != 0 {
		return nil, fmt.Errorf("feishu list nodes failed: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return resp.Data.Items, nil
}

// DocContent 取文档正文（飞书返回 Markdown 风格文本）。
func (c *Client) DocContent(ctx context.Context, objToken string) (string, error) {
	token, err := c.TenantToken(ctx)
	if err != nil {
		return "", err
	}
	var resp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Content string `json:"content"`
		} `json:"data"`
	}
	path := fmt.Sprintf("/open-apis/docx/v1/documents/%s/raw_content", objToken)
	if err := c.do(ctx, http.MethodGet, path, token, nil, &resp); err != nil {
		return "", err
	}
	if resp.Code != 0 {
		return "", fmt.Errorf("feishu doc content failed: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return resp.Data.Content, nil
}

// SendWebhookText 往群机器人 webhook 发一条文本消息。
func SendWebhookText(ctx context.Context, webhookURL, text string) error {
	if webhookURL == "" {
		return fmt.Errorf("feishu webhook is not configured")
	}
	payload := map[string]interface{}{
		"msg_type": "text",
		"content":  map[string]string{"text": text},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("feishu webhook status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// do 统一发请求并解析 JSON。
func (c *Client) do(ctx context.Context, method, path, token string, body interface{}, out interface{}) error {
	base := c.BaseURL
	if base == "" {
		base = "https://open.feishu.cn"
	}
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("feishu status %d: %s", resp.StatusCode, string(raw))
	}
	return json.Unmarshal(raw, out)
}
