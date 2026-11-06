package media

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var ErrBadRange = errors.New("unsatisfiable range")

// ByteRange is an inclusive interval.
type ByteRange struct {
	Start int64
	End   int64
}

// ParseRange accepts a single "bytes=start-end" or "bytes=start-".
// An empty header means the whole object. Multiple ranges are rejected.
func ParseRange(header string, size int64) (ByteRange, bool, error) {
	header = strings.TrimSpace(header)
	if header == "" {
		if size == 0 {
			return ByteRange{}, false, nil
		}
		return ByteRange{Start: 0, End: size - 1}, false, nil
	}
	if !strings.HasPrefix(strings.ToLower(header), "bytes=") || strings.Contains(header, ",") {
		return ByteRange{}, false, ErrBadRange
	}
	spec := strings.TrimSpace(header[len("bytes="):])
	dash := strings.IndexByte(spec, '-')
	if dash <= 0 || size <= 0 {
		return ByteRange{}, false, ErrBadRange
	}
	start, err := strconv.ParseInt(spec[:dash], 10, 64)
	if err != nil || start < 0 {
		return ByteRange{}, false, ErrBadRange
	}
	var end int64
	if spec[dash+1:] == "" {
		end = size - 1
	} else {
		end, err = strconv.ParseInt(spec[dash+1:], 10, 64)
		if err != nil {
			return ByteRange{}, false, ErrBadRange
		}
	}
	if start >= size || end < start {
		return ByteRange{}, false, ErrBadRange
	}
	if end >= size {
		end = size - 1
	}
	return ByteRange{Start: start, End: end}, true, nil
}

func (r ByteRange) ContentRange(size int64) string {
	return fmt.Sprintf("bytes %d-%d/%d", r.Start, r.End, size)
}

func (r ByteRange) Length() int64 {
	return r.End - r.Start + 1
}
