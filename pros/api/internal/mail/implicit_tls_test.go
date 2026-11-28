package mail

import (
	"context"
	"crypto/tls"
	"net"
	"strconv"
	"testing"
	"time"
)

// TestSMTPSenderImplicitTLS checks the 465 path: the client completes the
// TLS handshake on the raw socket and only then reads the greeting.
//
// Without the implicit TLS branch the client would read the greeting on a
// plain socket and stall until the deadline, because the server waits for a
// ClientHello and never sends plaintext. So this test fails with a timeout
// if the handshake order regresses.
func TestSMTPSenderImplicitTLS(t *testing.T) {
	srv, pool := newFakeImplicitTLSServer(t)
	serverHost, serverPort := srv.addr()

	sender := &SMTPSender{
		Cfg: Config{
			// Port 465 is what selects the implicit TLS flavour.
			Host: serverHost, Port: 465,
			From:    "no-reply@metamatrix.local",
			Timeout: 5 * time.Second,
		},
		// Trust the certificate the fake server just generated.
		TLSConfig: &tls.Config{RootCAs: pool},
	}
	// The dialer redirects the connection to the fake server, because the
	// configured port 465 is only a marker for the TLS flavour.
	sender.Dial = func(ctx context.Context, network, _ string) (net.Conn, error) {
		d := &net.Dialer{Timeout: 5 * time.Second}
		return d.DialContext(ctx, network, net.JoinHostPort(serverHost, strconv.Itoa(serverPort)))
	}

	if err := sender.Send(context.Background(), Message{
		To: "user@metamatrix.local", Subject: "验证码：123456", Text: "hello",
	}); err != nil {
		t.Fatalf("implicit TLS delivery failed: %v", err)
	}
	if srv.rcptTo != "user@metamatrix.local" {
		t.Fatalf("unexpected RCPT TO: %q", srv.rcptTo)
	}
}
