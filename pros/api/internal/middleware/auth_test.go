package middleware

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestParseTokenRoundTripAndAlg(t *testing.T) {
	secret := "test-secret"
	uid := uuid.New()
	tok, err := SignToken(secret, uid, "demo@metamatrix.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseToken(secret, tok)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != uid.String() || claims.Email != "demo@metamatrix.local" {
		t.Fatalf("claims = %+v", claims)
	}
	if _, err = ParseToken(secret, ""); err == nil {
		t.Fatal("empty token accepted")
	}
	if _, err = ParseToken("other", tok); err == nil {
		t.Fatal("wrong secret accepted")
	}

	other := jwt.NewWithClaims(jwt.SigningMethodHS384, Claims{
		UserID: uid.String(),
		Email:  "demo@metamatrix.local",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			Subject:   uid.String(),
		},
	})
	signed, err := other.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ParseToken(secret, signed); err == nil {
		t.Fatal("non-HS256 token accepted")
	}
}

func TestRequestID(t *testing.T) {
	if got := requestID("abc-123_xyz"); got != "abc-123_xyz" {
		t.Fatalf("kept = %q", got)
	}
	if got := requestID("bad id"); got == "bad id" || len(got) < 8 {
		t.Fatalf("rejected = %q", got)
	}
	if got := requestID(""); len(got) < 8 {
		t.Fatalf("empty = %q", got)
	}
}
