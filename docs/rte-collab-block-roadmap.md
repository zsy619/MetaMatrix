# 富文本协同与块实体化：实施顺序（归档）

日期：2026-11-26。基线：`main` @ `4f438f1`。
修订：2026-11-26 16:10（Asia/Shanghai）按可行性评审收紧——A3 依赖、A2 工期、D5 并发回填、门禁基线重测、协作扩展工作区差异；并同步相关任务清单。
状态更新：2026-11-26 20:51（Asia/Shanghai）——D1/D2 已拍板，A1 已合入 `main` @ `311593e`（PR #297）。功能分支 `agent/met-4-a2a-collab-20261126` 已有 A2a / A2b、A3 审计骨架（`bc0404e`），以及缺口补丁 `2e45f76`（浏览者前端只读、持久离线队列、审计只读列表），**尚未合入 main**。MinIO、评论通知、B1 caret、B / C 未做。浏览器实机与双浏览器收敛仍未验证，不能写成验收通过。

来源：ChatGPT 分享《飞书文档编辑器技术架构深度分析》（五大技术体系：Block 模型 / 编辑器内核 / 多人协同 / 块级交互 / 文档服务），
对照当前代码得出缺口清单；本文归档**修正后的实施顺序**及其技术要点与工作任务。

相关既有文档（注意时效）：

- [rte-feature-matrix.md](./rte-feature-matrix.md) —— 2026-11-06 的全功能矩阵，其中「没有 Yjs」已过时：
  知识库文档已有 Yjs CRDT 层（见下文 A2），本文为准。2026-11-26 已加注：原「实时光标 / 明确不做」不再有效，现为 B1。
- [rte-prosemirror-feishu.md](./rte-prosemirror-feishu.md) —— 内核对照，结论沿用。
- [rte-feishu-gap.md](./rte-feishu-gap.md) —— 2026-11-03 历史记录，其中多条已过时。
- [rte-editor-tech-routes.md](./rte-editor-tech-routes.md) —— 技术路线调研仍有效（继续走 Tiptap + Yjs + Hocuspocus 方向）；
  文中旧「P0 字符级 CRDT（先复用 HTTP、后端零改造）→ P1 WS → P2 再补块 ID」的落地顺序**已废止**，实施顺序以本文为准。

---

## 0. 结论

原先的 `P0 实时协同 → P1 Awareness/块级收敛 → P2 块实体化 → P3 通知/存储` **顺序不完全合适**，有三处问题：

1. 「块级冲突收敛」若在现有 HTML 级 CRDT 上自研，会被正文接入 Yjs 后的原生合并**整体推翻**。
2. 「块身份」排在协同之后是**次序倒置**：协同合并会重写节点结构，先协同后补 ID，所有已协同的历史文档都要走补偿回填。
3. 「对象存储 / 评论通知 / 正文内嵌数据库块」与协同无依赖，被无谓压在后面。

修正后的形状：**A0 开工前检查 → A 阶段三条线并行（A1 块身份 ‖ A2 协同底座 ‖ A3 存储与消息）→ B 阶段（B1 协作光标 + B2 块实体化 + B3 内嵌数据库块）→ C 阶段收口**。

并行有边界：A3 里 MinIO 与评论通知可与协同并行；「谁改了哪个块」的审计依赖 A1 稳定 blockId，完整块级字段要到 B2 才闭环。开 A 之前必须先拍板 D1、D2，否则 A2/B2 会返工。

---

## A0. 开 Phase A 前的检查单

