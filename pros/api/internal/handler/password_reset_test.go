package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
)

// fakeResetBackend records the calls the handler makes.
type fakeResetBackend struct {
	result service.ResetRequestResult
	err    error
	// lastEmail and lastIP record the arguments of the last request.
	lastEmail string
	lastIP    string
	// resetErr is the error of the confirm call.
	resetErr error
	// resetCalls counts the confirm calls.
	resetCalls int
	// verifyErr is the error of the verify call.
	verifyErr error
	// verifyCalls counts the verify calls.
	verifyCalls int
	// sessionToken is what the verify call returns.
	sessionToken string
}

func (f *fakeResetBackend) RequestCode(_ context.Context, email, ip string) (service.ResetRequestResult, error) {
	f.lastEmail = email
	f.lastIP = ip
	return f.result, f.err
}

func (f *fakeResetBackend) VerifyCode(_, _ string) (string, error) {
	f.verifyCalls++
	return f.sessionToken, f.verifyErr
}

func (f *fakeResetBackend) ResetPasswordWithSession(_, _ string) error {
	f.resetCalls++
	return f.resetErr
}

// newResetEngine builds a router with the two reset endpoints.
func newResetEngine(t *testing.T, backend PasswordResetBackend, opts PasswordResetOptions) *route.Engine {
	t.Helper()
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewPasswordResetHandler(backend, opts)
	engine.POST("/auth/password-reset/request", h.Request)
	engine.POST("/auth/password-reset/verify", h.Verify)
	engine.POST("/auth/password-reset/confirm", h.Confirm)
	return engine
}

// postResetJSON posts a JSON object to a path and returns the recorder.
func postResetJSON(t *testing.T, engine *route.Engine, path string, body map[string]string) *ut.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return ut.PerformRequest(engine, http.MethodPost, path,
		&ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		ut.Header{Key: "Content-Type", Value: "application/json"})
}

// doResetRequest posts to the request endpoint.
func doResetRequest(t *testing.T, engine *route.Engine, body string) (int, map[string]interface{}) {
	t.Helper()
	rec := postResetJSON(t, engine, "/auth/password-reset/request", map[string]string{"email": body})
	return rec.Code, decodeResetBody(t, rec.Body.Bytes())
}

// doResetConfirm posts to the confirm endpoint.
func doResetConfirm(t *testing.T, engine *route.Engine, sessionToken, newPassword string) (int, map[string]interface{}) {
	t.Helper()
	rec := postResetJSON(t, engine, "/auth/password-reset/confirm", map[string]string{
		"sessionToken": sessionToken, "newPassword": newPassword,
	})
	return rec.Code, decodeResetBody(t, rec.Body.Bytes())
}

// doResetVerify posts to the verify endpoint.
func doResetVerify(t *testing.T, engine *route.Engine, email, code string) (int, map[string]interface{}) {
	t.Helper()
	rec := postResetJSON(t, engine, "/auth/password-reset/verify", map[string]string{
		"email": email, "code": code,
	})
	return rec.Code, decodeResetBody(t, rec.Body.Bytes())
}

func decodeResetBody(t *testing.T, body []byte) map[string]interface{} {
	t.Helper()
	out := map[string]interface{}{}
	if len(body) == 0 {
		return out
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("decode body %q: %v", string(body), err)
	}
	return out
}

// TestRequestUniformModeHidesUnknownAddress checks that a registered and an
// unregistered address produce the same answer.
func TestRequestUniformModeHidesUnknownAddress(t *testing.T) {
	known := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: true, Delivered: true}}
	unknown := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: false}}

	engineKnown := newResetEngine(t, known, PasswordResetOptions{UnknownEmailMode: "uniform"})
	engineUnknown := newResetEngine(t, unknown, PasswordResetOptions{UnknownEmailMode: "uniform"})

	statusA, bodyA := doResetRequest(t, engineKnown, "known@example.com")
	statusB, bodyB := doResetRequest(t, engineUnknown, "unknown@example.com")

	if statusA != http.StatusOK || statusB != http.StatusOK {
		t.Fatalf("both requests must succeed, got %d and %d", statusA, statusB)
	}
	if bodyA["message"] != bodyB["message"] {
		t.Fatalf("the message must not reveal whether the account exists: %q vs %q", bodyA["message"], bodyB["message"])
	}
	if bodyA["status"] != bodyB["status"] {
		t.Fatalf("the status must not reveal whether the account exists: %q vs %q", bodyA["status"], bodyB["status"])
	}
}

