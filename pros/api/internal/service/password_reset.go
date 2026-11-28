package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// ErrResetRateLimited means the caller asked for too many codes too fast.
	ErrResetRateLimited = errors.New("too many reset code requests")
	// ErrResetCodeInvalid means the submitted code did not match.
	ErrResetCodeInvalid = errors.New("reset code is invalid")
	// ErrResetCodeExpired means the code existed but its window closed.
	ErrResetCodeExpired = errors.New("reset code expired")
	// ErrResetCodeConsumed means the code was already used or invalidated.
	ErrResetCodeConsumed = errors.New("reset code already used")
	// ErrResetNoActiveCode means there is no code pending for that address.
	ErrResetNoActiveCode = errors.New("no active reset code")
	// ErrResetMailUnavailable means the mail transport is not usable, so the
	// code could not be delivered. The request must fail loudly: pretending
	// it succeeded would leave the user waiting for a mail that never comes.
	ErrResetMailUnavailable = errors.New("mail transport unavailable")
	// ErrResetSamePassword means the new password equals the current one.
	ErrResetSamePassword = errors.New("new password must differ")
	// ErrResetSessionInvalid means the session token is unknown, already
	// spent, or its code was invalidated.
	ErrResetSessionInvalid = errors.New("reset session is invalid")
)

// Password reset purposes. The purpose is stored with every code so a code
// can never be replayed against a different endpoint.
const ResetPurposePassword = "password_reset"

// ResetCodeLength is the number of digits in a reset code.
const ResetCodeLength = 6

// ResetLimits describes how often codes may be requested.
//
// The limits are deliberately multi dimensional:
//
//   - Per address, short window: stops the "click send again" case and stops
//     a user from flooding their own mailbox.
//   - Per address, medium window: stops an attacker who rotates IPs from
//     requesting codes for one victim mailbox in a loop.
//   - Per address, long window: stops sustained abuse over a day.
//   - Per IP: stops one host from enumerating many mailboxes.
//
// A single dimension is not enough. Limiting only the IP does not stop a
// distributed attacker from hammering one victim; limiting only the address
// does not stop one host from walking a list of addresses.
type ResetLimits struct {
	// PerAddressCooldown is the minimum gap between two codes for the same
	// address.
	PerAddressCooldown time.Duration
	// PerAddressHourly caps the codes per address in one hour.
	PerAddressHourly int
	// PerAddressDaily caps the codes per address in one day.
	PerAddressDaily int
	// PerIPHourly caps the codes per IP in one hour.
	PerIPHourly int
}

// DefaultResetLimits returns the production limits.
//
// The cooldown is the important one: it is what makes the endpoint
// unusable for bulk enumeration. The hourly and daily caps are the safety
// net for an attacker who rotates source addresses.
func DefaultResetLimits() ResetLimits {
	return ResetLimits{
		PerAddressCooldown: 60 * time.Second,
		PerAddressHourly:   5,
		PerAddressDaily:    10,
		PerIPHourly:        20,
	}
}

// PasswordResetService issues and redeems password reset codes.
type PasswordResetService struct {
	db     *gorm.DB
	sender mail.Sender
	limits ResetLimits
	// ttl is how long a code stays valid.
	ttl time.Duration
	// maxAttempts is the failure budget for one code.
	maxAttempts int
	// appName is used in the email body.
	appName string
	// now is the clock. Tests replace it.
	now func() time.Time
	// revealCode hands the generated code back to the caller. Only the local
	// development transport enables this, so the flow can be exercised
	// without reading the mail log.
	revealCode bool
}

// PasswordResetOptions configures the service.
type PasswordResetOptions struct {
	Limits      ResetLimits
	TTL         time.Duration
	MaxAttempts int
	AppName     string
	// RevealCode returns the code in the API response. Only safe when the
	// mail transport is the log sender.
	RevealCode bool
	// Now overrides the clock. Tests use it.
	Now func() time.Time
}

