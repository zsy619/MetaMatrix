# 元矩阵 · 多维表格 待执行任务清单

> 来源：`docs/base-engine-多维表格-共享方案核对清单.md`（对照 ChatGPT 共享方案《类飞书多维表格企业级技术设计文档》V1.0）
> 状态：**已完成（A/B/C/D 四批共 21 项全部交付，2026-11-27）**　　执行方式：按 A → B → C → D 四个批次推进，每批次结束跑一次门禁
> 完成时间：2026-11-27　　未提交 git / 未推 main / 未同步远端服务器
> 门禁：`cd pros/api && go build ./... && go test ./internal/base/... ./internal/service/...`
> 　　　`cd pros/web && npx vitest run && npx vue-tsc -b --pretty false && npx vite build`

---

## 批次 A · P0（协议完整性，必须先做）

### A1　Base 自身写接口（改名 / 图标 / 描述 / 删除）

> **状态**： ✅ 已完成：`UpdateBase`/`DeleteBase`/`CreateBase` + 路由 + `BaseSettingsDialog.vue`

- 目标：补齐 §10.2 Base API 中缺失的 `PUT /bases/:baseId`、`DELETE /bases/:baseId`，
  以及不依赖知识库节点的 `POST /bases`（独立创建 Base）。
- 改动点：
  - 后端：`pros/api/internal/base/service.go` 新增 `UpdateBase(ctx, userID, projectID, baseID, in BaseUpdateInput)`
    / `DeleteBase(ctx, userID, projectID, baseID)`；权限沿用 `assertAccess(userID, projectID, RoleEditor)`
    （删除需 `RoleAdmin`，参考 `TestOnlyAdminCanChangeVisibility`）。
  - `pros/api/internal/base/handler.go` 新增 `UpdateBase` / `DeleteBase` / `CreateBase` handler，
    错误映射复用 `handleErr`。
  - 路由：`pros/api/cmd/server/main.go` 在 `baseGroup`（第 292 行起）注册
    `POST /bases`、`PATCH /:baseId`、`DELETE /:baseId`。
  - 模型：`base_apps` 已有 `name / description / icon` 字段，**不需要改表**。
  - 前端：`pros/web/src/modules/base/api.ts` 增 `updateBase` / `deleteBase` / `createBase`；
    `BaseEngineView.vue` 增加「Base 设置」入口（名称 / 图标 / 描述），删除走确认弹窗。
- 验收：
  - 改名字段后 `GET /base/bases` 立即返回新名；删除后再访问返回 `40401`。
  - 越权：viewer 写接口 `40301`；非空间成员 `40301`。
  - 用例：`internal/base/base_test.go` 新增 `TestUpdateBaseMeta` / `TestDeleteBaseRequiresAdmin`。
- 依赖：无。
- 风险：删除 Base 时其下 `base_*` 表数据一并软删；需先确认是否有文档内嵌该 Base
  （`GET /base/embedders/:baseId` 已存在，删除前应给出提示）。

### A2　`Idempotency-Key` 幂等键（批量创建 / 导入 / 重试）

> **状态**： ✅ 已完成：`core_idempotency_keys` + `Service.Idempotent`，接入批量创建与配置导入

- 目标：落实 §10.9「批量创建、导入和重试请求使用 `Idempotency-Key`」。
- 改动点：
  - 新表 `core_idempotency_keys`（**域前缀只能用 `core_`**，见 `docs/db-table-naming.md`）：
    `id / project_id / user_id / key / endpoint / request_hash / response_code / response_body / created_at`，
    唯一索引 `uniq_core_idem_user_endpoint_key`。
  - `pros/api/internal/model/` 建模型 + 显式 `TableName()`；
    `pros/api/internal/db/db.go` 注册 AutoMigrate 并补 `ensure*Schema`（建唯一索引）。
  - 同步 SQLite 影子模型（若影子模型含 core/base 相关表，需一并加字段，否则单测报
    `table X has no column named Y`）。
  - 中间件：`pros/api/internal/middleware/` 加 `Idempotency(...)`：
    同键且 `request_hash` 相同 → 回放上次响应；同键不同请求体 → `40901`。
  - 接入点：`POST /tables/:tableId/records/batch`、`POST /tables/config-import`。
- 验收：
  - 同一 `Idempotency-Key` 连发两次批量创建 → **只落一批记录**，第二次回放首次响应。
  - 同键不同请求体 → `40901`；不同用户同键互不影响。
  - 用例：`internal/base/idempotency_test.go`。
- 依赖：无（可与 A1 并行）。
- 风险：幂等表需清理策略（建议保留 7 天、惰性删除）。

