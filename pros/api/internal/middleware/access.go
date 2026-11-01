package middleware

import (
	"context"
	"log"
	"strings"
	"time"
	"unicode"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// ErrorJSON writes the standard error body and the request id when one was assigned.
func ErrorJSON(c *app.RequestContext, status int, message, code string, extra map[string]interface{}) {
	body := map[string]interface{}{
		"message": message,
		"code":    code,
	}
	if raw, ok := c.Get("requestID"); ok {
		if id, isString := raw.(string); isString && id != "" {
			body["requestId"] = id
		}
	}
	for k, v := range extra {
		body[k] = v
	}
	c.JSON(status, body)
}

// AccessLog writes one line per request and echoes a request id.
// The query string is omitted so search terms and tokens are not logged.
func AccessLog() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id := requestID(string(c.GetHeader("X-Request-Id")))
		c.Set("requestID", id)
		c.Header("X-Request-Id", id)
		trace := traceParent(string(c.GetHeader("traceparent")))
		start := time.Now()
		c.Next(ctx)
		status := c.Response.StatusCode()
		if status == 0 {
			status = 200
		}
		ObserveStatus(status)
		if trace != "" {
			log.Printf("access request_id=%s traceparent=%s method=%s path=%s status=%d duration_ms=%d",
				id, trace, string(c.Method()), string(c.Path()), status, time.Since(start).Milliseconds())
			return
		}
		log.Printf("access request_id=%s method=%s path=%s status=%d duration_ms=%d",
			id,
			string(c.Method()),
			string(c.Path()),
			status,
			time.Since(start).Milliseconds(),
		)
	}
}

func traceParent(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) < 55 || len(raw) > 80 {
		return ""
	}
	for _, r := range raw {
		if unicode.Is(unicode.Hex_Digit, r) || r == '-' {
			continue
		}
		return ""
	}
	return raw
}

func requestID(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) < 8 || len(raw) > 64 {
		return uuid.NewString()
	}
	for _, r := range raw {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			continue
		}
		return uuid.NewString()
	}
	return raw
}
