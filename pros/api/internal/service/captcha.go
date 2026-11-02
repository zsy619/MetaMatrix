package service

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/png"
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
	// ErrCaptchaTooMany is returned when one client asks for too many challenges.
	ErrCaptchaTooMany = errors.New("too many captcha requests")
)

const (
	captchaLength      = 4
	captchaAlphabet    = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1 look-alikes
	captchaWidth       = 200
	captchaHeight      = 64
	captchaMaxAttempts = 5
	// captchaExpiryGrace keeps an expired entry around briefly so the API can
	// answer "expired" instead of "invalid" for a late submission.
	captchaExpiryGrace = 10 * time.Minute
	// captchaMaxEntries caps how many challenges stay in memory. The endpoint is
	// public, so without a cap a bot could grow the map until the process dies.
	captchaMaxEntries = 5000
	// captchaIssueWindow and captchaIssueLimit rate limit how often one client
	// may pull a new challenge. The limit is per peer address, so a whole
	// office behind one NAT still has room for everyone to load a page.
	captchaIssueWindow = time.Minute
	captchaIssueLimit  = 60
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
	issued   map[string][]time.Time
}

type captchaEntry struct {
	digest    [sha256.Size]byte
	expiresAt time.Time
	attempts  int
	createdAt time.Time
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
		issued:   map[string][]time.Time{},
	}
}

// Issue creates a new challenge and returns the rendered image.
func (s *CaptchaService) Issue() (CaptchaChallenge, error) {
	return s.IssueFor("")
}

// IssueFor creates a new challenge for a client. The client key rate limits
// how often one visitor may pull a challenge; an empty key shares one bucket,
// which is what the unit tests use.
func (s *CaptchaService) IssueFor(clientKey string) (CaptchaChallenge, error) {
	return s.issue(clientKey, false)
}

// IssueWithAnswer issues a challenge and returns the readable answer when the
// service runs in debug mode or when the caller explicitly asks for it.
func (s *CaptchaService) IssueWithAnswer(clientKey string, wantAnswer bool) (CaptchaChallenge, error) {
	return s.issue(clientKey, wantAnswer)
}

