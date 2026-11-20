package config

import "testing"

// The CI smoke test has to finish a real captcha round trip, so the API
// enables the loopback answer switch automatically inside a CI runner.
func TestCaptchaDebugLoopbackTurnsOnInCI(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("CI", "true")
	t.Setenv("CAPTCHA_DEBUG_LOOPBACK", "")
	if !runningInCI() {
		t.Fatalf("runningInCI() = false, want true")
	}
	cfg := Load()
	if !cfg.CaptchaDebugLoopback {
		t.Fatalf("CaptchaDebugLoopback = false, want true")
	}
}

// Outside CI the switch stays off, so a production API never hands the plain
// answer to anybody.
func TestCaptchaDebugLoopbackStaysOffOutsideCI(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "false")
	t.Setenv("CI", "false")
	t.Setenv("CAPTCHA_DEBUG_LOOPBACK", "")
	if runningInCI() {
		t.Fatalf("runningInCI() = true, want false")
	}
	cfg := Load()
	if cfg.CaptchaDebugLoopback {
		t.Fatalf("CaptchaDebugLoopback = true, want false")
	}
}

// An explicit setting always wins over the CI default.
func TestCaptchaDebugLoopbackCanBeForcedOffInCI(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "true")
	t.Setenv("CI", "true")
	t.Setenv("CAPTCHA_DEBUG_LOOPBACK", "false")
	cfg := Load()
	if cfg.CaptchaDebugLoopback {
		t.Fatalf("CaptchaDebugLoopback = true, want false")
	}
}

// 默认走显式模式：邮箱没注册时页面要能直接提示"这个邮箱还没有注册"，
// 而不是让用户对着一个永远收不到的验证码空等。
func TestUnknownEmailModeDefaultsToExplicit(t *testing.T) {
	t.Setenv("RESET_UNKNOWN_EMAIL_MODE", "")
	if got := Load().PasswordReset.UnknownEmailMode; got != UnknownEmailExplicit {
		t.Fatalf("UnknownEmailMode = %q, want %q", got, UnknownEmailExplicit)
	}
}

// 显式配置仍可切回统一响应，用于不想暴露账号是否存在的对外站点。
func TestUnknownEmailModeCanBeUniform(t *testing.T) {
	t.Setenv("RESET_UNKNOWN_EMAIL_MODE", "  UNIFORM ")
	if got := Load().PasswordReset.UnknownEmailMode; got != UnknownEmailUniform {
		t.Fatalf("UnknownEmailMode = %q, want %q", got, UnknownEmailUniform)
	}
}

// 变量写错时回落到统一响应：宁可少提示，也不要无意中放开账号枚举。
func TestUnknownEmailModeTypoFallsBackToUniform(t *testing.T) {
	t.Setenv("RESET_UNKNOWN_EMAIL_MODE", "explitcit")
	if got := Load().PasswordReset.UnknownEmailMode; got != UnknownEmailUniform {
		t.Fatalf("UnknownEmailMode = %q, want %q", got, UnknownEmailUniform)
	}
}
