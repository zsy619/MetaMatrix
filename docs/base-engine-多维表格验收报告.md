# 多维表格 Base Engine · 重构验收报告

> 对应方案：[base-engine-多维表格技术方案.md](./base-engine-多维表格技术方案.md)
> 验收环境：本地开发环境（前端 `http://localhost:5173`，后端 `http://localhost:3000`，PostgreSQL `localhost:5433`）
> 验收日期：2026-11-26（第四轮增强后复核）

## 一、结论

多维表格已从「整块 JSONB + 前端自行筛选排序」重构为 **Base Engine**：
PostgreSQL 类型化投影承载数据，服务端统一执行筛选 / 排序 / 分组 / 公式，知识库入口直接渲染 Base 视图，
旧表首次打开自动迁移且数据零丢失。方案中的富文本融合已落地一条可演示路径（Base → Markdown 表格 → 文档）。

## 二、交付清单

### 后端

- `pros/api/internal/model/base.go`：12 张 `base_*` 表模型（表结构唯一事实来源）。
- `pros/api/internal/base/registry.go`：19 种字段类型注册表与能力矩阵。
- `pros/api/internal/base/query.go`：Filter AST → SQL 的统一查询层（投影表 EXISTS + 排序/分组 + 游标）。
- `pros/api/internal/base/formula.go`：公式 Lexer/Parser/AST/Evaluator、18 函数白名单、环检测。
- `pros/api/internal/base/service.go`：表/字段/记录/视图/公式服务，权限、乐观锁、审计、Outbox、公式回填。
- `pros/api/internal/base/events.go`：EventHub + SSE + Outbox 发布器。
- `pros/api/internal/base/handler.go`：HTTP 层与 SSE 端点。
- `pros/api/internal/base/migrate.go`：遗留 sheet JSON 幂等迁移。
- 路由：`/projects/:projectId/base/**`（`cmd/server/main.go`）。

### 前端

- `pros/web/src/modules/base/`：`BaseEngineView.vue`（编排）、`grid/`（VXE 网格）、`fields/`（字段渲染与编辑）、
  `views/`（看板/日历/画廊）、`panels/`（字段管理/筛选排序/公式/详情/导入/批量/视图配置）、
  `api.ts`、`types.ts`、`realtime.ts`（SSE）、`csv.ts`、`base.css`。
- 入口：`src/views/KnowledgeView.vue` 的 `nodeType === 'sheet'` 分支改为 `BaseEngineView`；
  旧 `SheetEditor.vue` 已下线，`SheetPreview.vue`（分享只读预览）保留。

### 文档

- 本报告；方案文档同步补充第 17–25 章（导入导出、批量与视图配置、关联文档字段、降级容错、字段类型清单、看板拖拽、键盘导航与剪贴板、附件字段、文档内嵌 Base 视图块与反向引用）。

### 第三轮增强（本次）

- `views/BaseBoardViews.vue`：看板拖拽换组（候选项预置为空列、拖拽高亮、单选覆盖 / 多选追加）。
- `grid/BaseGrid.vue`：键盘导航（方向键 / Enter / F2 / Esc / Delete）、复制粘贴（TSV 多单元格）、聚焦描边、单元格双击进编辑。
- `fields/BaseFieldCell.vue`：附件字段真实上传（素材库封装 + 分片）、缩略图 / 文件名胶囊、单个移除、数量上限校验、`url#文件名` 值格式。
- `BaseEngineView.vue`：同记录写入串行化（批量粘贴不再触发版本号打架）。

### 第六轮增强（本次）

- 后端 `internal/base/service.go`：`ListRecordDocReferences`（记录 → 引用它的文档）、
  `UpdateField` 触发 `reindexTable`。
- 后端 `internal/base/query.go`：关键字搜索新增 `value_json::text` 分支（附件文件名可搜）。
- 后端 `internal/base/registry.go`：`attachment` 改为 `Indexable: true`。
- 后端路由：`GET /projects/:projectId/base/records/:recordId/doc-references`。
- 前端 `modules/base/panels/BaseRecordDrawer.vue`：记录详情新增「引用本记录的文档」区块。
- 前端 `modules/base/grid/BaseGrid.vue`：左侧固定「详情」列（记录详情入口）。
- 前端 `modules/base/panels/BaseBatchDialog.vue` / `BaseImportDialog.vue`：失败项一键重试。

### 第五轮增强

- 后端 `internal/base/query.go`：`resolveDocTitleFilters`（doc 字段条件值支持标题）、`docConditionSQL`（多值 OR 匹配）。
- 后端 `internal/base/service.go`：`BatchCreatePartial` / `BatchUpdatePartial` / `BatchDeletePartial` 与 `ListBaseEmbedders`。
- 后端 `internal/base/handler.go`：批量接口支持 `partial`；新增 `GET /embedders/:baseId`。
- 前端 `panels/BaseQueryPanel.vue`（doc 字段按标题多选）、`panels/BaseBatchDialog.vue` 与 `panels/BaseImportDialog.vue`（失败明细）、
  `BaseEngineView.vue`（内嵌引用入口）、`views/BaseBoardViews.vue`（日历拖拽改期 + 画廊卡片字段）、`panels/BaseViewSettings.vue`（画廊字段配置）。

### 第四轮增强（本次）

- 后端 `internal/base/service.go`：新增 `ListDocBackrefs`（文档 → 引用它的 Base 记录）与 `reindexTable`（按字段能力重建整表投影）。
- 后端 `internal/base/registry.go`：`long_text` / `link` / `doc` 由 `Indexable=false` 改为 `true`（原先这三种字段筛不出结果）。
- 后端路由：`GET /projects/:projectId/base/doc-backrefs/:nodeId`。
- 前端 `extensions/baseEmbed.ts` + `components/rte/baseEmbed/BaseEmbedView.vue`：文档内嵌 Base 视图块（只读、实时取数）。
- 前端 `components/rte/composables/useKnowledgeDocs.ts` + `extensions/mentionSuggestion.ts`：`@` 提及里的多维表格候选 → 插入内嵌块。
- 前端 `components/knowledge/DocBackrefs.vue` + `DocView.vue` + `views/KnowledgeView.vue`：文档反向引用页签与跳转。

## 三、验收项与证据

### 3.1 遗留数据迁移

- 旧表「客户管理」（6 字段 / 3 行 / 1 视图）打开后自动迁移；
  `base_apps.migrated = legacy_sheet:<nodeId>`，重复打开不重复迁移（幂等）。
- 旧字段类型映射：文本 / 长文本 / 数字 / 日期 / 单选 / 多选 / 人员 → 新注册表类型；
  旧视图的 filters/sorts/groups 映射到 `base_views.config`（filters 统一为 FilterGroup）。
- 旧列宽已改挂到新 field_id（早期版本挂在旧 ID 上，等于没生效，本轮修正）。
- 证据：`base_apps` / `base_tables` / `base_views` 实际行；浏览器截图 `/tmp/base_final_grid.png`。

### 3.2 公式引擎

- UI 新建公式字段「税额」→ 校验返回「公式合法，依赖字段：预算」→ 预览样例值 26000 → 保存。
- 保存后**立即回填历史记录**：税额 12000 / 0 / 26000（分别对应预算 120000 / 58000 / 260000）。
- 服务端接口：`POST /tables/:tableId/formulas/validate|preview`、`PUT /fields/:fieldId/formula`。

### 3.3 查询引擎

- 筛选「预算 ≥ 100000」→ 行数 3 → 1，工具栏计数同步为「共 1 条」。
- 排序、分组、游标分页均在服务端执行；前端不做数据运算。

### 3.4 实时与并发

- SSE 连接常驻，右上角状态指示「实时同步中」；断开自动重连并显示「离线 / 连接中」。
- 单元格写入带 `expectedVersion`，服务端版本不一致返回 409，界面给「重新载入 / 保留我的输入」二选一。

### 3.5 导入导出

- CSV 解析支持双引号、字段内逗号与换行、CRLF、BOM、TXT 制表符自动识别；
  实测导入 `"新客户,甲"` 与 `含,逗号的备注` 均未错列。
- 列映射可逐列调整，未映射列忽略；导入走批量接口，整批成功或整批失败。
- 导出 Markdown 表格 / CSV；Markdown 可一键复制并粘贴进知识库文档。

### 3.6 批量与视图配置

- 勾选记录后浮出批量操作条：批量改值、批量删除（整批事务）。
- 视图配置（字段显隐、列宽、筛选、排序、分组）持久化在 `base_views.config`，切换视图自动生效。

### 3.7 关联文档字段

- 新增字段类型 `doc`：单元格显示文档标题，点击跳转到对应知识库文档/画布。
- 跨空间引用被拒绝：写入不存在的节点返回 `42201 field value invalid: 关联文档 关联的文档不在当前空间`。

### 3.8 看板拖拽换组

- 看板列 = 分组字段候选项全集，空列同样保留：初步接洽(0) / 需求确认(云图数据) / 方案报价(星海科技) / 已签约(海拓智能)。
- 拖拽「星海科技」卡片到「需求确认」列 → 卡片落到新列，「方案报价」列清空；服务端 `阶段` 字段同步改为「需求确认」。
- 拖拽中的卡片 `is-dragging`（半透明 + 微旋转），目标列 `is-drag-over`（品牌蓝虚线框）。
- 验收后已把记录回滚为「方案报价」。

### 3.9 键盘导航与剪贴板

- 单击「云图数据」单元格 → 聚焦描边出现；`↓` 焦点移到「海拓智能」（DOM：`.base-cell.is-focused` 文本由「云图数据」变为「海拓智能」）；`↑` 可回退。
- `Enter` / `F2` 让聚焦单元格进入编辑态（聚焦格内出现 2 个编辑控件）。
- 粘贴验证：在「预算」列粘贴 `888888\t2027-01-15` → 同行的「预算」「签约日期」两格同时写入（服务端查询确认 888888 / 2027-01-15）。
- 粘贴后已回滚原值（58000 / 2026-12-05）。
- 行列映射抽成 `modules/base/clipboard.ts` 并补单测（4 个用例：值转文本、多列映射、空值→null、公式跳过、越界忽略）。

### 3.10 附件字段

- 双击附件单元格进入编辑 → 上传 `sample.png` → 单元格显示文件名胶囊，值落库为 `/media/<uuid>#sample.png`。
- 同一素材重复上传走素材库秒传（按 sha256 去重）。
- 附件条数上限由字段 `config.maxCount` 控制（超限提示「最多上传 N 个附件」）。

### 3.11 空表兜底（404 修复）

- 复现：新建多维表格节点后直接点「字段」→ 旧版发出 `POST /projects/:pid/base/tables//fields` → 404。
- 修复后：新建节点打开即带默认「数据表 / 名称 / 表格视图」；点「字段 → 添加字段」成功，
  浏览器抓包 **0 个 4xx**（`/tmp/basev/empty_base.png`、`/tmp/basev/empty_base_field.png`）。
- 测试节点「空表测试」及其 base / table / field / view 数据已清理。

### 3.12 工具栏按钮分组

- 工具栏由「一排散按钮」重构为三个按钮组：查询（筛选/排序/重置）、结构（字段/公式/视图配置）、数据（导出/导入）。
- DOM 证据：组容器 `background rgb(244,244,245)`、`border-radius 999px`、`padding 3px`、高 34px；
  组内按钮 `background rgba(0,0,0,0)`、`border 0px none`、高 28px、宽 64px（视图配置 88px）。
- 悬停「字段」：`background rgb(255,255,255)`、`box-shadow rgba(15,23,42,.06) 0 1px 2px`、`translateY(-1px)`。
- 截图：`/tmp/base_btngroup.png`、`/tmp/base_btngroup_hover.png`。

### 3.13 文档内嵌 Base 视图块（C2-15）

- 在文档正文里 `@客户管理` → 提及菜单出现「📊 客户管理」→ 回车插入一块内嵌表格视图。
- 块内实时取数：表头「客户名称 / 税额 / 关联文档 / 附件 / 阶段 / 对接人 / 预算 / 签约日期 / 跟进事项」（9 列），
  3 行记录，底部「共 3 条 · 数据实时同步」。
- DOM 证据：块宽 698px / 高 436px，内部表格宽 696px；首行「星海科技 / 12000 / 关联示例文档·Base 内嵌演示文档 / sample.png / 方案报价 / 李经理 / 120000 / 2026-11-20 / 等待合同评审」。
- 持久化：自动保存后整页刷新，块仍在（HTML 含 `data-type="baseEmbed"`），且重新取数渲染 3 行。
- 「关联文档」单元格显示的是文档标题而非裸 ID（`docTitles` 映射生效）。
- 截图：`/tmp/basev/v_embed.png`、`/tmp/basev/v_embed_persist.png`。

### 3.14 文档反向引用（C2-16）

- 接口：`GET /projects/:projectId/base/doc-backrefs/:nodeId` 返回引用该文档的表 / 记录 / 字段。
- 文档「反向引用」页签显示「多维表格引用（1）→ 客户管理 · 星海科技 · 关联文档」。
- 点击引用项跳到对应多维表格节点（表格页正常渲染 3 条记录）。
- 截图：`/tmp/basev/v_backref.png`。

### 3.15 字段能力与投影一致性修复

- `long_text` / `link` / `doc` 原先 `Filterable=true` 但 `Indexable=false`，投影被跳过 → 这三种字段筛不出结果。
- 修复为 `Indexable=true`，并新增 `reindexTable` 在建字段 / 迁字段后补齐存量投影。
- 实测：`doc` 字段 `contains` 筛选命中 1 条（修复前 0 条）。

### 3.16 关键字搜索与「关联文档」按标题检索

- 修复：关键字搜索在统计分支里用了失效的表别名（`base_records.id`，而 FROM 已是 `base_records AS r`），
  只要带关键字就 500 —— 现已统一为 `r.id`。
- 新能力：关键字除命中投影文本外，还会把**当前空间目录树里标题命中关键字的节点**取出来，
  再回表匹配「关联文档」字段的投影值，因此可以按**文档标题**搜到记录。
