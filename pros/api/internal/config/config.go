package config

import (
	"os"
	"strconv"
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
	}
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