// NewPasswordResetService builds the service.
func NewPasswordResetService(db *gorm.DB, sender mail.Sender, opts PasswordResetOptions) *PasswordResetService {
	limits := opts.Limits
	if limits.PerAddressCooldown <= 0 {
		limits.PerAddressCooldown = 60 * time.Second
	}
	if limits.PerAddressHourly <= 0 {
		limits.PerAddressHourly = 5
	}
	if limits.PerAddressDaily <= 0 {
		limits.PerAddressDaily = 10
	}
	if limits.PerIPHourly <= 0 {
		limits.PerIPHourly = 20
	}
	ttl := opts.TTL
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	maxAttempts := opts.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	appName := strings.TrimSpace(opts.AppName)
	if appName == "" {
		appName = "元矩阵 MetaMatrix"
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	return &PasswordResetService{
		db:          db,
		sender:      sender,
		limits:      limits,
		ttl:         ttl,
		maxAttempts: maxAttempts,
		appName:     appName,
		now:         now,
		revealCode:  opts.RevealCode,
	}
}

// ResetRequestResult is what the caller learns after asking for a code.
//
// AccountExists is only meaningful when the caller is allowed to know. In the
// uniform mode the HTTP layer ignores it and returns a fixed answer, so an
// attacker cannot use this endpoint to test whether an address is registered.
type ResetRequestResult struct {
	// AccountExists reports whether the address belongs to a user.
	AccountExists bool
	// Code is the generated code. It is empty unless revealCode is on.
	Code string
	// RetryAfter is how long the caller must wait before the next request is
	// accepted for this address. Zero when the request was allowed.
	RetryAfter time.Duration
	// Delivered reports whether a mail actually went out.
	Delivered bool
}

// RequestCode generates a code for the address and sends it by mail.
//
// The flow is: rate limit, look up the user, generate and store the code,
// send the mail. A missing user is not an error here — the caller decides
// whether to hide that fact from the requester.
func (s *PasswordResetService) RequestCode(ctx context.Context, email, requestIP string) (ResetRequestResult, error) {
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return ResetRequestResult{}, err
	}
	now := s.now().UTC()

	// The rate limit runs before the user lookup on purpose. Otherwise the
	// limit would double as an account oracle: a fast answer for a known
	// address and a different answer for an unknown one.
	retryAfter, err := s.checkLimits(email, requestIP, now)
	if err != nil {
		return ResetRequestResult{RetryAfter: retryAfter}, err
	}

	var user model.User
	err = s.db.Where("email = ?", email).First(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return ResetRequestResult{}, err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Unknown address. The caller hides this from the requester in the
		// uniform mode. Nothing is sent: there is no mailbox to send to.
		return ResetRequestResult{AccountExists: false}, nil
	}

	code, err := generateResetCode()
	if err != nil {
		return ResetRequestResult{}, err
	}

	// A new code invalidates the older unused ones of this user. Otherwise a
	// leaked earlier email would stay usable until it expired, and the user
	// would have two live codes at once.
	if err := s.invalidateOpenCodes(user.ID, now); err != nil {
		return ResetRequestResult{}, err
	}

	token := model.PasswordResetToken{
		ID:          uuid.New(),
		UserID:      user.ID,
		Email:       email,
		CodeHash:    hashResetCode(code),
		Purpose:     ResetPurposePassword,
		Attempts:    0,
		MaxAttempts: s.maxAttempts,
		RequestIP:   requestIP,
		ExpiresAt:   now.Add(s.ttl),
		CreatedAt:   now,
	}
	if err := s.db.Create(&token).Error; err != nil {
		return ResetRequestResult{}, err
	}

	msg := mail.PasswordResetMessage(email, code, int(s.ttl.Minutes()), s.appName)
	if err := s.sender.Send(ctx, msg); err != nil {
		// The code exists but could not be delivered. Mark it consumed so a
		// later request is not blocked by a code nobody received, and report
		// the failure: silently succeeding here would strand the user.
		s.consumeToken(token.ID, now)
		// The reason is logged, because the HTTP layer only knows that the
		// request failed. Without this line a broken mail configuration is
		// invisible: the API answers 500 and nobody learns why.
		log.Printf("[password-reset] send mail to %s failed: %v", email, err)
		if errors.Is(err, mail.ErrNotConfigured) {
			return ResetRequestResult{AccountExists: true}, ErrResetMailUnavailable
		}
		return ResetRequestResult{AccountExists: true}, fmt.Errorf("send reset mail: %w", err)
	}

	result := ResetRequestResult{AccountExists: true, Delivered: true}
	if s.revealCode {
		result.Code = code
	}
	return result, nil
}