- 实测（表「客户管理」）：`星海` → 1 条（星海科技）；`关联示例` → 1 条（命中的是关联文档的标题，不是 ID）；
  `云图` → 1 条（云图数据）；`不存在关键字` → 0 条。
- 单测：`internal/base/base_test.go` 新增 `TestBuildKeywordConditionAddsDocTitleBranch` /
  `TestBuildKeywordConditionWithoutDocFields`。

### 3.17 「关联文档」按标题筛选

- 服务端：条件值写标题（`关联示例`）→ 反查节点 ID → 命中 1 条（星海科技）；
  条件值写 ID 数组 → 命中 1 条；写不存在的标题 → 0 条。
- 前端：筛选面板里 `doc` 字段的值控件是可搜索多选下拉，选项显示文档标题（截图 `/tmp/basev/v_filter_doc.png`）。
- 实现：后端 `resolveDocTitleFilters` + `docConditionSQL`，前端 `BaseQueryPanel`（`docOptions`）。

### 3.18 批量操作「部分成功 + 失败明细」

- 接口 `POST /tables/:tableId/records/batch` 支持 `partial: true`，返回 `{rows, failures, succeeded, failed}`。
- 实测 A：2 条记录批量改为非法 `doc` 值 → `succeeded 0 / failed 2`，
  明细为「关联文档 关联的文档 ID 非法」×2。
- 实测 B：批量改「阶段」（单选）为不存在的选项 + 一条不存在的记录 ID → 失败原因分别是
  `阶段：unknown option: …` 与 `record not found`。
- 前端：`BaseBatchDialog` / `BaseImportDialog` 改为部分成功模式，弹窗内直接列出失败明细。

### 3.19 表格 → 文档反向索引（内嵌引用）

- 接口 `GET /projects/:projectId/base/embedders/:baseId` → 返回
  `{nodeId, documentId, title, tableId}`。
- 前端工具栏「数据」组新增「内嵌 1」按钮，弹窗列出「Base 内嵌演示文档 · 点击打开」，点击直接打开该文档
  （截图 `/tmp/basev/v_embedders.png`）。

### 3.20 日历视图拖拽改期

- 新建「日历视图」后，把「星海科技」从 21 日拖到 25 日 → 签约日期落库变为 `2026-11-25`
  （验证后已还原为 `2026-11-20`）。
- DOM 证据：拖拽前 `["21:星海科技","5:云图数据"]`，拖拽后 `["25:星海科技","5:云图数据"]`。
- 截图：`/tmp/basev/v_calendar.png`、`/tmp/basev/v_calendar_after.png`。

### 3.21 画廊卡片自定义字段

- 视图配置新增「画廊卡片展示的字段」（最多 4 个，存 `config.layout.galleryFields`）。
- 实测：配置为 预算 / 签约日期 / 跟进事项 → 卡片行 DOM 读到
  `["预算 260000","签约日期 2026-10-18","跟进事项 已确认交付排期（UI 改）"]`（截图 `/tmp/basev/v_gallery.png`）。

### 3.22 记录详情「引用本记录的文档」（第六轮）

- 接口：`GET /projects/:projectId/base/records/:recordId/doc-references`。
- 实测：记录 `1ec55b0b…`（星海科技）返回 1 条 ——「Base 内嵌演示文档 / 内嵌本表」（`kind=embed`）。
- UI：记录详情抽屉底部出现「引用本记录的文档（1）」区块，点击可跳到该文档。
- 证据：`/tmp/basev/v6_record_docs.png`。

### 3.23 记录详情入口（第六轮）

- 之前只有公式字段能双击打开详情，普通记录没有入口 → 本轮 Grid 左侧新增固定「详情」列
  （宽 46px，24×24 文档图标按钮）。
- DOM 证据：表格内 `.base-grid__detail` 按钮 6 个（3 可见 + 3 隐藏的固定列副本），
  点击后抽屉渲染 `.be-record` + `.be-record__docs`。

### 3.24 失败项一键重试（第六轮）

- 批量操作：把「关联文档」批量改成非法值 → 结果区显示「成功 0 / 失败 1」+
  按钮「重试失败项（1）」，失败明细带具体原因（`关联的文档 ID 非法`）。
- CSV 导入：导入含 2 行坏数据的 CSV → 「失败明细（2）」+ 按钮「重试失败行」，
  两条原因分别为「第 1 行 关联的文档 ID 非法」「第 2 行 关联的文档不在当前空间」。
- 证据：`/tmp/basev/v6_batch_retry.png`、`/tmp/basev/v6_import_retry.png`。

### 3.25 附件按文件名检索（第六轮）

- `attachment` 字段由 `Indexable=false` 改为 `true`，并新增 `value_json::text` 关键字匹配分支。
- 实测：关键字 `sample.png` → 命中 1 条（星海科技，附件值 `/media/<uuid>#sample.png`）；
  UI 搜索框输入 `sample.png` → 「共 1 条」。
- 存量投影通过 `UpdateField` 触发的 `reindexTable` 补齐。

### 3.26 字段能力矩阵与文档对齐（第六轮）

- 第 21 章的字段类型清单此前与运行时能力矩阵不一致（附件写「可筛选 ✓」，长文本写「可排序 ✓」等）。
- 现按 `GET /base/field-types` 的真实返回值重写，并新增「可索引」列说明投影口径。

### 3.28 排序失效根因修复（P0 · 第七轮）

- 根因：GORM v1.31 的 `Order()` 只认 `string` / `clause.OrderBy` / `clause.OrderByColumn`，
  此前传 `clause.Expr` **被静默丢弃** → ORDER BY 从未下发到数据库，
  导致「用户排序」「分组排序」全部失效（记录恒按物理顺序返回）。
- 修复：`query.Order(clause.OrderBy{Columns: []clause.OrderByColumn{{Column: clause.Column{Name: orderSQL, Raw: true}}}})`；
  同时把 `buildOrderSQL` 的死参数（`[]any`）去掉。
- 实测（表「客户管理」，字段「预算」为数值型）：
  - `sorts=[预算 desc]` → 海拓智能(260000) → 星海科技(120000) → 云图数据(58000)；
  - `sorts=[预算 asc]` → 云图数据(58000) → 星海科技(120000) → 海拓智能(260000)；
  - `groups=[阶段 asc]` → 已签约 → 方案报价 → 需求确认。
- 回归测试：`internal/base/record_sort_test.go`（3 用例全绿）。

### 3.29 手动排序位 `sort_order` 与画廊拖拽排序（第七轮）

- 模型：`model.BaseRecord.SortOrder int64` + `idx_base_record_sort` 索引；
  迁移 `ensureBaseRecordSortOrder`（ALTER + 索引 + 按 `created_at` 回填存量）。
- 接口：`POST /projects/:projectId/base/tables/:tableId/records/reorder`（body `{ids:[...]}`）。
- 实测（画廊视图拖拽第 1 张到第 2 位）：
  - 拖拽前 `["星海科技","云图数据","海拓智能"]` → 拖拽后 `["云图数据","星海科技","海拓智能"]`；
  - **刷新页面后顺序保持**（`["云图数据","星海科技","海拓智能"]`），证明已落库；
  - 表格视图按同一 `sort_order` 返回：星海科技 → 云图数据 → 海拓智能。
- 关键修复点：HTML5 拖拽必须在 `dragstart` 里 `dataTransfer.setData('text/plain', row.id)`，
  否则 Chrome 不触发 `drop`（表现为「能拖但放不下」）。
- 证据：`/tmp/basev/v8_gallery_drag.png`、`/tmp/basev/v8_gallery_reload.png`、`/tmp/basev/v8_grid_order.png`。

### 3.30 日历拖拽跨月自动切月（第七轮）

- 视图头：`2026 年 11 月` → 把事件拖到月末的「下一月」格子 → 视图头自动翻到 `2026 年 12 月`。
- 落点日期同步改写（该次验证把「星海科技」的签约日期改到 2026-12-12，验收后已还原为 2026-11-20）。
- 证据：`/tmp/basev/v7_calendar.png`。

### 3.31 批量失败项「按新值重试」（第七轮）

- 场景：批量把「关联文档」改成非法值 `bad-id` → 结果区「成功 0 / 失败 1」，
  原因 `关联的文档 ID 非法`。
- 改成合法值 `11111111-2222-3333-4444-555555555502` 后点「重试失败项（1）」→
  记录成功写入（弹窗自动关闭并提示「重试成功 1 条」），数据库中该记录的关联文档字段已更新。
- 语义：`retryFailed` 优先使用「当前选择的字段 + 当前输入值」，没有选择时才沿用上一次参数。
- 验收后已把该记录的关联文档字段还原为空。

### 3.32 关联记录（link 字段）关系化（第八轮）

- 写值校验：关联不存在的记录被拒绝；跨 Base 关联被拒绝。
- 关系落地：`base_record_links` 随记录写入事务维护（实测 3 条关系：星海→合同①、海拓→合同②、云图→合同①，
  清空后自动回落到 2 条）。
- 接口：`GET /base/records/:recordId/relations` 返回正向 / 反向关系；
  `GET /base/tables/:tableId/link-targets?keyword=&limit=` 返回候选记录。
- 实测（合同记录 `6fae77a3…`）→ `inbound` 1 条：客户管理 / 星海科技 / 字段「关联合同」。
- UI：单元格显示目标记录标题胶囊（`星海科技 · 年度服务合同`），点击跨表跳转并打开目标记录详情；
  记录详情新增「关联记录（正向 0 · 反向 1）」区块。
- 证据：`/tmp/basev/v9_link_column.png`、`/tmp/basev/v9_link_jump.png`、`/tmp/basev/v9_relations.png`、
  `/tmp/basev/v9b_link_edit.png`、`/tmp/basev/v9b_link_saved.png`。

### 3.33 关联记录选择器（第八轮）

- 详情抽屉内双击「关联合同」→ 弹出多选下拉，候选项为目标表记录标题
  （`星海科技 · 年度服务合同`、`海拓智能 · 智能体采购合同`），选中后即时落库并回显为标题胶囊。
- 远程搜索走 `link-targets` 接口；已选记录即使不在候选中也补进选项，保证回显。

### 3.34 附件按文件名筛选（第八轮 · 收口已知限制 7）

- `attachment` 字段改为可筛选；查询走 `value_json::text ILIKE`（按文件名匹配）。
- 实测：附件字段条件 `contains=sample.png` → `total=1`，命中「星海科技」。
- 筛选面板操作符显示为「文件名包含 / 文件名不包含 / 为空 / 不为空」。

### 3.35 回归测试

- 后端新增 `internal/base/relations_test.go`（3 用例：关系正反查、非法关联拒绝、候选列表检索）。
- 前端新增 `src/modules/base/fields/BaseFieldCell.test.ts`（3 用例：标题展示、跳转事件、标题缺失回退）。

### 3.36 字段级权限策略（第九轮 · 技术方案第 8 章 P1）

- 新增 `internal/base/fieldpolicy.go`：策略写在 `base_fields.config.permissions`
  （`hidden` / `readOnly` 两个角色数组），未配置的字段保持全员可见可编辑。
- 服务端强制点：
  - `Query` — 隐藏字段的**元信息与值都不返回**；
  - `ListFields` — 访客拿不到隐藏字段的元信息（连列都不存在）；
  - 关键字搜索只扫可见字段（避免「搜得到 / 搜不到」反推隐藏内容）；
  - 写路径只读字段 → `42201 field value invalid: 预算 对当前角色只读`；
  - `FieldMeta.ReadOnly` 由服务端按**当前请求人角色**计算。
- 实测（临时造 viewer / editor 成员，验证后已删除）：
  - 访客 `query` → 字段列表无「税额」，记录数据里也没有该字段值；
  - 编辑者 `query` → 「预算」带 `readOnly=true` 标记；
  - 编辑者写只读字段 → `42201 field value invalid: 预算 对当前角色只读`；写普通字段 → 200。
- 单测：`internal/base/fieldpolicy_test.go`（3 用例：访客不可见 / 编辑者只读 / 无策略不受影响），全绿。

### 3.37 操作记录（审计）面板（第九轮）

- 后端 `ListAuditEntries`：批量补操作者显示名（`core_users.display_name` → 邮箱 → ID 前 8 位），
  剔除隐藏字段的 before/after 值，并按字段类型把值「可读化」。
- 前端新增 `panels/BaseAuditPanel.vue`（右侧抽屉，Telegram 面板规范）：
  操作类型标签 / 时间 / 操作者 / 表名 / 记录短 ID / 字段级 `before → after` 差异（最多 4 个字段）/ 刷新。
- 工具栏「数据」组新增「操作记录」按钮（Clock 图标）。
- 可读化实测（见 3.39）：`关联合同` 显示为 `星海科技 · 年度服务合同`，`关联文档` 显示为 `关联示例文档`，
  `对接人` 显示为 `李经理`（不是裸 UUID）。

### 3.38 SSE 事件不携带字段值（第九轮 · 权限绕过修复）

- 修复前：`base_event_outboxes.payload` 带 `"fields": {字段ID: 值}`，SSE 订阅是空间级的，
  隐藏字段的值会随推送广播，**绕过**字段级权限策略。
- 修复后：
  - `writeEvent`（`record.created` / `record.updated`）只发 `"fieldIds": [...]` + `"version"`；
  - `publishPending` 广播前 `delete(payload, "fields")` 兜底；
  - 前端收到事件只触发「按鉴权接口重新拉取」，从不消费推送里的值。
- 实测：更新记录后查 outbox → `{"version": 30, "fieldIds": ["03e70ba0-…"]}`，无值。
- 历史遗留的 52 条含 `fields` 的 outbox 行已一次性清洗（`payload - 'fields'`）。

### 3.39 审计可读化与跨表字段名（第九轮 · 收尾）

- `link` 字段 → 目标记录标题；`doc` 字段 → 知识库节点标题；`user` 字段 → 成员显示名。
- 新增 `tableName` 与 `fieldNames`（字段 ID → 字段名）下发：
  审计可能来自 base 内**其它表**（「合同」表），此前前端只有当前表的字段表，跨表条目显示裸 ID。
