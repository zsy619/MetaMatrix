# 多维表格 · 性能压测报告（C2）

> 生成方式：`pros/api/cmd/loadtest`（Go 自带压测工具，无外部依赖）
> 复现命令见文末「复现步骤」。数据由压测工具自动建临时表播种、结束后自动删除。

## 1. 结论

- 6 个核心场景全部 **0 错误**，P95 全部 ≤ 200ms，满足 §15.2「首屏 P95 < 300ms、写入 P95 < 500ms」的性能目标。
- 压测过程中发现并修复 2 个真实缺陷（见 §4），其中一个会导致**高并发下随机 404**（把数据库抖动伪装成「资源不存在」）。

## 2. 环境

| 项 | 值 |
| --- | --- |
| 机器 | macOS，10 核 / 32GB |
| 数据库 | PostgreSQL（容器 `metamatrix-postgres`，端口 5433，`max_connections=100`） |
| 后端 | `pros/api`（Hertz + GORM），压测期间独立实例监听 3001 |
| 连接池 | `DB_MAX_OPEN_CONNS=30` / `DB_MAX_IDLE_CONNS=10`（本次新增的显式配置） |
| 限流 | 压测实例 `BASE_RATE_LIMIT_RPS=20000`（**生产默认 40 rps / burst 80，见 §5 风险**） |
| 数据规模 | 临时表 1 张：300 行 × 21 字段（1 个主字段 + 20 个文本字段） |
| 并发 | 4 个 worker，每场景 8 秒 |

## 3. 指标

| 场景 | 请求数 | 错误数 | QPS | P50 | P95 | P99 | 最大耗时 | 达标 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 首屏查询（100 条 × 20 字段） | 6848 | 0 | 856.0 | 4ms | 6ms | 8ms | 40ms | ✅ |
| 常规筛选（关键字） | 6960 | 0 | 870.0 | 4ms | 6ms | 7ms | 11ms | ✅ |
| 视图配置读取 | 50339 | 0 | 6292.4 | 1ms | 1ms | 1ms | 12ms | ✅ |
| 表结构读取 | 9491 | 0 | 1186.4 | 3ms | 4ms | 6ms | 20ms | ✅ |
| 单条更新 | 3936 | 0 | 492.0 | 8ms | 10ms | 12ms | 18ms | ✅ |
| 批量 100 条编辑 | 192 | 0 | 24.0 | 162ms | 200ms | 215ms | 220ms | ✅ |

判定口径：

- 首屏查询（100 条 × 20 字段）P95 ≤ 300ms → **达标**（实测 6ms）
- 写入（单条更新 / 批量 100 条编辑）P95 ≤ 500ms → **达标**（实测 10ms / 200ms）
- 错误率 0% → **达标**

## 4. 压测暴露并修复的缺陷

### 4.1 高并发下随机「base not found」（假 404）

- 现象：并发写入时约 3% 请求返回 `404 {"code":"40401","message":"base not found"}`。
- 根因：`Service.assertAccess` → `spaceRole` 把**数据库查询错误**一律吞掉并返回空角色，空角色被解释成「不是空间成员」→ `ErrBaseNotFound`。连接池忙时的瞬时 DB 错误因此变成 404。
- 修复：`internal/base/service.go` 拆出 `spaceRoleWithError`，DB 错误原样上抛（映射 500），只有「确实查不到成员」才返回 `ErrBaseNotFound`。

### 4.2 连接池无上限 → 打满 Postgres `max_connections`

- 现象：并发下出现 `500 resolve space role: failed to connect ... tls error: EOF`，即 Postgres 拒绝新连接。
- 根因：GORM 默认 `MaxOpenConns` 无上限、`MaxIdleConns=2`，高频请求不断新建连接，打满 100 条连接上限。
- 修复：`internal/db/db.go` `Connect` 显式配置连接池，新增环境变量
  `DB_MAX_OPEN_CONNS`（默认 30）、`DB_MAX_IDLE_CONNS`（默认 10）、
  `DB_CONN_MAX_LIFETIME_MIN`（默认 30）、`DB_CONN_MAX_IDLE_MIN`（默认 5）。

## 5. 风险与说明

- 生产默认限流仍是 `BASE_RATE_LIMIT_RPS=40` / `burst=80`；**单用户批量编辑 100 条**（P95 200ms）在 40 rps 下约需 2.5 秒，属预期限流行为，不是性能瓶颈。若要放开请显式调高环境变量。
- 压测在单机本地环境完成，**不代表生产环境**（网络往返、共享数据库、多副本部署会显著改变数字）。
- 单条更新场景使用「每 worker 独占一条记录」的方式，避免把乐观锁 409 冲突计入系统错误。

## 6. 复现步骤

```bash
# 1) 起一个放开限流的压测实例（生产实例请勿这样跑）
cd pros/api
export DATABASE_URL='postgresql://metamatrix:metamatrix@localhost:5433/metamatrix'
export PORT=3001 BASE_RATE_LIMIT_RPS=20000 BASE_RATE_LIMIT_BURST=40000
set -a && . <(grep -E '^JWT_SECRET=' .env) && set +a
go run ./cmd/server &

# 2) 跑压测（自动建临时表播种 300 行 × 20 字段，结束后自动删除）
go run ./cmd/loadtest \
  -base http://localhost:3001 \
  -token-file /tmp/tok.txt \
  -project 3f030ea3-61a5-4156-9b77-a9ca1d29d107 \
  -base-id 27ea1bbc-5da4-4058-b8c8-ab1c0afdef0f \
  -concurrency 4 -duration 8s -seed-rows 300 -seed-fields 20
```

## 7. 变更文件

- 新增：`pros/api/cmd/loadtest/main.go`（压测工具）
- 修改：`pros/api/internal/db/db.go`（连接池）、`pros/api/internal/base/service.go`（权限判定不再吞 DB 错误）
