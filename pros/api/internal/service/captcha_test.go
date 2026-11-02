package service

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestCaptchaCorrectAnswerPasses(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if challenge.ID == "" || challenge.DebugAnswer == "" {
		t.Fatalf("challenge = %+v", challenge)
	}
	if len(challenge.DebugAnswer) != captchaLength {
		t.Fatalf("answer length = %d", len(challenge.DebugAnswer))
	}
	if err := svc.Verify(challenge.ID, challenge.DebugAnswer); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestCaptchaWrongAnswerFails(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	wrong := "ZZZZ"
	if challenge.DebugAnswer == wrong {
		wrong = "YYYY"
	}
	if err := svc.Verify(challenge.ID, wrong); err != ErrCaptchaInvalid {
		t.Fatalf("wrong answer = %v, want %v", err, ErrCaptchaInvalid)
	}
}

func TestCaptchaExpiredFails(t *testing.T) {
	svc := NewCaptchaService(time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	now := time.Now()
	svc.SetClock(func() time.Time { return now.Add(2 * time.Minute) })
	if err := svc.Verify(challenge.ID, challenge.DebugAnswer); err != ErrCaptchaExpired {
		t.Fatalf("expired = %v, want %v", err, ErrCaptchaExpired)
	}
}

func TestCaptchaMissingFails(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	if err := svc.Verify("", "ABCD"); err != ErrCaptchaRequired {
		t.Fatalf("empty id = %v, want %v", err, ErrCaptchaRequired)
	}
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if err := svc.Verify(challenge.ID, ""); err != ErrCaptchaRequired {
		t.Fatalf("empty answer = %v, want %v", err, ErrCaptchaRequired)
	}
}

func TestCaptchaUnknownIDFails(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	if err := svc.Verify("not-a-real-id", "ABCD"); err != ErrCaptchaInvalid {
		t.Fatalf("unknown id = %v, want %v", err, ErrCaptchaInvalid)
	}
}

func TestCaptchaIsSingleUse(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if err := svc.Verify(challenge.ID, challenge.DebugAnswer); err != nil {
		t.Fatalf("first verify: %v", err)
	}
	if err := svc.Verify(challenge.ID, challenge.DebugAnswer); err != ErrCaptchaInvalid {
		t.Fatalf("replay = %v, want %v", err, ErrCaptchaInvalid)
	}
}

func TestCaptchaAnswerIsCaseInsensitive(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if err := svc.Verify(challenge.ID, strings.ToLower(challenge.DebugAnswer)); err != nil {
		t.Fatalf("lowercase verify: %v", err)
	}
}

func TestCaptchaWrongAnswersAreCapped(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	for i := 0; i < captchaMaxAttempts; i++ {
		if err := svc.Verify(challenge.ID, "0000"); err != ErrCaptchaInvalid {
			t.Fatalf("attempt %d = %v, want %v", i, err, ErrCaptchaInvalid)
		}
	}
	if svc.Len() != 0 {
		t.Fatalf("entries left = %d, want 0", svc.Len())
	}
}

func TestCaptchaImageIsRenderableSVG(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, false)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if challenge.DebugAnswer != "" {
		t.Fatalf("debug answer leaked in production mode: %q", challenge.DebugAnswer)
	}
	const prefix = "data:image/svg+xml;base64,"
	if !strings.HasPrefix(challenge.Image, prefix) {
		t.Fatalf("image = %.40q, want svg data uri", challenge.Image)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(challenge.Image, prefix))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	svg := string(raw)
	if !strings.HasPrefix(svg, "<svg") || !strings.Contains(svg, "</svg>") {
		t.Fatalf("not an svg document")
	}
	if !strings.Contains(svg, "<text") {
		t.Fatalf("svg has no text element")
	}
}

func TestAuthServiceVerifyCaptcha(t *testing.T) {
	captcha := NewCaptchaService(5*time.Minute, true)
	svc := NewAuthService(nil, "secret", captcha)
	challenge, err := captcha.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if err := svc.VerifyCaptcha(challenge.ID, "NOPE"); err != ErrCaptchaInvalid {
		t.Fatalf("wrong = %v, want %v", err, ErrCaptchaInvalid)
	}
	if err := svc.VerifyCaptcha(challenge.ID, challenge.DebugAnswer); err != nil {
		t.Fatalf("correct = %v", err)
	}
}

func TestAuthServiceCaptchaIsRequired(t *testing.T) {
	captcha := NewCaptchaService(5*time.Minute, true)
	svc := NewAuthService(nil, "secret", captcha)
	if err := svc.VerifyCaptcha("", ""); err != ErrCaptchaRequired {
		t.Fatalf("missing = %v, want %v", err, ErrCaptchaRequired)
	}
}
