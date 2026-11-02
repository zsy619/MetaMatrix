package service

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/png"
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

func TestCaptchaImageIsRenderablePNG(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, false)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if challenge.DebugAnswer != "" {
		t.Fatalf("debug answer leaked in production mode: %q", challenge.DebugAnswer)
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(challenge.Image, prefix) {
		t.Fatalf("image = %.40q, want png data uri", challenge.Image)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(challenge.Image, prefix))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !bytes.HasPrefix(raw, []byte("\x89PNG\r\n\x1a\n")) {
		t.Fatalf("not a png file")
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("png decode: %v", err)
	}
	if img.Bounds().Dx() != captchaWidth || img.Bounds().Dy() != captchaHeight {
		t.Fatalf("size = %v, want %dx%d", img.Bounds(), captchaWidth, captchaHeight)
	}
}

// The old SVG rendering put the answer in a <text> element, so any script
// could decode the data URI and read the captcha. The PNG must not carry the
// answer in a readable form.
func TestCaptchaImageDoesNotLeakAnswer(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	challenge, err := svc.Issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(challenge.Image, "data:image/png;base64,"))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if bytes.Contains(raw, []byte(challenge.DebugAnswer)) {
		t.Fatalf("png payload contains the plain answer")
	}
	if bytes.Contains(raw, []byte("<text")) || bytes.Contains(raw, []byte("<svg")) {
		t.Fatalf("png payload contains markup")
	}
}

func TestCaptchaIssueIsRateLimitedPerClient(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	for i := 0; i < captchaIssueLimit; i++ {
		if _, err := svc.IssueFor("1.2.3.4"); err != nil {
			t.Fatalf("issue %d: %v", i, err)
		}
	}
	if _, err := svc.IssueFor("1.2.3.4"); err != ErrCaptchaTooMany {
		t.Fatalf("over limit = %v, want %v", err, ErrCaptchaTooMany)
	}
	// A different client is not affected by the first client's usage.
	if _, err := svc.IssueFor("5.6.7.8"); err != nil {
		t.Fatalf("other client: %v", err)
	}
}

func TestCaptchaEntryCapKeepsMemoryBounded(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	for i := 0; i < captchaMaxEntries+50; i++ {
		// A fresh key per call, so the per client rate limit does not stop
		// the flood before the entry cap is reached.
		if _, err := svc.IssueFor(fmt.Sprintf("flooder-%d", i)); err != nil {
			t.Fatalf("issue %d: %v", i, err)
		}
	}
	if svc.Len() > captchaMaxEntries {
		t.Fatalf("entries = %d, want <= %d", svc.Len(), captchaMaxEntries)
	}
}

// A caller without an identified peer address is not rate limited, otherwise
// every unidentified caller would share one bucket and lock each other out.
func TestCaptchaWithoutClientKeyIsNotRateLimited(t *testing.T) {
	svc := NewCaptchaService(5*time.Minute, true)
	for i := 0; i < captchaIssueLimit+10; i++ {
		if _, err := svc.Issue(); err != nil {
			t.Fatalf("issue %d: %v", i, err)
		}
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