- 修掉一个 UTF-8 截断 bug：取不到显示名时按 `id[:8]` 字节截断会把中文切坏
  （`李经理` → `李经��`）；现在只对 UUID（ASCII）截断，非 UUID 值原样返回。
- UI 回归（Playwright + DOM 断言）：
  - 字段行保存权限后出现「权限」标签，清空后标签消失（`/tmp/basev/v11c_perm_set.png`、`/tmp/basev/v11c_field_perm_tag.png`）；
  - 审计面板 40 条记录全部可读，无裸 UUID、无乱码（`/tmp/basev/v11_audit.png`）。

### 3.40 记录级可见性（第十轮 · 技术方案第 31.1 节）

- 新增 `internal/base/datascope.go` + `base_records.visibility`（`space` / `restricted`）+ `ensureBaseRecordVisibility` 迁移。
- 服务端强制点：查询（**计数与取数同条件**）、记录详情、更新、删除、关联候选、文档反向引用。
- 只有空间管理者能改可见范围，其他角色 → `403 / 40301`。
- 实测（临时成员 `scopeviewer@metamatrix.local`，验证后已删除）：

| 场景 | 结果 |
| --- | --- |
| 管理员把「星海科技」设为 `restricted` | PATCH 200，DB `visibility = restricted` |
| 访客查询该表 | `total = 2`（不含受限记录），返回记录 2 条 —— **总数与数据一致** |
| 访客改 / 删受限记录 | `403`（角色不足）；编辑者角色下为 `404`（按「不存在」处理，不泄露存在性） |
| 访客改可见范围 | `403 / 40301 base operation forbidden` |
| 恢复为 `space` | 访客重新看到 3 条 |

### 3.41 SSE 断线补拉（第十轮 · 技术方案第 31.2 节）

- `ReplaySince(ctx, projectID, lastEventID, limit)`：按 outbox `created_at > 锚点` 回放，补发前同样剔除 `fields`。
- `Events` 支持 `Last-Event-ID` 头与 `?lastEventId=`；前端 `realtime.ts` 记录 `lastEventId` 并在重连时带上。
- 实测：`curl -H "Last-Event-ID: <最早事件>" /projects/:p/base/events` → 先收到 `: connected`，
  随后按时间顺序补发历史事件（`record.created` / `record.updated`），再进入实时循环。

### 3.42 视图「共享 / 个人」分离（第十轮 · 技术方案第 31.3 节）

- 新增表 `base_view_prefs`（`(view_id, user_id)` 唯一）+ `ensureBaseViewPrefsSchema` + 历史数据迁移。
- 个人偏好从 `base_views.config` 里独立出来，消除两个硬伤：写覆盖（互相抹掉）与读泄露（看到别人的偏好）。
- 视图可见范围：`base_views.scope` = `shared` / `personal`；个人视图只有创建者可见可改。
- 新建视图弹窗（视图名 + 可见范围）、视图配置弹窗「仅保存为我的偏好」开关均已上线。
- 实测：

| 场景 | 结果 |
| --- | --- |
| 管理员建 `personal` 视图 | 访客 `ListViews` 看不到；管理员可见（带锁图标） |
| 管理员保存「仅我的偏好」（隐藏「客户名称」） | `base_view_prefs` 落 1 行；`base_views.config` 共享段**不变** |
| 管理员刷新页面 | 仍隐藏「客户名称」（个人偏好持久生效） |
| 访客打开同一张表 | 「客户名称」**正常可见**（共享配置未被污染） |
| 别的成员保存共享配置 | 管理员的个人偏好**不被冲掉** |
| 共享模式下保存 | 自己的个人偏好被删除（`personal` 传空对象，不是 `undefined`） |

### 3.43 当前用户 ID 的兜底与静默降级修复（第十轮 · 收尾）

- 现象：本地缓存的 user 对象缺失时，`authStore.user?.id` 为空 →
  「保存为我的偏好」被静默当成共享保存（表现为「只有我自己被改了，别人没反应」）。
- 修复：
  - `authStore.currentUserId`：拿不到 user 对象时解析 JWT 的 `uid` / `sub`（含 base64 padding 修正）；
  - 保存前仍识别不出用户 → 明确提示并**放弃写入**，不再静默降级；
  - Pinia setup store 的 `computed` 必须写进 setup 的 `return`（否则外部读到 `undefined`）。
- 顺带修掉记录可见范围下拉的两行选项被 Element Plus 固定行高裁切重叠的问题
  （`popper-class="be-scope-popper"` + 全局 `base.css` 覆盖，选项高度 34px → 52px）。

### 3.44 记录级可见性第三档：指定成员可见（第十一轮 · 技术方案第 32.1 节）

- 新表 `base_record_grants`（`(record_id, user_id)` 唯一）+ `ensureBaseRecordGrants` 迁移。
- `visibility` 扩展为 `space` / `restricted` / `custom`；`custom` 的授权名单落这张表。
- 查询注入 `r.id IN (SELECT g.record_id FROM base_record_grants g WHERE g.user_id = ?)`（计数与取数同条件）。
- 实测（临时成员「授权访客」「未授权编辑」，验证后已删除）：

| 场景 | 结果 |
| --- | --- |
| 管理员把记录设为 `custom` 并授权「授权访客」 | PATCH 200，`visibility=custom`，授权名单落库 |
| 被授权访客查询 | `total=3`，**能看到**该记录 |
| 未授权编辑查询 | `total=2`，**看不到**该记录（总数与数据一致） |
| 被授权访客改可见范围 / 授权名单 | `403 / 40301 base operation forbidden` |
| 授权给**非空间成员** | `42201 field value invalid: 可见成员必须是空间成员` |
| `GET /records/:id/grants` | 返回授权成员（含显示名 / 邮箱） |

- 单测：`datascope_test.go` 新增 2 用例（授权成员可见 / 未授权不可见；授权对象必须是空间成员），全绿。

### 3.45 权限变更 → 订阅失效（第十一轮 · 技术方案第 8 章明文要求）

- 字段权限策略变更 → `permission.changed`（aggregateType `field`）；记录可见范围 / 授权名单变更 → `permission.changed`（aggregateType `record`）。
- 实测：`curl /projects/:p/base/events` 实时收到
  `event: permission.changed` / `payload: {scope:"record", recordId, visibility}`。
- 前端 `onRealtimeEvent` 收到该事件后全量刷新（`runQuery` 同时带回最新字段元信息与数据）。

### 3.46 字段级权限按人配置（第十一轮 · 技术方案第 32.3 节）

- 策略扩展为「角色 + 按人」：`hiddenUsers` / `readOnlyUsers`（旧的 `hidden` / `readOnly` 数组完全兼容）。
- 判定优先级：按人隐藏 > 角色规则；服务端统一用 `policySubject{role,userID}` 判定。
- 实测：把「税额」设为对「未授权编辑」不可见 → 该成员的**字段列表里没有税额**，
  查询结果里**也没有税额的字段与值**；其他成员不受影响。
- 顺带修掉一个真 bug：此前前端「清除权限」用「不传 permissions」表达，
  服务端会当成「没改」而保留旧策略 —— 现在前端显式提交空策略、服务端识别空策略并删除该键，
  清除动作已验证生效（`base_fields.config` 从 `{permissions:{hiddenUsers:[…]}}` 变回 `{}`）。

### 3.47 审计分页 + 筛选（第十一轮 · 技术方案第 32.4 节）

- 接口：`GET /base/:baseId/audit?limit=&offset=&action=&from=&to=` → `{items,total,limit,offset}`。
- 面板：操作类型下拉 + 时间范围选择器 + 「重置」+ 「加载更多」（每页 30 条），标题显示「共 N 条记录（已加载 M）」。
- 实测：`limit=3` → `total=43 / items=3`；`action=record.created` → `total=4` 且返回项全部为 `record.created`。

### 3.48 审计按操作者 / 按记录（支持前缀）筛选（第十二轮 · 技术方案第 33.1 节）

- 接口：`GET /base/:baseId/audit?operator=<userId>&recordId=<uuid|前缀>`。
- 前缀规范化：非 UUID 输入按 UUID 规范写法补短横线后前缀匹配；非法输入忽略该条件（不报错、不清空列表）。
- 实测（Postgres 线上库）：`operator=03cdd7ce…` → `total=46` 且返回项操作者一致；
  `recordId=1ec55b0b` → `total=24` 且返回项记录均为 `1ec55b0b…`。
- 面板：新增「全部操作者」下拉（成员来源 `listSpaceMembers`，可搜索）与「记录 ID（可填前几位）」输入框。
- 用例：`internal/base/audit_filter_test.go` 3 个（按操作者 / 按记录完整 ID / 按前缀 / 非法前缀忽略）。

### 3.49 审计导出 CSV + 时间快捷（第十二轮 · 技术方案第 33.2、33.3 节）

- 导出：面板右上「导出」按钮，把当前已加载条目导出 CSV（BOM 头，Excel 直开不乱码），
  列 = 时间 / 操作 / 操作者 / 数据表 / 记录 / 字段 / 变更前 / 变更后；一条日志多字段差异拆多行。
- 时间快捷：「今天 / 近 7 天 / 近 30 天 / 全部」分段控件，与手动时间范围双向绑定。

### 3.50 授权名单批量操作（第十二轮 · 技术方案第 33.4 节）

- 记录抽屉「可见成员」区新增「按角色批量授权」（管理员 / 编辑者 / 访客）与「清空」快捷动作，
  复用同一份 `grants` 全量覆盖语义，不新增第二套写路径。

### 3.51 视图个人查询偏好（第十三轮 · 技术方案第 34.1、34.2 节）

- 存储：共享段 `config.filters/sorts/groups` = 视图默认条件；个人段 `personal[uid].query` = 我的条件（优先级更高）。
- 工具栏「筛选 / 排序 / 重置」组内新增 **共享 / 仅我** 分段控件（实测 91×26px，选中态 `rgb(51,144,236)` 蓝底白字）。
- 筛选弹窗顶部随范围切换提示：仅我模式「这些条件只保存到我的偏好，其他人打开这个视图不受影响」。
- 实测（真实双用户，管理员 + 访客）：
  管理员写个人查询偏好 → 访客 `personal` 段为 `undefined`、共享 `filters` 保持不变、查询 `total=3`（未被他人筛选影响）；
  访客写自己的个人偏好 → 管理员的个人段不受影响，双方偏好互不覆盖。
- 切回「共享」后服务端 `personal` 段已清空（5 个视图全部 `personal=null`）。

### 3.52 访客可保存自己的偏好，但不能改共享配置（第十三轮 · 技术方案第 34.3 节）

- 改前：访客调 `PATCH /base/views/:id` → `40301 base operation forbidden`（个人偏好也存不了，这是硬伤）。
- 改后：访客可写**自己的** `base_view_prefs`；提交的共享段（视图名 / 类型 / 共享配置）一律忽略；
  访客可新建**个人视图**，新建**共享视图**仍被拒。
- 用例：`internal/base/viewscope_test.go` 2 个（访客写个人偏好 + 共享段不被改；访客建个人视图可以、建共享视图被拒）。

### 3.53 连带修复（第十三轮 · 技术方案第 34.4 节）

- 视图设置弹窗「保存为共享配置」不再连带删除个人查询偏好（只清字段级偏好）。
- 工具栏「重置」现在同样落库（此前只改内存，刷新即回弹）。

### 3.54 查询口径叠加：共享 AND 我的（第十四轮 · 技术方案第 35.1、35.3 节）

- 个人段 `personal[uid].query.combine`：`override`（覆盖，历史默认）/ `and`（叠加）。
- 工具栏「仅我」模式下出现「叠加共享条件」开关；视图标签出现「我的条件」标记。
- 实测（真实请求体抓取，共享条件 = 客户名称含「星海」，我的条件 = 阶段 = 方案报价）：
  - 叠加开：请求 `filters.conditions` = 2 条（`a6b5216f` + `94ab1143`），存储 `combine="and"`；
  - 叠加关：请求条件 = 1 条（仅 `94ab1143`），存储 `combine="override"`；
  - 重新开启：请求条件恢复 2 条，存储回到 `"and"`；列表总数 `共 1 条` 全程一致（条件叠加正确）。
- 筛选弹窗提示（686×19px）：「这些条件只保存到我的偏好，其他人打开这个视图不受影响；当前为叠加口径，最终筛选 = 视图共享条件 AND 我的条件」。

### 3.55 口径计算抽成可测模块（第十四轮 · 技术方案第 35.2 节）

- 新增 `src/modules/base/viewQuery.ts`：`normalizeFilters` / `mergeFilters` / `normalizeCombine` / `resolveFilters` / `resolveSorts` / `resolveGroups`。
- 新增 `viewQuery.test.ts`：**7 例全绿**（历史数组兼容、空值归一、AND 合并、空组回落、脏 combine 值归一、两种口径的筛选/排序/分组解析）。
- 修掉一个隐蔽 bug：`el-switch` 的 `v-model` 产出布尔值，直接绑到 `'override' | 'and'` 上会把
  `combine` 存成 `false`，叠加开关会自动关掉；现改为显式映射 + `normalizeCombine` 只认 `'and'`。

### 3.56 字段级「条件可见」策略（第十五轮 · 技术方案第 36.1、36.2 节）

- 配置：字段 `config.permissions.visibleWhen = {logic, conditions:[{fieldId, operator, value}]}`（另有 `hiddenWhen` 反向写法）。
- 实测（真实服务，字段「对接人」条件 = 预算 > 100000）：
  - 预算 120000 行 → `对接人=["李经理"]`，`conditionalHidden` 无；
  - 预算 58000 行 → `对接人` **值不过网**，`conditionalHidden=["cc7ab998…"]`；
  - 预算 260000 行 → 正常可见；
  - 字段元信息 `conditional = true`（字段仍在列表里）。
- 写路径：对不满足条件的记录写该字段 → `422 field value invalid: 对接人 在当前记录上不满足可见条件`。
- 判定对所有人一致（含空间管理者）—— 条件描述的是数据可读性，不是某类人的权限。

