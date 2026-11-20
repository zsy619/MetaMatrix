package model

import (
	"time"

	"github.com/google/uuid"
)

// PasswordResetToken is a one-time code issued to the mailbox of a user who
// asked to reset their password.
//
// The code itself is never stored. Only its SHA-256 digest is, so a leaked
// database dump does not hand an attacker working reset codes.
//
// One row is one issued code. Issuing a new code invalidates the older
// unused ones of the same user (see the service layer), so a leaked earlier
// email cannot be replayed after the user requests a fresh one.
type PasswordResetToken struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	// UserID is the account the code resets. It is the link back to users.
	UserID uuid.UUID `gorm:"type:uuid;not null;index:idx_reset_user_created,priority:1" json:"userId"`
	// Email is a copy of the target address. It lets the service find the
	// active code without a join, and keeps the audit trail readable.
	Email string `gorm:"type:varchar(255);not null;index:idx_reset_user_created,priority:2" json:"email"`
	// CodeHash is the hex SHA-256 digest of the numeric code.
	CodeHash string `gorm:"type:varchar(64);not null" json:"-"`
	// Purpose scopes the code. It prevents a code issued for one flow from
	// being replayed against another endpoint in the future.
	Purpose string `gorm:"type:varchar(32);not null;default:'password_reset'" json:"purpose"`
	// SessionHash holds the digest of the session token handed out after a
	// successful code verification.
	//
	// The flow is: the code proves the mailbox is yours, the session token
	// then authorises the password change. Keeping them separate means the
	// low entropy code is spent exactly once, at the verification step, and
	// the final write is authorised by a high entropy secret instead.
	SessionHash string `gorm:"type:varchar(64);not null;default:''" json:"-"`
	// Attempts counts the failed verification tries for this code. The service
	// invalidates the code once the budget is exhausted, so guessing a
	// six digit code cannot succeed by brute force.
	Attempts int `gorm:"not null;default:0" json:"attempts"`
	// MaxAttempts is the failure budget captured when the code was issued.
	MaxAttempts int `gorm:"not null;default:5" json:"maxAttempts"`
	// RequestIP is the peer address that asked for the code. It feeds the
	// per-IP rate limit and the audit trail.
	RequestIP string `gorm:"type:varchar(64);not null;default:''" json:"requestIp"`
	// ExpiresAt is when the code stops working.
	ExpiresAt time.Time `gorm:"type:timestamptz;not null;index:idx_reset_expires" json:"expiresAt"`
	// UsedAt is set once the code has been redeemed. A non-null value means
	// the code is spent and cannot be used again.
	UsedAt *time.Time `gorm:"type:timestamptz" json:"usedAt"`
	// ConsumedAt is set when the code is invalidated without being used,
	// for example because a newer code was issued or the attempt budget ran
	// out. It is separate from UsedAt so the audit trail can tell "this code
	// worked" from "this code was thrown away".
	ConsumedAt *time.Time `gorm:"type:timestamptz" json:"consumedAt"`
	CreatedAt  time.Time  `gorm:"type:timestamptz;not null;index:idx_reset_user_created,priority:2" json:"createdAt"`
}

func (PasswordResetToken) TableName() string { return "password_reset_tokens" }

// IsUsable reports whether the code may still be redeemed at time now.
func (t PasswordResetToken) IsUsable(now time.Time) bool {
	return t.UsedAt == nil && t.ConsumedAt == nil && now.Before(t.ExpiresAt)
}
