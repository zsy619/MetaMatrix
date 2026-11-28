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
	// MediaObject 是附件对象存储（S3 / MinIO）配置。不齐时回退本地磁盘。
	MediaObject     MediaObjectConfig
	FeishuAppID     string
	FeishuAppSecret string
	FeishuBlockID   string
	// Mail holds the outbound mail settings.
	Mail MailConfig
	// PasswordReset holds the reset code settings.
	PasswordReset PasswordResetConfig
	// KnowledgeTrashKeepDays 是回收站节点的保留天数，超期由清理任务清除。
	KnowledgeTrashKeepDays int
	// KnowledgeVersionKeep 是每篇文档保留的历史版本条数。
	KnowledgeVersionKeep int
	// AI holds the optional external model settings. Empty means the
	// knowledge base falls back to its local implementations.
	AI AIConfig
	// BaseRateLimitRPS 是多维表格接口的每用户限流（每秒请求数）。
	// 0 表示不限流；默认 40（够用，也不会把正常操作误伤）。
	BaseRateLimitRPS int
	// BaseRateLimitBurst 是多维表格接口允许的突发请求数。
	BaseRateLimitBurst int
	// RedisURL 是可选的 Redis 地址，用于跨实例 presence / 光标广播。
	// 留空或连不上时降级为同实例（内存+kb_presence），服务仍启动。
	// Redis 不是文档或 Yjs 持久化。
	RedisURL string
	// BaseTenantScaleMax 是租户级动态配额的放大倍数上限（按空间成员数缩放）。
	BaseTenantScaleMax int
	// BaseImportBatchSize 是异步导入任务单批写入条数。
	BaseImportBatchSize int
	// BaseImportKeepDays 是导入任务记录的保留天数。
	BaseImportKeepDays int
	// BaseOperationLogKeepDays 是多维表格操作审计的保留天数（超期归档清理）。
	BaseOperationLogKeepDays int
	// BaseOutboxKeepDays 是已发布事件的保留天数（断线补拉窗口）。
	BaseOutboxKeepDays int
	// BaseOutboxMaxRetries 是事件发布失败的最大重试次数，超出进入死信队列。
	BaseOutboxMaxRetries int
	// BaseOutboxDeadKeepDays 是死信事件的保留天数。
	BaseOutboxDeadKeepDays int
	// DBMaxOpenConns / DBMaxIdleConns 是数据库连接池配置。
	DBMaxOpenConns       int
	DBMaxIdleConns       int
	DBConnMaxLifetimeMin int
	DBConnMaxIdleMin     int
}

// AIConfig describes the external model endpoint.
//
// Any OpenAI-compatible gateway works: OpenAI, DeepSeek, Qwen or a local
// vLLM. Without an API key the knowledge base keeps working with local
// fallbacks (hashed embeddings, rule-based minutes, corpus-based writing
// suggestions).
type AIConfig struct {
	BaseURL        string
	APIKey         string
	Model          string
	EmbeddingModel string
}

// MailConfig describes the outbound mail transport.
//
// The transport is vendor neutral: any SMTP server works by filling in the
// host, port and credentials. MAIL_MODE decides what happens when the
// settings are incomplete.
type MailConfig struct {
	// Mode is "smtp", "log" or "auto".
	//
	// "auto" is the default: use SMTP when the settings are complete,
	// otherwise fall back to the log transport in development and refuse to
	// send in production. See ResolveMailMode for the exact rules.
	Mode string
	// Host is the SMTP server host name.
	Host string
	// Port is the SMTP port. 465 is implicit TLS, 587 is STARTTLS.
	Port int
	// Username and Password are the SMTP credentials. They may be empty for
	// a relay that does not authenticate.
	Username string
	Password string
	// From is the envelope sender address, for example no-reply@example.com.
	From string
	// FromName is the display name shown in the client's sender column.
	FromName string
	// Insecure allows plain SMTP without TLS. Local debugging only.
	Insecure bool
	// Timeout bounds one delivery.
	Timeout time.Duration
}

// PasswordResetConfig describes the reset code policy.
type PasswordResetConfig struct {
	// CodeTTL is how long a code stays valid.
	CodeTTL time.Duration
	// MaxAttempts is the failure budget per code.
	MaxAttempts int
	// Cooldown is the minimum gap between two codes for the same address.
	Cooldown time.Duration
	// HourlyPerAddress caps the codes per address per hour.
	HourlyPerAddress int
	// DailyPerAddress caps the codes per address per day.
	DailyPerAddress int
	// HourlyPerIP caps the codes per IP per hour.
	HourlyPerIP int
	// RevealCode returns the code in the API response. Only safe with the
	// log transport.
	RevealCode bool
	// UnknownEmailMode decides what the request endpoint answers for an
	// address that is not registered.
	//
	// "uniform" returns the same answer as for a known address, so the
	// endpoint cannot be used to test whether an address has an account.
	// "explicit" reports the fact, which is friendlier but allows account
	// enumeration.
	UnknownEmailMode string
}

