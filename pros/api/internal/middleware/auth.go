package middleware

import (
	"context"
	"fmt"
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
	if strings.TrimSpace(tokenStr) == "" {
		return nil, jwt.ErrTokenMalformed
	}
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if t.Method == nil || t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method")
		}
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
			ErrorJSON(c, http.StatusUnauthorized, "missing bearer token", "unauthorized", nil)
			c.Abort()
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")
		claims, err := ParseToken(secret, tokenStr)
		if err != nil {
			ErrorJSON(c, http.StatusUnauthorized, "invalid or expired token", "unauthorized", nil)
			c.Abort()
			return
		}
		uid, err := uuid.Parse(claims.UserID)
		if err != nil {
			ErrorJSON(c, http.StatusUnauthorized, "invalid token subject", "unauthorized", nil)
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

// TokenFromRequest 取出请求里的 JWT：优先 Authorization Bearer，其次 query token。
// 浏览器 WebSocket 握手通常不能自定义请求头，协同通道需要允许 ?token=。
// 现有 AuthRequired 仍然只认 Bearer，避免把 query token 扩散到所有 HTTP 接口。
func TokenFromRequest(c *app.RequestContext) string {
	h := string(c.GetHeader("Authorization"))
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return strings.TrimSpace(c.Query("token"))
}

// AuthenticateToken 校验 JWT 并返回用户 ID。token 为空或非法时返回 false。
func AuthenticateToken(secret, tokenStr string) (uuid.UUID, bool) {
	claims, err := ParseToken(secret, tokenStr)
	if err != nil {
		return uuid.Nil, false
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return uuid.Nil, false
	}
	return uid, true
}
