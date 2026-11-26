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

| 类型 | 标识 | 可编辑 | 可筛选 | 可排序 | 可分组 | 说明 |
|---|---|---|---|---|---|---|
| 文本 | `text` | ✓ | ✓ | ✓ | ✓ | 单行 |
| 长文本 | `long_text` | ✓ | ✓ | ✓ | ✓ | 多行 |
| 数字 | `number` | ✓ | ✓ | ✓ | ✓ | 数值 |
| 金额 | `currency` | ✓ | ✓ | ✓ | ✓ | 金额 |
| 百分比 | `percent` | ✓ | ✓ | ✓ | ✓ | 百分比 |
| 评分 | `rating` | ✓ | ✓ | ✓ | ✓ | 0–5 |
| 日期 | `date` | ✓ | ✓ | ✓ | ✓ | `YYYY-MM-DD` |
| 日期时间 | `datetime` | ✓ | ✓ | ✓ | ✓ | `YYYY-MM-DD HH:mm:ss` |
| 复选框 | `checkbox` | ✓ | ✓ | ✓ | ✓ | 是 / 否 |
| 单选 | `single_select` | ✓ | ✓ | ✓ | ✓ | 候选项 |
| 多选 | `multi_select` | ✓ | ✓ | ✓ | ✓ | 多值 |
| 邮箱 | `email` | ✓ | ✓ | ✓ | ✓ | 格式校验 |
| 电话 | `phone` | ✓ | ✓ | ✓ | ✓ | — |
| 链接 | `url` | ✓ | ✓ | ✓ | ✓ | URL |
| 人员 | `user` | ✓ | ✓ | ✓ | ✓ | 空间成员 |
| 附件 | `attachment` | ✓ | ✓ | ✓ | ✓ | 素材库文件 |
| 公式 | `formula` | ✗（服务端算） | ✓ | ✓ | ✓ | AST 求值 |
| 关联记录 | `link` | ✓ | ✓ | ✗ | ✗ | 关联其它表的记录 |
| 关联文档 | `doc` | ✓ | ✓ | ✗ | ✗ | 关联知识库文档 |

---

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