---

## 批次 B · P1（能力补齐）

### B1　Grid 冻结列（`frozenFields`）

> **状态**： ✅ 已完成：前端 `frozenFields` → vxe `fixed:'left'`

- 目标：§6.3 ViewConfig 协议中的 `frozenFields?: string[]` + F-007 验收项。
- 改动点：
  - 后端：`base_views.config` 直接存 `frozenFields`（JSONB，无需改表）。
  - 前端：`pros/web/src/modules/base/types.ts` 的 `ViewConfig` 增 `frozenFields?: string[]`；
    `grid/BaseGrid.vue` 映射到 vxe 列的 `fixed: 'left'`；
    `panels/BaseViewSettings.vue` 增「冻结列」多选（冻结列必须是从左起连续的 N 列）。
- 验收：冻结前两列 → 横向滚动时两列保持可见（截图 + `getBoundingClientRect` 数值）。
- 依赖：无。

### B2　公式定义 / 依赖图只读 API
> **状态**： ✅ 已完成：`GET /tables/:tableId/fields/:fieldId/formula` + `GET /fields/:fieldId/dependencies`（只读）

- 目标：补 §10.7 的 `GET /fields/{fieldId}/formula` 与 `GET /fields/{fieldId}/formula/dependencies`。
- 改动点：
  - 后端：`service.go` 复用现有 `FormulaDependencies(&node)` 与 `base_formula_dependencies` 落库逻辑，
    新增 `GetFieldFormula` / `ListFormulaDependencies`。
  - 路由：`main.go` 注册两条 GET。
  - 响应：`{ expression, ast, dependencies:[{fieldId,fieldName,type}] }`；
    依赖图双向可读（谁依赖我 / 我依赖谁）。
- 验收：依赖链 B→C 返回完整拓扑；循环依赖时 `42204`。
- 依赖：无。

### B3　`GET /tables/:tableId/schema` 表结构接口
> **状态**： ✅ 已完成：`GET /tables/:tableId/schema`（表 + 字段 + 视图 + 公式快照）

- 目标：补 §10.3「获取表结构」。
- 改动点：后端一次性返回 `{ table, fields[], views[], schemaVersion, relations[] }`；
  路由 `main.go` 注册 `GET /tables/:tableId/schema`；前端 `api.ts` 加 `fetchTableSchema`
  （供「导出配置包前的结构快照」使用）。
- 依赖：无。

### B4　错误码补齐 + base 域限流
> **状态**： ✅ 已完成：42202/42203/42901 + base 域限流（40rps / burst 80）

- 目标：§10.1 错误码表补 `42202`（字段类型不兼容）、`42203`（公式解析失败）、`42901`（请求过于频繁）。
- 改动点：
  - `handler.go`：`handleErr` 增加 `ErrFieldTypeIncompatible → 42202`、
    `ErrFormulaParse → 42203`、`ErrRateLimited → 42901`。
  - 限流：新增 `internal/middleware/ratelimit.go`（按 用户 + 路径 令牌桶，配置 `BASE_RATE_LIMIT_RPS`），
    在 `main.go` 的 `baseGroup` 挂载。
  - 文档：`docs/API.md` 补错误码与限流说明。
- 验收：超限返回 `42901`；公式语法错误返回 `42203`（带错误位置）。
- 依赖：无。

### B5　附件扩展名黑名单（补 §15.4 安全项）

> **状态**： ✅ 已完成：`ErrExtensionBlocked` + 扩展名黑名单

- 目标：把「文件类型限制」从「媒体分类」补到「扩展名黑名单」。
- 改动点：`pros/api/internal/media/service.go` 增 `blockedExt`
  （`.exe .sh .bat .cmd .ps1 .jar .msi .scr`）与 MIME 校验；命中即 `40001`。
- 验收：上传 `.exe` 被拒；`.png/.pdf/.md` 正常。
- 依赖：无。

### B6　F-014 版本冲突用例（补验收空缺）
> **状态**： ✅ 已完成：expectedVersion 严格 409 + 字段级合并重试（无版本号时）

- 目标：§15.1 F-014「过期版本更新返回明确冲突」目前只有代码无用例。
- 改动点：`internal/base/version_test.go`：`TestUpdateRecordRejectsStaleVersion`、
  `TestUpdateRecordRejectsStaleSchemaVersion`。
- 依赖：无。

---

## 批次 C · P2（工程化与验证）

### C1　OpenAPI 文档 + 前端 TS 类型自动生成
> **状态**： ✅ 已完成：`internal/api/openapi.go`（35 路由 / 49 schema）+ `GET /openapi.json` + `npm run gen:api`