// TestRequestExplicitModeReportsUnknownAddress checks the friendly mode.
func TestRequestExplicitModeReportsUnknownAddress(t *testing.T) {
	unknown := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: false}}
	engine := newResetEngine(t, unknown, PasswordResetOptions{UnknownEmailMode: "explicit"})

	status, body := doResetRequest(t, engine, "unknown@example.com")
	if status != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", status)
	}
	if body["code"] != "email_not_registered" {
		t.Fatalf("expected the email_not_registered code, got %v", body["code"])
	}
}

// TestRequestRateLimited answers 429 with a Retry-After header.
func TestRequestRateLimited(t *testing.T) {
	backend := &fakeResetBackend{
		err:    service.ErrResetRateLimited,
		result: service.ResetRequestResult{RetryAfter: 42 * time.Second},
	}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetRequest(t, engine, "known@example.com")
	if status != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", status)
	}
	if body["code"] != "rate_limited" {
		t.Fatalf("expected the rate_limited code, got %v", body["code"])
	}
	if body["retryAfterSeconds"] != float64(42) {
		t.Fatalf("expected 42 seconds, got %v", body["retryAfterSeconds"])
	}
}

// TestRequestMailUnavailable answers 503 so the user is not left waiting.
func TestRequestMailUnavailable(t *testing.T) {
	backend := &fakeResetBackend{err: service.ErrResetMailUnavailable}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetRequest(t, engine, "known@example.com")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", status)
	}
	if body["code"] != "mail_unavailable" {
		t.Fatalf("expected the mail_unavailable code, got %v", body["code"])
	}
}

// TestRequestInvalidEmail answers 400.
func TestRequestInvalidEmail(t *testing.T) {
	backend := &fakeResetBackend{err: service.ErrInvalidEmail}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetRequest(t, engine, "not-an-email")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "invalid_email" {
		t.Fatalf("expected the invalid_email code, got %v", body["code"])
	}
}

// TestRequestRevealsCodeOnlyWhenAsked checks the development convenience.
func TestRequestRevealsCodeOnlyWhenAsked(t *testing.T) {
	backend := &fakeResetBackend{result: service.ResetRequestResult{
		AccountExists: true, Delivered: true, Code: "482913",
	}}

	engine := newResetEngine(t, backend, PasswordResetOptions{RevealCode: false})
	_, body := doResetRequest(t, engine, "known@example.com")
	if _, ok := body["debugCode"]; ok {
		t.Fatal("the code must not be in the response when reveal is off")
	}

	engine = newResetEngine(t, backend, PasswordResetOptions{RevealCode: true})
	_, body = doResetRequest(t, engine, "known@example.com")
	if body["debugCode"] != "482913" {
		t.Fatalf("expected the code in the response, got %v", body["debugCode"])
	}
}

// TestConfirmSuccess answers 200.
func TestConfirmSuccess(t *testing.T) {
	backend := &fakeResetBackend{}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetConfirm(t, engine, "session-token", "new-password-1")
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", status, body["message"])
	}
	if backend.resetCalls != 1 {
		t.Fatalf("expected 1 confirm call, got %d", backend.resetCalls)
	}
}

// TestVerifyReturnsSessionToken checks that a correct code yields a session
// token instead of changing the password.
func TestVerifyReturnsSessionToken(t *testing.T) {
	backend := &fakeResetBackend{sessionToken: "sess-abc-123"}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetVerify(t, engine, "a@b.c", "482913")
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", status, body["message"])
	}
	if body["sessionToken"] != "sess-abc-123" {
		t.Fatalf("expected the session token, got %v", body["sessionToken"])
	}
	if backend.verifyCalls != 1 {
		t.Fatalf("expected 1 verify call, got %d", backend.verifyCalls)
	}
	// The password must not change at the verification step.
	if backend.resetCalls != 0 {
		t.Fatal("verification must not change the password")
	}
}

// TestVerifyInvalidCode answers 400.
func TestVerifyInvalidCode(t *testing.T) {
	backend := &fakeResetBackend{verifyErr: service.ErrResetCodeInvalid}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetVerify(t, engine, "a@b.c", "000000")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_code_invalid" {
		t.Fatalf("expected the reset_code_invalid code, got %v", body["code"])
	}
}

// TestVerifyExpiredCode answers 400.
func TestVerifyExpiredCode(t *testing.T) {
	backend := &fakeResetBackend{verifyErr: service.ErrResetCodeExpired}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetVerify(t, engine, "a@b.c", "482913")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_code_expired" {
		t.Fatalf("expected the reset_code_expired code, got %v", body["code"])
	}
}

