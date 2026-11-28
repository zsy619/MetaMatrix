package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// 分层配置（configs/*.yaml）。
//
// 为什么要分层：
//   - 之前所有配置都塞在 .env / 环境变量里，端口、限流、保留天数这些
//     「调一次要看半天代码」的值没有结构；
//   - .env 不适合进版本库（带密钥），yaml 适合（只放结构与默认值）；
//   - 分层后：默认值 → 环境层 → 环境变量，三段覆盖，密钥永远只走环境变量。
//
// 覆盖顺序（后者覆盖前者）：
//  1. configs/default.yaml
//  2. configs/${APP_ENV}.yaml（APP_ENV 默认 dev）
//  3. 进程环境变量（含 .env 载入的本地便利变量；.env 不覆盖已存在的环境变量）
//
// 即「环境变量 > yaml」：生产密钥与地址永远可以用环境变量临时覆盖，
// 不需要为了改一个端口去改配置文件。

// yamlConfig 是配置文件在内存里的形态（用指针区分「没写」与「写了零值」）。
type yamlConfig struct {
	Server struct {
		Port *int `yaml:"port"`
	} `yaml:"server"`
	Database struct {
		URL            *string `yaml:"url"`
		MaxOpenConns   *int    `yaml:"maxOpenConns"`
		MaxIdleConns   *int    `yaml:"maxIdleConns"`
		ConnMaxLifeMin *int    `yaml:"connMaxLifetimeMin"`
		ConnMaxIdleMin *int    `yaml:"connMaxIdleMin"`
	} `yaml:"database"`
	Auth struct {
		JWTSecret      *string `yaml:"jwtSecret"`
		LoginWindow    *string `yaml:"loginWindow"`
		LoginPairLimit *int    `yaml:"loginPairLimit"`
		LoginIPLimit   *int    `yaml:"loginIPLimit"`
	} `yaml:"auth"`
	Captcha struct {
		TTL   *string `yaml:"ttl"`
		Debug *bool   `yaml:"debug"`
	} `yaml:"captcha"`
	Media struct {
		Root       *string `yaml:"root"`
		SignSecret *string `yaml:"signSecret"`
		Object     struct {
			Mode      *string `yaml:"mode"`
			Endpoint  *string `yaml:"endpoint"`
			Bucket    *string `yaml:"bucket"`
			Region    *string `yaml:"region"`
			AccessKey *string `yaml:"accessKey"`
			SecretKey *string `yaml:"secretKey"`
			Prefix    *string `yaml:"prefix"`
			UseSSL    *bool   `yaml:"useSSL"`
		} `yaml:"object"`
	} `yaml:"media"`
	Knowledge struct {
		TrashKeepDays *int `yaml:"trashKeepDays"`
		VersionKeep   *int `yaml:"versionKeep"`
	} `yaml:"knowledge"`
	Base struct {
		RateLimit struct {
			RPS            *int `yaml:"rps"`
			Burst          *int `yaml:"burst"`
			TenantScaleMax *int `yaml:"tenantScaleMax"`
		} `yaml:"rateLimit"`
		Import struct {
			BatchSize *int `yaml:"batchSize"`
			KeepDays  *int `yaml:"keepDays"`
		} `yaml:"import"`
		OperationLog struct {
			KeepDays *int `yaml:"keepDays"`
		} `yaml:"operationLog"`
		Outbox struct {
			KeepDays     *int `yaml:"keepDays"`
			MaxRetries   *int `yaml:"maxRetries"`
			DeadKeepDays *int `yaml:"deadKeepDays"`
		} `yaml:"outbox"`
	} `yaml:"base"`
	Mail struct {
		Mode     *string `yaml:"mode"`
		Host     *string `yaml:"host"`
		Port     *int    `yaml:"port"`
		Username *string `yaml:"username"`
		Password *string `yaml:"password"`
		From     *string `yaml:"from"`
		FromName *string `yaml:"fromName"`
		Insecure *bool   `yaml:"insecure"`
		Timeout  *string `yaml:"timeout"`
	} `yaml:"mail"`
	PasswordReset struct {
		CodeTTL          *string `yaml:"codeTTL"`
		MaxAttempts      *int    `yaml:"maxAttempts"`
		Cooldown         *string `yaml:"cooldown"`
		HourlyPerAddress *int    `yaml:"hourlyPerAddress"`
		DailyPerAddress  *int    `yaml:"dailyPerAddress"`
		HourlyPerIP      *int    `yaml:"hourlyPerIP"`
		RevealCode       *bool   `yaml:"revealCode"`
		UnknownEmailMode *string `yaml:"unknownEmailMode"`
	} `yaml:"passwordReset"`
	AI struct {
		BaseURL        *string `yaml:"baseURL"`
		APIKey         *string `yaml:"apiKey"`
		Model          *string `yaml:"model"`
		EmbeddingModel *string `yaml:"embeddingModel"`
	} `yaml:"ai"`
}

