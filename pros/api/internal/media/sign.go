package media

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

const (
	// DefaultSignTTL is how long a preview URL stays valid.
	DefaultSignTTL = 10 * time.Minute
	signSkew       = 30 * time.Second
)

var ErrSignature = errors.New("media signature missing, invalid, or expired")

// Sign builds an application-level HMAC-SHA256 over user id, the stable media
// path, and the expiry. This is not nginx secure_link: that scheme is MD5 of
// expiry + URI + secret, with a different encoding.
func Sign(secret, userID, assetID string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(signPayload(userID, assetID, exp)))
	return hex.EncodeToString(mac.Sum(nil))
}

func signPayload(userID, assetID string, exp int64) string {
	return userID + "\n" + StablePath(assetID) + "\n" + strconv.FormatInt(exp, 10)
}

// StablePath is what the editor stores. The signature query is not part of it.
func StablePath(assetID string) string {
	return "/media/" + assetID
}

// SignedPath appends the short-lived query. Callers still have to present the
// logged-in user; the signature alone is not a bearer token.
func SignedPath(secret, userID, assetID string, now time.Time) (string, int64) {
	exp := now.Add(DefaultSignTTL).Unix()
	return StablePath(assetID) + "?exp=" + strconv.FormatInt(exp, 10) + "&sig=" + Sign(secret, userID, assetID, exp), exp
}

// Verify checks expiry and the HMAC. Comparison is constant-time.
func Verify(secret, userID, assetID, expRaw, sig string, now time.Time) error {
	expRaw = strings.TrimSpace(expRaw)
	sig = strings.TrimSpace(sig)
	if expRaw == "" || sig == "" {
		return ErrSignature
	}
	exp, err := strconv.ParseInt(expRaw, 10, 64)
	if err != nil {
		return ErrSignature
	}
	if now.After(time.Unix(exp, 0).Add(signSkew)) {
		return ErrSignature
	}
	want := Sign(secret, userID, assetID, exp)
	if !hmac.Equal([]byte(strings.ToLower(sig)), []byte(want)) {
		return ErrSignature
	}
	return nil
}