// TestConfirmInvalidSession answers 400.
func TestConfirmInvalidSession(t *testing.T) {
	backend := &fakeResetBackend{resetErr: service.ErrResetSessionInvalid}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetConfirm(t, engine, "bad-session", "new-password-1")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_session_invalid" {
		t.Fatalf("expected the reset_session_invalid code, got %v", body["code"])
	}
}

// TestConfirmInvalidCode answers 400.
func TestConfirmInvalidCode(t *testing.T) {
	backend := &fakeResetBackend{resetErr: service.ErrResetSessionInvalid}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetConfirm(t, engine, "bad-session", "new-password-1")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_session_invalid" {
		t.Fatalf("expected the reset_session_invalid code, got %v", body["code"])
	}
}

// TestConfirmExpiredCode answers 400 with its own code.
func TestConfirmExpiredCode(t *testing.T) {
	backend := &fakeResetBackend{resetErr: service.ErrResetCodeExpired}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetConfirm(t, engine, "session", "new-password-1")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_code_expired" {
		t.Fatalf("expected the reset_code_expired code, got %v", body["code"])
	}
}

// TestConfirmNoActiveCodeLooksInvalid makes sure the endpoint does not reveal
// whether a code ever existed.
func TestConfirmNoActiveCodeLooksInvalid(t *testing.T) {
	backend := &fakeResetBackend{verifyErr: service.ErrResetNoActiveCode}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetVerify(t, engine, "a@b.c", "000000")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_code_invalid" {
		t.Fatalf("expected the reset_code_invalid code, got %v", body["code"])
	}
}

// TestVerifyNoActiveCodeInExplicitMode tells the user there is nothing to
// verify, so the UI can ask them to request a new code.
func TestVerifyNoActiveCodeInExplicitMode(t *testing.T) {
	backend := &fakeResetBackend{verifyErr: service.ErrResetNoActiveCode}
	engine := newResetEngine(t, backend, PasswordResetOptions{UnknownEmailMode: "explicit"})

	status, body := doResetVerify(t, engine, "a@b.c", "000000")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "reset_code_not_found" {
		t.Fatalf("expected the reset_code_not_found code, got %v", body["code"])
	}
}

// TestConfirmWeakPassword answers 400.
func TestConfirmWeakPassword(t *testing.T) {
	backend := &fakeResetBackend{resetErr: service.ErrWeakPassword}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	status, body := doResetConfirm(t, engine, "session", "123")
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if body["code"] != "weak_password" {
		t.Fatalf("expected the weak_password code, got %v", body["code"])
	}
}

// TestConfirmMalformedBody answers 400.
func TestConfirmMalformedBody(t *testing.T) {
	backend := &fakeResetBackend{}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	raw := []byte(`{"email":`)
	rec := ut.PerformRequest(engine, http.MethodPost, "/auth/password-reset/confirm",
		&ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		ut.Header{Key: "Content-Type", Value: "application/json"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if backend.resetCalls != 0 {
		t.Fatal("a malformed body must not reach the service")
	}
}

// TestCooldownIsReportedToTheClient checks that the client learns the same
// cooldown the server enforces.
func TestCooldownIsReportedToTheClient(t *testing.T) {
	backend := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: true, Delivered: true}}
	engine := newResetEngine(t, backend, PasswordResetOptions{Cooldown: 90 * time.Second})

	_, body := doResetRequest(t, engine, "a@b.c")
	if body["cooldownSeconds"] != float64(90) {
		t.Fatalf("expected 90 seconds, got %v", body["cooldownSeconds"])
	}
}

// TestRequestBodyIsBound checks that the email reaches the service.
func TestRequestBodyIsBound(t *testing.T) {
	backend := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: true, Delivered: true}}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	doResetRequest(t, engine, "user@example.com")
	if backend.lastEmail != "user@example.com" {
		t.Fatalf("expected the email to reach the service, got %q", backend.lastEmail)
	}
	if backend.lastIP == "" {
		t.Fatal("the request IP must reach the service for the rate limit")
	}
}

// TestBodyIsNotEchoed makes sure the response does not carry the address.
func TestBodyIsNotEchoed(t *testing.T) {
	backend := &fakeResetBackend{result: service.ResetRequestResult{AccountExists: true, Delivered: true}}
	engine := newResetEngine(t, backend, PasswordResetOptions{})

	rec := postResetJSON(t, engine, "/auth/password-reset/request", map[string]string{
		"email": "user@example.com",
	})
	if bytes.Contains(rec.Body.Bytes(), []byte("user@example.com")) {
		t.Fatal("the response must not echo the address")
	}
	if !strings.Contains(rec.Body.String(), "status") {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}
