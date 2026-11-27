# 元矩阵 · 多维表格 Base Engine 技术方案

> 依据：ChatGPT 共享会话《类飞书多维表格企业级技术设计文档》（Mailang Base Engine V1.0，2026-11-26）。
> 本文是**适配元矩阵（MetaMatrix）现有代码库**后的落地版本：保留原方案的架构决策，
> 替换其不匹配本项目的部分（租户模型、目录结构、协同通道、样式规范），并补充「与富文本编辑器融合」章节。
> 状态：技术路线已确定 · 适用范围：`pros/api/internal/base`、`pros/web/src/modules/base`

---

## 0. 与原方案的差异摘要（先看这里）

| 决策项 | 原方案 | 元矩阵落地 | 理由 |
|---|---|---|---|
| 租户隔离 | `tenant_id` + 独立 tenant 表 | `project_id`（知识库空间即租户边界） | 本项目没有多租户体系，空间是既有隔离单位 |
| 协同通道 | WebSocket + Event | **SSE（HTTP 长连接）+ Event**，协议与 Outbox 一致 | Hertz 下 WS 需要额外 hijack/升级链路；SSE 零依赖、协议可平滑替换为 WS |
| 网格引擎 | VXE Table | **VXE Table 4.24**（已安装），仅作 Grid Adapter 底层 | 原样采纳 ADR-002 |
| 公式/关联 | 独立服务模块 | 与 Base 同进程，独立 package `internal/base` | 模块化单体（ADR-012） |
| 文档协同 | Tiptap + Yjs | **Tiptap 3 + ProseMirror + Yjs 保持不变**，与 Base 解耦 | ADR-011 |
| 旧数据 | 无 | 遗留 `kb_node_data.data`（sheet JSONB）**一次性迁移**到 Base Engine | 现网已有 40+ 张表 |
| 权限 | RBAC + DataScope + Field Policy | 复用既有 `kb_members` 角色 + 空间可见性；字段级策略 P1 | 避免重复造权限体系 |

---

## 1. 技术路线（正式确定）

**前端**：Vue 3 + TypeScript + Vite + **VXE Table 4** + Pinia + Element Plus
**后端**：Go + Hertz + GORM
**数据库**：PostgreSQL（JSONB 主存储 + 类型化查询投影）
**实时**：Transactional Outbox + SSE 事件流（协议兼容 WS 升级）
**文档引擎**：Tiptap 3 + ProseMirror（**不承担**多维表格记录存储与协同）
**基础设施**：复用既有 media 素材库、audit 审计、knowledge 空间权限；不引入 Redis/MinIO（本地媒体已落盘 + PG 存储）

**边界声明**：VXE Table 只是 Grid Adapter 的底层实现，不是多维表格引擎。
Field / Record / View / Query / Formula / Relation / Permission 由 Go 后端与 Vue 前端业务层共同实现。

---

## 2. 分层与模块

```
Presentation (Vue)   Grid / Kanban / Calendar / Gallery / Form
Application (Go)     BaseService / RecordService 用例编排与事务
Domain (Go)          Field Registry / Query Engine / Formula Engine / Relation
Infrastructure       GORM + PostgreSQL + SSE + Media
Document (Vue)       Tiptap 引擎，独立于 Base
```

模块依赖约束（与原方案一致）：
- Field Engine 不依赖页面组件；Query Engine 不依赖 VXE Table；
- Formula Engine 不依赖 Vue、不依赖 ORM；
- Record Engine **不允许绕过权限校验**改数据；
- Realtime 只传播已提交事件，不承担持久化；
- View Engine 保存配置，不复制记录数据。

---

## 3. 领域模型与表结构

### 3.1 实体关系

```
knowledge_project(空间) 1─n base_apps(Base)
base_apps 1─n base_tables(Table) 1─n base_fields(Field)
                       1─n base_records(Record) 1─n base_record_values(查询投影)
                       1─n base_views(View)
base_records 1─n base_record_links(关联) n─1 base_records
base_fields 1─1 base_field_formulas(公式)
base_tables 1─n base_event_outboxes(事件) / base_operation_logs(审计)
```

### 3.2 核心表（字段取自原方案，租户列换成 project_id）

**base_apps**：`id, project_id, name, description, icon, owner_id, schema_version, status, created_at, updated_at, deleted_at`
- 一个知识库节点（nodeType=sheet）对应一个 Base，用 `base_apps.node_id` 关联；`node_id` 唯一。

**base_tables**：`id, base_id, name, description, primary_field_id, sort_order, schema_version, settings(JSONB), status, created_at, updated_at, deleted_at`

**base_fields**：`id, table_id, name, type, config(JSONB), required, unique_flag, is_primary, is_system, sort_order, version, status, created_at, updated_at`
- `type` 必须能在 Field Registry 命中，否则拒绝写入（不能只信前端）。
- 记录数据以 **field_id 作为 JSONB key**，字段改名不动数据。

**base_records**：`id, table_id, data(JSONB 权威值), version(int 乐观锁), created_by, updated_by, created_at, updated_at, deleted_at`
- 索引：`(table_id, id) WHERE deleted_at IS NULL`、`data GIN(jsonb_path_ops)`、`(table_id, updated_at DESC) WHERE deleted_at IS NULL`

**base_record_values**（查询投影，非权威源）：`id, table_id, record_id, field_id, value_type, value_text, value_number, value_date, value_bool, value_json, updated_at`
- 与 `base_records` **同事务**写入；仅对 `indexable` 字段建立类型化索引。

**base_views**：`id, table_id, name, type(grid|kanban|calendar|gallery), config(JSONB), is_default, owner_id, version, status, created_at, updated_at`
- 共享配置与个人偏好分离：个人列宽/临时筛选存 `config.personal`（仅当前用户生效），不覆盖他人。

**base_record_links**：`id, source_table_id, source_record_id, field_id, target_table_id, target_record_id, sort_order`
- 唯一索引 `(field_id, source_record_id, target_record_id)`。

**base_field_formulas**：`id, field_id, expression, ast(JSONB), calculation_mode(sync|async), formula_version, status, created_at, updated_at`
**base_formula_dependencies**：`id, table_id, formula_field_id, dependency_field_id, dependency_type(field|relation|lookup), dependency_table_id`

**base_operation_logs**：`id, base_id, table_id, record_id, operator_id, operation, before_data(JSONB), after_data(JSONB), request_id, created_at`
**base_event_outboxes**：`id, base_id, table_id, aggregate_type, aggregate_id, event_type, payload(JSONB), status(pending|published|failed), retry_count, created_at, published_at`

### 3.3 一致性层级

| 数据 | 策略 |
|---|---|
| Record 主数据 | PostgreSQL 事务强一致 |
| Record 查询投影 | 与主数据同事务更新 |
| 公式结果 | sync 模式同事务；async 模式标记 pending |
| 关联关系 | 同事务强一致 |
| 视图配置 | version + 乐观锁 |
| 实时事件 | Outbox 保证最终发布，客户端按版本恢复 |
| 缓存 | 无缓存层（本期），避免一致性问题 |

---

## 4. Field Registry（字段注册体系）

后端 `FieldHandler` 接口（Go）：

```go
type FieldType string

type FieldCapabilities struct {
    Editable, Filterable, Sortable, Groupable, Indexable, Computed bool
}

type FieldDefinition struct {
    Type         FieldType
    Label        string
    Version      int
    ConfigSchema map[string]any
    Capabilities FieldCapabilities
}

type FieldHandler interface {
    Definition() FieldDefinition
    ValidateConfig(cfg map[string]any) error
    ValidateValue(v any, cfg map[string]any) error
    Normalize(v any, cfg map[string]any) (any, error)
    BuildFilter(op string, v any) (QueryCondition, error)
    BuildSort(dir string) (SortExpression, error)
    ProjectedType() string // value_text / value_number / value_date / value_bool / value_json
}
```

**首批字段类型（本期全部落地）**

| 分类 | 类型 |
|---|---|
| 文本 | `text` `long_text` |
| 数值 | `number` `currency` `percent` `rating` |
| 日期 | `date` `datetime` |
| 布尔 | `checkbox` |
| 选项 | `single_select` `multi_select` |
| 联系 | `email` `phone` `url` |
| 人员 | `user` |
| 附件 | `attachment` |
| 计算 | `formula` `link`（P1，本期建表与基础校验） |

前端同构注册表（TypeScript）：每个插件声明 `createEditor / createRenderer / validate / normalize / capabilities`。
**前端注册表只负责 UI，后端注册表才是值合法性与查询能力的最终权威。**

字段类型变更分两类：
- **配置变化**（精度、选项颜色）→ 只更新元数据；
- **数据结构变化**（text→number）→ 必须走 `POST /fields/:id/migrate`：兼容性预检 → 迁移计划 → 预校验 → 分批迁移 → 更新投影 → 更新公式依赖 → 递增 schema_version → 写审计。
  **禁止**直接把 `base_fields.type` 改掉而不处理存量记录。

---

## 5. Query Engine（统一查询层）

所有筛选 / 排序 / 分组 / 分页必须经过 Query Engine；**禁止**客户端直传 SQL、列名或表达式。

```go
type QueryRequest struct {
    TableID string
    ViewID  string
    Filters FilterGroup
    Sorts   []SortRule
    Groups  []GroupRule
    PageSize int
    Cursor  string
}
```

Filter AST：
```json
{ "logic": "AND", "conditions": [
    { "fieldId": "f_status", "operator": "eq", "value": "进行中" },
    { "fieldId": "f_amount", "operator": "gte", "value": 1000 } ], "children": [] }
```

执行流程：加载表结构 → 校验字段能力（不支持的操作符直接 422）→ 注入空间权限条件 → 构建 Filter AST →
生成受控 SQL → 执行 → 反序列化字段值 → 读取/计算公式结果 → 返回游标分页结果。

**查询性能约束**：默认分页上限 500 行；Cursor Pagination（`updated_at+id` 游标）；筛选/排序字段走 `base_record_values` 投影；
低频字段走 JSONB；分组聚合下推数据库；限制最大过滤条件数（≤20）与最大分组层级（≤3）。

返回结构（前端不依赖 PG 内部结构）：
```json
{ "tableId":"...","viewId":"...","schemaVersion":12,
  "records":[{"id":"...","version":3,"fields":{"f_001":"张三","f_002":1200.5}}],
  "page":{"nextCursor":"opaque","hasMore":true} }
```

---

## 6. Formula Engine（公式引擎）

链路：`Lexer → Parser → AST → 静态检查 → 依赖图 → Evaluator → 结果写回`。

- 语法：数值、字符串、字段引用 `{字段名}`、算术 `+ - * /`、比较 `= != > < >= <=`、逻辑 `AND OR NOT`、函数调用。
- 函数白名单：`SUM AVERAGE COUNT MIN MAX IF AND OR NOT CONCATENATE ROUND ABS DATE TODAY`。
- **安全**：禁止 `eval`、禁止动态拼接 SQL；限制 AST 节点数（≤1000）、深度（≤64）、执行步数（≤10000）、超时（2s）。
- 依赖图：字段变更 → 找依赖者 → 拓扑排序 → 逐层重算 → 更新结果与投影 → 发事件。
- **循环依赖必须检测**（A 引 B、B 引 A）。
- 公式错误作为**可识别状态**返回（`#NAME?` `#DIV/0!` `#REF!`），不得让整表查询失败。
- 公式结果由**服务端计算并落库**，前端不作为权威；筛选/排序基于服务端结果。

---

## 7. 实时协同：Outbox + SSE

事件类型：`record.created / updated / deleted / batch_updated`、`field.created / updated / deleted`、
`view.updated`、`formula.calculated`、`schema.changed`。

写路径（单条记录更新）：
```
前端 PATCH(带 expectedVersion) → 服务端事务:
  校验权限 → 校验字段值 → WHERE version=expectedVersion 更新 → version+1
  → 同事务更新投影/关联/公式依赖/审计/outbox → COMMIT
  → outbox 事件异步发布 → SSE 推送 → 其他客户端按 version 合并
```

乐观锁 SQL：
```sql
UPDATE base_records SET data = data || $patch::jsonb, version = version + 1,
  updated_at = now(), updated_by = $op
WHERE id = $id AND table_id = $table AND project_id = $pid AND version = $expected AND deleted_at IS NULL
RETURNING version, data;
```
未命中 → 返回 `409 version_conflict`，前端提示并按字段差异决定重载或手工合并。

可靠性：Outbox 与业务数据同事务；事件带全局唯一 eventId；消费者按 eventId 幂等；
客户端发现版本跳跃 → 重新拉取视图数据；**SSE 断线自动重连并带 `Last-Event-ID` 补拉**。

> 与原方案的差异：本期用 SSE 承载事件（`GET /base/:baseId/events`），事件 JSON 结构与 WS 版完全一致，
> 后续切换到 WebSocket 只需替换传输层，客户端 `realtime` 模块接口不变。

---

## 8. 权限体系

沿用既有空间权限（`kb_members` 角色：owner/editor/viewer）+ 记录级可见性 + 字段级策略（P1）。

要求：
- 服务端每次读写都校验；
- **字段隐藏 ≠ 字段安全**：敏感字段在 API 返回前过滤；
- 记录级过滤在 Query Engine 生成 SQL 时注入，而不是查询后内存删除；
- 批量操作逐条校验；
- SSE 订阅与推送走同一套权限策略；权限变更后失效订阅。

---

## 9. API 设计

统一前缀 `/projects/:projectId/base`，统一响应 `{ code, message, data, requestId }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/base` | Base 列表 / 当前节点 Base |
| POST | `/base` | 创建 Base |
| GET/POST | `/base/:baseId/tables` | 表列表 / 建表 |
| GET/PATCH/DELETE | `/base/tables/:tableId` | 表详情 / 改 / 删 |
| GET/POST | `/base/tables/:tableId/fields` | 字段列表 / 建字段 |
| PATCH/DELETE | `/base/fields/:fieldId` | 改字段 / 删字段 |
| POST | `/base/fields/:fieldId/migrate` | 字段类型迁移 |
| GET | `/base/field-types` | 字段类型与能力（含 configSchema） |
| GET/POST | `/base/tables/:tableId/records` | 查询 / 新建记录 |
| GET/PATCH/DELETE | `/base/records/:recordId` | 记录详情 / 改 / 删 |
| POST/PATCH/DELETE | `/base/tables/:tableId/records/batch` | 批量增 / 改 / 删 |
| GET/POST | `/base/tables/:tableId/views` | 视图列表 / 新建 |
| GET/PATCH/DELETE | `/base/views/:viewId` | 视图详情 / 改 / 删 |
| POST | `/base/views/:viewId/query` | 按视图查询 |
| POST | `/base/tables/:tableId/formulas/validate` | 公式校验 |
| POST | `/base/tables/:tableId/formulas/preview` | 公式预览 |
| GET/PUT | `/base/fields/:fieldId/formula` | 公式定义 |
| GET | `/base/events` | SSE 事件流 |

错误码：`40001 参数 / 40101 未认证 / 40301 无权限 / 40401 不存在或不可见 / 40901 版本冲突 /
40902 Schema 冲突 / 42201 字段值非法 / 42202 字段类型不兼容 / 42203 公式解析失败 / 42204 循环依赖 / 42901 限流 / 50001 内部错误`。

横切能力：`Idempotency-Key`（批量与导入）、`version`（记录）、`schemaVersion`（表结构）、游标分页、`requestId` 全链路。

---

## 10. 前端架构

```
pros/web/src/modules/base/
├── api.ts           # HTTP 客户端（统一错误码 → 文案）
├── types.ts         # 与后端一一对应的类型定义
├── realtime.ts      # SSE 客户端（重连、事件分发）
├── base.css         # 视图样式（只取 telegram.css 的 --tg-* 令牌）
├── fields/          # 字段注册表 + BaseFieldCell（渲染与编辑）
├── grid/            # Grid Adapter（VXE Table 实现）
├── views/           # kanban / calendar / gallery 渲染器
├── panels/          # 字段管理 / 筛选排序 / 公式 / 记录详情
└── BaseEngineView.vue  # 主视图：表、视图、查询状态的编排
```

