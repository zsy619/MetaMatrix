package middleware

import "testing"

func TestObserveStatusBuckets(t *testing.T) {
	before := Snapshot()
	ObserveStatus(204)
	ObserveStatus(401)
	ObserveStatus(503)
	ObserveStatus(0)
	after := Snapshot()
	if after.Requests.Total != before.Requests.Total+4 {
		t.Fatalf("total %d -> %d", before.Requests.Total, after.Requests.Total)
	}
	if after.Requests.S2xx != before.Requests.S2xx+2 {
		t.Fatalf("2xx %d -> %d", before.Requests.S2xx, after.Requests.S2xx)
	}
	if after.Requests.S4xx != before.Requests.S4xx+1 || after.Requests.S5xx != before.Requests.S5xx+1 {
		t.Fatalf("classes 4xx/5xx = %d/%d", after.Requests.S4xx, after.Requests.S5xx)
	}
	text := PrometheusText()
	if text == "" || len(text) < 40 {
		t.Fatal("empty metrics")
	}
}
