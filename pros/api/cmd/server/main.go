package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"metamatrix/api/internal/ai"
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
	// 内置文档模板：飞书模板中心的最小可用集，幂等写入。
	if err := service.SeedBuiltinTemplates(gdb); err != nil {
		log.Printf("seed builtin templates warning: %v", err)
	}

	// 活动日志（登录、退出、写操作）落库。
	activitySvc := service.NewActivityService(gdb)
	authSvc := service.NewAuthService(gdb, cfg.JWTSecret, service.NewCaptchaService(cfg.CaptchaTTL, cfg.CaptchaDebug))
	docSvc := service.NewDocumentsService(gdb)
	projSvc := service.NewProjectsService(gdb)
	dirSvc := service.NewDirectoryService(gdb)
	knSvc := service.NewKnowledgeService(gdb)
	// 外部模型可选：没配 AI_API_KEY 时知识库走本地降级实现。
	knSvc.SetAIClient(ai.New(ai.Config{
		BaseURL:        cfg.AI.BaseURL,
		APIKey:         cfg.AI.APIKey,
		Model:          cfg.AI.Model,
		EmbeddingModel: cfg.AI.EmbeddingModel,
	}))
	// 飞书开放平台凭证：知识空间导入与群机器人通知共用同一套应用配置。
	knSvc.ConfigureFeishu(cfg.FeishuAppID, cfg.FeishuAppSecret, os.Getenv("FEISHU_WEBHOOK_URL"), os.Getenv("FEISHU_BASE_URL"))
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
	knH := handler.NewKnowledgeHandler(knSvc, cfg.JWTSecret)
	collabH := handler.NewCollabHandler(service.NewCollabService(gdb, knSvc.PresenceStore()), cfg.JWTSecret)
	auditH := handler.NewDocAuditHandler(service.NewDocAuditService(gdb), cfg.JWTSecret)
	blockH := handler.NewDocBlockHandler(service.NewDocBlockService(gdb), cfg.JWTSecret)
	// 历史版本保留条数可配置（111）。
	service.VersionKeep = cfg.KnowledgeVersionKeep
	// 回收站自动清理：超期节点由定时任务清除（073）。
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if purged, err := knSvc.PurgeAllExpiredTrash(cfg.KnowledgeTrashKeepDays); err != nil {
				log.Printf("knowledge trash purge failed: %v", err)
			} else if purged > 0 {
				log.Printf("knowledge trash purge: %d nodes removed", purged)
			}
		}
	}()
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
	// WebSocket 劫持后不能把连接放回池里，否则升级后的协同通道会被回收。
	h.NoHijackConnPool = true

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
		docs.PATCH("/:id/icon", docH.SetIcon)
		docs.POST("/:id/clone", docH.Clone)
		docs.DELETE("/:id", docH.Delete)
		docs.GET("/:id/ai-context", docH.AIContext)
		docs.POST("/:id/revisions", docH.CreateRevision)
		docs.GET("/:id/revisions", docH.ListRevisions)
		docs.GET("/:id/revisions/:rid/materialize", docH.Materialize)
		docs.GET("/:id/revisions/:rid/diff", docH.Diff)
		docs.POST("/:id/restore", docH.Restore)
		docs.GET("/:id/backrefs", knH.Backrefs)
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

	// 知识库目录树：挂在项目下的文档/文件夹组织。
	knowledge := h.Group("/projects/:projectId/knowledge", middleware.AuthRequired(cfg.JWTSecret))
	{
		knowledge.GET("/tree", knH.Tree)
		knowledge.POST("/nodes", knH.Create)
		knowledge.PATCH("/nodes/:nodeId", knH.Update)
		knowledge.PATCH("/nodes/:nodeId/meta", knH.UpdateMeta)
		knowledge.POST("/nodes/:nodeId/move", knH.Move)
		knowledge.POST("/nodes/:nodeId/copy", knH.Copy)
		knowledge.POST("/reorder", knH.Reorder)
		knowledge.DELETE("/nodes/:nodeId", knH.Delete)
		knowledge.GET("/trash", knH.Trash)
		knowledge.DELETE("/nodes/:nodeId/purge", knH.Purge)
		knowledge.POST("/batch", knH.Batch)
		knowledge.GET("/summary", knH.Summary)
		knowledge.GET("/events", knH.Events)
		knowledge.GET("/export", knH.ExportTree)
		// 节点分享链接：思维导图与多维表格没有文档正文，分享挂在节点上。
		knowledge.GET("/nodes/:nodeId/shares", knH.ListNodeShares)
		knowledge.POST("/nodes/:nodeId/shares", knH.CreateNodeShare)
		knowledge.DELETE("/nodes/:nodeId/shares/:shareId", knH.RevokeNodeShare)
		knowledge.PATCH("/nodes/:nodeId/shares/:shareId/allowlist", knH.SetShareAllowList)
		knowledge.GET("/templates", knH.Templates)
		knowledge.POST("/templates", knH.CreateTemplate)
		knowledge.DELETE("/templates/:templateId", knH.DeleteTemplate)
		// 知识库 3.0：图谱、作者维度检索、节点数据、导入与飞书同步。
		knowledge.GET("/graph", knH.Graph)
		knowledge.GET("/search", knH.SearchSpace)
		knowledge.POST("/ask", knH.Ask)
		knowledge.GET("/nodes/:nodeId/data", knH.GetNodeData)
		knowledge.PUT("/nodes/:nodeId/data", knH.SaveNodeData)
		knowledge.POST("/import", knH.ImportFile)
		knowledge.POST("/feishu/import", knH.ImportFeishuSpace)
		knowledge.POST("/feishu/import-doc", knH.ImportFeishuDoc)
		knowledge.POST("/feishu/notify", knH.NotifyFeishu)
		// 知识库 4.0：归档区、节点统计、关联推荐、模板维护、跨类型检索、
		// 空间打包导出、敏感扫描、质量体检与回收站清理。
		knowledge.GET("/archived", knH.Archived)
		knowledge.GET("/nodes/:nodeId/stats", knH.NodeStats)
		knowledge.GET("/nodes/:nodeId/related", knH.RelatedDocs)
		knowledge.POST("/summaries/fill", knH.FillSummaries)
		knowledge.PATCH("/templates/:templateId", knH.UpdateTemplate)
		knowledge.POST("/ask/followup", knH.AskFollowUp)
		knowledge.GET("/export/zip", knH.ExportZip)
		knowledge.GET("/similar", knH.SimilarDocs)
		knowledge.GET("/quality", knH.QualityAudit)
		knowledge.POST("/scan", knH.ScanSensitive)
		knowledge.POST("/trash/purge", knH.PurgeTrash)
		// 知识库 5.0：模板属性与模板建文档、属性看板与批量改属性、节点权限、
		// 分享白名单、标签词库、导入预览与批量导入。
		knowledge.POST("/templates/:templateId/docs", knH.CreateDocFromTemplate)
		knowledge.GET("/members", knH.ListMembers)
		knowledge.POST("/members", knH.SetMemberRole)
		knowledge.DELETE("/members/:userId", knH.RemoveMember)
		knowledge.POST("/templates/:templateId/publish", knH.PublishTemplate)
		knowledge.GET("/semantic", knH.SemanticSearch)
		knowledge.POST("/index", knH.IndexDocument)
		knowledge.POST("/meeting/minutes", knH.BuildMeetingMinutes)
		knowledge.POST("/audio/transcribe", knH.TranscribeAudio)
		knowledge.POST("/transcript", knH.CreateDocFromTranscript)
		knowledge.PATCH("/templates/:templateId/properties", knH.UpdateTemplateProperties)
		knowledge.GET("/props/board", knH.DocPropsBoard)
		knowledge.POST("/props/batch", knH.BatchDocProps)
		knowledge.PATCH("/nodes/:nodeId/access", knH.SetNodeAccess)
		knowledge.GET("/tags/dict", knH.ListTagDict)
		knowledge.POST("/tags/dict", knH.AddTagDict)
		knowledge.DELETE("/tags/dict/:dictId", knH.DeleteTagDict)
		knowledge.POST("/import/preview", knH.PreviewImport)
		knowledge.POST("/import/batch", knH.ImportFiles)
	}

	// 知识库文档级能力：属性、评论、最近浏览、导出。
	knowledgeDocs := h.Group("/documents", middleware.AuthRequired(cfg.JWTSecret))
	{
		knowledgeDocs.GET("/:id/properties", knH.GetDocProps)
		knowledgeDocs.PUT("/:id/properties", knH.UpdateDocProps)
		knowledgeDocs.GET("/:id/comments", knH.ListComments)
		knowledgeDocs.POST("/:id/comments", knH.AddComment)
		knowledgeDocs.PATCH("/:id/comments/:commentId", knH.UpdateComment)
		knowledgeDocs.DELETE("/:id/comments/:commentId", knH.DeleteComment)
		knowledgeDocs.POST("/:id/view", knH.TouchView)
		knowledgeDocs.GET("/:id/knowledge-export", knH.ExportDoc)
		knowledgeDocs.GET("/knowledge/recent", knH.RecentViews)
		// 分享链接、历史版本对比、在线协作状态、摘要与标签。
		knowledgeDocs.GET("/:id/shares", knH.ListShares)
		knowledgeDocs.POST("/:id/shares", knH.CreateShare)
		knowledgeDocs.DELETE("/:id/shares/:shareId", knH.RevokeShare)
		knowledgeDocs.GET("/:id/versions", knH.ListVersions)
		knowledgeDocs.GET("/:id/versions/:from/diff/:to", knH.VersionDiff)
		knowledgeDocs.POST("/:id/presence", knH.PresenceHeartbeat)
		knowledgeDocs.GET("/:id/presence", knH.PresenceList)
		knowledgeDocs.GET("/:id/summary", knH.DocSummary)
		knowledgeDocs.GET("/:id/tags", knH.DocTags)
		knowledgeDocs.POST("/:id/versions/:versionId/label", knH.LabelVersion)
		knowledgeDocs.GET("/:id/versions/authors", knH.VersionAuthors)
		knowledgeDocs.POST("/:id/save-as-template", knH.SaveDocAsTemplate)
		knowledgeDocs.GET("/:id/structure", knH.DocStructure)
		knowledgeDocs.POST("/:id/suggest", knH.SuggestWriting)
		knowledgeDocs.GET("/:id/crdt", knH.CRDTUpdates)
		knowledgeDocs.POST("/:id/crdt", knH.AppendCRDT)
		// 正文协同操作日志：HTTP 仍走 Bearer 鉴权。WebSocket 在组外单独挂载。
		knowledgeDocs.GET("/:id/operations", collabH.ListOperations)
		knowledgeDocs.POST("/:id/operations", collabH.AppendOperation)
		knowledgeDocs.GET("/:id/audit", auditH.ListAudit)
		knowledgeDocs.GET("/:id/blocks", blockH.ListBlocks)
		knowledgeDocs.GET("/:id/blocks/:blockId", blockH.GetBlock)
		// 知识库 5.0：自定义字段、评论增强、任务块、大纲与目录、docx 导出。
		knowledgeDocs.PUT("/:id/properties/fields", knH.UpdateDocFields)
		knowledgeDocs.POST("/:id/comments/:commentId/reaction", knH.ToggleCommentReaction)
		knowledgeDocs.POST("/:id/comments/read", knH.MarkCommentsRead)
		knowledgeDocs.GET("/:id/versions/:versionId/comments", knH.VersionComments)
		knowledgeDocs.GET("/:id/tasks", knH.DocTasks)
		knowledgeDocs.PATCH("/:id/tasks/:index", knH.ToggleDocTask)
		knowledgeDocs.GET("/:id/outline", knH.DocOutline)
		knowledgeDocs.POST("/:id/outline/reorder", knH.ReorderOutline)
		knowledgeDocs.PATCH("/:id/shares/:shareId/allowlist", knH.SetShareAllowList)
		knowledgeDocs.GET("/:id/docx", knH.ExportDocx)
	}

	// 正文协同 WebSocket：鉴权在 handler 内接受 Bearer 或 query token（浏览器握手不能自定义头）。
	h.GET("/documents/:id/collab", collabH.ServeWS)

	// 跨项目检索与问答：本人全部项目的语料。
	h.GET("/knowledge/search/global", middleware.AuthRequired(cfg.JWTSecret), knH.GlobalSearch)
	h.POST("/knowledge/ask/global", middleware.AuthRequired(cfg.JWTSecret), knH.AskGlobal)

	// 分享页是公开入口：靠分享 token 授权，不需要登录态。
	h.GET("/knowledge/shares/:token", knH.SharedDoc)
	h.POST("/knowledge/shares/:token/comments", knH.AddShareComment)
	h.PUT("/knowledge/shares/:token/content", knH.UpdateShareContent)

	// 活动日志查询（当前账号自己的记录）。
	h.GET("/logs", middleware.AuthRequired(cfg.JWTSecret), logsH.List)

	log.Printf("MetaMatrix API (Hertz+GORM) listening on http://localhost:%d", cfg.Port)
	h.Spin()
}
