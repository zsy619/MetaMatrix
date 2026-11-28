# 元矩阵 · 多维表格 重构完成度核对清单（2026-11-27）

> 核对基准：
> 1. ChatGPT 共享方案《类飞书多维表格企业级技术设计文档》V1.0
>    （`docs/base-engine-多维表格-共享方案核对清单.md` → `docs/base-engine-多维表格-待执行任务清单.md`）
> 2. 后续追加的**飞书 Bitable 对标**要求（批次 F / G / H / I）
> 核对方法：源码走查 + 用例清单 + HTTP 实测 + 浏览器实测（DOM 数值 / 截图）
> 标注：✅ 已完成　🟡 部分完成　⚠️ 与原方案有偏差（已记录）　❌ 未实现

---

## 一、总览

- [x] **共享方案 A/B/C/D 四批 21 项**：✅ 全部交付（路由、用例、脚本、报告齐备）
- [x] **功能验收 F-001 ~ F-016**：✅ **16/16 通过**（F-001 / F-007 / F-014 原为部分，本轮已补齐）
- [x] **公式引擎**：✅ 函数由 14 → **44 个**；AST / 依赖图 / 循环检测 / `IFERROR` 吞错齐全
- [x] **字段类型**：✅ 19 种基础 + `lookup` / `rollup` + 4 种系统字段（`created_at/updated_at/created_by/updated_by`）
- [x] **飞书对标增量（批次 F~I）**：✅ 4 批全部落地（主题层 / 列头菜单 / 效率最后一公里 / 列顺序）
- [ ] **剩余未做项**：🟡 集中在「横向能力」——记录级授权有效期、跨 Base 关联、SSE 增量、XLSX 导入、字段策略独立表等

---

## 二、共享方案 · 批次 A（P0 协议完整性）

- [x] **A1 Base 写接口** ✅ —— `POST /bases`、`PATCH /bases/:baseId`、`DELETE /bases/:baseId`（`main.go:324-326`）+ `BaseSettingsDialog.vue`
- [x] **A2 幂等键 `Idempotency-Key`** ✅ —— `core_idempotency_keys`（`internal/model/idempotency.go:34`）+ `internal/middleware/idempotency.go` + `internal/base/idempotency.go`（TTL 7 天 + `PurgeIdempotency`）
- [x] **A3（A 批内附加）Base 自身元信息字段** ✅ —— `name / description / icon` 复用 `base_apps` 现有列，无需改表

## 三、共享方案 · 批次 B（P1 能力补齐）

- [x] **B1 冻结列 `frozenFields`** ✅ —— 前端 `fixed:'left'` 映射 + 「从左起连续」校验 + 冻结段内禁止拖序（批次 I）
- [x] **B2 公式定义 / 依赖图只读 API** ✅ —— `GET /fields/:fieldId/formula`、`GET /fields/:fieldId/formula/dependencies`（`main.go:356-357`）
- [x] **B3 表结构接口** ✅ —— `GET /tables/:tableId/schema`（`main.go:338`）
- [x] **B4 错误码 + 限流** ✅ —— `42202 / 42203 / 42901`（`handler.go:80-84`）+ `internal/middleware/ratelimit.go`
- [x] **B5 附件扩展名黑名单** ✅ —— `.exe .sh .bat .cmd .ps1 .jar .msi .scr`
- [x] **B6 F-014 版本冲突用例** ✅ —— `internal/base/version_test.go`

## 四、共享方案 · 批次 C（P2 工程化）

- [x] **C1 OpenAPI + 前端类型生成** ✅ —— `internal/api/openapi.go` + `GET /openapi.json` + `npm run gen:api`
- [x] **C2 压测脚本与报告** ✅ —— ⚠️ 路径偏差：实现为 **Go 自研工具 `pros/api/cmd/loadtest`**（非文档里写的 k6），报告 `docs/acceptance/base-load-test.md`（6 场景 0 错误，P95 ≤ 200ms）
- [x] **C3 并发 9 场景用例** ✅ —— `internal/base/concurrency_test.go`（9 个 `TestConcurrency*` 全在）
- [x] **C4 `lookup` / `rollup`** ✅ —— `internal/base/lookup.go` + `GET /computed-fields`、`POST /lookup-rollup/recalc` + 前端「引用/汇总」配置区块