// checkLimits enforces the per address and per IP caps.
//
// It returns the wait time when the request is rejected so the HTTP layer can
// send a Retry-After header.
func (s *PasswordResetService) checkLimits(email, requestIP string, now time.Time) (time.Duration, error) {
	// Cooldown: the newest code for this address must be at least
	// PerAddressCooldown old.
	var last model.PasswordResetToken
	err := s.db.Where("email = ?", email).Order("created_at DESC").First(&last).Error
	if err == nil {
		if elapsed := now.Sub(last.CreatedAt); elapsed < s.limits.PerAddressCooldown {
			return s.limits.PerAddressCooldown - elapsed, ErrResetRateLimited
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}

	// Per address, hourly.
	hourAgo := now.Add(-time.Hour)
	var hourly int64
	if err := s.db.Model(&model.PasswordResetToken{}).
		Where("email = ? AND created_at > ?", email, hourAgo).
		Count(&hourly).Error; err != nil {
		return 0, err
	}
	if hourly >= int64(s.limits.PerAddressHourly) {
		return time.Hour, ErrResetRateLimited
	}

	// Per address, daily.
	dayAgo := now.Add(-24 * time.Hour)
	var daily int64
	if err := s.db.Model(&model.PasswordResetToken{}).
		Where("email = ? AND created_at > ?", email, dayAgo).
		Count(&daily).Error; err != nil {
		return 0, err
	}
	if daily >= int64(s.limits.PerAddressDaily) {
		return 24 * time.Hour, ErrResetRateLimited
	}

	// Per IP, hourly. This is the dimension that stops one host from
	// walking a list of addresses.
	if strings.TrimSpace(requestIP) != "" {
		var ipCount int64
		if err := s.db.Model(&model.PasswordResetToken{}).
			Where("request_ip = ? AND created_at > ?", requestIP, hourAgo).
			Count(&ipCount).Error; err != nil {
			return 0, err
		}
		if ipCount >= int64(s.limits.PerIPHourly) {
			return time.Hour, ErrResetRateLimited
		}
	}

	return 0, nil
}

// VerifyCode checks a submitted code and returns a session token.
//
// The code is consumed here, exactly once. The returned session token is a
// high entropy secret that authorises the password change in the next step.
//
// Splitting the flow this way matters for two reasons:
//  1. The six digit code is spent at the verification step, so the final
//     write is never authorised by a guessable secret.
//  2. The user can type the code first and think about the new password
//     afterwards. If the code and the password arrived in one request, a
//     password that violates the policy would waste the code.
func (s *PasswordResetService) VerifyCode(email, code string) (string, error) {
	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if len(code) != ResetCodeLength {
		return "", ErrResetCodeInvalid
	}
	if !isAllDigits(code) {
		return "", ErrResetCodeInvalid
	}
	now := s.now().UTC()

	token, err := s.findActiveToken(email, now)
	if err != nil {
		return "", err
	}
	if token == nil {
		return "", ErrResetNoActiveCode
	}

	// Constant time compare keeps the timing independent of how many leading
	// characters matched. The comparison result is inverted once, so a match
	// falls through to the success path below.
	if subtle.ConstantTimeCompare([]byte(token.CodeHash), []byte(hashResetCode(code))) != 1 {
		// Wrong code. Spend one attempt from the budget and invalidate the
		// code once the budget is gone, so guessing six digits one attempt
		// at a time cannot work.
		s.recordFailedAttempt(token, now)
		return "", ErrResetCodeInvalid
	}

	// Correct code. Mint a session token and mark the code as used in the
	// same statement, so a concurrent request cannot mint two sessions.
	sessionToken, err := generateSessionToken()
	if err != nil {
		return "", err
	}
	// 条件里同时要求“未使用、未作废、未过期”。两个并发请求都读到这条
	// 记录时，只有一个能命中；另一个 RowsAffected 为 0，必须失败。
	res := s.db.Model(&model.PasswordResetToken{}).
		Where("id = ? AND used_at IS NULL AND consumed_at IS NULL AND expires_at > ?", token.ID, now).
		Updates(map[string]interface{}{
			"used_at":      now,
			"session_hash": hashSessionToken(sessionToken),
		})
	if res.Error != nil {
		return "", res.Error
	}
	if res.RowsAffected != 1 {
		return "", ErrResetCodeInvalid
	}
	return sessionToken, nil
}

// ResetPasswordWithSession replaces the password using a session token.
//
// The session token comes from VerifyCode. It authorises exactly one
// password change and expires with the code's window.
func (s *PasswordResetService) ResetPasswordWithSession(sessionToken, newPassword string) error {
	if err := ValidatePassword(newPassword); err != nil {
		return err
	}
	sessionToken = strings.TrimSpace(sessionToken)
	if sessionToken == "" {
		return ErrResetSessionInvalid
	}
	now := s.now().UTC()

	var token model.PasswordResetToken
	err := s.db.Where("session_hash = ? AND session_hash <> ''", hashSessionToken(sessionToken)).
		Order("created_at DESC").First(&token).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResetSessionInvalid
		}
		return err
	}
	if token.UsedAt == nil || token.ConsumedAt != nil {
		// The session was already spent, or the code was invalidated.
		return ErrResetSessionInvalid
	}
	if now.After(token.ExpiresAt) {
		return ErrResetCodeExpired
	}

	var user model.User
	if err := s.db.First(&user, "id = ?", token.UserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(newPassword)); err == nil {
		return ErrResetSamePassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// Mark the session consumed in the same transaction as the password
	// write, so a replay cannot set a second password.
	//
	// 顺序很重要：先在事务内原子消费 session，只有恰好影响一行时才允许改密。
	// 如果先改密再标记消费，两个并发 confirm 会各自改一次密码，最终密码
	// 取决于谁后提交，用户无法预期。
	return s.db.Transaction(func(tx *gorm.DB) error {
		consumed := tx.Model(&model.PasswordResetToken{}).
			Where("id = ? AND used_at IS NOT NULL AND consumed_at IS NULL", token.ID).
			Updates(map[string]interface{}{"consumed_at": now})
		if consumed.Error != nil {
			return consumed.Error
		}
		if consumed.RowsAffected != 1 {
			// 另一个请求已经消费了这个 session，或者验证码已被作废。
			return ErrResetSessionInvalid
		}
		return tx.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
			"password_hash": string(hash),
			"updated_at":    now,
		}).Error
	})
}

