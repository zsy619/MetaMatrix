package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	// FeishuUploadAllMax is the public drive threshold: upload_all at or under
	// 20MB, prepare/part/finish above that. This package does not claim the
	// live Feishu API was called.
	FeishuUploadAllMax int64 = 20 * 1024 * 1024
	feishuPartSize           = 4 * 1024 * 1024

	FeishuStatusNotConfigured = "not_configured"
	FeishuStatusPending       = "pending"
	FeishuStatusSynced        = "synced"
	FeishuStatusFailed        = "failed"

	ParentDocxImage = "docx_image"
	ParentDocxFile  = "docx_file"
)

// FeishuCreds are application credentials. Empty app id or secret means the
// adapter must not call the network.
type FeishuCreds struct {
	AppID     string
	AppSecret string
	BlockID   string
	BaseURL   string
}

func (c FeishuCreds) configured() bool {
	return strings.TrimSpace(c.AppID) != "" && strings.TrimSpace(c.AppSecret) != "" && strings.TrimSpace(c.BlockID) != ""
}

func (c FeishuCreds) base() string {
	b := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if b == "" {
		return "https://open.feishu.cn"
	}
	return b
}

// FeishuPlan is the request shape. Mode skip means no HTTP call.
type FeishuPlan struct {
	Mode       string // upload_all | multipart | skip
	ParentType string
	ParentNode string
	Status     string
}

// PlanFeishu decides upload_all vs multipart and docx_image vs docx_file.
// Missing credentials yield not_configured and do not invent a token.
func PlanFeishu(mediaType string, size int64, creds FeishuCreds) FeishuPlan {
	if !creds.configured() {
		return FeishuPlan{Mode: "skip", Status: FeishuStatusNotConfigured}
	}
	parent := ParentDocxFile
	if mediaType == "image" {
		parent = ParentDocxImage
	}
	mode := "multipart"
	if size <= FeishuUploadAllMax {
		mode = "upload_all"
	}
	return FeishuPlan{
		Mode:       mode,
		ParentType: parent,
		ParentNode: creds.BlockID,
		Status:     FeishuStatusPending,
	}
}

// FeishuClient performs the drive media upload against BaseURL.
// Tests point BaseURL at a local fake server. That does not accept the upload
// as a real Feishu tenant.
type FeishuClient struct {
	Creds FeishuCreds
	HTTP  *http.Client
}

func (c FeishuClient) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 60 * time.Second}
}

type feishuTokenResp struct {
	Code              int    `json:"code"`
	TenantAccessToken string `json:"tenant_access_token"`
	Msg               string `json:"msg"`
}

type feishuDataResp struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		FileToken string `json:"file_token"`
		UploadID  string `json:"upload_id"`
	} `json:"data"`
}

// Upload reads the whole body because both upload_all and the part loop need
// a replayable payload. Callers pass a file already stored locally.
func (c FeishuClient) Upload(ctx context.Context, plan FeishuPlan, name, mime string, body []byte) (string, error) {
	if plan.Mode == "skip" || plan.Status == FeishuStatusNotConfigured {
		return "", nil
	}
	token, err := c.tenantToken(ctx)
	if err != nil {
		return "", err
	}
	switch plan.Mode {
	case "upload_all":
		return c.uploadAll(ctx, token, plan, name, mime, body)
	case "multipart":
		return c.uploadParts(ctx, token, plan, name, body)
	default:
		return "", fmt.Errorf("unknown feishu mode %q", plan.Mode)
	}
}

