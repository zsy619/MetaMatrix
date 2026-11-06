package media

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// This hits a local fake HTTP server. It checks that a plan above 20MB
// uses upload_prepare / upload_part / upload_finish. It is not a Feishu tenant.
func TestFeishuMultipartUsesPreparePartFinishOnLocalFake(t *testing.T) {
	creds := FeishuCreds{AppID: "app", AppSecret: "secret", BlockID: "block-1"}
	plan := PlanFeishu("video", FeishuUploadAllMax+1, creds)
	if plan.Mode != "multipart" || plan.ParentType != ParentDocxFile || plan.ParentNode != "block-1" {
		t.Fatalf("plan %+v", plan)
	}
	var mu sync.Mutex
	var hits []string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits = append(hits, r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "tenant_access_token"):
			_, _ = io.WriteString(w, `{"code":0,"tenant_access_token":"tenant"}`)
		case strings.HasSuffix(r.URL.Path, "/upload_prepare"):
			_, _ = io.WriteString(w, `{"code":0,"data":{"upload_id":"up-local"}}`)
		case strings.HasSuffix(r.URL.Path, "/upload_part"):
			_, _ = io.WriteString(w, `{"code":0}`)
		case strings.HasSuffix(r.URL.Path, "/upload_finish"):
			_, _ = io.WriteString(w, `{"code":0,"data":{"file_token":"tok-part"}}`)
		default:
			http.Error(w, `{"code":1}`, http.StatusNotFound)
		}
	}))
	defer fake.Close()
	creds.BaseURL = fake.URL
	token, err := (FeishuClient{Creds: creds}).Upload(context.Background(), plan, "clip.mp4", "video/mp4", []byte("tiny-body-stands-in-for-the-part-loop"))
	if err != nil {
		t.Fatal(err)
	}
	if token != "tok-part" {
		t.Fatalf("token %s", token)
	}
	joined := strings.Join(hits, ",")
	for _, want := range []string{"/upload_prepare", "/upload_part", "/upload_finish"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %s in %s", want, joined)
		}
	}
	if strings.Contains(joined, "/upload_all") {
		t.Fatalf("multipart plan called upload_all: %s", joined)
	}
}
