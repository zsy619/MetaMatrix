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

// PasswordResetBackend is the part of the password reset service the HTTP
// layer depends on. The interface keeps the handler testable without a
// database or a mail server.
type PasswordResetBackend interface {
	// RequestCode issues a code for the address and mails it.
	RequestCode(ctx context.Context, email, requestIP string) (service.ResetRequestResult, error)
	// VerifyCode checks the code and returns a session token.
	VerifyCode(email, code string) (string, error)
	// ResetPasswordWithSession replaces the password using a session token.
	ResetPasswordWithSession(sessionToken, newPassword string) error
}

// PasswordResetHandler serves the password reset flow.
type PasswordResetHandler struct {
	svc PasswordResetBackend
	// unknownEmailMode decides what the request endpoint answers for an
	// address that is not registered.
	unknownEmailMode string
	// revealCode puts the code into the response. It is only safe when the
	// mail transport is the log sender.
	revealCode bool
	// cooldown is the resend cooldown the server enforces. The client shows
	// the same number so the UI and the server agree.
	cooldown time.Duration
}

// PasswordResetOptions configures the handler.
type PasswordResetOptions struct {
	// UnknownEmailMode is "uniform" or "explicit". See
	// config.UnknownEmailUniform.
	UnknownEmailMode string
	// RevealCode returns the code in the response body.
	RevealCode bool
	// Cooldown is the resend cooldown.
	Cooldown time.Duration
}

func NewPasswordResetHandler(svc PasswordResetBackend, opts PasswordResetOptions) *PasswordResetHandler {
	mode := opts.UnknownEmailMode
	if mode != "explicit" {
		// Default to the safe mode. A typo must not turn account
		// enumeration back on.
		mode = "uniform"
	}
	cooldown := opts.Cooldown
	if cooldown <= 0 {
		cooldown = 60 * time.Second
	}
	return &PasswordResetHandler{
		svc:              svc,
		unknownEmailMode: mode,
		revealCode:       opts.RevealCode,
		cooldown:         cooldown,
	}
}

type resetRequestBody struct {
	Email string `json:"email"`
}

type resetVerifyBody struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type resetConfirmBody struct {
	SessionToken string `json:"sessionToken"`
	NewPassword  string `json:"newPassword"`
}

// Request asks for a reset code.
//
// The endpoint is public: the user is not logged in, that is the whole point.
//
// The answer is deliberately vague. In the uniform mode a registered and an
// unregistered address produce the same response, so this endpoint cannot be
// used to find out which addresses have an account. The rate limit is what
// makes bulk enumeration impractical; the uniform answer is what makes a
// single successful enumeration useless.
func (h *PasswordResetHandler) Request(ctx context.Context, c *app.RequestContext) {
	var body resetRequestBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	result, err := h.svc.RequestCode(ctx, body.Email, clientIP(c))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrResetRateLimited):
			sec := int(result.RetryAfter.Seconds())
			if sec < 1 {
				sec = 1
			}
			c.Header("Retry-After", strconv.Itoa(sec))
			middleware.Audit(c, "password_reset_throttled", "", "rate_limited")
			c.JSON(http.StatusTooManyRequests, map[string]interface{}{
				"message":           "too many reset code requests",
				"code":              "rate_limited",
				"retryAfterSeconds": sec,
			})
			return
		case errors.Is(err, service.ErrInvalidEmail):
			Fail(c, http.StatusBadRequest, "invalid email", "invalid_email")
			return
		case errors.Is(err, service.ErrResetMailUnavailable):
			// The mail transport is not usable. Saying "sent" here would
			// leave the user waiting for a mail that will never arrive.
			middleware.Audit(c, "password_reset_mail_unavailable", "", "mail_unavailable")
			Fail(c, http.StatusServiceUnavailable, "reset mail is temporarily unavailable", "mail_unavailable")
			return
		default:
			Internal(c, "reset request failed")
			return
		}
	}

	middleware.Audit(c, "password_reset_requested", "", "ok")

	// Uniform mode: the same body for a known and an unknown address.
	// The explicit mode reports the truth, which is friendlier but allows
	// account enumeration.
	if h.unknownEmailMode == "explicit" && !result.AccountExists {
		c.JSON(http.StatusNotFound, map[string]interface{}{
			"message": "no account for this email",
			"code":    "email_not_registered",
		})
		return
	}

	payload := map[string]interface{}{
		"status":  "sent",
		"message": "if the address has an account, a reset code is on its way",
		// The client uses this to show the cooldown before the resend button
		// becomes active again.
		"cooldownSeconds": int(h.cooldown.Seconds()),
	}
	if h.revealCode && result.Code != "" {
		// Development convenience: the log transport already printed the
		// code, so returning it saves a trip to the terminal.
		payload["debugCode"] = result.Code
	}
	c.JSON(http.StatusOK, payload)
}

