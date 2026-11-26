package media

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ObjectConfig 描述 S3 兼容（含 MinIO）对象存储。凭据只从运行时配置读取，不写死。
type ObjectConfig struct {
	Mode      string // disk | s3 | auto
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	Prefix    string
	UseSSL    bool
}

// Ready 表示切换对象存储所需的端点、桶和访问密钥都已齐。
func (c ObjectConfig) Ready() bool {
	return strings.TrimSpace(c.Endpoint) != "" &&
		strings.TrimSpace(c.Bucket) != "" &&
		strings.TrimSpace(c.AccessKey) != "" &&
		strings.TrimSpace(c.SecretKey) != ""
}

// ResolveBlobBackend 按配置选择对象后端。缺端点/桶/密钥时回退本地磁盘，不假装已切生产数据。
func ResolveBlobBackend(root string, cfg ObjectConfig) (BlobBackend, string) {
	mode := strings.ToLower(strings.TrimSpace(cfg.Mode))
	if mode == "" {
		mode = "auto"
	}
	disk := DiskBlobs{Root: root}
	if mode == "disk" {
		return disk, "local disk"
	}
	if !cfg.Ready() {
		return disk, "object storage config incomplete; staying on local disk (code ready, production data not switched)"
	}
	if mode != "s3" && mode != "auto" {
		return disk, "unknown MEDIA_STORE mode; staying on local disk"
	}
	return NewS3Blobs(cfg, nil), "s3-compatible " + strings.TrimSpace(cfg.Endpoint) + "/" + strings.TrimSpace(cfg.Bucket)
}

// S3Blobs 用 SigV4 访问 S3 兼容接口（MinIO / AWS）。测试可注入 HTTP 客户端。
type S3Blobs struct {
	cfg    ObjectConfig
	client *http.Client
	now    func() time.Time
}

func NewS3Blobs(cfg ObjectConfig, client *http.Client) *S3Blobs {
	if client == nil {
		client = http.DefaultClient
	}
	if strings.TrimSpace(cfg.Region) == "" {
		cfg.Region = "us-east-1"
	}
	return &S3Blobs{cfg: cfg, client: client, now: time.Now}
}

func (s *S3Blobs) Name() string { return "s3" }

func (s *S3Blobs) Put(ctx context.Context, key string, r io.Reader, size int64) error {
	req, err := s.newRequest(ctx, http.MethodPut, key, r, size)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("s3 put: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (s *S3Blobs) Open(ctx context.Context, key string) (io.ReadCloser, int64, error) {
	req, err := s.newRequest(ctx, http.MethodGet, key, nil, 0)
	if err != nil {
		return nil, 0, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		_ = resp.Body.Close()
		return nil, 0, fmt.Errorf("s3 get: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return resp.Body, resp.ContentLength, nil
}

func (s *S3Blobs) Remove(ctx context.Context, key string) error {
	req, err := s.newRequest(ctx, http.MethodDelete, key, nil, 0)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("s3 delete: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (s *S3Blobs) newRequest(ctx context.Context, method, key string, body io.Reader, size int64) (*http.Request, error) {
	objectURL, host, canonicalURI := s.objectURL(key)
	req, err := http.NewRequestWithContext(ctx, method, objectURL, body)
	if err != nil {
		return nil, err
	}
	if size > 0 && body != nil {
		req.ContentLength = size
	}
	now := s.now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	req.Header.Set("Host", host)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", "UNSIGNED-PAYLOAD")
	req.Header.Set("Authorization", s.sign(method, canonicalURI, host, amzDate, dateStamp))
	return req, nil
}

func (s *S3Blobs) objectURL(key string) (rawURL, host, canonicalURI string) {
	key = sanitizeObjectKey(key)
	if prefix := strings.Trim(strings.ReplaceAll(s.cfg.Prefix, "\\", "/"), "/"); prefix != "" {
		key = prefix + "/" + key
	}
	endpoint := strings.TrimSpace(s.cfg.Endpoint)
	endpoint = strings.TrimRight(endpoint, "/")
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	scheme := "http"
	if s.cfg.UseSSL {
		scheme = "https"
	}
	bucket := strings.TrimSpace(s.cfg.Bucket)
	escaped := escapePath(key)
	canonicalURI = "/" + bucket + "/" + escaped
	host = endpoint
	rawURL = scheme + "://" + host + canonicalURI
	return rawURL, host, canonicalURI
}

func (s *S3Blobs) sign(method, canonicalURI, host, amzDate, dateStamp string) string {
	region := strings.TrimSpace(s.cfg.Region)
	canonicalHeaders := "host:" + host + "\n" + "x-amz-content-sha256:UNSIGNED-PAYLOAD\n" + "x-amz-date:" + amzDate + "\n"
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		"",
		canonicalHeaders,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	}, "\n")
	scope := dateStamp + "/" + region + "/s3/aws4_request"
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(hashSHA256([]byte(canonicalRequest))),
	}, "\n")
	signingKey := deriveSigningKey(s.cfg.SecretKey, dateStamp, region, "s3")
	sig := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))
	return fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		s.cfg.AccessKey, scope, signedHeaders, sig,
	)
}

func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func hashSHA256(b []byte) []byte {
	sum := sha256.Sum256(b)
	return sum[:]
}

func hmacSHA256(key []byte, s string) []byte {
	m := hmac.New(sha256.New, key)
	_, _ = m.Write([]byte(s))
	return m.Sum(nil)
}

func deriveSigningKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}