### 3.57 条件可见的界面（第十五轮 · 技术方案第 36.4 节）

- 字段权限弹窗新增「条件可见」区：条件行 = 字段 + 运算符 + 值，支持「同时满足 / 任一满足」、增删条件行。
  实测打开「对接人」权限弹窗 → 条件行 `预算 | 大于 | 100000`，点「添加条件」行数 1 → 2。
- 网格 / 记录详情里被条件挡住的单元格显示斜纹底 + 「按条件隐藏」占位符（实测 2 处，70×22px），并禁止就地编辑。

### 3.58 修掉条件被静默删除的 bug（第十五轮 · 技术方案第 36.3 节）

- `isEmptyPermissions` 原本只认角色 / 人员列表：仅有 `visibleWhen` 的策略会被判成「空策略」，
  保存时整段 `permissions` 被删 → 条件静默失效（首轮实测复现）。
- 现在条件组也算「非空策略」；用例：`internal/base/conditional_test.go` 2 例全绿
  （值裁剪 + 占位依据；写入拦截）。

### 3.59 表配置包：导出 → 导入（第十六轮 · 技术方案第 37 章）

- 导出（HTTP 实测）：`GET /projects/3f030ea3…/base/tables/7996e4c5…/config-export` 返回
  `formatVersion=1`，10 个字段、4 个共享视图、1 条公式
  （`IF({预算} > 100000, {预算} * 0.1, 0)`），个人视图「我的私密视图」未导出。
- 导入（HTTP 实测）：`POST …/tables/config-import` 返回 `tableId`，
  新表 10 字段、4 视图，`base_field_formulas` 里公式表达式逐字还原（SQL 核对一致）。
- **条件引用重映射实测**：给「对接人」配 `visibleWhen = 预算 > 100000` → 导出 → 导入 →
  新表「对接人」的条件 `fieldId` = 新表「预算」的字段 ID（`5a705b72…`），
  不再是旧表 ID；`GET …/fields` 返回 `conditional=true`（策略在新表真实生效）。
- **清理**：验证过程中新建的 3 张临时表已全部软删除，演示 Base 恢复为「合同 / 客户管理」2 张表。

### 3.60 表配置包界面（第十六轮 · 技术方案第 37.5 节）

- 工具栏「数据」组新增「表配置」按钮（`Files` 图标），弹窗宽 720px、白底 12px 圆角（Telegram 规范）。
- 导出页实测摘要标签：`字段 10` / `视图 4` / `公式 1`；JSON 预览 2587 字符。
- 导入页实测：粘贴配置包 → 「导入为新表」→ 提示「已导入为「客户管理」，当前视图已切换到新表」，
  无 warning。截图 `/tmp/base_cfg_dialog.png`、`/tmp/base_cfg_export.png`、`/tmp/base_cfg_import.png`。
- 用例：`internal/base/configbundle_test.go` 3 例全绿（结构与策略往返 + 条件重映射；
  跨表条件被丢弃；引用包外字段的公式被跳过并给 warning）。

### 3.61 合并导入（第十六轮 · 技术方案第 37.6 节）

- HTTP 实测：`POST …/tables/:tableId/config-merge` 把「客户管理」的配置包合并进「合同」表：
  10 个同名字段全部跳过（warnings 逐条列出「字段「X」已存在，按字段名跳过」），
  视图按名字跳过，公式字段保留原公式。
- 用例：`internal/base/configbundle_test.go` 第 4 例（合并后新字段补建、已有字段保留、条件引用复用目标表字段 ID）。
- 浏览器实测（截图 `/tmp/base_cfg_merge_form.png`、`/tmp/base_cfg_merge_done.png`）：
  导入页切到「合并到已有表」→ 目标表下拉可选「合同」→ 提示「已合并到「合同」，当前视图已切换。」
- 验证产生的临时字段 / 视图 / 公式已全部删除，「合同」表恢复为原样（仅「名称」字段）。

### 3.62 修掉删除字段 500 的既有缺陷（第十六轮 · 技术方案第 37.7 节）

- 现象：任何「删除字段」都返回 `50001`（`column "field_id" does not exist`）。
- 根因：`base_formula_dependencies` 没有 `field_id` 列，删除逻辑却按该列去删。
- 修复：改按 `formula_field_id / dependency_field_id` 删除，并顺带清理公式定义行。
- 用例：`internal/base/deletefield_test.go`（**回滚修复后该用例失败**，修复后通过）。

### 3.63 工具栏防变形（第十七轮 · 技术方案第 38.1 节）

- 修法：工具栏改单行 `nowrap` + 按钮组放进可横向滚动的 `.be-toolbar__scroll`，
  「新增记录 / 共 N 条」移到滚动容器外常驻右侧。
- 实测（1920 / 1440 / 1280 / 1100 四档宽度）：工具栏高度**恒为 51px（单行）**，
  `新增记录` 按钮始终完整可见（`addVisible: true`，距右边界 62px），
  1280 宽时 `scrollWidth 1340 > clientWidth 826` → 横向滚动而非换行。
- 截图 `/tmp/tb_1280.png`（工具栏单行）、`/tmp/tb_1280_full.png`（整页）。

### 3.64 表头标题兜底与空名回填（第十七轮 · 技术方案第 38.2 节）

- 根因定位：用户空间「微信表情包」→「未命名多维表格」→「数据表」里
  4 个字段中有 3 个 `name = ''`（旧表空列名迁移而来）→ 表头只剩类型图标。
- 修法四层：迁移补名（`列 N`）/ `UpdateField` 拒绝空名 / 启动时 `ensureBaseFieldNames` 回填存量 /
  前端表头空名显示「未命名字段」占位。
- 存量回填实测：回填后该表字段名为 `字段 1 / 字段 2 / 计算 / 字段 3`。
- 渲染兜底实测：把演示表某个字段名临时置空 → 表头显示「未命名字段」（截图 `/tmp/hdr_empty_name.png`），
  验证后已还原为「跟进事项」。
- 用例：`internal/base/base_test.go` `TestLegacyFieldNameFallback`、
  `internal/base/deletefield_test.go` `TestUpdateFieldRejectsEmptyName`。

### 3.65 「共享 / 仅我」分段控件错位修复（第十八轮 · 技术方案第 38.4 节）

- 根因定位：Element Plus 分段控件默认样式两处叠加 ——
  ① 首/末段被改成半边圆角（`10px 0 0 10px`），选中段出现「一头圆一头方」；
  ② 激活态 `box-shadow: -1px 0 0 0 <primary>` 让选中段整体左移 1px；
  另每段还有一圈 `outline`（拼连续分段控件用），在本设计里表现为多余空心框。
- 修法（`base.css` `.be-query-scope`）：三段 `border-radius` 统一收成 `--tg-radius-pill`、
  `border: none`、清 `outline`（改用 `:focus-visible` 保留键盘聚焦）、
  激活态显式 `box-shadow: none !important`、组内 `gap:2px` + `align-items:center`。
- 实测数值（DSF=3，演示空间「客户管理」）：
  - 选中段 `border-radius: 999px`、`box-shadow: none`、`transform: none`；
  - 两段 `y=161 / h=26`（同高同基线），`x=733 / 783`（间距 2px，无重叠）；
  - 容器 `padding: 3px`，控件组 `x=733`，激活段左边界与组左边界齐平（无 1px 外溢）。
- 截图：`/tmp/scope4_共享.png`（首段选中）、`/tmp/scope4_仅我.png`（末段选中），
  两种状态均为完整蓝色药丸、无错位。
- 全站归一：同类缺陷在知识库左侧「目录/收藏/归档/回收站」「树结构/最近更新」、
  顶部「概览/内容/图谱」也存在 → 把形态修正提到全局规范层
  （`src/styles/telegram.css` 第 8 节，主入口最后导入，胜在同特异性）。
  实测这 4 组共 12 个分段项 `border-radius` 均为 `999px`、`outline: none`、
  选中项 `box-shadow` 为页面自定义的 `0 1px 3px`（无 -1px 偏移），
  截图 `/tmp/kn_tabs.png`（知识库页，左侧树 + 顶部标签）确认无错位。
- 门禁：`go build` / `go test ./internal/base/... ./internal/service/...` 通过；
  `vitest` 1950 passed / 6 failed（与基线一致，均在 `rte/**`）；
  `vue-tsc` 62 errors（与基线一致）；`vite build` 通过。

### 3.66 批次 A：Base 写接口 + 幂等键（技术方案第 39 章）

- `POST /base/bases`、`PATCH /base/bases/:baseId`、`DELETE /base/bases/:baseId` 已注册，
  权限分别为 Editor / Editor / Admin。
- 前端 `BaseSettingsDialog.vue` 可改名称 / 图标 / 描述并删除。
- `core_idempotency_keys` 表 + `Service.Idempotent` 生效：同键同体回放、
  同键异体 `40901`、同键在途 `40901`。已接入批量创建与配置导入。
- 用例：`internal/base/idempotency_test.go` 全绿。

### 3.67 批次 B：冻结列 / 只读 API / schema / 错误码 / 限流 / 黑名单（技术方案第 40 章）

- `frozenFields` 已进 `ViewConfig` 并映射到 vxe `fixed:'left'`。
- `GET /tables/:tableId/fields/:fieldId/formula`、`GET /fields/:fieldId/dependencies`、
  `GET /tables/:tableId/schema` 三个只读接口可用。
- 错误码 `42202` / `42203` / `42901` 已接 `handleErr` 映射；base 域限流 40rps / burst 80。
- 附件扩展名黑名单生效（exe / bat / cmd / sh / ps1 / jar / msi / apk / dmg 等），写盘前拦截。

### 3.68 批次 C：OpenAPI / 压测 / 并发 / lookup+rollup（技术方案第 41 章）

- `GET /openapi.json` 返回 35 路由 / 49 schema；`npm run gen:api` 生成
  `web/src/modules/base/types.gen.ts`。
- 压测报告见 `docs/acceptance/base-load-test.md`：300 行 × 21 字段、并发 4、8s，
  6 场景 **0 错误**，首屏 P95 6ms / 单条更新 10ms / 批量 100 条 P95 200ms。
- 压测暴露并修复 2 个真实缺陷：`spaceRole` 吞 DB 错误（高并发随机 404）、
  GORM 连接池无上限（打满 Postgres `max_connections`）。
- 并发用例 `internal/base/concurrency_test.go` 9 场景全绿（Postgres 临时 schema；
  SQLite 单写者会 BUSY，故不用 SQLite）。并修复 3 个缺陷：字段级合并（事务内
  `SELECT ... FOR UPDATE` + 重试）、`SaveFormula` 补发事件、无依赖公式漏算。
- `lookup` / `rollup` 字段类型已实现：后端 `internal/base/lookup.go`（六种聚合口径），
  路由 `GET /tables/:tableId/computed-fields`、`POST /tables/:tableId/lookup-rollup/recalc`，
  前端 `BaseFieldManager.vue` 有「引用 / 汇总配置」区块与「重算」按钮。

### 3.69 批次 D：keyset / 时间函数 / 表单+甘特 / 签名 / 跨空间迁移（技术方案第 42 章）

- keyset 游标 `k:<sort_order>:<id>`（兼容旧 `o:<n>`），5 例全绿。
  限制：自定义排序 / 分组仍走 offset。
- **修掉「keyset 永远走不到」的缺陷**：原判定要求「收到的游标本身是 keyset」，
  而首页没有游标 → 首页只吐 `o:<n>` offset 游标 → keyset 分支形同虚设。
  改为首页也进入 keyset 模式并直接返回 `k:` 游标。
  实测（3 条记录 / pageSize=1）逐页走完 3 页，无重复无漏行，`offset` 恒为 `-1`。
- 时间函数：`RecalcTimeSensitiveTables` / `EnsureTableTimeRecalc`（查询惰性补算）/
  `StartDailyTimeRecalc`（每日 00:05 + 启动补算），3 例全绿。
- 表单视图 / 甘特视图已上线，后端白名单含 `form` / `gantt`，非法类型 `40001`。
  甘特视图修掉「终点只看结束日期 → 条形跑到画布外消失」的真实布局缺陷；
  时间轴最小跨度 14 天；未填开始日期的记录标「未排期」。
  实测 DOM：`.be-gantt` 1020×763，`.be-gantt__main` `scrollWidth=2254` / `clientWidth=818`，
  3 根条形 `left` 均落在时间轴内。截图：`/tmp/basev/d3_gantt.png`、`/tmp/basev/d3_gantt_right.png`、
  `/tmp/basev/d3_表单视图.png`。
- 配置包签名：HMAC-SHA256（密钥由 `JWT_SECRET` 派生），导出签名、导入 / 合并校验，
  不匹配 → `40002`；无签名包兼容放行。4 例用例全绿。
  实测 HTTP：导出 200（带签名）/ 原样导入 201 / 篡改导入 **400 `40002`** / 去签名导入 201。
- 跨空间迁移：导入页有「目标空间 → 目标 Base → 目标表」三级选择。
  实测弹窗 720×622，目标区 2 个下拉渲染正常，无 console 错误。截图 `/tmp/basev/d5_import.png`。

### 3.70 连带修复：前端依赖缺失导致知识库页整体白屏

- 现象：知识库页被 Vite 报错遮罩覆盖，导入分析报
  `Failed to resolve import "@tiptap/extension-collaboration"` 与
  `"y-protocols/awareness"`，**整个页面不可用**（不只是 Base 模块）。
- 根因：`package.json` 声明了 `@tiptap/extension-collaboration` /
  `@tiptap/extension-collaboration-caret`，但 `pnpm-lock.yaml` 从未收录，
  `node_modules` 里也没有 —— 装出来的依赖树是残缺的。
- 修法：重装依赖并把 `pnpm.overrides`（prosemirror 三件套的版本钉死）迁到
  `pnpm-workspace.yaml`（pnpm 11 已不读 `package.json` 的 `pnpm.overrides`）；
  补 `y-protocols` 依赖（`collabAwareness.ts` 需要）。