**Grid Adapter 接口**（换网格组件不影响业务层）：
```ts
interface GridAdapter {
  setColumns(cols: GridColumn[]): void
  setRows(rows: GridRecord[]): void
  updateCell(recordId: string, fieldId: string, value: unknown): void
  getSelectedRecords(): string[]
  refresh(): Promise<void>
}
```

**编辑时序**：本地乐观更新 → PATCH(带 expectedVersion) → 成功则确认并更新 version；
失败 409 → 提示冲突 → 用户选择「重载该行」或「保留我的输入」；
其他用户的修改经 SSE 事件合入，**不得用事件覆盖正在编辑的本地输入**。

**设计规范**：沿用项目全局 `telegram.css`（唯一令牌来源）；VXE Table 仅做「数据层」，表头/工具栏/弹窗用项目自有组件；
所有浮层（字段配置、公式、批量编辑、记录详情）走 Telegram 弹窗规范。

---

## 11. 与富文本编辑器的融合（Document Engine ↔ Base Engine）

**边界不变**（ADR-011）：文档用 Yjs 协同，多维表格用版本号 + 事件同步；两者**不共享记录模型与协同协议**。

融合点按侵入性从低到高：

1. **文档中嵌入 Base 视图**（推荐首选）
   - 文档里存「Base 引用块」：`{ baseId, tableId, viewId, filters }`，渲染时调用 `POST /views/:viewId/query` 取数；
   - **不复制记录数据到文档正文**，只存引用 → 数据永远一致；
   - 文档协作仍然只同步引用块本身（Yjs 节点），表格数据走 Base Engine 的事件流。
2. **Base 记录关联文档**
   - `link` 字段（目标类型 = 知识库文档），记录里存 `documentId`；
   - Base 侧显示文档标题/摘要，点击跳转；文档侧显示反向引用列表（查询 Base 记录）。
3. **文档反向引用某条记录**
   - 记录详情里列出「引用本记录的文档」。
4. **Base 自动化触发文档生成**（后续）：本期不做。

实现约束：
- 两种引擎共享：用户/空间权限、文件与附件服务、操作审计、搜索基础设施、API 网关。
- 不共享：记录模型、文档模型、协同数据协议。

---

## 12. 与遗留实现的关系

遗留：多维表格整块存 `kb_node_data.data`（kind='sheet'），前端 `sheetModel.ts` 自行做筛选排序公式。

**本期已下线**：`SheetEditor.vue`（旧的整块 JSONB 编辑器）已从知识库入口移除，
`src/views/KnowledgeView.vue` 的 `nodeType === 'sheet'` 分支改为渲染 `BaseEngineView`；
`SheetPreview.vue`（分享只读预览）继续保留，仍读旧 JSONB，保证存量分享链接不失效。

**一次性迁移**（首次打开旧表时，服务端执行，幂等）：
1. 读旧 JSON → 建 Base/Table/Field/Record；
2. 旧字段类型映射到新 Registry（`text/number/date/checkbox/select/user/attachment` 兼容；未知类型降级为 `text` 并在 `base_tables.settings.migratedFrom` 留痕）；
3. 旧视图映射到 `base_views.config`（filters/sorts/groups/fieldVisibility/fieldWidths）；
   其中 `filters` 必须落成 **FilterGroup**（`logic/conditions/children`），
   不能落成条件数组 —— 否则新查询引擎拿到数组无法编译 SQL（旧数据迁移的必修项）；
4. 旧公式（`=` 前缀）迁到 `base_field_formulas`，用新求值器重算一次；
5. 旧行 → `base_records.data`（key 换成 field_id）；
6. 写标记 `base_apps.migrated = legacy_sheet:<nodeId>`，重复打开不再迁移。

迁移失败时**保留旧数据不动**（新表不创建），前端回落读旧 JSON（只读降级模式），不丢数据。

---

## 13. 验收标准

**功能**：建 Base/Table/Field/Record；动态增删改字段且改名不丢数据；Grid 单元格编辑 + 批量粘贴；
组合筛选/排序/分组/分页；多视图共享同一份记录；公式随依赖变化重算；关联字段基础可用；
多客户端收到事件；过期版本返回 409；审计可查修改前后。

**性能**（目标，非承诺）：100 记录 × 20 字段首屏 P95 ≤ 1.5s；单条更新 P95 ≤ 200ms；常规筛选 P95 ≤ 500ms；
SSE 事件推送 P95 ≤ 500ms；1000 行虚拟滚动流畅；事务失败不产生部分持久化。

**并发**：不同字段并发不丢写；同字段并发返回 409；编辑中被删除可见；旧 Schema 写入被拒；
批量粘贴遇冲突整批回滚（atomic）；事件重复/乱序不产生重复写。

**安全**：跨空间不可读写；猜 ID 不能越权；无权字段不返回；公式不能执行任意代码；Filter 不能注入 SQL；
SSE 推送经过权限过滤。

**可扩展**：新增字段类型 / 视图类型 / 公式函数 / 查询操作符，均以插件方式接入，不改 Record Engine 核心。

---

## 14. 实施顺序（本期已排期）

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 领域模型 + 迁移 + 骨架 + API 骨架 | 本期 |
| M1 | Field Registry + Record CRUD + JSONB 存储 + 投影 + 乐观锁 + 审计 | 本期 |
| M2 | View Engine + Query Engine（筛选/排序/分组/分页）+ Grid Adapter(VXE) | 本期 |
| M3 | Formula Engine + Relation 基础 + Outbox + SSE 实时 + 冲突处理 | 本期 |
| M4 | 遗留表迁移、权限加固、导入导出、压测与文档 | 本期（M4 部分后置） |

---

## 15. 架构风险与规避

| 风险 | 后果 | 规避 |
|---|---|---|
| 直接把 VXE Table 当业务引擎 | UI 与业务耦合 | Grid Adapter 隔离 |
| 全部 JSONB 无投影 | 动态筛选排序性能不可控 | 类型化投影 + 索引 |
| 字段类型直接改 | 老数据无法解析 | migrate 接口 + 预检 |
| 公式用 eval | 任意代码执行 | AST + 函数白名单 + 步数/深度上限 |
| 事件先广播后写库 | 客户端收到不存在数据 | Transactional Outbox |
| 公式只在前端算 | 排序筛选与 API 不一致 | 服务端权威计算并落库 |
| 更新不带版本 | 并发覆盖 | 乐观锁 + 409 |
| 事件不校验权限 | 数据泄露 | 订阅与推送同一策略 |
| 共享视图与个人偏好混存 | 用户互相覆盖 | config 内分离 personal 段 |
| 与富文本引擎混为一体 | 协同协议混乱 | 领域隔离 + 引用式集成 |

---

## 16. 本期落地说明（代码对照）

### 16.1 后端（`pros/api/internal/base/`）

- `model.go`：类型别名，转发到 `internal/model/base.go`（12 张表的唯一事实来源）。
- `registry.go`：Field Registry（18 种字段类型 + 能力矩阵 + 校验/归一化/投影类型）。
- `query.go`：Query Engine（Filter AST → SQL、投影表 EXISTS、排序/分组、游标分页、上限保护）。
- `formula.go`：公式引擎（Lexer → Parser → AST → Evaluator，函数白名单，深度/步数/超时上限，环检测）。
- `service.go`：Base/Table/Field/Record/View/Formula 服务（权限、乐观锁、必填校验、投影同步、公式重算、审计、Outbox）。
- `events.go`：EventHub + SSE 广播 + Outbox 发布器（700ms 轮询）。
- `handler.go`：HTTP 层 + SSE（`io.Pipe` + `SetBodyStream`）。
- `migrate.go`：遗留 sheet JSON → Base Engine 的一次性幂等迁移。
- `base_test.go`：公式解析/求值、环检测、注册表、校验、旧类型与旧视图映射单测。

路由前缀 `/projects/:projectId/base`（见 `cmd/server/main.go`），全部挂载在 `baseSvc` 之下。

### 16.2 前端（`pros/web/src/modules/base/`）

- `BaseEngineView.vue`：加载链 `ensureBase → listTables → listViews → queryRecords`；
  工具栏（搜索/筛选/排序/重置/字段/公式/导入/导出/视图配置）、视图标签、表切换、右侧记录列表；
  单元格更新走「乐观更新 + `expectedVersion`」，409 冲突给出「重载 / 保留输入」二选一；
  实例化 `BaseRealtime`，收到事件后防抖刷新；勾选记录后浮出批量操作条。
- `grid/BaseGrid.vue`：VXE Table v4（局部引入，不做 `app.use` 全局注册）；列由字段生成，
  主字段固定第一列并左固定，底部「新增记录」与行数统计；
  行选择列用自绘 `el-checkbox`（VXE 自带 checkbox 依赖 vxe-ui 组件，整表安装代价高）；
  第三轮补齐键盘导航与剪贴板（方向键 / Enter / F2 / Esc / Delete / Ctrl+C/V，TSV 多单元格粘贴）。
- `fields/BaseFieldCell.vue`：按类型渲染与编辑；双击（单元格任意位置）可编辑字段进入编辑，双击公式字段交给上层打开详情；
  公式字段只读，值由服务端计算；「关联文档」字段渲染成可点击的文档链接；
  「附件」字段走素材库真实上传，渲染缩略图 / 文件名胶囊（值格式 `url#文件名`）。
- `views/BaseBoardViews.vue`：看板 / 日历 / 画廊三视图；看板支持拖拽换组（详见第 22 章）。
- `panels/`：字段管理（改名/类型迁移/必填/删除/新增）、筛选排序分组、公式（校验 → 预览 → 保存）、
  记录详情抽屉、CSV 导入、批量操作、视图配置。
- `csv.ts`：CSV / TSV 解析与序列化（双引号、字段内逗号与换行、CRLF、BOM）。
- `clipboard.ts`：剪贴板 TSV → 单元格写入的行列映射（超出范围忽略、公式跳过、空值写 null），配 `clipboard.test.ts` 单测。

### 16.3 与富文本编辑器的融合（已落地的一条路径）

- **Base → Markdown 表格导出**：工具栏「导出」可生成 Markdown 表格并一键复制，
  粘贴进知识库文档即完成「数据 → 文档」的内容沉淀；CSV 导出用于数据交换。
- **公式依赖复用文档语义**：公式用 `{字段名}` 引用，与文档变量采用同一套命名口径，
  后续扩展「文档内嵌 Base 视图块」时无需改命名约定。
- **文档内嵌 Base 视图块（已落地，见第 25 章）**：文档正文存 `{ projectId, baseId, tableId, viewId }` 引用，
  渲染时实时取数，表格改数据文档同步变。
- **文档反向引用记录（已落地，见第 25 章）**：`doc` 字段按节点 ID 存储，服务端按空间内所有 Base 的
  `doc` 字段投影反查，文档「反向引用」页签列出引用它的表 / 记录 / 字段。
- 未落地（后续）：`link` 字段指向知识库文档（当前 `link` 只关联本空间表间记录）。
- 第三轮补强：Base 侧已具备「附件 + 文档关联 + 拖拽分组 + 批量导入」四类写入能力，
  为文档内嵌 Base 视图块（只读取数）铺平了数据层。

### 16.4 与原方案的差异（需要决策时以本节为准）

- 实时通道用 **SSE** 落地（事件协议与 WebSocket 版本一致，可整体切换传输层）。
- 旧 JSONB 编辑器 `SheetEditor.vue` 已下线，迁移完成后 Base Engine 成为唯一写路径。
- 公式保存后会**立即回填历史记录**（`recalcTableFormulas`），而不是等下一次编辑才出值。
- 遗留视图迁移的 `filters` 统一为 FilterGroup，前后端都不再接受条件数组。

---

## 17. 导入导出规范

### 17.1 CSV 解析规则（前端 `modules/base/csv.ts`）

- 分隔符自动识别：逗号优先，制表符次之（TXT）。
- 双引号包裹的字段支持：字段内逗号、字段内换行、`""` 转义双引号。
- 兼容 CRLF / LF / CR 换行，兼容 UTF-8 BOM。
- 首行默认当表头（可关闭），表头名与字段名一致时自动映射，其余列按顺序兜底映射，
  映射关系可在导入面板里逐列调整，未映射的列直接忽略。

### 17.2 导入时的类型转换

| 字段类型 | 转换规则 |
|---|---|
| 数字 / 金额 / 百分比 / 评分 | `Number(值)`，非法值按 0 |
| 复选框 | `1 / true / 是 / y / yes` 视为选中，其余未选中 |
| 单选 | 原样字符串（需命中候选项，否则按文本存） |
| 多选 / 人员 / 附件 / 关联记录 / 关联文档 | 按 `、 , ; |` 切分成数组 |
| 日期 / 日期时间 | 原样字符串（后端归一化到 `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss`） |
| 文本 / 长文本 | 去首尾空白 |

导入走服务端批量接口 `POST /tables/:tableId/records/batch`（`action=create`），
**整批成功或整批失败**，不在前端直接写库，避免绕过必填校验、投影同步与审计。

### 17.3 导出

- **Markdown 表格**：`| 列 | 列 |` + `| --- |` 分隔行，单元格里的 `|` 转义为 `\|`，
  换行转 `<br>`；一键复制后可直接粘贴进富文本文档（这是 Base ↔ 富文本融合的主路径）。
- **CSV**：字段内含 `,` `"` `\n` 时加引号并转义双引号；文件下载按 `表名.csv` / `表名.md` 命名。

---

## 18. 批量操作与视图配置

### 18.1 批量操作

- 勾选记录（行首自绘复选框，支持表头全选 / 半选）后浮出批量操作条。
- 支持：批量改字段值、批量删除。
- 语义：整批事务，任意一条失败整批回滚，界面明确提示「不会写一半」。
- 接口：`POST /tables/:tableId/records/batch`，`action=update|delete`。

### 18.2 视图配置

视图配置存在 `base_views.config`，随视图走（换设备、换人共享同一视图）。

```json
{
  "fieldVisibility": { "<field_id>": true },
  "fieldWidths":     { "<field_id>": 160 },
  "filters":  { "logic": "AND", "conditions": [], "children": [] },
  "sorts":    [ { "fieldId": "<field_id>", "order": "asc" } ],
  "groups":   [ { "fieldId": "<field_id>", "order": "asc" } ]
}
```

- 保存走 `PATCH /views/:viewId` 带 `version`（乐观锁）。
- 列宽、显隐即时生效；筛选/排序/分组改动后自动回写视图配置（切换视图时保持一致）。

---

## 19. 关联文档字段（Base ↔ 知识库 ↔ 富文本的联动）

### 19.1 字段语义

新增字段类型 `doc`（关联文档），值是**知识库节点 ID 列表**（`kb_nodes.id`）：

- 渲染：单元格显示文档标题（点击跳转），而不是裸 ID；
- 编辑：下拉多选，候选项来自当前空间的目录树（doc / canvas 节点）；
- 校验：写入时校验节点存在且属于当前空间，跨空间引用直接拒绝（42201）；
- 投影：`text`（存 ID 列表），因此支持 `contains` / `eq` 筛选，不支持排序与分组。

与 `link`（关联本空间其它表的记录）区分：`link` 面向表间关系，`doc` 面向知识库文档。

### 19.2 跳转链路

`单元格点击` → `BaseEngineView` 抛 `open-doc(nodeId)` → `KnowledgeView` 在目录树里解析节点 →
doc 走 `openDoc`（路由 `knowledge-doc`），canvas 走 `openCanvasNode`；
节点没有正文时给出明确提示而不是跳到空白页。

### 19.3 后续扩展（已落地，见第 25 章）

- 文档侧反向引用：某条 Base 记录被哪些文档引用 —— 已实现为「文档 → 引用它的 Base 记录」，
  走 `GET /projects/:projectId/base/doc-backrefs/:nodeId`，靠 `doc` 字段投影反查。
- 文档内嵌 Base 视图块：文档存 `{ projectId, baseId, tableId, viewId }` 引用，渲染时实时取数。

---

## 20. 降级与容错

