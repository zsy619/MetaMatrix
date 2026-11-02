package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// AuthBackend is the part of the auth service the HTTP layer depends on.
// The interface keeps the handler testable without a database.
type AuthBackend interface {
	Register(email, password, displayName string) (*model.User, string, error)
	Login(email, password string) (*model.User, string, error)
	Refresh(userID uuid.UUID) (*model.User, string, error)
	ChangePassword(userID uuid.UUID, current, next string) error
	Me(userID uuid.UUID) (*model.User, error)
	VerifyCaptcha(captchaID, captchaAnswer string) error
	NewCaptcha() (service.CaptchaChallenge, error)
}

type AuthHandler struct {
	svc   AuthBackend
	limit *service.AttemptLimiter
}

func NewAuthHandler(svc AuthBackend, limit *service.AttemptLimiter) *AuthHandler {
	if limit == nil {
		limit = service.NewAttemptLimiter(15*time.Minute, 8, 30)
	}
	return &AuthHandler{svc: svc, limit: limit}
}

type registerBody struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	CaptchaID   string `json:"captchaId"`
	CaptchaCode string `json:"captchaCode"`
}

type loginBody struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	CaptchaID   string `json:"captchaId"`
	CaptchaCode string `json:"captchaCode"`
}

// Captcha issues a fresh image challenge. It is public because the login and
// register pages need a challenge before the user is authenticated.
func (h *AuthHandler) Captcha(ctx context.Context, c *app.RequestContext) {
	challenge, err := h.svc.NewCaptcha()
	if err != nil {
		Internal(c, "captcha issue failed")
		return
	}
	c.JSON(http.StatusOK, challenge)
}

// captchaFailure maps a captcha error onto the HTTP response. The message
// never reveals whether the id existed or the answer was wrong.
func captchaFailure(c *app.RequestContext, err error) {
	switch {
	case errors.Is(err, service.ErrCaptchaRequired):
		Fail(c, http.StatusBadRequest, "captcha required", "captcha_required")
	case errors.Is(err, service.ErrCaptchaExpired):
		Fail(c, http.StatusBadRequest, "captcha expired", "captcha_expired")
	default:
		Fail(c, http.StatusBadRequest, "captcha answer does not match", "captcha_invalid")
	}
}

func (h *AuthHandler) Register(ctx context.Context, c *app.RequestContext) {
	var body registerBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	if err := h.svc.VerifyCaptcha(body.CaptchaID, body.CaptchaCode); err != nil {
		captchaFailure(c, err)
		return
	}
	u, token, err := h.svc.Register(body.Email, body.Password, body.DisplayName)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmailTaken):
			Fail(c, http.StatusConflict, "email already registered", "email_taken")
		case errors.Is(err, service.ErrWeakPassword):
			Fail(c, http.StatusBadRequest, "password must be at least 6 characters", "weak_password")
		case errors.Is(err, service.ErrPasswordTooLong):
			Fail(c, http.StatusBadRequest, "password exceeds 72 bytes", "password_too_long")
		case errors.Is(err, service.ErrInvalidEmail):
			Fail(c, http.StatusBadRequest, "invalid email", "invalid_email")
		default:
			Internal(c, "register failed")
		}
		return
	}
	c.JSON(http.StatusCreated, map[string]interface{}{
		"token": token,
		"user":  service.UserPublic(u),
	})
}

func (h *AuthHandler) Login(ctx context.Context, c *app.RequestContext) {
	var body loginBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	ip := clientIP(c)
	email := service.NormalizeEmail(body.Email)
	now := time.Now()
	if ok, wait := h.limit.Allow(ip, email, now); !ok {
		middleware.ObserveLoginThrottled()
		middleware.Audit(c, "login_throttled", "", "rate_limited")
		tooManyLogins(c, wait)
		return
	}
	// The captcha is checked before the credentials so a bot cannot use the
	// login endpoint to probe passwords one attempt at a time.
	if err := h.svc.VerifyCaptcha(body.CaptchaID, body.CaptchaCode); err != nil {
		captchaFailure(c, err)
		return
	}
	u, token, err := h.svc.Login(body.Email, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCreds) {
			h.limit.RecordFailure(ip, email, time.Now())
			middleware.ObserveLoginFailure()
			middleware.Audit(c, "login_failure", "", "invalid_credentials")
			if ok, wait := h.limit.Allow(ip, email, time.Now()); !ok {
				middleware.ObserveLoginThrottled()
				tooManyLogins(c, wait)
				return
			}
			Fail(c, http.StatusUnauthorized, "invalid email or password", "invalid_credentials")
			return
		}
		Internal(c, "login failed")
		return
	}
	h.limit.Reset(ip, email)
	c.JSON(http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  service.UserPublic(u),
	})
}

func clientIP(c *app.RequestContext) string {
	ip := c.ClientIP()
	if ip == "" {
		return "unknown"
	}
	return ip
}

func tooManyLogins(c *app.RequestContext, wait time.Duration) {
	sec := int(wait.Seconds())
	if sec < 1 {
		sec = 1
	}
	c.Header("Retry-After", strconv.Itoa(sec))
	c.JSON(http.StatusTooManyRequests, map[string]interface{}{
		"message":           "too many login attempts",
		"code":              "rate_limited",
		"retryAfterSeconds": sec,
	})
}

func (h *AuthHandler) Refresh(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	u, token, err := h.svc.Refresh(uid)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			Fail(c, http.StatusUnauthorized, "unauthorized", "unauthorized")
			return
		}
		Internal(c, "refresh failed")
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{
		"token":     token,
		"user":      service.UserPublic(u),
		"expiresAt": time.Now().UTC().Add(7 * 24 * time.Hour).Format(time.RFC3339),
	})
}

type passwordBody struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h *AuthHandler) ChangePassword(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	var body passwordBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	err := h.svc.ChangePassword(uid, body.CurrentPassword, body.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrWeakPassword):
			Fail(c, http.StatusBadRequest, "password must be at least 6 characters", "weak_password")
		case errors.Is(err, service.ErrPasswordTooLong):
			Fail(c, http.StatusBadRequest, "password exceeds 72 bytes", "password_too_long")
		case errors.Is(err, service.ErrSamePassword):
			Fail(c, http.StatusBadRequest, "new password must differ", "password_unchanged")
		case errors.Is(err, service.ErrInvalidCreds):
			Fail(c, http.StatusBadRequest, "current password is incorrect", "wrong_password")
		case errors.Is(err, service.ErrUserNotFound):
			Fail(c, http.StatusUnauthorized, "unauthorized", "unauthorized")
		default:
			Internal(c, "password change failed")
		}
		return
	}
	middleware.Audit(c, "password_change", uid.String(), "ok")
	c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AuthHandler) Me(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	u, err := h.svc.Me(uid)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			Fail(c, http.StatusUnauthorized, "unauthorized", "unauthorized")
			return
		}
		Internal(c, "me failed")
		return
	}
	c.JSON(http.StatusOK, service.UserPublic(u))
}
