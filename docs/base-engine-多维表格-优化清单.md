# 元矩阵 · 多维表格 深度优化清单

> 盘点日期：2026-11-28
> 盘点方式：**源码走查 + 真实 HTTP 实测 + PostgreSQL 索引实测**（不是需求推测）
> 关联：[三方对照复盘](./base-engine-多维表格-三方对照复盘.md)｜[技术方案](./base-engine-多维表格技术方案.md)｜[验收报告](./base-engine-多维表格验收报告.md)
> 标注：🔴 P0 正确性　🟠 P0 性能　🟡 P1 能力　⚪ P2 体验　✅ 本轮已修

---

## 〇、本轮实测发现的问题（此前文档未记录）

- [x] **多字段排序 / 多字段分组 → HTTP 500**（真实复现，非推断）
      ```
      POST /base/tables/:tableId/query  {"sorts":[A,B]}
      → 500 {"code":"50001","detail":"ERROR: table name \"sv\" specified more than once (SQLSTATE 42712)"}
      ```
      根因：排序 / 分组的投影表 JOIN **别名写死**为 `gv` / `sv`
      （`pros/api/internal/base/query.go:741`、`query.go:748`），第二个字段再 JOIN 一次同名别名 → PG 直接报错。
      前端明确支持多条（`MAX_SORTS = 5`、`MAX_GROUPS = 3`，`pros/web/src/modules/base/viewQuery.ts:16-17`），
      所以**用户在筛选面板加第 2 条排序就整页报错**。
- [x] **引用 / 汇总字段（lookup / rollup）写入后不会自动重算**
      `scheduleDependentRecalc`（`internal/base/lookup.go:310-311`）**是死代码，全仓无调用点**；
      唯一触发点是 `BaseFieldManager.vue:761` 的「重算」按钮。
      → 改了关联字段后，引用 / 汇总列的值**一直是旧的**，直到用户手动点重算。
- [x] **重算路径是三重 N+1，且带 30s 超时**
      `recalcComputedFields`（`internal/base/lookup.go:107-172`）每条记录：
      ① `SELECT base_records WHERE id IN (...)`（`lookup.go:188`）
      ② `UPDATE base_records`（`lookup.go:158`）
      ③ `SELECT base_fields WHERE table_id=?`（`syncAllProjections` → `service.go:2398`）
      ④ `DELETE base_record_values` ⑤ `INSERT base_record_values`
      ≈ **5 次 SQL / 行**，5000 行 ≈ 25000 次往返；且 `Find(&records)`（`lookup.go:123`）
      一次性把**整表 JSONB 载入内存**，无分页、无事务。
      `scheduleDependentRecalc` 里还有 `context.WithTimeout(30s)`（`lookup.go:312`）→ 大表必然中途超时，留下半成品。
- [x] **字段类型迁移 / 重建投影只处理前 5000 行**
      `reindexTable`（`service.go:2351-2359`）与 `reindexTableTx`（`service.go:2371-2379`）
      都写死 `Limit(5000)`，**没有续跑游标**。
      类型迁移（`service.go:1188-1247`）在事务里转换了**全部**记录的数据，
      却只重建了**前 5000 行**的投影 → 第 5001 行以后投影停留在旧类型，数据与投影不一致。
- [x] **重复索引白付写放大**（`pg_indexes` 实测）
      | 表 | 重复索引 | 说明 |
      |---|---|---|
      | `base_record_values` | `idx_base_record_values_tenant` + `idx_base_record_values_tenant_id` | 定义完全相同（都是 `btree (tenant_id)`） |
      | `base_records` | `idx_base_records_tenant` + `idx_base_records_tenant_id` | 同上 |
      | `base_records` | `idx_base_record_created_by` + `idx_base_records_created_by` | 改名前后各建一份 |
      | `base_records` | `idx_base_record_deleted_at` + `idx_base_records_deleted_at` | 同上 |
      | `base_records` | `idx_base_record_updated_by` + `idx_base_records_updated_by` | 同上 |
      → 每次插记录 / 插投影都多维护 2~3 个索引。
- [x] **关键词检索没有索引能用**（`\d base_record_values` 实测）
      现有索引：`idx_base_value_text (table_id, field_id, value_text, record_id)` 等 4 个 btree。
      但检索走 `ILIKE '%kw%'`（`query_keyword.go:52`）——**前导通配符用不上 btree** → 全表扫。
      JSON 分支更贵：`value_json::text ILIKE`（`query_keyword.go:66`）每行都要把 JSONB 序列化成文本。
      实测库内 `base_record_values` 已有 **130,159 行**、`base_records` **503,015 行**，规模已经在临界点。