| 场景 | 行为 |
|---|---|
| 遗留表迁移失败 | `base_apps.migrated = failed:<原因>`；接口仍返回 Base，前端进入**只读降级**：读取旧 JSONB 渲染表格并提示原因，旧数据不丢 |
| 迁移成功后旧数据 | 保留在 `kb_node_data`，只读预览（分享页 `SheetPreview.vue`）继续可用，不做物理删除 |
| 记录写入版本冲突（409） | 界面给「重新载入 / 保留我的输入」二选一，不静默覆盖 |
| 公式循环依赖 | 服务端拒绝保存（42204），界面提示依赖环 |
| 实时通道断开 | SSE 指数式退避重连，状态指示灯显示「离线 / 连接中 / 实时同步中」 |
| 公式保存 | 立即回填全表历史记录（`recalcTableFormulas`），不需要手工触发 |

---

## 21. 字段类型清单（19 种）

> 下表与运行时能力矩阵一一对应（数据源：`GET /projects/:projectId/base/field-types`）。
> **可索引**决定该字段是否写入查询投影表 `base_record_values`；
> 「可筛选」为真但「可索引」为假 = 筛不出来（历史上踩过的坑，见 25.4 节）。

| 类型 | 标识 | 可编辑 | 可筛选 | 可排序 | 可分组 | 可索引 | 说明 |
|---|---|---|---|---|---|---|---|
| 文本 | `text` | ✓ | ✓ | ✓ | ✓ | ✓ | 单行 |
| 长文本 | `long_text` | ✓ | ✓ | ✗ | ✗ | ✓ | 多行；可筛选、可被关键字命中 |
| 数字 | `number` | ✓ | ✓ | ✓ | ✓ | ✓ | 数值 |
| 金额 | `currency` | ✓ | ✓ | ✓ | ✓ | ✓ | 金额 |
| 百分比 | `percent` | ✓ | ✓ | ✓ | ✓ | ✓ | 百分比 |
| 评分 | `rating` | ✓ | ✓ | ✓ | ✓ | ✓ | 0–5 |
| 日期 | `date` | ✓ | ✓ | ✓ | ✓ | ✓ | `YYYY-MM-DD` |
| 日期时间 | `datetime` | ✓ | ✓ | ✓ | ✓ | ✓ | `YYYY-MM-DD HH:mm:ss` |
| 复选框 | `checkbox` | ✓ | ✓ | ✓ | ✓ | ✓ | 是 / 否 |
| 单选 | `single_select` | ✓ | ✓ | ✓ | ✓ | ✓ | 候选项 |
| 多选 | `multi_select` | ✓ | ✓ | ✓ | ✓ | ✓ | 多值 |
| 邮箱 | `email` | ✓ | ✓ | ✓ | ✗ | ✓ | 格式校验 |
| 电话 | `phone` | ✓ | ✓ | ✓ | ✗ | ✓ | — |
| 链接 | `url` | ✓ | ✓ | ✓ | ✗ | ✓ | URL |
| 人员 | `user` | ✓ | ✓ | ✓ | ✓ | ✓ | 空间成员 |
| 附件 | `attachment` | ✓ | ✗ | ✗ | ✗ | ✓ | 素材库文件；**可索引**以便按文件名搜索 |
| 公式 | `formula` | ✗（服务端算） | ✓ | ✓ | ✓ | ✓ | AST 求值 |
| 关联记录 | `link` | ✓ | ✓ | ✗ | ✗ | ✓ | 关联其它表的记录 |
| 关联文档 | `doc` | ✓ | ✓ | ✗ | ✗ | ✓ | 关联知识库文档；按标题筛选见 26.1 |

## 21.5 空表兜底（tableId 为空的 404 修复）

### 21.5.1 问题

新建多维表格（知识库节点）第一次打开时，Base 已建但**还没有任何数据表**，
此时点「字段 / 公式 / 导入 / 新增记录」，前端会拼出 `/tables//fields` 这类**空路径**，
后端路由匹配不到 → `404 Not Found`。

### 21.5.2 修复（双保险）

- **后端兜底**：`EnsureBase` 新建 Base 时同步建一张默认数据表（主字段「名称」）与默认视图「表格视图」，
  避免出现「有 Base 无表」的空壳；只读成员建表失败时静默跳过（前端仍有引导）。
- **前端兜底**：`BaseEngineView.ensureTable()` 在所有表级入口（字段 / 公式 / 导入 / 新增记录）调用前执行，
  没有表就现建一张「数据表」+「表格视图」；面板内部（字段管理 / 公式 / 导入）再做一次
  `tableId` 空值校验，命中就提示「当前多维表格还没有数据表，请先新建数据表」而不是发请求。

### 21.5.3 验收

新建节点「空表测试」→ 打开即出现「数据表 / 名称 / 表格视图」与空态「暂无数据」；
点「字段 → 添加字段」成功落库，全程 **0 个 4xx 请求**。测试节点与基表已清理。

---

## 21.6 工具栏按钮分组

### 21.6.1 分组语义

工具栏按职责拆成三个**按钮组**（不是一排散按钮）：

| 按钮组 | 成员 | 说明 |
|---|---|---|
| 查询组 | 筛选 / 排序 / 重置 | 视图条件；筛选、排序命中时按钮置为 `is-active`（白底 + 品牌蓝） |
| 结构组 | 字段 / 公式 / 视图配置 | 表结构与视图属性 |
| 数据组 | 导出 / 导入 | 数据进出 |

右侧独立保留主按钮「新增记录」与计数。

### 21.6.2 视觉规范（对齐 Telegram 分段控件）

- 组容器：`--tg-surface-2` 灰底 + 999px 圆角 + 3px 内边距 + 1px 内描边；
- 组内按钮：**无边框、透明底**，高度 28px，左右内边距 12px；
- 悬停：白底 + `--tg-shadow-1` + `translateY(-1px)`；
- 选中态（`is-active`）：白底 + 品牌蓝文字；
- 禁用态：40% 透明度。

### 21.6.3 实现注意

`telegram.css` 里 `.el-button:not(...)`（白底 + 发丝线）的特异性高于组件级 `.be-btngroup .el-button`，
会让组内按钮各自变成独立白底卡片。因此本项目的覆盖规则**重复了 `:not` 链**把特异性拉平
（`.be-btngroup .el-button.el-button:not(...)`），并在 CSS 注释中写明原因。

### 21.6.4 实测数值

组容器：`background rgb(244,244,245)` / `border-radius 999px` / `padding 3px` / 高 34px；
组内按钮：`background rgba(0,0,0,0)` / `border 0px none` / 高 28px / 宽 64px（视图配置 88px）；
悬停「字段」：`background rgb(255,255,255)` / `box-shadow rgba(15,23,42,.06) 0 1px 2px` / `transform translateY(-1px)`。

---

## 22. 看板拖拽换组

### 22.1 交互

- 列 = 分组字段的**候选项全集**（字段 `config.options`），即使某列当前没有记录也保留，空列同样可作为拖拽目标；
- 卡片 `draggable=true`（仅在存在分组字段且可编辑时开启），`dragstart` 记录当前行 ID，`dragover` 高亮目标列，`drop` 触发分组字段写入，`dragend` 清理拖拽态；
- 单选字段：写目标列名；多选字段：把目标列名**追加**到已有值（不覆盖其它标签）；
- 写入走与单元格编辑完全一致的链路：乐观更新 + 版本号乐观锁，失败自动回滚并提示。

### 22.2 实现位置

- `pros/web/src/modules/base/views/BaseBoardViews.vue`：`groupField` / `groups`（预置候选项）/ `onDragStart` / `onDragOver` / `onDrop`；
- 拖拽态样式：`is-dragging`（卡片半透明 + 微旋转）、`is-drag-over`（列虚线高亮）。

### 22.3 边界

- 分组字段缺失时看板退化为「全部」单列，卡片不可拖拽；
- 公式字段不参与拖拽（服务端计算值不可写）。

---

## 23. 键盘导航与剪贴板

### 23.1 快捷键

| 操作 | 行为 |
|---|---|
| 单击单元格 | 聚焦该单元格（蓝色描边） |
| `↑` / `↓` / `←` / `→` | 在「可见字段 × 可见记录」矩阵内移动焦点 |
| `Enter` / `F2` | 聚焦单元格进入编辑态 |
| `Esc` | 取消聚焦 |
| `Delete` / `Backspace` | 清空聚焦单元格（写 `null`） |
| `Ctrl/Cmd + C` | 复制聚焦单元格文本（数组用 `, ` 连接） |
| `Ctrl/Cmd + V` | 以聚焦单元格为起点粘贴 TSV（`\t` 分列、`\n` 分行），支持多单元格批量写入 |

### 23.2 实现要点

- 焦点状态是**前端视图态**（`focus: { rowId, fieldId }`），不落库；
- 编辑通过 `editSignal { key, seq }` 广播：序号自增且 `key === rowId:fieldId` 的单元格进入编辑，避免为每个单元格挂实例；
- 粘贴事件同时监听 DOM `paste`（兼容浏览器剪贴板）与 `navigator.clipboard.readText()`（兼容无剪贴板权限场景）；
- 粘贴写入**按记录串行化**（`BaseEngineView.writeQueue`），批量粘贴时同一条记录不会并发提交导致版本号打架。

### 23.3 单元格双击

双击在**单元格根节点**上响应（不再只绑定在文字节点），因此点击空白区域也能进入编辑；
关联文档链接与附件预览保留自身的点击/双击语义，不触发编辑。

---

## 24. 附件字段（上传 · 缩略图 · 文件名）

### 24.1 值格式

附件值仍是字符串数组（后端 `attachment` 类型归一化为 `[]string`），单项格式：

```
<url>#<encodeURIComponent(原文件名)>
```

例如 `/media/dc20c847-...#合同.pdf`。文件名缺省时回退到 URL 末段；后端不解析该格式，只做字符串存储，因此兼容旧数据（纯 URL）。

### 24.2 上传链路

`uploadMediaFile(file, { mediaType: 'file' })`（`src/api/mediaUpload.ts`，内部从 `getToken()` 取令牌、20MB 以上自动分片）
→ 返回 `previewUrl` / `insertedPath` → 拼上 `#文件名` 写入单元格 → 走统一乐观更新与版本锁。

### 24.3 渲染

- 图片类 URL（`png/jpg/gif/webp/bmp/svg`）渲染 28×28 缩略图；
- 其它文件渲染回形针 + 文件名胶囊；
- 编辑态列出全部附件，支持单个移除与继续上传，条数受字段 `config.maxCount` 限制（默认 10，超限提示）。

### 24.4 边界

- 素材库返回的是内部路径（`/media/<uuid>`），前端以该路径直连渲染；
- 服务端不做病毒扫描与类型白名单校验（沿用素材库既有策略）。

---

## 25. 文档内嵌 Base 视图块 与 文档反向引用（C2-15 / C2-16）

### 25.1 文档内嵌 Base 视图块

**数据契约**：文档正文（HTML）里只存引用，不复制数据。

```html
<div data-type="baseEmbed"
     data-project-id="..." data-base-id="..." data-table-id="..."
     data-view-id="..." data-node-id="..." data-title="客户管理"></div>
```

**实现**：

- `pros/web/src/extensions/baseEmbed.ts`：TipTap 节点（`group: block`, `atom`, `draggable`），
  属性 `projectId / baseId / tableId / viewId / nodeId / title`，
  `parseHTML` 认 `div[data-type="baseEmbed"]`，`renderHTML` 输出可序列化卡片，
  `addNodeView` 挂 `VueNodeViewRenderer(BaseEmbedView)`。
- `pros/web/src/components/rte/baseEmbed/BaseEmbedView.vue`：实时取数视图。
  加载链 `listViews → queryRecords`（带上视图的 filters / sorts），字段顺序沿用主字段优先，
  视图 `fieldVisibility` 里隐藏的列不渲染；复用 `BaseFieldCell` 只读渲染，附件 / 关联文档 / 公式
  与表格页完全一致；底部标注「共 N 条 · 数据实时同步」。
- 插入入口：`@` 提及菜单里的多维表格候选 → `mentionSuggestion` 走 `resolveBaseEmbed` 回调，
  宿主（`RichTextEditor.vue`）用 `ensureBase → listTables → listViews` 解析出
  `{ projectId, baseId, tableId, viewId, title }`，成功后插入 `baseEmbed` 块。
  `ensureBase` 复用已有 Base，不会重复建表。

**边界**：

- 只读：块内不做编辑，改数据要去多维表格页；
- 渲染期取数，导出 / 打印 / 纯 HTML 渲染退化为带标题的占位卡片；
- 文档正文里不存记录快照，因此表格被删除后块显示「缺少多维表格引用信息」。

### 25.2 文档反向引用记录

**接口**：`GET /projects/:projectId/base/doc-backrefs/:nodeId`

**实现**（`pros/api/internal/base/service.go` → `ListDocBackrefs`）：

1. 取空间内全部 Base → 全部表 → `type='doc'` 的字段；
2. 在 `base_record_values.value_text` 里匹配节点 ID（`doc` 字段的投影值是「、」拼接的 ID 列表）；
3. 返回 `{ baseId, nodeId, tableId, tableName, recordId, recordTitle, fieldId, fieldName }`，
   `recordTitle` 取主字段投影文本。

**前端**：`DocBackrefs.vue` 分「被引用」与「多维表格引用」两段；
点击引用项 → `open-node` → `KnowledgeView.openKnowledgeNodeById` → 打开对应多维表格节点。

### 25.3 关键字搜索：修复 500 + 支持按文档标题检索

- **修复**：关键字搜索的统计分支里引用了失效的表别名（`base_records.id`，而 FROM 已是 `base_records AS r`），
  导致「只要带关键字就 500」。现统一为 `r.id`。
- **增强**：`keywordCondition` 在直接命中投影文本之外，还会把当前空间目录树里**标题命中关键字的节点**
  （最多 20 个）取出来，回表匹配「关联文档」字段的投影值 —— 于是可以按**文档标题**搜到记录。
- SQL 拼装拆成纯函数 `buildKeywordCondition`，脱离数据库可单测。

### 25.4 顺带修复：字段能力与投影不一致

`long_text` / `link` / `doc` 三种字段声明 `Filterable: true` 但 `Indexable: false`，
导致 `syncAllProjections` 跳过它们 —— **这三种字段根本筛不出结果**（不是「按 ID 筛选」，是筛不到）。

- 修复：三种字段改为 `Indexable: true`；
- 补投影：新增 `reindexTable(ctx, tableID)`，按当前字段能力重建整表投影（上限 5000 条），
  在 `CreateField` 与 `MigrateField` 之后调用，存量值一并补齐。

**实测**：`doc` 字段 `contains` 筛选命中 1 条（此前 0 条）。

---

## 26. 第五轮：筛选 / 批量 / 视图交互补齐

### 26.1 「关联文档」按标题筛选（限制 1 的正面解法）

`doc` 字段存的是节点 ID，用户在筛选面板里按直觉写的是**文档标题**，直接拿标题匹配 ID 永远命中不了。
本轮分两层解决：

- **服务端（`query.go`）**
  - `resolveDocTitleFilters`：递归遍历 `FilterGroup`，把 `doc` 字段条件里的非 UUID 值按**标题**反查节点 ID
    （当前空间目录树，最多 20 个），解析不到就原样保留（自然不命中）；
  - `docConditionSQL`：`doc` 字段是多值文本（ID 以「、」连接），条件值可以是单个 ID 或 ID 数组，
    命中语义为「包含其中任意一个」；`notcontains` 取反。
- **前端（`BaseQueryPanel.vue`）**
  - `doc` 字段的条件值控件换成**可搜索多选下拉**，选项是文档标题（`docOptions` 由 `BaseEngineView` 传入），
    存回服务端的仍是节点 ID。

实测：条件值 `关联示例`（标题）→ 命中 1 条；条件值 `["<id1>","<id2>"]` → 命中 1 条；`不存在的文档` → 0 条。

### 26.2 批量操作「部分成功 + 失败明细」（限制 2）

原实现逐条调用单条接口，但**任一条失败就整批报错**，已成功的记录既没提示也没清单。
本轮改为显式的部分成功语义：

- **服务端**：`BatchCreatePartial` / `BatchUpdatePartial` / `BatchDeletePartial` 逐条执行，
  失败项收集成 `BatchFailure{Target, Message}`；HTTP 层用 `body.partial=true` 开启，
  返回 `{ rows, failures, succeeded, failed }`。不带 `partial` 时保持旧行为（兼容既有调用方）。
