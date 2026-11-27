package base

import (
	"context"
	"errors"
	"testing"
)

// TestConfigBundleSignRoundTrip 导出的包带签名，导入能通过校验。
func TestConfigBundleSignRoundTrip(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, _, _ := newBundleFixture(t)
	svc.SetBundleSigningKey("test-signing-secret")
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	if bundle.Signature == "" {
		t.Fatalf("expected signed bundle, got empty signature")
	}
	if bundle.SignatureAlgorithm != BundleSignatureAlgorithm {
		t.Fatalf("unexpected algorithm: %q", bundle.SignatureAlgorithm)
	}
	if err := svc.VerifyBundle(bundle); err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	// 导入（有签名）应当成功。
	if _, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle); err != nil {
		t.Fatalf("import signed bundle failed: %v", err)
	}
}

// TestConfigBundleTamperedRejected 包体被改过（字段名被篡改）后校验失败。
func TestConfigBundleTamperedRejected(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, _, _ := newBundleFixture(t)
	svc.SetBundleSigningKey("test-signing-secret")
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	bundle.Table.Name = "被篡改的表名"
	err = svc.VerifyBundle(bundle)
	if !errors.Is(err, ErrBundleSignatureInvalid) {
		t.Fatalf("expected ErrBundleSignatureInvalid, got %v", err)
	}
	// 导入时应被拒绝。
	if _, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle); !errors.Is(err, ErrBundleSignatureInvalid) {
		t.Fatalf("expected import rejected, got %v", err)
	}
}

// TestConfigBundleUnsignedStillImport 无签名的包（外部/历史导出）仍可导入。
func TestConfigBundleUnsignedStillImport(t *testing.T) {
	svc, adminID, _, projectID, baseID, tableID, _, _ := newBundleFixture(t)
	svc.SetBundleSigningKey("test-signing-secret")
	ctx := context.Background()

	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	bundle.Signature = ""
	bundle.SignatureAlgorithm = ""
	if err := svc.VerifyBundle(bundle); err != nil {
		t.Fatalf("unsigned bundle should pass verify, got %v", err)
	}
	if _, err := svc.ImportTableConfig(ctx, adminID, projectID, baseID, bundle); err != nil {
		t.Fatalf("import unsigned bundle failed: %v", err)
	}
}

// TestConfigBundleDifferentSecretRejected 不同密钥签发的包不能被验证。
func TestConfigBundleDifferentSecretRejected(t *testing.T) {
	svc, adminID, _, projectID, _, tableID, _, _ := newBundleFixture(t)
	svc.SetBundleSigningKey("secret-a")
	ctx := context.Background()
	bundle, err := svc.ExportTableConfig(ctx, adminID, projectID, tableID)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	svc.SetBundleSigningKey("secret-b")
	if err := svc.VerifyBundle(bundle); !errors.Is(err, ErrBundleSignatureInvalid) {
		t.Fatalf("expected signature mismatch, got %v", err)
	}
}