## 五、共享方案 · 批次 D（P3 长尾）

- [x] **D1 keyset 游标** ✅（部分）—— `k:<sort_order>:<id>` 已落地且首页即进 keyset 模式；🟡 **自定义排序 / 分组时仍回退 offset**（`query.go:566` `canUseKeyset`）
- [x] **D2 `TODAY()` 重算策略** ✅ —— 按天重算 + 查询惰性补算 + 每日批处理入口
- [x] **D3 表单 / 甘特视图** ✅ —— `BaseFormView.vue` / `BaseGanttView.vue`
- [x] **D4 配置包签名** ✅ —— HMAC-SHA256（JWT_SECRET 派生）；🟡 **只签名不加密**
- [x] **D5 跨空间一键迁移 UI** ✅ —— `BaseTableConfigDialog.vue` 三级选择

---

## 六、功能验收 F-001 ~ F-016 现状

| 编号 | 验收项 | 上次 | 本次 | 证据 |
| --- | --- | --- | --- | --- |
| F-001 | Base 管理（增删改查） | 🟡 | ✅ | `POST/PATCH/DELETE /bases` + 设置弹窗 |
| F-002 | Table 管理 | ✅ | ✅ | `main.go:333-337` |
| F-003 | Field 动态增删改 | ✅ | ✅ | `main.go:339-343` + `/fields/order` 排序接口 |
| F-004 | Field Registry 可扩展 | ✅ | ✅ | `registry.go` 注册式 |
| F-005 | Record CRUD | ✅ | ✅ | `main.go:344-348` |
| F-006 | JSONB 存储改名不丢数据 | ✅ | ✅ | 值按 `fieldId` 存 JSONB |
| F-007 | 单元格编辑 / 列宽 / 冻结列 | 🟡 | ✅ | 冻结列 + 批次 I 自研列宽拖拽 / 自动适应 |
| F-008 | 批量编辑（TSV 粘贴） | ✅ | ✅ | `clipboard.ts` + 单元格右键「粘贴到此处」 |
| F-009 | 筛选 / 排序 / 分页 | ✅ | ✅ | `query.go` + `BaseQueryPanel.vue` |
| F-010 | 多视图共享同一份记录 | ✅ | ✅ | `base_views` 只存配置 |
| F-011 | 公式函数 | ✅ 14 | ✅ **44** | `formula.go` 14 + `formula_ext.go` 30 |
| F-012 | Relation 跨表关联 | ✅ | ✅ | `relations.go` + `base_record_links` |
| F-013 | 实时变更事件 | ✅ | ✅（⚠️ SSE 而非 WS） | `events.go` + outbox |
| F-014 | 过期版本冲突 | 🟡 | ✅ | `version_test.go` 两例 |
| F-015 | 审计追溯 | ✅ | ✅ | `base_operation_logs` + 审计面板 |
| F-016 | 四级权限 | ✅ | ✅ | `fieldpolicy.go` / `datascope.go` |

---

## 七、原「遗留缺口清单」逐条复核

### P0
- [x] **P0-1 公式函数不足** ✅ 已修 → 44 个
- [x] **P0-2 系统字段缺失** ✅ 已修 → 4 种（🟡 `user_group` 仍缺，依赖通讯录分组模型）
- [x] **P0-3 导出无 XLSX** ✅ 已修（导出）→ 零依赖生成器 `export/xlsx.ts`；🟡 **XLSX 导入仍缺**（导入仅 CSV，`BaseImportDialog.vue` accept `.csv,.txt`）
- [ ] **P0-4 记录级授权无有效期 / 无按部门授权** ❌ 未做 —— `base_record_acl` 无 `expires_at` / `subject_type`（grep 无命中）