- **前端**：`BaseBatchDialog` 与 `BaseImportDialog` 都改用 `partial: true`，
  弹窗里直接列出「成功 N / 失败 M」与逐条失败原因（记录 ID 或「第 X 行」）。

实测：2 条记录批量改为非法 `doc` 值 → `succeeded 0 / failed 2`，两条明细都带具体原因；
把「阶段」（单选）改成不存在的选项 + 一条不存在的记录 ID → 两条失败原因分别为
`阶段：unknown option: …` 与 `record not found`。

### 26.3 表格 → 文档的反向索引（内嵌引用）

文档内嵌 Base 视图块后，表格侧也要能回答「哪些文档嵌了我」：

- **接口**：`GET /projects/:projectId/base/embedders/:baseId`
- **实现**：扫当前空间 `node_type='doc'` 的节点，联表 `kb_documents`（表名见 `internal/db/table_naming.go`），
  命中正文里的 `data-base-id="<baseId>"` 即认为内嵌了本 Base；
- **前端**：工具栏「数据」组新增「内嵌 N」按钮，弹窗列出文档标题，点击直接打开该文档。

### 26.4 日历视图拖拽改期（限制 3 的一半）

日历视图的事件块现在可拖拽：拖到另一天即改写记录的日期字段（`update-cell`），落点日期格高亮。
画廊视图补上「卡片自定义字段」：视图配置里可勾选最多 4 个字段（存 `config.layout.galleryFields`），
画廊卡片按勾选顺序渲染，未配置时仍回退到「前 2 个非主字段」。

### 26.5 路由注册陷阱（踩坑记录）

Hertz 的路由树里，**同一层同时存在静态段与参数段**时，新增参数子路由可能把静态路由吸走：
注册 `GET /:baseId/embedders` 之后，`GET /bases` 会被当成 `baseId="bases"` → 404 `base not found`。
因此本项目的 Base 路由约定：

- 顶层静态资源（`/bases`、`/field-types`、`/ensure`）与参数路由**不混在同一层新增**；
- 需要「按 baseId 取某个子资源」时，优先用静态前缀 + 参数（`/embedders/:baseId`），
  或复用已有的 `/:baseId/xxx` 形态但**不再新增同层参数路由**。

---

## 27. 第六轮：记录级反向引用 · 失败项一键重试 · 附件文件名检索 · 详情入口

### 27.1 记录详情「引用本记录的文档」（补齐第 11 章融合点 3）

第 11 章列了三个融合点，前两轮补齐了「文档 → 记录」（文档反向引用页签）与
「表格 → 文档」（表格侧「内嵌 N」弹窗），剩下的「**记录 → 文档**」本轮落地：

- **接口**：`GET /projects/:projectId/base/records/:recordId/doc-references`
- **实现**（`internal/base/service.go` → `ListRecordDocReferences`）：
  记录 → 所属表 → 所属 Base；再扫当前空间 `node_type='doc'` 的节点（联表 `kb_documents`）：
  - 正文含 `data-base-id="<baseId>"` → `kind=embed`（文档内嵌了本表）；
  - 正文含本记录 ID → `kind=mention`（文档正文提到了本记录）。
- **前端**：`BaseRecordDrawer` 新增「引用本记录的文档」区块，点击条目 → `open-node`
  → `KnowledgeView.openKnowledgeNodeById` 打开对应文档。

### 27.2 记录详情的入口（原来只有公式字段能打开）

之前记录详情抽屉只能通过**双击公式字段**触发，普通记录没有任何入口 —— 详情里的
「引用本记录的文档」根本点不出来。本轮给 Grid 加了一列**详情入口**：

- `grid/BaseGrid.vue` 新增固定在左侧的 `__detail` 列（宽 46px），每行一个 24×24 的文档图标按钮；
- 点击 → `emit('open-record', row.id)` → 打开记录详情抽屉；
- 单元格双击进入编辑的既有行为不变（`BaseFieldCell` 上的 `.stop` 会拦下网格级事件）。

### 27.3 失败项一键重试（补齐已知限制 2）

「部分成功 + 失败明细」已经有了，但失败项只能看、不能重试。本轮补上重试入口：

- **批量操作**（`BaseBatchDialog.vue`）：保留上一次动作（update / delete）与参数，
  失败明细里凡是**记录 ID 形态**的目标都可重试 → 按钮「重试失败项（N）」，
  只把失败的 ID 再提交一次，成功的记录不会被重复写。
- **CSV 导入**（`BaseImportDialog.vue`）：失败目标的形态是「第 N 行」，
  解析出行号后只重试这些行 → 按钮「重试失败行」。

### 27.4 附件按文件名检索（补齐已知限制 7）

附件字段的值是 `url#文件名`，投影成 JSON（`value_json`），而关键字搜索只扫 `value_text`
→ 搜不到文件名。本轮两步修：

- `registry.go`：`attachment` 的 `Indexable` 改为 `true`（此前整个字段不写投影，
  连关键字都搜不到）；`Filterable` 仍为 `false`（不做「按附件筛选」这种条件）。
- `query.go`：关键字搜索除 `value_text` 外，再匹配 `value_json::text`，
  于是「sample.png」能命中 `/media/<uuid>#sample.png`。
- `service.go`：`UpdateField` 之后触发 `reindexTable`，把存量记录的附件投影补齐
  （否则改了能力也要等下一次写入才有投影）。

### 27.5 路由与表名口径

- 新增路由 `GET /projects/:projectId/base/records/:recordId/doc-references`：
  沿用「静态前缀 + 参数」形态（`records/:recordId/...`），不与顶层静态段混层，
  避开 26.5 记录的 Hertz 路由树陷阱。
- 新增的 SQLite 影子模型（`baseRecordSQLite` / `baseRecordValueSQLite`）与
  `model.BaseRecord` / `model.BaseRecordValue` 字段保持一致，
  因为 `UpdateField` 现在会触发重投影，测试库必须有这两张表。


## 28. 第七轮：手动排序位 · 排序失效根因修复 · 画廊拖拽排序 · 日历跨月 · 按新值重试

### 28.1 根因修复：GORM 的 `Order` 会静默丢弃 `clause.Expr`（P0）

第七轮开工前的第一个症状是「记录顺序怎么改都不变」。排查后确认**不是**数据没写进去，
而是**服务端根本没把 ORDER BY 送到数据库**：

```go
// 错误写法（此前一直这么写）
query = query.Order(clause.Expr{SQL: orderSQL, Vars: orderArgs})
```

GORM v1.31 的 `Order(value any)` 只识别三种入参 —— `string` / `clause.OrderBy` / `clause.OrderByColumn`，
传入 `clause.Expr` **既不报错也不生效**，直接被 `switch` 丢掉。
后果是连锁性的：

| 能力 | 修复前实际表现 |
| --- | --- |
| 用户排序（`sorts`） | 完全失效，记录恒按库表物理顺序返回 |
| 分组排序（`groups`） | 完全失效 |
| 手动排序位（本轮新增） | 完全失效 |

也就是说「筛选与排序」面板里的排序项一直是个摆设 —— 前几轮只验证了筛选，
排序项因为返回的是全量数据、顺序又恰好接近插入序，一直没被发现。

修复（`internal/base/query.go`）：

```go
query = query.Order(clause.OrderBy{
    Columns: []clause.OrderByColumn{{
        Column: clause.Column{Name: orderSQL, Raw: true},
    }},
})
```

配套把 `buildOrderSQL` 的返回签名从 `(string, []any)` 收敛为 `string`：
排序片段里只有**列名**（`sv.value_text` / `gv.value_number` …），取值来自
`LEFT JOIN base_record_values` 的投影表，本就不需要绑定参数；
原实现收集的 `fieldID` 参数是死参数（SQL 里没有 `?`），留着只会误导。

回归测试见 `internal/base/record_sort_test.go`（3 个用例：手动排序位、用户排序、重排落库）。

### 28.2 手动排序位 `sort_order`

多维表格需要一个**稳定、可持久化、与用户排序正交**的手动次序位，否则：
看板拖拽换组、画廊拖拽排序、日历拖拽改期都会互相覆盖对方的次序。

- **模型**：`model.BaseRecord` 增加 `SortOrder int64`
  （`gorm:"not null;default:0;index:idx_base_record_sort"`）。
- **迁移**：`internal/db/db.go` 新增 `ensureBaseRecordSortOrder`：
  `ALTER TABLE base_records ADD COLUMN IF NOT EXISTS sort_order bigint NOT NULL DEFAULT 0` +
  建索引 + 按 `created_at` 回填存量记录的序号（在 AutoMigrate 之后调用）。
- **写入**：`CreateRecord` 把新记录排到表末尾（`MAX(sort_order)+1`）。
- **读取**：`buildOrderSQL` 的默认次序改为 `r.sort_order ASC, r.id ASC`
  —— 用户排序 / 分组排序在前，手动位在后做稳定兜底。
- **重排接口**：`POST /projects/:projectId/base/tables/:tableId/records/reorder`
  （body `{ "ids": [...] }`）。目标 ids 必须是本表记录（否则 400）；
  表内其余记录保持原相对次序排在其后；每条记录 `version + 1` 触发协同刷新。

### 28.3 画廊拖拽排序

- `views/BaseBoardViews.vue`：卡片可拖（`draggable`），`dragover` 高亮目标卡片，
  `drop` 时按落点位置算出新的 id 顺序 → `emit('reorder', ids)`。
- **拖拽数据必须显式写入**：`dragstart` 里除设置 `effectAllowed='move'` 外，
  还要 `event.dataTransfer.setData('text/plain', row.id)` ——
  HTML5 拖拽若不写 dataTransfer，Chrome 的 `drop` 事件**不会触发**（此前拖拽「看起来能拖、但放不下」）。
- `BaseEngineView.vue` 接收 `reorder` → 调 `reorderRecords` → 成功后刷新记录集。
  注意监听必须挂在 `BaseBoardViews` 上（视图组件），挂到 `BaseGrid` 不生效。

### 28.4 日历拖拽跨月自动切月

日历视图按月铺格子，月末的「下一月」格子（`is-out`）同样可作为落点。
此前把事件拖到 `is-out` 格子时，日期会被改成「下一月同一天」，但**视图仍停在原月份**，
用户看不到刚改期的事件。本轮在 `onDayDrop` 里比较落点月份与当前月份，
不一致时同步调整 `monthOffset`，视图自动翻到目标月份（实测 11 月 → 12 月）。

### 28.5 失败项按「当前值」重试

第六轮的「失败项一键重试」沿用上一次的参数，用户改完值仍会失败。
本轮 `BaseBatchDialog.retryFailed` 改为：**当前已选字段 + 当前输入值**优先，
没有选择时才回落到上一次的参数。CSV 导入侧的行级重试语义不变（按行重放整行映射）。

## 29. 第八轮：关联记录关系化 · 双向关系 · 附件按文件名筛选

### 29.1 关联记录（link 字段）此前是「半成品」

`link` 字段（关联记录）虽然注册在字段注册表里，但整条链路其实是断的：

| 环节 | 修复前 | 修复后 |
| --- | --- | --- |
| 写值校验 | 无 —— 可以写入任意字符串 / 不存在的 ID | 目标记录必须存在、且属于同一个 Base |
| 单元格展示 | 直接显示裸 UUID（`1ec55b0b-8c7a…`） | 显示目标记录的**标题**（胶囊样式） |
| 选择器 | 没有（退化成普通文本框） | 多选下拉 + 远程搜索（按目标表记录标题检索） |
| 点击行为 | 无 | 点击胶囊 → 跨表跳转并打开目标记录详情 |
| 关系查询 | 无 | 记录详情里给出「正向 / 反向」关系清单 |
| 关系表 | `base_record_links` 建了但**从未写入** | 随记录写入事务同步维护 |

### 29.2 写值校验（`validateLinkRefs`）

- 目标记录必须存在且未删除；否则报「`<字段名>` 关联的记录不存在」。
- 目标记录所在表必须与当前表**同属一个 Base**；否则报「关联的记录不在当前表格空间」。
- 校验在 `CreateRecord` / `UpdateRecord` 内、投影写入之前执行，批量操作复用同一条路径。

### 29.3 关系落地与双向查询（`internal/base/relations.go`）

- **写入**：`syncRecordLinks` 在记录写入事务里「先删后插」`base_record_links`
  （source_table / source_record / field / target_table / target_record / sort_order）。
  记录删除时同步清掉出边与入边。
- **正向关系**：取本记录各 link 字段的值 → 解析目标记录标题。
- **反向关系**：扫描同 Base 内所有表的 link 字段，找出指向本记录的记录。
  事实来源是记录自身的 JSONB（`CAST(data AS TEXT) LIKE`），
  与「文档反向引用」同一思路 —— **老数据不需要回填也能立刻查出关系**；
  `base_record_links` 作为索引随写随维护。
- **接口**：
  - `GET /projects/:projectId/base/records/:recordId/relations` → `{ outbound, inbound }`；
  - `GET /projects/:projectId/base/tables/:tableId/link-targets?keyword=&limit=` → 目标表记录候选。

### 29.4 前端：标题、选择器、跨表跳转

- `BaseFieldCell`：
  - link 字段新增 `linkTitles` / `linkOptions` / `linkTargetTableId` / `projectId` 四个 prop；
  - 展示态渲染胶囊（`.base-cell__link-chip`），标题缺失时回退「记录 <ID 前 8 位>」；
  - 编辑态用 `el-select`（multiple + filterable + **remote**），远程搜索走
    `link-targets` 接口；已选中的记录即使不在候选里也会补进选项，保证回显标题。
- `BaseEngineView`：
  - 查询完成后按 link 字段的目标表批量拉候选，建立「记录 ID → 标题」映射；
  - `onOpenRecordRef`：目标表不同先切表；目标记录不在当前筛选结果里时，
    再按标题检索一次定位（避免「点了没反应」）。
- `BaseRecordDrawer`：新增「关联记录（正向 N · 反向 M）」区块，
  分「我关联的记录 / 关联到本记录的记录」两组，点击即跨表跳转。

### 29.5 附件按文件名筛选（收口已知限制 7）

之前附件只能被**关键字搜索**命中，筛选面板里没有附件条件。现在：

- 注册表：`attachment` 的 `Filterable` 改为 `true`；
- 查询：附件走 `value_json::text ILIKE`（按文件名模糊匹配），而不是 JSON 包含判断
  （附件值是 `url#文件名` 数组，JSON 包含判断对文件名没有意义）；
- 筛选面板：附件字段的操作符显示为「文件名包含 / 文件名不包含 / 为空 / 不为空」。

## 30. 第九轮：字段级权限策略（P1）· 操作记录（审计）面板

### 30.1 字段级权限策略：把技术方案第 8 章的 P1 落地

技术方案第 8 章要求「**字段隐藏 ≠ 字段安全**：敏感字段在 API 返回前过滤」，
此前一直只做了空间级角色（admin / editor / viewer），字段级策略是空的。本轮补齐：

**配置格式**（写在 `base_fields.config.permissions`）：

```json
{
  "permissions": {
    "hidden":   ["viewer"],   // 这些角色看不到该字段
    "readOnly": ["editor"]    // 这些角色能看但不能改
  }
}
```

未配置 `permissions` 的字段对所有角色可见可编辑（保持既有行为，存量数据零影响）。

**服务端强制点**（`internal/base/fieldpolicy.go`）：

| 位置 | 行为 |
| --- | --- |
| `Query` | 字段元信息里剔除隐藏字段；记录数据里**删除**隐藏字段的值（值不过网） |
| `ListFields` | 访客拿不到隐藏字段的元信息（连列都不存在） |
| `keywordCondition` | 关键字搜索只扫可见字段，避免「搜得到 / 搜不到」反推隐藏内容 |
| `CreateRecord` / `UpdateRecord` | 写只读字段直接 422（`字段 X 对当前角色只读`），不依赖前端禁用 |
| `FieldMeta.ReadOnly` | 服务端按**当前请求人角色**算出的只读标记，前端据此禁用编辑并显示锁图标 |

