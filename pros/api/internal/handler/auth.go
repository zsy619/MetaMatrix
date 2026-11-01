package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
)

type AuthHandler struct {
	svc   *service.AuthService
	limit *service.AttemptLimiter
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{
		svc:   svc,
		limit: service.NewAttemptLimiter(15*time.Minute, 8, 30),
	}
}

type registerBody struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(ctx context.Context, c *app.RequestContext) {
	var body registerBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
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
		tooManyLogins(c, wait)
		return
	}
	u, token, err := h.svc.Login(body.Email, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCreds) {
			h.limit.RecordFailure(ip, email, time.Now())
			middleware.ObserveLoginFailure()
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
