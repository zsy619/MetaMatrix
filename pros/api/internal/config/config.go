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
	return Config{
		DatabaseURL:    dbURL,
		Port:           port,
		JWTSecret:      secret,
		LoginWindow:    durationEnv("LOGIN_WINDOW", 15*time.Minute),
		LoginPairLimit: intEnv("LOGIN_PAIR_LIMIT", 8),
		LoginIPLimit:   intEnv("LOGIN_IP_LIMIT", 30),
		CaptchaTTL:     captchaTTLDEnv(),
		CaptchaDebug:   boolEnv("CAPTCHA_DEBUG", false),
	}
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
