package middleware

import (
	"net/http"
	"testing"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

func TestTokenFromRequestPrefersBearerThenQuery(t *testing.T) {
	secret := "collab-auth-test"
	uid := uuid.New()
	tok, err := SignToken(secret, uid, "a@b.c", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	c := app.NewContext(0)
	c.Request.SetRequestURI("/documents/x/collab?token=query-token")
	if got := TokenFromRequest(c); got != "query-token" {
		t.Fatalf("query token = %q, want query-token", got)
	}

	c = app.NewContext(0)
	c.Request.SetRequestURI("/documents/x/collab?token=query-token")
	c.Request.Header.Set("Authorization", "Bearer "+tok)
	if got := TokenFromRequest(c); got != tok {
		t.Fatalf("bearer should win, got %q", got)
	}

	c = app.NewContext(0)
	c.Request.SetRequestURI("/documents/x/collab")
	if got := TokenFromRequest(c); got != "" {
		t.Fatalf("empty = %q", got)
	}

	parsed, ok := AuthenticateToken(secret, tok)
	if !ok || parsed != uid {
		t.Fatalf("authenticate got %s ok=%v", parsed, ok)
	}
	if _, ok := AuthenticateToken(secret, "not-a-jwt"); ok {
		t.Fatal("bad token should fail")
	}
	if _, ok := AuthenticateToken(secret, ""); ok {
		t.Fatal("empty token should fail")
	}
	_ = http.StatusUnauthorized
}