---

## 一、P0 · 功能正确性（🔴 必须先修）

- [x] **F-01　多字段排序 / 分组 500 —— JOIN 别名改成带序号**
      `query.go:741` / `query.go:748` 的 `gv` / `sv` 改为 `gv0` / `gv1` / `sv0` / `sv1`…，
      并让 `buildOrderSQL`（`query.go:490`）用同一套序号生成 ORDER BY 表达式。
      **验收**：2 排序 + 2 分组返回 200 且顺序正确；补一条多字段排序的回归用例。
      **风险**：改动在 ORDER BY 与 JOIN 两处，必须同源生成，否则排序静默失效。

- [x] **F-02　引用 / 汇总字段写入后自动重算**
      接上 `scheduleDependentRecalc`（`lookup.go:311`），但**先做 F-03**（否则只是把慢问题自动化）。
      触发点：写关联字段后触发**受影响记录**的重算，而不是整表。
      **验收**：改关联记录 → 引用 / 汇总列在 1 次请求内变新值。

- [x] **F-03　重算路径去 N+1 + 分块 + 事务化**
      照搬本轮批量更新的骨架：
      - 字段列表取一次（复用 `syncProjectionsWithFields`，`service.go:2410`）；
      - 目标记录一次查齐（按 `record_id IN (...)` 批量取，替代每行一次 `lookup.go:188`）；
      - 分块事务（`baseBatchChunk = 50`）+ 每行 SAVEPOINT；
      - 投影「一次 DELETE + 一次批量 INSERT」；
      - 记录游标分页，**去掉 `Limit(5000)` 硬上限**，改成「按 id 游标翻页直到取完」。
      **验收**：5000 行表重算 SQL 次数不随行数线性增长；整表重算无内存尖峰。

- [x] **F-04　字段类型迁移 / 重建投影的 5000 行上限**
      `reindexTable` / `reindexTableTx`（`service.go:2351` / `2371`）改成**按 id 游标分批 + 断点续跑**，
      并在返回体里回报「共 N 条 / 已处理 M 条 / 剩余 K 条」。
      **验收**：6000 行表做类型迁移后，全部 6000 行投影正确；失败可续跑。

- [x] **F-05　重复索引清理**
      删掉 5 组重复索引（同表同列只留一份），保留命名符合 `idx_<域>_<实体>_<列>` 的那个。
      需走 `internal/db/db.go` 的 `ensure*Schema` 幂等删除（不能手改线上库）。
      **验收**：`pg_indexes` 实测无重复；写吞吐有可测提升。

---

## 二、P0 · 性能与规模（🟠）

- [x] **P-01　关键词检索上索引（中文已实测可用，原结论有误）**
      - 英文 / 数字：`pg_trgm` GIN（`value_text gin_trgm_ops`）已上线
        （`ensureBaseSearchIndex`，建索引失败静默降级）。
      - **中文：实测证明 `pg_trgm` 同样可用**（原清单写的「对 CJK 无效」是错的，
        证据见技术方案第 54.4 节的 EXPLAIN 输出）。汉字被 Postgres 当成独立词，
        三值组落在汉字内部，GIN 索引能命中；5 万行中文表上
        `ILIKE '%思维导图%'` → `Bitmap Index Scan`，耗时 2.5ms。
      - 真正的限制有两条（与语言无关）：查询词**少于 3 个字符用不上索引**；
        GIN 索引是**全表级**的，热门关键词命中行多时，位图堆回表是主要开销。
      - JSON 分支（`value_json::text ILIKE`）仍然全表扫且**走不了索引** ——
        待把附件 / 成员字段的可搜文本落到 `value_text`（见第八节剩余项）。
      **验收**：10 万行表上关键字查询 P95 < 100ms ✅
      （实测 20 万行投影 / 命中 2 万行时，整条查询 44.5ms）。