> 关键实现细节：隐藏字段的剔除必须用**未过滤**的字段索引来做，
> 否则过滤后索引里已经没有该字段，`stripHiddenFields` 会漏掉（第一版就踩了这个坑）。

**前端**：
- 字段管理面板每个字段新增「锁」按钮 → 弹窗配置「不可见角色 / 只读角色」，
  保存时合并原 config（`config` 是整体覆盖，不能只传 `permissions`）；
- 配置过的字段行显示「权限」标签；
- 网格列头与单元格对只读字段显示锁图标，双击不进入编辑。

### 30.2 操作记录（审计）面板

`base_operation_logs` 一直在写，但**前端没有任何入口**，用户看不到「谁改了什么」。
本轮把它变成可用功能：

- 后端：`GET /base/:baseId/audit?limit=` 返回审计条目，并批量补上**操作者显示名**
  （`core_users.display_name`，没有则回退邮箱 / ID 前 8 位，避免 N+1）。
- 前端：工具栏「数据」组新增「操作记录」按钮 → 右侧抽屉（Telegram 面板规范）：
  - 每条显示操作类型标签（新建 / 更新 / 删除记录）、时间、操作者、记录短 ID；
  - **字段级差异**：`before → after`（字段名由 fieldId 翻译；最多展示 4 个变更字段）；
  - 支持刷新。

### 30.3 与设计文档的对应关系

| 设计要求（技术方案） | 落地位置 |
| --- | --- |
| 第 8 章 · 字段级策略（P1） | 30.1（本轮） |
| 第 8 章 · 服务端每次读写都校验 | 30.1（Query / 写路径 / 关键字搜索） |
| 第 8 章 · SSE 订阅与推送走同一套权限策略 | SSE 事件只广播「哪些字段变了」，**不携带字段值**（见 30.4） |
| 第 6.4 节 · 审计可查修改前后 | 30.2（本轮新增 UI） |

### 30.4 SSE 事件不携带字段值（字段级权限不被绕过）

字段级权限策略落地后发现一条**绕过路径**：SSE 订阅是**空间级**的，
`base_event_outboxes` 的 payload 之前带 `"fields": {字段ID: 值}`，
订阅端不区分角色 —— 隐藏字段的值会随推送广播出去，直接绕过 30.1 的服务端过滤。

本轮修复（`internal/base/service.go` + `internal/base/events.go`）：

| 位置 | 修复前 | 修复后 |
| --- | --- | --- |
| `writeEvent`（record.created / record.updated） | `"fields": {字段ID: 值}` | `"fieldIds": ["字段ID", …]` + `"version"` |
| `publishPending`（outbox → 广播） | 直接透传 payload | 广播前 `delete(payload, "fields")` 兜底 |

- 前端收到 `record.updated` 后**按字段 ID 重新拉取**该记录并做乐观合并，
  值仍然走带鉴权的查询接口，权限策略保持唯一事实来源；
- 历史遗留的 52 条含 `fields` 的 outbox 行已一次性清洗（`payload - 'fields'`），
  避免以后误重放时泄露。

### 30.5 审计面板的「可读化」

审计存的是快照，直接渲染对使用者没有意义（`关联合同 6fae77a3-… → （空）`）。本轮补了三层可读化：

| 字段类型 | 修复前 | 修复后 |
| --- | --- | --- |
| `link`（关联记录） | 裸 UUID | 目标记录标题（如 `星海科技 · 年度服务合同`） |
| `doc`（关联文档） | 裸节点 UUID | 知识库节点标题（如 `关联示例文档`） |
| `user`（成员） | 裸 UUID / 历史显示名 | 成员显示名（如 `李经理`） |

另外补了两个上下文缺口：

- **`tableName`**：审计可能来自 base 内**其它表**（如「合同」表），
  现在每条都带上表名，避免把别的表的记录误认成当前表；
- **`fieldNames`**（字段 ID → 字段名）：前端只有当前表的字段表，
  跨表审计会显示裸 ID；现在由服务端按该条记录所属表解析后下发。

> 实现坑：把「取不到显示名」的值按 `id[:8]` 截断，会从**字节**中间切开 UTF-8 中文，
> 导致 `李经理` 变成 `李经��`。现在只对 UUID（纯 ASCII）截断，
> 非 UUID 值（历史数据里已经是显示名的）原样返回。

---

## 31. 第十轮：记录级可见性 · SSE 断线补拉 · 视图共享与个人分离

第十轮把「协作安全」这条线补完：字段级权限（第 30 章）解决「看不见某些列」，
本轮解决「看不见某些行」「断线不丢事件」「个人配置不互相覆盖」三件事。

### 31.1 记录级可见性（DataScope）

| 项 | 设计 |
| --- | --- |
| 取值 | `space`（空间内可见，默认）/ `restricted`（仅创建者与空间管理者可见） |
| 落库 | `base_records.visibility varchar(16) NOT NULL DEFAULT 'space'` + 索引 `idx_base_record_scope` |
| 迁移 | `internal/db/db.go` → `ensureBaseRecordVisibility`（ADD COLUMN + CREATE INDEX + 回填 `''`→`space`） |
| 判定 | `internal/base/datascope.go` → `recordScopeAllows` / `applyRecordScope` / `assertRecordVisible` |
| 写权限 | 只有空间管理者（`roleRank >= RoleAdmin`）能改可见范围，其余角色 `403 / 40301` |

**注入点（关键）**：过滤必须发生在 **SQL 生成阶段**，不能「查出来再在内存里删」。
`internal/base/query.go` 的 `Query` 里**计数（base）与取数（query）都要注入同一条件** ——
只注入取数会出现 `total = 0 但 records = 1` 的错位（分页器会认为没数据而提前翻页）。

**表别名坑**：`applyRecordScope` 必须带 alias 参数。
Query Engine 用 `r`（`base_records AS r`），用 `Model(&BaseRecord{})` 的地方别名是空串。
写死 `"r."` 会在非 Query Engine 路径上直接报 `no such column: r.visibility`。

**覆盖到的读路径**：记录详情 / 更新 / 删除、关联记录候选与已建关联、
`recordBrief` / `recordTitle`、文档反向引用（`visibleRecordIDs` 二次过滤）。

> 为什么不能「先查再删」：受限记录的**值**会先进内存再被丢弃，
> 这在安全审计上等于「读到了再假装没看到」；而且分页 / 筛选 / 排序都会算错。

### 31.2 SSE 断线补拉（Last-Event-ID）

| 位置 | 改动 |
| --- | --- |
| `internal/base/events.go` | 新增 `ReplaySince(ctx, projectID, lastEventID, limit)`：按 outbox `created_at > 锚点` 回放 |
| `internal/base/handler.go` | `Events` 读取 `Last-Event-ID` 头或 `?lastEventId=`，**进实时循环前**先补发 |
| `src/modules/base/realtime.ts` | 记录 `lastEventId` / `everConnected`，重连带 `Last-Event-ID` 头，新增 `onResync` 回调 |
| `BaseEngineView.vue` | `onResync: () => scheduleRefresh()` —— 补拉保证「不漏事件」，重连后仍做一次全量刷新对齐状态 |

补发前同样 `delete(payload, "fields")`，与 30.4 的广播兜底保持一致（历史 outbox 里可能还有旧格式）。

### 31.3 视图「共享 / 个人」分离（最终形态：独立表）

最初的做法是把个人偏好塞进 `base_views.config.personal[uid]`，实测下来有两个硬伤：

| 硬伤 | 现象 |
| --- | --- |
| 写覆盖 | A 保存共享配置时整段替换 `config`，把 B 的个人偏好一起抹掉 |
| 读泄露 | `ListViews` 原样下发 `config`，别人的列宽 / 字段显隐被我读到 |

**最终形态**：个人偏好独立成表 `base_view_prefs`（`(view_id, user_id)` 唯一）。

| 表 | 存什么 |
| --- | --- |
| `base_views.config` | 共享配置（列宽 / 字段显隐 / 布局 / 筛选 / 排序 / 分组） |
| `base_view_prefs.config` | 当前用户的个人偏好（目前只覆盖显隐 / 列宽 / 布局） |

写入语义（`splitViewPersonal`）：

| 客户端提交的 `config.personal` | 服务端行为 |
| --- | --- |
| 缺这个键 | 完全不动个人偏好（区分「没改」与「要删」） |
| 有这个键且含自己的 uid | upsert `base_view_prefs` 一行 |
| 有这个键但不含自己的 uid | 删除自己的那一行（共享模式保存 = 取消个人偏好） |

> 前端坑：共享模式下若把 `config.personal` 置为 `undefined`，
> JSON 序列化后整个键会消失，服务端就无法区分「没动」和「删掉我的偏好」，
> 旧偏好会一直留着。必须传空对象 `{}`。

**视图可见范围**（`base_views.scope`）：`shared`（空间共享）/ `personal`（仅创建者可见）。
`ListViews` 过滤 `scope = 'shared' OR scope = '' OR owner_id = me`；
个人视图的非所有者读写一律按「不存在」处理（`ErrViewNotFound`），不泄露存在性。

**当前用户 ID 的兜底**：`useAuthStore().user?.id` 在「本地缓存的 user 丢失」时为空，
会让「保存为我的偏好」静默退化成「保存为共享配置」（表现为：只有我自己被改了）。
现在 `authStore.currentUserId` 在拿不到 user 对象时解析 JWT 的 `uid` / `sub`；
并且保存前若仍识别不出用户，**直接提示并放弃写入**，不再静默降级。

> 顺带修掉的两个实现坑：
> 1. `atob` 对缺 `=` padding 的 base64 直接抛错，JWT 解码要自己补 padding；
> 2. Pinia setup store 里的 `computed` **必须写进 setup 的 return**，否则外部拿到的 `undefined`。

### 31.4 本轮新增数据表

| 表 | 域前缀 | 说明 |
| --- | --- | --- |
| `base_view_prefs` | `base_` | 视图个人偏好（`view_id` + `user_id` 唯一） |

迁移：`ensureBaseViewPrefsSchema`（建表 + 索引）+ `migrateLegacyViewPersonal`
（把历史写在 `base_views.config.personal` 里的个人偏好搬进新表）。

---

## 32. 第十一轮：权限体系收口（按人授权 · 订阅失效 · 按人字段策略 · 审计可查）

第 8 章的要求是：「服务端每次读写都校验 / 记录级过滤在 SQL 生成时注入 /
**SSE 订阅与推送走同一套权限策略；权限变更后失效订阅**」。
第十一轮把剩余的三处「粗粒度」补齐到可交付形态。

### 32.1 记录级可见性第三档：`custom`（指定成员可见）

| 项 | 设计 |
| --- | --- |
| 取值 | `space`（空间内可见）/ `restricted`（仅创建者与管理者）/ `custom`（**指定成员可见**） |
| 授权名单 | 新表 `base_record_grants`（`record_id` + `user_id` 唯一，另有 record / user / project 索引） |
| 判定 | `recordScopeAllows`：space → 空间成员；restricted → 创建者 + 管理者；custom → 创建者 + 管理者 + 名单成员 |
| 写入 | `PATCH /records/:id` 携带 `visibility` + `grants`；只有空间管理者能改（其余 `403 / 40301`） |
| 校验 | 授权对象**必须是空间成员**，否则 `42201`（给外人授权是「看起来生效、实际无效」的假权限） |
| 读取 | 新增 `GET /records/:recordId/grants` → 授权成员（含显示名） |

查询注入（`applyRecordScope`）：

```sql
( r.visibility = 'space'
  OR r.created_by = :me
  OR r.id IN (SELECT g.record_id FROM base_record_grants g WHERE g.user_id = :me) )
```

> 子查询里的表名**不能**带别名前缀（`base_record_grants` 在子查询内是主表），
> 与 31.1 的「别名坑」是同一类错误。

### 32.2 权限变更 → 订阅失效

技术方案第 8 章明确要求「权限变更后失效订阅」，本轮落地为一条领域事件：

| 触发 | 事件 | payload |
| --- | --- | --- |
| 字段权限策略变更（`UpdateField` 携带 `permissions`） | `permission.changed`（aggregateType = `field`） | `{scope:"field", fieldId}` |
| 记录可见范围 / 授权名单变更（`UpdateRecord`） | `permission.changed`（aggregateType = `record`） | `{scope:"record", recordId, visibility}` |

前端（`BaseEngineView.onRealtimeEvent`）收到 `permission.changed` 后走一次全量刷新：
`runQuery()` 会同时带回**最新的字段元信息与记录数据**，因此「权限变了但页面还停在旧视图」
（列还在 / 记录还在）的问题被覆盖。

> 事件走的是与普通写事件相同的 outbox → SSE 通道，因此重连补拉（31.2）同样能补到权限变更。

### 32.3 字段级权限：按人配置

字段策略仍在 `base_fields.config.permissions`（不新增策略表），但从「只按角色」扩展为「角色 + 按人」：

```json
{
  "permissions": {
    "hidden":      ["viewer"],                                  // 角色（旧写法，兼容）
    "readOnly":    ["viewer"],
    "hiddenUsers":   ["用户ID"],                                 // 按人（新）
    "readOnlyUsers": ["用户ID"]
  }
}
```

- 也支持对象写法 `{"hidden": {"roles": [...], "users": [...]}}`（便于将来扩展条件）；
- 判定优先级：先角色后按人，**「不可见成员」优先于角色规则** ——
  被单独列出的成员即便属于某个可见角色也拿不到该字段；
- 服务端内部把「角色 + 人」统一抽象成 `policySubject{role, userID}`，
  所有判定函数（隐藏 / 只读 / 裁剪索引 / 剔除值 / 写校验）都按它工作。

> **清除权限的坑**：服务端为了「改类型配置时不冲掉权限策略」，会在客户端**没带**
> `permissions` 时保留旧策略。于是前端若用「不传 permissions」表达清除，就永远清不掉。
> 现在前端显式提交空策略对象，服务端识别「空策略」并删除该键
> （`isEmptyPermissions`）—— 取消权限必须有一条明确的「清空」通道。

### 32.4 审计可查性：分页 + 筛选

| 能力 | 接口 | 前端 |
| --- | --- | --- |
| 分页 | `GET /base/:baseId/audit?limit=&offset=` → `{items,total,limit,offset}` | 「加载更多」按钮（每页 30 条） |
| 操作类型筛选 | `?action=record.created` | 操作类型下拉（复用面板已有的文案表） |
| 时间范围筛选 | `?from=&to=`（RFC3339） | 时间范围选择器 |

审计条目的**可读化**（操作者显示名 / 记录标题 / 跨表字段名）保持不变，
且隐藏字段的值仍按当前身份剔除（`stripHiddenJSON` 现在按 `policySubject` 判定，按人隐藏同样生效）。

### 32.5 本轮新增数据表

| 表 | 说明 |
| --- | --- |
| `base_record_grants` | 记录级授权名单（`record_id` + `user_id` 唯一） |

迁移：`ensureBaseRecordGrants`（建表 + 索引）。

---

## 33. 第十二轮：审计可查性收口 + 授权名单批量化

第十一轮把审计做到了「能分页、能按操作类型与时间范围筛」，
但仍缺两块最常被追问的能力：**「谁改的」与「这条记录被谁改过」**；
同时授权名单只能逐个勾选，成员多的空间操作成本高。本轮补齐。

### 33.1 审计按操作者 / 按记录筛选

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 按操作者 | `?operator=<userId>` | 服务端按 `operator_id` 精确匹配 |
| 按记录（完整 ID） | `?recordId=<uuid>` | 精确匹配 `record_id` |
| 按记录（前缀） | `?recordId=1ec55b0b` | 非 UUID 输入按**前缀**匹配，自动规范化成 UUID 规范写法 |

前缀规范化（`canonicalUUIDPrefix`）：去掉短横线 → 校验十六进制 → 按 8-4-4-4-12
的规范结构补回短横线，因此用户输入 `1ec55b0b` / `1ec55b0b-8c7a` 都能命中同一条记录。
非法输入（如中文）**不报错**，只是忽略该条件，避免用户误输入把整个列表查空。

