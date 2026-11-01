package middleware

import (
	"log"

	"github.com/cloudwego/hertz/pkg/app"
)

// Audit writes one structured line for a sensitive write.
// Callers must not pass passwords, tokens, or document bodies.
func Audit(c *app.RequestContext, action, userID, detail string) {
	requestID := ""
	if raw, ok := c.Get("requestID"); ok {
		if id, isString := raw.(string); isString {
			requestID = id
		}
	}
	log.Printf("audit action=%s request_id=%s user=%s detail=%s", action, requestID, userID, detail)
}