// ResetPassword verifies the code and replaces the password in one step.
//
// It is the convenience form used by the tests and by any caller that does
// not need the two step flow.
func (s *PasswordResetService) ResetPassword(email, code, newPassword string) error {
	sessionToken, err := s.VerifyCode(email, code)
	if err != nil {
		return err
	}
	return s.ResetPasswordWithSession(sessionToken, newPassword)
}

// findActiveToken returns the newest usable code for the address.
func (s *PasswordResetService) findActiveToken(email string, now time.Time) (*model.PasswordResetToken, error) {
	var tokens []model.PasswordResetToken
	if err := s.db.Where("email = ? AND purpose = ?", email, ResetPurposePassword).
		Order("created_at DESC").Limit(5).Find(&tokens).Error; err != nil {
		return nil, err
	}
	var expired *model.PasswordResetToken
	for i := range tokens {
		t := tokens[i]
		if t.UsedAt != nil || t.ConsumedAt != nil {
			continue
		}
		if now.After(t.ExpiresAt) {
			if expired == nil {
				expired = &t
			}
			continue
		}
		return &t, nil
	}
	// An expired but otherwise unused code gives a better error message than
	// "no code" — the user can tell the difference between "your code ran
	// out" and "you never asked for one".
	if expired != nil {
		return nil, ErrResetCodeExpired
	}
	return nil, nil
}

