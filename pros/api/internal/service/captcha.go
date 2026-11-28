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
	"math"
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
	// captchaLength 是答案位数。6 位是可用性和安全性的平衡点：
	// 4 位在移动端键盘上按得太快容易串位，8 位又要用户对照图片数两遍。
	captchaLength = 6
	// captchaAlphabet 是答案字符集：大写字母 + 数字。
	//
	// 为什么不含小写字母：服务端比对时统一转大写（见 Verify），所以用户用
	// 小写键盘敲也能通过，图片里就不必区分大小写。混排大小写会让 "l" 和 "1"、
	// "O" 和 "0" 这类组合更难分辨，反而降低可读性。
	//
	// 为什么不含 I、O、0、1：这四个字符在点阵字体和低质量屏幕上极易互相
	// 混淆（I 像 1，O 像 0），用户看错就等于答错，直接剔除最省事。
	//
	// 熵：32 个字符的 6 位组合有 32^6 ≈ 10.7 亿种，配合每分钟 60 次取图限流
	// 和单个验证码 5 次错误上限，暴力猜解不具可行性。
	captchaAlphabet    = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	captchaWidth       = 240
	captchaHeight      = 64
	captchaMaxAttempts = 5
	// captchaSuperSample 是渲染时的超采样倍数。先画到 N 倍大的画布上，
	// 最后用盒式滤波缩回原尺寸，点阵字的硬边就变成了平滑的抗锯齿边缘。
	// 倍数越大越平滑，但 CPU 开销按 N² 增长，3 倍在观感和成本上比较平衡。
	captchaSuperSample = 3
	// captchaGlyphScale 是字形在最终图片上的放大倍数（每个点阵像素的边长）。
	// 5x7 的字模放大 5 倍后是 25x35 像素。画布宽 240，6 个字符均分后每格
	// 40 像素，字形 25 像素宽，格内左右各留 7 像素，字与字之间不打架。
	captchaGlyphScale = 5
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
//
// 美化要点：
//  1. 超采样抗锯齿：先画到 3 倍大的画布上，再盒式滤波缩回 200x64。
//     点阵字放大后边缘会有明显锯齿，抗锯齿之后字形干净很多。
//  2. 四个字符按画布宽度四等分居中，间距均匀，不再挤在左侧。
//  3. 背景换成柔和的垂直渐变 + 细噪点，干扰线改成半透明的波浪曲线，
//     既保留"机器不好读"的干扰强度，又不会糊住字母。
//  4. 每个字符带独立的墨色、轻微倾斜和纵向错位，并叠一层浅色浮雕，
//     立体感更强，人眼读起来更快。
func renderCaptchaPNG(answer string) string {
	const ss = captchaSuperSample
	// 超采样画布尺寸。
	w := captchaWidth * ss
	h := captchaHeight * ss

	img := image.NewRGBA(image.Rect(0, 0, w, h))

	// 背景：垂直渐变，从近白过渡到淡蓝灰。
	for y := 0; y < h; y++ {
		t := float64(y) / float64(h-1)
		base := color.RGBA{
			R: uint8(249 - t*10),
			G: uint8(251 - t*8),
			B: uint8(254 - t*4),
			A: 255,
		}
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, base)
		}
	}

	// 细噪点：给背景加一点颗粒，避免纯渐变过于"干净"而让干扰线过于突兀。
	for i := 0; i < 900; i++ {
		x, y := randInt(0, w), randInt(0, h)
		blendPixel(img, x, y, color.RGBA{R: 176, G: 190, B: 214, A: 255}, 0.5)
	}

	// 干扰线：两条半透明的波浪曲线。用波浪而不是直线，是因为直线很容易被
	// 简单的预处理算法滤掉，而人在 200x64 的小图上读曲线毫无压力。
	for i := 0; i < 2; i++ {
		ink := color.RGBA{R: 118, G: 142, B: 186, A: 255}
		phase := float64(randInt(0, 628)) / 100
		amplitude := float64(randInt(8, 22))
		baseY := float64(randInt(h/5, h-h/5))
		for x := 0; x < w; x++ {
			// 正弦曲线，振幅随 x 缓慢起伏，看起来更像手写划痕。
			y := baseY + amplitude*math.Sin(float64(x)/float64(w)*3.2+phase)
			for dy := 0; dy < 2; dy++ {
				blendPixel(img, x, int(y)+dy, ink, 0.55)
			}
		}
	}

	// 字形参数（超采样坐标下）。
	// block 是一个点阵像素在超采样画布上的边长（整数像素），
	// scale 则是同一个值的浮点形式，用来算带倾斜和错位的绘制位置。
	block := captchaGlyphScale * ss
	scale := float64(block)
	glyphW := float64(glyphWidth) * scale
	glyphH := float64(glyphHeight) * scale
	// 每个字符占据画布宽度的四分之一，在自己那一格里居中。
	cellW := float64(w) / float64(captchaLength)
	originY := (float64(h) - glyphH) / 2

	for i, ch := range answer {
		glyph, ok := captchaGlyphs[ch]
		if !ok {
			continue
		}
		ink := randomInk()
		cellCenter := cellW*float64(i) + cellW/2
		originX := cellCenter - glyphW/2 + float64(randInt(-3, 4))*ss
		top := originY + float64(randInt(-2, 3))*ss
		// 轻微倾斜：让字形不那么规整，干扰自动识别，但人眼无压力。
		shear := float64(randInt(-2, 3)) * ss / 2

		for row := 0; row < glyphHeight; row++ {
			bits := glyph[row]
			rowShift := float64(randInt(-1, 2)) * ss
			for col := 0; col < glyphWidth; col++ {
				if bits&(1<<uint(glyphWidth-1-col)) == 0 {
					continue
				}
				px := int(originX + float64(col)*scale + rowShift + float64(row)*shear/2)
				py := int(top + float64(row)*scale)
				// 浅色浮雕：先在左上偏移处画一层半透明白，字形就有了立体感。
				for dy := 0; dy < block; dy++ {
					for dx := 0; dx < block; dx++ {
						blendPixel(img, px+dx-ss, py+dy-ss,
							color.RGBA{R: 255, G: 255, B: 255, A: 255}, 0.55)
					}
				}
				for dy := 0; dy < block; dy++ {
					for dx := 0; dx < block; dx++ {
						blendPixel(img, px+dx, py+dy, ink, 1)
					}
				}
			}
		}
	}

	// 缩回原尺寸：盒式滤波平均，边缘因此获得抗锯齿。
	final := downsample(img, ss)

	var buf bytes.Buffer
	if err := png.Encode(&buf, final); err != nil {
		// PNG encoding of a plain RGBA buffer cannot fail in practice; fall
		// back to an empty image rather than leaking the answer.
		return "data:image/png;base64,"
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// blendPixel blends a colour into the canvas with the given alpha.
// Writing through a helper keeps every draw operation alpha correct, which
// is what makes the soft shadows and interference curves look right.
func blendPixel(img *image.RGBA, x, y int, c color.RGBA, alpha float64) {
	if x < 0 || y < 0 || x >= img.Bounds().Dx() || y >= img.Bounds().Dy() {
		return
	}
	if alpha <= 0 {
		return
	}
	if alpha > 1 {
		alpha = 1
	}
	old := img.RGBAAt(x, y)
	img.SetRGBA(x, y, color.RGBA{
		R: uint8(float64(c.R)*alpha + float64(old.R)*(1-alpha)),
		G: uint8(float64(c.G)*alpha + float64(old.G)*(1-alpha)),
		B: uint8(float64(c.B)*alpha + float64(old.B)*(1-alpha)),
		A: 255,
	})
}

// downsample shrinks the canvas by an integer factor with a box filter.
// Averaging neighbouring pixels is what turns the hard edges of the bitmap
// font into smooth, anti-aliased ones.
func downsample(src *image.RGBA, factor int) *image.RGBA {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dx()/factor, bounds.Dy()/factor))
	samples := float64(factor * factor)
	for y := 0; y < dst.Bounds().Dy(); y++ {
		for x := 0; x < dst.Bounds().Dx(); x++ {
			var r, g, bl float64
			for dy := 0; dy < factor; dy++ {
				for dx := 0; dx < factor; dx++ {
					c := src.RGBAAt(x*factor+dx, y*factor+dy)
					r += float64(c.R)
					g += float64(c.G)
					bl += float64(c.B)
				}
			}
			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(r / samples),
				G: uint8(g / samples),
				B: uint8(bl / samples),
				A: 255,
			})
		}
	}
	return dst
}

// randomInk picks a dark, high contrast colour for a glyph.
func randomInk() color.RGBA {
	palette := []color.RGBA{
		{R: 26, G: 86, B: 219, A: 255},
		{R: 15, G: 118, B: 110, A: 255},
		{R: 67, G: 56, B: 202, A: 255},
		{R: 190, G: 18, B: 60, A: 255},
		{R: 180, G: 83, B: 9, A: 255},
		{R: 51, G: 65, B: 85, A: 255},
		{R: 109, G: 40, B: 217, A: 255},
		{R: 21, G: 128, B: 61, A: 255},
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
