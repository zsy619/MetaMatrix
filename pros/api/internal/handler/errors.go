package handler

import (
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
)

func Fail(c *app.RequestContext, status int, message, code string) {
	c.JSON(status, map[string]string{"message": message, "code": code})
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
	body := map[string]interface{}{"message": message, "code": "conflict"}
	for k, v := range extra {
		body[k] = v
	}
	c.JSON(http.StatusConflict, body)
}

func Internal(c *app.RequestContext, message string) {
	Fail(c, http.StatusInternalServerError, message, "internal_error")
}