### P1
- [ ] **P1-1 关联仅限同 Base** ❌ 未做 —— `service.go:1547` 显式拒绝跨空间引用
- [ ] **P1-2 查询口径叠加只支持 AND** ❌ 未做 —— `combine` 仅 `'override' | 'and'`（`types.ts`）
- [ ] **P1-3 字段策略无独立表** ❌ 未做 —— 仍内嵌 `base_fields.config`，无 `base_field_policies`
- [ ] **P1-4 反向关系按 JSONB 扫描** ❌ 未做 —— `lookup.go` 无独立关系表索引
- [ ] **P1-5 link 候选上限 200** ❌ 未做 —— `relations.go:313` 硬上限 200，未分页 / 未远程搜索
- [ ] **P1-6 SSE 未做 WebSocket** ❌ 未做（**有意偏差**，原方案已记录）
- [ ] **P1-7 无增量拉取接口** ❌ 未做 —— 事件体只带 ID，无 `since` 增量接口
- [ ] **P1-8 自定义排序不走 keyset** ❌ 未做 —— `query.go:566`
- [ ] **P1-9 配置包只签名不加密 + 幂等无定时清理** ❌ 未做 —— 有 `PurgeIdempotency` 函数，但**无调度任务**；包未加密
- [ ] **P1-10 压测规模不足** ❌ 未做 —— 仅 300 行 × 21 字段 / 并发 4，未到 1000+ 行 / 50 并发
- [ ] **P1-11 CSV 行级重试只能整行重放** ❌ 未做 —— `BaseImportDialog.vue` 无行级改值重试
- [ ] **P1-12 审计是快照、不回填** ❌ 未做 —— 无 change set diff

### P2
- [ ] **P2-1 附件无病毒扫描 / 无类型白名单** ❌ 未做 —— 仅扩展名黑名单（B5）
- [ ] **P2-2 批量多选拖拽排序** ❌ 未做 —— `BaseBatchDialog.vue` 无 `draggable`
- [ ] **P2-3 跨表拖拽记录** ❌ 未做 —— 仅画廊内拖拽
- [ ] **P2-4 粘贴不做类型智能转换** ❌ 未做 —— 整格覆盖
- [ ] **P2-5 `ViewConfig.version` 未落库** ❌ 未做 —— 版本语义由 `base_views` 行承担
- [ ] **P2-6 限流默认 40rps 未按租户动态配额** ❌ 未做 —— `BASE_RATE_LIMIT_RPS` 全局值

---

## 八、飞书 Bitable 对标增量（批次 F ~ I）

- [x] **批次 F · 飞书主题层** ✅ —— `src/modules/base/feishu.css`（997 行 / 177 处 `--fs-*` 令牌），表格 / 工具栏 / 视图标签 / 弹窗 / 抽屉 / 看板日历画廊统一飞书取值
- [x] **批次 G · 列头 ▾ 操作菜单 + 交互补齐** ✅ —— `BaseColumnMenu.vue`（升序 / 降序 / 清除排序 / 筛选此列 / 冻结 / 隐藏 / 列宽 / 编辑字段）；表头灰化 + 类型提示、记录列表卡片化、单元格 tooltip、附件缩略图 32px、聚焦描边 `#3370FF`、加载骨架、单空态、底部条常驻
- [x] **批次 H · 效率最后一公里** ✅ —— 自研列宽拖拽把手（落库个人偏好）、单元格右键菜单（9 项）、Tab / Shift+Tab 线性导航
- [x] **批次 I · 列顺序与表头效率** ✅ —— 列顺序拖拽（`personal[uid].fieldOrder`）、表头右键菜单、双击列宽把手自动适应、**列序稳定化缺陷修复**（服务端补 `created_at, id` 次序，前端按字段名兜底）

---

## 九、未完成 / 偏差汇总（按建议优先级）

| 优先级 | 事项 | 影响面 | 建议动作 |
| --- | --- | --- | --- |
| P0 | **XLSX 导入**（导出已有） | 导入闭环 | 复用 `export/xlsx.ts` 的解析思路（SheetJS 或自研读包） |
| P0 | **记录级授权有效期 / 按部门授权** | 权限完整性 | `base_record_acl` 加 `expires_at` / `subject_type` + `ensure*Schema` |
| P1 | **跨 Base / 跨空间关联** | 关联能力上限 | `service.go:1547` 放开并加权限校验 |
| P1 | **link 候选分页 + 远程搜索** | 大表性能 | `relations.go:313` 上限放开 + 游标 |
| P1 | **自定义排序走 keyset** | 深翻页性能 | `query.go` 游标改为按排序键复合锚点 |
| P1 | **SSE 增量拉取（`since`）** | 离线补偿 | 事件体带版本水位 |
| P1 | **字段策略独立表 `base_field_policies`** | 字段删改稳定性 | 抽表 + 回填存量 |
| P2 | **XLSX 导入 + CSV 行级重试 + 粘贴类型转换** | 导入体验 | 统一解析管线 |
| P2 | **批量拖拽排序 / 跨表拖拽** | 批量效率 | 看板 / 画廊批量操作 |
| P2 | **压测扩到 1000+ 行 / 50 并发** | 性能承诺 | 扩 `cmd/loadtest` 场景 |
| P2 | **配置包加密 + 幂等清理调度** | 安全 / 运维 | AES-GCM + 每日清理任务 |
| — | WebSocket 通道 | 协同时延 | 有意不做（事件协议已兼容，可平移） |
| — | Redis / MinIO | 基础设施 | 有意不做（复用 media + PG） |

