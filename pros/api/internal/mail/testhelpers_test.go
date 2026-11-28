package mail

import (
	"bufio"
	"encoding/base64"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
)

// lineRW is a tiny line oriented reader/writer over a socket. The SMTP
// protocol is line based, so a full MIME parser would be overkill.
type lineRW struct {
	conn net.Conn
	r    *bufio.Reader
}

func newLineRW(conn net.Conn) *lineRW {
	return &lineRW{conn: conn, r: bufio.NewReader(conn)}
}

// readLine reads one line without the trailing CRLF.
func (l *lineRW) readLine() (string, error) {
	line, err := l.r.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// write sends one CRLF terminated line.
func (l *lineRW) write(s string) {
	_, _ = io.WriteString(l.conn, s+"\r\n")
}

// extractAddr pulls the address out of a "MAIL FROM:<a@b.c>" style line.
func extractAddr(line string) string {
	start := strings.Index(line, "<")
	end := strings.LastIndex(line, ">")
	if start < 0 || end < 0 || end <= start {
		return strings.TrimSpace(line)
	}
	return line[start+1 : end]
}

// atoi parses a port number.
func atoi(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

// base64Decode decodes a standard base64 string.
func base64Decode(s string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(s))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// newTestLogger returns a logger writing into the given builder.
func newTestLogger(sb *strings.Builder) *log.Logger {
	return log.New(sb, "", 0)
}
