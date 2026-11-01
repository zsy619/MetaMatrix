package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"metamatrix/api/internal/config"
	"metamatrix/api/internal/db"
	"metamatrix/api/internal/handler"
	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/hertz-contrib/cors"
)

func main() {
	cfg := config.Load()

	gdb, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	if err := db.AutoMigrate(gdb); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	authSvc := service.NewAuthService(gdb, cfg.JWTSecret)
	docSvc := service.NewDocumentsService(gdb)
	authH := handler.NewAuthHandler(authSvc, service.NewAttemptLimiter(cfg.LoginWindow, cfg.LoginPairLimit, cfg.LoginIPLimit))
	docH := handler.NewDocumentsHandler(docSvc)

	h := server.Default(
		server.WithHostPorts(fmt.Sprintf(":%d", cfg.Port)),
	)

	h.Use(middleware.SecurityHeaders())
	h.Use(middleware.AccessLog())
	h.Use(cors.New(cors.Config{
		AllowOrigins: middleware.ParseCORSOrigins(os.Getenv("CORS_ORIGINS")),
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Request-Id"},
		ExposeHeaders: []string{
			"Content-Length",
			"X-Request-Id",
			"X-Total-Count",
			"X-Has-More",
			"X-Limit",
			"X-Offset",
			"Cache-Control",
			"Retry-After",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	h.GET("/health", func(ctx context.Context, c *app.RequestContext) {
		status := "ok"
		code := http.StatusOK
		if sqlDB, err := gdb.DB(); err != nil {
			status = "degraded"
			code = http.StatusServiceUnavailable
		} else {
			pingCtx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
			err = sqlDB.PingContext(pingCtx)
			cancel()
			if err != nil {
				status = "degraded"
				code = http.StatusServiceUnavailable
			}
		}
		snap := middleware.Snapshot()
		c.JSON(code, map[string]interface{}{
			"status":        status,
			"uptimeSeconds": snap.UptimeSeconds,
			"requests":      snap.Requests,
			"auth":          snap.Auth,
		})
	})
	h.GET("/metrics", func(ctx context.Context, c *app.RequestContext) {
		c.SetContentType("text/plain; version=0.0.4; charset=utf-8")
		c.String(http.StatusOK, middleware.PrometheusText())
	})

	h.POST("/auth/register", authH.Register)
	h.POST("/auth/login", authH.Login)
	h.GET("/auth/me", middleware.AuthRequired(cfg.JWTSecret), authH.Me)
	h.POST("/auth/refresh", middleware.AuthRequired(cfg.JWTSecret), authH.Refresh)
	h.POST("/auth/password", middleware.AuthRequired(cfg.JWTSecret), authH.ChangePassword)

	docs := h.Group("/documents", middleware.AuthRequired(cfg.JWTSecret))
	{
		docs.POST("", docH.Create)
		docs.GET("", docH.List)
		docs.POST("/batch", docH.Batch)
		// Static paths before :id
		docs.GET("/search", docH.Search)
		docs.GET("/stats", docH.Stats)
		docs.GET("/backup", docH.Backup)
		docs.POST("/backup", docH.RestoreBackup)
		docs.GET("/ai-corpus", docH.AICorpus)
		docs.GET("/:id", docH.Get)
		docs.GET("/:id/export", docH.Export)
		docs.PUT("/:id", docH.Update)
		docs.PATCH("/:id/title", docH.Rename)
		docs.DELETE("/:id", docH.Delete)
		docs.GET("/:id/ai-context", docH.AIContext)
		docs.POST("/:id/revisions", docH.CreateRevision)
		docs.GET("/:id/revisions", docH.ListRevisions)
		docs.GET("/:id/revisions/:rid/materialize", docH.Materialize)
		docs.GET("/:id/revisions/:rid/diff", docH.Diff)
		docs.POST("/:id/restore", docH.Restore)
	}

	log.Printf("MetaMatrix API (Hertz+GORM) listening on http://localhost:%d", cfg.Port)
	h.Spin()
}
