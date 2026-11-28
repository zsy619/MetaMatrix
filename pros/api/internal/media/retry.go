package media

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
)

const maxRetryBuffer = 8 << 20 // 8 MiB：更大的流若不能 Seek 则不重试，避免把整文件读进内存。

type s3StatusError struct {
	op     string
	status int
	body   string
}

func (e s3StatusError) Error() string {
	return fmt.Sprintf("s3 %s: status %d: %s", e.op, e.status, strings.TrimSpace(e.body))
}

func isTransientBlobError(err error) bool {
	if err == nil {
		return false
	}
	var se s3StatusError
	if errors.As(err, &se) {
		return se.status == 429 || se.status >= 500
	}
	var ne net.Error
	if errors.As(err, &ne) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "connection refused") || strings.Contains(msg, "timeout")
}

// rewindable 把可读流变成可重试的二次读取。不能 Seek 且超过缓冲上限时，rewind 为 nil。
func rewindable(r io.Reader, size int64) (io.Reader, func() io.Reader, error) {
	if r == nil {
		return nil, nil, nil
	}
	if s, ok := r.(io.Seeker); ok {
		return r, func() io.Reader {
			_, _ = s.Seek(0, io.SeekStart)
			return r
		}, nil
	}
	if size < 0 || size > maxRetryBuffer {
		return r, nil, nil
	}
	buf, err := io.ReadAll(io.LimitReader(r, size+1))
	if err != nil {
		return nil, nil, err
	}
	return bytes.NewReader(buf), func() io.Reader { return bytes.NewReader(buf) }, nil
}
