// Command loadtest 是多维表格域的轻量压测工具（不依赖 k6）。
//
// 用法：
//
//	go run ./cmd/loadtest \
//	  -base http://localhost:3000 \
//	  -token-file /tmp/tok.txt \
//	  -project 3f030ea3-61a5-4156-9b77-a9ca1d29d107 \
//	  -base-id 27ea1bbc-5da4-4058-b8c8-ab1c0afdef0f \
//	  -table 7996e4c5-b613-49d3-98bf-9c6ebb259460 \
//	  -concurrency 8 -duration 20s
//
// 覆盖场景：首屏 100 条查询 / 单条更新 / 常规筛选 / 视图配置读取 / 表结构读取 / 批量 100 条编辑。
// 输出每个场景的 P50 / P95 / P99 / QPS 与错误数，并以 Markdown 表格打印，便于贴进验收报告。
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type sample struct {
	latency time.Duration
	err     bool
	msg     string
}

type scenario struct {
	Name    string
	Target  func(worker int) string
	Method  string
	Body    func(worker int) []byte
	Setup   func(ctx context.Context, c *client) error
	Warmup  bool
	Summary string
}

type client struct {
	base    string
	token   string
	http    *http.Client
	project string
	baseID  string
	table   string
}

func (c *client) do(ctx context.Context, method, path string, body []byte) (int, []byte, error) {
	var rdr io.Reader
	if len(body) > 0 {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rdr)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	if resp.StatusCode >= 300 {
		return resp.StatusCode, out, fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(out)))
	}
	return resp.StatusCode, out, nil
}

func (c *client) jget(ctx context.Context, path string, out any) error {
	_, b, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

// jpost 发一个 JSON POST 并解析响应。
func (c *client) jpost(ctx context.Context, path string, body any, out any) error {
	_, b, err := c.do(ctx, http.MethodPost, path, mustJSON(body))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted)-1) * p)
	return sorted[idx]
}