- [x] **D1 书面拍板**：用户于 2026-11-26 19:04（Asia/Shanghai）采纳建议——知识库也走正文 Yjs，`kb_crdt_updates` 降为只读，处置放到 A2b。本包（A2a）禁止修改 `crdtDoc.ts`、禁止废止旧 HTML 级旁路写入。
- [x] **D2 书面拍板**：同日采纳——Y.Doc 快照为实时事实源，`current_data` 为导出/检索派生；A2 期先双写、保留回滚。不要把保存管线改成只写 Y.Doc。
- [x] **D3 / D4 / D5 书面拍板**：建议已随 A1 落地（v1 块边界为顶层 + 一级嵌套；前端生成 UUID；懒回填 + 随正常保存持久化，打开不单独强制保存）。**多人同时首次打开旧文档仍未实机验证。**
- [x] **门禁基线重测**：已在干净 worktree 实跑，数字回写 §5。`4f438f1` / `311593e`：`vue-tsc` 62 error，`vitest` 6 失败 / 1919 通过；`9701171`：`vue-tsc` 62 且集合相同，`vitest` 6 失败 / 1924 通过；本轮缺口补丁 `4a615d3`：`vue-tsc` 62 集合仍相同，`vitest` 6 失败 / 1926 通过。旧基线 `54abf501` **不可当作当前门禁**。
- [x] **确认协作扩展依赖**：以 `main` @ `311593e` 已有的 `@tiptap/extension-collaboration` / `collaboration-caret` 为准；A2a 功能分支已引用 Collaboration（caret 仍未接线，留给 B1）。Mac 工作区仍有未提交删除这两个包的改动，**未带进功能分支**；不要在 Mac 上恢复或覆盖 `package.json`。
- [x] 不使用 `git stash` 做门禁对比：本轮均用独立 worktree，未 stash / reset --hard / clean。

---

## 1. 现状事实（决策依据）

### 1.1 已具备的资产

- [x] **派生块表** `kb_content_blocks`：`DocumentID / PanelID / PanelTitle / BlockPath / TextContent / SortOrder`
      —— `pros/api/internal/model/models.go:110`，AutoMigrate 注册见 `pros/api/internal/db/db.go:30`
- [x] **抽取器** `content.Extract()`：`pros/api/internal/content/extract.go:62`，块结构定义见同文件 `:38`
- [x] **保存时全量重建块表**：`syncExtract` —— `pros/api/internal/service/documents.go:229`
- [x] **文档级出向引用** `core_page_references`（mention / embed）：`pros/api/internal/model/page_reference.go:12`
- [x] **媒体引用计数** `media_references`：`pros/api/internal/model/media.go:48`（块级计数的现成范式）
- [x] **成员角色** `admin | editor | viewer`：`pros/api/internal/model/knowledge_v6.go:14`，路由 `pros/api/cmd/server/main.go:335-337`
- [x] **跨文档块引用**已有 `blockId` 概念（命名先例）：`pros/web/src/extensions/syncBlock.ts:50`
- [x] **块级交互**：块手柄 / 拖拽 / 复制 / 删除 / 上移下移 / 转换 —— `pros/web/src/components/rte/composables/useBlockHandle.ts:14`
- [x] **协作扩展已写入 `main` @ `311593e` 的 `package.json`**：`@tiptap/extension-collaboration` / `@tiptap/extension-collaboration-caret` ^3.32.0。A2a 功能分支已引用 Collaboration；caret 仍为零引用（B1）。Mac 工作区若仍有未提交删除这两项，不要覆盖 `package.json`。

### 1.2 真正缺失的三件事

- [x] **块内稳定 ID**：A1 代码已 squash 合入 `main` @ `311593e`（PR #297）。身份块使用 `dataBlockId` → HTML `data-block-id`，与 heading `id` / 图表 `xrefId` / syncBlock `blockId` 并存；复制换新 ID、拖拽保持、懒回填不单独保存。单测覆盖复制 / 拖拽 / 粘贴。**浏览器实机（复制 / 拖拽 / 系统粘贴、老文档打开保存、多人同时首开）尚未验证，不能写成验收通过。** 标题 `attrs.id`、图片/表格 `xrefId` 仍作既有锚点保留，不再是唯一身份。
- [ ] **块实体层**：无父子层级、无块类型、无稳定主键、无版本归属；`kb_content_blocks` 每次保存全删全建
- [ ] **块级引用**：交叉引用定位先比 ID、再按标题文本兜底 —— `pros/web/src/utils/rteBlockRef.ts:15`；复制或改名即失效

### 1.3 协同现状（决定顺序的关键）

- [x] 知识库文档有 Yjs CRDT 层：`pros/web/src/components/knowledge/collab/crdtDoc.ts`
      —— 自研 `splitBlocks` 扫 HTML 标签切顶层块，**块内 LWW**；HTTP 拉取，轮询 2.5s（同文件 `:119`）
