package middleware

import (
	"context"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
)

// SecurityHeaders sets baseline response headers. It does not log request bodies.
func SecurityHeaders() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Next(ctx)
	}
}

// ParseCORSOrigins reads a comma-separated allowlist. A wildcard is ignored
// so credentials cannot be paired with an open origin.
func ParseCORSOrigins(raw string) []string {
	defaults := []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaults
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" || part == "*" {
			continue
		}
		out = append(out, part)
	}
	if len(out) == 0 {
		return defaults
	}
	return out
}