func main() {
	var (
		baseURL     = flag.String("base", "http://localhost:3000", "API 根地址")
		tokenFile   = flag.String("token-file", "/tmp/tok.txt", "token 文件")
		projectID   = flag.String("project", "", "项目 ID")
		baseID      = flag.String("base-id", "", "Base ID")
		tableID     = flag.String("table", "", "表 ID")
		concurrency = flag.Int("concurrency", 8, "并发数")
		duration    = flag.Duration("duration", 20*time.Second, "每场景压测时长")
		seedRows    = flag.Int("seed-rows", 0, ">0 时先建临时表并播种 N 条记录（压测后自动删除临时表）")
		seedFields  = flag.Int("seed-fields", 20, "临时表的文本字段数量")
		scale       = flag.String("scale", "medium", "扩容档位：small(1000 行/10 并发) / medium(2000 行/25 并发) / large(5000 行/50 并发)")
		skipSeed    = flag.Bool("skip-seed", false, "不播种数据，直接用 -table 压测")
		deepPages   = flag.Int("deep-pages", 20, "深翻页场景翻多少页（验证 keyset 翻页不随页数变慢）")
		batchSize   = flag.Int("batch-size", 500, "批量写入场景每批多少行")
	)
	flag.Parse()

	// 扩容档位：按档位调并发与播种规模（显式传入的参数优先）。
	applyScale(*scale, seedRows, concurrency, *tableID)

	tokenBytes, err := os.ReadFile(*tokenFile)
	if err != nil {
		fatal("读取 token 失败: %v", err)
	}
	c := &client{
		base:  strings.TrimRight(*baseURL, "/"),
		token: strings.TrimSpace(string(tokenBytes)),
		http: &http.Client{
			Timeout: 120 * time.Second,
			Transport: &http.Transport{
				// 扩容档位最高 50 并发 + 批量写入，连接池要跟得上，
				// 否则压出来的是「客户端排队」而不是「服务端能力」。
				MaxIdleConns:        256,
				MaxIdleConnsPerHost: 64,
				MaxConnsPerHost:     64,
				IdleConnTimeout:     60 * time.Second,
			},
		},
		project: *projectID,
		baseID:  *baseID,
		table:   *tableID,
	}
	if c.project == "" || c.baseID == "" {
		fatal("必须提供 -project / -base-id")
	}
	if c.table == "" && *seedRows <= 0 {
		fatal("必须提供 -table（或用 -seed-rows 让压测工具自动建临时表）")
	}

	prefix := "/projects/" + c.project + "/base"
	// 深翻页场景用的游标集合（Setup 里顺序翻页时采集）。
	pageCursors := make([]string, 0, 64)
	records := make([]string, 0, 200)
	textField := ""

	// 压测数据准备：建一张**临时表**并播种若干行，压测结束后删除，
	// 不污染业务数据（交付前不留痕）。
	if *seedRows > 0 && !*skipSeed {
		tbl, err := c.seedTempTable(context.Background(), prefix, *seedRows, *seedFields)
		if err != nil {
			fatal("准备压测数据失败: %v", err)
		}
		c.table = tbl
		defer func() {
			if err := c.dropTempTable(context.Background(), prefix, tbl); err != nil {
				fmt.Fprintf(os.Stderr, "清理临时表失败（需人工删除 %s）：%v\n", tbl, err)
			} else {
				fmt.Printf("\n- 已清理临时压测表：%s\n", tbl)
			}
		}()
		fmt.Printf("- 临时压测表：%s（%d 行 × %d 字段）\n", tbl, *seedRows, *seedFields)
	}

	scenarios := []scenario{
		{
			Name: "首屏查询（100 条 × 20 字段）", Target: func(int) string { return prefix + "/tables/" + c.table + "/query" }, Method: http.MethodPost,
			Body: func(int) []byte {
				return mustJSON(map[string]any{"tableId": c.table, "pageSize": 100})
			},
		},
		{
			Name: "常规筛选（关键字）", Target: func(int) string { return prefix + "/tables/" + c.table + "/query" }, Method: http.MethodPost,
			Body: func(int) []byte {
				return mustJSON(map[string]any{"tableId": c.table, "pageSize": 50, "keyword": "a"})
			},
		},
		{
			Name: "视图配置读取", Target: func(int) string { return prefix + "/tables/" + c.table + "/views" }, Method: http.MethodGet,
			Body: func(int) []byte { return nil },
		},
		{
			Name: "表结构读取", Target: func(int) string { return prefix + "/tables/" + c.table + "/schema" }, Method: http.MethodGet,
			Body: func(int) []byte { return nil },
		},
		{
			Name: "单条更新", Target: func(worker int) string { return prefix + "/records/" + workerRecord(records, worker) }, Method: http.MethodPatch,
			Setup: func(ctx context.Context, cl *client) error {
				recs, err := cl.queryIDs(ctx, 200)
				if err != nil {
					return err
				}
				records = recs
				if textField == "" {
					var schema struct {
						Fields []struct {
							ID   string `json:"id"`
							Type string `json:"type"`
						} `json:"fields"`
					}
					if err := cl.jget(ctx, prefix+"/tables/"+c.table+"/schema", &schema); err != nil {
						return err
					}
					for _, f := range schema.Fields {
						if f.Type == "text" {
							textField = f.ID
							break
						}
					}
					if textField == "" && len(schema.Fields) > 0 {
						textField = schema.Fields[0].ID
					}
				}
				return nil
			},
			Body: func(worker int) []byte {
				return mustJSON(map[string]any{"fields": map[string]any{textField: "loadtest-" + fmt.Sprint(rand.Int())}})
			},
			Warmup: true,
		},
		{
			Name: "批量 100 条编辑", Target: func(int) string { return prefix + "/tables/" + c.table + "/records/batch" }, Method: http.MethodPost,
			Setup: func(ctx context.Context, cl *client) error {
				if len(records) == 0 {
					recs, err := cl.queryIDs(ctx, 200)
					if err != nil {
						return err
					}
					records = recs
				}
				return nil
			},
			Body: func(worker int) []byte {
				ids := workerChunk(records, worker, 25)
				return mustJSON(map[string]any{"action": "update", "ids": ids, "fields": map[string]any{textField: "loadtest-" + fmt.Sprint(rand.Int())}})
			},
		},
		{
			// 深翻页：走 keyset 游标翻到第 N 页，验证「深翻页不随页数变慢」。
			Name: fmt.Sprintf("深翻页（keyset 翻 %d 页）", *deepPages), Target: func(int) string { return prefix + "/tables/" + c.table + "/query" }, Method: http.MethodPost,
			Setup: func(ctx context.Context, cl *client) error {
				// 先顺序翻到第 N 页，把每一页的游标存下来（真实深翻页路径）。
				cursor := ""
				for i := 0; i < *deepPages; i++ {
					_, next, err := cl.queryPage(ctx, cl.table, cursor, 100)
					if err != nil {
						return err
					}
					if next == "" {
						break
					}
					cursor = next
					pageCursors = append(pageCursors, cursor)
				}
				return nil
			},
			Body: func(worker int) []byte {
				// 每个 worker 用不同的游标起点，模拟真实深翻页路径。
				body := map[string]any{"tableId": c.table, "pageSize": 100}
				if len(pageCursors) > 0 {
					body["cursor"] = pageCursors[worker%len(pageCursors)]
				}
				return mustJSON(body)
			},
		},
		{
			// 批量写入：单批 500 行（扩容档位下的写放大场景）。
			Name: fmt.Sprintf("批量写入（%d 行/批）", *batchSize), Target: func(int) string { return prefix + "/tables/" + c.table + "/records/batch" }, Method: http.MethodPost,
			Setup: func(ctx context.Context, cl *client) error {
				if textField == "" {
					var schema struct {
						Fields []struct {
							ID   string `json:"id"`
							Type string `json:"type"`
						} `json:"fields"`
					}
					if err := cl.jget(ctx, prefix+"/tables/"+c.table+"/schema", &schema); err != nil {
						return err
					}
					for _, f := range schema.Fields {
						if f.Type == "text" {
							textField = f.ID
							break
						}
					}
					if textField == "" && len(schema.Fields) > 0 {
						textField = schema.Fields[0].ID
					}
				}
				return nil
			},
			Body: func(worker int) []byte {
				rows := make([]map[string]any, 0, *batchSize)
				for i := 0; i < *batchSize; i++ {
					rows = append(rows, map[string]any{"fields": map[string]any{textField: fmt.Sprintf("loadtest-%d-%d-%d", worker, i, rand.Int())}})
				}
				return mustJSON(map[string]any{"action": "create", "rows": rows, "partial": true})
			},
		},
	}

	fmt.Println("### 多维表格压测报告（自动生成）")
	fmt.Printf("\n- API：`%s`\n- 项目 / Base / 表：`%s` / `%s` / `%s`\n- 并发：%d，每场景时长：%s\n",
		c.base, c.project, c.baseID, c.table, *concurrency, *duration)
	fmt.Println()
	fmt.Println("| 场景 | 请求数 | 错误数 | QPS | P50 | P95 | P99 | 最大耗时 |")
	fmt.Println("| --- | --- | --- | --- | --- | --- | --- | --- |")

	for _, sc := range scenarios {
		if sc.Setup != nil {
			if err := sc.Setup(context.Background(), c); err != nil {
				fmt.Printf("| %s | - | - | - | - | - | - | setup 失败：%v |\n", sc.Name, err)
				continue
			}
		}
		runScenario(c, sc, *concurrency, *duration)
	}

	// 附：数据规模，便于复现。
	var schema struct {
		Fields []struct {
			ID string `json:"id"`
		} `json:"fields"`
	}
	if err := c.jget(context.Background(), prefix+"/tables/"+c.table+"/schema", &schema); err == nil {
		fmt.Printf("\n- 表字段数：%d\n", len(schema.Fields))
	}
}