- [x] 服务端只存增量：`kb_crdt_updates`（`pros/api/internal/model/knowledge_v6.go:48`），
      路由 `GET/POST /knowledge/documents/:id/crdt`（`pros/api/cmd/server/main.go:382-383`）
- [ ] **正文主编辑器未接 Yjs（这是 `main` 现状）**：`main` 仍是单写者 + 乐观并发（`SaveVersion` / `HeadRevisionID` / `ErrSaveConflict`）。功能分支 `agent/met-4-a2a-collab-20261126` @ `4a615d3`（及垂直切片 `9701171`）已把正文按需接入 Collaboration，**尚未合入 main**；双浏览器收敛未实机验证。
- [ ] **无 WebSocket 通道（这是 `main` 现状）**：`main` 仍无 WebSocket；`docker-compose.yml` 只有 Postgres + API + nginx，**无 Redis**。功能分支已有 Hertz `hertz-contrib/websocket` 垂直切片（`/documents/:id/collab`，含心跳与重连），**未合入 main**，不能把「无 WebSocket」勾掉当成 main 已具备。
- [ ] **无 Awareness**：协作光标 / 选区 / 在线名单在正文内全无；
      `pros/web/src/components/canvas/nodeGraph/presence.ts` 只覆盖节点图画布，且仅同浏览器多标签（BroadcastChannel）
- [ ] **协同是可选旁路（这是 `main` 现状）**：`main` 上「开启/关闭协同编辑」仍可指向 HTML 级旁路。功能分支已按 D1 重定义：开启走正文 Yjs（A2a），关闭回到单人保存，且不再写入 `kb_crdt_updates`（A2b @ `64d39ab`），**尚未合入 main**。

---

## 2. 修正后的顺序

### Phase A —— 三条线并行（合计约 3 周；若 D1 同步收口旧 CRDT，按 3–4 周排）

#### A1 最小块身份（前端，4–6 人日）

交付**身份语义**，不建表、不动后端；是 A2 与 B2 的共同前提。

- [x] 新增 `pros/web/src/extensions/blockIdentity.ts`（ProseMirror Plugin）；已合入 `main` @ `311593e`（PR #297）
- [x] 插入时生成 `crypto.randomUUID()`；**复制块必须重新生成**（沿用会造成两块同 ID）
- [x] 拖拽 / 移动保持 ID；粘贴 / 拆分 / 合并块的继承规则明确化
- [x] 序列化到 HTML：`data-block-id`（与既有 `data-bookmark-id` 并存）
- [x] 文档内 ID 冲突自动重生成（幂等兜底）
- [x] 老文档**懒回填**：打开时只给缺失 ID 的顶层（及 D3 约定的一级嵌套）节点补 ID；**默认不因回填单独强制保存**，随下一次正常保存持久化。多人同时打开旧文档的冲突策略见 D5，**实机仍未验证**。
- [x] 单测已覆盖复制 / 拖拽 / 粘贴三场景的 ID 行为。**浏览器实机（复制 / 拖拽 / 系统粘贴、老文档打开保存、多人首开）未验证，不可写成验收通过。**

#### A2 协同底座（后端为主）

工期要按 D1 拆开，避免把「8–12 人日」当成含旧 CRDT 收口的全包价：

- **A2a（8–12 人日）**：WS 通道 + 正文接入 Collaboration + 操作日志与 presence 接口；旧 HTML 级 CRDT 先并行存在，不在本包内废止
- **A2b（另加 3–5 人日，或并入 D1 收口）**：按 D1 把 `crdtDoc.ts` / `kb_crdt_updates` 降为历史只读或给出双轨截止条件。若 D1 选择「知识库也走正文 Yjs、废止 HTML 级旁路」，不要仍按 8–12 人日排期

任务：