> 数据库差异：Postgres 用 `record_id::text LIKE '前缀%'`；
> SQLite（单测影子库）用 `CAST(record_id AS TEXT) LIKE`，
> 服务端按 `s.db.Dialector.Name()` 分支，避免测试与生产行为不一致。

### 33.2 审计导出 CSV

前端把**当前已加载**的条目导出为 CSV（`\ufeff` BOM 头，Excel 直接打开不乱码）：
列 = 时间 / 操作 / 操作者 / 数据表 / 记录 / 字段 / 变更前 / 变更后。
一条日志含多个字段差异时拆成多行，便于用表格工具做二次分析。

### 33.3 时间范围快捷

审计面板顶部加「今天 / 近 7 天 / 近 30 天 / 全部」分段控件，
与手动选择的时间范围双向绑定（快捷切换会覆盖手动选择，反之亦然）。

### 33.4 授权名单批量化

记录抽屉的「可见成员」区新增**按角色批量授权**（管理员 / 编辑者 / 访客）
与「清空」两个快捷动作：按角色一次把该角色的全部空间成员加入名单，
「清空」则是显式撤销。两者都复用同一份 `grants` 全量覆盖语义，
不引入第二套授权写路径，避免两套逻辑不一致。

---

## 34. 第十三轮：视图个人查询偏好（筛选 / 排序 / 分组按人隔离）

第十一轮把「字段显隐 / 列宽 / 布局」做成了按人隔离（`base_view_prefs`），
但**筛选 / 排序 / 分组仍写在视图共享段**里：这是一处硬伤 ——
A 改一次筛选，所有人打开这个视图看到的都是 A 的条件，没人能保留自己的口径。
本轮把查询条件也纳入个人偏好体系，并把「谁有资格写偏好」这件事在服务端说清楚。

### 34.1 配置结构

| 位置 | 键 | 含义 |
| --- | --- | --- |
| 共享段 `base_views.config` | `filters` / `sorts` / `groups` | 视图给所有人看的默认查询条件 |
| 个人段 `base_view_prefs.config` | `query.filters` / `query.sorts` / `query.groups` | 「我的」查询条件，优先级更高 |

生效规则：`我的 query` 存在 → 用它；否则用共享段。
（`effectiveViewConfig` 统一合并，前端只认这一份「有效配置」。）

### 34.2 保存范围切换

工具栏「筛选 / 排序 / 重置」按钮组内新增分段控件 **共享 / 仅我**：

- **共享**：写共享段（与历史行为一致），并清掉我自己的 `query` 覆盖；
- **仅我**：以当前条件为种子写进我的个人段，共享段原样不动（服务端整体替换共享段，
  所以前端必须把共享段原样回传，否则会把别人的共享条件抹掉）。

筛选弹窗顶部有随当前范围变化的提示文案，避免「我以为是私密的，结果改的是共享的」。

### 34.3 权限模型（服务端）

| 操作 | 访客 | 编辑者 | 管理者 |
| --- | --- | --- | --- |
| 读视图 / 共享条件 | ✅ | ✅ | ✅ |
| 写**自己的**个人偏好（`base_view_prefs`） | ✅ | ✅ | ✅ |
| 写**共享段**（视图名 / 类型 / 共享配置） | ❌ | ✅ | ✅ |
| 新建**个人视图** | ✅ | ✅ | ✅ |
| 新建**共享视图** | ❌ | ✅ | ✅ |
| 改别人的个人视图 | ❌ | ❌ | ❌ |

实现要点：

- `UpdateView` 从「必须编辑者」放宽到「访客即可」，但**访客提交的共享段一律忽略**
  （只落 `base_view_prefs`），访客改不动共享配置；
- 自己的**个人视图**只有自己看得到，因此访客可以完整编辑它（视同共享权限）；
- `CreateView` 按目标可见范围决定门槛：`personal` → 访客，`shared` → 编辑者。

### 34.4 连带修掉的两个坑

1. **视图设置弹窗会误删个人查询偏好**：原实现在「保存为共享配置」时把整个
   `personal[uid]` 删掉，个人查询条件被连带清空。现在只删字段级偏好
   （`fieldVisibility` / `fieldWidths` / `layout`），`query` 保留。
2. **「重置」按钮不落库**：重置只改了内存状态，刷新后又回来了。现在重置同样走
   `persistViewConfig`，按当前范围写回。

---

## 35. 第十四轮：查询口径叠加（共享条件 AND 我的条件）

第十三轮把筛选 / 排序 / 分组做成了按人隔离，但**「我的条件」会整体盖住「共享条件」**：
管理员定了「本季度推进中」的口径，同事设了自己的筛选后，管理员那条口径就「消失」了。
本轮支持两种口径，并让用户在界面上随时切换。

### 35.1 口径模型

个人段 `personal[uid].query` 新增 `combine`：

| combine | 生效口径 | 说明 |
| --- | --- | --- |
| `override`（默认，兼容历史数据） | 我的条件**覆盖**共享条件 | 第十三轮的行为 |
| `and` | 共享条件 **AND** 我的条件 | 叠加口径：既看视图口径，又加自己的过滤 |

- 筛选：两组条件合并为一个 `AND` 条件组（`conditions` 拼接、`children` 拼接）；
- 排序 / 分组：个人规则优先，个人为空时回落共享规则。

### 35.2 前端结构（可测）

口径计算抽到独立纯函数模块 `src/modules/base/viewQuery.ts`：
`normalizeFilters` / `mergeFilters` / `normalizeCombine` / `resolveFilters` / `resolveSorts` / `resolveGroups`，
配套单测 `viewQuery.test.ts`（7 例）。原来这段逻辑埋在 SFC 里，只能靠肉眼看，改一处条件就可能
把别人的口径改掉 —— 现在可以直接跑用例。

> 踩坑记录：`el-switch` 的 `v-model` 写出来的是**布尔值**，直接绑到
> `combineMode: 'override' | 'and'` 上会存成 `false`，导致叠加开关自己关掉。
> 现在用 `:model-value="combineMode === 'and'"` + `@change` 显式映射，
> 并且 `normalizeCombine` 只认 `'and'`，脏值一律按覆盖处理。

### 35.3 界面

- 工具栏「仅我」模式下出现「叠加共享条件」开关（`el-switch` + 文案）。
- 筛选弹窗提示随口径变化：叠加时说明「最终筛选 = 视图共享条件 AND 我的条件」。
- 视图标签上出现「我的条件」标记，一眼看出哪些视图上你改了口径。

### 35.4 状态来源分离

第十四轮把「可编辑集合」与「生效集合」彻底分开：

| 集合 | 来源 | 用途 |
| --- | --- | --- |
| 共享条件 | `config.filters/sorts/groups` | 叠加底座 / 共享模式的可编辑内容 |
| 我的条件 | `personal[uid].query` | 个人模式下的可编辑内容 |
| 生效条件 | 按 `combine` 计算 | 真正发给 `/query` 的参数 |

这样「面板里编辑的永远是我这一侧的条件」，不会因为叠加而在保存时把共享条件
复制进个人段、越叠越脏。

---

## 36. 第十五轮：字段级「条件可见」策略

已知限制 0.2 说的是「字段级权限只能按角色 / 按人，缺条件可见」。本轮补齐：
字段可以声明「只有满足某些条件的记录才看得到它」。

### 36.1 配置格式

写在字段的 `config.permissions` 里，与既有的 `hidden` / `readOnly` 并列：

```json
{
  "permissions": {
    "hidden": [], "readOnly": [], "hiddenUsers": [], "readOnlyUsers": [],
    "visibleWhen": {
      "logic": "AND",
      "conditions": [{ "fieldId": "预算字段ID", "operator": "gt", "value": 10000 }]
    }
  }
}
```

- `visibleWhen`：不满足条件 → **该行看不到这个字段**；
- `hiddenWhen`：满足条件 → 该行看不到这个字段（反向写法，与 `visibleWhen` 二选一用）；
- 两者都没配 → 全员可见（与既有行为一致）。

支持的运算符：`eq/is`、`ne/isnot`、`contains`、`notcontains`、`startswith`、
`endswith`、`gt`、`gte`、`lt`、`lte`、`isempty`、`isnotempty`。

### 36.2 判定语义

| 维度 | 规则 |
| --- | --- |
| 判定粒度 | **按记录**（同一列不同行可见性可以不同） |
| 判定位置 | 服务端（值不过网），不是前端遮罩 |
| 管理者 | **与其他人一致**（条件描述的是数据可读性，不是某类人的权限） |
| 写路径 | 记录不满足条件时，写入该字段直接 `42201`（不能先写进去再藏起来） |
| 字段列表 | 字段仍然出现在字段列表里（元信息带 `conditional: true`），因为有的记录看得到 |
| 占位依据 | 服务端在记录上返回 `conditionalHidden: [fieldId…]`，界面据此显示「按条件隐藏」占位符 |

> 与「按角色隐藏」的区别：按角色隐藏是**整列**消失（列与值都不返回）；
> 条件可见是**整列保留、逐行裁剪**。这与飞书多维表格的字段可见性一致。

### 36.3 实现要点

- 判定在内存里做（`matchCondition` / `matchConditionGroup`），不走 SQL：
  条件引用的是同一条记录的其他字段值，服务端手里已经有整行数据。
- `stripHiddenFieldsWithReasons` 同时返回「被条件挡住的字段列表」，
  避免「空值」和「被条件隐藏」在界面上无法区分。
- **`isEmptyPermissions` 的坑**：它原本只认角色 / 人员列表，
  仅有 `visibleWhen` 的策略会被判成「空策略」→ 保存时被整段删除 → 条件静默失效。
  现在条件组也算「非空」。

### 36.4 界面

字段权限弹窗新增「条件可见」区：条件行 = 字段 + 运算符 + 值，
支持「同时满足 / 任一满足」两种组合、增删条件行。
网格与记录详情里，被条件挡住的单元格显示斜纹底 + 「按条件隐藏」占位符（禁止就地编辑）。

---

## 37. 第十六轮：表配置包（结构 + 策略 的整体搬运）

第十五轮把「条件可见」做成了字段级策略，但策略**只在当前表内有效**：
换一张表、换一个空间，策略就没了。数据导出（CSV / Markdown）也只导值，
字段类型、选项、公式、权限策略、视图配置全都丢。

本轮补上「表配置包」：把一张表的**结构 + 策略 + 视图**整体导出成一份 JSON，
再导入到另一张表 / 另一个空间，导入后的新表**行为一致**。

### 37.1 配置包格式

```jsonc
{
  "formatVersion": 1,
  "exportedAt": "2026-11-27T07:22:56+08:00",
  "table": { "name": "客户管理", "description": "..." },
  "fields": [
    {
      "key": "6648b722-…",      // 包内稳定引用键（导出时为原字段 ID）
      "name": "税额",
      "type": "formula",
      "required": false,
      "isPrimary": false,
      "sortOrder": 0,
      "config": { "permissions": { "visibleWhen": { "conditions": [{ "fieldId": "…", "operator": "gt", "value": 100000 }] } } },
      "formula": "IF({预算} > 100000, {预算} * 0.1, 0)"
    }
  ],
  "views": [{ "name": "表格视图", "type": "grid", "config": { "filters": [], "sorts": [] } }]
}
```

- `key`：包内字段的**引用键**。条件可见等策略通过它引用别的字段，导入时据此重映射。
- `config`：字段类型配置（选项、精度、关联目标表…）与 `permissions`（字段级权限策略）**原样保留**。
- `formula`：公式单独带一份 —— 公式定义存在 `base_field_formulas` 表，不在字段 config 里。
- 视图只导出**共享**视图，且剔除 `personal` 段（个人视图 / 个人偏好属于「某个人」，搬走无意义）。

### 37.2 导入语义（三条硬规则）

| 规则 | 说明 |
| --- | --- |
| 只新建，不覆盖 | 导入永远在目标 Base 里**新建一张表**，原表不受影响（避免误操作冲掉在用的表） |
| 引用必须重映射 | 字段 ID 导入后一定变；条件里的 `fieldId` 必须换成新字段 ID，否则策略**静默失效**（永远不成立） |
| 缺引用就丢弃 | 条件引用的字段不在包里（跨表引用）→ 该条件被丢弃；公式引用了包外字段 → 跳过该公式并给出提示。**宁可少一条策略，也不留一条永远不成立的假策略** |

### 37.3 实现要点

- 导出：`ExportTableConfig` 读表 → 字段（`loadFieldIndex` + 排序）→ 视图（去个人段）；
  公式字段另查 `base_field_formulas.expression`。
- 导入三遍走：
  1. **建字段**（不带策略）：一次建完才能拿到完整的 ID 重映射表；
  2. **回填权限策略**：`remapFieldRefs` 把 `permissions.visibleWhen / hiddenWhen`
     条件里的 `fieldId` 换成新 ID；引用不在包内的条件整条丢弃。
  3. **回填公式**：公式引用的是**字段名**（`{预算}`），字段名在新表不变，所以可直接落地。
- 导入**不走** `CreateTable`：`CreateTable` 会自动补一个「名称」主字段，
  那样导入后会多出一个重复字段；`ImportTableConfig` 自己建表，
  并用包里的 `isPrimary` 维护 `primary_field_id`（包里没标就用第一个字段兜底）。
- 返回体带 `warnings`：包外引用被跳过时如实告诉用户，不静默。

### 37.4 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/projects/:projectId/base/tables/:tableId/config-export` | 导出配置包（JSON，带 `Content-Disposition`） |
| POST | `/projects/:projectId/base/tables/config-import` | 导入配置包 → `{ tableId, table, warnings[] }` |

### 37.5 界面

工具栏「数据」组新增「表配置」按钮（`Files` 图标）→ 弹窗分「导出 / 导入」两页：

- 导出：生成配置包 → 展示「字段 N / 视图 N / 公式 N / 条件可见字段 N」摘要 + JSON 预览 → 可下载 JSON 或复制。
- 导入：选文件或直接粘贴 JSON → 校验（非法 JSON / 无字段直接报错）→ 导入为新表 → 自动切到新表，
  有 `warnings` 时逐条列出。

### 37.6 合并导入（导入到已有表）

除「新建为新表」外，再提供一档**合并**语义（`POST …/tables/:tableId/config-merge`）：

| 情况 | 行为 |
| --- | --- |
| 目标表已有同名字段 | **跳过**（保留目标表原有的类型与策略），并在 `warnings` 里逐条说明 |
| 目标表没有的字段 | 新建，并按需回填权限策略与公式 |
| 条件引用了「包里没有、但目标表已有」的字段 | 复用目标表字段 ID，条件照样生效 |
| 目标表已有同名字段且是公式字段 | 保留目标表原公式，不覆盖（`warnings` 提示） |
| 视图重名 | 按名字跳过 |
| 目标表里包没带的字段 | **保留不动**（合并只增不减，绝不删数据） |

### 37.7 连带修掉的既有缺陷：删除字段 500

删除字段时按 `field_id` 去删 `base_formula_dependencies`，
但该表根本没有 `field_id` 列（它是 `formula_field_id` / `dependency_field_id`），
于是任何「删除字段」都会 500（`column field_id does not exist`）。
本轮改为按两个真实列删除，并顺带清掉公式定义本身（`base_field_formulas`），
避免留下指向已删字段的孤儿公式。用例：`internal/base/deletefield_test.go`。

### 37.8 本轮未做

- 配置包没有签名 / 加密（导入方需自行信任来源）。
- 跨空间一键迁移 UI 未做（接口层面已支持任意 `projectId` + `baseId`）。
- 合并模式不做「覆盖已有字段的类型 / 策略」（刻意保守：宁可少同步，也不破坏在用表）。

---

## 38. 第十七轮：工具栏防变形 + 表格表头标题兜底

### 38.1 工具栏变形（换行被裁）

现象：窗口稍窄时工具栏的按钮组换行，而工具栏所在容器高度固定，
换行的那一行被裁掉（只露出半个「新增记录」按钮），看起来像「工具栏变形」。

根因：`.be-toolbar` 用了 `flex-wrap: wrap`，但外层是固定高度的 flex 容器，
多出来的那一行既不显示也不滚动。

修法（`base.css`）：

