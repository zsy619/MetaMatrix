package base

import (
	"strings"
	"testing"
)

// 配置包加密：口令正确能还原，口令错误必须失败。
func TestEncryptDecryptBundle(t *testing.T) {
	bundle := &ConfigBundle{
		FormatVersion: ConfigBundleFormatVersion,
		Table: struct {
			Name        string `json:"name"`
			Description string `json:"description,omitempty"`
		}{Name: "客户表"},
	}
	bundle.Fields = []BundleField{{Key: "f1", Name: "名称", Type: "text"}}

	enc, err := EncryptBundle(bundle, "correct-passphrase")
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}
	if enc.Algorithm != BundleCryptoAlgorithm {
		t.Fatalf("unexpected algorithm %q", enc.Algorithm)
	}
	if strings.Contains(enc.Ciphertext, "客户表") {
		t.Fatal("ciphertext must not contain plaintext")
	}

	got, err := DecryptBundle(enc, "correct-passphrase")
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if got.Table.Name != "客户表" || len(got.Fields) != 1 || got.Fields[0].Name != "名称" {
		t.Fatalf("decrypted bundle mismatch: %+v", got)
	}

	if _, err := DecryptBundle(enc, "wrong-passphrase"); err == nil {
		t.Fatal("wrong passphrase should fail")
	}
}

// 口令太短必须被拒绝（避免弱口令把包「加密成明文」）。
func TestEncryptBundleRejectsShortPassphrase(t *testing.T) {
	if _, err := EncryptBundle(&ConfigBundle{}, "123"); err == nil {
		t.Fatal("short passphrase should be rejected")
	}
}
