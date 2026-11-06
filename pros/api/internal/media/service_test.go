package media

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"metamatrix/api/internal/model"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func testService(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&model.MediaCategory{}, &model.MediaAsset{}, &model.MediaReference{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_asset (user_id, sha256)`).Error; err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	svc := &Service{
		Store:   NewGormStore(db),
		Root:    root,
		Secret:  "test-sign-secret",
		Now:     func() time.Time { return time.Unix(1_700_000_000, 0) },
		SyncNow: true,
	}
	return svc, uuid.New(), uuid.New()
}

func shaOf(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func countFiles(t *testing.T, root string) int {
	t.Helper()
	n := 0
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.Mode().IsRegular() {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil || rel == "tmp" || strings.HasPrefix(rel, "tmp"+string(os.PathSeparator)) {
			return nil
		}
		n++
		return nil
	})
	return n
}

func TestDedupOneFileOneRowAndUniqueIndex(t *testing.T) {
	svc, user, _ := testService(t)
	body := []byte("same-bytes")
	ctx := context.Background()
	first, err := svc.Save(ctx, user, SaveInput{OriginalName: "a.png", MediaType: "image", Body: bytes.NewReader(body)})
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.Save(ctx, user, SaveInput{OriginalName: "b.png", MediaType: "image", Body: bytes.NewReader(body)})
	if err != nil {
		t.Fatal(err)
	}
	if first.Created != true || second.Created != false {
		t.Fatalf("created flags %v %v", first.Created, second.Created)
	}
	if first.ID != second.ID {
		t.Fatalf("ids %s %s", first.ID, second.ID)
	}
	if first.SHA256 != shaOf(body) {
		t.Fatalf("hash %s", first.SHA256)
	}
	if countFiles(t, svc.Root) != 1 {
		t.Fatalf("files = %d", countFiles(t, svc.Root))
	}
	var indexes []string
	if err := svc.Store.(*GormStore).db.Raw(`SELECT name FROM sqlite_master WHERE type = 'index'`).Scan(&indexes).Error; err != nil {
		t.Fatal(err)
	}
	found := false
	for _, name := range indexes {
		if name == "uniq_media_user_sha" {
			found = true
		}
	}
	if !found {
		t.Fatalf("unique index missing: %v", indexes)
	}
	sqlBytes, err := os.ReadFile(filepath.Join("..", "..", "migrations", "005_media.sql"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(sqlBytes)
	for _, table := range []string{"media_category", "media_asset", "media_reference"} {
		if !strings.Contains(text, "CREATE TABLE IF NOT EXISTS "+table) || !strings.Contains(text, "user_id UUID NOT NULL") {
			t.Fatalf("migration missing user_id for %s", table)
		}
	}
	if !strings.Contains(text, "CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_user_sha ON media_asset (user_id, sha256)") {
		t.Fatal("migration missing unique (user_id, sha256)")
	}
}

func TestUserIsolation(t *testing.T) {
	svc, a, b := testService(t)
	body := []byte("shared-looking")
	ctx := context.Background()
	saved, err := svc.Save(ctx, a, SaveInput{OriginalName: "a.txt", Body: bytes.NewReader(body)})
	if err != nil {
		t.Fatal(err)
	}
	before, err := svc.Check(ctx, b, CheckInput{SHA256: saved.SHA256})
	if err != nil {
		t.Fatal(err)
	}
	if before.Exists {
		t.Fatal("check leaked the other user's hash")
	}
	other, err := svc.Save(ctx, b, SaveInput{OriginalName: "b.txt", Body: bytes.NewReader(body)})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == other.ID {
		t.Fatal("users share one row")
	}
	if _, err := svc.Get(ctx, b, uuid.MustParse(saved.ID)); err != ErrNotFound {
		t.Fatalf("other user get: %v", err)
	}
	own, err := svc.Check(ctx, b, CheckInput{SHA256: saved.SHA256})
	if err != nil {
		t.Fatal(err)
	}
	if !own.Exists || own.ID != other.ID {
		t.Fatalf("user b should see only their own copy: %+v", own)
	}
	if countFiles(t, svc.Root) != 2 {
		t.Fatalf("files = %d", countFiles(t, svc.Root))
	}
}

func TestSignatureOwnershipAndRange(t *testing.T) {
	svc, user, other := testService(t)
	ctx := context.Background()
	saved, err := svc.Save(ctx, user, SaveInput{OriginalName: "clip.mp3", MediaType: "audio", Body: bytes.NewReader([]byte("0123456789"))})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(saved)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte(svc.Root)) || bytes.Contains(raw, []byte("storagePath")) || bytes.Contains(raw, []byte("storage_path")) {
		t.Fatalf("response leaked storage: %s", raw)
	}
	if saved.InsertedPath != "/media/"+saved.ID {
		t.Fatalf("inserted path %s", saved.InsertedPath)
	}
	if strings.Contains(saved.PreviewURL, svc.Root) {
		t.Fatal("preview contains disk path")
	}
	id := uuid.MustParse(saved.ID)
	if _, err := svc.Open(ctx, user, id, "", "", ""); err != ErrSignature {
		t.Fatalf("missing sig: %v", err)
	}
	exp := strconv.FormatInt(svc.now().Add(-time.Hour).Unix(), 10)
	old := Sign(svc.Secret, user.String(), saved.ID, svc.now().Add(-time.Hour).Unix())
	if _, err := svc.Open(ctx, user, id, exp, old, ""); err != ErrSignature {
		t.Fatalf("expired: %v", err)
	}
	nginx := nginxMD5(exp, saved.InsertedPath, svc.Secret)
	if _, err := svc.Open(ctx, user, id, strconv.FormatInt(svc.now().Add(time.Minute).Unix(), 10), nginx, ""); err != ErrSignature {
		t.Fatal("nginx secure_link md5 was accepted")
	}
	preview := saved.PreviewURL
	q := preview[strings.Index(preview, "?")+1:]
	vals := map[string]string{}
	for _, part := range strings.Split(q, "&") {
		kv := strings.SplitN(part, "=", 2)
		vals[kv[0]] = kv[1]
	}
	got, err := svc.Open(ctx, user, id, vals["exp"], vals["sig"], "bytes=2-5")
	if err != nil {
		t.Fatal(err)
	}
	defer got.Body.Close()
	if !got.Partial {
		t.Fatal("expected partial")
	}
	buf, _ := io.ReadAll(got.Body)
	if string(buf) != "2345" {
		t.Fatalf("range body %q", buf)
	}
	if _, err := svc.Open(ctx, other, id, vals["exp"], vals["sig"], ""); err != ErrSignature {
		t.Fatalf("other user replayed signature: %v", err)
	}
}

func TestReferencedDeleteAndCategory(t *testing.T) {
	svc, user, _ := testService(t)
	ctx := context.Background()
	saved, err := svc.Save(ctx, user, SaveInput{OriginalName: "doc.pdf", Body: bytes.NewReader([]byte("pdf"))})
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.MustParse(saved.ID)
	ref, err := svc.AddReference(ctx, user, id, RefInput{RefType: "document", RefID: "doc-1"})
	if err != nil {
		t.Fatal(err)
	}
	if ref.InsertedPath != "/media/"+saved.ID || strings.Contains(ref.InsertedPath, svc.Root) {
		t.Fatalf("ref path %s", ref.InsertedPath)
	}
	if err := svc.Delete(ctx, user, id); err != ErrReferenced {
		t.Fatalf("delete referenced: %v", err)
	}
	if countFiles(t, svc.Root) != 1 {
		t.Fatal("file removed while referenced")
	}
	if err := svc.DeleteReference(ctx, user, id, ref.ID); err != nil {
		t.Fatal(err)
	}
	cat, err := svc.CreateCategory(ctx, user, "图", nil, 1)
	if err != nil {
		t.Fatal(err)
	}
	child, err := svc.CreateCategory(ctx, user, "子", &cat.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteCategory(ctx, user, cat.ID); err != ErrCategoryNotEmpty {
		t.Fatalf("delete parent: %v", err)
	}
	if err := svc.DeleteCategory(ctx, user, child.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.Delete(ctx, user, id); err != nil {
		t.Fatal(err)
	}
	if countFiles(t, svc.Root) != 0 {
		t.Fatal("file left after unreferenced delete")
	}
}

func TestFeishuNotConfiguredAndFakeShape(t *testing.T) {
	svc, user, _ := testService(t)
	ctx := context.Background()
	saved, err := svc.Save(ctx, user, SaveInput{OriginalName: "pic.png", MediaType: "image", Body: bytes.NewReader([]byte("img"))})
	if err != nil {
		t.Fatal(err)
	}
	if saved.FeishuSyncStatus != FeishuStatusNotConfigured || saved.FeishuMediaToken != "" {
		t.Fatalf("status %s token %s", saved.FeishuSyncStatus, saved.FeishuMediaToken)
	}
	if err := svc.SyncFeishu(ctx, user, uuid.MustParse(saved.ID)); err != nil {
		t.Fatal(err)
	}
	again, err := svc.Get(ctx, user, uuid.MustParse(saved.ID))
	if err != nil {
		t.Fatal(err)
	}
	if again.FeishuSyncStatus != FeishuStatusNotConfigured {
		t.Fatalf("compensation status %s", again.FeishuSyncStatus)
	}

	image := PlanFeishu("image", FeishuUploadAllMax, FeishuCreds{AppID: "a", AppSecret: "b", BlockID: "blk"})
	if image.Mode != "upload_all" || image.ParentType != ParentDocxImage || image.ParentNode != "blk" {
		t.Fatalf("image plan %+v", image)
	}
	audio := PlanFeishu("audio", FeishuUploadAllMax+1, FeishuCreds{AppID: "a", AppSecret: "b", BlockID: "blk"})
	if audio.Mode != "multipart" || audio.ParentType != ParentDocxFile {
		t.Fatalf("audio plan %+v", audio)
	}
	video := PlanFeishu("video", 10, FeishuCreds{AppID: "a", AppSecret: "b", BlockID: "blk"})
	if video.ParentType != ParentDocxFile || video.Mode != "upload_all" {
		t.Fatalf("video plan %+v", video)
	}

	var hits []string
	var mu sync.Mutex
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits = append(hits, r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "tenant_access_token"):
			_, _ = w.Write([]byte(`{"code":0,"tenant_access_token":"t"}`))
		case strings.HasSuffix(r.URL.Path, "/upload_all"):
			_, _ = w.Write([]byte(`{"code":0,"data":{"file_token":"tok-all"}}`))
		default:
			http.Error(w, `{"code":1}`, http.StatusInternalServerError)
		}
	}))
	defer fake.Close()
	svc.Feishu = FeishuCreds{AppID: "a", AppSecret: "b", BlockID: "blk", BaseURL: fake.URL}
	if err := svc.SyncFeishu(ctx, user, uuid.MustParse(saved.ID)); err != nil {
		t.Fatal(err)
	}
	synced, err := svc.Get(ctx, user, uuid.MustParse(saved.ID))
	if err != nil {
		t.Fatal(err)
	}
	if synced.FeishuMediaToken != "tok-all" || synced.FeishuSyncStatus != FeishuStatusSynced {
		t.Fatalf("synced %+v", synced)
	}
	if !strings.Contains(strings.Join(hits, ","), "/open-apis/drive/v1/medias/upload_all") {
		t.Fatalf("fake hits %v", hits)
	}

	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusBadGateway)
	}))
	defer bad.Close()
	svc.Feishu.BaseURL = bad.URL
	if err := svc.SyncFeishu(ctx, user, uuid.MustParse(saved.ID)); err == nil {
		t.Fatal("expected fake failure")
	}
	failed, err := svc.Get(ctx, user, uuid.MustParse(saved.ID))
	if err != nil {
		t.Fatal(err)
	}
	if failed.FeishuSyncStatus != FeishuStatusFailed {
		t.Fatalf("failed status %s", failed.FeishuSyncStatus)
	}
	if countFiles(t, svc.Root) != 1 {
		t.Fatal("local file rolled back after feishu failure")
	}
}

func TestConcurrentInsertKeepsOneRow(t *testing.T) {
	svc, user, _ := testService(t)
	body := bytes.Repeat([]byte("x"), 128)
	var wg sync.WaitGroup
	ids := make(chan string, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			view, err := svc.Save(context.Background(), user, SaveInput{OriginalName: "x.bin", Body: bytes.NewReader(body)})
			if err != nil {
				t.Errorf("save: %v", err)
				return
			}
			ids <- view.ID
		}()
	}
	wg.Wait()
	close(ids)
	var first string
	for id := range ids {
		if first == "" {
			first = id
		}
		if id != first {
			t.Fatalf("ids diverged %s %s", first, id)
		}
	}
	if countFiles(t, svc.Root) != 1 {
		t.Fatalf("files = %d", countFiles(t, svc.Root))
	}
}

func nginxMD5(exp, uri, secret string) string {
	sum := md5.Sum([]byte(exp + uri + secret))
	return hex.EncodeToString(sum[:])
}
