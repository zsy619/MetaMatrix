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

// AccessLog writes one line per request and echoes a request id.
// The query string is omitted so search terms and tokens are not logged.
func AccessLog() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		id := requestID(string(c.GetHeader("X-Request-Id")))
		c.Header("X-Request-Id", id)
		start := time.Now()
		c.Next(ctx)
		status := c.Response.StatusCode()
		if status == 0 {
			status = 200
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