- 状态（2026-11-26 19:45）：功能分支 `agent/met-4-a2a-collab-20261126` 已有 A2a（至 `4a615d3`）与 A2b（`64d39ab`），**未合入 main**。双浏览器收敛未实机验证，不能算验收通过。下列实现项仅表示功能分支已有代码，不代表 main 现状。
- [ ] **WS 通道**：功能分支已用 Hertz `hertz-contrib/websocket`（复用现有鉴权与进程，含应用层 ping 与断线重连）；`2e45f76` 已补持久化离线队列（按文档隔离，IndexedDB / localStorage，刷新后恢复，发送成功后清除），浏览者进房后前端只读且不发本地增量。**尚未合入 main**。未实机验证。
- [ ] 正文接入 `Collaboration` 扩展绑定 Y.Doc，协议从第一天携带 `data-block-id`（功能分支已实现，未合入 main）
- [ ] 增量落库 `doc_operation`，与文档版本体系对齐（功能分支已实现；双写后抖动执行 `syncExtract` 与自动修订快照，未合入 main）
- [ ] presence 存储接口沿用既有约定、不写死 Redis（功能分支已复用 `PresenceStore`，未合入 main）
- [ ] 冲突合并的验收标准包含"块级收敛"，不再单列自研工作包（进程内两编辑器单测已覆盖；**双浏览器未实机验证**）
- [ ] **按 D1 处置旧协同旁路（A2b）**：功能分支 `64d39ab` 已将 `AppendCRDT` / `POST /documents/:id/crdt` / `httpTransport.postUpdate` / `appendCrdtUpdate` 降为只读拒绝写入，历史 `GET` / `CRDTUpdates` 仍可读；`CollabDoc` 默认不可写。单测已锁住「旧旁路不再写入」。**尚未合入 main**。未在真实浏览器验证开启/关闭协同。
- [ ] 验收：两个浏览器同开一篇文档，输入可互相收敛——**未在真实浏览器验证**，不能勾选

#### A3 存储与消息（部分可并行，4–6 人日不含完整块级审计）

与协同无依赖的是对象存储和评论通知，**不是**全部 A3 项。

- [ ] 附件从本地磁盘 + 自建分片上传（`/upload/chunk/*`）迁到 MinIO / S3（可与 A1/A2 并行）
- [ ] 评论通知链路（站内 / 邮件）：评论线程今天已可用（写在文档 JSON 内）（可与 A1/A2 并行）
- [ ] **用户维度审计流水「谁在何时改了哪个块」**（依赖 A1 稳定 blockId；完整块类型 / 父子等到 B2）。功能分支 `bc0404e` 已做用户+文档级骨架；`2e45f76` 已在 DocView 侧栏增加只读列表。**尚未合入 main**。块类型/父子未做。MinIO 与评论通知仍未做。审计列表未实机验证。

### Phase B —— A1 + A2 之后（约 2 周）

#### B1 协作光标与在线名单（3–5 人日）

- [ ] 依赖 A2 的 presence 通道；用 Yjs relative position，**不依赖块表**
- [ ] 正文内协作者光标、选区、在线成员列表

#### B2 块实体化主体（15–18 人日）

- [ ] 数据模型：`doc_blocks`（`id / document_id / parent_id / block_type / ordinal / depth / anchor_key /
      content_text / content_json / attrs / revision_id / created_at / updated_at / deleted_at`）、
      `doc_block_revisions`、`doc_block_refs`
- [ ] 索引：`(document_id, ordinal)`、`(parent_id)`、`(deleted_at)`、`(target_block_id)`
- [ ] 迁移：`internal/db/db.go` AutoMigrate 注册 + `ensure*Schema` 补丁；
      **同步 SQLite 影子模型**（否则测试报 `table X has no column named Y`）
- [ ] 抽取器升级：`content.Block`（`extract.go:38`）增 `ID / ParentID / Type / Depth / Attrs`，从 panel/path 两层改为递归树展开
- [ ] 保存管线：`syncExtract`（`documents.go:229`）由「全删全建」改为 **upsert + 软删**，
      否则块 ID 每次保存被打乱，实体化白做；块表写入与 `current_data` 同事务；
      `DocumentSaveOperation` 幂等键覆盖块 upsert
- [ ] 引用体系：统一 ID 命名空间（heading / image / table / bookmark 收敛到 `blockId`，旧 ID 降级为 `anchor_key`）；
      `findCrossRefPos`（`rteBlockRef.ts:15`）改为按 blockId 定位，标题文本仅作降级并打 `lost` 标记；
      `core_page_references` 扩到块级（`source_block_id` / `target_block_id`）并支持反查
