package service

import (
	"testing"

	"github.com/google/uuid"
)

func TestNormalizeAndValidateEmail(t *testing.T) {
	if got := NormalizeEmail("  Demo@MetaMatrix.Local "); got != "demo@metamatrix.local" {
		t.Fatalf("normalize = %q", got)
	}
	good := []string{"demo@metamatrix.local", "a.b+c@example.co"}
	for _, email := range good {
		if err := ValidateEmail(email); err != nil {
			t.Fatalf("%s: %v", email, err)
		}
	}
	bad := []string{"", "demo", "demo@", "@demo.com", "a@b", "a@@b.com", "a b@c.com", "a@b.", ".a@b.com"}
	for _, email := range bad {
		if err := ValidateEmail(email); err != ErrInvalidEmail {
			t.Fatalf("%q err = %v, want invalid email", email, err)
		}
	}
	long := make([]byte, 255)
	for i := range long {
		long[i] = 'a'
	}
	if err := ValidateEmail(string(long)); err != ErrInvalidEmail {
		t.Fatalf("overlong err = %v", err)
	}
}

func TestValidatePassword(t *testing.T) {
	if err := ValidatePassword("12345"); err != ErrWeakPassword {
		t.Fatalf("short = %v", err)
	}
	if err := ValidatePassword("123456"); err != nil {
		t.Fatalf("min = %v", err)
	}
	over := make([]byte, 73)
	for i := range over {
		over[i] = 'a'
	}
	if err := ValidatePassword(string(over)); err != ErrPasswordTooLong {
		t.Fatalf("long = %v", err)
	}
	exact := make([]byte, 72)
	for i := range exact {
		exact[i] = 'a'
	}
	if err := ValidatePassword(string(exact)); err != nil {
		t.Fatalf("72 bytes = %v", err)
	}
}

func TestChangePasswordRejectsWeakBeforeDB(t *testing.T) {
	svc := NewAuthService(nil, "secret")
	if err := svc.ChangePassword(uuid.Nil, "current-pass", "123"); err != ErrWeakPassword {
		t.Fatalf("short = %v", err)
	}
	if err := svc.ChangePassword(uuid.Nil, "same-pass", "same-pass"); err != ErrSamePassword {
		t.Fatalf("same = %v", err)
	}
}

func TestNormalizeDisplayName(t *testing.T) {
	if got := NormalizeDisplayName("  ", "demo@metamatrix.local"); got != "demo" {
		t.Fatalf("fallback = %q", got)
	}
	if got := NormalizeDisplayName("  元矩阵  ", "a@b.co"); got != "元矩阵" {
		t.Fatalf("trim = %q", got)
	}
	long := ""
	for i := 0; i < 80; i++ {
		long += "名"
	}
	got := NormalizeDisplayName(long, "a@b.co")
	if len([]rune(got)) != 64 {
		t.Fatalf("cap = %d", len([]rune(got)))
	}
}