- `.be-toolbar` 改为 `flex-wrap: nowrap` + `overflow: hidden`，**永远只有一行**；
- 新增 `.be-toolbar__scroll`：承载搜索框与四组按钮，`overflow-x: auto`、
  隐藏滚动条，宽度不够时**横向滚动**而不是换行；
- 「新增记录 / 共 N 条」移到滚动容器**外面**，右侧常驻可见（任何宽度都不会被裁）；
- 搜索框由 220px 收到 200px，减少触发滚动的概率；
- 横向可滚动时给右边缘加一层渐隐（`.is-overflowing` 的 mask），提示「右边还有内容」。

实测（1280 宽）：工具栏高度恒为 51px（单行），`scrollWidth 1340 / clientWidth 826`，
`新增记录` 按钮右边界始终在工具栏内（`addVisible: true`）。

### 38.2 表格不显示标题（空列名）

现象：某些表的表头**只剩一个类型图标、没有标题文字**。

根因：旧版多维表格允许「空列名」，迁移时直接搬到 `base_fields.name`，
于是新表出现**无名字段**；界面只渲染图标，标题为空 → 看起来像「不显示标题」。

四层修法：

| 层 | 改动 |
| --- | --- |
| 迁移（根因） | `legacyFieldName`：空列名补成「列 N」，同表内去重（`internal/base/migrate.go`） |
| 写路径 | `UpdateField` 拒绝空名（`42201 field name is required`），不再允许把名字清空 |
| 存量数据 | `ensureBaseFieldNames` 启动时回填：`name = ''` 的字段按 `sort_order` 补成「字段 N」（`internal/db/db.go`） |
| 渲染兜底 | 表头空名显示「未命名字段」占位（`grid/BaseGrid.vue`），前端重命名空值给明确提示 |

存量回填实测：用户空间「微信表情包」的「数据表」原为
`'' / '' / 计算 / ''`，回填后为 `字段 1 / 字段 2 / 计算 / 字段 3`。

### 38.3 用例

- `internal/base/base_test.go`：`TestLegacyFieldNameFallback`（空名补名 + 去重）；
- `internal/base/deletefield_test.go`：`TestUpdateFieldRejectsEmptyName`（空名被拒）。

### 38.4 「共享 / 仅我」分段控件错位（EP 半边圆角 + 1px 阴影偏移）

现象：工具栏右上角「共享 / 仅我」作用域切换，选中段的蓝色块**左边圆、右边是直角**，
并且整块相对文字**左移 1px**，与未选中段不在同一基线上 —— 即用户反馈的「错位」。

根因（两处叠加，都来自 Element Plus 的分段控件默认样式）：

1. `.el-radio-button:first-child .el-radio-button__inner` / `:last-child` 会被改成
   `border-radius: 10px 0 0 10px` / `0 10px 10px 0`（半边圆角），
   选中首段时右侧变成直角 → 「一头圆一头方」。
2. 激活态用 `box-shadow: -1px 0 0 0 <primary>` 模拟选中边框，导致选中段整体**左移 1px**；
   同时 EP 给每段画一圈 `outline`（本意是拼成连续分段控件），
   在本设计里变成「多一个空心框」。

修法（`pros/web/src/modules/base/base.css` 的 `.be-query-scope` 段）：

- 首/末/普通段的 `border-radius` 一律收成 `--tg-radius-pill`（整颗药丸），`border: none`；
- 清掉 `outline`（每段都是独立药丸，不再需要拼连续框），改用 `:focus-visible` 单独保留键盘聚焦可见性；
- 激活态显式 `box-shadow: none !important`（原因写在注释里），避免 EP 的 -1px 偏移；
- 组内 `gap: 2px`、`align-items: center`、`margin-left: 6px`，两段高度统一 26px。

同类缺陷在全站其它分段控件（知识库左侧「目录/收藏/归档/回收站」「树结构/最近更新」、
顶部「概览/内容/图谱」、弹窗内的「且/或」）同样存在，因此把形态归一提到**全局规范层**：
`pros/web/src/styles/telegram.css` 第 8 节新增

```css
.el-radio-button .el-radio-button__inner,
.el-radio-button:first-child .el-radio-button__inner,
.el-radio-button:last-child .el-radio-button__inner,
.el-radio-button:first-child:last-child .el-radio-button__inner {
  border-radius: var(--tg-radius-pill);
  outline: none;
  box-shadow: none;
}
.el-radio-button.is-active .el-radio-button__original-radio:not(:disabled) + .el-radio-button__inner {
  box-shadow: none;   /* 抵消 EP 的 -1px 偏移 */
}
.el-radio-button .el-radio-button__original-radio:focus-visible + .el-radio-button__inner {
  outline: 2px solid var(--tg-blue);
  outline-offset: 1px;
  border-radius: var(--tg-radius-pill);
}
```

`telegram.css` 在 `main.ts` 中**最后导入**（晚于 `element-plus/dist/index.css`），
同特异性时由它胜出；各页面已有的 `!important` 覆写（`kn-main__tabs`、`kn-tree__views`、
`kn-home`）优先级更高，不受影响。

实测（演示空间「客户管理」表，DSF=3）：

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 段圆角 | `10px 0 0 10px`（半边） | `999px`（整颗药丸，两段一致） |
| 激活态 `box-shadow` | `-1px 0 0 0 rgb(51,144,236)` | `none` |
| 激活段左边界 vs 容器左边界 | −1px（外溢） | `733 - 502 = 231`（与组内左边界一致） |
| 两段 `offsetTop` / 高度 | 不齐 | 均为 `y=161`、`h=26`（同高同基线） |

截图：`/tmp/scope4_共享.png`、`/tmp/scope4_仅我.png`（两种选中态各一张）。


---

## 39. 批次 A：Base 写接口与幂等键

### 39.1 Base 自身写接口（补 §10.2 缺口）

原先 Base 只有读接口（`GET /bases`），改名 / 换图标 / 改描述 / 删除都没有出口。
本批补齐三条写接口，权限沿用 `assertAccess`：

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/projects/:projectId/base/bases` | Editor | 创建独立 Base（不依赖知识库节点） |
| `PATCH` | `/projects/:projectId/base/bases/:baseId` | Editor | 改 `name / description / icon` |
| `DELETE` | `/projects/:projectId/base/bases/:baseId` | Admin | 软删 Base（其下 `base_*` 数据一并软删） |

- 前端入口：`BaseSettingsDialog.vue`（名称 / 图标 / 描述 / 删除确认）。
- 删除前提示：若该 Base 被文档内嵌（`GET /base/embedders/:baseId` 非空），先提示引用方。
- `base_apps` 表本身已有 `name / description / icon` 字段，**无需改表**。

### 39.2 `Idempotency-Key` 幂等键

落实 §10.9「批量创建、导入和重试请求使用 `Idempotency-Key`」。

**表结构**（新表，域前缀只能用 `core_`）：

```
core_idempotency_keys
  id / project_id / user_id / key / endpoint / request_hash
  response_code / response_body / created_at
  UNIQUE (user_id, endpoint, key)   -- uniq_core_idem_user_endpoint_key
```

- 模型：`model.IdempotencyKey` + 显式 `TableName()`；
  `db.Connect` 注册 AutoMigrate，并加 `ensureIdempotencySchema` 补丁建唯一索引
  （只靠 AutoMigrate 建不出唯一约束，必须补迁移）。
- 服务层：`Service.Idempotent(ctx, userID, projectID, endpoint, key, reqBody, status, fn)`
  —— 同键 + 同请求体 → 回放上次响应；同键 + 不同请求体 → `40901`（`ErrIdempotencyConflict`）；
  同键请求仍在执行中 → `40901`（`ErrIdempotencyInFlight`）。
- 接入点：`POST /tables/:tableId/records/batch`、`POST /tables/config-import`。
- 用例：`internal/base/idempotency_test.go`。

**边界**：幂等记录**保留 7 天**后惰性删除（当前无定时清理，条目量小不影响性能，
但生产环境应补一个每日清理任务 —— 见交付风险）。

---

## 40. 批次 B：能力补齐

### 40.1 冻结列（`frozenFields`）

`ViewConfig` 增 `frozenFields?: string[]`，落在 `base_views.config`（JSONB，**不改表**）。
前端 `grid/BaseGrid.vue` 映射到 vxe-table 的 `fixed: 'left'`，`panels/BaseViewSettings.vue`
提供「冻结列」多选（必须是从左起连续的 N 列）。

### 40.2 公式 / 依赖只读 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/tables/:tableId/fields/:fieldId/formula` | 读公式表达式 / AST / 版本，**不改任何状态** |
| `GET` | `/fields/:fieldId/dependencies` | 读公式依赖图（上游 / 下游字段） |

只读语义是刻意的：这两个接口常被外部集成轮询，任何写副作用都会破坏幂等性。

### 40.3 `GET /tables/:tableId/schema` 结构快照

一次返回「表 + 字段 + 视图 + 公式」，供前端做结构同步 / 迁移预览 / 差异比对，
避免为了画一个表结构而发 N 次请求。

### 40.4 错误码补齐与 base 域限流

新增错误码：

| 码 | 含义 | HTTP |
| --- | --- | --- |
| `42202` | 字段类型不兼容 | 422 |
| `42203` | 公式解析错误 | 422 |
| `42901` | 请求过于频繁 | 429 |

base 域限流：令牌桶挂在 `baseGroup` 上，默认 **40 rps / burst 80**
（`BASE_RATE_LIMIT_RPS` / `BASE_RATE_LIMIT_BURST` 可覆盖）。限流键按用户，
不影响其它域。

### 40.5 附件扩展名黑名单

`media/service.go` 增 `ErrExtensionBlocked` 与 `blockedExtensions` 黑名单
（`exe / bat / cmd / sh / ps1 / jar / msi / apk / dmg` 等）。黑名单在**写盘前**判定，
命中直接返回 `400`，不产生残留文件。

### 40.6 版本冲突用例

`expectedVersion` 不匹配 → 严格 `409`（`ErrVersionConflict`）。
配套用例覆盖「并发编辑同一记录」「乐观锁 + 字段级合并」两条路径。

---

## 41. 批次 C：契约、压测、并发、汇总字段

### 41.1 OpenAPI 文档与前端类型自动生成

- `internal/api/openapi.go`：手写 OpenAPI 3.0 描述（**35 条路由 / 49 个 schema**），
  挂 `GET /openapi.json`。
- `docs/openapi/base-openapi.json`：导出的规范快照。
- `web/scripts/gen-api-types.mjs` + `npm run gen:api` → `web/src/modules/base/types.gen.ts`。
  类型来自规范而非手抄，规范改了类型跟着改。

### 41.2 压测工具与报告

新增 `pros/api/cmd/loadtest`（Go 写的压测器，支持 `-seed-rows/-seed-fields` 自动建临时表
播种并清理）。报告见 `docs/acceptance/base-load-test.md`。

实测（300 行 × 21 字段、并发 4、持续 8s）：

| 场景 | 结果 |
| --- | --- |
| 首屏查询 | P95 **6ms** |
| 单条更新 | P95 **10ms** |
| 批量写入 100 条 | P95 **200ms** |
| 6 个压测场景合计 | **0 错误** |

压测暴露并修复了 2 个**真实缺陷**：

1. `spaceRole` 吞掉了 DB 错误 —— 高并发下随机返回 404「base not found」。
   改为 `spaceRoleWithError`，DB 错误上抛 500。
2. GORM 连接池无上限 —— 压测把 Postgres `max_connections` 打满。
   显式配置连接池（`DB_MAX_OPEN_CONNS=30` / `IDLE=10` / `LIFETIME=30min` / `IDLE_MIN=5`）。

### 41.3 并发场景用例

`internal/base/concurrency_test.go`，9 个场景全绿。

**用 Postgres 临时 schema 而非 SQLite**：SQLite 单写者模型会 BUSY / 死锁，
测出来的不是并发而是锁竞争。无 `DATABASE_URL` / `TEST_DATABASE_URL` 时自动 skip。

并发用例又暴露并修复了 3 个缺陷：

1. **字段级合并**：原 `UpdateRecord` 整行乐观锁，导致不同字段并发编辑互相冲突。
   改为事务内 `SELECT ... FOR UPDATE` + 合并重试（无 `expectedVersion` 时最多 3 次）；
   带 `expectedVersion` 仍严格 409。
2. `SaveFormula` 之前**不发事件** → 补 `field.formula.saved` 事件。
3. `recomputeFormulas` 漏算**无依赖公式**（`TODAY()`、`1+1` 永远算不出来）。

### 41.4 `lookup` / `rollup` 字段类型

新增两种字段类型：

- `lookup`：从**关联记录**里取值（`linkField` + 计算规格）。
- `rollup`：对关联记录做聚合（`sum / avg / count / countUnique / min / max`）。

后端 `internal/base/lookup.go`：

| 能力 | 说明 |
| --- | --- |
| `RecalcLookupRollup` | 重算单表的 lookup / rollup |
| `recalcComputedFields` | 重算所有计算字段（含无依赖的） |
| `collectLinkedValues` | 沿 link 字段收集对端值 |
| `aggregateRollup` | 六种聚合口径 |
| `RecalcDependentsOfTable` | 上游表变更时重算下游表 |
| `scheduleDependentRecalc` | 异步触发下游重算 |
| `ListComputedFields` | 列出表的计算字段摘要 |

路由：

```
GET  /projects/:projectId/base/tables/:tableId/computed-fields
POST /projects/:projectId/base/tables/:tableId/lookup-rollup/recalc
```

前端：`BaseFieldManager.vue` 增「引用 / 汇总配置」区块 + 配置弹窗 + 「重算」按钮。

---

## 42. 批次 D：分页、时间函数、新视图、签名、跨空间迁移

### 42.1 keyset 游标分页（替代 offset）

游标格式 `k:<sort_order>:<id>`（旧格式 `o:<n>` 仍兼容）。条件：
「默认排序 + 无自定义排序 + 无分组」时启用 `WHERE (sort_order, id) > 锚点`，
多取 1 条判断 `hasMore`。默认 `ORDER BY` 本来就以 `r.sort_order ASC, r.id ASC` 收尾，
与锚点顺序一致。

**实现中修掉的一个关键缺陷**：原判定是 `useKeyset := cur.keyset && 无自定义排序/分组`，
即「收到的游标本身是 keyset 才走 keyset」。但**首页本来就没有游标**，
于是首页永远只能吐出旧格式的 `o:<n>` 游标，客户端下一页拿到的仍是 offset 游标 ——
keyset 分支形同虚设，深翻页依旧全表扫描。

改成 `useKeyset := 无自定义排序/分组 && (cur.keyset || cur.offset == 0)`：
首页也进入 keyset 模式（此时不加锚点 WHERE，直接取前 N 条），
并直接返回 `k:` 游标，后续页自然接上。

用例：`internal/base/keyset_test.go`（5 例全绿，含
`TestFirstPageReturnsKeysetCursor` 回归用例）。

实测（演示空间「客户管理」表，3 条记录，pageSize=1）：

```
第1页: ["南山数科"]     hasMore=true  offset=-1
第2页: ["华东智造集团"] hasMore=true  offset=-1
第3页: ["锦程物流"]     hasMore=false offset=-1
```

无重复、无漏行，游标 `azoxOjpi…`（base64 编码的 `k:<sort_order>:<id>`）。

**限制**：自定义排序 / 分组场景仍走 offset 分页 —— keyset 需要唯一且有序的锚点，
多列排序 + 分组的锚点语义复杂，本批不做。

### 42.2 `TODAY()` 等时间函数重算策略

新增 `internal/base/timeformula.go`：

| 能力 | 说明 |
| --- | --- |
| `TODAY/NOW` 识别 | 解析出公式里引用了哪些时间函数 |
| `RecalcTimeSensitiveTables` | 重算所有含时间函数的表 |
| `EnsureTableTimeRecalc` | 查询时**惰性补算**（今天还没算过就当场算） |
| `StartDailyTimeRecalc` | 每日 00:05 全量重算 + 启动时补算一次 |

查询路径已接入惰性补算，所以「跨天打开表格 `TODAY()` 自动更新」这条验收是成立的。
用例：`internal/base/timeformula_test.go`（3 例全绿）。

### 42.3 表单视图 / 甘特视图

