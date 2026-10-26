package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL string
	Port        int
	JWTSecret   string
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
		DatabaseURL: dbURL,
		Port:        port,
		JWTSecret:   secret,
	}
}