- 结果：知识库页恢复正常，`.kn-tree__node-label` 渲染出 3 个节点，
  Base 表单 / 甘特视图可正常打开。
- 风险提示：`pnpm-lock.yaml` 有较大改动（新增 134 行），合入前建议在干净环境
  跑一次 `pnpm install --frozen-lockfile` 验证可重现。

### 3.27 降级策略

- 迁移失败不再 500：`base_apps.migrated = failed:<原因>`，前端进入只读降级，
  继续渲染旧 JSONB 数据并提示原因（截图 `/tmp/base_legacy_fallback.png`）。

## 四、门禁结果

```bash
cd pros/api && go build ./... && go test ./internal/base/... ./internal/service/...   # 通过（base 包用例：record_sort / relations / field_order / fieldpolicy / datascope / viewpref / viewscope / audit_filter / configbundle / deletefield)）
cd pros/web && npx vitest run                                                       # 1950 passed / 6 failed（6 个失败文件与基线完全一致，均在 rte/**；新增 viewQuery.test.ts 7 例全绿）
cd pros/web && npx vue-tsc -b --pretty false                                        # 62 errors（基线，全部在 rte/** 与既有 rte 相关文件）
cd pros/web && npx vite build                                                       # 通过
```

浏览器控制台：Base Engine 页面无 error / warning（仅浏览器自身的 Permissions policy 提示）。

## 五、已知限制

0. 记录级可见性已有三档（`space` / `restricted` / `custom` 指定成员可见）；
   但**没有做「按人分组 / 按部门授权」**，也没有做「授权对象的有效期」——
   名单一旦授权就是长期的。
0.1 视图个人偏好已覆盖**字段显隐 / 列宽 / 布局 / 筛选 / 排序 / 分组**（第十三轮补齐，见 3.51），
   并支持「共享条件 AND 我的条件」的叠加口径（第十四轮，见 3.54）；
   仍未做的是叠加口径只支持 **AND**（不能是 OR），且叠加只作用于筛选条件，
   排序 / 分组在叠加模式下是「个人优先、为空回落共享」，不做真正的多级合并。
0.2 字段级权限策略仍写在 `base_fields.config` 里（未独立成策略表），
   字段被删除后策略随之失效；**「条件可见」已实现**（第十五轮，见 3.56–3.58），
   但仍没有做「条件可见 + 角色隐藏」的组合优先级说明，
   且审计快照里的条件字段仍按写入时快照展示（不回填条件判定结果）。

0.3 表配置包（第十六轮，见 3.59–3.61）已能整体搬运「结构 + 策略 + 视图」，
   导入支持「新建为新表」与「合并进已有表」两档；
   但配置包未签名 / 未加密，导入方需自行信任来源；
   跨空间一键迁移的界面未做（接口已支持任意 projectId + baseId）；
   合并模式刻意不做「覆盖已有字段的类型 / 策略」。

1. `doc` 字段仍按节点 ID 存储；关键字搜索与筛选条件都已支持按**文档标题**命中（见 3.16 / 3.17），
   但筛选面板的候选项只能来自当前空间的 doc / canvas 节点，不能跨空间引用。
2. 批量操作与 CSV 导入均已支持「部分成功 + 失败明细 + 失败项一键重试」（见 3.18 / 3.24）；
   批量侧已支持「改完值再重试」（见 3.31），CSV 导入侧的行级重试仍按整行映射重放。
3. 看板拖拽换组、日历拖拽改期、画廊卡片自定义字段均已落地（见 3.20 / 3.21）；
   日历跨月拖拽（自动切月）与画廊拖拽排序均已落地（见 3.30 / 3.29），
   排序落在 `base_records.sort_order` 手动位上，与用户排序正交。
   仍未做：批量多选拖拽排序、跨表拖拽记录。
4. 关联文档支持「记录 → 文档」跳转；文档侧反向引用（文档 → 引用它的记录）与
   记录侧反向引用（记录 → 引用它的文档，含「内嵌本表」与「正文提及」）都已实现。
5. 实时通道是 SSE，未做 WebSocket；事件协议兼容，可整体切换。
6. 未做压力测试（1000+ 行滚动、50 并发编辑）。
7. 附件沿用素材库策略：没有病毒扫描与类型白名单；文件名以 `url#name` 编码在字符串里，
   关键字搜索与**筛选面板**均已支持按文件名命中（见 3.25 / 3.34）。
8. 粘贴为整格覆盖（不做类型智能转换，例如把「1,000」直接当数字写入会由服务端归一化处理）。
9. 关联记录（link）目前只支持**同 Base 内**的表之间关联，不支持跨空间 / 跨 Base 关联；
   目标表候选一次最多拉取 200 条并支持远程搜索；反向关系按记录 JSONB 扫描实现，
   单次查询代价与表内记录量线性相关（超大表建议给 link 字段配置目标表后按需查询）。
10. 字段级权限策略目前按**空间角色**粒度（访客 / 编辑者 / 管理者）配置，
    不支持按具体用户配置，也不支持「A 角色对 B 字段只读但对 C 字段可写」以外的组合条件；
    策略写在字段 config 里，字段被删除后策略随之失效（无独立策略表）。
11. 审计面板已支持分页（每页 30 条 + 加载更多）、操作类型筛选与时间范围筛选；
    第十二轮补齐了**按操作者 / 按记录（完整 ID 或前缀）筛选**、时间快捷与 CSV 导出；
    仍未做的是历史审计里的值是写入当时的快照，不随记录后续修改回填（不能当作「变更历史回放」用）。
12. SSE 事件体不再携带字段值（见 3.38），若将来要做「离线补偿」需要另设按角色过滤的增量接口。

## 六、演示数据

演示空间：`多维表格演示`（`3f030ea3-61a5-4156-9b77-a9ca1d29d107`），演示表「客户管理」为旧版迁移而来，
含「客户名称 / 阶段 / 对接人 / 预算 / 签约日期 / 跟进事项 / 税额 / 关联文档」字段与 3 条记录。
第三轮新增演示字段「附件」（`ded9a95f-f8f9-4a4a-97d7-51442b83c565`），并在「星海科技」记录上保留 1 个示例附件
（素材库资产 `/media/dc20c847-1206-4697-a60d-e48e6e2cd6d3`，文件名 `sample.png`），用于演示附件字段。
验收脚本产生的其它临时数据（CSV 导入行、隐藏列状态、失败标记、拖拽/粘贴造成的字段改写）均已清理还原。

第五轮为验证日历拖拽新增了「日历视图」（`1bb03e1d-14af-4823-b7a4-5e60aab7c8cd`），
并给「画廊视图」配置了 `layout.galleryFields = [预算, 签约日期, 跟进事项]`（都是可回退的演示配置）。

第八轮为验证「关联记录」在演示 Base 内新增了一张演示表「合同」
（`0aa2163f-baa3-48a0-ba4d-6f4c6a289fe2`，2 条记录），并在「客户管理」表新增 link 字段
「关联合同」（`486a0608-eb4e-4964-a394-5dff42aea02e`）：星海科技 → 合同①、海拓智能 → 合同②。
**这是演示数据，如不需要可自行删除**（先删字段与记录，再删表）。

第四轮为验证「文档内嵌 Base 视图块 / 文档反向引用」新增了一个演示文档节点
「Base 内嵌演示文档」（`41f44f15-2b0d-437c-8c60-22b658e57661`，正文含一块内嵌「客户管理」视图块），
并把「星海科技」记录的「关联文档」字段加上了它。**这是演示数据，如不需要可自行删除**
（`DELETE /projects/3f030ea3-61a5-4156-9b77-a9ca1d29d107/knowledge/nodes/41f44f15-2b0d-437c-8c60-22b658e57661`）。

## 七、截图索引

| 截图 | 路径 |
|---|---|
| 表格视图（主界面） | `/tmp/base_final_grid.png` |
| 看板视图 | `/tmp/base_kanban.png` |
| 画廊视图 | `/tmp/base_gallery.png` |
| 字段管理 | `/tmp/base_engine_fields.png` |
| 筛选与排序 | `/tmp/base_filter_panel.png` |
| 公式编辑 | `/tmp/base_formula.png` |
| CSV 导入 | `/tmp/base_import.png` |
| 批量操作条 / 弹窗 | `/tmp/base_batch_bar.png`、`/tmp/base_batch_dialog.png` |
| 视图配置 | `/tmp/base_view_settings.png` |
| 迁移失败只读降级 | `/tmp/base_legacy_fallback.png` |
| 第三轮 · 表格视图（含附件列） | `/tmp/base_final_grid.png` |
| 第三轮 · 键盘聚焦单元格 | `/tmp/base_kbd_focus.png` |
| 第三轮 · 附件上传 | `/tmp/base_final_attachment.png` |
| 第三轮 · 看板视图（拖拽后） | `/tmp/base_final_kanban.png` |
| 第三轮 · 空表兜底（新建节点自带默认表） | `/tmp/basev/empty_base.png` |
| 第三轮 · 空表兜底（字段面板） | `/tmp/basev/empty_base_field.png` |
| 第三轮 · 工具栏按钮分组 | `/tmp/base_btngroup.png`、`/tmp/base_btngroup_hover.png` |
| 第四轮 · 文档内嵌 Base 视图块 | `/tmp/basev/v_embed.png`、`/tmp/basev/v_embed_persist.png` |
| 第四轮 · 文档反向引用 | `/tmp/basev/v_backref.png` |
| 第六轮 · 记录详情「引用本记录的文档」 | `/tmp/basev/v6_record_docs.png` |
| 第六轮 · 批量失败项重试 | `/tmp/basev/v6_batch_retry.png` |
| 第六轮 · 导入失败行重试 | `/tmp/basev/v6_import_retry.png` |
| 第五轮 · 内嵌引用弹窗 | `/tmp/basev/v_embedders.png` |
| 第五轮 · 筛选面板（关联文档按标题） | `/tmp/basev/v_filter_doc.png` |
| 第五轮 · 日历视图拖拽 | `/tmp/basev/v_calendar.png`、`/tmp/basev/v_calendar_after.png` |
| 第五轮 · 画廊卡片自定义字段 | `/tmp/basev/v_gallery.png` |
| 第七轮 · 画廊拖拽排序（拖后） | `/tmp/basev/v8_gallery_drag.png` |
| 第七轮 · 画廊拖拽排序（刷新后仍保持） | `/tmp/basev/v8_gallery_reload.png` |
| 第七轮 · 表格视图按 sort_order 排列 | `/tmp/basev/v8_grid_order.png` |
| 第七轮 · 日历跨月拖拽（自动切月） | `/tmp/basev/v7_calendar.png` |
| 第七轮 · 批量失败项改值后重试 | `/tmp/basev/v7_retry_newvalue.png` |
| 第八轮 · 关联记录列（标题胶囊） | `/tmp/basev/v9_link_column.png` |
| 第八轮 · 点击关联记录跨表跳转 | `/tmp/basev/v9_link_jump.png` |
| 第八轮 · 记录详情「关联记录」区块 | `/tmp/basev/v9_relations.png` |
| 第八轮 · 关联记录选择器 | `/tmp/basev/v9b_link_edit.png`、`/tmp/basev/v9b_link_saved.png` |
| 第九轮 · 操作记录（审计）面板 | `/tmp/basev/v11_audit.png` |
| 第十轮 · 记录详情「可见范围」下拉（两行选项不重叠） | `/tmp/basev/v13_scope_select.png` |
| 第十轮 · 新建视图（视图名 + 可见范围） | `/tmp/basev/v12_view_create.png` |
| 第十轮 · 视图配置「仅保存为我的偏好」 | `/tmp/basev/v14_view_settings_personal.png` |
| 第十轮 · 个人偏好生效（管理员隐藏「客户名称」） | `/tmp/basev/v14_admin_personal.png` |
| 第十轮 · 访客视角（共享配置未被污染） | `/tmp/basev/v14_viewer.png` |
| 第十一轮 · 记录可见范围「指定成员可见」 | `/tmp/basev/v15_scope_custom.png` |
| 第十一轮 · 审计面板（筛选条 + 加载更多） | `/tmp/basev/v15_audit.png` |
| 第十一轮 · 字段权限（不可见成员 / 只读成员） | `/tmp/basev/v15_perm_dialog.png` |
| 第十二轮 · 审计面板（操作者 / 记录 ID / 时间快捷 / 导出） | `/tmp/basev/v16_audit.png` |
| 第十二轮 · 审计按记录前缀筛选后 | `/tmp/basev/v16_audit_filtered.png` |
| 第十二轮 · 审计导出反馈 | `/tmp/basev/v16_audit_export.png` |
| 第十二轮 · 记录详情「按角色批量授权」 | `/tmp/basev/v16_grants_quick.png` |
| 第十三轮 · 工具栏「共享 / 仅我」作用域控件 | `/tmp/basev/v18_scope.png` |
| 第十三轮 · 筛选弹窗「仅我」范围提示 | `/tmp/basev/v18_query_panel.png` |
| 第十四轮 · 工具栏「叠加共享条件」开关（开） | `/tmp/basev/v19_combine.png` |
| 第十四轮 · 工具栏「叠加共享条件」开关（关） | `/tmp/basev/v19_override.png` |
| 第十四轮 · 筛选弹窗叠加口径提示 | `/tmp/basev/v19_panel_and.png` |
| 第十五轮 · 网格「按条件隐藏」占位 | `/tmp/basev/v20_grid_conditional.png` |
| 第十五轮 · 字段权限弹窗「条件可见」 | `/tmp/basev/v20_perm_dialog.png` |
| 第九轮 · 字段权限弹窗 | `/tmp/basev/v11_perm_dialog.png`、`/tmp/basev/v11c_perm_set.png` |
| 第九轮 · 字段行「权限」标签 | `/tmp/basev/v11c_field_perm_tag.png` |
| 第九轮 · 表格视图回归（10 列 / 72 单元格 / 无报错） | `/tmp/basev/v11_grid.png` |
| 第十六轮 · 表配置弹窗（导出页） | `/tmp/base_cfg_dialog.png` |
| 第十六轮 · 表配置包摘要（字段 10 / 视图 4 / 公式 1） | `/tmp/base_cfg_export.png` |
| 第十六轮 · 表配置导入成功 | `/tmp/base_cfg_import.png` |
| 第十六轮 · 表配置「合并到已有表」 | `/tmp/base_cfg_merge_form.png`、`/tmp/base_cfg_merge_done.png` |
| 第十七轮 · 工具栏单行（1280 宽） | `/tmp/tb_1280.png`、`/tmp/tb_1280_full.png` |
| 第十七轮 · 表头空名兜底「未命名字段」 | `/tmp/hdr_empty_name.png` |
| 第十八轮 · 「共享 / 仅我」错位修复（首段选中） | `/tmp/scope4_共享.png` |
| 第十八轮 · 「共享 / 仅我」错位修复（末段选中） | `/tmp/scope4_仅我.png` |