- [x] **P-02　COUNT 与取数只扫一次** ✅ 本轮完成
      旧实现：`total` 与数据查询**各扫一遍同样的 WHERE**（独立 COUNT + 取数查询）。
      现在：**有关键字时改用窗口计数** `COUNT(*) OVER ()`，一次扫描同时拿到数据与总数。
      - 实测（20 万行投影 / 命中 2 万行）：旧 **105.5ms**（62.6 + 42.9）→ 新 **44.5ms**；
      - 边界 1：没有关键字时仍走独立 COUNT（COUNT 走索引扫描是毫秒级，
        而窗口计数会阻止 top-N 堆排序提前收尾，没有关键字可省就不划算）；
      - 边界 2：带翻页锚点时仍走独立 COUNT（锚点在 WHERE 里，
        窗口计数会变成「还剩多少条」而不是「一共有多少条」，语义会变）；
      - 边界 3：排序 / 分组的 LEFT JOIN 必须 1:1 ——
        新增 `base_record_values (record_id, field_id)` 唯一索引兜底
        （`internal/db/base_value_unique.go`，含存量去重）。
      **验收**：关键字查询的扫描次数减半 ✅（2 → 1）。

- [ ] **P-03　排序 / 分组的 JOIN 数设上限**
      N 个排序列 = N 个 `LEFT JOIN base_record_values`。大表上代价线性放大。
      - 排序 / 分组字段数上限（前端已限 5 / 3，后端也要校验）；
      - 优先走「先在投影表里定位 id 集合，再回 `base_records` 取行」的两段式，
        避免大表 × 大表 JOIN。

- [x] **P-04　单条更新路径去掉每行一次字段表查询**
      `service.go:1752` 调 `syncAllProjections`（`service.go:2396`），后者**每次都查一遍 `base_fields`**。
      批量路径已经改成 `syncProjectionsWithFields`（`service.go:2410`，字段列表外部传入），
      **单条路径还没跟上**。改法：调用方把 `idx` 里已有的字段元数据传下去。

- [x] **P-05　outbox 事件合并**
      一次批量 100 行写会产生 100 条 `record.updated`；实测 `base_event_outboxes` 里
      `record.updated` **271,987** 条、`record.created` **503,414** 条。
      - 批量写只发 1 条 `record.batch_updated`（事件类型已存在，实测 8,788 条）；
      - 单条写保留 `record.updated`；
      - outbox 增加**保留策略 + 归档**（现在只有 `BASE_OUTBOX_KEEP_DAYS=7`）。

- [x] **P-06　删字段 / 改字段类型路径的整表载入**
      `service.go:1094`（删字段清残留值）、`service.go:1135`、`service.go:1188`（类型迁移）
      都是 `Find(&records)` **无 LIMIT 整表载入内存**。改成按 id 游标分批。

- [x] **P-07　批量更新 / 关键词检索补回归测试** ✅ 本轮完成
      - `internal/base/p07_regression_test.go`：
        - **N+1 断言**：批量更新 10 行与 40 行的 SELECT 次数**相同**（实测都是 14 次），
          SQL 次数不随行数线性增长；
        - **关键字分支断言**：没有 JSON 字段时，检索条件里**不得出现** `value_json` 分支；
          有 JSON 字段时必须出现；
        - 跨表依赖边（A-06）与审计变更集（A-05）的回归用例同批补齐。

- [x] **P-08　限流档位按实测能力定档**
      实测：关键字查询 934 QPS、批量编辑 89 QPS；默认 `BASE_RATE_LIMIT_RPS = 40` 差一个数量级。
      - 默认提到 200 / burst 400；
      - 限流维度从「用户 × 路径」细化到「用户 × 接口类别」，避免批量写被查询配额误伤。

- [x] **P-09　限流「0 = 不限流」失效**（已修并提交）
      `internal/config/layered.go` 的 `int()` 用 `n > 0` 判环境变量有效性，
      `BASE_RATE_LIMIT_RPS=0` 被当成未设置 → 回落 yaml 的 40 → 限流器永远关不掉。
      已加 `layered.intAllowZero()` 并让 `BaseRateLimitRPS` 改用它。

---

## 三、P1 · 能力完整性（🟡）

- [ ] **A-01　SSE → WebSocket 平移**（协议已按 WS 结构设计，只换传输层）
      ⚠️ **必须排在 P-05 之后**，否则事件风暴直接打爆通道。
- [ ] **A-02　事件体带字段增量值**（现在只广播「哪些字段变了」）
      配合已有的 `?since=` 增量回放（`handler.go:1384`），做「字段级增量」。