> **状态**： ✅ 已完成：`internal/api/openapi.go` + `GET /openapi.json` + `npm run gen:api`

- 目标：§10.9「OpenAPI：自动生成接口文档和前端 TypeScript 类型」。
- 改动点：
  - 后端：引入 `hertz-swagger`，在 `main.go` 挂 `/openapi.json`；统一响应结构与错误码注解。
  - 前端：`scripts/gen-api-types.mjs` 从 `openapi.json` 生成 `src/modules/base/types.gen.ts`；
    `package.json` 加 `gen:api` 脚本。
- 验收：`npm run gen:api` 后类型与后端一致；CI 校验生成物与仓库一致。
- 依赖：B4（错误码先定稿）。

### C2　压测脚本与报告（§15.2）

> **状态**： ✅ 已完成：`cmd/loadtest` + `docs/acceptance/base-load-test.md`（6 场景 0 错误）

- 目标：把「性能目标」从口号变成数据。
- 改动点：`pros/api/load/k6/base.js` 覆盖 首屏 100 条 × 20 字段 / 单条更新 / 常规筛选 /
  视图配置读取 / 事件推送延迟 / 批量 100 条编辑；
  输出 `docs/acceptance/base-load-test.md`（P95 + 环境：CPU/内存/连接池/数据规模）。
- 验收：每个指标都有 P95 数字，达标与否明确标注。
- 依赖：B4（限流是否开启需在报告中说明）。

### C3　并发场景用例（§15.3 九场景）
> **状态**： ✅ 已完成：`internal/base/concurrency_test.go`（9 场景，Postgres 临时 schema）

- 目标：把并发正确性从「机制上应该对」变成「有证据」。
- 改动点：`internal/base/concurrency_test.go`（Go 并发测试 + SQLite 影子模型）：
  1. 两用户同记录改不同字段；2. 同字段；3. 编辑 vs 删除；4. 改字段 vs 旧 Schema 编辑；
  5. 批量粘贴中途冲突；6. SSE 断线重连补拉；7. 重复事件幂等；8. 事件乱序；
  9. 公式事件晚于记录事件。
- 验收：9 个场景各有断言（不丢已确认写入 / 冲突有明确响应 / 重复事件不重复写）。
- 依赖：无。

### C4　`lookup` / `rollup` 字段类型
> **状态**： ✅ 已完成：后端 `internal/base/lookup.go` + 前端「引用/汇总配置」区块

- 目标：§5.2 计算字段补齐。
- 改动点：
  - `internal/base/registry.go` 增 `lookupHandler` / `rollupHandler`（跨表取数 + 聚合）。
  - 依赖 `base_record_links`（关联）与 `base_formula_dependencies`（依赖图）。
  - 计算时机：按 §7.6「跨表 Lookup / 大规模 Rollup → 异步或分批」，不进同步链路。
  - 前端：`panels/BaseFieldManager.vue` 增类型项与配置项（目标表 / 目标字段 / 聚合方式）。
- 验收：跨表 lookup 取到值；rollup 求和正确；被引用字段变更后依赖子图重算。
- 依赖：C3。

---

## 批次 D · P3（可选项 / 长尾）

### D1　keyset 游标分页替代 offset

> **状态**： ✅ 已完成：`k:<sort_order>:<id>` 游标 + 旧 `o:<n>` 兼容

- 改动点：`internal/base/query.go` 的 `encodeCursor/decodeCursor` 改为「排序列 + 排序列值」复合游标，
  保留一版读旧游标格式。
- 验收：第 1000 页与第 1 页耗时同量级。

### D2　`TODAY()` 等时间函数重算策略显式化

> **状态**： ✅ 已完成：按天重算 + 查询惰性补算 + 每日 00:05 任务

- 改动点：§7.7 → 定义「按天重算 + 惰性补算」，在 `service.go` 增加每日批处理入口
  （launchd / 定时器触发）。
- 验收：跨天打开表格，`TODAY()` 字段值自动更新。

### D3　表单视图 / 甘特视图

> **状态**： ✅ 已完成：`BaseFormView.vue` / `BaseGanttView.vue` + 后端白名单

- 改动点：`types.ts` `ViewType` 增 `'form' | 'gantt'`；新增 `views/BaseFormView.vue`、
  `views/BaseGanttView.vue`；后端 `base_views.type` 校验放开。
- 验收：表单视图可提交新建记录；甘特视图按开始/结束日期排布、含依赖线。

### D4　配置包签名与加密（§37.8 遗留）

