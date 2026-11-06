package handler

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/media"
	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func newMediaEngine(t *testing.T) (*route.Engine, *media.Service, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.MediaCategory{}, &model.MediaAsset{}, &model.MediaReference{}); err != nil {
		t.Fatal(err)
	}
	_ = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_asset (user_id, sha256)`).Error
	svc := &media.Service{
		Store:   media.NewGormStore(db),
		Root:    t.TempDir(),
		Secret:  "media-sign-test",
		Now:     func() time.Time { return time.Unix(1_700_000_000, 0) },
		SyncNow: true,
	}
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewMediaHandler(svc)
	g := engine.Group("/media", middleware.AuthRequired(directorySecret))
	g.POST("/check", h.Check)
	g.POST("/upload", h.Upload)
	g.GET("/:id", h.Get)
	return engine, svc, svc.Root
}

func mediaToken(t *testing.T, user uuid.UUID) string {
	t.Helper()
	token, err := middleware.SignToken(directorySecret, user, "media@metamatrix.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestMediaCheckIgnoresBodyUserAndReadRequiresSignature(t *testing.T) {
	engine, svc, root := newMediaEngine(t)
	owner := uuid.New()
	other := uuid.New()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	_ = w.WriteField("userId", other.String())
	_ = w.WriteField("mediaType", "file")
	hdr := textproto.MIMEHeader{}
	hdr.Set("Content-Disposition", `form-data; name="file"; filename="note.txt"`)
	hdr.Set("Content-Type", "text/plain")
	part, err := w.CreatePart(hdr)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("hello-media"))
	_ = w.Close()
	raw := body.Bytes()
	rec := ut.PerformRequest(engine, http.MethodPost, "/media/upload",
		&ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, owner)},
		ut.Header{Key: "Content-Type", Value: w.FormDataContentType()},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload code %d body %s", rec.Code, rec.Body.String())
	}
	var uploaded map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &uploaded); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rec.Body.String(), root) {
		t.Fatalf("upload leaked root: %s", rec.Body.String())
	}
	id, _ := uploaded["id"].(string)
	sha, _ := uploaded["sha256"].(string)
	checkRaw, _ := json.Marshal(map[string]string{"sha256": sha, "userId": other.String()})
	check := ut.PerformRequest(engine, http.MethodPost, "/media/check",
		&ut.Body{Body: bytes.NewReader(checkRaw), Len: len(checkRaw)},
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, owner)},
		ut.Header{Key: "Content-Type", Value: "application/json"},
	)
	if check.Code != http.StatusOK || !strings.Contains(check.Body.String(), `"exists":true`) {
		t.Fatalf("check %d %s", check.Code, check.Body.String())
	}
	otherCheck := ut.PerformRequest(engine, http.MethodPost, "/media/check",
		&ut.Body{Body: bytes.NewReader(checkRaw), Len: len(checkRaw)},
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, other)},
		ut.Header{Key: "Content-Type", Value: "application/json"},
	)
	if !strings.Contains(otherCheck.Body.String(), `"exists":false`) {
		t.Fatalf("other check %s", otherCheck.Body.String())
	}
	plain := ut.PerformRequest(engine, http.MethodGet, "/media/"+id, nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, owner)},
	)
	if plain.Code != http.StatusOK || !strings.Contains(plain.Body.String(), `"/media/`+id+`"`) {
		t.Fatalf("meta %d %s", plain.Code, plain.Body.String())
	}
	noSig := ut.PerformRequest(engine, http.MethodGet, "/media/"+id+"?exp=1&sig=abcd", nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, owner)},
	)
	if noSig.Code != http.StatusForbidden {
		t.Fatalf("bad sig %d %s", noSig.Code, noSig.Body.String())
	}
	preview, _ := uploaded["previewUrl"].(string)
	ranged := ut.PerformRequest(engine, http.MethodGet, preview, nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, owner)},
		ut.Header{Key: "Range", Value: "bytes=0-4"},
	)
	if ranged.Code != http.StatusPartialContent || ranged.Body.String() != "hello" {
		t.Fatalf("range %d %q", ranged.Code, ranged.Body.String())
	}
	stolen := ut.PerformRequest(engine, http.MethodGet, preview, nil,
		ut.Header{Key: "Authorization", Value: "Bearer " + mediaToken(t, other)},
	)
	if stolen.Code != http.StatusForbidden {
		t.Fatalf("stolen %d %s", stolen.Code, stolen.Body.String())
	}
	_ = svc
}