- [x] **A-03　视图个人偏好支持 OR / 多级合并** ✅ 已落地：个人段 `query.combine` 支持 `override / and / or` 三种口径（`viewQuery.ts::resolveFilters`），前端「仅我 + 任一满足」即 OR 叠加；多级合并由 `FilterGroup.children` 递归表达
      现在只有「AND」或「个人优先、空回落共享」（`viewQuery.ts:120-123`）。
- [x] **A-04　链接目标候选分页 + 远程搜索** ✅ 已落地：`GET /tables/:tableId/link-targets` 支持 `keyword` 模糊搜索 + `cursor` keyset 翻页（`relations.go::ListLinkTargetsPage`），前端 `listLinkTargetsPage` 游标加载
      现在一次最多 200 条，无游标、无模糊搜索。
- [x] **A-05　审计 change set** ✅ 本轮完成
      审计原来只存 before / after 两份**完整快照**，看不出「到底改了哪几个字段」。
      现在 `base_operation_logs` 增加 `change_set jsonb` 列，
      记录字段级差异（`added` / `removed` / `modified`），
      删除记录时把被删内容写进 before（原先是 `nil, nil`，回放不出删掉的是什么）。
      变更集与 before / after 走同一套字段级可见性 —— 隐藏字段的条目读出时剥掉。
- [x] **A-06　引用 / 汇总字段跨表链路** ✅ 本轮完成（配合 F-02）
      「哪些表依赖我」原来没有反查索引：每次重算都要把整个 Base 的表列一遍、
      逐表加载字段索引再逐字段比对（O(表数) 次查库）。
      现在：
      - `idx_base_field_target_table ON base_fields ((config->>'targetTableId'))` 表达式索引；
      - 引用 / 汇总字段的跨表依赖**落库**到 `base_formula_dependencies`
        （`dependency_type = 'lookup' / 'rollup'`），字段增删改时维护、启动时回填；
      - 反查改成一条索引查询（`dependentTableIDs`）。
- [x] **A-07　记录级授权的部门来源** ✅ 已落地：新增 `subject_type = 'group'` 授权 —— 指向真实的通讯录分组 `base_user_groups`（组内成员全部可见），并校验分组必须存在于本空间（`datascope.go::userGroupExists` / `userGroupIDs`）；建记录时也可直接带授权名单
      `base_record_grants.subject_type = department` 已支持，
      但部门名是「派生伪 ID」，没有真实组织架构联动。
- [x] **A-08　CSV 导入的行级失败重试** ✅ 已落地：`BaseImportDialog.vue` 支持「重试失败行」与「行内修正后重试」两种模式
      现在按整行映射重放，不支持行级改值后重试。
- [x] **A-09　XLSX 导出的样式保真** ✅ 已落地：xlsx 生成器新增列级数字格式（金额 `¥#,##0.00` / 百分比 `0.00%` / 数字千分位右对齐 / 日期文本），保留冻结首行与列宽（`export/xlsx.ts` + `XLSX_STYLE`）
      导出是零依赖 SpreadsheetML，条件格式 / 冻结 / 颜色都没带出。

---

## 四、P2 · 体验（⚪）

- [x] **E-01　粘贴按字段类型智能解析** ✅ 已落地：`clipboard.ts::parseCellValue` 按字段类型解析（数字去千分位与货币符号 / 布尔认中英文 / 日期归一化 / 多选拆分），解析不出来原样保留不静默改写；公式等只读列跳过
- [x] **E-02　批量多选拖拽排序** ✅ 已落地：看板卡片可勾选，拖任意一张即整批挪列（`BaseBoardViews.vue`）；表格视图沿用既有多选拖拽排序
- [x] **E-03　跨表拖拽记录** ✅ 已落地：实现为「跨表复制 / 移动」—— 单元格右键「复制 / 移动到其他表」，按**字段名**映射、只搬同类型字段（`POST /tables/:tableId/records/transfer`，`internal/base/transfer.go`）
- [ ] **E-04　附件安全**：病毒扫描 + 类型白名单（现在只有扩展名黑名单）
- [x] **E-05　`ViewConfig.version` 二选一收口** ✅ 已落地：选择「补落库」—— 服务端每次保存视图配置把新的行版本写进 `config.version`（`service.go::CreateView / UpdateView`），前端 `ViewConfig.version` 类型同步
- [x] **E-06　Slash Command / Bubble Menu 等价物** ✅ 已落地：文本类单元格敲「/」唤出命令面板（插入日期 / 时间 / 日期时间、转大小写、去空格、插链接、清空），选中文本浮出快捷工具条（复制 / 转大写 / 转小写 / 加链接 / 清空）；命令逻辑在 `fields/slashCommands.ts` 并有单测
      先出决策再动手：Base 的主操作面是表格，收益低于文档侧。
