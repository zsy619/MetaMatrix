package handler

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"metamatrix/api/internal/model"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/google/uuid"
)

// stubAuth is a database free auth backend. It records whether the credential
// check ran, so a test can prove the captcha gate stopped the request first.
type stubAuth struct {
	captcha *service.CaptchaService

	loginCalls    int
	registerCalls int
}

func (s *stubAuth) Register(email, password, displayName string) (*model.User, string, error) {
	s.registerCalls++
	return &model.User{ID: uuid.New(), Email: email}, "token", nil
}

func (s *stubAuth) Login(email, password string) (*model.User, string, error) {
	s.loginCalls++
	return &model.User{ID: uuid.New(), Email: email}, "token", nil
}

func (s *stubAuth) Refresh(userID uuid.UUID) (*model.User, string, error) {
	return &model.User{ID: userID}, "token", nil
}

func (s *stubAuth) ChangePassword(userID uuid.UUID, current, next string) error {
	return nil
}

func (s *stubAuth) Me(userID uuid.UUID) (*model.User, error) {
	return &model.User{ID: userID}, nil
}

func (s *stubAuth) VerifyCaptcha(captchaID, captchaAnswer string) error {
	return s.captcha.Verify(captchaID, captchaAnswer)
}

func (s *stubAuth) NewCaptcha() (service.CaptchaChallenge, error) {
	return s.captcha.Issue()
}

func newAuthEngine(stub *stubAuth) *route.Engine {
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewAuthHandler(stub, nil)
	engine.POST("/auth/login", h.Login)
	engine.POST("/auth/register", h.Register)
	engine.GET("/auth/captcha", h.Captcha)
	return engine
}

func postJSON(t *testing.T, engine *route.Engine, path string, body map[string]string) *ut.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return ut.PerformRequest(engine, "POST", path, &ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		ut.Header{Key: "Content-Type", Value: "application/json"})
}

func decodeBody(t *testing.T, rec *ut.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return out
}

func TestCaptchaEndpointReturnsChallenge(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := ut.PerformRequest(engine, "GET", "/auth/captcha", nil)
	if rec.Code != 200 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	body := decodeBody(t, rec)
	if body["captchaId"] == "" || body["captchaId"] == nil {
		t.Fatalf("captchaId missing: %v", body)
	}
	image, _ := body["image"].(string)
	if len(image) == 0 {
		t.Fatalf("image missing: %v", body)
	}
}

func TestLoginRejectsWrongCaptcha(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := postJSON(t, engine, "/auth/login", map[string]string{
		"email": "demo@metamatrix.local", "password": "demo123456",
		"captchaId": "bogus-id", "captchaCode": "ABCD",
	})
	if rec.Code != 400 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if code := decodeBody(t, rec)["code"]; code != "captcha_invalid" {
		t.Fatalf("code = %v, want captcha_invalid", code)
	}
	if stub.loginCalls != 0 {
		t.Fatalf("credential check ran %d times, want 0", stub.loginCalls)
	}
}

func TestLoginRejectsMissingCaptcha(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := postJSON(t, engine, "/auth/login", map[string]string{
		"email": "demo@metamatrix.local", "password": "demo123456",
	})
	if rec.Code != 400 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if code := decodeBody(t, rec)["code"]; code != "captcha_required" {
		t.Fatalf("code = %v, want captcha_required", code)
	}
	if stub.loginCalls != 0 {
		t.Fatalf("credential check ran %d times, want 0", stub.loginCalls)
	}
}

func TestLoginAcceptsCorrectCaptcha(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := ut.PerformRequest(engine, "GET", "/auth/captcha", nil)
	challenge := decodeBody(t, rec)
	captchaID, _ := challenge["captchaId"].(string)
	answer, _ := challenge["debugAnswer"].(string)
	if captchaID == "" || answer == "" {
		t.Fatalf("challenge = %v", challenge)
	}

	rec = postJSON(t, engine, "/auth/login", map[string]string{
		"email": "demo@metamatrix.local", "password": "demo123456",
		"captchaId": captchaID, "captchaCode": answer,
	})
	if rec.Code != 200 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if stub.loginCalls != 1 {
		t.Fatalf("credential check ran %d times, want 1", stub.loginCalls)
	}
}

func TestRegisterRejectsWrongCaptcha(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := postJSON(t, engine, "/auth/register", map[string]string{
		"email": "new@metamatrix.local", "password": "demo123456",
		"captchaId": "bogus-id", "captchaCode": "ABCD",
	})
	if rec.Code != 400 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if code := decodeBody(t, rec)["code"]; code != "captcha_invalid" {
		t.Fatalf("code = %v, want captcha_invalid", code)
	}
	if stub.registerCalls != 0 {
		t.Fatalf("register ran %d times, want 0", stub.registerCalls)
	}
}

func TestRegisterAcceptsCorrectCaptcha(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := ut.PerformRequest(engine, "GET", "/auth/captcha", nil)
	challenge := decodeBody(t, rec)
	captchaID, _ := challenge["captchaId"].(string)
	answer, _ := challenge["debugAnswer"].(string)

	rec = postJSON(t, engine, "/auth/register", map[string]string{
		"email": "new@metamatrix.local", "password": "demo123456",
		"captchaId": captchaID, "captchaCode": answer,
	})
	if rec.Code != 201 {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	if stub.registerCalls != 1 {
		t.Fatalf("register ran %d times, want 1", stub.registerCalls)
	}
}

func TestCaptchaCannotBeReplayed(t *testing.T) {
	stub := &stubAuth{captcha: service.NewCaptchaService(5*time.Minute, true)}
	engine := newAuthEngine(stub)

	rec := ut.PerformRequest(engine, "GET", "/auth/captcha", nil)
	challenge := decodeBody(t, rec)
	captchaID, _ := challenge["captchaId"].(string)
	answer, _ := challenge["debugAnswer"].(string)

	first := postJSON(t, engine, "/auth/login", map[string]string{
		"email": "demo@metamatrix.local", "password": "demo123456",
		"captchaId": captchaID, "captchaCode": answer,
	})
	if first.Code != 200 {
		t.Fatalf("first code = %d, body = %s", first.Code, first.Body.String())
	}
	second := postJSON(t, engine, "/auth/login", map[string]string{
		"email": "demo@metamatrix.local", "password": "demo123456",
		"captchaId": captchaID, "captchaCode": answer,
	})
	if second.Code != 400 {
		t.Fatalf("replay code = %d, body = %s", second.Code, second.Body.String())
	}
	if stub.loginCalls != 1 {
		t.Fatalf("credential check ran %d times, want 1", stub.loginCalls)
	}
}
