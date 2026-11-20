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
	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/media"
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

	// 活动日志（登录、退出、写操作）落库。
	activitySvc := service.NewActivityService(gdb)
	authSvc := service.NewAuthService(gdb, cfg.JWTSecret, service.NewCaptchaService(cfg.CaptchaTTL, cfg.CaptchaDebug))
	docSvc := service.NewDocumentsService(gdb)
	projSvc := service.NewProjectsService(gdb)
	dirSvc := service.NewDirectoryService(gdb)
	authH := handler.NewAuthHandler(authSvc, service.NewAttemptLimiter(cfg.LoginWindow, cfg.LoginPairLimit, cfg.LoginIPLimit), handler.AuthOptions{
		DebugAll:      cfg.CaptchaDebug,
		DebugLoopback: cfg.CaptchaDebugLoopback,
		Activity:      activitySvc,
	})
	logsH := handler.NewLogsHandler(activitySvc)

	// 出站邮件通道。厂商无关：任何 SMTP 服务只需改配置。
	// 未配置且非生产环境时退回日志通道，验证码会打到 API 日志里，
	// 这样本地开发可以跑通完整流程而不需要真的发信。
	mailSender, mailDesc := mail.ResolveSender(mail.Config{
		Mode:     cfg.Mail.Mode,
		Host:     cfg.Mail.Host,
		Port:     cfg.Mail.Port,
		Username: cfg.Mail.Username,
		Password: cfg.Mail.Password,
		From:     cfg.Mail.From,
		FromName: cfg.Mail.FromName,
		Insecure: cfg.Mail.Insecure,
		Timeout:  cfg.Mail.Timeout,
	})
	log.Printf("MetaMatrix mail transport: %s", mailDesc)

	resetSvc := service.NewPasswordResetService(gdb, mailSender, service.PasswordResetOptions{
		Limits: service.ResetLimits{
			PerAddressCooldown: cfg.PasswordReset.Cooldown,
			PerAddressHourly:   cfg.PasswordReset.HourlyPerAddress,
			PerAddressDaily:    cfg.PasswordReset.DailyPerAddress,
			PerIPHourly:        cfg.PasswordReset.HourlyPerIP,
		},
		TTL:         cfg.PasswordReset.CodeTTL,
		MaxAttempts: cfg.PasswordReset.MaxAttempts,
		AppName:     "元矩阵 MetaMatrix",
		// 只有日志通道才允许把验证码放进响应体，真实发信时绝不能回传。
		RevealCode: cfg.PasswordReset.RevealCode && mailDesc == "log",
	})
	resetH := handler.NewPasswordResetHandler(resetSvc, handler.PasswordResetOptions{
		UnknownEmailMode: cfg.PasswordReset.UnknownEmailMode,
		RevealCode:       cfg.PasswordReset.RevealCode && mailDesc == "log",
		Cooldown:         cfg.PasswordReset.Cooldown,
	})

	docH := handler.NewDocumentsHandler(docSvc)
	projH := handler.NewProjectsHandler(projSvc)
	dirH := handler.NewDirectoryHandler(dirSvc)
	mediaSvc := &media.Service{
		Store:  media.NewGormStore(gdb),
		Root:   cfg.MediaRoot,
		Secret: cfg.MediaSignSecret,
		Feishu: media.FeishuCreds{
			AppID:     cfg.FeishuAppID,
			AppSecret: cfg.FeishuAppSecret,
			BlockID:   cfg.FeishuBlockID,
		},
	}
	mediaH := handler.NewMediaHandler(mediaSvc)

	// 过期分片不能等用户再次访问才回收：启动先清一次，之后每小时扫描。
	// 单个损坏会话的错误由 CleanupExpiredChunks 汇总；这里记录告警而继续服务，
	// 避免不可信的磁盘内容让整站无法启动。关闭 Spin 后取消后台 goroutine。
	if err := mediaSvc.CleanupExpiredChunks(); err != nil {
		log.Printf("media chunk startup cleanup warning: %v", err)
	}
	chunkCleanupCtx, stopChunkCleanup := context.WithCancel(context.Background())
	defer stopChunkCleanup()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := mediaSvc.CleanupExpiredChunks(); err != nil {
					log.Printf("media chunk periodic cleanup warning: %v", err)
				}
			case <-chunkCleanupCtx.Done():
				return
			}
		}
	}()

	h := server.Default(
		server.WithHostPorts(fmt.Sprintf(":%d", cfg.Port)),
	)

	h.Use(middleware.SecurityHeaders())
	h.Use(middleware.AccessLog())
	// 写操作留痕：只记方法、路径与结果，不记请求体。
	h.Use(middleware.ActivityLog(activitySvc))
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
	h.GET("/auth/captcha", authH.Captcha)
	h.GET("/auth/me", middleware.AuthRequired(cfg.JWTSecret), authH.Me)
	h.POST("/auth/refresh", middleware.AuthRequired(cfg.JWTSecret), authH.Refresh)
	h.POST("/auth/password", middleware.AuthRequired(cfg.JWTSecret), authH.ChangePassword)
	h.POST("/auth/logout", middleware.AuthRequired(cfg.JWTSecret), authH.Logout)

	// 密码重置。这三个端点是公开的：用户此时还没有登录态，
	// 邮箱验证码本身就是唯一的身份凭证。
	h.POST("/auth/password-reset/request", resetH.Request)
	h.POST("/auth/password-reset/verify", resetH.Verify)
	h.POST("/auth/password-reset/confirm", resetH.Confirm)

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
		docs.POST("/:id/clone", docH.Clone)
		docs.DELETE("/:id", docH.Delete)
		docs.GET("/:id/ai-context", docH.AIContext)
		docs.POST("/:id/revisions", docH.CreateRevision)
		docs.GET("/:id/revisions", docH.ListRevisions)
		docs.GET("/:id/revisions/:rid/materialize", docH.Materialize)
		docs.GET("/:id/revisions/:rid/diff", docH.Diff)
		docs.POST("/:id/restore", docH.Restore)
	}

	// 素材库。身份只取登录态。静态路径必须写在 /:id 前面。
	library := h.Group("/media", middleware.AuthRequired(cfg.JWTSecret))
	{
		library.POST("/check", mediaH.Check)
		library.POST("/upload", mediaH.Upload)
		library.POST("/upload/chunk/prepare", mediaH.PrepareChunk)
		library.GET("/upload/chunk/:id", mediaH.ChunkStatus)
		library.POST("/upload/chunk/:id/part", mediaH.PutChunk)
		library.POST("/upload/chunk/:id/finish", mediaH.FinishChunk)
		library.GET("/categories", mediaH.ListCategories)
		library.POST("/categories", mediaH.CreateCategory)
		library.PUT("/categories/:id", mediaH.UpdateCategory)
		library.DELETE("/categories/:id", mediaH.DeleteCategory)
		library.GET("", mediaH.List)
		library.GET("/:id", mediaH.Get)
		library.DELETE("/:id", mediaH.Delete)
		library.POST("/:id/references", mediaH.AddReference)
		library.DELETE("/:id/references/:rid", mediaH.DeleteReference)
		library.POST("/:id/feishu/sync", mediaH.SyncFeishu)
	}

	// 通讯录（真人 @）。与其它已认证路由同组，必须带登录态。
	directory := h.Group("/directory", middleware.AuthRequired(cfg.JWTSecret))
	{
		directory.GET("/users", dirH.List)
	}

	// 项目：画布的容器。一个项目下有多张画布。
	projects := h.Group("/projects", middleware.AuthRequired(cfg.JWTSecret))
	{
		projects.GET("", projH.List)
		projects.POST("", projH.Create)
		projects.GET("/:id", projH.Get)
		projects.GET("/:id/refs", projH.Refs)
		projects.PUT("/:id", projH.Rename)
		projects.DELETE("/:id", projH.Delete)
	}

	// 活动日志查询（当前账号自己的记录）。
	h.GET("/logs", middleware.AuthRequired(cfg.JWTSecret), logsH.List)

	log.Printf("MetaMatrix API (Hertz+GORM) listening on http://localhost:%d", cfg.Port)
	h.Spin()
}
