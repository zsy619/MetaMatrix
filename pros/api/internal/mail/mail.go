// Package mail sends transactional email.
//
// The package is deliberately vendor-neutral: it speaks plain SMTP, so any
// provider (Brevo, Aliyun DirectMail, Tencent SES, a self-hosted relay, even
// a personal QQ mailbox) works by changing configuration alone. Nothing in
// the codebase depends on a specific vendor SDK.
//
// Three implementations exist:
//
//	Sender  — real SMTP delivery (production)
//	LogSender — writes the message to the log instead of sending it (local dev)
//	DisabledSender — refuses every send (production without configuration)
package mail

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// ErrNotConfigured is returned when a send is attempted without a usable
// transport. The HTTP layer turns it into a 503 rather than pretending the
// mail went out.
var ErrNotConfigured = errors.New("mail transport is not configured")

// Message is one outbound email.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Sender delivers a message. Implementations must respect ctx cancellation.
type Sender interface {
	Send(ctx context.Context, msg Message) error
	// Describe returns a short human-readable description of the transport.
	// It is logged at startup so an operator can see which path is live.
	Describe() string
}

// Config holds the SMTP settings. The zero value is not usable.
type Config struct {
	// Mode selects the transport: "smtp", "log" or "auto". Empty means auto.
	Mode string
	Host string
	Port int
	// Username and Password are the SMTP credentials.
	Username string
	Password string
	// From is the envelope sender address.
	From string
	// FromName is the display name shown to the recipient.
	FromName string
	// Timeout bounds the whole delivery (connect + TLS + handshake + body).
	Timeout time.Duration
	// Insecure allows plain SMTP without STARTTLS. Only for local debugging
	// against a fake server; production must leave it false.
	Insecure bool
}

// SMTPConfig describes the connection profile implied by a Config.
func (c Config) SMTPConfig() (host string, port int, implicitTLS bool) {
	host = strings.TrimSpace(c.Host)
	port = c.Port
	// Port 465 is the implicit TLS port (SMTPS). Port 587 negotiates TLS
	// with STARTTLS after a plain greeting.
	implicitTLS = port == 465
	return host, port, implicitTLS
}

// Configured reports whether the config carries enough information to attempt
// a real delivery.
func (c Config) Configured() bool {
	return strings.TrimSpace(c.Host) != "" &&
		c.Port > 0 &&
		strings.TrimSpace(c.From) != ""
}

// SMTPSender delivers mail over SMTP.
type SMTPSender struct {
	Cfg Config
	// Dial is the dialer used to open the connection. Tests inject a fake.
	Dial func(ctx context.Context, network, addr string) (net.Conn, error)
	// TLSConfig overrides the TLS settings used for the encrypted channel.
	// Production leaves it nil, which means the certificate is verified
	// against the SMTP host name. Tests point it at a local certificate
	// authority so they can drive the implicit TLS path.
	TLSConfig *tls.Config
}

// Describe implements Sender.
func (s *SMTPSender) Describe() string {
	host, port, _ := s.Cfg.SMTPConfig()
	return fmt.Sprintf("smtp(%s:%d)", host, port)
}

// newClient turns a raw connection into a ready to use SMTP client.
//
// The two TLS flavours differ in where the handshake happens, and that
// difference decides the order of the calls below.
//
//   - Port 465 (SMTPS, implicit TLS): the server speaks TLS from the very
//     first byte. The client must complete the handshake on the raw socket
//     BEFORE it may read the SMTP greeting. Reading the greeting on a plain
//     socket would block until the deadline expires, because the server is
//     waiting for a TLS ClientHello and never sends any plaintext.
//   - Port 587 (STARTTLS): the server sends a plaintext greeting first and
//     upgrades the channel afterwards through the STARTTLS command.
//
// So for 465 the connection is wrapped in a tls.Conn and the handshake is
// completed explicitly before smtp.NewClient reads the greeting. Passing the
// *tls.Conn to smtp.NewClient also makes the library mark the session as
// encrypted, which is the precondition smtp.PlainAuth checks before it is
// willing to send the credentials.
func (s *SMTPSender) newClient(conn net.Conn, host string, implicitTLS bool) (*smtp.Client, error) {
	if implicitTLS {
		tlsConn := tls.Client(conn, s.tlsConfig(host))
		// Handshake eagerly so a certificate or network problem is reported
		// here, instead of surfacing later as a confusing read error.
		if err := tlsConn.Handshake(); err != nil {
			return nil, fmt.Errorf("smtp tls handshake: %w", err)
		}
		client, err := smtp.NewClient(tlsConn, host)
		if err != nil {
			return nil, fmt.Errorf("smtp handshake: %w", err)
		}
		return client, nil
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return nil, fmt.Errorf("smtp handshake: %w", err)
	}
	if !s.Cfg.Insecure {
		// STARTTLS is mandatory outside of the local debugging escape hatch.
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(s.tlsConfig(host)); err != nil {
				return nil, fmt.Errorf("smtp starttls: %w", err)
			}
		}
	}
	return client, nil
}

