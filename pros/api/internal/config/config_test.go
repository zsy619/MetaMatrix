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
