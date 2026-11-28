package middleware

import (
	"context"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"

	"metamatrix/api/internal/model"
)

// ActivityRecorder 是活动日志的落点。
//
// 这里只依赖接口而不是 service：service 已经依赖 middleware，
// 反向依赖会形成循环。
type ActivityRecorder interface {
	Record(entry model.ActivityLog)
}

// ClientIP 返回请求方地址（可被 X-Forwarded-For 影响）。
func ClientIP(c *app.RequestContext) string {
	if ip := c.ClientIP(); ip != "" {
		return ip
	}
	return "unknown"
}

// skipActivityPaths 这些路径不记写操作日志：
// 登录与退出由认证接口自己记（更准），其余是只读或基础设施接口。
var skipActivityPaths = map[string]bool{
	"/auth/login":      true,
	"/auth/logout":     true,
	"/auth/captcha":    true,
	"/auth/register":   true,
	"/auth/refresh":    true,
	"/health":          true,
	"/metrics":         true,
	"/logs":            true,
}

// ActivityLog 记录写操作（POST / PUT / PATCH / DELETE）为一条活动日志。
//
// 只记方法、路径与结果，不记请求体：请求体里有密码、正文和密钥。
func ActivityLog(recorder ActivityRecorder) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		c.Next(ctx)
		if recorder == nil {
			return
		}
		method := string(c.Method())
		switch method {
		case "POST", "PUT", "PATCH", "DELETE":
		default:
			return
		}
		path := string(c.Path())
		if skipActivityPaths[path] {
			return
		}
		uid, ok := UserIDFromCtx(c)
		if !ok {
			// 未登录的写操作（多半是被拦下的）不记：没有主人可挂。
			return
		}
		status := c.Response.StatusCode()
		if status == 0 {
			status = 200
		}
		result := "success"
		if status >= 400 {
			result = "failure"
		}
		recorder.Record(model.ActivityLog{
			UserID:    uid,
			Category:  "operation",
			Action:    strings.TrimSpace(method + " " + path),
			Status:    result,
			Method:    method,
			Path:      path,
			Detail:    "status=" + itoa(status),
			IP:        ClientIP(c),
			UserAgent: truncate(string(c.GetHeader("User-Agent")), 240),
			RequestID: requestIDFromCtx(c),
		})
	}
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [12]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func truncate(raw string, max int) string {
	if len(raw) <= max {
		return raw
	}
	return raw[:max]
}

func requestIDFromCtx(c *app.RequestContext) string {
	if v, ok := c.Get("requestID"); ok {
		if id, isString := v.(string); isString {
			return id
		}
	}
	return ""
}
