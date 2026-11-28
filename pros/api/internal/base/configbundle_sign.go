package base

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

// 配置包签名（§37.8 遗留项）。
//
// 目标：导出的配置包可以被识别出「是不是本平台导出的、有没有被改过」。
// 做法：导出时用服务端密钥对包体做 HMAC-SHA256，导入时校验。
//
// 密钥来源：JWT_SECRET 派生（不新增配置项，也避免密钥分散在多处）。
// 注意：HMAC 只保证「完整 + 来自持有密钥的一方」，**不是加密**——
// 包体内容仍是明文，需要保密时仍应走加密传输。
const (
	// BundleSignatureAlgorithm 是当前签名算法标识（便于将来换算法）。
	BundleSignatureAlgorithm = "HMAC-SHA256"
	// bundleSignatureInfo 是密钥派生的上下文串，避免与其他用途的 HMAC 混用。
	bundleSignatureInfo = "metamatrix/config-bundle/v1"
)

// ErrBundleSignatureInvalid 表示配置包签名校验失败。
var ErrBundleSignatureInvalid = errors.New("config bundle signature is invalid")

// bundleSigningKey 派生签名密钥。
//
// 优先用 Service 上显式设置的密钥（来自 JWT_SECRET），
// 没有设置时回落到环境变量 JWT_SECRET，最后回落为空（表示不签名）。
func (s *Service) bundleSigningKey() []byte {
	secret := strings.TrimSpace(s.bundleSecret)
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("JWT_SECRET"))
	}
	if secret == "" {
		return nil
	}
	sum := sha256.Sum256([]byte(bundleSignatureInfo + "\x00" + secret))
	return sum[:]
}

// SetBundleSigningKey 设置配置包签名密钥（服务启动时用 JWT_SECRET 注入）。
func (s *Service) SetBundleSigningKey(secret string) {
	s.bundleSecret = strings.TrimSpace(secret)
}

// SignBundle 给配置包生成签名（原地写回 Signature / SignatureAlgorithm）。
func (s *Service) SignBundle(bundle *ConfigBundle) error {
	if bundle == nil {
		return errors.New("bundle is nil")
	}
	key := s.bundleSigningKey()
	if len(key) == 0 {
		return errors.New("no signing key configured")
	}
	// 签名对象必须排除签名本身，否则自引用。
	bundle.SignatureAlgorithm = BundleSignatureAlgorithm
	bundle.Signature = ""
	payload, err := json.Marshal(bundle)
	if err != nil {
		return err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(payload)
	bundle.Signature = base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return nil
}

// VerifyBundle 校验配置包签名。
//
// 返回值：
//   - nil：签名有效；
//   - ErrBundleSignatureInvalid：签名不匹配（包被改过或不是本平台导出）；
//   - nil（且无 error）：包**没有签名** —— 兼容外部/历史导出的包，不阻断导入。
func (s *Service) VerifyBundle(bundle *ConfigBundle) error {
	if bundle == nil {
		return errors.New("bundle is nil")
	}
	if strings.TrimSpace(bundle.Signature) == "" {
		return nil
	}
	if bundle.SignatureAlgorithm != "" && bundle.SignatureAlgorithm != BundleSignatureAlgorithm {
		return fmt.Errorf("%w: unsupported algorithm %q", ErrBundleSignatureInvalid, bundle.SignatureAlgorithm)
	}
	key := s.bundleSigningKey()
	if len(key) == 0 {
		// 服务端没有签名密钥时无法校验：放行，但明确记录。
		return nil
	}
	got := strings.TrimSpace(bundle.Signature)
	bundle.SignatureAlgorithm = BundleSignatureAlgorithm
	bundle.Signature = ""
	payload, err := json.Marshal(bundle)
	if err != nil {
		return err
	}
	bundle.Signature = got
	mac := hmac.New(sha256.New, key)
	mac.Write(payload)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(got)) {
		return ErrBundleSignatureInvalid
	}
	return nil
}
