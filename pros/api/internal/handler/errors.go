package handler

import (
	"net/http"

	"metamatrix/api/internal/middleware"

	"github.com/cloudwego/hertz/pkg/app"
)

func Fail(c *app.RequestContext, status int, message, code string) {
	middleware.ErrorJSON(c, status, message, code, nil)
}

func BadRequest(c *app.RequestContext, message string) {
	Fail(c, http.StatusBadRequest, message, "bad_request")
}

func Unauthorized(c *app.RequestContext, message string) {
	Fail(c, http.StatusUnauthorized, message, "unauthorized")
}

func Forbidden(c *app.RequestContext, message string) {
	Fail(c, http.StatusForbidden, message, "forbidden")
}

func NotFound(c *app.RequestContext, message string) {
	Fail(c, http.StatusNotFound, message, "not_found")
}

func Conflict(c *app.RequestContext, message string, extra map[string]interface{}) {
	middleware.ErrorJSON(c, http.StatusConflict, message, "conflict", extra)
}

func Internal(c *app.RequestContext, message string) {
	Fail(c, http.StatusInternalServerError, message, "internal_error")
}