// layered 是合并后的分层配置。
type layered struct {
	defaults yamlConfig
	env      yamlConfig
}

// loadLayered 读取基础层与环境层配置。
//
// 找不到配置文件不算错误：全部走默认值（部署环境可能只用环境变量）。
func loadLayered() layered {
	out := layered{}
	out.defaults = readYAMLFile(defaultConfigPath())
	out.env = readYAMLFile(envConfigPath())
	return out
}

// defaultConfigPath 返回基础层文件路径。
func defaultConfigPath() string {
	return filepath.Join(configDir(), "default.yaml")
}

// envConfigPath 返回环境层文件路径。
func envConfigPath() string {
	env := strings.TrimSpace(os.Getenv("APP_ENV"))
	if env == "" {
		env = "dev"
	}
	return filepath.Join(configDir(), env+".yaml")
}

// configDir 定位配置目录。
//
// 查找顺序：CONFIG_DIR 环境变量 → 可执行文件同级的 configs/ → 当前工作目录的 configs/。
func configDir() string {
	if dir := strings.TrimSpace(os.Getenv("CONFIG_DIR")); dir != "" {
		return dir
	}
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "configs")
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate
		}
	}
	if wd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(wd, "configs")
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate
		}
	}
	return "configs"
}

// readYAMLFile 读取一个 YAML 配置文件。
func readYAMLFile(path string) yamlConfig {
	var cfg yamlConfig
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg
	}
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		// 配置写坏了不能让服务起不来：退回默认值，靠日志提示。
		fmt.Fprintf(os.Stderr, "config: parse %s failed: %v\n", path, err)
		return yamlConfig{}
	}
	return cfg
}

// —— 取值助手：环境层 > 基础层 > 环境变量 > 代码默认 ——

// str 取字符串配置。
func (l layered) str(envKey string, pick func(c yamlConfig) *string, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return v
	}
	if v := pick(l.env); v != nil {
		return *v
	}
	if v := pick(l.defaults); v != nil {
		return *v
	}
	return fallback
}

// int 取整数配置。
func (l layered) int(envKey string, pick func(c yamlConfig) *int, fallback int) int {
	if raw := strings.TrimSpace(os.Getenv(envKey)); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			return n
		}
	}
	if v := pick(l.env); v != nil {
		return *v
	}
	if v := pick(l.defaults); v != nil {
		return *v
	}
	return fallback
}

// bool 取布尔配置。
func (l layered) bool(envKey string, pick func(c yamlConfig) *bool, fallback bool) bool {
	if raw := strings.TrimSpace(os.Getenv(envKey)); raw != "" {
		return boolEnv(envKey, fallback)
	}
	if v := pick(l.env); v != nil {
		return *v
	}
	if v := pick(l.defaults); v != nil {
		return *v
	}
	return fallback
}

// duration 取时长配置。
func (l layered) duration(envKey string, pick func(c yamlConfig) *string, fallback time.Duration) time.Duration {
	raw := l.str(envKey, pick, "")
	if raw == "" {
		return fallback
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}
