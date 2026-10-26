package handler

import (
	"context"
	"errors"
	"net/http"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
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
			Conflict(c, "email already registered", nil)
		case errors.Is(err, service.ErrWeakPassword), errors.Is(err, service.ErrInvalidEmail):
			BadRequest(c, err.Error())
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
	u, token, err := h.svc.Login(body.Email, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCreds) {
			Unauthorized(c, "invalid email or password")
			return
		}
		Internal(c, "login failed")
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  service.UserPublic(u),
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
			NotFound(c, "user not found")
			return
		}
		Internal(c, "me failed")
		return
	}
	c.JSON(http.StatusOK, service.UserPublic(u))
}