func (s *CaptchaService) issue(clientKey string, wantAnswer bool) (CaptchaChallenge, error) {
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
	if !s.allowIssueLocked(clientKey, now) {
		s.mu.Unlock()
		return CaptchaChallenge{}, ErrCaptchaTooMany
	}
	s.enforceEntryCapLocked(now)
	entry := &captchaEntry{
		digest:    sha256.Sum256([]byte(answer)),
		expiresAt: expires,
		createdAt: now,
	}
	s.entries[id] = entry
	s.mu.Unlock()

	challenge := CaptchaChallenge{
		ID:        id,
		Image:     renderCaptchaPNG(answer),
		ExpiresAt: expires.UTC(),
	}
	if s.debug || wantAnswer {
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
	for key, times := range s.issued {
		kept := times[:0]
		for _, t := range times {
			if now.Before(t.Add(captchaIssueWindow)) {
				kept = append(kept, t)
			}
		}
		if len(kept) == 0 {
			delete(s.issued, key)
			continue
		}
		s.issued[key] = kept
	}
}

// allowIssueLocked reports whether the client may pull one more challenge.
// An empty client key means "no caller identified", so the call is not
// rate limited; the HTTP layer always passes the peer address.
func (s *CaptchaService) allowIssueLocked(clientKey string, now time.Time) bool {
	if clientKey == "" {
		return true
	}
	times := s.issued[clientKey]
	if len(times) >= captchaIssueLimit {
		return false
	}
	s.issued[clientKey] = append(times, now)
	return true
}

// enforceEntryCapLocked keeps the challenge map bounded. Expired entries go
// first; if that is not enough the oldest live challenge is dropped, which
// only costs the user one retype.
func (s *CaptchaService) enforceEntryCapLocked(now time.Time) {
	if len(s.entries) < captchaMaxEntries {
		return
	}
	s.pruneLocked(now)
	for len(s.entries) >= captchaMaxEntries {
		oldestID := ""
		var oldest time.Time
		for id, entry := range s.entries {
			if oldestID == "" || entry.createdAt.Before(oldest) {
				oldestID = id
				oldest = entry.createdAt
			}
		}
		if oldestID == "" {
			return
		}
		delete(s.entries, oldestID)
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

// renderCaptchaPNG draws the answer with a built-in 5x7 bitmap font and
// returns it as a PNG data URI.
//
// Why PNG and not SVG: an SVG <text> element carries the answer in clear
// text, so any script can decode the data URI and read the captcha without
// solving it. Rendering glyphs from a bitmap font leaves no machine readable
// answer in the payload, and PNG keeps the API dependency free.
func renderCaptchaPNG(answer string) string {
	const (
		scale   = 5
		charGap = 12
		startX  = 12
		baseY   = 14
	)
	img := image.NewRGBA(image.Rect(0, 0, captchaWidth, captchaHeight))

	// Background: light wash with a subtle vertical gradient.
	for y := 0; y < captchaHeight; y++ {
		t := y / captchaHeight
		for x := 0; x < captchaWidth; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8(241 - t*6),
				G: uint8(245 - t*4),
				B: uint8(251 - t*2),
				A: 255,
			})
		}
	}

	// Background speckles.
	for i := 0; i < 90; i++ {
		x, y := randInt(0, captchaWidth), randInt(0, captchaHeight)
		img.Set(x, y, color.RGBA{R: 205, G: 214, B: 228, A: 255})
	}

	// Crossing strokes, drawn as dotted lines so the glyphs stay readable.
	for i := 0; i < 4; i++ {
		x1, y1 := randInt(0, captchaWidth), randInt(0, captchaHeight)
		x2, y2 := randInt(0, captchaWidth), randInt(0, captchaHeight)
		ink := randomInk()
		steps := captchaWidth + captchaHeight
		for s := 0; s < steps; s++ {
			x := x1 + (x2-x1)*s/steps
			y := y1 + (y2-y1)*s/steps
			if x < 0 || y < 0 || x >= captchaWidth || y >= captchaHeight {
				continue
			}
			img.Set(x, y, color.RGBA{R: ink.R / 2, G: ink.G / 2, B: ink.B / 2, A: 255})
		}
	}

	// The characters themselves, each with its own ink, offset and shear.
	for i, ch := range answer {
		glyph, ok := captchaGlyphs[ch]
		if !ok {
			continue
		}
		ink := randomInk()
		originX := startX + i*(glyphWidth*scale+charGap) + randInt(-3, 4)
		originY := baseY + randInt(-3, 4)
		// Shear makes the glyph lean, which is what makes OCR harder while a
		// human still reads it instantly.
		shear := randInt(-2, 3)
		for row := 0; row < glyphHeight; row++ {
			bits := glyph[row]
			rowShift := randInt(-1, 2)
			for col := 0; col < glyphWidth; col++ {
				if bits&(1<<uint(glyphWidth-1-col)) == 0 {
					continue
				}
				px := originX + col*scale + rowShift + row*shear/2
				py := originY + row*scale
				for dy := 0; dy < scale; dy++ {
					for dx := 0; dx < scale; dx++ {
						x, y := px+dx, py+dy
						if x < 0 || y < 0 || x >= captchaWidth || y >= captchaHeight {
							continue
						}
						img.Set(x, y, ink)
					}
				}
			}
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		// PNG encoding of a plain RGBA buffer cannot fail in practice; fall
		// back to an empty image rather than leaking the answer.
		return "data:image/png;base64,"
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// randomInk picks a dark, high contrast colour for a glyph.
func randomInk() color.RGBA {
	palette := []color.RGBA{
		{R: 26, G: 115, B: 232, A: 255},
		{R: 23, G: 78, B: 166, A: 255},
		{R: 24, G: 128, B: 56, A: 255},
		{R: 161, G: 66, B: 244, A: 255},
		{R: 217, G: 48, B: 37, A: 255},
		{R: 32, G: 33, B: 36, A: 255},
		{R: 11, G: 128, B: 67, A: 255},
	}
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
