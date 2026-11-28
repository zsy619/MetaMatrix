package mail

import (
	"fmt"
	"strings"
)

// PasswordResetMessage renders the email that carries the reset code.
//
// The body is plain text on purpose: transactional code mail does not benefit
// from HTML, and plain text is never blocked by clients that suppress HTML
// content by default. The message states the code, how long it lives, and —
// importantly — that MetaMatrix will never ask for the code by phone or chat.
//
// The recipient is a parameter rather than something the caller patches in
// afterwards: a message without a recipient cannot be delivered, and the
// sender rejects it. Making it part of the construction keeps the address and
// the body from ever getting out of sync.
func PasswordResetMessage(to, code string, ttlMinutes int, appName string) Message {
	name := strings.TrimSpace(appName)
	if name == "" {
		name = "元矩阵 MetaMatrix"
	}
	if ttlMinutes <= 0 {
		ttlMinutes = 10
	}
	text := fmt.Sprintf(`%s 密码重置验证码

您正在重置 %s 的登录密码。

验证码：%s

验证码 %d 分钟内有效，请尽快使用。

如果这不是您本人的操作，请忽略这封邮件，您的密码不会被更改。
您也可以登录账号中心自行修改密码。

出于安全考虑，%s 不会通过电话、微信或邮件以外的方式索取此验证码。
请勿将验证码转发给任何人。

— %s
`, name, name, code, ttlMinutes, name, name)

	return Message{
		To:      strings.TrimSpace(to),
		Subject: fmt.Sprintf("%s 密码重置验证码：%s", name, code),
		Text:    text,
	}
}