---

## 九·补 第五节未完成项已全部落地（批次 J / K / L）

> 第五节（未完成项）逐条销项，全部已实现并验收；技术方案第 48 章、验收报告 3.77~3.79。

| 优先级 | 事项 | 状态 | 落点 |
| --- | --- | --- | --- |
| P0 | XLSX 导入 | ✅ 完成 | `modules/base/import/xlsx.ts`（零依赖 ZIP+XML，STORE/DEFLATE、日期系统）；`BaseImportDialog` 多工作表 |
| P0 | 记录级授权有效期 / 按部门授权 | ✅ 完成 | `base_record_grants` + `subject_type/subject_id/expires_at`；`GET /base/departments`；抽屉授权名单带有效期与部门 |
| P1 | 跨 Base 关联 | ✅ 完成 | `relations.go::validateLinkRefs` 放开同空间跨 Base + 记录可见性校验 |
| P1 | link 候选分页 + 远程搜索 | ✅ 完成 | `ListLinkTargetsPage`（keyset 游标 + keyword + targetTableId）；前端「加载更多」 |
| P1 | 自定义排序走 keyset | ✅ 完成 | `query.go` `k2:` 游标（排序值 + sort_order + id），NULLS LAST 单独处理 |
| P1 | SSE 增量（`since`） | ✅ 完成 | `ReplaySinceTime` + `?since=<RFC3339>` |
| P1 | 字段策略独立表 | ✅ 完成 | `base_field_policies`（建表 + 回填 + 双写），读取以表为准 |
| P1 | 查询 OR 叠加 | ✅ 完成 | 组合口径 `override \| and \| or`，工具栏三段按钮组 |
| P1 | 反向关系独立表 | ✅ 完成 | `base_record_reverse_links` 与正向表双写，反查走索引 |
| P2 | 行级重试与类型转换 | ✅ 完成 | 导入前类型预检 + 行内修正表 + 修正后重试（行号映射回原始行） |
| P2 | 批量拖拽排序 | ✅ 完成 | 行首拖拽把手（整批移动、落点指示线），落库 `reorderRecords` |
| P2 | 压测扩容 | ✅ 完成 | `cmd/loadtest` `-scale small/medium/large`（1000~5000 行 / 10~50 并发）+ 深翻页、批量写入场景 |
| P2 | 配置包加密 + 幂等清理调度 | ✅ 完成 | AES-256-GCM + PBKDF2（`config-export/import-encrypted`）；`StartIdempotencyPurge` 每小时清理 |

---

## 十、证据与门禁（本次核对时点）

- 后端：`go build ./...` ✅；`go test ./internal/base/...` ✅
- 前端：`npx vitest run` → **2069 passed / 6 failed**（6 个失败文件全部在 `rte/**`，与基线一致）；
  `npx vue-tsc -b` → **62 errors**（基线一致，全部在 `src/components/rte/**` 与 `src/utils/rte*.ts`）；`npx vite build` ✅
- 浏览器：授权区（部门 + 有效期）、行拖拽把手、导入行内修正均实测通过；DOM 数值见技术方案第 48 章
- 数据库：新表 `base_field_policies` / `base_record_reverse_links` 已建，
  `base_record_grants` 三列已迁移并回填；调试产生的临时授权 / 临时记录已清理
- 文档：技术方案第 44~48 章、验收报告 3.73~3.79、修订清单 C2-113~C2-134
- **未提交 git、未推 main、未同步远端服务器**

---

## 十一、待补齐清单 18 项 · 逐条销项（批次 M，2026-11-27）

> 依据：技术方案第 49 章 / 验收报告 3.80 节。
> 编号沿用「遗留缺口清单」的 P0 / P1 / P2 序列，本节为**独立的一组 18 项**（与第七节的历史编号不冲突）。