### 3.71 盘点修订：视图创建对话框补齐 `calendar` / `gallery`

- 现象：后端已支持 6 种视图，但前端「新建视图」对话框只列 4 种，
  日历视图 / 画廊视图**界面上无法创建**。
- 修订：`panels/BaseViewCreateDialog.vue` 的 `TYPE_OPTIONS` 补齐为 6 种，
  与后端 `ValidViewTypes` 一致，并补 `hint` 文案。
- 实测：对话框显示 6 个选项；「日历视图」「画廊视图」创建均 `201`，
  画廊卡片正确显示关联合同标签。截图 `/tmp/basev/probe_画廊视图.png`。
- 清理：测试产生的两个视图已 DELETE，演示空间只剩
  「表格视图 / 看板视图 / 画廊视图 / 日历视图 / 我的私密视图」。
- 门禁：`go build ./...` + `go test ./...` 全绿；`vitest` 2020 passed / 6 failed
  （6 个全在 `rte/**`，与基线一致）；`vue-tsc` 62 errors（基线一致）；
  `vite build` 通过。

### 3.72 批次 E：公式函数库 44 个、系统字段 4 种、XLSX 导出（技术方案第 43 章）

- **公式函数 14 → 44**：新增 30 个（时间 8 / 文本 11 / 数值 5 / 容错 5 / 分支 1）。
  同步改造求值器签名（`compute(ctx, args)`，时间可注入）与 `IFERROR` 真吞错。
  - 单测：`internal/base/formula_ext_test.go` 8 例（函数表覆盖 / 文本 / 时间 / 数值 /
    容错 / 判定与分支 / 解析器接受 / 错误参数），全部通过。
  - 前端：`fields/formulaFunctions.ts` 目录与后端数量一致（44），由
    `formulaFunctions.test.ts` 守护（4 例全绿）。
- **系统字段 4 种**：`created_at` / `updated_at` / `created_by` / `updated_by`，
  只读、由服务端维护、值落 `base_record_values` 投影（可筛选可排序）。
  - 实测（演示空间「客户管理」表）：新建 4 个字段均 `201`；
    3 条历史记录回填 `创建时间 = 2026-11-27 10:37:23 / 10:37:16`（原创建时刻）、
    `创建人 = 03cdd7ce-…`、`更新时间 = 2026-11-27 11:04:08`（最后一次人工编辑时刻）。
  - 公式可引用系统字段：`YEAR({创建时间})` → `2026`（截图 `/tmp/basev/p2_base.png`）。
  - 客户端伪造值被忽略；系统字段与普通字段之间的类型迁移被拒绝。
  - 顺带修掉「系统重算会刷新 `updated_at`」的既有缺陷（`Updates` → `UpdateColumns`）。
- **XLSX 导出**：新增零依赖生成器 `src/modules/base/export/xlsx.ts`。
  - 浏览器实测下载 `客户管理.xlsx`（8791 字节），
    `zipfile` 校验 6 个部件齐全、CRC 全通过、`sheet1.xml` / `workbook.xml` XML 格式良好。
  - 导出弹窗新增「Excel（XLSX）」分段项（截图 `/tmp/basev/p4_export_xlsx.png`）。
- **公式函数面板**：公式弹窗新增「函数库」（分组 + 等宽胶囊 + tooltip），
  点击 `COALESCE` 实测插入 `COALESCE(`（截图 `/tmp/basev/p5_formula.png`）。
- **门禁**：`go build ./...` + `go test ./...` 全绿；
  `vitest` 2038 passed / 6 failed（6 个全在 `rte/**`，基线一致，新增 18 例全绿）；
  `vue-tsc` 62 errors（基线一致）；`vite build` 通过。

### 3.73 批次 F：飞书多维表格（Bitable）视觉规范层（技术方案第 44 章）

- **新增主题层**：`src/modules/base/feishu.css`（约 560 行），令牌 `--fs-*` 定义在 `:root`，
  在 `BaseEngineView.vue` 中于 `base.css` 之后导入，**不改全局 `telegram.css`**。
- **界面飞书化**：
  - 标题条 52px 白底 + `#DEE0E3` 下边线；工具栏 48px，按钮去 Telegram 药丸容器，
    改飞书式「图标 + 文字 / 无边框 / hover 灰底 / 6px 圆角 / 30px 高」，
    已生效条件为浅蓝底蓝字，「新增记录」实心 `#3370FF`。
  - 视图标签选中态改「加粗 + 底部 2px `#3370FF` 下划线」。
  - 表格：表头 `#F7F8FA`、行高恒定 40px、单元格 `padding 0 12px`、
    行分隔 `#EFF0F1`、竖线 `#DEE0E3`、hover `#F7F8FA`、选中格 `#3370FF` 描边。
  - 数值 / 金额 / 百分比 / 评分列右对齐；单选多选改飞书柔和标签（8 色定色）；
    日期次要色；人员与创建人 / 更新人显示**姓名**（新增 `fields/userNames.ts`）。
  - 看板 / 日历 / 画廊：分组列去底色、计数灰底徽标、卡片 1px `#DEE0E3` + 6px 圆角、
    悬停边框转主色、日历事件浅蓝底蓝字。
  - 弹窗 / 抽屉：8px 圆角 + `0 8px 24px rgba(31,35,41,.12)`、白底、
    头尾 `#EFF0F1` 分隔、底部按钮 6px 圆角主色；抽屉左边框 `#DEE0E3`。
- **实测 DOM 数值**：行高全部 `40px`（改造前 57 → 45 → 40）；表头底 `rgb(247,248,250)`；
  单元格 padding `0px 12px`；视图下划线 `2px / rgb(51,112,255)`；
  工具栏按钮高 `30px` / 圆角 `6px` / 文字 `rgb(100,106,115)`；
  弹窗圆角 `8px`、宽 620 / 720px；抽屉宽 `440px`；选项标签高 `20px` / 圆角 `4px`；
  表格 / 看板 / 画廊 / 日历切换均 **console 0 error**。
- **截图**：`/tmp/basev/g1_table.png`、`g2_drawer.png`、`g3_viewsettings.png`、
  `g4_filter.png`、`h_看板.png`、`h_画廊.png`、`h_日历.png`。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2050 passed / 6 failed（6 个全在 `rte/**`，基线一致）；
  `vue-tsc` 62 errors（基线一致）；`vite build` 通过。

### 3.74 批次 G：列头操作菜单 + 飞书交互补齐（技术方案第 45 章）

- **列头操作菜单**（新增 `src/modules/base/grid/BaseColumnMenu.vue`）：
  hover 列头出现 ▾，菜单含升序 / 降序 / 清除本列排序 / 筛选此列 / 冻结到左侧 /
  隐藏此列 / 编辑字段 / 列宽；面板 `248px`、白底、8px 圆角、
  `0 8px 24px rgba(31,35,41,.12)` 投影。
  - 弹层显隐**受控**（`v-model:visible`）：修掉「排序后列头重渲染导致第二次点击变成关闭」的坑。
  - 动作落库：排序 → `sorts` + `runQuery` + `persistViewConfig`；
    筛选此列 → 打开面板并预置该字段（`focusFieldId`）；
    冻结 / 隐藏 / 列宽 → 写个人偏好段（识别不到用户则拒绝写入并提示）；
    编辑字段 → 打开字段管理并滚动定位 + 高亮该行。
- **实测**：升序后数据按拼音序重排；排序标记主色 `rgb(51,112,255)` / `12px`，
  「清除本列排序」后标记数归 `0`；筛选此列弹窗预置 `更新人 / 包含`；
  编辑字段高亮 `1` 行；隐藏此列后表头列数 `38 → 36`；
  记录列表摘要显示 `创建时间 … · 创建人 Demo`（人名 / 记录标题，不再 UUID）；
  **console 0 error**。
- **其它补齐**：表头类型图标灰化 + 类型提示；记录列表卡片化；单元格长文本 tooltip；
  附件缩略图 32×32 / 4px；聚焦单元格描边改 `#3370FF`；加载骨架 8 行；
  表格空态（vxe `#empty`）与引擎空态去重；底部「+ 新增记录」条常驻可见。
- **测试**：新增 `BaseColumnMenu.test.ts` 4 例（菜单项齐备 / 已排序多一项 /
  动作冒泡带字段 ID / 已冻结文案切换）；`BaseGrid.test.ts` 同步改为「灰图标 + 类型提示」契约，
  并补 1 例（列头有 ▾ 入口）。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2055 passed / 6 failed（6 个全在 `rte/**`，基线一致）；
  `vue-tsc` 62 errors（基线一致）；`vite build` 通过。

### 3.75 批次 H：列宽拖拽 / 单元格右键菜单 / Tab 导航（技术方案第 46 章）

- **列宽拖拽把手**（自研）：vxe `resizable` 只改内部列宽、无法落库到视图个人偏好，
  故关掉 vxe 把手改为列头右侧 7px 自研把手；`dragWidths` 跟手，
  松手 `emit('column-width')` → 写 `config.personal[uid].fieldWidths`；
  宽度夹取 `[80, 600]`；hover 显示 2px 竖线，hover 把手变主色。
- **单元格右键菜单**（飞书同款，9 项）：复制单元格 / 粘贴到此处 / 清空内容 / 打开记录详情 ‖
  按此列升序 / 按此列降序 / 筛选此列 ‖ 冻结此列 / 隐藏此列；
  右键即把焦点移到该格；先落位后按实测尺寸**回夹**到窗口可视区；
  点击外部 / `Esc` / 滚动 / 缩放均收起。
- **Tab 导航**：新增 `moveFocusLinear()`，到行尾回下一行首格、`Shift+Tab` 回上一行末格，
  边界行停住不丢焦点。
- **实测**：菜单面板 `200px` / 圆角 `8px` / 投影 `rgba(31,35,41,.12) 0 8px 24px` / 白底；
  `Esc` 与点击外部后菜单节点数均为 `0`；列宽 `140 → 220` 并落库
  （`personal[uid].fieldWidths` 出现 `220`）；Tab 焦点从 `2026-11-27 10:37:23` 跳到 `主合同C`；
  **console 0 error**。
- **测试**：`BaseGrid.test.ts` 新增 3 例（Tab/Shift+Tab 焦点流转、右键菜单项齐备 + 外部点击收起、
  拖拽把手冒泡 `column-width` 且宽度落在区间内），共 6 例通过。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2063 passed / 6 failed（6 个全在 `rte/**`，基线一致）；
  `vue-tsc` 62 errors（基线一致）；`vite build` 通过。

### 3.76 批次 I：列顺序拖拽 / 表头右键菜单 / 列宽自适应 / 列序稳定化（技术方案第 47 章）

- **列顺序拖拽**：视图**个人偏好段**新增 `fieldOrder`（字段 ID 数组），
  表头 `draggable` + `dragover` 判定插前 / 插后 + `drop` 抛 `column-reorder`，
  落库后刷新仍保持；不在顺序表里的新字段排在最后，不会消失。
  - 坑：`dragover` **必须 `preventDefault()`**，否则浏览器不派发 `drop`。
  - 冻结列保持「从左起连续」，冻结段内禁止拖动（提示「冻结列已固定在左侧」）。
- **表头右键菜单**：复用批次 H 的 `.be-ctxmenu` 浮层，菜单项按入口切换；
  菜单项抽成 `ctxItems`（`key/label/icon/sep/run`），模板统一 `v-for`。
- **双击列宽把手**：按列内容估算宽度（中文 13px / 其它 7px + 内边距），
  夹取 `[80,600]`；表头右键「自动适应列宽」同源。
- **列序稳定化（缺陷修复）**：历史字段 `sort_order` 相同导致每次刷新列顺序都变；
  服务端改 `ORDER BY sort_order ASC, created_at ASC, id ASC`，
  前端 `sortFields` 增加 `name.localeCompare('zh-Hans-CN')` 兜底。
- **实测**：拖拽落点指示线 `2px` / `rgb(51,112,255)`；被拖表头 `is-dragging`；
  第 3 列拖到首位后表头顺序变化；`personal[uid].fieldOrder` 写入 17 个字段 ID；
  刷新后顺序保持；表头右键 7 项；双击列宽 `140 → 114` 并落库；**console 0 error**。
- **测试**：`BaseGrid.test.ts` 新增 3 例（`fieldOrder` 排序生效、表头右键菜单项齐备 +
  外部点击收起、双击把手冒泡 `column-width` 且宽度在区间内），共 9 例通过。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2066 passed / 6 failed（6 个全在 `rte/**`，基线一致）；
  `vue-tsc` 62 errors（基线一致）；`vite build` 通过。

### 3.77 批次 J：XLSX 导入 + 记录级授权有效期 / 按部门授权（技术方案第 48.1~48.2 节）

- **XLSX 导入（零依赖）**：`src/modules/base/import/xlsx.ts` 自研 ZIP + XML 解析，
  支持 STORE / DEFLATE、sharedStrings / inlineStr / 布尔 / 数字 / 日期（含 1900、1904 日期系统）；
  `BaseImportDialog` 支持多工作表切换。
  - 测试：`xlsx.test.ts` 3 例（自建 ZIP，覆盖两种压缩方式）全绿。
  - 坑：中央目录条目必须带 `nameBytes`；ReadableStream 上没有 `getWriter`。
