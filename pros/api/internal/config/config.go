package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL    string
	Port           int
	JWTSecret      string
	LoginWindow    time.Duration
	LoginPairLimit int
	LoginIPLimit   int
	CaptchaTTL     time.Duration
	CaptchaDebug   bool
	// CaptchaDebugLoopback returns the plain captcha answer to loopback
	// callers only. CI uses it so the smoke test can read the answer.
	CaptchaDebugLoopback bool
	MediaRoot            string
	MediaSignSecret      string
	FeishuAppID          string
	FeishuAppSecret      string
	FeishuBlockID        string
}

func Load() Config {
	_ = godotenv.Load()
	port := 3000
	if v := os.Getenv("PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			port = n
		}
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "metamatrix-dev-jwt-secret"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://metamatrix:metamatrix@localhost:5433/metamatrix"
	}
	signSecret := os.Getenv("MEDIA_SIGN_SECRET")
	if signSecret == "" {
		signSecret = secret
	}
	mediaRoot := os.Getenv("MEDIA_ROOT")
	if mediaRoot == "" {
		mediaRoot = "data/media"
	}
	return Config{
		DatabaseURL:          dbURL,
		Port:                 port,
		JWTSecret:            secret,
		LoginWindow:          durationEnv("LOGIN_WINDOW", 15*time.Minute),
		LoginPairLimit:       intEnv("LOGIN_PAIR_LIMIT", 8),
		LoginIPLimit:         intEnv("LOGIN_IP_LIMIT", 30),
		CaptchaTTL:           captchaTTLDEnv(),
		CaptchaDebug:         boolEnv("CAPTCHA_DEBUG", false),
		CaptchaDebugLoopback: boolEnv("CAPTCHA_DEBUG_LOOPBACK", runningInCI()),
		MediaRoot:            mediaRoot,
		MediaSignSecret:      signSecret,
		FeishuAppID:          os.Getenv("FEISHU_APP_ID"),
		FeishuAppSecret:      os.Getenv("FEISHU_APP_SECRET"),
		FeishuBlockID:        os.Getenv("FEISHU_DOC_BLOCK_ID"),
	}
}

// runningInCI reports whether the process runs inside a CI runner.
//
// GitHub Actions exports CI=true and GITHUB_ACTIONS=true. The CI smoke test
// has to finish a real captcha round trip (take a challenge, then submit it),
// which needs the plain answer. The smoke test runs on the same host as the
// API, so the loopback switch is enough: only a caller on the machine itself
// can read the answer, nobody outside can.
//
// The switch can still be forced on or off with CAPTCHA_DEBUG_LOOPBACK.
func runningInCI() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("GITHUB_ACTIONS")), "true") {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("CI"))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// captchaTTLDEnv reads CAPTCHA_TTL. Unlike the login window it accepts short
// values, because a captcha only has to survive one form submission.
func captchaTTLDEnv() time.Duration {
	raw := os.Getenv("CAPTCHA_TTL")
	if raw == "" {
		return 5 * time.Minute
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d < 30*time.Second || d > time.Hour {
		return 5 * time.Minute
	}
	return d
}

// boolEnv reads a truthy flag from the environment.
func boolEnv(key string, fallback bool) bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return fallback
	}
	return n
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d < time.Minute {
		return fallback
	}
	return d
}