- [ ] 批注锚点：`DocComment` 增 `block_id` + 块内 offset 双锚点，`ensure*Schema` 回填，旧评论走降级路径
- [ ] API：`GET /documents/:id/blocks`、`GET /documents/:id/blocks/:blockId`、块级引用反查；预留块级权限字段
- [ ] 兼容期双写：老 `kb_content_blocks` 保持不变，新表并行写

#### B3 正文内嵌数据库块（并行，随时插队）

- [ ] 多维表格从「知识库树上的独立 `kind=sheet`」下沉为可内嵌的正文块（作为正文块时仍应带 A1 的稳定 blockId，不可在身份语义未定前当已完成项勾掉）

### Phase C —— 收口

- [ ] C1 协同下的冲突呈现与「谁的版本」合并 UI
- [ ] C2 协同 × 权限 / 审阅语义（修订建议与协同同时开启如何共存、块级权限）
- [ ] C3 存储与通知的规模化收尾

---

## 3. 开 Phase A 前必须拍板的架构决策

### D1 正文接 Y.Doc 后，知识库现有 HTML 级 CRDT 如何处置

- [x] 建议（已于 2026-11-26 19:04 拍板）：知识库文档**也走正文 Yjs**，`kb_crdt_updates` 降为历史 / 只读；处置本身仍属 A2b
- [x] 代价（功能分支 `64d39ab` 已重定义，**未合入 main**）：「开启/关闭协同编辑」改为编辑模式之一——开启走正文 Yjs，关闭回到单人保存，且不再写 `kb_crdt_updates`
- [ ] 不处置的后果：两套协同语义并存（内核级 + 旁路字符串级），必然分裂成两种产品行为
- [ ] 工作量：处置本身计入 A2b，不计入 A2a 的 8–12 人日

### D2 协同时代的事实源

- [x] 建议（已于 2026-11-26 19:04 拍板）：**Y.Doc 快照为实时事实源**，`current_data`（HTML / JSON）降为导出与检索派生；A2 期先双写
- [ ] 影响面：`syncExtract`（`documents.go:229`）、搜索 / AI 抽取链路、版本体系、导出
- [ ] 必须在 A2 之前定；否则 B2 的块表抽取器要写两遍；建议留一个双写过渡期以便回滚

### D3 块边界

- [x] 只取顶层 ProseMirror 节点，还是递归进 callout / columns / toggle / tabs 内部
- [x] 建议 v1 先「顶层 + 一级嵌套」（已随 A1 落地），递归全量留到 B2 之后

### D4 ID 生成位置

- [x] 建议前端生成 + 后端校验补齐（编辑期即时可用）；A1 已在前端落地 UUID

### D5 老文档回填策略

- [x] 建议默认已随 A1 落地：**懒回填 + 随正常保存持久化**。**多人同时首次打开旧文档仍未实机验证。**
- [ ] 若必须在首次打开时保存：只补缺失 ID，走 `HeadRevisionID` / `ErrSaveConflict` 重试；冲突时重读后再补 ID，不覆盖他人正文
- [ ] 离线批量脚本可作为补充（首开无感，但要运维窗口），与懒回填可以并存，不是二选一
- [ ] 必须在开 A1 前书面确认并发策略，不可只写「打开即保存」

---

## 4. 风险与不可逆点

- [ ] **A2 会替换 `crdtDoc.ts` 实现** → 开工前先冻结 A1 的 blockId 语义，否则两边定义打架
- [ ] **事实源切换（D2）** 影响保存接口与版本体系 → 需要双写过渡期 + 回滚预案
- [ ] **多实例在线状态**：项目当前无 Redis → 跨实例 presence 需 Redis pub/sub 或粘性会话；
      存储实现留接口、不写死
- [ ] **Awareness 与现有引用定位不是一回事**：现在是「先比 ID、再按标题文本兜底」，
      协作下的相对位置是另一套 → 引用锚点要做 **blockId + relative position 双轨**
