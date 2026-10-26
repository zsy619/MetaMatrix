package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type ctxKey string

const UserIDKey ctxKey = "userID"

type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

func SignToken(secret string, userID uuid.UUID, email string, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID: userID.String(),
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID.String(),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func ParseToken(secret, tokenStr string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func AuthRequired(secret string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		h := string(c.GetHeader("Authorization"))
		if h == "" || !strings.HasPrefix(h, "Bearer ") {
			c.JSON(http.StatusUnauthorized, map[string]string{"message": "missing bearer token", "code": "unauthorized"})
			c.Abort()
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")
		claims, err := ParseToken(secret, tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, map[string]string{"message": "invalid or expired token", "code": "unauthorized"})
			c.Abort()
			return
		}
		uid, err := uuid.Parse(claims.UserID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, map[string]string{"message": "invalid token subject", "code": "unauthorized"})
			c.Abort()
			return
		}
		c.Set(string(UserIDKey), uid)
		c.Next(ctx)
	}
}

func UserIDFromCtx(c *app.RequestContext) (uuid.UUID, bool) {
	v, ok := c.Get(string(UserIDKey))
	if !ok {
		return uuid.Nil, false
	}
	uid, ok := v.(uuid.UUID)
	return uid, ok
}