// Verify checks the emailed code and returns a session token.
//
// The code is spent here. The returned token authorises exactly one password
// change, so the final write never depends on a six digit secret.
func (h *PasswordResetHandler) Verify(ctx context.Context, c *app.RequestContext) {
	var body resetVerifyBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	sessionToken, err := h.svc.VerifyCode(body.Email, body.Code)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrResetCodeInvalid):
			Fail(c, http.StatusBadRequest, "reset code does not match", "reset_code_invalid")
			return
		case errors.Is(err, service.ErrResetCodeExpired):
			Fail(c, http.StatusBadRequest, "reset code expired", "reset_code_expired")
			return
		case errors.Is(err, service.ErrResetCodeConsumed):
			Fail(c, http.StatusBadRequest, "reset code already used", "reset_code_used")
			return
		case errors.Is(err, service.ErrResetNoActiveCode):
			// 这个邮箱名下根本没有待验证的验证码：没点过"发送"、已经过期，
			// 或者被新码顶掉了。显式模式下直接说清楚，用户才知道该去重发；
			// 统一模式下必须和"码不对"长得一模一样，否则这个接口就成了
			// 账号存在性探测器（已知账号至少会有一条被消费掉的记录）。
			if h.unknownEmailMode == "explicit" {
				Fail(c, http.StatusBadRequest, "no reset code pending for this email", "reset_code_not_found")
				return
			}
			Fail(c, http.StatusBadRequest, "reset code does not match", "reset_code_invalid")
			return
		case errors.Is(err, service.ErrInvalidEmail):
			Fail(c, http.StatusBadRequest, "invalid email", "invalid_email")
			return
		default:
			Internal(c, "reset code verification failed")
			return
		}
	}
	middleware.Audit(c, "password_reset_code_verified", "", "ok")
	c.JSON(http.StatusOK, map[string]interface{}{
		"status":       "verified",
		"sessionToken": sessionToken,
	})
}

// Confirm stores the new password using the session token from Verify.
func (h *PasswordResetHandler) Confirm(ctx context.Context, c *app.RequestContext) {
	var body resetConfirmBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	err := h.svc.ResetPasswordWithSession(body.SessionToken, body.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrResetSessionInvalid):
			Fail(c, http.StatusBadRequest, "reset session is no longer valid", "reset_session_invalid")
			return
		case errors.Is(err, service.ErrResetCodeExpired):
			Fail(c, http.StatusBadRequest, "reset code expired", "reset_code_expired")
			return
		case errors.Is(err, service.ErrWeakPassword):
			Fail(c, http.StatusBadRequest, "password must be at least 6 characters", "weak_password")
			return
		case errors.Is(err, service.ErrPasswordTooLong):
			Fail(c, http.StatusBadRequest, "password exceeds 72 bytes", "password_too_long")
			return
		case errors.Is(err, service.ErrResetSamePassword):
			Fail(c, http.StatusBadRequest, "new password must differ", "password_unchanged")
			return
		case errors.Is(err, service.ErrUserNotFound):
			Fail(c, http.StatusBadRequest, "reset session is no longer valid", "reset_session_invalid")
			return
		default:
			Internal(c, "password reset failed")
			return
		}
	}
	middleware.Audit(c, "password_reset_completed", "", "ok")
	c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