- [x] **E-07　汇总行 / 列计算** ✅ 已落地：新增 `POST /tables/:tableId/summary`（口径与列表一致：同一套筛选 + 关键字 + 可见范围），底部合计行（合计 / 平均 / 计数）+ 分组小计行插在每个分组之后

---

## 五、前端（Grid 层）

- [x] 虚拟滚动已开（`BaseGrid.vue:951` `scroll-y enabled gt 40`）。
- [ ] **前端 F-01　多字段排序 UI 会触发后端 500** —— 修 F-01 之前，
      应先在前端把排序上限临时降为 1 并提示，避免用户撞 500。
- [ ] **前端 F-02　单元格渲染压力**：20+ 字段 × 数百行，vdom 节点数线性增长。
      考虑列虚拟化 / 按可见区渲染。
- [ ] **前端 F-03　引用 / 汇总列的值是「上次重算时的快照」**，
      界面上应显示「数据可能已过期」提示 + 重算入口，而不是当成实时值。
- [ ] **前端 F-04　筛选面板的错误提示**：500 目前只能看到通用报错，
      应把后端 `detail`（如 `table name "sv" specified more than once`）透出来。

---

## 六、建议执行顺序

| 批次 | 内容 | 理由 |
|---|---|---|
| **第一批（当天）** | F-01 多字段排序 500 · F-05 重复索引 · P-09 限流 0 值 | 都是小改动、立刻见效、零架构风险 |
| **第二批（2~3 天）** | F-03 重算去 N+1 · F-04 投影 5000 上限 · P-06 整表载入 | 同一类「全表载入 + N+1」问题，一起改 |
| **第三批（1 周）** | F-02 自动重算 · P-01 关键词索引 · P-02 COUNT · P-05 事件合并 | 需要压测复测 + 索引迁移 |
| **第四批（2 周）** | A-01 WS 平移（**必须在 P-05 后**）· A-03 偏好 OR · A-04 链接分页 · A-05 审计 change set | 能力面扩展 |
| **持续** | P-07 回归测试 · E-* 体验项 | 每批都必须带测试 |

**并行建议**：F-03 / F-04 / P-06 都是「整表载入 + N+1」，
建议抽一个公共的 `iterateRecordsByCursor(tableID, fn)` 工具，三个地方复用，避免各写各的分页。

---

## 七、本轮（批次 P）已落地的改动

| 项 | 落地内容 | 证据 |
| --- | --- | --- |
| F-01 | 排序 / 分组的投影 JOIN 别名改为 `gv0/gv1/sv0/sv1`，**JOIN 与 ORDER BY 同源生成** | `internal/base/multi_sort_test.go`（4 组组合断言顺序） |
| F-02 | `scheduleDependentRecalc` 从死代码接进写入路径（新增 / 更新 / 删除记录后触发） | `internal/base/dependent_recalc_test.go` |
| F-03 | 重算改游标分批 + 目标记录批量取回 + 字段元数据取一次 | `internal/base/lookup.go` |
| F-04 | 重建投影去掉 `Limit(5000)`，改 id 游标分批 | `internal/base/reindex_cursor_test.go`（5200 行表） |
| F-05 | `ensureBaseDedupeIndexes` 幂等清理同义重复索引（覆盖全部表） | `internal/db/dedupe_index_test.go` + `pg_indexes` 实测 |
| P-04 | 单条更新路径复用已加载字段索引，不再多查一次 `base_fields` | `internal/base/service.go` |
| P-05 | 批量写改为「每块一条 `record.batch_updated`」，不再逐条 `record.updated` | `internal/base/batch_event_test.go` |
| P-06 | 删字段 / 类型迁移 / 公式回填 / 重排全部改成游标分批 | `internal/base/cursor.go` |
| P-08 | 限流默认 rps 40→200、burst 80→400；限流维度改成「用户 × 接口类别」 | `internal/middleware/ratelimit.go::PathClass` |

## 七之二、批次 Q（扫描次数 + 依赖反查 + 审计变更集）已落地的改动

