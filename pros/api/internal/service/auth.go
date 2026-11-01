package service

import (
	"errors"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrEmailTaken      = errors.New("email already registered")
	ErrInvalidCreds    = errors.New("invalid email or password")
	ErrUserNotFound    = errors.New("user not found")
	ErrWeakPassword    = errors.New("password must be at least 6 characters")
	ErrPasswordTooLong = errors.New("password exceeds 72 bytes")
	ErrInvalidEmail    = errors.New("invalid email")
)

// dummyPasswordHash keeps the missing-user login path on the same bcrypt cost
// as a real password check, so failure timing does not reveal whether the email exists.
var dummyPasswordHash []byte

func init() {
	hash, err := bcrypt.GenerateFromPassword([]byte("metamatrix-timing-pad"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	dummyPasswordHash = hash
}

type AuthService struct {
	db        *gorm.DB
	jwtSecret string
}

func NewAuthService(db *gorm.DB, jwtSecret string) *AuthService {
	return &AuthService{db: db, jwtSecret: jwtSecret}
}

type UserDTO struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

func toUserDTO(u *model.User) UserDTO {
	return UserDTO{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		CreatedAt:   u.CreatedAt,
	}
}

func (s *AuthService) Register(email, password, displayName string) (*model.User, string, error) {
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return nil, "", err
	}
	if err := ValidatePassword(password); err != nil {
		return nil, "", err
	}
	var count int64
	if err := s.db.Model(&model.User{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return nil, "", err
	}
	if count > 0 {
		return nil, "", ErrEmailTaken
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}
	now := time.Now().UTC()
	u := &model.User{
		ID:           uuid.New(),
		Email:        email,
		DisplayName:  NormalizeDisplayName(displayName, email),
		PasswordHash: string(hash),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.db.Create(u).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, "", ErrEmailTaken
		}
		return nil, "", err
	}
	token, err := middleware.SignToken(s.jwtSecret, u.ID, u.Email, 7*24*time.Hour)
	if err != nil {
		return nil, "", err
	}
	return u, token, nil
}

func (s *AuthService) Login(email, password string) (*model.User, string, error) {
	email = NormalizeEmail(email)
	var u model.User
	if err := s.db.Where("email = ?", email).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(password))
			return nil, "", ErrInvalidCreds
		}
		return nil, "", err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, "", ErrInvalidCreds
	}
	token, err := middleware.SignToken(s.jwtSecret, u.ID, u.Email, 7*24*time.Hour)
	if err != nil {
		return nil, "", err
	}
	return &u, token, nil
}

func (s *AuthService) Me(userID uuid.UUID) (*model.User, error) {
	var u model.User
	if err := s.db.First(&u, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func UserPublic(u *model.User) UserDTO { return toUserDTO(u) }