func (c FeishuClient) tenantToken(ctx context.Context) (string, error) {
	payload, _ := json.Marshal(map[string]string{
		"app_id":     c.Creds.AppID,
		"app_secret": c.Creds.AppSecret,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Creds.base()+"/open-apis/auth/v3/tenant_access_token/internal", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	var out feishuTokenResp
	if err := c.do(req, &out); err != nil {
		return "", err
	}
	if out.Code != 0 || out.TenantAccessToken == "" {
		return "", fmt.Errorf("feishu token: %s", out.Msg)
	}
	return out.TenantAccessToken, nil
}

func (c FeishuClient) uploadAll(ctx context.Context, token string, plan FeishuPlan, name, mime string, body []byte) (string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("file_name", name)
	_ = w.WriteField("parent_type", plan.ParentType)
	_ = w.WriteField("parent_node", plan.ParentNode)
	_ = w.WriteField("size", strconv.Itoa(len(body)))
	part, err := w.CreateFormFile("file", name)
	if err != nil {
		return "", err
	}
	if _, err = part.Write(body); err != nil {
		return "", err
	}
	if err = w.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Creds.base()+"/open-apis/drive/v1/medias/upload_all", &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	var out feishuDataResp
	if err = c.do(req, &out); err != nil {
		return "", err
	}
	if out.Code != 0 || out.Data.FileToken == "" {
		return "", fmt.Errorf("feishu upload_all: %s", out.Msg)
	}
	return out.Data.FileToken, nil
}

func (c FeishuClient) uploadParts(ctx context.Context, token string, plan FeishuPlan, name string, body []byte) (string, error) {
	prepareBody, _ := json.Marshal(map[string]interface{}{
		"file_name":   name,
		"parent_type": plan.ParentType,
		"parent_node": plan.ParentNode,
		"size":        len(body),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Creds.base()+"/open-apis/drive/v1/medias/upload_prepare", bytes.NewReader(prepareBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	var prepared feishuDataResp
	if err = c.do(req, &prepared); err != nil {
		return "", err
	}
	if prepared.Code != 0 || prepared.Data.UploadID == "" {
		return "", fmt.Errorf("feishu upload_prepare: %s", prepared.Msg)
	}
	parts := 0
	for off := 0; off < len(body); off += feishuPartSize {
		end := off + feishuPartSize
		if end > len(body) {
			end = len(body)
		}
		chunk := body[off:end]
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		_ = w.WriteField("upload_id", prepared.Data.UploadID)
		_ = w.WriteField("seq", strconv.Itoa(parts))
		_ = w.WriteField("size", strconv.Itoa(len(chunk)))
		part, err := w.CreateFormFile("file", name)
		if err != nil {
			return "", err
		}
		if _, err = part.Write(chunk); err != nil {
			return "", err
		}
		if err = w.Close(); err != nil {
			return "", err
		}
		preq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Creds.base()+"/open-apis/drive/v1/medias/upload_part", &buf)
		if err != nil {
			return "", err
		}
		preq.Header.Set("Authorization", "Bearer "+token)
		preq.Header.Set("Content-Type", w.FormDataContentType())
		var partResp feishuDataResp
		if err = c.do(preq, &partResp); err != nil {
			return "", err
		}
		if partResp.Code != 0 {
			return "", fmt.Errorf("feishu upload_part: %s", partResp.Msg)
		}
		parts++
	}
	finish, _ := json.Marshal(map[string]interface{}{
		"upload_id": prepared.Data.UploadID,
		"block_num": parts,
	})
	freq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Creds.base()+"/open-apis/drive/v1/medias/upload_finish", bytes.NewReader(finish))
	if err != nil {
		return "", err
	}
	freq.Header.Set("Authorization", "Bearer "+token)
	freq.Header.Set("Content-Type", "application/json")
	var done feishuDataResp
	if err = c.do(freq, &done); err != nil {
		return "", err
	}
	if done.Code != 0 || done.Data.FileToken == "" {
		return "", fmt.Errorf("feishu upload_finish: %s", done.Msg)
	}
	return done.Data.FileToken, nil
}

func (c FeishuClient) do(req *http.Request, dest interface{}) error {
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("feishu http %d", resp.StatusCode)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return errors.New("feishu empty body")
	}
	return json.Unmarshal(raw, dest)
}