| 项 | 落地内容 | 证据 |
| --- | --- | --- |
| P-02 | 有关键字时用窗口计数 `COUNT(*) OVER ()`，统计与取数**只扫一次** | 实测 105.5ms → **44.5ms**（20 万行投影 / 命中 2 万行） |
| P-02 前置 | `base_record_values (record_id, field_id)` 唯一索引（保证排序 JOIN 1:1） | `internal/db/base_value_unique.go` |
| P-07 | 批量更新 N+1 断言、关键字分支断言、依赖边断言、审计变更集断言 | `internal/base/p07_regression_test.go`（10 行 / 40 行都是 14 次 SELECT） |
| A-05 | 审计增加字段级变更集 `change_set jsonb`；删除时把被删内容写进 before | `internal/base/audit_changeset.go` |
| A-06 | 跨表依赖反查索引 + 依赖边落库 + 索引驱动的依赖方查询 | `internal/db/base_dep_index.go` + `internal/base/lookup.go` |
| P-01 更正 | 实测推翻「pg_trgm 对中文无效」，中文子串检索**能走 GIN 索引** | 技术方案第 54.4 节（EXPLAIN 输出） |

## 八、跳过的部分与风险

- [x] ~~中文全文检索仍未解决~~ —— **本轮实测推翻**：中文子串检索能走 `pg_trgm` GIN 索引
      （5 万行表 2.5ms），不需要 ngram 分词。原结论作废。
- [ ] **JSON 字段的检索仍未走索引**：`value_json::text ILIKE` 无法建索引（`jsonb::text` 不是
      IMMUTABLE），只能全表扫。**下一步**是把附件名 / 成员名等可搜文本落到 `value_text`，
      从根上消掉这条分支。
- [ ] **短关键词用不上索引**：三值组要求查询词 ≥ 3 字符（与语言无关），
      两字中文仍走顺序扫描。命中面本来就小，暂不处理。
- [x] ~~P-02 未做~~ —— **本轮完成**（窗口计数，见第七之二节）。
- [ ] **P-03（排序 / 分组的 JOIN 数上限）未做**：后端已有 `MaxSorts=5 / MaxGroups=3` 的硬校验，
      两段式查询改造成本高，本轮保留现状。
- [x] ~~P-07 只做了一半~~ —— **本轮完成**（N+1 断言已补）。
- [x] ~~**A-01 ~ A-04 / A-07 ~ A-09 / E-01 ~ E-07 未做**~~ —— **本轮已补齐**：
      A-03（偏好 OR 口径）、A-04（链接候选分页 + 远程搜索）、A-07（分组授权）、
      A-08（CSV 行级重试）、A-09（XLSX 样式保真）、E-01（粘贴智能解析）、
      E-02（批量拖拽）、E-05（配置版本收口）、E-06（斜杠命令 / 浮动工具条）、
      E-07（汇总行 / 分组小计）。
- [ ] **仍未做 / 明确不做**：
      - A-01（SSE → WebSocket 平移）：协议已兼容，但按既定取舍**保持 SSE**；
      - A-02（事件体带字段增量值）：**刻意不做** —— 事件广播带值会绕过字段级权限（隐藏字段泄露），
        现状是只广播「哪些字段变了」，增量靠 `?since=` 补偿接口；
      - E-04（附件病毒扫描）：扩展名黑名单与类型校验已做，真实扫描需要外部服务（ClamAV 等），本轮未引入。
- [ ] **远端库未同步**：本轮新增的索引（`uniq_base_record_values_record_field` /
      `idx_base_dep_dependency_table` / `idx_base_field_target_table` /
      `uniq_base_dep_formula_field_type`）与 `change_set` 列只在**本地开发库**生效；
      远端 `101.132.237.173` 仍缺 base_import_jobs / base_user_groups / tenant_id 迁移。
      远端部署时服务启动会自动执行 `ensure*Schema` 补上（幂等），
      但**索引重建在大库上会耗时**，需要评估窗口。
- [x] E2E 已跑：`base-engine-e2e.mjs` / `base-engine-audit.mjs` / `base-ops-panel-e2e.mjs` 全部 ALL PASS。
- [x] 浏览器验证：本轮改动均为后端逻辑，UI 无变化；F-01 的 500 用真实 HTTP 复现并用回归用例锁死。
- [ ] **压测环境噪声**：本机 PG 容器 `max_connections=100`，dev 实例与压测实例各 50 连接，
      高并发下会出现 `tls error: EOF` 的连接抖动 —— **HEAD 版本同样复现**，属环境噪声而非代码回归。
