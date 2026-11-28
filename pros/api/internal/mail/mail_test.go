package mail

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"net"
	"strings"
	"testing"
	"time"
)

// fakeSMTPServer is a minimal SMTP server that records the session.
//
// It speaks just enough of RFC 5321 for the client to complete a delivery:
// greeting, EHLO, MAIL, RCPT, DATA, QUIT.
type fakeSMTPServer struct {
	ln       net.Listener
	mailFrom string
	rcptTo   string
	body     string
	authUser string
	authPass string
	// requireAuth makes the server advertise and demand AUTH PLAIN.
	requireAuth bool
	// tlsConfig switches the server into implicit TLS mode: the handshake
	// happens right after the TCP connection, before the greeting is sent.
	// That is how a real SMTPS host on port 465 behaves.
	tlsConfig *tls.Config
	err       error
}

func newFakeSMTPServer(t *testing.T, requireAuth bool) *fakeSMTPServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &fakeSMTPServer{ln: ln, requireAuth: requireAuth}
	go s.serve()
	t.Cleanup(func() { _ = ln.Close() })
	return s
}

// newFakeImplicitTLSServer starts the same server in implicit TLS mode. It
// returns the listener address and the pool that trusts its certificate.
func newFakeImplicitTLSServer(t *testing.T) (*fakeSMTPServer, *x509.CertPool) {
	t.Helper()

	// A self signed certificate for 127.0.0.1 is enough: the test injects it
	// as the trusted root through SMTPSender.TLSConfig.
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(leaf)

	cert := tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: leaf}
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}})
	if err != nil {
		t.Fatal(err)
	}
	s := &fakeSMTPServer{ln: ln, tlsConfig: &tls.Config{Certificates: []tls.Certificate{cert}}}
	go s.serve()
	t.Cleanup(func() { _ = ln.Close() })
	return s, pool
}

func (s *fakeSMTPServer) addr() (string, int) {
	host, port, _ := net.SplitHostPort(s.ln.Addr().String())
	return host, atoi(port)
}

func (s *fakeSMTPServer) serve() {
	conn, err := s.ln.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	// In implicit TLS mode the handshake completes before the greeting, so
	// the server must not send anything in plaintext.
	if s.tlsConfig != nil {
		tlsConn, ok := conn.(*tls.Conn)
		if !ok {
			return
		}
		if err := tlsConn.Handshake(); err != nil {
			return
		}
		conn = tlsConn
	}

	rw := newLineRW(conn)
	rw.write("220 fake ESMTP ready")

	inData := false
	for {
		line, err := rw.readLine()
		if err != nil {
			return
		}
		upper := strings.ToUpper(line)
		switch {
		case inData:
			if line == "." {
				inData = false
				rw.write("250 OK queued")
				continue
			}
			s.body += line + "\n"
		case strings.HasPrefix(upper, "EHLO"), strings.HasPrefix(upper, "HELO"):
			if s.requireAuth {
				rw.write("250-fake greets you")
				rw.write("250-AUTH PLAIN LOGIN")
				rw.write("250 OK")
			} else {
				rw.write("250 fake greets you")
			}
		case strings.HasPrefix(upper, "AUTH PLAIN"):
			// The client sends base64 of "\0user\0pass".
			parts := strings.SplitN(line[len("AUTH PLAIN"):], " ", 2)
			if len(parts) == 2 {
				decoded, decErr := base64Decode(strings.TrimSpace(parts[1]))
				if decErr == nil {
					fields := strings.Split(decoded, "\x00")
					if len(fields) >= 3 {
						s.authUser = fields[1]
						s.authPass = fields[2]
					}
				}
			}
			rw.write("235 2.7.0 Authentication successful")
		case strings.HasPrefix(upper, "MAIL FROM"):
			s.mailFrom = extractAddr(line)
			rw.write("250 OK")
		case strings.HasPrefix(upper, "RCPT TO"):
			s.rcptTo = extractAddr(line)
			rw.write("250 OK")
		case strings.HasPrefix(upper, "DATA"):
			inData = true
			rw.write("354 End data with <CR><LF>.<CR><LF>")
		case strings.HasPrefix(upper, "QUIT"):
			rw.write("221 Bye")
			return
		case strings.HasPrefix(upper, "RSET"):
			rw.write("250 OK")
		default:
			rw.write("250 OK")
		}
	}
}

// TestSMTPSenderDelivers runs a full delivery against the fake server.
func TestSMTPSenderDelivers(t *testing.T) {
	srv := newFakeSMTPServer(t, false)
	host, port := srv.addr()

	sender := &SMTPSender{Cfg: Config{
		Host: host, Port: port,
		From: "no-reply@metamatrix.local", FromName: "元矩阵",
		Timeout: 5 * time.Second,
		// The fake server speaks plain SMTP, so TLS must be off for this
		// test. The Insecure flag is exactly what that switch is for.
		Insecure: true,
	}}
	msg := Message{
		To:      "user@metamatrix.local",
		Subject: "密码重置验证码：123456",
		Text:    "验证码：123456\n十分钟内有效。",
	}
	if err := sender.Send(context.Background(), msg); err != nil {
		t.Fatalf("send: %v", err)
	}
	if srv.mailFrom != "no-reply@metamatrix.local" {
		t.Fatalf("unexpected MAIL FROM: %q", srv.mailFrom)
	}
	if srv.rcptTo != "user@metamatrix.local" {
		t.Fatalf("unexpected RCPT TO: %q", srv.rcptTo)
	}
	if !strings.Contains(srv.body, "验证码：123456") {
		t.Fatalf("the body must carry the code, got %q", srv.body)
	}
	// The Chinese subject must be encoded, not sent as raw UTF-8.
	if !strings.Contains(srv.body, "=?UTF-8?B?") {
		t.Fatalf("a non ASCII subject must be MIME encoded, got %q", srv.body)
	}
}

