# 元矩阵 · 多维表格 三方对照复盘（ChatGPT 共享方案 ↔ 本项目实现）

> 复盘日期：2026-11-28
> 复盘对象（三方对照）：
>
> - **A（本次指定链接）**：[ChatGPT 分享《飞书文档编辑器技术架构深度分析》](https://chatgpt.com/s/t_6b07df2340348191baa2c7bc6ffee7c1)
> - **B（多维表格原始规范）**：[ChatGPT 分享《类飞书多维表格企业级技术设计文档》](https://chatgpt.com/s/t_6b07edbedfd08191ba2db5c4e4298dc6)
> - **C（本项目实现）**：`pros/api/internal/base`、`pros/web/src/modules/base`、`pros/api/cmd/server/main.go`
>
> 标注：✅ 已达成　🟡 部分达成　⚠️ 有意偏差　❌ 未实现

---

## 〇、先修正一个前提（重要）

- [x] **A 链接不是多维表格方案**。抓取解包后确认：A 全文 26,117 字，通篇 **0 次**出现「多维表格」「视图」「字段」「Base」，
      主题是**飞书文档编辑器**（Block 模型 / Tiptap 内核 / CRDT 协同 / 块级交互 / 评论与版本）。
      它对多维表格的价值是**工程范式**，不是**功能规格**。
- [x] **多维表格的原始规格在兄弟链接 B**（22 章 / 49,357 字），仓库早已归档核对：
      `docs/base-engine-多维表格-共享方案核对清单.md`（2026-11-27）、`docs/base-engine-多维表格-待执行任务清单.md`。
- [x] **两者的协同模型存在真实分歧**，不是互补：
      - A（文档）：CRDT / Yjs / 字符级冲突合并。
      - B §8.1（多维表格）：**明确否决 Yjs**，理由是「文档改字符、多维表格改单元格/记录，冲突处理模型不同」，
        多维表格走「乐观锁版本号 + 业务事件」。
      - 本项目照 B 执行（`base_records.version` 乐观锁 + SSE 事件），
        文档引擎（`pros/web/src/components/rte`）另走 Yjs，**两套内核解耦不混用**。
- [x] **结论**：本次复盘以 **B 为功能基线**、**A 为实现范式参照**、**C 为复盘对象**；
      凡 A 与 B 冲突处，一律以 B 为准（除非另有显式决策）。

---

## 一、技术框架

### 1.1 A 文档编辑器主张的技术框架（可迁移部分）

- [x] **编辑器内核**：Tiptap / ProseMirror（schema 为唯一事实源，命令驱动，不直接操作 DOM）。
- [x] **文档模型**：Block-based（把文档拆成可独立寻址、可独立授权、可独立协同的块）。
- [x] **协同引擎**：OT / CRDT，A 明确推荐 **Yjs**（`y-prosemirror` 绑定）。
- [x] **扩展体系**：节点扩展（图片 / 表格 / 代码块 / 任务列表 / 流程图）+ 自定义 Block。
- [x] **块级交互**：Block Handle（拖拽把手）、Slash Command（`/` 唤起插入菜单）、Bubble Menu（选区浮动工具条）。
- [x] **文档服务**：增量持久化、版本管理、ACL（查看 / 编辑 / 评论三级）。

### 1.2 B 多维表格主张的技术框架

- [x] **前端**：Vue 3 + TS + **VXE Table**；视图层只消费 `ViewConfig`，不直接拼 SQL。
- [x] **后端**：Go + Hertz + GORM，`handler → service → model` 三层，事件与查询分离。
- [x] **存储**：PostgreSQL **JSONB 主存储 + `base_record_values` 类型化投影**（读写分离的经典做法）。
- [x] **三大引擎解耦**：
      - Field Engine（字段注册表，不依赖页面）
      - Query Engine（不依赖 VXE，纯后端执行）
      - Record Engine（不绕权限层，所有写入经权限）
- [x] **公式引擎**：AST + 依赖图 + 循环检测 + 同步/异步两段计算。
- [x] **实时通道**：SSE / WebSocket + 业务事件（**非 CRDT**）。
- [x] **权限**：空间角色 + 记录级可见性 + 字段级条件可见，五级判断链。

### 1.3 C 本项目现状对照

- [x] 前端栈与 B 一致：`vue@3.5` / `vxe-table@4.24` / `vxe-pc-ui` / `pinia` / `element-plus`（`pros/web/package.json`）。
- [x] 后端栈与 B 一致：`metamatrix/api` + Hertz + GORM；Base 域 60 个 go 文件、**63 条路由**（`cmd/server/main.go:370-439`）。
- [x] 存储模型与 B 一致：`base_records.data` JSONB + `base_record_values` 五列投影
      （`value_text / value_number / value_date / value_bool / value_json`，`internal/model/base.go:151-153`）。
- [x] 表命名已按全局规则收口：**17 张 `base_*` 表** + `core_` / `kb_` / `media_` 四域前缀
      （规范见 `docs/db-table-naming.md`，单一事实源 `internal/model/table_registry.go`）。
- [x] 文档引擎与 Base 引擎**物理隔离**：文档侧 `pros/web/src/components/rte`（Tiptap + Yjs），
      Base 侧 `pros/web/src/modules/base`（VXE），**互不依赖**（对应 B §13 的边界约束）。
- [⚠️] **实时通道是 SSE 而非 WebSocket**（`internal/base/events.go`）——协议按 WS 结构设计，可平移，但当前未做 WS。
- [❌] **未引入 Redis / MinIO**：复用既有 `media_` 素材库 + PG 存配置包，与 B §18 建议有偏差（已在核对清单登记）。

### 1.4 架构分歧的最终定调

- [x] **两套协同内核并存是正确决策，不是欠账**：
      - 文档：字符级 → Yjs CRDT（`y-prosemirror`）。
      - 多维表格：行/单元格级 → `base_records.version` 乐观锁 + 业务事件（`record.updated` / `record.batch_updated`）。
- [x] A 的「Block 模型」在文档侧已落地；在 Base 侧**不应照搬**——Base 的「块」是**记录（Record）**，
      已有独立 `base_records` + 记录级授权 + 字段级策略，等价于 Block 的寻址粒度，无需再造一层。
- [ ] **待决策**：A 提出的「Slash Command / Bubble Menu / Block Handle」三件套在 Base 侧是否需要等价物？
      当前 Base 有「列菜单 `BaseColumnMenu` + 批量对话框 `BaseBatchDialog` + 公式栏」，
      但**没有**「`/` 唤起」「选区浮动条」这类快捷交互（详见 §2.4 缺口 G-06）。

---

## 二、功能点

### 2.1 已达成（对 B 逐章核对，19/22 章完全落地）

- [x] **Field Registry**：统一 `FieldHandler` 接口（`Definition / ValidateConfig / ValidateValue /
      Normalize / Serialize / Deserialize / BuildFilter / BuildSort`，`internal/base/registry.go:82-94`），
      能力位 `FieldCapabilities{Editable,Filterable,Sortable,Groupable,Indexable,Computed}`
      （`internal/base/registry.go:58-65`）。
- [x] **字段类型 26 种**（实测 `GET /base/field-types` 返回 26）：
      `text / long_text / number / currency / percent / rating / date / datetime / checkbox /
      single_select / multi_select / email / phone / url / user / user_group / attachment /
      formula / link / doc / lookup / rollup / created_at / updated_at / created_by / updated_by`。
      较 B 的首批清单多出 `lookup / rollup / user_group` 与 4 个系统字段。
- [x] **公式引擎 44 个函数**（`internal/base/formula.go` 基础 14 个 + `formula_ext.go` 扩展 30 个）：
      聚合 `SUM/AVERAGE/COUNT/MAX/MIN`；逻辑 `IF/IFERROR/AND/OR/NOT/SWITCH` + 字面量 `TRUE/FALSE`；
      文本 `LEFT/RIGHT/MID/LEN/CONCAT/CONCATENATE/FIND/SUBSTITUTE/TRIM/UPPER/LOWER/PROPER`；
      数学 `ABS/ROUND/CEILING/FLOOR/MOD/POWER/SQRT`；
      日期 `TODAY/NOW/YEAR/MONTH/DAY/HOUR/MINUTE/SECOND/WEEKDAY/DATE`；
      类型 `ISBLANK/ISNUMBER/ISTEXT/COALESCE`。
- [x] **View Engine**：视图只存配置不存数据；`ViewConfig` 含
      `fieldVisibility / fieldWidths / fieldOrder / frozenFields / filters / sorts / groups /
      pagination / layout / personal`（`pros/web/src/modules/base/types.ts:159-178`）；
      视图类型 6 种：`grid / kanban / calendar / gallery / form / gantt`。
- [x] **Query Engine**：后端执行，`keyset` 游标（v2 排序位锚点 + **v3 自定义排序字段锚点**，
      `internal/base/query.go:156-162`），旧偏移游标 `o:<n>` 兼容。
- [x] **权限五级链**：空间角色 → Base 可见性 → 表可见性 → 记录级可见性（`applyRecordScope` SQL 过滤）→
      字段级条件可见（逐行 `assertWritableFields`）。
- [x] **记录级授权增强**：`base_record_grants` 已带 `subject_type(user|department)` / `subject_id` / `expires_at`
      （`internal/model/base.go:121-138`）——2026-11-27 缺口 P0-4 的已修项。
- [x] **字段级策略独立表**：`base_field_policies`（`internal/model/base.go:325`）——缺口 P1-3 已修。
- [x] **反向关系独立表**：`base_record_reverse_links`（`internal/model/base.go:351`）——缺口 P1-4 已修。
- [x] **幂等键**：`core_idempotency_keys` + `Service.Idempotent` + **定时清理** `StartIdempotencyPurge`
      （`internal/base/idempotency.go:160`）——缺口 P1-9 已修。
- [x] **离线增量补偿**：`?since=` → `ReplaySinceTime`（`internal/base/handler.go:1384-1413`）——缺口 P1-7 已修。
- [x] **导入导出闭环**：异步导入任务（`base_import_jobs`）+ CSV；**XLSX 导入**（零依赖读取器
      `src/modules/base/import/xlsx.ts`，自带 ZIP STORE/DEFLATE 解包，不引 SheetJS）与
      **XLSX 导出**（`src/modules/base/export/xlsx.ts`）双向闭环——缺口 P0-3 已修。
- [x] **事件体系**（实测 outbox 事件分布）：`record.created` / `record.updated` / `record.batch_updated` /
      `record.deleted` / `field.created` / `field.updated` / `field.deleted` / `field.formula.saved` /
      `schema.changed` / `view.updated` / `permission.changed`。
- [x] **可观测**：`GET /base/metrics` + `GET /base/metrics/prometheus`
      （P50/P95/P99、慢查询、outbox 发布/失败/死信、幂等冲突、订阅数）。
- [x] **OpenAPI**：`GET /openapi.json` 单一来源，前端 `types.gen.ts` 生成类型。
- [x] **测试规模**：后端 Base 域 33 个测试文件 / **116 个用例**；前端 Base 模块 10 个测试文件。

### 2.2 本轮新增（性能）

- [x] **批量更新重写**（`internal/base/batch_update.go`，commit `9dbecf9`）：
      共享上下文（表结构 / 字段索引 / 权限身份 / 投影字段）取一次 →
      补丁只归一化 + 引用校验一次 → 目标记录一次查齐（**SQL 层做可见范围过滤**，消除 N 次角色查询）→
      分块事务（`baseBatchChunk=50`）+ 每行 `SAVEPOINT` → 每行仅 1 次 `UPDATE ... WHERE id=? AND version=?` →
      投影「一次 DELETE + 一次批量 INSERT」→ 审计 / 事件块尾批量落库。
- [x] **关键词检索**（`internal/base/query_keyword.go`）：
      文本分支改**半连接**（`id IN (SELECT record_id FROM base_record_values ... ILIKE ?)`）替代相关 `EXISTS`；
      JSON 分支**仅在表内确有 JSON 投影字段时**才拼（旧实现恒拼，每行都要 `value_json::text` 序列化）；
      文档标题分支改 `ILIKE ANY (ARRAY[...])` 一条覆盖全部节点（旧实现每节点一个 EXISTS）；
      **关键字条件只编译一次**，计数查询与取数查询共用同一份 cond/args。
- [x] **实测前后对比**（同机同库同规模：5000 行 × 20 字段、50 并发、限流器关闭、两组均 0 错误）：

  | 场景 | 指标 | 优化前 | 优化后 | 变化 |
  |---|---|---|---|---|
  | 常规筛选（关键字） | P50 | 368ms | **50ms** | **7.4×** |
  | 常规筛选（关键字） | P95 | 596ms | 85ms | 7.0× |
  | 常规筛选（关键字） | QPS | 131.6 | **934.0** | 7.1× |
  | 批量 100 条编辑 | P50 | 1.118s | **536ms** | **2.1×** |
  | 批量 100 条编辑 | P95 | 1.47s | 945ms | 1.6× |
  | 批量 100 条编辑 | QPS | 45.1 | **89.0** | 2.0× |

- [x] 压测工具修复：`cmd/loadtest` 的写路径前置（目标记录 ID + 文本字段 ID）原先寄生在
      「单条更新」场景的 `Setup` 里，一旦用 `-scenarios` 过滤掉该场景，
      批量场景就带空字段 ID 发请求，压出来的是一地 422 `bad field id` 而不是真实性能。
      已抽成 `resolveWritePrereqs` 并前置到场景循环外（`cmd/loadtest/main.go`）。

### 2.3 A 有、B 没有、C 也没有的部分（本次未实现）

- [x] **Slash Command（`/` 唤起插入菜单）**：C 的 Base 侧无此交互。
- [x] **Bubble Menu（选区浮动工具条）**：C 的 Base 侧只有列菜单与批量对话框。
- [x] **Block Handle 拖拽把手**：C 的 Base 侧是整列拖拽 / 整行拖拽排序，粒度不同。
- [x] **评论 / 批注锚点（Anchor / Annotation）**：B 的多维表格章节未纳入评论体系，A 有。

### 2.4 仍存在的缺口（实测确认，非推测）

**P0 · 影响正确性**

- [ ] **G-01　审计不存变更集**：审计记录是写入当时的快照，无 before/after diff，
      **不能当变更历史回放**（证据：`internal/model/base.go` 无 before/after 字段）。
- [ ] **G-02　默认限流 40 rps 是生产值**：默认档位未按实测能力定档，
      压测显示单用户关键字查询可达 934 QPS、批量编辑 89 QPS，40 rps 与实际能力差一个数量级
      （`internal/config/config.go` `BaseRateLimitRPS`）。
- [ ] **G-03　链接目标候选上限 200 条**，未做分页 / 远程搜索游标。

**P1 · 能力不完整**

- [ ] **G-04　实时通道仍为 SSE**，未做 WebSocket（B §8 的目标形态）。
- [ ] **G-05　跨 Base 关联被拒**：link 仅支持同 Base 内，跨空间引用按越权拒绝（安全但功能受限）。
- [ ] **G-06　视图个人偏好叠加只支持 AND**，排序 / 分组是「个人优先、空回落共享」，不支持 OR / 多级合并。
- [ ] **G-07　审计 / 事件不落字段值**：SSE 帧只广播「哪些字段变了」，不广播值。
- [ ] **G-08　CSV 导入行级失败重试按整行映射重放**，不支持行级改值后重试。
- [ ] **G-09　附件无病毒扫描 / 类型白名单**（仅扩展名黑名单）。
- [ ] **G-10　`ViewConfig.version` 未真正落库**，版本语义由 `base_views` 行 + `base_tables.schema_version` 承担。

**P2 · 体验增强**

- [ ] **G-11　批量多选拖拽排序未做**（看板 / 日历单条拖拽已做）。
- [ ] **G-12　跨表拖拽记录未做**（画廊内拖拽已做）。
- [ ] **G-13　粘贴为整格覆盖**，不做类型智能转换。
- [ ] **G-14　`BASE_RATE_LIMIT_RPS=0`（不限流）配不进去**：配置层 `layered.int` 把 0 当成「未设置」，
      回落到 yaml 的 40，文档里写的「0 表示不限流」实际不生效——本轮已修（见 §3.4）。

---

## 三、相关优化方案

### 3.1 写路径（本轮已落地）

- [x] **O-1　批量更新共享上下文** —— 见 §2.2。核心思想：**把「与行数相关的重复工作」全部上移到批级**。
- [x] **O-2　可见范围 SQL 过滤** —— 旧实现逐行 `recordScopeAllows` → 每行触发角色查询；
      改为 `applyRecordScope` 一次 SQL 过滤。
- [x] **O-3　投影批量落库** —— 块尾一次 `DELETE ... WHERE (record_id, field_id) IN ((?,?),...)` + 一次批量 `INSERT`。
- [x] **O-4　关键字半连接 + 分支裁剪** —— 见 §2.2。
- [x] **O-5　关键字条件只编译一次** —— 计数查询与取数查询共用同一份 cond/args（原实现两边各编译一次，
      连「按标题找节点」的库查询都跑了两遍）。

### 3.2 待落地优化（按收益/成本排序）

- [ ] **O-6　批量更新 N+1 回归测试**（P0，最高优先）：
      用 query 计数断言「100 行批量更新的 SQL 次数不随行数线性增长」。
      当前只有手工压测数字，**没有测试咬住这个性质** —— 下次重构极易退化回 N+1。
- [ ] **O-7　G-01 审计 change set**（P0）：
      审计表增 `before_json / after_json`（或独立 `base_audit_changes` 表），
      写入时对变更字段做 diff 快照，使审计可回放。
- [ ] **O-8　G-02 限流档位按实测能力定档**（P0）：
      关键字查询实测 934 QPS、批量编辑 89 QPS；
      建议默认 `BASE_RATE_LIMIT_RPS=200` + `BASE_RATE_LIMIT_BURST=400`，
      并把限流维度从「用户 × 路径」细化到「用户 × 接口类别」，避免批量写被查询型配额误伤。
- [ ] **O-9　G-03 链接候选分页 + 远程搜索**（P1）：候选上限 200 → 游标分页 + 前缀/模糊搜索。
- [ ] **O-10　G-06 视图偏好 OR / 多级合并**（P1）。
- [ ] **O-11　G-04 SSE → WebSocket 平移**（P1）：事件协议已按 WS 结构设计，
      平移只换传输层；但**先做「批量写事件合并」**（一次 100 行批量写产生 100 条 `record.updated`，
      实测 outbox `record.updated` 已 27 万条 / `record.created` 50 万条，事件风暴会先打爆 outbox）。
- [ ] **O-12　outbox 事件压缩**（P1，优先级高于 O-11）：
      批量更新改为**发一条 `record.batch_updated` 携带 ID 列表**（该事件类型已存在，实测 8788 条），
      不再逐行发 `record.updated`。
- [ ] **O-13　审计 / 操作日志留存策略统一**（P1）：
      `base_operation_logs` 已有保留天数配置（`BASE_OPERATION_LOG_KEEP_DAYS`，默认 90），
      需确认与审计表清理任务统一。
- [ ] **O-14　G-07 SSE 帧带增量值 / 增量拉取**（P1）：已有 `?since=` 全量回放，
      可再加「字段级增量」以省带宽。
- [ ] **O-15　G-09 附件安全**（P2）：接入病毒扫描 + 类型白名单。
- [ ] **O-16　G-10 `ViewConfig.version` 二选一**（P2）：删字段或补落库，别留半截语义。

### 3.3 索引与存储（对应 B §16.3）

- [x] 当前索引按域前缀命名（`idx_base_record_table_sort` / `idx_base_value_field` / `uniq_base_record_grant` 等），
      已符合 `docs/db-table-naming.md` 第 9 节的 `idx_<域>_<实体>_<列>` 约定。
- [ ] **未建 JSONB GIN 索引**：B §16.3 提到 JSONB GIN。**有意不做**——
      写入侧每次插投影都要维护 GIN，放大写成本；且当前查询走类型化投影表，GIN 收益低。
- [ ] **未做 `index_enabled` 字段级索引开关**（B §16.3 建议）：当前是固定索引集。
- [ ] **PG 专项未做**：查询计划 / 慢 SQL 巡检、VACUUM 压力观测、JSONB 行版本膨胀治理。

### 3.4 本轮附带修掉的真实缺陷

- [x] **D-01　配置层「0 表示不限流」失效**：
      `internal/config/layered.go` 的 `int()` 用 `n > 0` 判定环境变量有效性，
      导致 `BASE_RATE_LIMIT_RPS=0` 被当作「未设置」→ 回落 yaml 的 40 → 限流器永远开着。
      文档（`internal/config/config.go:42-46`）明写「0 表示不限流」，实现与契约不符。
      修法：新增 `layered.intAllowZero()`（`n >= 0` 即接受），并让 `BaseRateLimitRPS` 改用它。
      影响面：仅影响显式设置 0 的部署（本地压测 / 压测环境）。

---

## 四、后续执行计划

### 4.1 P0（本周，含本轮已完成的性能改造收尾）

- [ ] **F-1** 补 `internal/base/batch_update_test.go`：
      ① 批量更新后数据 / `version` / 投影三者一致；
      ② 部分失败语义（strict 与非 strict 两条路径）；
      ③ **N+1 回归断言**（O-6）——用 query 计数断言 SQL 次数不随行数线性增长。
- [ ] **F-2** 补关键词检索单测：覆盖「表内**有** / **无** JSON 投影字段时分支数不同」，
      断言 JSON 分支在无 JSON 字段时**不出现**。
- [ ] **F-3** 跑门禁并与基线比对：
      `cd pros/api && go build ./... && go test ./internal/service/...`
      `cd pros/web && npx vitest run && npx vue-tsc -b --pretty false`
      基线噪声：vitest 6 个 rte 文件失败、vue-tsc 62 errors（均为历史噪声，改动前后必须一致）。
- [ ] **F-4** 更新文档：把 §2.2 的前后对比数据写进
      `docs/base-engine-多维表格技术方案.md`（写路径章节）与
      `docs/base-engine-多维表格验收报告.md`（实测数据）。
- [ ] **F-5** 提交 D-01（配置层 `intAllowZero`）+ F-1~F-4，走 PR，不直推 main。

### 4.2 P1（下一迭代）

- [ ] **F-6** O-12 批量写事件合并（`record.batch_updated` 取代逐行 `record.updated`）——**优先级高于 O-11**。
- [ ] **F-7** O-08 限流档位定档 + 维度细化（避免批量写被查询配额误伤）。
- [ ] **F-8** O-7 审计 change set（P0 遗留）。
- [ ] **F-9** O-9 链接候选分页 + 远程搜索。
- [ ] **F-10** O-11 SSE → WebSocket 平移（**必须在 F-6 之后**，否则事件风暴直接打爆通道）。
- [ ] **F-11** O-10 视图偏好 OR / 多级合并。

### 4.3 P2（体验）

- [ ] **F-12** O-15 附件安全（病毒扫描 + 白名单）。
- [ ] **F-13** O-16 `ViewConfig.version` 二选一收口。
- [ ] **F-14** G-11~G-13：批量拖拽排序、跨表拖拽、粘贴类型智能转换。
- [ ] **F-15** 评估 A 的「Slash Command / Bubble Menu」是否要在 Base 侧做等价物——
      **先出决策再动手**：Base 的主要操作面是表格，Slash Command 的收益低于文档侧。

### 4.4 明确不做（有理由的偏差）

- [x] **不引入 Redis / MinIO**：复用 `media_` 素材库 + PG（与核对清单 §1 偏差登记一致）。
- [x] **不在 Base 侧引入 Yjs**：B §8.1 明确否决；文档侧已用 Yjs，两边不混用。
- [x] **不照搬 Block 模型到 Base**：Base 的「块」= 记录，已有独立寻址与授权粒度。
- [x] **暂不建 JSONB GIN 索引**：写成本放大 > 读收益（见 §3.3）。

### 4.5 风险与未验证项

- [ ] 压测数据来自**单机本地 PG**（`localhost:5433`），生产为远端容器；
      绝对值会变，但**前后比值**（7.4× / 2.1×）应在同构环境成立。
- [ ] 压测时**限流器关闭**（`BASE_RATE_LIMIT_RPS=100000`），生产开限流；
      生产实际延迟会叠加限流排队，需在 F-7 定档后复测。
- [ ] 关键词压测用 `"a"`（单字符）；**未测 ≥3 字符的中文/长词**，也未测 trigram 索引方案。
- [ ] 批量更新在**单行超长字段 / 大量 lookup 展开**下的表现未测。
- [ ] 本轮**未做**浏览器端验证（本机 CUA 不可用），UI 侧结论全部来自代码走查 + HTTP 实测。

---

## 五、来源与方法

- [x] A、B 两份内容均从 ChatGPT 分享页 HTML 中解包 `window.__reactRouterContext.streamController.enqueue(...)`
      的 turbo-stream 载荷还原（解码器按「扁平数组 + `{"_N": idx}` 引用 + 负数特殊值」还原）。
      原始 URL：`https://chatgpt.com/s/t_6b07df2340348191baa2c7bc6ffee7c1` 与
      `https://chatgpt.com/s/t_6b07edbedfd08191ba2db5c4e4298dc6`。
- [x] C 的结论均以**实测**为准：源码走查 + `GET /base/field-types` 实测（26 种）+
      `base_event_outboxes` 实测事件分布 + `cmd/loadtest` 同规模前后对比。
- [x] 归档原文位置：仓库 `docs/_sources/`（已存 DeepSeek 分享原文）；
      A / B 两份原文的解包结果可按 §5 步骤复现。