### P0（4 项）

- [x] **只读 GET 接口** ✅ —— `GET /base/bases/:baseId`、`GET /base/records/:recordId`、
  `GET /base/views/:viewId`（`internal/base/read.go`）；全部走 `assertAccess` + `datascope`，跨空间按不存在处理。
- [x] **视图查询接口** ✅ —— `POST /base/views/:viewId/query`；视图配置为默认口径，请求体可临时覆盖
  `filter / sort / groupBy / limit / cursor`，与表格查询共用同一条 SQL 生成管线。
- [x] **事件类型补齐（5 → 10）** ✅ —— 新增 `record.batch_updated` / `field.created` / `field.updated` /
  `field.deleted` / `view.updated` / `formula.calculated` / `schema.changed`；
  事件与业务写入同事务，`schema.changed` 携带 `schemaVersion`。
- [x] **字段类型迁移可回滚** ✅ —— `reindexTableTx` 同事务重建投影，失败整体回滚；
  成功后同步推进 `base_apps.schema_version`。

### P1（5 项）

- [x] **异步导入任务** ✅ —— `base_import_jobs` 表 + 4 个接口（提交 / 查询 / 列表 / 取消）
  + `StartImportJobWorker` + `resumeStalledImportJobs`（恢复被进程杀死而卡 running 的任务）。
- [x] **可观测性指标** ✅ —— `GET /base/metrics`（P50/P95/P99、慢查询、outbox published/failed/dead、
  幂等冲突、订阅数）+ `GET /base/metrics/prometheus`。
- [x] **数据库连接池 30 → 50** ✅ —— `DB_MAX_OPEN_CONNS` 默认 50，纳入分层配置。
- [x] **跨实例事件** ✅ —— Outbox 共享总线 + 每实例 `outboxCursor` 水位，启动续拉、不重不漏。
- [x] **字段类型兼容路径** ✅ —— `GET /base/fields/types` 与 `GET /base/field-types` 同源返回。

### P2（9 项）

- [x] **FieldHandler 扩展** ✅ —— `RichFieldHandler`（`Serialize` / `Deserialize` / `BuildFilter` / `BuildSort`）
  + `defaultRichHandler` 兜底；`conditionSQL` / `buildOrderSQL` 改为委托，**行为与改造前完全一致**。
- [x] **tenant_id 显式化** ✅ —— 17 张 `base_*` 表加 `tenant_id` + `ensureBaseTenantID` 链路回填 + 17 个租户索引；
  修掉了「回填条件只判 `IS NULL`」与「`UPDATE ... FROM` 同名列未限定别名」两个真实缺陷。
- [x] **租户级动态限流** ✅ —— 租户桶 + 用户桶双层；`SetQuotaResolver` 按空间成员数动态放大，
  上限 `BASE_TENANT_SCALE_MAX`（默认 8），超限 `42901`。
- [x] **操作日志归档** ✅ —— `ArchiveOperationLogs` / `PurgeOutbox` / `PurgeImportJobs` / `StartMaintenance`。
- [x] **Outbox 死信与重试** ✅ —— `OutboxStatusDead` + 死信列表 + 人工重投接口 +
  `metamatrix_base_outbox_dead_total` 指标。
- [x] **user_group 字段与通讯录分组** ✅ —— `base_user_groups` 表 + 4 个接口 + `FieldUserGroup` 类型 + 成员校验。
- [x] **分层 YAML 配置** ✅ —— `configs/{default,dev,prod}.yaml` + `internal/config/layered.go`
  （default → `${APP_ENV}` → 环境变量，后者最高优先级）。
- [x] **Base 专项 E2E** ✅ —— `pros/web/scripts/base-engine-e2e.mjs`，27 项断言全 PASS，跑完自动清理 E2E 空间。
- [x] **并发与顺序验收** ✅ —— `internal/base/event_order_test.go`：乱序归一化、版本号单调、
  `formula.calculated` 晚于 `record.updated`。

### 门禁与证据

- 后端：`go build ./...` ✅；`go test ./internal/...` ✅ 全绿（含表名守卫测试）；
  真实 Postgres 并发/顺序/租户用例 ✅。
- 前端：`vitest` 285 passed / 6 failed（6 个全在 `rte/**`，基线一致）；
  `vue-tsc` 62 errors（全部基线文件，`modules/base` 0 错误）。