// Unknown email response modes.
const (
	// UnknownEmailUniform hides whether the address exists.
	UnknownEmailUniform = "uniform"
	// UnknownEmailExplicit tells the requester the address is unknown.
	UnknownEmailExplicit = "explicit"
)

func Load() Config {
	_ = godotenv.Load()
	// 分层配置：configs/default.yaml → configs/${APP_ENV}.yaml → 环境变量。
	// 环境变量优先级最高（生产改密 / 改地址不必动配置文件）。
	layer := loadLayered()
	port := layer.int("PORT", func(c yamlConfig) *int { return c.Server.Port }, 3000)
	secret := layer.str("JWT_SECRET", func(c yamlConfig) *string { return c.Auth.JWTSecret }, "metamatrix-dev-jwt-secret")
	dbURL := layer.str("DATABASE_URL", func(c yamlConfig) *string { return c.Database.URL },
		"postgresql://metamatrix:metamatrix@localhost:5432/metamatrix")
	signSecret := layer.str("MEDIA_SIGN_SECRET", func(c yamlConfig) *string { return c.Media.SignSecret }, "")
	if signSecret == "" {
		signSecret = secret
	}
	mediaRoot := layer.str("MEDIA_ROOT", func(c yamlConfig) *string { return c.Media.Root }, "data/media")
	return Config{
		DatabaseURL:              dbURL,
		Port:                     port,
		JWTSecret:                secret,
		LoginWindow:              layer.duration("LOGIN_WINDOW", func(c yamlConfig) *string { return c.Auth.LoginWindow }, 15*time.Minute),
		LoginPairLimit:           layer.int("LOGIN_PAIR_LIMIT", func(c yamlConfig) *int { return c.Auth.LoginPairLimit }, 8),
		LoginIPLimit:             layer.int("LOGIN_IP_LIMIT", func(c yamlConfig) *int { return c.Auth.LoginIPLimit }, 30),
		CaptchaTTL:               layer.duration("CAPTCHA_TTL", func(c yamlConfig) *string { return c.Captcha.TTL }, 5*time.Minute),
		CaptchaDebug:             layer.bool("CAPTCHA_DEBUG", func(c yamlConfig) *bool { return c.Captcha.Debug }, false),
		CaptchaDebugLoopback:     boolEnv("CAPTCHA_DEBUG_LOOPBACK", runningInCI()),
		MediaRoot:                mediaRoot,
		MediaSignSecret:          signSecret,
		MediaObject:              loadMediaObjectConfig(),
		FeishuAppID:              os.Getenv("FEISHU_APP_ID"),
		FeishuAppSecret:          os.Getenv("FEISHU_APP_SECRET"),
		FeishuBlockID:            os.Getenv("FEISHU_DOC_BLOCK_ID"),
		// 0 是有效取值（= 不限流），不能用 layer.int —— 它会把 0 当成「没设置」。
		BaseRateLimitRPS:         layer.intAllowZero("BASE_RATE_LIMIT_RPS", func(c yamlConfig) *int { return c.Base.RateLimit.RPS }, 200),
		BaseRateLimitBurst:       layer.int("BASE_RATE_LIMIT_BURST", func(c yamlConfig) *int { return c.Base.RateLimit.Burst }, 400),
		BaseTenantScaleMax:       layer.int("BASE_TENANT_SCALE_MAX", func(c yamlConfig) *int { return c.Base.RateLimit.TenantScaleMax }, 8),
		BaseImportBatchSize:      layer.int("BASE_IMPORT_BATCH_SIZE", func(c yamlConfig) *int { return c.Base.Import.BatchSize }, 200),
		BaseImportKeepDays:       layer.int("BASE_IMPORT_KEEP_DAYS", func(c yamlConfig) *int { return c.Base.Import.KeepDays }, 30),
		BaseOperationLogKeepDays: layer.int("BASE_OPERATION_LOG_KEEP_DAYS", func(c yamlConfig) *int { return c.Base.OperationLog.KeepDays }, 90),
		BaseOutboxKeepDays:       layer.int("BASE_OUTBOX_KEEP_DAYS", func(c yamlConfig) *int { return c.Base.Outbox.KeepDays }, 7),
		BaseOutboxMaxRetries:     layer.int("BASE_OUTBOX_MAX_RETRIES", func(c yamlConfig) *int { return c.Base.Outbox.MaxRetries }, 5),
		BaseOutboxDeadKeepDays:   layer.int("BASE_OUTBOX_DEAD_KEEP_DAYS", func(c yamlConfig) *int { return c.Base.Outbox.DeadKeepDays }, 30),
		DBMaxOpenConns:           layer.int("DB_MAX_OPEN_CONNS", func(c yamlConfig) *int { return c.Database.MaxOpenConns }, 50),
		DBMaxIdleConns:           layer.int("DB_MAX_IDLE_CONNS", func(c yamlConfig) *int { return c.Database.MaxIdleConns }, 10),
		DBConnMaxLifetimeMin:     layer.int("DB_CONN_MAX_LIFETIME_MIN", func(c yamlConfig) *int { return c.Database.ConnMaxLifeMin }, 30),
		DBConnMaxIdleMin:         layer.int("DB_CONN_MAX_IDLE_MIN", func(c yamlConfig) *int { return c.Database.ConnMaxIdleMin }, 5),
		RedisURL:                 firstNonEmpty(os.Getenv("REDIS_URL"), os.Getenv("PRESENCE_REDIS_URL")),
		Mail:                     loadMailConfig(),
		PasswordReset:            loadPasswordResetConfig(),
		KnowledgeTrashKeepDays:   intEnv("KNOWLEDGE_TRASH_KEEP_DAYS", 30),
		KnowledgeVersionKeep:     intEnv("KNOWLEDGE_VERSION_KEEP", 50),
		AI: AIConfig{
			BaseURL:        strings.TrimSpace(os.Getenv("AI_BASE_URL")),
			APIKey:         strings.TrimSpace(os.Getenv("AI_API_KEY")),
			Model:          strings.TrimSpace(os.Getenv("AI_MODEL")),
			EmbeddingModel: strings.TrimSpace(os.Getenv("AI_EMBEDDING_MODEL")),
		},
	}
}

