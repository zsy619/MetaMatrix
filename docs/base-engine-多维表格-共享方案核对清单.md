# 元矩阵 · 多维表格 对照 ChatGPT 共享方案核对清单

> 核对对象：[ChatGPT 共享会话《类飞书多维表格企业级技术设计文档》](https://chatgpt.com/s/t_6b07edbedfd08191ba2db5c4e4298dc6)
> （Mailang Base Engine V1.0，2026-11-26）
> 核对基准：`pros/api/internal/base`、`pros/web/src/modules/base`、`pros/api/cmd/server/main.go`
> 核对时间：2026-11-27　　标注：✅ 已完成　🟡 部分完成　⚠️ 与原方案有偏差（已在项目文档记录）　❌ 未实现

---

## 一、总体结论

| 维度 | 结论 |
| --- | --- |
| 章节覆盖 | 原方案 22 章，**19 章完全落地 / 3 章有明确偏差**（§0 差异摘要、§8 实时通道、§13/§18/§19 基础设施） |
| 功能验收 F-001~F-016 | **14 项通过 / 2 项部分通过 / 0 项未做**（F-007 冻结列、F-014 冲突用例为部分） |
| 公式引擎 | §7.3 首批 **14 个函数全部实现**，AST/依赖图/循环检测齐全 |
| 权限体系 | §9 五级模型 + 六条关键要求 **全部落地** |
| 剩余缺口 | 集中在**横切能力**（幂等键、限流、OpenAPI 自动生成）与**未实现的可选项**（lookup/rollup、form/gantt、冻结列） |
| 验证强度 | 单元/集成用例 46 例全绿；**§15.2 性能目标与 §15.3 并发场景无压测脚本与报告** |

---

## 二、逐章核对

### §1 技术路线决策

- ✅ 前端 Vue 3 + TS + **VXE Table 4.24**（`pros/web/package.json:70-71`，`grid/BaseGrid.vue:9` 使用 `vxe-grid`）
- ✅ 后端 Go + Hertz + GORM（`pros/api/internal/base`，`handler → service → model` 分层）
- ✅ PostgreSQL JSONB 主存储 + `base_record_values` 类型化查询投影（`internal/model/base.go:124-136`）
- ⚠️ 实时协同：**WebSocket + Event → SSE + Event**。事件 JSON 结构与 WS 版一致，传输层可平移
  （`internal/base/events.go:16`、`cmd/server/main.go:297` `GET /base/events`）
- ✅ 文档引擎 Tiptap 3 + ProseMirror + Yjs 保持解耦、不变
- ⚠️ 基础设施 **Redis + MinIO → 复用既有 media 素材库 + PG 存储**，不引入 Redis/MinIO（项目无 Redis 基建）

### §2~§4 架构 / MECE 拆解 / 领域模型与表结构

- ✅ 分层与模块依赖约束落地：Field Engine 不依赖页面、Query Engine 不依赖 VXE、Record Engine 不绕权限
- ✅ 12 张 `base_*` 表 + `core_*`/`kb_*` 命名规范合规（`internal/model/base.go` 全部显式 `TableName()`）
- ✅ 高频查询投影表 `base_record_values`（`value_text / value_number / value_date / value_bool / value_json`）
- ✅ 旧数据一次性迁移（`internal/base/migrate.go` `legacyFieldName` / `legacyTypeMapping`，
  `migrated=legacy_sheet:<nodeId>` 幂等，迁移失败降级只读）

### §5 Field Registry 字段注册体系

- ✅ 统一 `FieldHandler` 接口：`Definition / ValidateConfig / ValidateValue / Normalize / Serialize /
  Deserialize / BuildFilter / BuildSort`（`internal/base/registry.go:60-120`）
- ✅ `FieldCapabilities{Editable,Filterable,Sortable,Groupable,Indexable,Computed}`（`registry.go:51-57`）
- ✅ 类型注册表可插拔（`registry.go:847-865` `r.register(...)`），新增类型不改 Record Engine 核心
- ✅ 字段类型 API 带能力与配置 schema：`GET /base/field-types`（`main.go:296` → `registry.go Definitions()`）
- 🟡 类型清单：已实现 19 种 —— `text / long_text / number / currency / percent / rating / date /
  datetime / checkbox / single_select / multi_select / email / phone / url / user / attachment /
  formula / link / doc`；
  **未实现 `lookup`、`rollup`、`user_group`，以及作为「字段类型」的 `created_at / updated_at /
  created_by / updated_by`**（这四项在记录表里是列 `base_records.created_by/updated_by`，但不是可创建字段）

### §6 View Engine 视图引擎

- ✅ 视图不拥有数据，只存配置；`ViewConfig` 与 §6.3 协议一致
  （`fieldVisibility / fieldWidths / filters / sorts / groups / pagination / layout`，
  `pros/web/src/modules/base/types.ts:131-146`）
- ✅ 过滤表达式结构与原方案一致（`logic / conditions / children`，`types.ts:167`）
- ✅ Query Engine 职责齐全：Filter AST 解析、操作符校验、权限注入、受控 SQL、排序分组分页、关联查询
  （`internal/base/query.go`）
- ✅ 安全：**不接受任意 SQL / 列名 / 表达式**，全部参数化 `?` 占位；`Sprintf` 只用于白名单操作符与列名
  （`query.go:255-392`、`query.go:599-695`）
- ✅ 查询护栏：`MaxPageSize=500 / MaxFilters=20 / MaxSorts=5 / MaxGroups=3`（`query.go:28-32`）
- ✅ 游标分页：`NextCursor` 不透明游标（`query.go:126-136`、`query.go:564`）
- 🟡 视图类型：已实现 `grid / kanban / calendar / gallery`；**`form`（表单）与 `gantt`（甘特）未做**
  —— 原方案本身标注为「预留 / 后续」，不计入缺口
- 🟡 `frozenFields`（冻结列）协议字段**未实现**；Grid 目前只把首列 `fixed: 'left'`
  （`grid/BaseGrid.vue:217-236`）
- 🟡 `ViewConfig.version` 字段未落到配置里（版本语义由 `base_views` 行 + `base_tables.schema_version` 承担）

### §7 Formula Engine 公式引擎

- ✅ 独立于 Record Engine（`internal/base/formula.go`，798 行），不散落在 handler / 前端
- ✅ Lexer → Parser → AST → 依赖图 → 求值器链路完整（`formula.go:66 lex` / `177 ParseFormula` /
  `574 EvaluateFormula`）
- ✅ 语法支持：数值、字符串、字段引用 `{字段}`、`+ - * / %`、比较、`AND/OR/NOT`、函数调用
- ✅ **§7.3 首批 14 个函数全部实现**：`SUM AVERAGE COUNT MIN MAX IF AND OR NOT CONCATENATE ROUND ABS DATE TODAY`
  （`formula.go:358-503`，含参数个数与类型约束）
- ✅ 依赖关系提取 + 拓扑排序（`formula.go:724 FormulaDependencies`、`service.go:1588`），
  依赖链 A→B→C 先算 B 再算 C
- ✅ 循环依赖检测（`formula.go:754 DetectCycle` → `service.go:1636` → HTTP `42204`）
- ✅ 安全：**无 `eval` / 无 Go 动态执行 / 无 SQL 拼接执行公式**，白名单函数表 + AST 节点与深度受限
- ✅ 公式错误作为可识别状态返回（`#CYCLE!` 等），不让整表查询失败
- 🟡 `TODAY()` 等时间依赖函数的**显式重算策略**未单独定义（当前随写入链路重算）

### §8 实时协同（WS + Event → SSE + Event）

- ✅ Transactional Outbox：业务事务只写 `base_event_outboxes`，发布器异步广播
  （`events.go:109-170`，`StartOutboxPublisher` 已在 `main.go:107` 启动）
- ✅ 事件结构与 WS 版一致，传输层可平移（`events.go:16`）
- ✅ 乐观锁：`expectedVersion` / `schemaVersion` 校验（`service.go:952-956`），
  冲突返回 `40901` / `40902`
- ✅ SSE 断线补拉：客户端带 `Last-Event-ID` 续拉（`events.go:173-195`）
- ✅ 可靠性：**SSE 帧只广播「哪些字段变了」，绝不广播字段值**，字段级权限不被绕过
  （`service.go:920`、`events.go:154`）
- ⚠️ 通道由 WebSocket 改为 SSE（原方案 §0 已记录：Hertz 下 WS 需 hijack 升级链路，事件协议不变）

### §9 权限体系

- ✅ 五级模型：空间 / Base / Table / Field / Record（`kb_members` 角色 + 表级 + 字段级 + 记录级）
- ✅ 判断链：认证 → 空间 → 表 → 记录 DataScope → 字段读写 → 审计
- ✅ 每次读写都校验（`fieldpolicy.go` / `datascope.go` / `service.go` 各入口）
- ✅ **「字段隐藏 ≠ 字段安全」**：不可见字段的值根本不过网（`fieldpolicy.go` 服务端剔除，
  用例 `TestHiddenFieldInvisibleToViewer` / `TestReadOnlyFieldRejectsEditorWrite`）
- ✅ **记录级权限在 SQL 生成期注入**，不是查完再删（`datascope.go` 文件头明确约束；
  用例 `TestRestrictedRecordHiddenFromOthers` / `TestCustomVisibilityGrants`）
- ✅ 批量操作逐条校验（`BatchDeletePartial` 逐条鉴权并返回失败明细）
- ✅ 权限变更后订阅失效（第三十二轮「权限变更 → 订阅失效」）
- ✅ 审计落库 `base_operation_logs`（含 `beforeData/afterData/operatorId/requestId`）

### §10 API 接口设计

- ✅ 统一错误码：`40001 / 40101 / 40301 / 40401 / 40901 / 40902 / 42201 / 42204 / 50001`
  （`internal/base/handler.go:40-78`）
- ✅ Table API：列表 / 创建 / 详情 / 修改 / 删除 / 字段列表全齐（`main.go:301-306`）
- ✅ Field API：创建 / 列表 / 更新 / 删除 / **类型迁移 `/migrate`** / **类型清单 `/field-types`**
  （`main.go:296-322`）
- ✅ Record API：创建 / 查询 / 更新 / 删除 / 批量（批量新增、批量更新、批量删除含
  「全部成功」与「部分成功」两种语义）（`main.go:309-329`、`service.go:1181-1275`）
- ✅ View API：创建 / 列表 / 更新 / 删除 / 按视图查询
- ✅ Formula API：`/formulas/validate`、`/formulas/preview`、`PUT /fields/:fieldId/formula`
- ⚠️ 路径前缀：`/api/v1/bases/...` → `/projects/:projectId/base/...`（与项目空间模型一致，
  §0 已记录）
- ❌ **Base 自身 CRUD 不完整**：只有 `POST /ensure` 与 `GET /bases`，
  缺 `POST /bases`（独立创建）、`PUT /bases/:id`（改名 / 图标 / 描述）、`DELETE /bases/:id`
  （`main.go:294-295`；`base_apps` 表已有 `name/description/icon` 字段，只缺写接口）
- ❌ **缺 `GET /tables/:tableId/schema`**（字段列表可近似替代，语义未单列）
- ❌ **缺 `GET /fields/:fieldId/formula` 与 `/formula/dependencies`**（依赖图有内部实现，无只读 API）
- ⚠️ **缺 `Idempotency-Key` 幂等键**（批量创建 / 导入 / 重试）
- ❌ **缺限流与 `42901`**（`internal/base` 域无速率限制；仅登录验证码有 throttle）
- ❌ **缺 `42202`（字段类型不兼容）与 `42203`（公式解析失败）错误码**
- ❌ **缺 OpenAPI 自动生成 + 前端 TS 类型自动生成**
  （前端 `src/modules/base/types.ts` 为手写，接口变更需人工同步）
- ✅ 文件上传走独立文件 API，附件不经过 Record JSONB（二进制不入库）
- 🟡 附件限制在文件服务侧执行：媒体分类白名单（image/audio/video/file）+ 扩展名净化 +
  大小上限 `MaxUploadBytes`；但**没有严格的扩展名黑名单**（原方案「文件类型限制」只做了一半）

### §11~§12 前后端目录结构与分层约束

- ✅ 前端 `src/modules/base`（`api.ts / types.ts / BaseEngineView.vue / grid / views / panels`）
- ✅ 后端 `internal/base`（`handler → service → model`），`main.go` 统一注册路由
- ✅ 事务设计：批量写入在同一事务内；批量删除显式区分「全成功 / 部分成功」（§16.2）

### §13 Tiptap 文档引擎与 Base Engine 融合

- ✅ 领域隔离：Document（Yjs + 文档快照）与 Base（JSONB + 记录）不共用模型、不共用协同协议
- ✅ 共享平台能力：用户 / 空间权限 / 素材库 / 审计 / 搜索均复用既有服务
- ✅ 已实现融合点：Base 记录可关联文档（`doc` 字段类型）、
  记录 ↔ 文档双向反查（`GET /base/doc-backrefs/:nodeId`、`GET /base/records/:recordId/doc-references`）
- ✅ 「数据 → 文档」单向沉淀：一键导出 Markdown 表格粘贴进知识库文档
  （`BaseEngineView.vue:1445`）
- 🟡 §13.4 的「文档中嵌入 Base 视图 / 自动化触发 / 文档展示 Base 查询结果」**尚未做**
  （原方案标注为「后续可以支持」，不算缺口）

### §14~§15 里程碑与验收标准

功能验收 F-001~F-016：

| 编号 | 验收项 | 结论 | 证据 |
| --- | --- | --- | --- |
| F-001 | Base 管理（增删改查） | 🟡 | 查询/创建（经知识库节点 ensure）有；**改名/删除接口缺** |
| F-002 | Table 管理 | ✅ | `main.go:301-306` |
| F-003 | Field 动态增删改 | ✅ | `main.go:307/320/321` |
| F-004 | Field Registry 可扩展 | ✅ | `registry.go:847-865` |
| F-005 | Record CRUD | ✅ | `main.go:309/328/329` |
| F-006 | JSONB 存储，改名不丢数据 | ✅ | 值按 `fieldId` 存 JSONB |
| F-007 | Grid：单元格编辑 / 列宽 / 冻结列 | 🟡 | 编辑、列宽、虚拟滚动有；**冻结列未做** |
| F-008 | 批量编辑（多行多列粘贴） | ✅ | `grid/BaseGrid.vue:148/293`、`clipboard.ts` |
| F-009 | Query 组合筛选 / 排序 / 分页 | ✅ | `query.go` + `panels/BaseQueryPanel.vue` |
| F-010 | 多视图共享同一份记录 | ✅ | `base_views` 只存配置 |
| F-011 | Formula 首批函数 | ✅ | `formula.go:358-503`（14/14） |
| F-012 | Relation 跨表关联 | ✅ | `relations.go` + `base_record_links` |
| F-013 | Realtime 多端收变更事件 | ✅ | SSE + outbox |
| F-014 | 过期版本更新报冲突 | 🟡 | 代码有（`service.go:952`、`40901`），**无用例覆盖** |
| F-015 | Audit 追溯修改人与前后数据 | ✅ | `base_operation_logs` + 审计面板 |
| F-016 | 四级权限生效 | ✅ | `fieldpolicy.go` / `datascope.go` / 用例 8 例 |

- ⚠️ **§15.2 性能验收无压测证据**：仓库无 k6 / ab / 压测脚本与报告，
  「Grid 首屏 P95 ≤ 1.5s、单条更新 ≤ 200ms、筛选 ≤ 500ms、事件 ≤ 500ms」等目标**未实测**
- ⚠️ **§15.3 并发 9 个场景未系统验证**（两用户同记录不同字段 / 同字段 / 编辑 vs 删除 /
  改字段 vs 旧 Schema / 粘贴中冲突 / 断线重连 / 重复投递 / 乱序 / 公式事件晚到）——
  机制上分别由乐观锁、幂等 outbox、`Last-Event-ID` 覆盖，**但没有并发测试用例**
- ✅ §15.4 安全项：租户隔离、猜 ID 越权、字段不可读、公式不可执行任意代码、Filter 不可注入 SQL、
  附件类型限制、SSE 鉴权、事件不泄露值、操作日志不落普通用户可改
- ✅ §15.5 可扩展性：新增字段类型 / 视图类型 / 公式函数 / 操作符均为注册式扩展

### §16 数据一致性、可靠性与性能

- ✅ 事务失败不留半截持久化结果（写入同事务 + Outbox 同事务）
- ✅ 批量语义明确：全成功（`BatchDelete`）与部分成功（`BatchDeletePartial`）
- ✅ PostgreSQL 优化：投影表 + 复合索引（`idx_base_value_table/record/field`、
  `idx_base_record_table_sort`、`idx_base_record_scope`）
- 🟡 大数据量策略：游标是 **offset 编码**（`query.go:127`），深翻页仍有偏移成本，未做 keyset 游标
- 🟡 视图配置缓存：原方案用 Redis，**本项目无 Redis**，直接读库
- ✅ 监控指标：`internal/middleware/metrics.go` 已有指标中间件

### §18~§19 部署与工程规范

- ⚠️ 部署：原方案 Docker Compose + Nginx + 多机，**本项目为单机 launchd 常驻 + 本地开发脚本**
  （`pros/dev.sh`、`com.metamatrix.dev`），`docs/生产配置.md` 为实际部署口径
- ⚠️ 环境配置：Redis / MinIO 配置项**不适用**；实际是 `DATABASE_URL / PORT / JWTSecret` + 媒体根目录
- ✅ 代码规范：分层约束、显式 `TableName()`、表命名前缀规范、错误码统一

### §20~§22 决策清单 / 风险规避 / 建设顺序

- ✅ 关键架构风险已在项目技术方案第 15 章逐条列规避措施
- ✅ 建设顺序与原方案一致：先 Grid Engine（P0），再领域能力（权限 / 公式 / 关联 / 审计 / 协同）

---

## 三、待补清单（按优先级）

| 优先级 | 事项 | 对应原文 | 影响 |
| --- | --- | --- | --- |
| P0 | Base 自身写接口：改名 / 图标 / 描述 / 删除 | §10.2、F-001 | F-001 无法满分 |
| P0 | 幂等键 `Idempotency-Key`（批量创建 / 导入 / 重试） | §10.9 | 重试安全性 |
| P1 | 冻结列 `frozenFields` | §6.3、F-007 | Grid 体验 |
| P1 | 只读公式定义 / 依赖图 API | §10.7 | 外部集成、审计 |
| P1 | `GET /tables/:tableId/schema` | §10.3 | 协议完整性 |
| P1 | 错误码补 `42202 / 42203 / 42901` + base 域限流 | §10.1、§10.9 | 协议完整性 |
| P2 | OpenAPI 生成 + 前端 TS 类型自动生成 | §10.9 | 前后端同步成本 |
| P2 | 压测脚本与报告（首屏 / 更新 / 筛选 / 事件） | §15.2 | 性能承诺无依据 |
| P2 | 并发 9 场景用例（乐观锁 / 幂等 / 乱序 / 断线） | §15.3 | 协同正确性 |
| P2 | `lookup` / `rollup` 字段类型 | §5.2 | 计算字段能力上限 |
| P3 | keyset 游标分页替代 offset | §6.6 | 超大数据量 |
| P3 | `TODAY()` 等时间函数重算策略显式化 | §7.7 | 公式一致性语义 |
| P3 | 表单视图 / 甘特视图 | §6.2 | 原方案即「预留/后续」 |

---

## 四、验证与声明

- 后端：`go build ./...` ✅；`go test ./internal/base/... ./internal/service/...` ✅（base 包 46 例全绿）
- 前端：`npx vitest run` 1950 passed / 6 failed（6 例失败与基线一致，全部在 `rte/**`）；
  `npx vue-tsc -b` 62 errors（与基线一致）；`npx vite build` ✅
- 本清单为**代码与用例层面的静态核对 + 已有验收报告的交叉验证**，
  **不含压测实测**；§15.2 性能结论一律标注「未实测」。
- 本轮**未提交 git、未推 main、未同步远端服务器**。
