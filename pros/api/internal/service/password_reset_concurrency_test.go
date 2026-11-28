package service

import (
	"context"
	"errors"
	"regexp"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"metamatrix/api/internal/mail"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var sixDigits = regexp.MustCompile(`\b\d{6}\b`)

// newPostgresResetService 在真实 PostgreSQL 上建一个重置服务和一个用户。
func newPostgresResetService(t *testing.T, db *gorm.DB) (*PasswordResetService, *model.User, *recordingSender) {
	t.Helper()
	sender := &recordingSender{}
	hash, err := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	user := &model.User{
		ID:           uuid.New(),
		Email:        uuid.New().String() + "@reset-concurrency.test",
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_id = ?", user.ID).Delete(&model.PasswordResetToken{})
		db.Where("id = ?", user.ID).Delete(&model.User{})
	})
	svc := NewPasswordResetService(db, sender, PasswordResetOptions{Now: time.Now})
	return svc, user, sender
}

// requestCodeForTest 走真实发码流程，并从邮件正文里取出验证码。
// 数据库里只有哈希，所以测试必须从“用户能看到的邮件”反推。
func requestCodeForTest(t *testing.T, svc *PasswordResetService, sender *recordingSender, email string) string {
	t.Helper()
	if _, err := svc.RequestCode(context.Background(), email, "127.0.0.1"); err != nil {
		t.Fatalf("request code: %v", err)
	}
	if len(sender.messages) == 0 {
		t.Fatal("no mail was sent")
	}
	code := sixDigits.FindString(sender.messages[len(sender.messages)-1].Text)
	if code == "" {
		t.Fatalf("no six digit code in mail body: %q", sender.messages[len(sender.messages)-1].Text)
	}
	return code
}

// TestVerifyCodeConcurrentOnlyOneSession 证明验证码是真正的一次性：
// 多个请求同时提交正确验证码，只能有一个拿到 sessionToken。
func TestVerifyCodeConcurrentOnlyOneSession(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, user, sender := newPostgresResetService(t, db)
	code := requestCodeForTest(t, svc, sender, user.Email)

	const workers = 8
	var wg sync.WaitGroup
	var successes int32
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if token, err := svc.VerifyCode(user.Email, code); err == nil && token != "" {
				atomic.AddInt32(&successes, 1)
			}
		}()
	}
	wg.Wait()

	if successes != 1 {
		t.Fatalf("concurrent verify successes = %d, want 1", successes)
	}
}

// TestResetPasswordConcurrentOnlyOnePasswordWins 证明改密 session 只能消费一次。
// 如果先改密再标记消费，两个并发请求会各自写入密码，最终结果不可预期。
func TestResetPasswordConcurrentOnlyOnePasswordWins(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, user, sender := newPostgresResetService(t, db)
	code := requestCodeForTest(t, svc, sender, user.Email)
	session, err := svc.VerifyCode(user.Email, code)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}

	candidates := []string{"NewPass-A123", "NewPass-B123", "NewPass-C123", "NewPass-D123"}
	var wg sync.WaitGroup
	var successes int32
	var winner int32 = -1
	for i, pwd := range candidates {
		wg.Add(1)
		go func(idx int, password string) {
			defer wg.Done()
			if err := svc.ResetPasswordWithSession(session, password); err == nil {
				atomic.AddInt32(&successes, 1)
				atomic.StoreInt32(&winner, int32(idx))
			}
		}(i, pwd)
	}
	wg.Wait()

	if successes != 1 {
		t.Fatalf("concurrent reset successes = %d, want 1", successes)
	}

	// 数据库里的密码必须正好等于唯一成功者的密码。
	var stored model.User
	if err := db.Where("id = ?", user.ID).First(&stored).Error; err != nil {
		t.Fatal(err)
	}
	idx := int(atomic.LoadInt32(&winner))
	if idx < 0 {
		t.Fatal("no winner recorded")
	}
	if bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(candidates[idx])) != nil {
		t.Fatalf("stored password does not match the only successful candidate")
	}
	for i, pwd := range candidates {
		if i == idx {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(pwd)) == nil {
			t.Fatalf("stored password also matches losing candidate %d", i)
		}
	}
}

// TestConcurrentWrongAttemptsAreNotLost 证明并发错误尝试不会丢计数。
// 旧实现用内存里的 attempts+1 回写，并发时会互相覆盖。
func TestConcurrentWrongAttemptsAreNotLost(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, user, sender := newPostgresResetService(t, db)
	_ = requestCodeForTest(t, svc, sender, user.Email)

	const workers = 8
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = svc.VerifyCode(user.Email, "000000")
		}()
	}
	wg.Wait()

	var token model.PasswordResetToken
	if err := db.Where("user_id = ?", user.ID).Order("created_at DESC").First(&token).Error; err != nil {
		t.Fatal(err)
	}
	if token.Attempts < token.MaxAttempts {
		t.Fatalf("attempts = %d, want >= %d (concurrent increments were lost)", token.Attempts, token.MaxAttempts)
	}
	if token.ConsumedAt == nil {
		t.Fatalf("code should be burned after exceeding the attempt budget")
	}
	if _, err := svc.VerifyCode(user.Email, "000000"); !errors.Is(err, ErrResetCodeInvalid) && !errors.Is(err, ErrResetCodeExpired) && !errors.Is(err, ErrResetNoActiveCode) {
		t.Fatalf("burned code error = %v, want invalid/expired", err)
	}
}

// TestBurnedCodeCannotBeVerified 保留一个不依赖并发的快速校验，
// 保证上面几条并发测试失败时能区分“锁坏了”还是“码本身坏了”。
func TestBurnedCodeCannotBeVerified(t *testing.T) {
	db := openPostgresForServiceTest(t)
	svc, user, sender := newPostgresResetService(t, db)
	code := requestCodeForTest(t, svc, sender, user.Email)
	if _, err := svc.VerifyCode(user.Email, code); err != nil {
		t.Fatalf("first verify: %v", err)
	}
	if _, err := svc.VerifyCode(user.Email, code); !errors.Is(err, ErrResetCodeInvalid) && !errors.Is(err, ErrResetNoActiveCode) {
		t.Fatalf("second verify error = %v, want ErrResetCodeInvalid", err)
	}
}

// 保证 mail 包被引用（recordingSender 依赖 mail.Message）。
var _ mail.Sender = (*recordingSender)(nil)