新增 `views/BaseFormView.vue`（一次填一条记录）、`views/BaseGanttView.vue`
（按开始 / 结束日期排布 + 依赖线）。后端 `ValidViewTypes` 白名单增 `form` / `gantt`，
非法类型返回 `40001`（`ErrQueryInvalid`）。

甘特视图实现中修掉一个**真实布局缺陷**：

- 原 `timelineEnd` 只看「结束日期」字段。全部记录都没填结束日期时，
  时间轴被压成最短跨度，而条形按开始日期排到了画布之外（表现为**条形消失**）。
  改为开始 / 结束两个字段一起参与终点计算。
- 时间轴最小跨度 14 天（否则无日期时塌成 28px 宽的一条缝，看起来像没渲染）。
- 未填开始日期的记录标「未排期」，不画条形（避免伪装成排在第 0 天）。
- 日标签只显示日号，跨月时补「2026年11月」月份标尺。

实测（演示空间「客户管理」表）：`.be-gantt` 宽 `1020px` / 高 `763px`，
`.be-gantt__main` `scrollWidth=2254` / `clientWidth=818`（可横向滚动），
条形 `left` 全部落在时间轴范围内。

### 42.4 配置包签名（§37.8 遗留）

配置包导出后可能被篡改，导入时需要能识别「是不是本平台导出的、有没有被改过」。

- 算法：`HMAC-SHA256`，密钥由 `JWT_SECRET` 派生
  （`sha256("metamatrix/config-bundle/v1" + "\0" + secret)`），**不新增配置项**。
- 导出：`ExportTableConfig` 末尾调 `SignBundle`，写入 `signature` / `signatureAlgorithm`。
- 导入 / 合并：`ImportTableConfig` / `MergeTableConfig` 开头调 `VerifyBundle`，
  不匹配 → `ErrBundleSignatureInvalid` → HTTP `400` / 码 `40002`。
- **无签名的包仍然放行**（兼容外部 / 历史导出的包）。
- 服务端没配签名密钥时放行（此时无法校验）。

用例：`internal/base/configbundle_sign_test.go`（4 例：往返 / 篡改被拒 / 无签名放行 / 换密钥被拒）。

**注意**：HMAC 只保证「完整 + 来自持有密钥的一方」，**不是加密** —— 包体仍是明文。
需要保密时仍应走加密传输。

实测（HTTP）：

```
导出            200  signatureAlgorithm=HMAC-SHA256
原样导入        201  新建表成功，warnings=0
篡改表名后导入  400  {"code":"40002","message":"config bundle signature invalid"}
去掉签名后导入  201  （兼容放行）
```

### 42.5 跨空间一键迁移 UI（§37.8 遗留）

`panels/BaseTableConfigDialog.vue` 的导入页增「导入到」区：
**目标空间 → 目标 Base → 目标表**三级选择。目标空间来自 `GET /projects`，
目标 Base 来自 `GET /projects/:id/base/bases`，目标表来自 `GET /projects/:id/base/tables/:baseId/tables`。

后端 `POST /tables/config-import` 本就接受任意 `projectId + baseId`，因此前端只是把
参数开放出来，**后端零改动**。

实测：弹窗宽 `720px` / 高 `622px`，目标区渲染出 2 个下拉（空间 / Base），
无 console 错误。

### 42.6 视图类型创建对话框补齐 `calendar` / `gallery`（盘点修订）

盘点实测发现：后端 `ValidViewTypes` 已支持 6 种视图（`grid` / `kanban` / `calendar` /
`gallery` / `form` / `gantt`），但前端「新建视图」对话框的 `TYPE_OPTIONS` 只列了 4 种，
`calendar` / `gallery` **无法从界面创建**（只能靠接口建）。

- 修订：`panels/BaseViewCreateDialog.vue` 的 `TYPE_OPTIONS` 补齐 6 种，
  并为 `calendar` / `gallery` 补 `hint` 说明文案，与后端枚举严格对齐。
- 实测：对话框渲染 6 个选项；创建「日历视图」「画廊视图」均返回 `201`，
  画廊卡片正常渲染关联合同标签（截图 `/tmp/basev/probe_画廊视图.png`）。
- 收尾：实测过程产生的「测试日历视图」「测试画廊视图」已删除，不留测试数据。

## 43. 批次 E：公式函数库、系统字段、Excel 导出（盘点后立即落地）

> 本批针对 2026-11-27 盘点出的三个 P0 缺口：
> **公式函数只有 14 个**、**缺系统字段类型**、**导出没有 XLSX**。

### 43.1 公式函数库：14 → 44

第一批只给了 `SUM / AVERAGE / COUNT / MIN / MAX / CONCATENATE / ROUND / ABS /
IF / AND / OR / NOT / DATE / TODAY`，业务里最常用的文本处理、时间提取、容错函数全缺。

新增 **30 个**（`internal/base/formula_ext.go`）：

| 组 | 函数 |
|----|------|
| 时间 | `NOW` `YEAR` `MONTH` `DAY` `HOUR` `MINUTE` `SECOND` `WEEKDAY` |
| 文本 | `UPPER` `LOWER` `PROPER` `TRIM` `LEN` `LEFT` `RIGHT` `MID` `FIND` `SUBSTITUTE` `CONCAT` |
| 数值 | `FLOOR` `CEILING` `POWER` `MOD` `SQRT` |
| 容错 | `COALESCE` `IFERROR` `ISBLANK` `ISNUMBER` `ISTEXT` |
| 分支 | `SWITCH` |

配套改造：

- **求值器签名改为 `compute(ctx EvalContext, args []any)`**：
  时间类函数统一走 `formulaNow(ctx)`，测试可注入固定时间（`TODAY()` / `NOW()` 不再各自 `time.Now()`）。
- **`IFERROR` 真正吞错**：普通函数在求值期出错会直接中断，
  现在求值器在 `IFERROR` 的第一个参数上捕获错误并改用兜底值。
- **`SUBSTITUTE` / `FIND` 采用 Excel 参数序**：`SUBSTITUTE(文本, 旧, 新)`、`FIND(查找, 文本)`。

前端同步：新增 `fields/formulaFunctions.ts`（44 个函数的目录 + 签名 + 说明），
公式编辑弹窗加「函数库」面板（分组标题 + 等宽字体胶囊 + tooltip 说明，点击即插入）。

### 43.2 系统字段：创建时间 / 更新时间 / 创建人 / 更新人

新增 4 个**只读计算字段类型**（`internal/base/systemfield.go`）：

| 类型 | 含义 | 落库值 | 投影类型 |
|------|------|--------|----------|
| `created_at` | 记录创建时间 | `2006-01-02 15:04:05` | date |
| `updated_at` | 记录最后更新时间 | 同上 | date |
| `created_by` | 记录创建人 | 用户 UUID | text |
| `updated_by` | 记录最后更新人 | 用户 UUID | text |

设计要点：

- **落库而不是查询时现算**：值进 `base_record_values` 投影，
  **筛选 / 排序 / 分组全部可用**（查询时现算只能显示，排序就露馅）。
- **标记 `Computed=true`**：复用计算字段既有约定 —— `normalizeValues` 直接跳过客户端传入值，
  用户伪造不了「我是别人创建的」。
- **写入时机**：新建 / 更新 / 全表重算三条写路径都调用 `applySystemFields`；
  系统字段**先于公式落库**，因此公式可以直接引用 `{创建时间}`（实测 `YEAR({创建时间})` = 2026）。
- **类型迁移受限**：系统字段不能迁成普通字段，普通字段也不能迁成系统字段
  （否则存量值与自动维护值互相打架）。
- **顺带修掉一个既有缺陷**：`recalcTableFormulas` / 删字段 / 类型迁移三处原本用
  GORM `Updates` 写 `data`，会**自动刷新 `updated_at`**，
  导致「系统重算」把「最后更新时间」刷成重算时刻。
  改为 `UpdateColumns`（跳过钩子与自动时间戳）后，
  「更新时间」才真的是「最后一次被人编辑的时间」。

前端同步：`types.ts` 增 4 个类型、`fields/registry.ts` 增 4 个插件、
`fields/icons.ts` 增 4 个图标；`isComputedField()` 统一判定计算字段，
网格 / 详情抽屉 / 看板三处都改为「计算字段不可就地编辑」。

**未实现**：`user_group`（用户分组）—— 通讯录目前没有分组体系，
等 `directory` 侧补上分组后再补，否则只能做成没有数据源的空字段。

### 43.3 导出：补 XLSX（零依赖）

新增 `src/modules/base/export/xlsx.ts`：自研极简 XLSX 生成器。

- **不用 SheetJS / ExcelJS 的理由**：`xlsx` 社区版已从 npm 主仓下架（0.18.5 有已知漏洞），
  ExcelJS 体积大、依赖多；为一次导出引入一整套依赖不划算。
- **实现**：ZIP 用 **STORE（不压缩）** 模式（自研 CRC32 + 中央目录），
  内容是标准 SpreadsheetML：`[Content_Types].xml` / `_rels/.rels` / `xl/workbook.xml` /
  `xl/_rels/workbook.xml.rels` / `xl/styles.xml` / `xl/worksheets/sheetN.xml`。
- **能力**：表头加粗 + 浅灰底、冻结首行、列宽、数值 / 布尔 / 内联字符串三种单元格类型、
  XML 特殊字符转义、控制字符剔除、工作表名清洗（去非法字符 + 截断 31 字符）。
- **兼容性**：Excel / WPS / LibreOffice / Numbers 均可打开。
- **实测**：浏览器真实下载 `客户管理.xlsx`（8791 字节），
  `zipfile` 校验 CRC 全通过、`sheet1.xml` 与 `workbook.xml` XML 格式良好。

导出弹窗新增「Excel（XLSX）」分段项，预览区提示 `3 行 × 17 列（含表头）`。

---

## 44. 批次 F：飞书多维表格（Bitable）视觉规范层

> 目标：多维表格界面的**取色、密度、控件形态**严格对齐飞书 Bitable，
> 而不动全局 Telegram 规范（`src/styles/telegram.css`）——表格类界面与聊天类界面
> 的密度与主色本来就不同，用**模块内覆盖层**隔离，避免污染其它 90+ 页面。

### 44.1 新增 `src/modules/base/feishu.css`（模块内主题层）

唯一实现入口，`BaseEngineView.vue` 中在 `base.css` **之后**导入。
令牌统一 `--fs-*` 前缀（与全局 `--tg-*` 隔离），定义在 `:root`
（弹窗 / 抽屉被 teleport 到 `body`，拿不到 `.be-shell` 上的变量）。

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--fs-blue` | `#3370FF` | 主色（按钮、选中、链接） |
| `--fs-blue-hover` / `--fs-blue-active` | `#245BDB` / `#1F5FCC` | 主色悬停 / 按下 |
| `--fs-blue-soft` | `#EEF3FF` | 选中底、标签底 |
| `--fs-text-1 / 2 / 3` | `#1F2329` / `#646A73` / `#8F959E` | 主 / 次 / 弱文字 |
| `--fs-border` / `--fs-border-light` | `#DEE0E3` / `#EFF0F1` | 竖线外框 / 行分隔 |
| `--fs-bg-page / --fs-bg-header / --fs-bg-hover` | `#F5F6F7` / `#F7F8FA` / `#F2F3F5` | 页面底 / 表头底 / 悬停 |
| `--fs-radius` / `--fs-radius-lg` | `6px` / `8px` | 控件 / 卡片弹窗 |
| `--fs-shadow-1` / `--fs-shadow-2` | 轻投影 / 弹窗投影 | 卡片 / 弹窗 |
| `--fs-row-h` | `40px` | 行高 |

### 44.2 各区域的飞书化改造

- **顶部标题条**：52px 白底 + `1px #DEE0E3` 下边线，标题 16px/600。
- **工具栏**：48px 白底；按钮**取消 Telegram 药丸容器**，改为飞书式
  「图标 + 文字 / 无边框 / hover 才出 `#F2F3F5` 灰底 / 6px 圆角 / 30px 高」；
  已生效条件（筛选 / 排序）为浅蓝底 + 蓝字；「新增记录」实心 `#3370FF`。
- **视图标签**：选中态改为「加粗 + 底部 2px `#3370FF` 下划线」（不是药丸块）。
- **表格主体**：白卡 + `#DEE0E3` 描边 + 8px 圆角；
  表头 `#F7F8FA` 灰底 + 13px/500 + 行高 40px；
  单元格 `padding 0 12px`；行分隔 `#EFF0F1`、竖线 `#DEE0E3`；
  hover 行 `#F7F8FA`；选中格 `#3370FF` 描边；复选框列宽 48px。
- **行高恒定 40px**：vxe-table 自带 `padding:6px` + `min-height:40px` 会把行撑到 45px，
  覆盖为 `height/min-height: 40px !important` + `padding: 0 12px !important`；
  「关联记录」多值 chip 改单行不换行（否则行高被撑到 45px）。
- **数值列右对齐**：`number` / `currency` / `percent` / `rating` 列右对齐（飞书同款）。
- **选项标签**：单选 / 多选改为飞书柔和标签（8 色调色板，按选项文本散列定色，
  同一选项永远同色 + 同色圆点）；日期次要色 `#646A73`；
  `user` / `created_by` / `updated_by` 显示**姓名**而非 UUID
  （新增 `fields/userNames.ts` 通讯录解析，幂等缓存、失败静默回退 ID）。
- **看板 / 日历 / 画廊**（`views/BaseBoardViews.vue`）：分组列去底色靠留白分隔，
  计数改灰底徽标（20px / 4px 圆角），卡片白底 + 1px `#DEE0E3` + 6px 圆角、
  悬停边框转 `#3370FF`，标题 14px/600，标签 12px `#8F959E`；
  日历事件 chip 改浅蓝底 `#EEF3FF` + 蓝字 + 4px 圆角。
- **弹窗 / 抽屉**：Element Plus 的 `modal-class` 落在**全屏 `.el-overlay`** 上，
  圆角投影必须作用在子面板 `.el-dialog` / `.el-drawer` 上，否则被遮罩吃掉——
  这是一处易踩的坑。改造后：弹窗 8px 圆角、白底、`0 8px 24px rgba(31,35,41,.12)`、
  标题 16px/600、头尾 `#EFF0F1` 分隔线、底部按钮右对齐 6px 圆角主色 `#3370FF`；
  抽屉左描边 `#DEE0E3` + 右侧轻投影。

### 44.3 坑位记录（写代码必读）

1. **`modal-class` 不是面板**：落在 `.el-overlay`（全屏），圆角/投影要写 `.be-modal .el-dialog`。
2. **`:global()` 在普通 CSS 里无效**：`feishu.css` 是普通全局样式，
   早期误写 `:global(.x)` 会被浏览器整条忽略，必须写裸类名。
3. **`base.css` 用了 `.el-button.el-button:not(...)` 高特异性写法**（0,6,0），
   普通的 `.be-btngroup .el-button`（0,2,0）压不过，
   覆盖按钮圆角/高度必须复刻同样的 `:not()` 选择器。
4. **scoped 样式的特异性更高**（`[data-v-xxx]` 叠加），
   组件内样式直接改成飞书取值，比在全局层覆盖更稳。

### 44.4 实测（DOM 数值）

| 指标 | 值 |
| --- | --- |
| 表格行高 | 全部 `40px`（改造前 57 → 45 → 40） |
| 表头底色 | `rgb(247, 248, 250)` |
| 单元格 padding | `0px 12px` |
| 视图选中下划线 | `height 2px` / `rgb(51, 112, 255)` |
| 工具栏按钮 | 高 `30px`、圆角 `6px`、文字 `rgb(100, 106, 115)`、背景透明 |
| 弹窗 | 圆角 `8px`、投影 `rgba(31,35,41,.12) 0 8px 24px`、白底、宽 620/720px |
| 抽屉 | 宽 `440px`、左边框 `rgb(222, 224, 227)` |
| 选项标签 | 高 `20px`、圆角 `4px`、8 色柔和底 |
| 控制台错误 | `0` |

截图：`/tmp/basev/g1_table.png`（表格）、`g2_drawer.png`（记录详情抽屉）、
`g3_viewsettings.png`（视图配置弹窗）、`h_看板.png`（看板视图）。
