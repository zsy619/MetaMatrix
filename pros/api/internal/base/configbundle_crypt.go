package base

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
)

// 配置包加密（§47 遗留项）。
//
// 与「签名」的区别：
//   - 签名（HMAC）只保证「包没被改过、来自本平台」，**内容仍是明文**；
//   - 加密（AES-256-GCM）保证「只有拿到口令的人能读懂包内容」。
//
// 密钥派生：PBKDF2-HMAC-SHA256（自带实现，避免为一个小功能引新依赖）：
//
//	key = PBKDF2(passphrase, salt, iterations=120000, 32 bytes)
//
// 密文格式：GCM 的 nonce 与密文拼在一起存放，附加认证数据（AAD）固定为
// "metamatrix/config-bundle/v1"，防止把别的密文挪过来用。
const (
	// BundleCryptoAlgorithm 是当前加密算法标识。
	BundleCryptoAlgorithm = "AES-256-GCM"
	// bundleCryptoInfo 是 KDF 的上下文串。
	bundleCryptoInfo = "metamatrix/config-bundle/v1"
	// bundleCryptoIterations 是 PBKDF2 迭代次数。
	bundleCryptoIterations = 120000
)

// ErrBundleDecryptFailed 表示口令错误或密文被篡改。
var ErrBundleDecryptFailed = errors.New("config bundle cannot be decrypted")

// EncryptedBundle 是加密后的配置包（可直接落盘 / 传输）。
type EncryptedBundle struct {
	FormatVersion int    `json:"formatVersion"`
	Algorithm     string `json:"algorithm"`
	KDF           string `json:"kdf"`
	Iterations    int    `json:"iterations"`
	// Salt / Nonce / Ciphertext 都是 base64。
	Salt       string `json:"salt"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
	// ExportedAt 便于人工确认包的产生时间。
	ExportedAt string `json:"exportedAt,omitempty"`
}

// pbkdf2SHA256 是 PBKDF2-HMAC-SHA256 的标准实现（RFC 8018）。
func pbkdf2SHA256(password, salt []byte, iter, keyLen int) []byte {
	hLen := sha256.Size
	blocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, blocks*hLen)
	buf := make([]byte, 4)
	for block := 1; block <= blocks; block++ {
		mac := hmacSHA256(password, salt)
		buf[0] = byte(block >> 24)
		buf[1] = byte(block >> 16)
		buf[2] = byte(block >> 8)
		buf[3] = byte(block)
		mac.Write(buf)
		u := mac.Sum(nil)
		t := make([]byte, len(u))
		copy(t, u)
		for i := 1; i < iter; i++ {
			mac = hmacSHA256(password, u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

// EncryptBundle 用口令加密配置包。
func EncryptBundle(bundle *ConfigBundle, passphrase string) (*EncryptedBundle, error) {
	if bundle == nil {
		return nil, errors.New("bundle is nil")
	}
	if len(passphrase) < 8 {
		return nil, errors.New("passphrase is too short (>= 8 characters required)")
	}
	plain, err := json.Marshal(bundle)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key := pbkdf2SHA256([]byte(passphrase), salt, bundleCryptoIterations, 32)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	sealed := gcm.Seal(nil, nonce, plain, []byte(bundleCryptoInfo))
	return &EncryptedBundle{
		FormatVersion: ConfigBundleFormatVersion,
		Algorithm:     BundleCryptoAlgorithm,
		KDF:           "PBKDF2-HMAC-SHA256",
		Iterations:    bundleCryptoIterations,
		Salt:          base64.StdEncoding.EncodeToString(salt),
		Nonce:         base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:    base64.StdEncoding.EncodeToString(sealed),
		ExportedAt:    bundle.ExportedAt.Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}

// DecryptBundle 用口令解密配置包。
func DecryptBundle(enc *EncryptedBundle, passphrase string) (*ConfigBundle, error) {
	if enc == nil {
		return nil, errors.New("encrypted bundle is nil")
	}
	if enc.Algorithm != "" && enc.Algorithm != BundleCryptoAlgorithm {
		return nil, fmt.Errorf("%w: unsupported algorithm %q", ErrBundleDecryptFailed, enc.Algorithm)
	}
	salt, err := base64.StdEncoding.DecodeString(enc.Salt)
	if err != nil {
		return nil, ErrBundleDecryptFailed
	}
	nonce, err := base64.StdEncoding.DecodeString(enc.Nonce)
	if err != nil {
		return nil, ErrBundleDecryptFailed
	}
	ciphertext, err := base64.StdEncoding.DecodeString(enc.Ciphertext)
	if err != nil {
		return nil, ErrBundleDecryptFailed
	}
	iterations := enc.Iterations
	if iterations <= 0 {
		iterations = bundleCryptoIterations
	}
	key := pbkdf2SHA256([]byte(passphrase), salt, iterations, 32)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, ErrBundleDecryptFailed
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, ErrBundleDecryptFailed
	}
	plain, err := gcm.Open(nil, nonce, ciphertext, []byte(bundleCryptoInfo))
	if err != nil {
		// 口令错 / 密文被改过：GCM 认证失败。
		return nil, ErrBundleDecryptFailed
	}
	var bundle ConfigBundle
	if err := json.Unmarshal(plain, &bundle); err != nil {
		return nil, ErrBundleDecryptFailed
	}
	return &bundle, nil
}

// hmacSHA256 返回一个已写入密钥的 HMAC 哈希实例。
func hmacSHA256(key, data []byte) hash.Hash {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac
}