// tlsConfig builds the TLS settings for the host. The server name is always
// pinned so the certificate is verified against the host we dialled.
func (s *SMTPSender) tlsConfig(host string) *tls.Config {
	// A test can inject its own certificate authority through TLSConfig.
	if s.TLSConfig != nil {
		custom := s.TLSConfig.Clone()
		if custom.ServerName == "" {
			custom.ServerName = host
		}
		return custom
	}
	return &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
}

// Send implements Sender.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	if !s.Cfg.Configured() {
		return ErrNotConfigured
	}
	to := strings.TrimSpace(msg.To)
	if to == "" {
		return errors.New("mail recipient is empty")
	}
	host, port, implicitTLS := s.Cfg.SMTPConfig()
	addr := net.JoinHostPort(host, strconv.Itoa(port))

	timeout := s.Cfg.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	dial := s.Dial
	if dial == nil {
		d := &net.Dialer{Timeout: timeout}
		dial = func(ctx context.Context, network, a string) (net.Conn, error) {
			return d.DialContext(ctx, network, a)
		}
	}

	conn, err := dial(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	// The deadline covers the whole exchange; a hung server must not pin the
	// request goroutine forever.
	deadline := time.Now().Add(timeout)
	if dl, ok := ctx.Deadline(); ok && dl.Before(deadline) {
		deadline = dl
	}
	_ = conn.SetDeadline(deadline)
	defer conn.Close()

	// The two TLS flavours differ in where the handshake happens, and that
	// difference decides the order of the calls inside newClient.
	client, err := s.newClient(conn, host, implicitTLS)
	if err != nil {
		return err
	}
	defer client.Close()

	if user := strings.TrimSpace(s.Cfg.Username); user != "" {
		auth := smtp.PlainAuth("", user, s.Cfg.Password, host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(s.Cfg.From); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(buildMessage(s.Cfg, msg))); err != nil {
		_ = w.Close()
		return fmt.Errorf("smtp write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close body: %w", err)
	}
	return client.Quit()
}

// LogSender prints the message instead of delivering it. It is the local
// development transport: the reset code shows up in the API log, so the whole
// flow can be exercised without a mail provider.
type LogSender struct {
	// Logger receives the message. Defaults to the standard logger.
	Logger *log.Logger
}

func (l *LogSender) logger() *log.Logger {
	if l != nil && l.Logger != nil {
		return l.Logger
	}
	return log.Default()
}

// Describe implements Sender.
func (l *LogSender) Describe() string { return "log" }

// Send implements Sender.
func (l *LogSender) Send(_ context.Context, msg Message) error {
	l.logger().Printf("[mail:log] to=%s subject=%q\n%s", msg.To, msg.Subject, msg.Text)
	return nil
}

// DisabledSender rejects every send. It is the production default when no
// SMTP configuration is present, so a missing configuration surfaces as an
// explicit error instead of a silently successful response.
type DisabledSender struct{}

// Describe implements Sender.
func (DisabledSender) Describe() string { return "disabled" }

// Send implements Sender.
func (DisabledSender) Send(_ context.Context, _ Message) error { return ErrNotConfigured }

// buildMessage renders the RFC 5322 message. The body is plain text only:
// a transactional code email does not need HTML, and plain text avoids
// clients that hide HTML by default.
func buildMessage(cfg Config, msg Message) string {
	var b strings.Builder
	from := cfg.From
	if name := strings.TrimSpace(cfg.FromName); name != "" {
		// Encode the display name so non-ASCII names survive.
		from = fmt.Sprintf("%s <%s>", mimeEncodeWord(name), cfg.From)
	}
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + msg.To + "\r\n")
	b.WriteString("Subject: " + mimeEncodeWord(msg.Subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	b.WriteString("\r\n")
	b.WriteString(strings.ReplaceAll(msg.Text, "\n", "\r\n"))
	b.WriteString("\r\n")
	return b.String()
}

// mimeEncodeWord encodes a header value as an RFC 2047 encoded word when it
// contains non-ASCII characters, so Chinese subjects and sender names render
// correctly in every mail client.
func mimeEncodeWord(s string) string {
	ascii := true
	for _, r := range s {
		if r > 127 {
			ascii = false
			break
		}
	}
	if ascii {
		return s
	}
	// Base64 encoded word: =?UTF-8?B?<base64>?=
	const prefix = "=?UTF-8?B?"
	const suffix = "?="
	return prefix + base64Encode(s) + suffix
}

// base64Encode is a thin wrapper so the encoding call site reads clearly.
func base64Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}
