package mail

import (
	"log"
	"os"
	"strings"
)

// ResolveMode decides which transport to use.
//
// The rules are:
//
//	MAIL_MODE=smtp   always use SMTP. A missing configuration is a startup
//	                  error, never a silent fallback.
//	MAIL_MODE=log    always use the log transport, regardless of the SMTP
//	                  settings. This is the local development switch.
//	MAIL_MODE=auto   (default) use SMTP when the configuration is complete;
//	                  otherwise use the log transport in development and the
//	                  disabled transport in production.
//
// The auto rule matters: a developer machine without mail credentials must
// still be able to exercise the whole reset flow (the code lands in the log),
// while a production server without credentials must fail loudly instead of
// answering "sent" for a mail that never goes out.
const (
	// ModeSMTP forces the SMTP transport.
	ModeSMTP = "smtp"
	// ModeLog forces the log transport.
	ModeLog = "log"
	// ModeAuto picks based on the configuration and the environment.
	ModeAuto = "auto"
)

// Environment names that mark a production deployment.
var productionEnvNames = map[string]bool{
	"production": true,
	"prod":       true,
}

// IsProduction reports whether the process runs in production.
//
// The APP_ENV variable is the switch. An empty value means development,
// because a missing environment marker must not silently disable the
// development conveniences on a production box.
func IsProduction() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return productionEnvNames[env]
}

// ResolveSender builds the transport for the given configuration.
//
// It returns the sender and a description of the choice. The description is
// logged at startup so an operator can confirm which path is live.
func ResolveSender(cfg Config) (Sender, string) {
	mode := strings.ToLower(strings.TrimSpace(cfg.Mode))
	if mode == "" {
		mode = ModeAuto
	}

	switch mode {
	case ModeLog:
		log.Printf("[mail] MAIL_MODE=log — reset codes are written to the log instead of being sent")
		return &LogSender{}, "log"

	case ModeSMTP:
		if !cfg.Configured() {
			// The operator explicitly asked for SMTP. Falling back would
			// hide the misconfiguration, so the process must fail.
			log.Fatalf("[mail] MAIL_MODE=smtp but the SMTP settings are incomplete (need SMTP_HOST, SMTP_PORT, SMTP_FROM)")
		}
		s := &SMTPSender{Cfg: cfg}
		return s, s.Describe()

	default: // ModeAuto
		if cfg.Configured() {
			s := &SMTPSender{Cfg: cfg}
			log.Printf("[mail] using SMTP transport (%s)", s.Describe())
			return s, s.Describe()
		}
		if IsProduction() {
			// Production without credentials: refuse to send. The reset
			// endpoint answers with an explicit error, so the user learns
			// that no mail went out instead of waiting forever.
			log.Printf("[mail] no SMTP configuration and APP_ENV=production — outbound mail is disabled")
			return DisabledSender{}, "disabled"
		}
		log.Printf("[mail] no SMTP configuration and not production — reset codes are written to the log")
		return &LogSender{}, "log"
	}
}