- E2E：27/27 PASS + 浏览器截图无 JS 报错。
- 数据库：17 张 `base_*` 表 `tenant_id` 列与索引齐备，存量零值 tenant 行数全部归 0。
- 文档：技术方案第 49 章、验收报告 3.80 节、修订清单 C2-138~C2-155。
- **未提交 git、未推 main、未同步远端服务器。**

---

## 十二、批次 M 附带修掉的 6 个真实缺陷

| # | 缺陷 | 影响 | 落点 |
| --- | --- | --- | --- |
| 1 | `tenant_id` 回填条件只判 `IS NULL`（列是 `NOT NULL DEFAULT 零值`） | 回填**静默失效**，租户列形同虚设 | `internal/db/db.go::ensureBaseTenantID` |
| 2 | `UPDATE ... FROM` 下同名列未限定别名 | Postgres 报 `column reference is ambiguous` | 同上（`unassigned(alias)` 带别名） |
| 3 | Postgres 事务中毒：多处「吞错误」 | 一条失败语句毒死整个事务，后续全部 `current transaction is aborted` | `syncFieldPolicy` / `writeEventOptional` / `syncRecordLinks` / `recomputeFormulas` 改为先 `HasTable` |
| 4 | 跨空间越权：`loadTableSchema` / `scopeLoadRecord` 无租户校验 | 可读到别空间的表结构 | 补租户校验（别空间按不存在、孤儿表放行） |
| 5 | 回填链路对 `project_id` 为零值的脏数据失效 | `base_record_reverse_links` 永远回填不出租户 | 改走「经 `base_apps` 关联」+「源记录链路」 |
| 6 | 空间删除不清理 `base_*` 数据 | 孤儿 Base、租户统计失真、`tenant_id` 无归属 | `ProjectsService.Delete` → `deleteProjectBaseData` 级联硬删 + 用例 |

- E2E 脚本同步加了**跑完自动删除空间**（此前每跑一次残留一个空间），并清理了历史残留数据。
- 最终复核：`base_apps` 中 `project_id` 指向已删空间的孤儿数为 **0**；
  17 张 `base_*` 表的零值 `tenant_id` 行数全部为 **0**。

---

## 十三、运行时取证审计（18 项行为证明）

> 第十一节证明「18 项都实现了」；本节证明「**每一项的行为真的成立**」，含负向断言。
> 审计脚本：`pros/web/scripts/base-engine-audit.mjs`（`npm run test:e2e:base:audit`），
> 27 项断言全 PASS；另 4 项由真实 Postgres 用例覆盖。

| 项 | 取证方式 | 结果 |
| --- | --- | --- |
| P0-1 只读 GET | HTTP 实测 3 条 + 跨空间负向断言 | ✅ 3 条 200；跨空间 **404** |
| P0-2 视图查询 | HTTP 实测 + 覆盖筛选 | ✅ records=1；命中=1 |
| P0-3 事件类型 | SSE 实读事件帧 | ✅ `schema.changed` / `field.created` / `record.created` 全部推到 |
| P0-4 迁移可回滚 | HTTP 实测 + 不兼容负向断言 | ✅ 成功迁移 200；不兼容 **42202**；迁移后数据仍在 |
| P1-5 异步导入 | HTTP 实测 + 轮询 | ✅ 202 → succeeded（ok=2） |
| P1-6 可观测性 | HTTP 实测 + Prometheus 文本 | ✅ 13 项指标齐备 |
| P1-7 连接池 | `internal/db/pool_test.go`（真实 PG） | ✅ 默认 50；环境变量 / PoolOptions 均可覆盖 |
| P1-8 跨实例事件 | `internal/base/cross_instance_event_test.go`（真实 PG） | ✅ A 产生 → B 收到；水位单调不重投 |
| P1-9 兼容路径 | HTTP 实测 | ✅ 26/26 同源 |
| P2-10 FieldHandler 扩展 | HTTP 实测（排序查询仍正常） | ✅ records=3，行为不变 |
| P2-11 tenant_id | DB 实查 17 表 | ✅ 零值行数全为 0；孤儿 Base 数 0 |
| P2-12 租户级限流 | 400 次连打负向断言 | ✅ 命中 **429** |
| P2-13 操作日志归档 | `internal/base/maintenance.go` + 服务启动拉起 | ✅ |
| P2-14 死信与重投 | `internal/base/deadletter_test.go`（真实 PG） | ✅ 重投后**真的送达**，状态回 published |
| P2-15 user_group | HTTP 实测增查删 + 建字段 | ✅ 201 / 可读 / 可删 |
| P2-16 分层 YAML | `internal/config/layered_priority_test.go` | ✅ 环境变量 > 环境层 > 基础层 > 默认值 |
| P2-17 专项 E2E | `npm run test:e2e:base` | ✅ 27/27，跑完自动清理空间 |
| P2-18 并发与顺序 | 真实 PG 13 例 | ✅ 全部 PASS |