// recordFailedAttempt spends one attempt from the code budget.
//
// 用数据库原子自增，而不是把内存里读到的 attempts+1 写回去：并发错误请求
// 各自读到同一个旧值时会互相覆盖，导致实际可尝试次数远大于配置上限。
func (s *PasswordResetService) recordFailedAttempt(token *model.PasswordResetToken, now time.Time) {
	res := s.db.Model(&model.PasswordResetToken{}).
		Where("id = ? AND used_at IS NULL AND consumed_at IS NULL", token.ID).
		Updates(map[string]interface{}{"attempts": gorm.Expr("attempts + 1")})
	if res.Error != nil {
		log.Printf("[password-reset] record failed attempt: %v", res.Error)
		return
	}
	if res.RowsAffected == 0 {
		return
	}
	// 预算用尽就作废。条件里带上 attempts >= 上限，重复执行也安全。
	burn := s.db.Model(&model.PasswordResetToken{}).
		Where("id = ? AND used_at IS NULL AND consumed_at IS NULL AND attempts >= ?", token.ID, token.MaxAttempts).
		Updates(map[string]interface{}{"consumed_at": now})
	if burn.Error != nil {
		log.Printf("[password-reset] burn exhausted code: %v", burn.Error)
		return
	}
	if burn.RowsAffected > 0 {
		log.Printf("[password-reset] code %s for %s exhausted", token.ID, token.Email)
	}
}

// invalidateOpenCodes marks the unused codes of a user as consumed.
func (s *PasswordResetService) invalidateOpenCodes(userID uuid.UUID, now time.Time) error {
	return s.db.Model(&model.PasswordResetToken{}).
		Where("user_id = ? AND used_at IS NULL AND consumed_at IS NULL", userID).
		Updates(map[string]interface{}{"consumed_at": now}).Error
}

// consumeToken marks a single token as consumed.
func (s *PasswordResetService) consumeToken(id uuid.UUID, now time.Time) {
	if err := s.db.Model(&model.PasswordResetToken{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{"consumed_at": now}).Error; err != nil {
		log.Printf("[password-reset] consume token: %v", err)
	}
}

// CleanupExpired removes tokens that expired long ago. It keeps the table
// from growing without bound; the service never relies on the rows being
// gone, because it checks expiry in code as well.
func (s *PasswordResetService) CleanupExpired(before time.Time) (int64, error) {
	res := s.db.Where("expires_at < ?", before).Delete(&model.PasswordResetToken{})
	return res.RowsAffected, res.Error
}

// generateResetCode returns a cryptographically random numeric code.
//
// crypto/rand is used instead of math/rand: the code is a credential, and a
// predictable one would let an attacker request a code and predict the next
// one. The code is zero padded so it always has six digits.
func generateResetCode() (string, error) {
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(ResetCodeLength)), nil)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("generate reset code: %w", err)
	}
	return fmt.Sprintf("%0*d", ResetCodeLength, n.Int64()), nil
}

// hashResetCode returns the hex SHA-256 digest of a code.
//
// The digest is enough: the code space is one million, so a plain digest
// would be cheap to brute force offline. That is exactly why the codes are
// rate limited on the server side — the digest only protects the database
// from a leak, it does not replace the attempt budget.
func hashResetCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// generateSessionToken returns a high entropy secret that authorises the
// password change after the code was verified.
//
// Unlike the code, this token has 256 bits of entropy, so it can be stored
// as a plain digest without a brute force concern.
func generateSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate reset session: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// hashSessionToken returns the hex SHA-256 digest of a session token.
func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// isAllDigits reports whether the string is exactly ASCII digits.
func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
