package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
)

var (
	// ErrCaptchaRequired is returned when the request carries no captcha id.
	ErrCaptchaRequired = errors.New("captcha required")
	// ErrCaptchaInvalid is returned when the answer does not match the challenge.
	ErrCaptchaInvalid = errors.New("captcha answer does not match")
	// ErrCaptchaExpired is returned when the challenge is past its TTL.
	ErrCaptchaExpired = errors.New("captcha expired")
)

const (
	captchaLength      = 4
	captchaAlphabet    = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1 look-alikes
	captchaWidth       = 160
	captchaHeight      = 56
	captchaMaxAttempts = 5
	// captchaExpiryGrace keeps an expired entry around briefly so the API can
	// answer "expired" instead of "invalid" for a late submission.
	captchaExpiryGrace = 10 * time.Minute
)

// CaptchaService issues image challenges and verifies their answers.
//
// Storage is in-process memory with a short TTL, so a challenge is lost on
// restart and is not visible to another API replica. A multi-instance
// deployment must move the entries to a shared store (Redis, or a table)
// before the captcha can be relied on; see docs/生产配置.md.
type CaptchaService struct {
	mu       sync.Mutex
	ttl      time.Duration
	debug    bool
	now      func() time.Time
	attempts int
	entries  map[string]*captchaEntry
}

type captchaEntry struct {
	digest    [sha256.Size]byte
	expiresAt time.Time
	attempts  int
}

// CaptchaChallenge is the payload handed to the browser. Image is a ready to
// use data URI so the client never needs to know the encoding.
type CaptchaChallenge struct {
	ID        string    `json:"captchaId"`
	Image     string    `json:"image"`
	ExpiresAt time.Time `json:"expiresAt"`
	// DebugAnswer is only populated when the service runs in debug mode.
	// It exists so automated smoke tests can complete a real captcha round
	// trip; it must stay empty in production.
	DebugAnswer string `json:"debugAnswer,omitempty"`
}

// NewCaptchaService builds a captcha service. ttl <= 0 falls back to 5
// minutes. debug exposes the plain answer to the caller of Issue.
func NewCaptchaService(ttl time.Duration, debug bool) *CaptchaService {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &CaptchaService{
		ttl:      ttl,
		debug:    debug,
		now:      time.Now,
		attempts: captchaMaxAttempts,
		entries:  map[string]*captchaEntry{},
	}
}

// Issue creates a new challenge and returns the rendered image.
func (s *CaptchaService) Issue() (CaptchaChallenge, error) {
	answer, err := randomCaptchaAnswer()
	if err != nil {
		return CaptchaChallenge{}, err
	}
	id, err := randomCaptchaID()
	if err != nil {
		return CaptchaChallenge{}, err
	}
	now := s.now()
	expires := now.Add(s.ttl)

	s.mu.Lock()
	s.pruneLocked(now)
	s.entries[id] = &captchaEntry{digest: sha256.Sum256([]byte(answer)), expiresAt: expires}
	s.mu.Unlock()

	challenge := CaptchaChallenge{
		ID:        id,
		Image:     renderCaptchaSVG(answer),
		ExpiresAt: expires.UTC(),
	}
	if s.debug {
		challenge.DebugAnswer = answer
	}
	return challenge, nil
}

// Verify checks the answer for a challenge. A correct answer consumes the
// challenge so it cannot be replayed. A wrong answer counts against the
// challenge and invalidates it once the attempt budget is spent.
func (s *CaptchaService) Verify(id, answer string) error {
	id = strings.TrimSpace(id)
	answer = strings.TrimSpace(answer)
	if id == "" || answer == "" {
		return ErrCaptchaRequired
	}
	now := s.now()

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.entries[id]
	if !ok {
		// The challenge was already consumed, never existed, or was pruned.
		s.pruneLocked(now)
		return ErrCaptchaInvalid
	}
	if now.After(entry.expiresAt) {
		delete(s.entries, id)
		return ErrCaptchaExpired
	}
	s.pruneLocked(now)
	expected := sha256.Sum256([]byte(strings.ToUpper(answer)))
	if subtle.ConstantTimeCompare(entry.digest[:], expected[:]) != 1 {
		entry.attempts++
		if entry.attempts >= s.attempts {
			delete(s.entries, id)
		}
		return ErrCaptchaInvalid
	}
	delete(s.entries, id)
	return nil
}

