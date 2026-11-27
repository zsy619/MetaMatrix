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

### 第五轮增强（本次）

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

### 3.22 降级策略

- 迁移失败不再 500：`base_apps.migrated = failed:<原因>`，前端进入只读降级，
  继续渲染旧 JSONB 数据并提示原因（截图 `/tmp/base_legacy_fallback.png`）。

## 四、门禁结果

```bash
cd pros/api && go build ./... && go test ./internal/base/... ./internal/service/...   # 通过
cd pros/web && npx vitest run                                                       # 1928 passed / 6 failed（6 个失败文件与基线完全一致，均在 rte/**）
cd pros/web && npx vue-tsc -b --pretty false                                        # 62 errors（基线，全部在 rte/**）
cd pros/web && npx vite build                                                       # 通过
```

浏览器控制台：Base Engine 页面无 error / warning（仅浏览器自身的 Permissions policy 提示）。

## 五、已知限制

1. `doc` 字段仍按节点 ID 存储；关键字搜索与筛选条件都已支持按**文档标题**命中（见 3.16 / 3.17），
   但筛选面板的候选项只能来自当前空间的 doc / canvas 节点，不能跨空间引用。
2. 批量操作已支持「部分成功 + 失败明细」（见 3.18）；仍未做「失败项一键重试」。
3. 看板拖拽换组、日历拖拽改期、画廊卡片自定义字段均已落地（见 3.20 / 3.21）；
   日历视图仍不支持拖拽跨月、画廊仍不支持拖拽排序（缺一个稳定的排名字段）。
4. 关联文档支持「记录 → 文档」跳转，文档侧反向引用已实现（只反查 Base 记录，不反查正文里的内嵌块引用）。
5. 实时通道是 SSE，未做 WebSocket；事件协议兼容，可整体切换。
6. 未做压力测试（1000+ 行滚动、50 并发编辑）。
7. 附件沿用素材库策略：没有病毒扫描与类型白名单；文件名以 `url#name` 编码在字符串里，标题检索无法按文件名命中。
8. 粘贴为整格覆盖（不做类型智能转换，例如把「1,000」直接当数字写入会由服务端归一化处理）。

## 六、演示数据

演示空间：`多维表格演示`（`3f030ea3-61a5-4156-9b77-a9ca1d29d107`），演示表「客户管理」为旧版迁移而来，
含「客户名称 / 阶段 / 对接人 / 预算 / 签约日期 / 跟进事项 / 税额 / 关联文档」字段与 3 条记录。
第三轮新增演示字段「附件」（`ded9a95f-f8f9-4a4a-97d7-51442b83c565`），并在「星海科技」记录上保留 1 个示例附件
（素材库资产 `/media/dc20c847-1206-4697-a60d-e48e6e2cd6d3`，文件名 `sample.png`），用于演示附件字段。
验收脚本产生的其它临时数据（CSV 导入行、隐藏列状态、失败标记、拖拽/粘贴造成的字段改写）均已清理还原。

第五轮为验证日历拖拽新增了「日历视图」（`1bb03e1d-14af-4823-b7a4-5e60aab7c8cd`），
并给「画廊视图」配置了 `layout.galleryFields = [预算, 签约日期, 跟进事项]`（都是可回退的演示配置）。

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
| 第五轮 · 内嵌引用弹窗 | `/tmp/basev/v_embedders.png` |
| 第五轮 · 筛选面板（关联文档按标题） | `/tmp/basev/v_filter_doc.png` |
| 第五轮 · 日历视图拖拽 | `/tmp/basev/v_calendar.png`、`/tmp/basev/v_calendar_after.png` |
| 第五轮 · 画廊卡片自定义字段 | `/tmp/basev/v_gallery.png` |