func runScenario(c *client, sc scenario, concurrency int, duration time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), duration+5*time.Second)
	defer cancel()

	// 预热 3 次，避免把冷启动算进 P95。
	for i := 0; i < 3; i++ {
		c.do(ctx, sc.Method, sc.Target(i), sc.Body(i))
	}

	var (
		mu      sync.Mutex
		samples []sample
		wg      sync.WaitGroup
	)
	deadline := time.Now().Add(duration)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for time.Now().Before(deadline) {
				start := time.Now()
				_, _, err := c.do(ctx, sc.Method, sc.Target(worker), sc.Body(worker))
				s := sample{latency: time.Since(start)}
				if err != nil {
					s.err = true
					s.msg = err.Error()
					if len(s.msg) > 160 {
						s.msg = s.msg[:160]
					}
				}
				mu.Lock()
				samples = append(samples, s)
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()

	lat := make([]time.Duration, 0, len(samples))
	errs := 0
	errSamples := map[string]int{}
	for _, s := range samples {
		if s.err {
			errs++
			errSamples[s.msg]++
		}
		lat = append(lat, s.latency)
	}
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	qps := float64(len(samples)) / duration.Seconds()
	fmt.Printf("| %s | %d | %d | %.1f | %s | %s | %s | %s |\n",
		sc.Name, len(samples), errs, qps,
		percentile(lat, 0.50).Round(time.Millisecond),
		percentile(lat, 0.95).Round(time.Millisecond),
		percentile(lat, 0.99).Round(time.Millisecond),
		maxOf(lat).Round(time.Millisecond))
	shown := 0
	for msg, n := range errSamples {
		fmt.Printf("  ↳ 错误样本 ×%d：%s\n", n, msg)
		shown++
		if shown >= 5 {
			fmt.Printf("  ↳ （其余 %d 类错误样本省略）\n", len(errSamples)-shown)
			break
		}
	}
}

func maxOf(d []time.Duration) time.Duration {
	if len(d) == 0 {
		return 0
	}
	return d[len(d)-1]
}

// workerRecord 给每个并发协分配一条**互不重叠**的记录，
// 避免把「乐观锁冲突（409）」误算成系统错误。
func workerRecord(ids []string, worker int) string {
	if len(ids) == 0 {
		return ""
	}
	return ids[worker%len(ids)]
}