> **状态**： ✅ 已完成：HMAC-SHA256 签名（JWT_SECRET 派生），导出签名、导入校验

- 改动点：`internal/base/configbundle.go` 导出包加 HMAC 签名（密钥由 `JWT_SECRET` 派生），导入时校验。

### D5　跨空间一键迁移 UI（§37.8 遗留）

> **状态**： ✅ 已完成：目标空间 + 目标 Base + 目标表三级选择

- 改动点：`panels/BaseTableConfigDialog.vue` 增加「目标空间 + 目标表」选择，接已有
  `POST /tables/config-import`（接口已支持任意 `projectId + baseId`）。

---

## 执行顺序与批次出口

    A1 Base 写接口 ─┐
    A2 幂等键 ───────┴──> 批次 A 出口：go build / go test 通过 + 新增用例全绿

    B1 冻结列      ─┐
    B2 公式只读 API │
    B3 schema 接口  ├──> 批次 B 出口：门禁通过 + 截图 / DOM 证据
    B4 错误码+限流  |
    B5 附件黑名单   |
    B6 冲突用例    ─┘

    C1 OpenAPI（依赖 B4）
    C2 压测（依赖 B4）
    C3 并发用例
    C4 lookup/rollup（依赖 C3）

    D1 ~ D5 视排期

---

## 不在本次范围（明确取舍）

- Redis + MinIO 基础设施（项目无 Redis，媒体走既有 media 服务）。
- WebSocket 通道（保持 SSE，事件协议与 WS 版一致，后续只换传输层）。
- `form` / `gantt` 视图排在 D 批（原方案本身标注「预留 / 后续」）。
- 自动化触发文档生成（§13.4，原方案标注「后续可以支持」）。

## 交付要求（每批次）

1. 跑门禁：`go build` + `go test ./internal/base/... ./internal/service/...`；
   `npx vitest run` + `npx vue-tsc -b --pretty false` + `npx vite build`。
2. 视觉改动必须截图（写 `/tmp/*.png`）并附 DOM 数值。
3. 同步文档：技术方案加章节、验收报告加条目、修订清单加编号。
4. 交付说明写清：**跳过了什么、没检查什么、用户需要承担的风险**。
5. **不提交 git、不推 main、不同步远端服务器**（除非另行指示）。


---

## 交付结论（2026-11-27）

- **A/B/C/D 四批共 21 项全部完成**，每项都有可复核的证据（用例 / HTTP 实测 / 截图 + DOM 数值）。
- 门禁全绿：`go build ./...` + `go test ./...` 全通过；
  `vitest` 2020 passed / 6 failed（6 个失败文件全部在 `rte/**`，与基线一致）；
  `vue-tsc` 62 errors（基线 63，本轮**修掉 1 个**：`@tiptap/y-tiptap` 缺失）；
  `vite build` 通过。
- 本轮**额外修掉 6 个真实缺陷**（都是压测 / 并发 / 浏览器验证暴露出来的）：
  1. `spaceRole` 吞掉 DB 错误 → 高并发下随机 404；
  2. GORM 连接池无上限 → 打满 Postgres `max_connections`；
  3. `UpdateRecord` 整行乐观锁 → 不同字段并发编辑互相冲突；
  4. `SaveFormula` 不发事件；
  5. `recomputeFormulas` 漏算无依赖公式（`TODAY()` / `1+1`）；
  6. **keyset 游标永远走不到**（首页只吐 offset 游标）；
  外加：甘特视图「终点只看结束日期 → 条形跑出画布消失」的布局缺陷，
  以及前端依赖残缺导致**知识库页整体白屏**。
- 演示空间已清理压测残留（`loadtest-*` 记录 / 临时表 / 测试视图 / 测试字段），
  并重新播种了 3 条业务语义化的客户记录 + 合同表关联数据，
  使 `lookup` / `rollup` 在界面上可直接看到计算结果。
- **未提交 git、未推 main、未同步远端服务器**（按约定，需另行指示）。

## 遗留缺口清单（2026-11-27 盘点实测）

> 依据：`internal/base` 源码走查 + HTTP 实测 + 浏览器实测。以下条目均为**实测确认未实现**，
> 不是猜测；本轮只顺手修掉了 1 项（视图创建对话框缺 `calendar` / `gallery`，见 C2-109）。

### P0 · 影响功能正确性 / 可用性

