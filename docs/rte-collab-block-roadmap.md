# 富文本协同与块实体化：实施顺序（归档）

日期：2026-11-26。基线：`main` @ `4f438f1`。
修订：2026-11-26 16:10（Asia/Shanghai）按可行性评审收紧——A3 依赖、A2 工期、D5 并发回填、门禁基线重测、协作扩展工作区差异；并同步相关任务清单。
状态更新：2026-11-26 20:51（Asia/Shanghai）——D1/D2 已拍板，A1 已合入 `main` @ `311593e`（PR #297）。当时功能分支 `agent/met-4-a2a-collab-20261126` 已有 A2a / A2b、A3 审计骨架（`bc0404e`）以及缺口补丁 `2e45f76`。
状态更新：2026-11-27（Asia/Shanghai）——该功能分支经 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) squash 合入 `main`（`a61a7649e742b37f2e65bc63085ba073555fdd57`），含 A2–C 已落地部分（见各节勾选与提交说明）。实时双向同步、飞书级多维表/合并/ACL、跨实例 presence 仍缺。浏览器实机、双浏览器收敛、真实 MinIO 与发信仍未验证，不能写成验收通过。
状态更新：2026-11-27（Asia/Shanghai）——新分支 `agent/met-4-deepen-20261127`（从当时 `origin/main` @ `a61a764` 拉出）已随 [PR #299](https://github.com/zsy619/MetaMatrix/pull/299) squash 合入 `main`（`121e654b4a51c058b30ca66ab72a455fef1570bd`）：`e7958b8` 单边表格覆盖需确认、选区不能跨过只读块；`c939375` 内嵌表对照树上表并安全同步单边改动（打开/聚焦/定时对照，仍不是实时双向）；`09aa8e4` 筛选「不包含」与按字段类型的默认条件；`dfeabab` 保存冲突可按块选择保留哪一边。实时双向同步、飞书级多维表/合并/ACL、跨实例 presence 仍缺。实机、双浏览器、真实 MinIO 与发信仍未验证，不能写成验收通过。
状态更新：2026-11-27（Asia/Shanghai）——新分支 `agent/met-4-deepen-20261127-2`（从当时 `origin/main` @ `6f87d9c134f69e6ea7b75786a6fab27ed0e9a449` 拉出）已随 [PR #301](https://github.com/zsy619/MetaMatrix/pull/301) squash 合入 `main`（`cc55f281f3ea38f152693f834e2f879065a7285f`）：`0f8ea13ca19484f0a5101c1bf7bb779abe062f88` 打开、聚焦或定时对照后，对仅一边改过的关联表自动安全拉取或写回，两边都改过或尚未对照仍跳过（只读浏览只标状态，不自动推拉）；`3dd0c3447d2a1b2b65530e859ecf969e94f96b2c` 顶层包装内恰好一个稳定块 ID 时按该块对照并保留外包 HTML，按块选择不剥审阅标记，预览与落地 HTML 一致。仍不是实时双向同步，也不是飞书级三方合并/多维表/ACL。跨实例 presence 本轮未做。实机、双浏览器、真实 MinIO 与发信仍未验证，不能写成验收通过。
状态更新：2026-11-27（Asia/Shanghai）——新分支 `agent/met-4-deepen-20261127-3`（从当时 `origin/main` @ `cc55f281f3ea38f152693f834e2f879065a7285f` 拉出）已随 [PR #302](https://github.com/zsy619/MetaMatrix/pull/302) squash 合入 `main`（`df35968c72b3d2cc892bfbd45023432e4cff040d`）：`f73b32b52664c5a1007c6118052bfd623fe0b4c1` 对照改用稳定指纹（单元格键顺序不再把相同内容判成已改，并兼容历史指纹，避免误判两边都改过）；两边都改过时按字段和行统计差异，并在徽章与确认框展示摘要，仍不自动覆盖。`c6ba87b37c7d228b58b7d08482ca6fb69d035dca` 补上多层包装与一边裸块时按同一块 ID 对照的单测，按块选择不剥审阅标记，预览与落地一致。仍不是实时双向同步，也不是飞书级三方合并/多维表/ACL。跨实例 presence 本轮未做。实机、双浏览器、真实 MinIO 与发信仍未验证，不能写成验收通过。
状态更新：2026-11-27（Asia/Shanghai）——新分支 `agent/met-4-deepen-20261127-4`（从当时 `origin/main` @ `7899c6be0e81b5aa04025b81aa035b88612e4502` 拉出）**尚未合入 `main`**：`47ebd999e8852c33e086a2dd1d8d9e84763f531c` 两边都改过时，按上次同步指纹做三方对照，不相交的字段/行/单元格会自动合并到内嵌块和树上表，相交冲突仍跳过；多块连续同步按当前块位置查找。`7038b3036acc94e43339e613e42fed0214729ada` 按块合并时 DOM 等价（属性顺序或标签空白不同）的块不再误报冲突，不剥审阅标记。`1c09d5075fb143f15ece8c7c832548d2ad8039c8` Base 筛选 isempty/isnotempty 改为判断非空投影值，并补上 rollup 与筛选 SQL 单测。仍不是实时双向同步，也不是飞书级三方合并/多维表/ACL。跨实例 presence 本轮未做。实机、双浏览器、真实 MinIO 与发信仍未验证，不能写成验收通过。

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
- [x] **确认协作扩展依赖**：以 `main` 已有的 `@tiptap/extension-collaboration` / `collaboration-caret` 为准；A2a 已引用 Collaboration，B1 @ `7d62fa0` 已接入 CollaborationCaret，已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`）。不要为更新协作依赖而覆盖其它本地 `package.json` 改动。
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
- [x] **协作扩展已写入 `package.json`**：`@tiptap/extension-collaboration` / `@tiptap/extension-collaboration-caret` ^3.32.0。A2a 已引用 Collaboration；B1 @ `7d62fa0` 已接入 CollaborationCaret，已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`）。不要为更新协作依赖而覆盖其它本地 `package.json` 改动。

### 1.2 真正缺失的三件事

- [x] **块内稳定 ID**：A1 代码已 squash 合入 `main` @ `311593e`（PR #297）。身份块使用 `dataBlockId` → HTML `data-block-id`，与 heading `id` / 图表 `xrefId` / syncBlock `blockId` 并存；复制换新 ID、拖拽保持、懒回填不单独保存。单测覆盖复制 / 拖拽 / 粘贴。**浏览器实机（复制 / 拖拽 / 系统粘贴、老文档打开保存、多人同时首开）尚未验证，不能写成验收通过。** 标题 `attrs.id`、图片/表格 `xrefId` 仍作既有锚点保留，不再是唯一身份。
- [x] **块实体层**：`kb_doc_blocks` / `kb_doc_block_revisions` / `kb_doc_block_refs` 已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`，见 B2）。兼容期内旧表 `kb_content_blocks` 仍全删全建。不是飞书级字段/组织 ACL。
- [x] **块级引用**：交叉引用优先 `blockId`，旧 ID 降为 `anchor_key`，标题文本仅作降级并打 `lost`（`4d087e9`，已随 PR #298 合入）。老引用不硬切。**未实机验证。**

### 1.3 协同现状（决定顺序的关键）

- [x] 知识库文档有 Yjs CRDT 层：`pros/web/src/components/knowledge/collab/crdtDoc.ts`
      —— 自研 `splitBlocks` 扫 HTML 标签切顶层块，**块内 LWW**；HTTP 拉取，轮询 2.5s（同文件 `:119`）
- [x] 服务端只存增量：`kb_crdt_updates`（`pros/api/internal/model/knowledge_v6.go:48`），
      路由 `GET/POST /knowledge/documents/:id/crdt`（`pros/api/cmd/server/main.go:382-383`）
- [x] **正文主编辑器已按需接入 Yjs**：保存仍可走单写者 + 乐观并发（`SaveVersion` / `HeadRevisionID` / `ErrSaveConflict`）；A2a @ `4a615d3`（及垂直切片 `9701171`）把正文按需接入 Collaboration，已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`）。**双浏览器收敛未实机验证。**
- [x] **WebSocket 通道已落地（同实例）**：Hertz `hertz-contrib/websocket` 垂直切片（`/documents/:id/collab`，含心跳与重连），已随 PR #298 合入 `main`（`a61a764`）。`docker-compose.yml` 仍只有 Postgres + API + nginx，**无 Redis**；跨实例通道未做。未实机验证。
- [x] **正文内 Awareness 已落地（同实例）**：B1（`7d62fa0`）及离房清鬼光标/重连同步（`43d5450`）已随 PR #298 合入 `main`（`a61a764`）。正文内可见他人光标与选区、在线名单；**未实机验证**。跨实例 presence 仍缺。节点图 `presence.ts` 仍只覆盖同浏览器多标签。
- [x] **旧 HTML 级协同旁路已按 D1 收口（A2b）**：开启走正文 Yjs（A2a），关闭回到单人保存，且不再写入 `kb_crdt_updates`（A2b @ `64d39ab`），已随 PR #298 合入 `main`（`a61a764`）。未在真实浏览器验证开启/关闭协同。

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

- 状态（2026-11-27）：A2a（至 `4a615d3`）与 A2b（`64d39ab`）已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) squash 合入 `main`（`a61a764`）。双浏览器收敛仍未实机验证，不能算验收通过。
- [x] **WS 通道**（已随 PR #298 合入 `main`（`a61a764`），`4a615d3` / `2e45f76`）：Hertz `hertz-contrib/websocket`（复用现有鉴权与进程，含应用层 ping 与断线重连）；持久化离线队列（按文档隔离，IndexedDB / localStorage，刷新后恢复，发送成功后清除）；浏览者进房后前端只读且不发本地增量。**未实机验证。**
- [x] 正文接入 `Collaboration` 扩展绑定 Y.Doc，协议从第一天携带 `data-block-id`（已随 PR #298 合入 `main`（`a61a764`））
- [x] 增量落库 `kb_doc_operations`，与文档版本体系对齐（已随 PR #298 合入 `main`（`a61a764`）；双写后抖动执行 `syncExtract` 与自动修订快照）。`kb_save_operations`（保存幂等）与此不是同一张表。
- [x] presence 存储接口沿用既有约定、不写死 Redis（已随 PR #298 合入 `main`（`a61a764`），复用 `PresenceStore`）。跨实例 presence 仍缺。
- [ ] 冲突合并的验收标准包含"块级收敛"，不再单列自研工作包（进程内两编辑器单测已覆盖；**双浏览器未实机验证**）
- [x] **按 D1 处置旧协同旁路（A2b）**（已随 PR #298 合入 `main`（`a61a764`），`64d39ab`）：`AppendCRDT` / `POST /documents/:id/crdt` / `httpTransport.postUpdate` / `appendCrdtUpdate` 降为只读拒绝写入，历史 `GET` / `CRDTUpdates` 仍可读；`CollabDoc` 默认不可写。单测已锁住「旧旁路不再写入」。未在真实浏览器验证开启/关闭协同。
- [ ] 验收：两个浏览器同开一篇文档，输入可互相收敛——**未在真实浏览器验证**，不能勾选

#### A3 存储与消息（部分可并行，4–6 人日不含完整块级审计）

与协同无依赖的是对象存储和评论通知，**不是**全部 A3 项。

- [x] 附件对象存储配置接口（已随 PR #298 合入 `main`（`a61a764`），`f27817e`）：`WriteHashed` / Open / Delete 走 `BlobBackend`；S3 兼容（MinIO）用 SigV4，凭据只读环境变量；缺端点/桶/密钥时回退本地磁盘。分片上传仍先在本地临时目录组装再写入当前后端。**代码已备，缺运维配置，生产数据未切换。** 未对真实 MinIO 做迁移或验收。
- [x] 评论通知链路（站内 / 邮件）（已随 PR #298 合入 `main`（`a61a764`），`c037783`）：新评论/回复/@ 写 `core_user_notifications`，并尝试发信；SMTP 未配置或发送失败只记日志，不让评论写入失败。测试不发真实邮件。未实机验证、未真实发信。
- [x] **用户维度审计流水「谁在何时改了哪个块」**（已随 PR #298 合入 `main`（`a61a764`），骨架+只读列表 `bc0404e` / `2e45f76`，表为 `kb_doc_audit_events`）。块模型见 B2。审计列表未实机验证。

### Phase B —— A1 + A2 之后（约 2 周）

#### B1 协作光标与在线名单（3–5 人日）

- [x] 依赖 A2 的 presence 通道；用 Yjs relative position，**不依赖块表**（已随 PR #298 合入 `main`（`a61a764`），`7d62fa0`）。复用 Hertz WebSocket 与 `PresenceStore`，用 `y-protocols` Awareness 传光标/选区，并接入 `@tiptap/extension-collaboration-caret`。未实机验证。跨实例 presence 仍缺。
- [x] 正文内协作者光标、选区、在线成员列表（已随 PR #298 合入 `main`（`a61a764`），`7d62fa0` / `43d5450`）。正文渲染他人光标/选区（名称与配色），DocView 展示在线名单；离房或断开后从名单移除，并清掉远端鬼光标；重连会再上报本地 awareness 并按新的 presence 修剪远端状态。浏览者只读约束保留。未实机验证。

#### B2 块实体化主体（15–18 人日）

- [x] 数据模型（已随 PR #298 合入 `main`（`a61a764`））：`kb_doc_blocks`（`23ad7ce`，后补预留 `permission` 字段；有别于已有的 `kb_content_blocks`），以及 `kb_doc_block_revisions`、`kb_doc_block_refs`（`4d087e9`）。块级权限界面见 C2 `f1022ac`。
- [x] 索引：`(document_id, ordinal)`、`(parent_id)`、`(deleted_at)`（`23ad7ce`，非唯一以兼容软删）；`(target_block_id)` 已建在 `kb_doc_block_refs`（`4d087e9`）。已随 PR #298 合入 `main`（`a61a764`）。
- [x] 迁移（已随 PR #298 合入 `main`（`a61a764`），`23ad7ce`）：`internal/db/db.go` AutoMigrate 已注册，并同步 documents / projects / 并发 / backup 测试库 SQLite 影子模型。
- [x] 抽取器升级（已随 PR #298 合入 `main`（`a61a764`），`23ad7ce`）：`content.Block` 增 `ID / ParentID / Type / Depth / Attrs`。按 D3 只抽「顶层 + 一级嵌套」，身份用 A1 `data-block-id`，不做全量递归。
- [x] 保存管线对新表 `kb_doc_blocks` 为 **upsert + 软删**（已随 PR #298 合入 `main`（`a61a764`），`23ad7ce`），与 `current_data` 同事务；单人保存与协同 `FlushDerived` 都写入。**旧表 `kb_content_blocks` 仍全删全建**（兼容期双写，有意保留）。
- [x] 引用体系（已随 PR #298 合入 `main`（`a61a764`），`4d087e9`）：heading / image / table / bookmark 优先 `blockId`，旧 ID 降为 `anchor_key`；`findCrossRef` / `findCrossRefPos` 按 blockId 定位，标题文本仅作降级并打 `lost`。既有 `core_page_references` 表扩了 `source_block_id` / `target_block_id` / `anchor_key`；`kb_doc_block_refs` 写入交叉引用并支持反查。老引用不硬切。
- [x] 批注锚点（已随 PR #298 合入 `main`（`a61a764`），`4d087e9`）：`DocComment` 增 `block_id` + `block_offset`，`ensureCommentBlockAnchors` 回填，对不上的旧评论保留 Quote / Anchor 降级。
- [x] API（已随 PR #298 合入 `main`（`a61a764`））：`GET /documents/:id/blocks`、`GET /documents/:id/blocks/:blockId`（`23ad7ce`）；`GET /documents/:id/blocks/:blockId/refs` 块级引用反查（`4d087e9`）；`PATCH /documents/:id/blocks/:blockId/permission`（`f1022ac`）。默认不含软删行；无权限与文档不存在一样 404。列表/详情含 `permission`。块级权限界面见 C2 `f1022ac`。
- [x] 兼容期双写（已随 PR #298 合入 `main`（`a61a764`），`23ad7ce`）：老 `kb_content_blocks` 保持不变，新表 `kb_doc_blocks` 并行写。

#### B3 正文内嵌数据库块（并行，随时插队）

- [x] 多维表格可内嵌为带 A1 稳定 `data-block-id` 的正文块（已随 PR #298 合入 `main`（`a61a764`）；骨架 `0c56be1`，最小筛选/视图/块内协同 `8dc02c4`，组合筛选与画廊/日历 `6b5081e`，手动同步 `bf2f17d`，比较筛选与增删行/排序/月历 `3667a89` / `00d7b1d` / `f5383d9` / `66745b8`，拉取提示 `be92160`，分叉确认 `f59ce93`）。斜杠可插入。筛选构建器支持多条件且/或，以及包含/等于/比较等算子，刷新后保持。视图：表格/看板/画廊/可翻页月历，可按列排序，可增删行与改单元格，刷新后由 `data-sheet` / `data-view-type` 保持。关联树上既有 `kind=sheet` 时可手动拉取或写回快照（最后写入为准，不是实时双向）；拉取会丢掉失效筛选并提示，并清掉无效排序。上次同步后若两边都改过，会先确认再覆盖，仍不是实时双向。月历可回到今天；画廊在无匹配行时给提示。独立 `kind=sheet` **未删除**。双编辑器单测不丢稳定 `data-block-id`。日历是月历不是完整日程/重复事件；不是飞书多维表。未实机验证。 本轮加深（功能分支 `agent/met-4-deepen-20261127`，已随 PR #299 合入 `main`（`121e654`））：`e7958b8` 仅一边改过时，朝会覆盖那一侧的方向需确认；`c939375` 打开文档、窗口聚焦和定时对照会标出「树上有更新 / 有未写回改动 / 两边都改过」，「安全同步」只处理单边改动，两边都改过仍要手动选择方向；`09aa8e4` 筛选增加「不包含」，添加条件时按字段类型给出默认比较方式，单选/复选框用选项选择值。仍不是实时双向同步，内嵌仍是快照。未实机验证。 本轮再加深（功能分支 `agent/met-4-deepen-20261127-2`，已随 PR #301 合入 `main`（`cc55f28`））：打开文档、窗口聚焦和定时对照后，若仅树上有更新则自动拉取，若仅内嵌改过则自动写回；两边都改过或尚未对照仍不覆盖，只读浏览只标状态。仍不是实时双向同步，内嵌仍是快照。未实机验证。 本轮再加深（功能分支 `agent/met-4-deepen-20261127-3`，已随 PR #302 合入 `main`（`df35968`））：对照改用稳定指纹并兼容历史指纹，避免单元格键顺序或旧指纹把未改内容判成两边都改过；两边都改过时按字段和行给出差异摘要，徽章和确认框会展示，仍不自动覆盖。仍不是实时双向同步，内嵌仍是快照。未实机验证。 本轮再加深（功能分支 `agent/met-4-deepen-20261127-4`，**尚未合入 `main`**，`47ebd999e8852c33e086a2dd1d8d9e84763f531c`）：两边都改过时用上次同步指纹作基线做三方对照；不相交的字段、行和单元格会在打开、聚焦或定时对照后自动合并到两边，相交冲突（同一单元格两边都改、或一边删除一行另一边改同一行）仍跳过不覆盖；多块连续同步按当前块位置查找。仍不是实时双向同步，内嵌仍是快照。未实机验证。

### Phase C —— 收口

- [x] C1 协同下的冲突呈现与「谁的版本」合并 UI（已随 PR #298 合入 `main`（`a61a764`），最小可用界面 `2001978`，按块 ID 合并与预览 `3667a89` / `00d7b1d`，对照摘要 `55f2135`）。409 时并排预览你的 / 对方的版本，可选我的、对方的，或合并两边；有 `data-block-id` 时按块合并（相同块保留一份，冲突块并排并加标记），无 ID 时仍拼接对方+我的。合并不清洗审阅标记。冲突面板有合并预览。不是飞书级三方合并。未实机验证。 本轮加深（`dfeabab`，已随 PR #299 合入 `main`（`121e654`））：冲突面板列出冲突块，可分别选择用我的、用对方的或并排保留；未选择的冲突块仍并排保留。不是飞书级三方合并。未实机验证。 本轮再加深（`3dd0c34`，已随 PR #301 合入 `main`（`cc55f28`））：顶层是 callout / 引用等包装且内部恰好一个稳定块 ID 时，按该 ID 对照并保留外包 HTML；按块选择我的或对方的不剥审阅标记；合并预览与落地使用同一套 HTML。不是飞书级三方合并。未实机验证。 本轮再加深（`c6ba87b`，已随 PR #302 合入 `main`（`df35968`））：多层包装，或一边有包装、另一边是裸块时，仍按同一稳定块 ID 对照；按块选择不剥审阅标记，预览与落地一致。不是飞书级三方合并。未实机验证。 本轮再加深（`7038b3036acc94e43339e613e42fed0214729ada`，功能分支 `agent/met-4-deepen-20261127-4`，**尚未合入 `main`**）：按块对照时先解析再按标签、排序属性和子节点比较，属性顺序或标签空白不同但 DOM 等价的块视为同一份，不再误报冲突；仍不剥审阅标记。不是飞书级三方合并。未实机验证。
- [x] C2 协同 × 权限 / 审阅语义的最小共存（已随 PR #298 合入 `main`（`a61a764`），审阅共存 `2b2f3f3`，块级权限 `f1022ac`，编辑器内只读 `b89034d` / `97b8c81`）：浏览者只读仍有效；建议模式与接受/拒绝修订不绕过 canWrite 与块只读；冲突选择或合并保留 `data-suggestion` 标记。可在界面设置 inherit/edit/owner/readonly；仅 owner/admin 可改；保存与协同追加按 `kb_doc_blocks.permission` 拦截，浏览者/无 canWrite 不能绕过。无权限（readonly / 无 canWrite）的块在编辑器内只读，建议接受/拒绝不能绕过；选中只读块时有横幅；协同远端 y-sync 更新仍可写入以免挡收包。不是飞书级 ACL，无字段级权限。未实机验证。 本轮缺口补丁（`e7958b8`，已随 PR #299 合入 `main`（`121e654`））：选区从可写块跨过中间只读块时，视为不可编辑。未实机验证。
- [x] C3 存储与通知的规模化收尾中能安全落地的部分（已随 PR #298 合入 `main`（`a61a764`），`4d66db4`）：通知按用户+评论+类型幂等；邮件最多重试一次并做单进程限流；S3 可重放流对 429/5xx 重试。说明见 `pros/api/docs/storage-and-notifications.md`。跨实例 presence、生产 MinIO 切换、真实发信**未验证**。

---

## 3. 开 Phase A 前必须拍板的架构决策

### D1 正文接 Y.Doc 后，知识库现有 HTML 级 CRDT 如何处置

- [x] 建议（已于 2026-11-26 19:04 拍板）：知识库文档**也走正文 Yjs**，`kb_crdt_updates` 降为历史 / 只读；处置本身仍属 A2b
- [x] 代价（`64d39ab` 已重定义，已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`））：「开启/关闭协同编辑」改为编辑模式之一——开启走正文 Yjs，关闭回到单人保存，且不再写 `kb_crdt_updates`
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
  - B1 `7d62fa0`（2026-11-26 21:05 左右，Asia/Shanghai）：相对 `2e45f76`，`vue-tsc` 仍 62、集合完全一致；`vitest` 6 失败 / 1940 通过 / 1 跳过（多 6 个光标/名单/只读用例），失败名单不变；`go build` 与 `go test`（service / handler）通过。
  - B1 完善 `43d5450` + B2 第一刀 `23ad7ce`（2026-11-26 21:48 左右，Asia/Shanghai）：相对 `7d62fa0`，`vue-tsc` 仍 62、集合完全一致；`vitest` 6 失败 / 1942 通过 / 1 跳过（多 2 个离房清光标 / 重连同步用例），失败名单不变；`go build` 与 `go test`（content / service / handler）通过。
  - 合入 `main`：功能分支经 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) squash 为 `a61a7649e742b37f2e65bc63085ba073555fdd57`（2026-11-27）。合入前门禁（head `efb9fd8`）：`vue-tsc` 仍 62（集合与历史预先存在的那批相同），`vitest` 6 失败 / 2010 通过 / 1 跳过，失败名单不变；Go 构建与相关测试通过。未等 CI 全绿。
  - 加深分支 `agent/met-4-deepen-20261127` 经 [PR #299](https://github.com/zsy619/MetaMatrix/pull/299) squash 为 `121e654b4a51c058b30ca66ab72a455fef1570bd`（相对 `a61a764`，2026-11-27，Asia/Shanghai）：失败名单与基线相同，`vue-tsc` 仍 62（22 个文件，集合不变）。`e7958b8`：`vitest` 6 失败 / 2013 通过 / 1 跳过。`c939375`：6 失败 / 2015 通过 / 1 跳过。`09aa8e4`：6 失败 / 2018 通过 / 1 跳过。`dfeabab`：6 失败 / 2020 通过 / 1 跳过。本轮无 Go 代码改动。
- 判定回归时用干净 worktree 对同一条命令对比上表，不要沿用 `54abf501`。
- 判定回归：在干净工作树对同一条命令对比基线。**不要用 `git stash`** 制造干净树（当前仓库可能有未提交的 `package.json` 等改动，stash 有误伤风险）。可用独立 worktree 检出基线 SHA 来对比。
- 历史噪声不算回归；**本批次新引入的**类型错误或测试失败必须停并回报，不连续蛮干。

---

## 6. 未验证与不承诺

- 本文档只做**代码级核查**。A2–C 的代码已随 [PR #298](https://github.com/zsy619/MetaMatrix/pull/298) 合入 `main`（`a61a764`），但未在浏览器里点过协同、块实体、协作光标任何交互，不能写成验收通过。
- 未跑 Safari / Firefox，未验证深色模式下的块手柄与协作光标可读性。
- 工期是按当前代码规模估的粗算，不是承诺；A2 的真实成本取决于 D1 / D2 的选择，须按 A2a / A2b 拆开评估。
- 飞书侧行为未逐项打开网页核对，本文只引用分享文档中的技术分析，不把推测写成飞书实现。
- 本文件已随仓库入库。2026-11-27 将本地更完整的勾选与提交说明，按新表名和已合入状态合并进 `main` @ `a61a764` 的工作区副本；该合并本身仍是未提交的文档改动。
