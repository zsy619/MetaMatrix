package service

import "strings"

const (
	maxEmailLen       = 254
	minPasswordLen    = 6
	maxPasswordBytes  = 72 // bcrypt input limit; longer secrets are silently truncated
	maxDisplayNameRun = 64
)

// NormalizeEmail trims and lowercases an address. It does not validate.
func NormalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

// ValidateEmail rejects blank, oversized, and structurally invalid addresses.
func ValidateEmail(email string) error {
	if email == "" || len(email) > maxEmailLen || strings.ContainsAny(email, " \t\r\n") {
		return ErrInvalidEmail
	}
	at := strings.IndexByte(email, '@')
	if at <= 0 || at != strings.LastIndexByte(email, '@') {
		return ErrInvalidEmail
	}
	local, domain := email[:at], email[at+1:]
	if local == "" || domain == "" || len(local) > 64 {
		return ErrInvalidEmail
	}
	if strings.HasPrefix(local, ".") || strings.HasSuffix(local, ".") {
		return ErrInvalidEmail
	}
	if strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") || !strings.Contains(domain, ".") {
		return ErrInvalidEmail
	}
	return nil
}

// ValidatePassword enforces the product minimum and the bcrypt byte ceiling.
func ValidatePassword(password string) error {
	if len(password) < minPasswordLen {
		return ErrWeakPassword
	}
	if len(password) > maxPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

// NormalizeDisplayName trims, falls back to the mailbox local part, and caps length.
func NormalizeDisplayName(name, email string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}
	r := []rune(name)
	if len(r) > maxDisplayNameRun {
		return string(r[:maxDisplayNameRun])
	}
	return name
}