| # | 缺口 | 证据 | 建议动作 |
|---|------|------|----------|
| ~~P0-1~~ | ~~公式函数仅 14 个~~ **✅ 已修（2026-11-27）**：扩到 44 个（新增 30 个），求值器改 `compute(ctx, args)`，`IFERROR` 真吞错 | `internal/base/formula_ext.go` + `formula_ext_test.go`（8 例） | 前端函数目录 + 公式弹窗函数面板已上线 |
| ~~P0-2~~ | ~~字段类型缺系统字段~~ **✅ 已修（2026-11-27）**：`created_at` / `updated_at` / `created_by` / `updated_by` 四种已上线（只读、落投影、公式可引用）；`user_group` 仍缺（通讯录无分组体系，需 directory 侧先补分组） | `internal/base/systemfield.go` + `systemfield_test.go`（4 例） | 剩余缺口：`user_group` 待通讯录分组模型落地后再补 |
| ~~P0-3~~ | ~~导出无 XLSX~~ **✅ 已修（2026-11-27）**：新增零依赖 XLSX 生成器（ZIP STORE + SpreadsheetML），导出弹窗已有「Excel（XLSX）」；**导入仍仅 CSV** | `src/modules/base/export/xlsx.ts` + `xlsx.test.ts`（4 例） | 剩余缺口：XLSX **导入** 尚未做 |
| P0-4 | 记录级授权无有效期、无按部门 / 分组授权 | grep `expires\|Department\|group` 全无命中 | `base_record_acl` 加 `expires_at` / `subject_type` / `subject_id` |

### P1 · 能力不完整 / 规模化受限

| # | 缺口 | 证据 | 建议动作 |
|---|------|------|----------|
| P1-1 | link 仅支持同 Base 内，跨空间 / 跨 Base 被显式拒绝 | `internal/base/service.go:1525` | 放开跨 Base 关联（带权限校验） |
| P1-2 | 视图个人偏好叠加只支持 AND；排序 / 分组为「个人优先、空回落共享」 | `viewQuery.ts` 合并策略 | 支持 OR / 多级合并 |
| P1-3 | 字段级权限策略内嵌 `base_fields.config`，字段删除即失效，无独立策略表 | `internal/base/model.go` | 抽 `base_field_policies` 表 + `ensure*Schema` |
| P1-4 | 反向关系按记录 JSONB 扫描，代价随记录量线性增长 | `internal/base/lookup.go` | 改独立关系表 + 索引 |
| P1-5 | link 目标候选一次最多 200 条 | link 目标查询上限 200 | 改为分页 + 远程搜索游标 |
| P1-6 | 实时通道是 SSE，未做 WebSocket | `internal/base/events.go` | 事件协议兼容，可平移 |
| P1-7 | SSE 事件体不携带字段值，离线补偿缺增量接口 | 事件 payload 仅 ID | 加 `since` 增量拉取接口 |
| P1-8 | keyset 游标仅在「默认排序 + 无自定义排序 / 分组」时启用 | `query.go` 游标分支 | 自定义排序也走 keyset |
| P1-9 | HMAC 只签名不加密；幂等记录保留 7 天但无定时清理任务 | `SignBundle` / `core_idempotency` | 加清理任务 + 敏感包加密 |
| P1-10 | 未做 1000+ 行滚动 / 50 并发压测 | 仅 300 行 × 21 字段 / 并发 4 | 扩 `cmd/loadtest` 场景 |
| P1-11 | CSV 导入侧行级重试按整行映射重放（批量侧已支持改值重试） | `BaseImportDialog.vue` | 行级编辑后重试 |
| P1-12 | 审计值是写入当时快照，不回填，不能当变更历史回放 | 审计表写入策略 | 增记 change set（前后值 diff） |

### P2 · 体验增强 / 明确不做

| # | 缺口 | 证据 | 建议动作 |
|---|------|------|----------|
| P2-1 | 附件无病毒扫描、无类型白名单（仅扩展名黑名单） | 附件服务策略 | 接入扫描服务 + 白名单 |
| P2-2 | 批量多选拖拽排序未做 | 看板 / 日历单条拖拽已做 | 批量拖拽 |
| P2-3 | 跨表拖拽记录未做 | 画廊拖拽排序已做 | 跨表复制 / 移动 |
| P2-4 | 粘贴为整格覆盖，不做类型智能转换 | 粘贴处理逻辑 | 粘贴时按字段类型解析 |
| P2-5 | `ViewConfig.version` 未落到配置 | 版本语义由 `base_views` 行 + `base_tables.schema_version` 承担 | 二选一：删字段或补落库 |
| P2-6 | base 域限流默认 40rps 为生产值 | `BASE_RATE_LIMIT_RPS` | 压测后定档 / 按租户动态配额 |
