package service

import (
	"encoding/json"
	"strings"
	"testing"

	"metamatrix/api/internal/model"

	"github.com/google/uuid"
)

func TestParseDirectoryLimit(t *testing.T) {
	cases := map[string]int{
		"":     DirectoryDefaultLimit,
		"  ":   DirectoryDefaultLimit,
		"abc":  DirectoryDefaultLimit,
		"-5":   DirectoryDefaultLimit,
		"1.5":  DirectoryDefaultLimit,
		"10":   10,
		"200":  200,
		"201":  DirectoryMaxLimit,
		"5000": DirectoryMaxLimit,
	}
	for raw, want := range cases {
		if got := ParseDirectoryLimit(raw); got != want {
			t.Fatalf("ParseDirectoryLimit(%q) = %d, want %d", raw, got, want)
		}
	}
}

func TestParseDirectoryOffset(t *testing.T) {
	cases := map[string]int{
		"":    0,
		"abc": 0,
		"-1":  0,
		"0":   0,
		"7":   7,
		"120": 120,
	}
	for raw, want := range cases {
		if got := ParseDirectoryOffset(raw); got != want {
			t.Fatalf("ParseDirectoryOffset(%q) = %d, want %d", raw, got, want)
		}
	}
}

func TestDirectoryUserFromModelPrefersDisplayName(t *testing.T) {
	u := &model.User{
		ID:           uuid.New(),
		Email:        "alice@metamatrix.local",
		DisplayName:  "爱丽丝",
		PasswordHash: "$2a$10$superhash",
	}
	dto := DirectoryUserFromModel(u)
	if dto.ID != u.ID.String() {
		t.Fatalf("id = %q, want %q", dto.ID, u.ID.String())
	}
	if dto.Name != "爱丽丝" {
		t.Fatalf("name = %q, want 爱丽丝", dto.Name)
	}
	if dto.Email != "alice@metamatrix.local" {
		t.Fatalf("email = %q", dto.Email)
	}
}

func TestDirectoryUserFromModelFallsBackToEmail(t *testing.T) {
	u := &model.User{ID: uuid.New(), Email: "bob@metamatrix.local", DisplayName: "   "}
	dto := DirectoryUserFromModel(u)
	if dto.Name != "bob@metamatrix.local" {
		t.Fatalf("name = %q, want email fallback", dto.Name)
	}
}

func TestDirectoryUserDTONeverLeaksSecrets(t *testing.T) {
	u := &model.User{
		ID:           uuid.New(),
		Email:        "carol@metamatrix.local",
		DisplayName:  "卡罗尔",
		PasswordHash: "$2a$10$reallysecret",
	}
	raw, err := json.Marshal(DirectoryUserFromModel(u))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	body := string(raw)
	for _, banned := range []string{"password", "hash", "secret", "token", "salt"} {
		if strings.Contains(strings.ToLower(body), banned) {
			t.Fatalf("response leaks %q: %s", banned, body)
		}
	}
}

func TestBuildDirectoryFilter(t *testing.T) {
	where, args := buildDirectoryFilter("")
	if where != "" || args != nil {
		t.Fatalf("empty query should not filter, got %q %v", where, args)
	}

	where, args = buildDirectoryFilter("  Alice  ")
	if !strings.Contains(strings.ToUpper(where), "ILIKE") {
		t.Fatalf("filter should be case-insensitive, got %q", where)
	}
	if len(args) != 2 {
		t.Fatalf("args = %v, want 2 placeholders", args)
	}
	for _, a := range args {
		if a != "%Alice%" {
			t.Fatalf("arg = %v, want %%Alice%%", a)
		}
	}

	_, args = buildDirectoryFilter("50%_x")
	if args[0] != "%50\\%\\_x%" {
		t.Fatalf("wildcards not escaped: %v", args[0])
	}
}

func TestNormalizeDirectoryQuery(t *testing.T) {
	if got := NormalizeDirectoryQuery("  bob  "); got != "bob" {
		t.Fatalf("got %q, want bob", got)
	}
	if got := NormalizeDirectoryQuery("   "); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestDirectoryUserFromModelOrgFields(t *testing.T) {
	u := &model.User{ID: uuid.New(), Email: "a@x.com", DisplayName: "A", Department: " 研发 ", Role: "工程师", AvatarURL: "https://x/a.png"}
	got := DirectoryUserFromModel(u)
	if got.Department != "研发" || got.Role != "工程师" || got.AvatarURL != "https://x/a.png" {
		t.Fatalf("org fields not mapped: %+v", got)
	}
}