- **记录级授权有效期 + 按部门授权**：
  - `base_record_grants` 增加 `subject_type / subject_id / expires_at`（迁移 + 回填 + 索引）；
  - 部门授权用派生伪 ID 复用唯一索引；部门名在 Go 侧解析，**不写进 SQL**（影子库无 `core_users`）；
  - 新接口 `GET /base/departments`；
  - 前端授权区改为「名单 + 有效期 + 部门」，显示走本地时间、回写走 ISO。
  - 测试：`grant_subject_test.go` 2 例（过期后不可见 / 部门授权可见 + 部门列表）通过。
- **实测（DOM 数值）**：
  - 授权项 `tag=部门`、`name=部门：销售部`、有效期输入框 `2026-12-31 23:20:06`；
  - 落库 `base_record_grants.subject_type='department'`、`subject_id='销售部'`、
    `expires_at=2026-12-31 15:20:06+00`（= 本地 23:20:06，时区口径一致）；
  - 提示「已设为指定成员可见（1 项）」。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2069 passed / 6 failed（6 个全在 `rte/**`，基线一致）；`vue-tsc` 62 errors（基线）；`vite build` 通过。

### 3.78 批次 K：跨 Base 关联 / 候选分页 / 自定义排序 keyset / SSE 增量 / 策略独立表 / OR 叠加 / 反向关系表（技术方案第 48.3~48.9 节）

- **跨 Base 关联**：link 字段允许指向**同一空间**下的任意 Base；
  校验链 = 记录存在 → 表存在 → Base 属于同一 project → 记录对操作者可见；
  Base 元信息缺失时退回「同 Base 才允许」。
- **link 候选分页**：`GET /link-targets` 改为 `{items, nextCursor, hasMore}`，
  游标 = `sort_order:id`（keyset），支持 `keyword` 远程搜索与 `targetTableId` 跨表；
  前端下拉底部「加载更多」续拉。
- **自定义排序 keyset**：单文本 / 单数字排序字段走 `k2:` 游标，
  锚点 = (排序值, sort_order, id)；NULL 行按 `NULLS LAST` 单独处理，避免重复与漏行。
  - 测试：`TestQuerySortKeysetPaging` 通过（2 条/页翻完 5 条，顺序 10→50，无重复无遗漏）。
- **SSE 增量**：`ReplaySinceTime` + `?since=<RFC3339>`；与 `Last-Event-ID` 并存。
- **字段策略独立表**：`base_field_policies` 建表 + 回填存量 + 字段增删改**双写**；
  读取以表为准，表空则回落 config。
- **查询 OR 叠加**：组合口径扩到 `override | and | or`；工具栏改为三段按钮组。
- **反向关系独立表**：`base_record_reverse_links` 与 `base_record_links` 双写，
  反查优先走索引表，查不到退回旧的全表扫描。
- **实测**：`GET /base/departments` → `["销售部"]`；
  `GET /link-targets?limit=3` → `{"items":[…3 条…],"nextCursor":"3:22dc337a-…","hasMore":true}`。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；前端门禁同 3.77。

### 3.79 批次 L：行级重试 / 批量拖拽 / 压测扩容 / 包加密 + 幂等调度（技术方案第 48.10~48.13 节）

- **行级重试与类型转换**：导入前类型预检（数字列非数字直接拦下并指出「第 N 行 · 列名」）；
  失败行进入**行内修正表**，逐格可改，「修正后重试」只提交失败行并把返回行号映射回原始行。
  - 实测：导入 `客户名称,阶段` 两列 CSV，阶段值非法 → 失败明细「第 1 行 … unknown option: 不存在的阶段」，
    修正区 1 行 2 个输入框；改成合法选项后「修正后导入成功 1 条」，失败明细清空。
  - 调试数据已清理（两条临时记录已删除）。
- **批量拖拽排序**：行首拖拽把手（hover 出现，`16×20`，`cursor: grab`）；
  拖选中集合 = 整批移动；落点按行内上下半区判定前 / 后，`2px` 蓝色指示线。
  - 实测：DOM 内把手 8 个（vxe 固定列渲染两份），hover 后 `opacity: 1`、`cursor: grab`。
- **压测扩容**：`cmd/loadtest` 新增 `-scale small|medium|large`
  （1000 行/10 并发、2000 行/25 并发、5000 行/50 并发）、`-deep-pages`、`-batch-size`；
  连接池提升到 64；新增「深翻页」「批量写入」两个场景。
- **配置包 AES-GCM 加密**：PBKDF2-HMAC-SHA256（12 万次）+ AES-256-GCM，AAD 固定；
  口令 < 8 位拒绝；新增 `config-export-encrypted` / `config-import-encrypted` 两个接口。
  - 测试：`configbundle_crypt_test.go` 2 例（往返还原、口令错误失败、短口令拒绝）通过。
- **幂等清理调度**：`StartIdempotencyPurge` 每小时清理过期幂等记录，
  周期由 `BASE_IDEMPOTENCY_PURGE_INTERVAL` 覆盖；服务启动时拉起。
- **门禁**：`go build ./...` + `go test ./internal/base/...` 全绿；
  `vitest` 2069 passed / 6 failed（`rte/**` 基线）；`vue-tsc` 62 errors（基线）；`vite build` 通过。

### 3.80 批次 M：可观测性与工程化补齐（待补齐清单 18 项全交付）

> 对应技术方案第 49 章。18 项 = P0 4 项 / P1 5 项 / P2 9 项，全部实现并通过门禁。

#### 3.80.1 逐项销项

| 编号 | 事项 | 状态 | 落点 |
| --- | --- | --- | --- |
| P0-1 | 只读 GET（Base / 记录 / 视图） | ✅ | `internal/base/read.go`；`GET /base/bases/:baseId`、`GET /base/records/:recordId`、`GET /base/views/:viewId` |
| P0-2 | 视图查询接口 | ✅ | `POST /base/views/:viewId/query`（视图配置为默认口径，请求体可覆盖） |
| P0-3 | 事件类型补齐（5 → 10） | ✅ | `record.batch_updated` / `field.created` / `field.updated` / `field.deleted` / `view.updated` / `formula.calculated` / `schema.changed` |
| P0-4 | 字段类型迁移可回滚 | ✅ | `reindexTableTx` 同事务重建投影；同步推进 `base_apps.schema_version` |
| P1-5 | 异步导入任务 | ✅ | `internal/base/importjob.go` + `base_import_jobs` 表 + 4 个接口 + worker + 卡死任务恢复 |
| P1-6 | 可观测性指标 | ✅ | `internal/base/metrics.go`；`GET /base/metrics`、`GET /base/metrics/prometheus`（P50/P95/P99、慢查询、outbox、幂等冲突、订阅数） |
| P1-7 | 连接池 30 → 50 | ✅ | `DB_MAX_OPEN_CONNS` 默认 50，纳入分层配置 |
| P1-8 | 跨实例事件 | ✅ | Outbox 共享总线 + 每实例 `outboxCursor` 水位 |
| P1-9 | 字段类型兼容路径 | ✅ | `GET /base/fields/types` 与 `/base/field-types` 同源 |
| P2-10 | FieldHandler 扩展 | ✅ | `internal/base/fieldhandler_ext.go`：`RichFieldHandler`（Serialize / Deserialize / BuildFilter / BuildSort）+ `defaultRichHandler` 兜底，行为不变 |
| P2-11 | tenant_id 显式化 | ✅ | 17 张 `base_*` 表加 `tenant_id` + `ensureBaseTenantID` 回填 + 17 个租户索引 |
| P2-12 | 租户级动态限流 | ✅ | `internal/middleware/ratelimit.go` 重写：租户桶 + 用户桶 + `SetQuotaResolver`；按 `kb_members` 动态放大（上限 `BASE_TENANT_SCALE_MAX`，默认 8） |
| P2-13 | 操作日志归档 | ✅ | `internal/base/maintenance.go`：`ArchiveOperationLogs` / `PurgeOutbox` / `PurgeImportJobs` / `StartMaintenance` |
| P2-14 | Outbox 死信与重试 | ✅ | `OutboxStatusDead` + `GET /base/outbox/dead-letters` + `POST /base/outbox/dead-letters/:eventId/retry` + `metamatrix_base_outbox_dead_total` |
| P2-15 | user_group 字段 | ✅ | `base_user_groups` 表 + 4 个接口 + `FieldUserGroup` 类型 + 成员校验 |
| P2-16 | 分层 YAML 配置 | ✅ | `configs/{default,dev,prod}.yaml` + `internal/config/layered.go`（default → `${APP_ENV}` → 环境变量） |
| P2-17 | Base 专项 E2E | ✅ | `pros/web/scripts/base-engine-e2e.mjs`（27 项断言，跑完自动清理 E2E 空间） |
| P2-18 | 并发 / 顺序验收 | ✅ | `internal/base/event_order_test.go`：乱序归一化、版本号单调、公式事件时序 |

#### 3.80.2 E2E 实测输出（27 项全 PASS）

```
PASS 创建空间 / 创建 Base / 默认数据表已播种 / 创建文本字段 / 创建 user_group 字段
PASS 新建通讯录分组 / 分组列表可读 / 修改通讯录分组
PASS 创建记录 / GET 记录详情 / GET Base 详情 / 创建视图 / GET 视图详情
PASS POST 视图查询 / 视图查询支持覆盖筛选
PASS 提交异步导入任务 — status=pending
PASS 导入任务跑完 — status=succeeded succeeded=25/25
PASS 导入任务列表可读
PASS 指标快照可读 — p95=13.99ms outboxPublished=30 outboxDead=0
PASS 字段类型含 user_group — 26 种类型
PASS 兼容路径 /fields/types 可用 / 死信列表可读 / 删除通讯录分组
PASS 浏览器打开空间页面并截图 / 页面无 JS 报错
PASS 清理 E2E 空间
```

截图：`/var/folders/79/7p7x5gyx04lcn5yq6r6hhq_m0000gn/T/metamatrix-base-e2e/base-knowledge.png`

#### 3.80.3 门禁实测

| 门禁 | 结果 |
| --- | --- |
| `cd pros/api && go build ./...` | ✅ 通过 |
| `cd pros/api && go test ./internal/...` | ✅ 全绿（含 `internal/model` / `internal/db` 表名守卫测试） |
| 真实 Postgres 并发/顺序用例（`TestConcurrency*` / `TestEventOrder*` / `TestTenant*`） | ✅ 通过 |
| `cd pros/web && npx vitest run` | 285 passed / 6 failed —— 6 个失败文件全部在 `rte/**`，与基线一致 |
| `cd pros/web && npx vue-tsc -b --pretty false` | 62 errors —— 全部为基线文件（`rte/**` + `FdeSheetCanvas.vue` + `LaunchSplash.vue`），**`modules/base` 0 错误** |
| `node scripts/base-engine-e2e.mjs` | ✅ 27/27 PASS |

#### 3.80.4 数据库实测

- 17 张 `base_*` 表全部含 `tenant_id uuid NOT NULL DEFAULT 零值`，且 `idx_<table>_tenant` 索引齐备；
- 存量数据回填后 `base_apps / base_tables / base_fields / base_records / base_record_values /
  base_views / base_record_links / base_field_formulas / base_formula_dependencies /
  base_user_groups / base_import_jobs` 的**零值 tenant 行数均为 0**；
- 回填过程中清掉 2 行**孤儿派生数据**（指向已删除 field / table 的公式行）。
- 新增表：`base_import_jobs`、`base_user_groups`（均已在 `internal/model/table_registry.go` 登记）。

#### 3.80.5 本批次修掉的真实缺陷（源码走查 + 实测暴露）

1. **`tenant_id` 回填静默失效** —— 回填条件只判 `IS NULL`，但列是 `NOT NULL DEFAULT 零值`，
   `IS NULL` 永不匹配；且 `UPDATE ... FROM` 下同名列不限定别名会报 `column reference is ambiguous`。
   两处均已修复，存量数据已回填完毕。
2. **Postgres 事务中毒** —— `syncFieldPolicy` / `writeEventOptional` / `syncRecordLinks` /
   `recomputeFormulas` 原本「吞错误」，但 Postgres 中一条失败语句会毒死整个事务，
   后续语句全部 `current transaction is aborted`。改为**先 `HasTable` 判断表存在再执行**。
3. **跨空间越权** —— `loadTableSchema` / `scopeLoadRecord` 补租户校验
   （Base 属于别空间 → 按不存在处理；孤儿表放行）。
4. **E2E 脏数据残留** —— 脚本每次运行新建一个空间且不清理；已加末尾自动删除，
   并清理了历史残留的 2 个 `Base E2E 空间`。
5. **回填链路对 `project_id` 为零值的脏数据失效** —— `base_record_reverse_links` 的
   `project_id` 自身是零值，走 `project_id → tenant_id` 回填必然仍是零值；
   改为「优先经 `base_apps` 关联取租户」，反向关系表额外走「源记录 → 记录 → 表 → 空间」链路。
6. **空间删除不清理多维表格数据** —— `ProjectsService.Delete` 只清画布文档，`base_*` 整片残留，
   导致多维表格列表出现孤儿 Base、租户统计失真、`tenant_id` 回填找不到归属。
   新增 `deleteProjectBaseData` 级联硬删 + 用例 `TestProjectsServiceDeleteRemovesBaseData`（8 张表逐一断言）。

#### 3.80.6 本批次未做 / 需用户承担的风险

- **未做** 5000 行 / 50 并发的完整实跑压测（`cmd/loadtest` 已具备该档位，但本轮未实际执行到该规模），
  只做了 E2E + 单元 + 并发用例验证；
- **远端库（101.132.237.173）未执行** 本批次的迁移
  （`base_import_jobs` / `base_user_groups` 建表 + `tenant_id` 列与回填）；
- **未提交 git、未推 main、未同步远端服务器**（按约定）；
- 已知基线噪声未消除：`vue-tsc` 62 errors、`vitest` 6 个 `rte/**` 失败文件（与本轮改动无关）。

### 3.81 批次 M · 运行时取证审计（18 项逐项行为证明）