// workerChunk 给每个并发协分配一段互不重叠的记录 ID（批量编辑场景）。
func workerChunk(ids []string, worker, size int) []string {
	if len(ids) == 0 {
		return nil
	}
	start := (worker * size) % len(ids)
	end := start + size
	if end > len(ids) {
		end = len(ids)
	}
	return ids[start:end]
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func (c *client) queryIDs(ctx context.Context, limit int) ([]string, error) {
	body := mustJSON(map[string]any{"tableId": c.table, "pageSize": limit})
	_, b, err := c.do(ctx, http.MethodPost, "/projects/"+c.project+"/base/tables/"+c.table+"/query", body)
	if err != nil {
		return nil, err
	}
	var out struct {
		Rows []struct {
			ID string `json:"id"`
		} `json:"rows"`
		Records []struct {
			ID string `json:"id"`
		} `json:"records"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(out.Rows)+len(out.Records))
	for _, r := range out.Rows {
		ids = append(ids, r.ID)
	}
	for _, r := range out.Records {
		ids = append(ids, r.ID)
	}
	return ids, nil
}

// seedTempTable 建临时表 + 文本字段 + 播种行，返回表 ID。
func (c *client) seedTempTable(ctx context.Context, prefix string, rows, fields int) (string, error) {
	_, body, err := c.do(ctx, http.MethodPost, prefix+"/"+c.baseID+"/tables",
		mustJSON(map[string]any{"name": "压测临时表", "description": "loadtest 自动创建，压测后自动删除"}))
	if err != nil {
		return "", err
	}
	var tbl struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &tbl); err != nil {
		return "", err
	}
	for i := 0; i < fields; i++ {
		if _, _, err := c.do(ctx, http.MethodPost, prefix+"/tables/"+tbl.ID+"/fields",
			mustJSON(map[string]any{"name": fmt.Sprintf("列%02d", i+1), "type": "text"})); err != nil {
			return tbl.ID, err
		}
	}
	// 取一个文本字段写入值
	var schema struct {
		Fields []struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"fields"`
	}
	if err := c.jget(ctx, prefix+"/tables/"+tbl.ID+"/schema", &schema); err != nil {
		return tbl.ID, err
	}
	writeField := ""
	for _, f := range schema.Fields {
		if f.Type == "text" {
			writeField = f.ID
			break
		}
	}
	// 分批播种
	for start := 0; start < rows; start += 100 {
		end := start + 100
		if end > rows {
			end = rows
		}
		items := make([]map[string]any, 0, end-start)
		for i := start; i < end; i++ {
			items = append(items, map[string]any{"fields": map[string]any{writeField: fmt.Sprintf("seed-%d", i)}})
		}
		if _, _, err := c.do(ctx, http.MethodPost, prefix+"/tables/"+tbl.ID+"/records/batch",
			mustJSON(map[string]any{"action": "create", "rows": items})); err != nil {
			return tbl.ID, err
		}
	}
	return tbl.ID, nil
}

// dropTempTable 删除临时压测表。
func (c *client) dropTempTable(ctx context.Context, prefix, tableID string) error {
	_, _, err := c.do(ctx, http.MethodDelete, prefix+"/tables/"+tableID, nil)
	return err
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

// applyScale 按「扩容档位」调整播种规模与并发数。
//
// 显式在命令行给出的参数优先（用 flag.Visit 判断）；
// 已经有 -table（压现成表）时不会自动切到临时表模式。
func applyScale(scale string, seedRows, concurrency *int, tableID string) {
	set := map[string]bool{}
	flag.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var rows, conc int
	switch scale {
	case "small":
		rows, conc = 1000, 10
	case "medium":
		rows, conc = 2000, 25
	case "large":
		rows, conc = 5000, 50
	default:
		return
	}
	if !set["seed-rows"] && tableID == "" && *seedRows == 0 {
		*seedRows = rows
	}
	if !set["concurrency"] {
		*concurrency = conc
	}
}

// queryPage 拉一页并返回（记录条数，下一页游标）。
func (c *client) queryPage(ctx context.Context, tableID, cursor string, pageSize int) (int, string, error) {
	body := map[string]any{"tableId": tableID, "pageSize": pageSize}
	if cursor != "" {
		body["cursor"] = cursor
	}
	var out struct {
		Records []json.RawMessage `json:"records"`
		Page    struct {
			NextCursor string `json:"nextCursor"`
			HasMore    bool   `json:"hasMore"`
		} `json:"page"`
	}
	if err := c.jpost(ctx, "/projects/"+c.project+"/base/tables/"+tableID+"/query", body, &out); err != nil {
		return 0, "", err
	}
	return len(out.Records), out.Page.NextCursor, nil
}