// Len reports how many challenges are currently held. Used by tests.
func (s *CaptchaService) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.entries)
}

// SetClock overrides the time source. Used by tests to force expiry.
func (s *CaptchaService) SetClock(now func() time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.now = now
}

// pruneLocked drops entries that expired long ago. Recently expired entries
// are kept a little longer so a late submission still gets the precise
// "expired" answer instead of a generic "invalid" one.
func (s *CaptchaService) pruneLocked(now time.Time) {
	for id, entry := range s.entries {
		if now.After(entry.expiresAt.Add(captchaExpiryGrace)) {
			delete(s.entries, id)
		}
	}
}

func randomCaptchaAnswer() (string, error) {
	var sb strings.Builder
	sb.Grow(captchaLength)
	for i := 0; i < captchaLength; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(captchaAlphabet))))
		if err != nil {
			return "", err
		}
		sb.WriteByte(captchaAlphabet[idx.Int64()])
	}
	return sb.String(), nil
}

func randomCaptchaID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// renderCaptchaSVG draws the answer as distorted text on a noisy background.
// SVG keeps the API dependency free: no font binaries, no image library.
func renderCaptchaSVG(answer string) string {
	width, height := captchaWidth, captchaHeight
	var sb strings.Builder
	sb.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="`)
	sb.WriteString(fmt.Sprint(width))
	sb.WriteString(`" height="`)
	sb.WriteString(fmt.Sprint(height))
	sb.WriteString(`" viewBox="0 0 `)
	sb.WriteString(fmt.Sprint(width))
	sb.WriteString(` `)
	sb.WriteString(fmt.Sprint(height))
	sb.WriteString(`" role="img" aria-label="图形验证码">`)
	sb.WriteString(`<rect width="100%" height="100%" rx="10" fill="#f1f5fb"/>`)

	// Background speckles.
	for i := 0; i < 26; i++ {
		cx := randInt(0, width)
		cy := randInt(0, height)
		r := randInt(2, 6)
		color := randomInk()
		sb.WriteString(fmt.Sprintf(`<circle cx="%d" cy="%d" r="%d" fill="%s" fill-opacity="0.16"/>`, cx, cy, r, color))
	}
	// Crossing strokes.
	for i := 0; i < 5; i++ {
		x1 := randInt(0, width)
		y1 := randInt(0, height)
		x2 := randInt(0, width)
		y2 := randInt(0, height)
		sb.WriteString(fmt.Sprintf(
			`<path d="M%d %d Q%d %d %d %d" stroke="%s" stroke-width="1.6" fill="none" stroke-opacity="0.5"/>`,
			x1, y1, randInt(0, width), randInt(0, height), x2, y2, randomInk(),
		))
	}

	// The characters themselves.
	step := (width - 40) / captchaLength
	for i, ch := range answer {
		x := 22 + i*step + randInt(-3, 4)
		y := randInt(30, 42)
		rot := randInt(-22, 23)
		size := randInt(26, 33)
		sb.WriteString(fmt.Sprintf(
			`<text x="%d" y="%d" font-family="Georgia, 'Times New Roman', serif" font-size="%d" font-weight="700" fill="%s" transform="rotate(%d %d %d)">%s</text>`,
			x, y, size, randomInk(), rot, x, y, svgEscape(string(ch)),
		))
	}
	sb.WriteString(`</svg>`)
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(sb.String()))
}

func svgEscape(s string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
	return replacer.Replace(s)
}

func randomInk() string {
	palette := []string{"#1a73e8", "#174ea6", "#188038", "#a142f4", "#d93025", "#202124", "#0b8043"}
	return palette[randInt(0, len(palette))]
}

func randInt(min, max int) int {
	if max <= min {
		return min
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max-min)))
	if err != nil {
		return min
	}
	return min + int(n.Int64())
}