> 上一节 3.80 证明的是「18 项都实现了」；本节证明的是「**每一项的行为真的成立**」，
> 包含**负向断言**（越权被拒 / 不兼容迁移被拒 / 超限返回 429 / 事件真的推出来）。
> 这一步额外暴露并修掉了 1 个真实缺陷（死信重投实际不投递）。

#### 3.81.1 审计脚本

`pros/web/scripts/base-engine-audit.mjs`（`npm run test:e2e:base:audit`）——
与 `base-engine-e2e.mjs` 的分工：

- `base-engine-e2e.mjs`：**功能能不能用**（建 Base / 建字段 / 导入 / 视图查询 / 浏览器冒烟）；
- `base-engine-audit.mjs`：**每项承诺的行为是否真的成立**（含负向断言）。

#### 3.81.2 审计输出（27 项全 PASS，含 4 项负向断言）

```
PASS P0-1 GET /bases/:baseId — status=200
PASS P0-1 GET /records/:recordId — status=200
PASS P0-1 GET /views/:viewId — status=200
PASS P0-1 跨空间读记录被拒 — status=404          ← 负向断言
PASS P0-2 POST /views/:viewId/query — records=1
PASS P0-2 视图查询支持覆盖筛选 — 命中=1
PASS P0-3 事件含 record.created — schema.changed,field.created,record.created
PASS P0-3 事件含 field.created / schema.changed
PASS P0-4 字段类型迁移成功 — status=200
PASS P0-4 不兼容迁移被拒或安全完成 — status=422 {"code":"42202",...}   ← 负向断言
PASS P0-4 迁移后数据仍可读 — records=1
PASS P1-5 提交导入任务 — status=202
PASS P1-5 导入任务跑完 — status=succeeded ok=2
PASS P1-5 导入任务列表可读 — n=1
PASS P1-6 GET /base/metrics — operations,errors,slowQueries,p50Millis,p95Millis,p99Millis,
                               slowThresholdMillis,outboxPublished,outboxFailed,outboxDead,
                               idempotencyConflicts,activeSubscribers
PASS P1-6 Prometheus 格式 — # HELP metamatrix_base_operations_total ...
PASS P1-9 /fields/types 与 /field-types 同源 — 26/26
PASS P2-10 扩展后排序查询仍正常 — records=3
PASS P2-12 超限返回 429 — 命中 429                                        ← 负向断言
PASS P2-14 死信列表可读 — n=0
PASS P2-15 通讯录分组增查 / user_group 字段可建 / 分组可删
PASS P2-11 空间可删 — status=200
ALL PASS
```

> `P0-4` 的负向断言实测返回 `42202 field type incompatible`，
> 且迁移后 `records=1` 仍在 —— 证明「拒绝迁移」没有破坏存量数据。

#### 3.81.3 其余 4 项：真实 Postgres 用例覆盖

| 项 | 用例 | 实测 |
| --- | --- | --- |
| P1-7 连接池 | `internal/db/pool_test.go::TestConnectWithPoolAppliesConfiguredLimits` | 默认 `MaxOpenConnections=50`；环境变量 `DB_MAX_OPEN_CONNS=17` 生效；`PoolOptions{64}` 生效 |
| P1-8 跨实例事件 | `internal/base/cross_instance_event_test.go::TestCrossInstanceEventDeliveredToOtherInstance` | 实例 A 写事件 → 实例 B 的订阅者收到（`eventId` / `eventType` / `projectID` 全对）；再拉一次**不重复投递**（水位单调） |
| P2-14 死信重投 | `internal/base/deadletter_test.go::TestDeadLetterRetryIsActuallyRedelivered` | 重投后 `status=pending`、`retry_count=0`、`created_at` 已刷新 → 订阅者**真的收到** → 状态回到 `published` |
| P2-16 分层配置 | `internal/config/layered_priority_test.go::TestLayeredConfigPriority` | 环境层(77) > 基础层(50)；环境变量(123) > 环境层；切 `APP_ENV=dev` 得 11；YAML 写坏退回代码默认值(50) |

#### 3.81.4 审计暴露并修掉的真实缺陷（1 个）

**死信重投实际不会投递**：`RetryDeadLetter` 原本只把 `status` 改回 `pending`，
但发布器按「时间 + ID」水位**单调向前**读事件（`readOutboxSince`），已读过的行不会再被读到 ——
死信因此会永远卡在 `pending`，**接口返回成功但事件永远不会送达**。

修复：`RetryDeadLetter` 同时把 `created_at` 刷成当前时刻（重新进入水位窗口）、
`retry_count` 归零、`published_at` 清空，`id` 不变（订阅端不会当新事件重复处理）。
回归用例 `TestDeadLetterRetryIsActuallyRedelivered` 锁住该行为。

#### 3.81.5 门禁复测（含本轮新增 3 个 Go 用例）

| 门禁 | 结果 |
| --- | --- |
| `go build ./...` | ✅ |
| `go test ./internal/...` | ✅ 全绿（含 `internal/model` / `internal/db` 表名守卫） |
| 真实 Postgres 专项（并发 9 + 事件顺序 3 + 租户 1 + 跨实例 1 + 死信 1 + 连接池 1 + 分层配置 1） | ✅ **17/17 PASS** |
| `npm run test:e2e:base:audit` | ✅ 27/27 PASS |
| `npm run test:e2e:base` | ✅ 27/27 PASS |
| `vitest` | 285 passed / 6 failed（`rte/**` 基线） |
| `vue-tsc` | 62 errors（全部基线文件，`modules/base` 0 错误） |
| `vite build` | ✅ |

### 3.82 批次 M 前端接线：18 项从「有接口」变成「能真用」

> 上一节证明了 18 项后端行为成立；本节补上一个此前被忽略的事实：
> `src/modules/base/api.ts` 里 15 个新函数**调用点全为 0** —— 全是死代码，
> 用户在界面上点不到任何一处。本节把四条链路接进界面并给出浏览器实测证据。

#### 3.82.1 前端接线清单

| 接口 | 界面落点 | 说明 |
| --- | --- | --- |
| `GET /base/metrics` | 运行监控 · 运行指标 | 10 张指标卡；P95 > 200ms / 有死信时卡片变色告警 |
| `GET /base/outbox/dead-letters` + `retry` | 运行监控 · 事件死信 | 死信列表 + 重投按钮，重投后刷新指标 |
| `GET/POST /base/import-jobs` + `cancel` | 运行监控 · 导入任务 | 进度条 + 状态标签 + 取消；运行中每 1.5s 轮询 |
| `GET/POST/PATCH/DELETE /base/user-groups` | 运行监控 · 通讯录分组 | 列表 + 新建 / 编辑 / 删除，成员下拉多选并翻译姓名 |
| `POST /base/tables/:id/import-jobs` | 导入弹窗「异步模式」 | ≥500 行建议开启；关窗后任务继续跑，进度在运行监控查看 |
| `GET /base/views/:viewId` | 切换视图时 | 列表配置先生效，服务端最新配置随后覆盖 |
| `GET /base/records/:recordId` | 记录抽屉「刷新最新值」 | 拉服务端最新一份并同步回列表 |
| `GET /base/bases/:baseId` | Base 设置「读取服务端最新信息」 | 读服务端权威状态而非前端缓存 |
| `POST /base/views/:viewId/query` | 主列表查询路径 | 生效口径 = 视图配置时走视图查询（服务端执行）；叠加个人条件时仍走表级接口 |

#### 3.82.2 浏览器实测（`npm run test:e2e:base:ops`，13 项全 PASS）

```
PASS 准备账号与空间
PASS 页面出现「运行监控」入口 — count=1
PASS 运行指标页签渲染出指标卡片 — 10 张卡片
PASS 指标卡片含延迟数值 — P50 延迟 3.9 ms
PASS 指标页签截图 — …/metamatrix-base-e2e/base-ops-metrics.png
PASS 事件死信页签可切换
PASS 导入任务页签可切换
PASS 新建通讯录分组后表格出现该分组 — 1 行
PASS 分组名称正确写入 — 分组名称 … 销售一部 … 编辑 删除
PASS 分组页签截图 — …/metamatrix-base-e2e/base-ops-groups.png
PASS 页面无 JS 报错
PASS 清理 E2E 空间
ALL PASS
```

- 实测中修掉的布局缺陷：「刷新」按钮在抽屉里被 flex 拉伸成整行（`.be-ops` 默认
  `align-items: stretch`），改为 `align-items: flex-start` + `.be-ops__section { width: 100% }`。
- 实测踩到的两个坑（已写进脚本，避免回归）：
  - 新用户首次进入会弹**启动引导**（`LaunchSplash`），它会拦截所有点击 → 脚本先点「跳过」；
  - 多维表格界面挂在知识库的 **sheet 类型节点**上，且节点带 `documentId` 时单击会走文档视图
    → 建节点时不传 `createDoc`，并点左侧树 `.kn-tree__node` 进入。

#### 3.82.3 门禁复测

| 门禁 | 结果 |
| --- | --- |
| `go build ./...` / `go test ./internal/... -count=1`（真实 PG） | ✅ 全绿 |
| `vitest` | 285 passed / 6 failed（`rte/**` 基线） |
| `vue-tsc` | 62 errors（全部基线文件），`modules/base` **0 错误** |
| `vite build` | ✅ |
| `npm run test:e2e:base` | ✅ 27/27 |
| `npm run test:e2e:base:audit` | ✅ 27/27 |
| `npm run test:e2e:base:ops` | ✅ 13/13 |

### 3.83 批次 N：写路径吞吐治理（死锁根因修复 + 往返数与行数脱钩）

> 批次 M 的 18 项交付后，用 `cmd/loadtest -scale large`（5000 行 × 20 字段 / 50 并发）
> 复测，发现**写路径整体不成立**：读路径全绿，但单条更新与批量写入全部超时。
> 本节记录取证、根因与治理结果。

#### 3.83.1 取证

| 证据 | 内容 |
| --- | --- |
| `pg_stat_activity` | 50 条 `idle in transaction`，最后一条语句是 `INSERT INTO "base_event_outboxes"` |
| `kill -QUIT <api-pid>` 的 Go 栈 | `BatchCreate.func1 → createRecordInTx → subjectOf → roleOf → spaceRoleWithError → Count` |
| 连接池 | `DB_MAX_OPEN_CONNS=50`，50 并发下每个请求实际要占 **2** 条 |

#### 3.83.2 三个根因与治理

| # | 根因 | 治理 |
| --- | --- | --- |
| 1 | **事务内发起走连接池的查询**（权限身份 / 字段校验）→ 事务占 1 条 + 查询再要 1 条，连接池打满即死锁 | 校验与身份解析全部移到事务开启之前；事务内只有纯写入语句 |
| 2 | **往返数与行数成正比**（投影 N+1、全库公式扫描、逐行重查 schema 与权限、逐行审计与事件 INSERT、无 link 字段也照删关系） | 引入 `writeIO` 共享上下文；投影批量写；公式按表过滤且整批只查一次；审计与事件攒批落库；无 link 字段跳过关系维护 |
| 3 | **`gorm.SavePoint` 在 pgx 下破坏事务连接复用**，且驱动吞掉错误（`SavePoint().Error` 恒为 nil） | 改用原生 `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` |

附带修正：删除 link 字段时一并清理其正反向历史关联，避免残留边被反查命中。

#### 3.83.3 治理结果

| 指标 | 治理前 | 治理后 |
| --- | --- | --- |
| 50 并发 × 500 行批量写入 | **全部超时（死锁）** | **3.9s 完成，0 错**（≈ 6,600 行/秒） |
| 50 并发单条 PATCH | **全部超时** | **211ms，P95 50ms，0 错** |
| 串行播种 5000 行 | 17.7s | **4.45s** |
| `loadtest -scale large` 全场景 | 写场景超时 | **8 个场景全部 0 错** |

`loadtest -scale large`（50 并发 / 每场景 15s）：

| 场景 | 请求数 | 错误数 | QPS | P95 | P99 |
| --- | --- | --- | --- | --- | --- |
| 首屏查询（100 条 × 20 字段） | 18158 | 0 | 1210.5 | 57ms | 70ms |
| 常规筛选（关键字） | 2309 | 0 | 153.9 | 607ms | 811ms |
| 视图配置读取 | 174999 | 0 | 11666.6 | 6ms | 8ms |
| 表结构读取 | 29144 | 0 | 1942.9 | 33ms | 39ms |
| 单条更新 | 18769 | 0 | 1251.3 | 50ms | 57ms |
| 批量 100 条编辑 | 912 | 0 | 60.8 | 889ms | 907ms |
| 深翻页（keyset 翻 20 页） | 18293 | 0 | 1219.5 | 57ms | 68ms |
| 批量写入（500 行/批） | 200 | 0 | 13.3 | 4.884s | 5.087s |

#### 3.83.4 回归用例（`internal/base/batch_deadlock_test.go`）

| 用例 | 作用 | 结果 |
| --- | --- | --- |
| `TestBatchCreateUnderTightPoolDoesNotDeadlock` | 连接池压到 4 条 + 8 并发批量写 | ✅ 0.24s（把「事务内查权限」加回去即 200s 超时） |
| `TestBatchCreatePartialUnderTightPoolDoesNotDeadlock` | 同上，覆盖「部分成功」路径 | ✅ 0.25s |
| `TestBatchWriteSortOrderIsUniqueWithinRequest` | 跨块 57 行写入后排序位唯一 | ✅ |

#### 3.83.5 门禁复测

| 门禁 | 结果 |
| --- | --- |
| `go build ./...` | ✅ |
| `go test ./internal/... -count=1`（真实 PG，`DATABASE_URL` 指向开发库） | ✅ 全绿（11 包） |
| `vitest` | 285 passed / 6 failed（`rte/**` 基线，与本轮无关） |
| `vue-tsc` | 62 errors（全部基线文件），`modules/base` **0 错误** |
| `vite build` | ✅ |
| `npm run test:e2e:base` | ✅ 27/27 |
| `cmd/loadtest -scale large` | ✅ 8 场景全部 0 错 |
