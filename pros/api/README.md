# 元矩阵 MetaMatrix · API

CloudWeGo **Hertz** + **GORM** + **PostgreSQL**（JSONB）后端。支持多用户 JWT 鉴权与全部画布模板的统一文档存储（`canvas_type` + `current_data` JSONB，不按画布分表）。

在 JSONB 真源之上提供 **抽取层**：`content_text` / `content_tsv` / `canvas_content_blocks`，服务检索、版本文本对比与 AI 上下文导出。

## 环境

- Go ≥ 1.22（本机已验证 go1.27）
- PostgreSQL 16（推荐 Docker Compose，宿主机端口 **5433**）

## 1. 配置

```bash
cd pros/api
cp .env.example .env
```

默认：

```
DATABASE_URL=postgresql://metamatrix:metamatrix@localhost:5433/metamatrix
PORT=3000
JWT_SECRET=change-me-in-production-metamatrix-jwt-secret
```

## 2. 启动数据库

```bash
docker compose up -d
```

> 若提示无法连接 Docker daemon，请先打开 Docker Desktop。  
> 宿主机 5432 可能被其它 Postgres 占用，本 compose 映射 **5433→5432**。

## 3. 启动 API

```bash
go mod tidy
go run ./cmd/server
```

启动时 `AutoMigrate` + `ensureSearchSchema`（`users` / `canvas_documents` / `canvas_revisions` / `canvas_content_blocks`，以及 `content_text` / GENERATED `content_tsv`、GIN/trgm 索引）。SQL 文档见：

- `migrations/001_init.sql`
- `migrations/002_search_ai.sql`

默认 `http://localhost:3000`。

### 健康检查与指标

`GET /health` 会探测数据库并返回 `status`（`ok` 或 `degraded`）、进程运行秒数，以及自启动以来的请求分档和登录失败计数。数据库不可用时 HTTP 状态为 503，适合作为存活/就绪探针。

`GET /metrics` 返回 Prometheus 文本（`metamatrix_http_requests_total`、`metamatrix_login_failures_total`、`metamatrix_process_uptime_seconds` 等）。这些计数只在进程内存里，重启后归零，不写入业务表。抓取示例：`curl -s http://localhost:3000/metrics`。

## 测试账号（可选）

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@metamatrix.local","password":"demo123456","displayName":"Demo"}'
```

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 否 | 注册 → `{token,user}` |
| POST | `/auth/login` | 否 | 登录 → `{token,user}` |
| GET | `/auth/me` | Bearer | 当前用户 |
| POST | `/documents` | Bearer | 创建 + 首条 snapshot；同步抽取层 |
| GET | `/documents` | Bearer | 列表（摘要；`?templateId=&canvasType=`） |
| GET | `/documents/search` | Bearer | 全文/标题检索 `?q=&templateId=&limit=` |
| GET | `/documents/ai-corpus` | Bearer | 多文档 AI 打包 `?templateId=&q=&limit=` |
| GET | `/documents/:id` | Bearer | 全量含 `currentData` |
| PUT | `/documents/:id` | Bearer | 乐观锁更新；冲突 409；同步抽取层 |
| DELETE | `/documents/:id` | Bearer | 删除 |
| GET | `/documents/:id/ai-context` | Bearer | 单文档 AI 上下文（panels / plainText） |
| POST | `/documents/:id/revisions` | Bearer | 手动存版；响应含 `contentHash` |
| GET | `/documents/:id/revisions` | Bearer | 历史列表 |
| GET | `/documents/:id/revisions/:rid/materialize` | Bearer | 物化预览 |
| GET | `/documents/:id/revisions/:ridA/diff` | Bearer | 版本对比 `?against=:ridB`（缺省对 current） |
| POST | `/documents/:id/restore` | Bearer | 恢复为新 head |

对外 JSON 为 **camelCase**。错误体：`{"message":"...","code":"..."}`。

### 检索示例

```bash
TOKEN=...
curl -s "http://localhost:3000/documents/search?q=增长&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

命中顺序：`content_tsv`（`simple`）相关度 → 标题/正文 `ILIKE` 兜底；snippet 中命中词用 `«»` 包裹。

### 版本对比示例

```bash
# ridA 与 current 对比
curl -s "http://localhost:3000/documents/$DOC/revisions/$RIDA/diff" \
  -H "Authorization: Bearer $TOKEN"

# ridA 与 ridB 对比
curl -s "http://localhost:3000/documents/$DOC/revisions/$RIDA/diff?against=$RIDB" \
  -H "Authorization: Bearer $TOKEN"
```

返回：`{ from, to, contentHashChanged, textDiff, unified, jsonPatch }`（RFC6902）。

### AI 上下文示例

```bash
curl -s "http://localhost:3000/documents/$DOC/ai-context" \
  -H "Authorization: Bearer $TOKEN"
```

历史 NestJS+Prisma 后端已归档至 `../api-nestjs-archive`（仅作参考）。

设计说明见仓库 `docs/GLOBAL_RULES/content-retrieval-ai.md`。
