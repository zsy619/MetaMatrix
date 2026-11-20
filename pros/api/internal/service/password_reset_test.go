package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// recordingSender captures the messages a test sends.
type recordingSender struct {
	messages []mail.Message
	err      error
}

func (s *recordingSender) Send(_ context.Context, msg mail.Message) error {
	if s.err != nil {
		return s.err
	}
	s.messages = append(s.messages, msg)
	return nil
}

func (s *recordingSender) Describe() string { return "recording" }

// The shadow models below exist only to make the SQLite test database work.
//
// The production models declare their time columns as "timestamptz", which is
// a PostgreSQL type. SQLite does not know it, falls back to TEXT affinity and
// stores the timestamp as a string that the driver refuses to scan back into
// a time.Time.
//
// The shadow structs use the same table name and the same column names, so
// the production models read and write them without any change. Only the
// declared column type differs.

// usersLite mirrors model.User with SQLite friendly time columns.
type usersLite struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex;not null"`
	DisplayName  string    `gorm:"type:varchar(128)"`
	Department   string    `gorm:"type:varchar(128)"`
	Role         string    `gorm:"type:varchar(128)"`
	AvatarURL    string    `gorm:"type:varchar(512)"`
	PasswordHash string    `gorm:"type:varchar(255);not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (usersLite) TableName() string { return "users" }

// resetTokensLite mirrors model.PasswordResetToken with SQLite friendly time
// columns.
type resetTokensLite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID `gorm:"type:uuid;not null"`
	Email       string    `gorm:"type:varchar(255);not null"`
	CodeHash    string    `gorm:"type:varchar(64);not null"`
	Purpose     string    `gorm:"type:varchar(32);not null;default:'password_reset'"`
	SessionHash string    `gorm:"type:varchar(64);not null;default:''"`
	Attempts    int       `gorm:"not null;default:0"`
	MaxAttempts int       `gorm:"not null;default:5"`
	RequestIP   string    `gorm:"type:varchar(64);not null;default:''"`
	ExpiresAt   time.Time `gorm:"not null"`
	UsedAt      *time.Time
	ConsumedAt  *time.Time
	CreatedAt   time.Time `gorm:"not null"`
}

func (resetTokensLite) TableName() string { return "password_reset_tokens" }

// newResetService builds a service over an in-memory database with one
// registered user.
func newResetService(t *testing.T, sender mail.Sender, opts PasswordResetOptions) (*PasswordResetService, *model.User, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&usersLite{}, &resetTokensLite{}); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	user := &model.User{
		ID:           uuid.New(),
		Email:        "demo@metamatrix.local",
		DisplayName:  "demo",
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return NewPasswordResetService(db, sender, opts), user, db
}

// TestRequestCodeSendsSixDigitCode locks the code format: exactly six digits.
func TestRequestCodeSendsSixDigitCode(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	result, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9")
	if err != nil {
		t.Fatalf("request code: %v", err)
	}
	if !result.AccountExists {
		t.Fatal("expected the account to be found")
	}
	if !result.Delivered {
		t.Fatal("expected the mail to be delivered")
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(sender.messages))
	}
	body := sender.messages[0].Text
	// The code appears on its own line in the body.
	code := extractCode(body)
	if len(code) != ResetCodeLength {
		t.Fatalf("expected a %d digit code, got %q", ResetCodeLength, code)
	}
	for _, r := range code {
		if r < '0' || r > '9' {
			t.Fatalf("code %q contains a non digit", code)
		}
	}
}

// TestRequestCodeStoresOnlyHash makes sure the plain code never lands in the
// database.
func TestRequestCodeStoresOnlyHash(t *testing.T) {
	sender := &recordingSender{}
	svc, _, db := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	var tokens []model.PasswordResetToken
	if err := db.Find(&tokens).Error; err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token row, got %d", len(tokens))
	}
	if strings.Contains(tokens[0].CodeHash, code) {
		t.Fatal("the plain code must not be stored")
	}
	if tokens[0].CodeHash != hashResetCode(code) {
		t.Fatal("the stored hash does not match the sent code")
	}
}

// TestRequestCodeUnknownAccount checks that an unregistered address is
// reported as unknown and sends nothing.
func TestRequestCodeUnknownAccount(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	result, err := svc.RequestCode(context.Background(), "nobody@metamatrix.local", "203.0.113.9")
	if err != nil {
		t.Fatalf("request code: %v", err)
	}
	if result.AccountExists {
		t.Fatal("an unregistered address must not be reported as existing")
	}
	if len(sender.messages) != 0 {
		t.Fatalf("expected no message for an unknown address, got %d", len(sender.messages))
	}
}

// TestCooldownBlocksSecondRequest is the core rate limit: two requests for
// the same address inside the cooldown window must not both succeed.
func TestCooldownBlocksSecondRequest(t *testing.T) {
	sender := &recordingSender{}
	now := time.Now().UTC()
	clock := now
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{
		Now: func() time.Time { return clock },
		Limits: ResetLimits{
			PerAddressCooldown: time.Minute,
			PerAddressHourly:   5,
			PerAddressDaily:    10,
			PerIPHourly:        20,
		},
	})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("first request: %v", err)
	}
	// 30 seconds later the cooldown has not passed.
	clock = now.Add(30 * time.Second)
	_, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9")
	if !errors.Is(err, ErrResetRateLimited) {
		t.Fatalf("expected ErrResetRateLimited, got %v", err)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("the blocked request must not send a mail, got %d messages", len(sender.messages))
	}

	// After the cooldown it works again.
	clock = now.Add(61 * time.Second)
	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request after cooldown: %v", err)
	}
	if len(sender.messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(sender.messages))
	}
}

// TestHourlyPerAddressLimit checks the hourly cap for one address.
func TestHourlyPerAddressLimit(t *testing.T) {
	sender := &recordingSender{}
	now := time.Now().UTC()
	clock := now
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{
		Now: func() time.Time { return clock },
		Limits: ResetLimits{
			PerAddressCooldown: time.Second,
			PerAddressHourly:   3,
			PerAddressDaily:    10,
			PerIPHourly:        100,
		},
	})

	for i := 0; i < 3; i++ {
		clock = now.Add(time.Duration(i) * 2 * time.Second)
		if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
			t.Fatalf("request %d: %v", i, err)
		}
	}
	clock = now.Add(10 * time.Second)
	_, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9")
	if !errors.Is(err, ErrResetRateLimited) {
		t.Fatalf("expected the hourly cap to trigger, got %v", err)
	}
}

// TestPerIPLimit checks that one host cannot request codes for many
// different addresses.
func TestPerIPLimit(t *testing.T) {
	sender := &recordingSender{}
	now := time.Now().UTC()
	clock := now
	svc, _, db := newResetService(t, sender, PasswordResetOptions{
		Now: func() time.Time { return clock },
		Limits: ResetLimits{
			PerAddressCooldown: time.Second,
			PerAddressHourly:   100,
			PerAddressDaily:    100,
			PerIPHourly:        2,
		},
	})
	// Register a second address so the IP limit is the only thing that can
	// stop the third request.
	hash, _ := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.DefaultCost)
	if err := db.Create(&model.User{
		ID: uuid.New(), Email: "other@metamatrix.local",
		PasswordHash: string(hash), CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}

	for i, mail := range []string{"demo@metamatrix.local", "other@metamatrix.local"} {
		clock = now.Add(time.Duration(i) * 2 * time.Second)
		if _, err := svc.RequestCode(context.Background(), mail, "198.51.100.7"); err != nil {
			t.Fatalf("request %d: %v", i, err)
		}
	}
	clock = now.Add(10 * time.Second)
	_, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "198.51.100.7")
	if !errors.Is(err, ErrResetRateLimited) {
		t.Fatalf("expected the per IP cap to trigger, got %v", err)
	}
}

// TestResetPasswordChangesTheHash walks the whole happy path.
func TestResetPasswordChangesTheHash(t *testing.T) {
	sender := &recordingSender{}
	svc, user, db := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	if err := svc.ResetPassword("demo@metamatrix.local", code, "new-password-1"); err != nil {
		t.Fatalf("reset password: %v", err)
	}

	var updated model.User
	if err := db.First(&updated, "id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(updated.PasswordHash), []byte("new-password-1")); err != nil {
		t.Fatalf("the new password must work: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(updated.PasswordHash), []byte("old-password")); err == nil {
		t.Fatal("the old password must not work any more")
	}
}

// TestCodeIsSingleUse makes sure a code cannot be replayed.
func TestCodeIsSingleUse(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	if err := svc.ResetPassword("demo@metamatrix.local", code, "new-password-1"); err != nil {
		t.Fatalf("first reset: %v", err)
	}
	err := svc.ResetPassword("demo@metamatrix.local", code, "new-password-2")
	if !errors.Is(err, ErrResetCodeInvalid) && !errors.Is(err, ErrResetNoActiveCode) {
		t.Fatalf("a used code must not work again, got %v", err)
	}
}

// TestNewCodeInvalidatesTheOldOne makes sure only the latest code works.
func TestNewCodeInvalidatesTheOldOne(t *testing.T) {
	sender := &recordingSender{}
	now := time.Now().UTC()
	clock := now
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{
		Now: func() time.Time { return clock },
		Limits: ResetLimits{
			PerAddressCooldown: time.Second,
			PerAddressHourly:   10,
			PerAddressDaily:    10,
			PerIPHourly:        10,
		},
	})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("first request: %v", err)
	}
	oldCode := extractCode(sender.messages[0].Text)

	clock = now.Add(2 * time.Second)
	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("second request: %v", err)
	}
	newCode := extractCode(sender.messages[1].Text)

	if err := svc.ResetPassword("demo@metamatrix.local", oldCode, "new-password-1"); err == nil {
		t.Fatal("the superseded code must not work")
	}
	if err := svc.ResetPassword("demo@metamatrix.local", newCode, "new-password-1"); err != nil {
		t.Fatalf("the newest code must work: %v", err)
	}
}

// TestAttemptBudgetInvalidatesTheCode stops the brute force of a six digit
// code.
func TestAttemptBudgetInvalidatesTheCode(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{
		MaxAttempts: 3,
	})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	for i := 0; i < 3; i++ {
		err := svc.ResetPassword("demo@metamatrix.local", "000000", "new-password-1")
		if err == nil {
			t.Fatal("a wrong code must never succeed")
		}
	}
	// The budget is spent, so even the correct code is refused now.
	err := svc.ResetPassword("demo@metamatrix.local", code, "new-password-1")
	if err == nil {
		t.Fatal("the code must be dead once the attempt budget is spent")
	}
}

// TestExpiredCodeIsRejected checks the TTL.
func TestExpiredCodeIsRejected(t *testing.T) {
	sender := &recordingSender{}
	now := time.Now().UTC()
	clock := now
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{
		TTL: 5 * time.Minute,
		Now: func() time.Time { return clock },
	})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	clock = now.Add(10 * time.Minute)
	err := svc.ResetPassword("demo@metamatrix.local", code, "new-password-1")
	if !errors.Is(err, ErrResetCodeExpired) {
		t.Fatalf("expected ErrResetCodeExpired, got %v", err)
	}
}

// TestMailFailureIsReported makes sure a broken transport does not pretend
// the mail went out.
func TestMailFailureIsReported(t *testing.T) {
	sender := &recordingSender{err: errors.New("smtp down")}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	_, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9")
	if err == nil {
		t.Fatal("a mail failure must surface")
	}
}

// TestDisabledTransportIsReported checks the not configured path.
func TestDisabledTransportIsReported(t *testing.T) {
	svc, _, _ := newResetService(t, mail.DisabledSender{}, PasswordResetOptions{})

	_, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9")
	if !errors.Is(err, ErrResetMailUnavailable) {
		t.Fatalf("expected ErrResetMailUnavailable, got %v", err)
	}
}

// TestWeakPasswordRejected checks the password policy on the reset path.
func TestWeakPasswordRejected(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	if err := svc.ResetPassword("demo@metamatrix.local", code, "123"); !errors.Is(err, ErrWeakPassword) {
		t.Fatalf("expected ErrWeakPassword, got %v", err)
	}
}

// TestSamePasswordRejected keeps the old password from being reused.
func TestSamePasswordRejected(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	if err := svc.ResetPassword("demo@metamatrix.local", code, "old-password"); !errors.Is(err, ErrResetSamePassword) {
		t.Fatalf("expected ErrResetSamePassword, got %v", err)
	}
}

// extractCode pulls the six digit code out of the mail body.
func extractCode(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "验证码：") {
			return strings.TrimSpace(strings.TrimPrefix(line, "验证码："))
		}
	}
	return ""
}

// TestVerifyCodeReturnsSessionToken checks that the code is exchanged for a
// session token and that the password is not touched yet.
func TestVerifyCodeReturnsSessionToken(t *testing.T) {
	sender := &recordingSender{}
	svc, _, db := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	session, err := svc.VerifyCode("demo@metamatrix.local", code)
	if err != nil {
		t.Fatalf("verify code: %v", err)
	}
	if len(session) != 64 {
		t.Fatalf("expected a 64 character session token, got %d", len(session))
	}

	// The password must not have changed yet.
	var user model.User
	if err := db.Where("email = ?", "demo@metamatrix.local").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("old-password")); err != nil {
		t.Fatal("the password must not change at the verification step")
	}

	// The session token authorises exactly one password change.
	if err := svc.ResetPasswordWithSession(session, "new-password-1"); err != nil {
		t.Fatalf("reset with session: %v", err)
	}
	if err := svc.ResetPasswordWithSession(session, "new-password-2"); !errors.Is(err, ErrResetSessionInvalid) {
		t.Fatalf("a spent session must not work again, got %v", err)
	}
}

// TestSessionTokenIsStoredAsHash checks that the plain session token never
// lands in the database.
func TestSessionTokenIsStoredAsHash(t *testing.T) {
	sender := &recordingSender{}
	svc, _, db := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)
	session, err := svc.VerifyCode("demo@metamatrix.local", code)
	if err != nil {
		t.Fatalf("verify code: %v", err)
	}

	var tokens []model.PasswordResetToken
	if err := db.Find(&tokens).Error; err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token row, got %d", len(tokens))
	}
	if tokens[0].SessionHash == session {
		t.Fatal("the plain session token must not be stored")
	}
	if tokens[0].SessionHash != hashSessionToken(session) {
		t.Fatal("the stored session hash does not match")
	}
}

// TestVerifyCodeSpendsTheCode makes sure the code cannot be exchanged twice.
func TestVerifyCodeSpendsTheCode(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	if _, err := svc.RequestCode(context.Background(), "demo@metamatrix.local", "203.0.113.9"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	code := extractCode(sender.messages[0].Text)

	if _, err := svc.VerifyCode("demo@metamatrix.local", code); err != nil {
		t.Fatalf("first verify: %v", err)
	}
	_, err := svc.VerifyCode("demo@metamatrix.local", code)
	if err == nil {
		t.Fatal("the code must not be exchangeable twice")
	}
}

// TestUnknownSessionIsRejected checks the guard for a made up session.
func TestUnknownSessionIsRejected(t *testing.T) {
	sender := &recordingSender{}
	svc, _, _ := newResetService(t, sender, PasswordResetOptions{})

	err := svc.ResetPasswordWithSession("not-a-real-session", "new-password-1")
	if !errors.Is(err, ErrResetSessionInvalid) {
		t.Fatalf("expected ErrResetSessionInvalid, got %v", err)
	}
}