- [ ] **块表是派生层**：必须可随时从 `current_data` 全量重建；回滚 = 删表，主数据零影响（选派生层的最大价值）。若 D2 选定 Y.Doc 为实时事实源，块表是「Y.Doc → current_data → 块表」的第二级派生，B2 抽取器必须从当时的权威源读取，避免写两套互斥逻辑
- [ ] **历史引用双轨期**：老引用不硬切，保留 `anchor_key`
- [ ] **老文档回填并发**：多人同时首次打开同一篇旧文档时，强制保存会互相冲突；必须按 D5 处理，不能只依赖前端补 ID
- [ ] **协作扩展工作区差异**：以提交 `4f438f1` 为准；发现工作区 `package.json` 缺依赖时先核对再开 A2，不要在脏工作树上直接开工
- [ ] **A2 工期**：把旧 HTML CRDT 收口塞进 A2a 的 8–12 人日会低估；收口走 A2b

---

## 5. 门禁

每个阶段合入前跑齐。对比基线必须是**当前文档声明的 SHA**上、干净工作树的一次实跑结果。

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

- 本文归档基线：`4f438f1`。干净 worktree 实跑结果（不可再用 `54abf501` 口径）：
  - `4f438f1` 与 `main` @ `311593e`（A1 合入后，树与 `f5ef8f0` 一致）：`vue-tsc` 62 个 `error TS`（退出码 2），`vitest` 6 失败 / 1919 通过 / 1 跳过；`go build ./...` 与 `go test ./internal/service/...` 通过。
  - A2a 垂直切片 `9701171`：`vue-tsc` 仍 62 且误差集与基线一致，`vitest` 6 失败 / 1924 通过 / 1 跳过（多出本包 5 个新用例）；Go 构建与相关测试通过。
  - 本轮缺口补丁 `4a615d3`（2026-11-26 19:33 左右，Asia/Shanghai）：`vue-tsc` 仍 62、集合不变；`vitest` 6 失败 / 1926 通过 / 1 跳过（再多 2 个心跳/重连用例）；失败名单与基线相同；`go build` 与 `go test`（service / handler / middleware）通过。
  - A2b `64d39ab`（2026-11-26 19:45 左右，Asia/Shanghai）：相对 `4a615d3`，`vue-tsc` 仍 62、集合完全一致；`vitest` 6 失败 / 1928 通过 / 1 跳过（再多 2 个「默认不写 / httpTransport 拒绝写入」用例）；失败名单与基线相同；`go build` 与 `go test`（service / handler / middleware）通过。
  - A3 审计骨架 `bc0404e`（2026-11-26 20:26 左右，Asia/Shanghai）：相对 `64d39ab`，`vue-tsc` 仍 62、集合完全一致；`vitest` 仍 6 失败 / 1928 通过 / 1 跳过，失败名单不变；`go build` 与 `go test`（service / handler / middleware）通过，新增审计单测全过。
  - 缺口补丁 `2e45f76`（2026-11-26 20:51 左右，Asia/Shanghai）：相对 `bc0404e`，`vue-tsc` 仍 62、集合完全一致；`vitest` 6 失败 / 1934 通过 / 1 跳过（多 6 个只读/离线队列/审计列表用例），失败名单不变。本轮无 Go 代码改动。
- 判定回归时用干净 worktree 对同一条命令对比上表，不要沿用 `54abf501`。
- 判定回归：在干净工作树对同一条命令对比基线。**不要用 `git stash`** 制造干净树（当前仓库可能有未提交的 `package.json` 等改动，stash 有误伤风险）。可用独立 worktree 检出基线 SHA 来对比。
- 历史噪声不算回归；**本批次新引入的**类型错误或测试失败必须停并回报，不连续蛮干。

---

## 6. 未验证与不承诺

- 本文档只做**代码级核查**，未在浏览器里点过协同、块实体、协作光标任何交互。
- 未跑 Safari / Firefox，未验证深色模式下的块手柄与协作光标可读性。
- 工期是按当前代码规模估的粗算，不是承诺；A2 的真实成本取决于 D1 / D2 的选择，须按 A2a / A2b 拆开评估。
- 飞书侧行为未逐项打开网页核对，本文只引用分享文档中的技术分析，不把推测写成飞书实现。
- 本文件在 2026-11-26 评审时于 Mac 工作区为未跟踪文件；是否入库由后续提交决定，不在本文兼职发布流程。