### 前端接线复核（补 3.82）

第十一~十三节证明了后端行为；这里补一个此前被忽略的事实：
`src/modules/base/api.ts` 里 15 个新函数**调用点全为 0**（死代码，用户点不到）。
现已全部接线并经浏览器实测（`npm run test:e2e:base:ops`，13/13 PASS）：

| 接口族 | 界面落点 |
| --- | --- |
| 指标 / 死信 / 导入任务 / 通讯录分组 | 新增「运行监控」抽屉（4 页签），工具栏入口 |
| 异步导入任务 | 导入弹窗「异步模式」开关（≥500 行建议开启） |
| 只读 GET（视图 / 记录 / Base） | 切视图、记录抽屉「刷新最新值」、Base 设置「读取服务端最新信息」 |
| 视图查询 | 主列表在「生效口径 = 视图配置」时走 `POST /views/:viewId/query`（服务端执行） |

### 审计额外暴露并修掉的缺陷（第 7 个）

**死信重投实际不会投递** —— `RetryDeadLetter` 只把 `status` 改回 `pending`，
但发布器按「时间 + ID」水位单调向前读事件，已读过的行不会再被读到；
死信因此永远卡在 `pending`，接口返回成功但事件**永远不送达**。
修复：同时刷新 `created_at` 让事件重新进入水位窗口，`retry_count` 归零、`published_at` 清空。
回归用例 `TestDeadLetterRetryIsActuallyRedelivered`。

## 十五、批次 N：写路径吞吐治理（补 3.83）

> 18 项交付后用 `loadtest -scale large` 复测，发现写路径整体不成立。
> 本节核对「死锁根因是否真的修掉」与「往返数是否真的与行数脱钩」。

### 15.1 死锁根因核对

| 检查项 | 旧实现 | 现状 | 证据 |
| --- | --- | --- | --- |
| 事务内是否发起走连接池的查询 | 是（`subjectOf` / 校验 / schema） | **否** | `internal/base/service.go`：`newWriteIO` / `prepareRecord` 均在事务外 |
| 权限身份解析次数 | 每行 4~5 次 | **每次写入 1 次** | `writeIO.subj` |
| 存档点实现 | `gorm.SavePoint`（吞错误 + 换连接池） | **原生 `SAVEPOINT`** | `BatchCreatePartial` 内 `tx.Exec("SAVEPOINT …")` |
| 并发批量写 | 必然死锁 | **0.24s 完成** | `batch_deadlock_test.go`（连接池 4 条 / 8 并发） |

### 15.2 往返数核对

| 环节 | 治理前（每行） | 现状（每批） |
| --- | --- | --- |
| 投影写入 | 每字段 DELETE + INSERT + 单独查类型 | 1 次 DELETE + 1 次批量 INSERT |
| 公式 | 全库扫描 | 按表过滤，整批 1 次 |
| 表结构 / 字段索引 / 权限 | 每行重查 | 循环外 1 次 |
| 排序位 | 每行 `MAX(sort_order)` | 事务内 1 次 |
| 审计 / 发件箱 | 每行各 1 次 INSERT | 攒批，事务收尾批量插入 |
| 关系维护 | 无 link 字段也删 2 次 | 无 link 字段跳过 |

### 15.3 验收结论

- `loadtest -scale large`：**8 个场景全部 0 错**，批量写入 ≈ 6,600 行/秒；
- 串行播种 5000 行：17.7s → **4.45s**；
- 后端门禁全绿，E2E 27/27，前端门禁与基线一致（`vitest` 6 失败 / `vue-tsc` 62 错误均在 `rte/**`）。