// MediaObjectConfig 描述 S3 兼容对象存储。密钥只从环境变量读取，不写进代码。
type MediaObjectConfig struct {
	Mode      string
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	Prefix    string
	UseSSL    bool
}

func loadMediaObjectConfig() MediaObjectConfig {
	endpoint := strings.TrimSpace(os.Getenv("MEDIA_S3_ENDPOINT"))
	useSSL := boolEnv("MEDIA_S3_USE_SSL", strings.HasPrefix(strings.ToLower(endpoint), "https://"))
	return MediaObjectConfig{
		Mode:      strings.ToLower(strings.TrimSpace(os.Getenv("MEDIA_STORE"))),
		Endpoint:  endpoint,
		Bucket:    strings.TrimSpace(os.Getenv("MEDIA_S3_BUCKET")),
		Region:    strings.TrimSpace(os.Getenv("MEDIA_S3_REGION")),
		AccessKey: strings.TrimSpace(os.Getenv("MEDIA_S3_ACCESS_KEY")),
		SecretKey: os.Getenv("MEDIA_S3_SECRET_KEY"),
		Prefix:    strings.TrimSpace(os.Getenv("MEDIA_S3_PREFIX")),
		UseSSL:    useSSL,
	}
}

// loadMailConfig reads the outbound mail settings.
func loadMailConfig() MailConfig {
	return MailConfig{
		Mode:     strings.ToLower(strings.TrimSpace(os.Getenv("MAIL_MODE"))),
		Host:     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		Port:     intEnv("SMTP_PORT", 587),
		Username: strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		Password: os.Getenv("SMTP_PASSWORD"),
		From:     strings.TrimSpace(os.Getenv("SMTP_FROM")),
		FromName: strings.TrimSpace(os.Getenv("SMTP_FROM_NAME")),
		Insecure: boolEnv("SMTP_INSECURE", false),
		Timeout:  durationEnv("SMTP_TIMEOUT", 15*time.Second),
	}
}

// loadPasswordResetConfig reads the reset code policy.
func loadPasswordResetConfig() PasswordResetConfig {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("RESET_UNKNOWN_EMAIL_MODE")))
	switch mode {
	case "":
		// 默认走显式模式：邮箱没注册时直接告诉用户"这个邮箱还没有账号"。
		// 体验更直白，代价是接口可以被用来试探某个邮箱是否注册过。
		// 想关掉这个信息泄露，把 RESET_UNKNOWN_EMAIL_MODE 设成 uniform。
		mode = UnknownEmailExplicit
	case UnknownEmailExplicit, UnknownEmailUniform:
		// 合法值，原样使用。
	default:
		// 变量写错时回落到统一响应，宁可少提示，也不要无意中放开账号枚举。
		mode = UnknownEmailUniform
	}
	return PasswordResetConfig{
		CodeTTL:          durationEnv("RESET_CODE_TTL", 10*time.Minute),
		MaxAttempts:      intEnv("RESET_CODE_MAX_ATTEMPTS", 5),
		Cooldown:         durationEnv("RESET_COOLDOWN", 60*time.Second),
		HourlyPerAddress: intEnv("RESET_HOURLY_PER_ADDRESS", 5),
		DailyPerAddress:  intEnv("RESET_DAILY_PER_ADDRESS", 10),
		HourlyPerIP:      intEnv("RESET_HOURLY_PER_IP", 20),
		RevealCode:       boolEnv("RESET_REVEAL_CODE", false),
		UnknownEmailMode: mode,
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

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}
