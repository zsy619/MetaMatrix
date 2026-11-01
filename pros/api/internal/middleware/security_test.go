package middleware

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestParseCORSOrigins(t *testing.T) {
	got := ParseCORSOrigins("")
	if len(got) != 2 || got[0] != "http://localhost:5173" {
		t.Fatalf("defaults = %#v", got)
	}
	got = ParseCORSOrigins(" https://app.example , *, https://admin.example ")
	if len(got) != 2 || got[0] != "https://app.example" || got[1] != "https://admin.example" {
		t.Fatalf("parsed = %#v", got)
	}
	got = ParseCORSOrigins("*")
	if len(got) != 2 {
		t.Fatalf("wildcard should fall back, got %#v", got)
	}
}

func TestExpiredTokenRejected(t *testing.T) {
	secret := "test-secret"
	tok, err := SignToken(secret, uuid.New(), "demo@metamatrix.local", -time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	_, err = ParseToken(secret, tok)
	if err == nil || !strings.Contains(err.Error(), "expired") && !strings.Contains(strings.ToLower(err.Error()), "token") {
		t.Fatalf("expired token err = %v", err)
	}
}