// TestSMTPSenderAuthenticates checks that the credentials are used.
func TestSMTPSenderAuthenticates(t *testing.T) {
	srv := newFakeSMTPServer(t, true)
	host, port := srv.addr()

	sender := &SMTPSender{Cfg: Config{
		Host: host, Port: port,
		Username: "mailer@example.com", Password: "s3cret",
		From:    "no-reply@metamatrix.local",
		Timeout: 5 * time.Second, Insecure: true,
	}}
	if err := sender.Send(context.Background(), Message{
		To: "user@metamatrix.local", Subject: "hi", Text: "hello",
	}); err != nil {
		t.Fatalf("send: %v", err)
	}
	if srv.authUser != "mailer@example.com" {
		t.Fatalf("unexpected auth user: %q", srv.authUser)
	}
	if srv.authPass != "s3cret" {
		t.Fatalf("unexpected auth password: %q", srv.authPass)
	}
}

// TestSMTPSenderNotConfigured checks the guard for a missing configuration.
func TestSMTPSenderNotConfigured(t *testing.T) {
	sender := &SMTPSender{Cfg: Config{}}
	err := sender.Send(context.Background(), Message{To: "a@b.c"})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

// TestSMTPSenderRejectsEmptyRecipient checks the recipient guard.
func TestSMTPSenderRejectsEmptyRecipient(t *testing.T) {
	sender := &SMTPSender{Cfg: Config{Host: "127.0.0.1", Port: 2525, From: "a@b.c"}}
	err := sender.Send(context.Background(), Message{To: "   "})
	if err == nil {
		t.Fatal("an empty recipient must be rejected")
	}
}

// TestDisabledSenderRefuses checks the production fallback.
func TestDisabledSenderRefuses(t *testing.T) {
	err := DisabledSender{}.Send(context.Background(), Message{To: "a@b.c"})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

// TestLogSenderAccepts checks that the log transport never fails.
func TestLogSenderAccepts(t *testing.T) {
	var sb strings.Builder
	s := &LogSender{Logger: newTestLogger(&sb)}
	if err := s.Send(context.Background(), Message{To: "a@b.c", Subject: "s", Text: "t"}); err != nil {
		t.Fatalf("the log sender must accept every message: %v", err)
	}
	if !strings.Contains(sb.String(), "a@b.c") {
		t.Fatalf("the log must mention the recipient, got %q", sb.String())
	}
}

// TestResolveSenderModes covers the mode matrix.
func TestResolveSenderModes(t *testing.T) {
	full := Config{Host: "smtp.example.com", Port: 587, From: "a@b.c"}

	t.Run("auto with settings uses smtp", func(t *testing.T) {
		s, desc := ResolveSender(full)
		if _, ok := s.(*SMTPSender); !ok {
			t.Fatalf("expected the SMTP sender, got %T", desc)
		}
	})

	t.Run("auto without settings falls back to log", func(t *testing.T) {
		// The test process does not set APP_ENV, so it counts as development.
		s, _ := ResolveSender(Config{})
		if _, ok := s.(*LogSender); !ok {
			t.Fatalf("expected the log sender, got %T", s)
		}
	})

	t.Run("log mode forces the log sender", func(t *testing.T) {
		s, _ := ResolveSender(Config{Mode: ModeLog, Host: "smtp.example.com", Port: 587, From: "a@b.c"})
		if _, ok := s.(*LogSender); !ok {
			t.Fatalf("expected the log sender, got %T", s)
		}
	})
}

// TestPasswordResetMessage checks the mail body carries the code and the
// security notice.
func TestPasswordResetMessage(t *testing.T) {
	msg := PasswordResetMessage("user@metamatrix.local", "482913", 10, "元矩阵 MetaMatrix")
	// The recipient must be part of the message. A mail without a recipient
	// is rejected by the sender, which used to make every real delivery fail.
	if msg.To != "user@metamatrix.local" {
		t.Fatalf("the message must carry the recipient, got %q", msg.To)
	}
	if !strings.Contains(msg.Text, "482913") {
		t.Fatalf("the body must carry the code, got %q", msg.Text)
	}
	if !strings.Contains(msg.Text, "10 分钟") {
		t.Fatalf("the body must state the TTL, got %q", msg.Text)
	}
	if !strings.Contains(msg.Text, "不会通过电话") {
		t.Fatalf("the body must carry the anti phishing notice, got %q", msg.Text)
	}
	if !strings.Contains(msg.Subject, "482913") {
		t.Fatalf("the subject must carry the code, got %q", msg.Subject)
	}
}
