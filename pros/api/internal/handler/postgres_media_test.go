package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"metamatrix/api/internal/media"
	"metamatrix/api/internal/middleware"

	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/cloudwego/hertz/pkg/route"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const pgSecret = "postgres-media-acceptance"

func TestPostgresMediaMigrationAndAPI(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("MEDIA_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("MEDIA_TEST_DATABASE_URL is not set; this test refuses to use SQLite")
	}
	if !strings.Contains(dsn, "media_test") {
		t.Fatalf("refusing to run against a database URL that does not contain media_test: %s", dsn)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err := db.Exec(`DROP TABLE IF EXISTS media_reference, media_asset, media_category CASCADE`).Error; err != nil {
		t.Fatal(err)
	}
	sqlText, err := os.ReadFile(filepath.Join("..", "..", "migrations", "005_media.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range strings.Split(string(sqlText), ";") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("migration statement failed: %v\n%s", err, stmt)
		}
	}

	t.Run("schema", func(t *testing.T) {
		type col struct {
			TableName  string
			IsNullable string
			DataType   string
		}
		var cols []col
		err := db.Raw(`
			SELECT table_name, is_nullable, data_type
			FROM information_schema.columns
			WHERE table_schema = 'public' AND column_name = 'user_id'
			  AND table_name IN ('media_category', 'media_asset', 'media_reference')
			ORDER BY table_name`).Scan(&cols).Error
		if err != nil {
			t.Fatal(err)
		}
		if len(cols) != 3 {
			t.Fatalf("user_id columns = %+v", cols)
		}
		for _, c := range cols {
			if c.IsNullable != "NO" {
				t.Fatalf("%s.user_id nullable", c.TableName)
			}
		}
		var indexdef string
		if err := db.Raw(`SELECT indexdef FROM pg_indexes WHERE indexname = 'uniq_media_user_sha'`).Scan(&indexdef).Error; err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(indexdef, "user_id") || !strings.Contains(strings.ToLower(indexdef), "sha256") {
			t.Fatalf("unique index def %q", indexdef)
		}
		var shaType string
		if err := db.Raw(`SELECT data_type FROM information_schema.columns WHERE table_name = 'media_asset' AND column_name = 'sha256'`).Scan(&shaType).Error; err != nil {
			t.Fatal(err)
		}
		if shaType != "character varying" {
			t.Fatalf("sha256 type %s, char padding would corrupt the hash", shaType)
		}
		user := uuid.New()
		sha := strings.Repeat("ab", 32)
		insert := `INSERT INTO media_asset (id, user_id, media_type, original_name, storage_path, storage_disk, mime_type, size_bytes, sha256, feishu_sync_status, status, created_at)
			VALUES (?, ?, 'file', 'a.bin', 'rel/a.bin', 'local', 'application/octet-stream', 1, ?, 'not_configured', 'ready', NOW())`
		if err := db.Exec(insert, uuid.New(), user, sha).Error; err != nil {
			t.Fatal(err)
		}
		err = db.Exec(insert, uuid.New(), user, sha).Error
		if err == nil {
			t.Fatal("postgres accepted a duplicate (user_id, sha256)")
		}
		other := uuid.New()
		if err := db.Exec(insert, uuid.New(), other, sha).Error; err != nil {
			t.Fatalf("other user should be allowed the same hash: %v", err)
		}
		if err := db.Exec(`DELETE FROM media_asset`).Error; err != nil {
			t.Fatal(err)
		}
	})

	root := t.TempDir()
	now := time.Unix(1_700_000_000, 0).UTC()
	svc := &media.Service{
		Store:  media.NewGormStore(db),
		Root:   root,
		Secret: pgSecret,
		Now:    func() time.Time { return now },
	}
	engine := newPostgresEngine(svc)
	userA := uuid.New()
	userB := uuid.New()
	tokenA := mustToken(t, userA)
	tokenB := mustToken(t, userB)
	body := []byte("postgres-dedup-bytes")

	t.Run("dedup isolation path and signature", func(t *testing.T) {
		first := decode(t, uploadFile(engine, tokenA, "note.txt", "text/plain", "file", body))
		if first.Code != http.StatusCreated {
			t.Fatalf("first upload %d %s", first.Code, first.Body)
		}
		second := decode(t, uploadFile(engine, tokenA, "other.txt", "text/plain", "file", body))
		if second.Code != http.StatusOK {
			t.Fatalf("second upload %d %s", second.Code, second.Body)
		}
		if first.JSON["id"] != second.JSON["id"] || second.JSON["created"] != false {
			t.Fatalf("dedup ids %+v %+v", first.JSON, second.JSON)
		}
		if got := first.JSON["sha256"]; got != shaHex(body) {
			t.Fatalf("sha %v", got)
		}
		inserted, _ := first.JSON["insertedPath"].(string)
		if inserted != "/media/"+first.JSON["id"].(string) || strings.Contains(first.Body, root) || strings.Contains(first.Body, "storagePath") {
			t.Fatalf("path leaked or wrong: %s", first.Body)
		}
		var rows int64
		if err := db.Raw(`SELECT COUNT(*) FROM media_asset WHERE user_id = ? AND sha256 = ?`, userA, shaHex(body)).Scan(&rows).Error; err != nil {
			t.Fatal(err)
		}
		if rows != 1 || countMediaFiles(t, root) != 1 {
			t.Fatalf("rows %d files %d", rows, countMediaFiles(t, root))
		}
		var storagePath string
		if err := db.Raw(`SELECT storage_path FROM media_asset WHERE id = ?`, first.JSON["id"]).Scan(&storagePath).Error; err != nil {
			t.Fatal(err)
		}
		if filepath.IsAbs(storagePath) || strings.Contains(storagePath, root) {
			t.Fatalf("stored path is absolute: %s", storagePath)
		}

		other := decode(t, uploadFile(engine, tokenB, "note.txt", "text/plain", "file", body))
		if other.Code != http.StatusCreated || other.JSON["id"] == first.JSON["id"] {
			t.Fatalf("isolation %+v", other.JSON)
		}
		stolen := ut.PerformRequest(engine, http.MethodGet, "/media/"+first.JSON["id"].(string), nil, bearer(tokenB))
		if stolen.Code != http.StatusNotFound {
			t.Fatalf("other user metadata %d %s", stolen.Code, stolen.Body.String())
		}

		preview, _ := first.JSON["previewUrl"].(string)
		ranged := ut.PerformRequest(engine, http.MethodGet, preview, nil, bearer(tokenA), ut.Header{Key: "Range", Value: "bytes=0-3"})
		if ranged.Code != http.StatusPartialContent || string(ranged.Body.Bytes()) != string(body[:4]) {
			t.Fatalf("range %d %q", ranged.Code, ranged.Body.Bytes())
		}
		now = now.Add(2 * time.Hour)
		expired := ut.PerformRequest(engine, http.MethodGet, preview, nil, bearer(tokenA))
		if expired.Code != http.StatusForbidden {
			t.Fatalf("expired signature %d %s", expired.Code, expired.Body.String())
		}
		replay := ut.PerformRequest(engine, http.MethodGet, preview, nil, bearer(tokenB))
		if replay.Code != http.StatusForbidden {
			t.Fatalf("other user replay %d %s", replay.Code, replay.Body.String())
		}
	})

	t.Run("audio video same mechanism and reference delete", func(t *testing.T) {
		now = time.Unix(1_700_000_100, 0).UTC()
		audio := decode(t, uploadFile(engine, tokenA, "a.mp3", "audio/mpeg", "audio", []byte("audio-bytes")))
		video := decode(t, uploadFile(engine, tokenA, "a.mp4", "video/mp4", "video", []byte("video-bytes")))
		if audio.Code != http.StatusCreated || video.Code != http.StatusCreated {
			t.Fatalf("audio %d video %d", audio.Code, video.Code)
		}
		for _, id := range []string{audio.JSON["id"].(string), video.JSON["id"].(string)} {
			var rel, disk string
			if err := db.Raw(`SELECT storage_path, storage_disk FROM media_asset WHERE id = ? AND user_id = ?`, id, userA).Row().Scan(&rel, &disk); err != nil {
				t.Fatal(err)
			}
			if disk != "local" || filepath.IsAbs(rel) || !strings.Contains(rel, userA.String()+"/") {
				t.Fatalf("storage %s %s", disk, rel)
			}
		}
		id := audio.JSON["id"].(string)
		ref := decode(t, mediaPost(engine, tokenA, "/media/"+id+"/references", `{"refType":"document","refId":"doc-pg","userId":"`+userB.String()+`","insertedPath":"/var/secret/a.mp3"}`))
		if ref.Code != http.StatusCreated {
			t.Fatalf("reference %d %s", ref.Code, ref.Body)
		}
		if ref.JSON["insertedPath"] != "/media/"+id || ref.JSON["userId"] != userA.String() {
			t.Fatalf("reference ignored client identity or path: %s", ref.Body)
		}
		del := ut.PerformRequest(engine, http.MethodDelete, "/media/"+id, nil, bearer(tokenA))
		if del.Code != http.StatusConflict {
			t.Fatalf("delete referenced %d %s", del.Code, del.Body.String())
		}
		var left int64
		if err := db.Raw(`SELECT COUNT(*) FROM media_asset WHERE id = ?`, id).Scan(&left).Error; err != nil {
			t.Fatal(err)
		}
		if left != 1 {
			t.Fatal("referenced asset was deleted")
		}
		syncRec := mediaPost(engine, tokenA, "/media/"+id+"/feishu/sync", `{}`)
		if syncRec.Code != http.StatusOK || !strings.Contains(syncRec.Body.String(), `"feishuSyncStatus":"not_configured"`) {
			t.Fatalf("compensation %d %s", syncRec.Code, syncRec.Body.String())
		}
	})

	t.Run("chunk resume above 20MB", func(t *testing.T) {
		now = time.Unix(1_700_000_200, 0).UTC()
		const part = 4 * 1024 * 1024
		payload := bytes.Repeat([]byte{0x5a}, 20*1024*1024+1)
		prepared := decode(t, mediaPost(engine, tokenA, "/media/upload/chunk/prepare",
			`{"originalName":"big.bin","mediaType":"file","sizeBytes":`+strconv.Itoa(len(payload))+`,"partSize":`+strconv.Itoa(part)+`,"userId":"`+userB.String()+`"}`))
		if prepared.Code != http.StatusCreated {
			t.Fatalf("prepare %d %s", prepared.Code, prepared.Body)
		}
		uploadID, _ := prepared.JSON["uploadId"].(string)
		if uploadID == "" {
			t.Fatal("no upload id")
		}
		count := len(payload) / part
		if len(payload)%part != 0 {
			count++
		}
		for i := 0; i < count; i++ {
			if i == 1 {
				continue
			}
			end := (i + 1) * part
			if end > len(payload) {
				end = len(payload)
			}
			rec := ut.PerformRequest(engine, http.MethodPost, "/media/upload/chunk/"+uploadID+"/part?index="+strconv.Itoa(i),
				&ut.Body{Body: bytes.NewReader(payload[i*part : end]), Len: end - i*part}, bearer(tokenA))
			if rec.Code != http.StatusOK {
				t.Fatalf("part %d -> %d %s", i, rec.Code, rec.Body.String())
			}
		}
		early := mediaPost(engine, tokenA, "/media/upload/chunk/"+uploadID+"/finish", `{}`)
		if early.Code != http.StatusConflict {
			t.Fatalf("finish with hole %d %s", early.Code, early.Body.String())
		}
		status := decode(t, ut.PerformRequest(engine, http.MethodGet, "/media/upload/chunk/"+uploadID, nil, bearer(tokenA)))
		missing, _ := status.JSON["missing"].([]interface{})
		if status.Code != http.StatusOK || len(missing) != 1 || int(missing[0].(float64)) != 1 {
			t.Fatalf("status %d %s", status.Code, status.Body)
		}
		otherStatus := ut.PerformRequest(engine, http.MethodGet, "/media/upload/chunk/"+uploadID, nil, bearer(tokenB))
		if otherStatus.Code != http.StatusNotFound {
			t.Fatalf("other user chunk status %d", otherStatus.Code)
		}
		holeEnd := 2 * part
		resumed := ut.PerformRequest(engine, http.MethodPost, "/media/upload/chunk/"+uploadID+"/part?index=1",
			&ut.Body{Body: bytes.NewReader(payload[part:holeEnd]), Len: holeEnd - part}, bearer(tokenA))
		if resumed.Code != http.StatusOK {
			t.Fatalf("resume %d %s", resumed.Code, resumed.Body.String())
		}
		done := decode(t, mediaPost(engine, tokenA, "/media/upload/chunk/"+uploadID+"/finish", `{}`))
		if done.Code != http.StatusCreated {
			t.Fatalf("finish %d %s", done.Code, done.Body)
		}
		if done.JSON["sha256"] != shaHex(payload) || done.JSON["insertedPath"] != "/media/"+done.JSON["id"].(string) {
			t.Fatalf("chunk result %s", done.Body)
		}
		if strings.Contains(done.Body, root) {
			t.Fatal("chunk response leaked storage root")
		}
	})
}

func newPostgresEngine(svc *media.Service) *route.Engine {
	engine := route.NewEngine(config.NewOptions(nil))
	h := NewMediaHandler(svc)
	g := engine.Group("/media", middleware.AuthRequired(pgSecret))
	g.POST("/check", h.Check)
	g.POST("/upload", h.Upload)
	g.POST("/upload/chunk/prepare", h.PrepareChunk)
	g.GET("/upload/chunk/:id", h.ChunkStatus)
	g.POST("/upload/chunk/:id/part", h.PutChunk)
	g.POST("/upload/chunk/:id/finish", h.FinishChunk)
	g.GET("/:id", h.Get)
	g.DELETE("/:id", h.Delete)
	g.POST("/:id/references", h.AddReference)
	g.POST("/:id/feishu/sync", h.SyncFeishu)
	return engine
}

type pgResult struct {
	Code int
	Body string
	JSON map[string]interface{}
}

func decode(t *testing.T, rec *ut.ResponseRecorder) pgResult {
	t.Helper()
	out := pgResult{Code: rec.Code, Body: rec.Body.String()}
	_ = json.Unmarshal(rec.Body.Bytes(), &out.JSON)
	return out
}

func bearer(token string) ut.Header {
	return ut.Header{Key: "Authorization", Value: "Bearer " + token}
}

func mustToken(t *testing.T, user uuid.UUID) string {
	t.Helper()
	token, err := middleware.SignToken(pgSecret, user, "pg@metamatrix.local", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func uploadFile(engine *route.Engine, token, name, mimeType, mediaType string, payload []byte) *ut.ResponseRecorder {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("mediaType", mediaType)
	_ = w.WriteField("userId", uuid.NewString())
	hdr := textproto.MIMEHeader{}
	hdr.Set("Content-Disposition", `form-data; name="file"; filename="`+name+`"`)
	hdr.Set("Content-Type", mimeType)
	part, _ := w.CreatePart(hdr)
	_, _ = part.Write(payload)
	_ = w.Close()
	raw := buf.Bytes()
	return ut.PerformRequest(engine, http.MethodPost, "/media/upload",
		&ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		bearer(token),
		ut.Header{Key: "Content-Type", Value: w.FormDataContentType()},
	)
}

func mediaPost(engine *route.Engine, token, path, body string) *ut.ResponseRecorder {
	raw := []byte(body)
	return ut.PerformRequest(engine, http.MethodPost, path,
		&ut.Body{Body: bytes.NewReader(raw), Len: len(raw)},
		bearer(token),
		ut.Header{Key: "Content-Type", Value: "application/json"},
	)
}

func shaHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func countMediaFiles(t *testing.T, root string) int {
	t.Helper()
	n := 0
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || !info.Mode().IsRegular() {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil || strings.HasPrefix(rel, "tmp") || strings.HasPrefix(rel, "uploads") {
			return nil
		}
		n++
		return nil
	})
	return n
}
