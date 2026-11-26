# 类飞书文档编辑器：实现技术路线调研

> 调研日期：2026-11-26　范围：面向「元矩阵」知识库文档（doc）编辑器的技术路线选型
> 关联文档：`docs/rte-prosemirror-feishu.md`（功能对照）、`docs/rte-feature-matrix.md`、`docs/rte-feishu-gap.md`、`docs/rte-collab-block-roadmap.md`（实施顺序，以此为准）
> 2026-11-26 修订：调研结论（继续走 Tiptap + Yjs + Hocuspocus）仍有效；下文旧「P0 先上字符级 CRDT 并复用 HTTP、后端零改造 → P1 再上 WebSocket → P2 再补块 ID」的落地顺序已废止，任务清单以 [rte-collab-block-roadmap.md](./rte-collab-block-roadmap.md) 的 A0/A/B/C 为准。
> 状态更新：2026-11-26 20:51（Asia/Shanghai）只回写第 5 节任务索引的勾选与说明，其它正文不改。

---

## 0. 结论先行

1. **不建议换内核**：现有 `Tiptap 3 + ProseMirror` 已是飞书级编辑器的合格底座（schema 可控、命令体系成熟、Vue 3 绑定完善）。换成 Lexical / BlockNote / Slate 属于「重写而非演进」，收益不足以覆盖改造成本。
2. **真正的短板是协同，不是编辑器**：当前协同只有「顶层块级 LWW」的 HTTP 增量同步，且**尚未接入主编辑器**；字符级 CRDT、WebSocket 通道、光标 presence 才是与飞书差距的主体。
3. **默认推荐路线（路线 B 演化版）**：
   - 实施顺序已改，见 [rte-collab-block-roadmap.md](./rte-collab-block-roadmap.md)：先 A0（D1/D2/D5 与门禁基线）→ A1 稳定块身份与 A2 协同底座（WS + 字符级 Yjs，旧 HTML CRDT 按 D1 收口）并行，A3 存储/通知可并行但块级审计依赖 A1 → B1 光标、B2 块实体化、B3 内嵌数据库块 → C 收口。
   - 不再采用「先复用 HTTP、后端零改造上字符级 CRDT，块身份留到最后」的路径：块 ID 必须先于或至少同步于协同协议；先协同后补 ID 会使已协同历史文档都要补偿回填。
   - 栈选型不变：Tiptap Collaboration / CollaborationCaret + Y.Doc + WebSocket（Hocuspocus 或 Hertz websocket），块表双写放在 B2。
4. **不推荐现在嵌入 OnlyOffice / Collabora**：那是「OOXML 保真 + 表格/排版引擎」路线，会牺牲我们已有的自定义富文本能力（时间线、图表、公式栏、模板中心、面板化 UI），且引入 iframe 通信与独立鉴权模型；只有在客户明确要求「Word 文档双向保真」时再启用。
5. **自研编辑器内核**（路线 E）不推荐：schema、选区、输入法（IME）、撤销栈、协同、粘贴净化、辅助功能（a11y）每一项都是数千行级工程量，无差异化收益。

---

## 1. 五条路线卡片

### 路线 A｜自研 ProseMirror + 自研协同
- **形态**：直接用 `prosemirror-model / view / transform / state`，自己写 schema、插件、命令、协同层。
- **优势**：控制力最强，无框架锁定；协作与业务深度绑定。
- **代价**：IMEs、选区/手势、撤销重做、粘贴净化、a11y、表格、协同合并都要自己踩坑。
- **适用**：只有当产品里有 ProseMirror 无法表达的核心交互（如本项目的「块级属性面板 + 双向绑定属性」）时，作为**在 ProseMirror 之上写插件**是可行的；但重写内核不可取。
- 结论：作为「插件层」接受，作为「内核层」否决。

### 路线 B｜Tiptap + ProseMirror + Yjs + Hocuspocus（官方栈）✅ 推荐
- **形态**：`@tiptap/core` 提供 schema/命令/扩展；`y-prosemirror` 把 ProseMirror 文档与 Y.Doc 双向绑定；`yjs` 提供 CRDT 合并；`@hocuspocus/provider` + Hocuspocus 服务端负责 WebSocket 通道、awareness 与持久化钩子。
- **优势**：
  - Tiptap 3 已内置 `@tiptap/extension-collaboration`（Yjs）与 `CollaborationCaret`（远端光标）路径，接入成本低；
  - ProseMirror 生态的表格、批注、提及、数学公式等扩展可平移；
  - Hocuspocus 官方文档提供「协作编辑指南」，与我们的 Go 服务端可用「授权 + 存 Yjs 更新」的最小耦合方式对接。
- **代价**：需要维护一套 WebSocket 服务（可用 Node 侧车进程），运维多一个组件；awareness 状态需自行持久化策略。
- 契合度：**最高**。项目 `package.json` 已有 `@tiptap/* ^3.32.0` 与 `yjs ^13.6.33`，`prosemirror-yjs` 是其近邻依赖，接入增量小。

### 路线 C｜Lexical / BlockNote / Slate
- **Lexical**（Meta）：React 优先的编辑器内核，节点模型精细、有 `yjs` 官方集成与 devtools；**与 Vue 3 的绑定需自写**，且本项目富文本组件体量大，迁移成本高。
- **BlockNote**：建立在 Lexical/ProseMirror 之上的「块编辑器」体验，开箱即有 AI 与协作者集成，适合「Notion 式块文档」；但其 schema 与本项目自定义块（时间线、图表、公式栏）需要逐个重写，且**已有 CSS/UI 资产无法复用**。
- **Slate**：数据模型最灵活，JSON 树直存，但性能与生态弱于 ProseMirror/Lexical，且官方协作方案偏弱。
- 结论：**不换**。若未来要做「飞书白板式多模态块」而非富文本流，才值得评估 BlockNote 作为参考实现。

### 路线 D｜嵌入 OnlyOffice / Collabora（OOXML 引擎）
- **形态**：DocumentServer / Collabora 以 iframe 嵌入，提供 Word 级排版、协同（OnlyOffice 内部用自研 CRDT）、PDF 导出。
- **优势**：OOXML 双向保真、复杂表格与分页、Office 兼容。
- **代价**：
  - 编辑体验与我们的 Telegram 视觉规范、ribbon 工具栏、块级面板完全割裂，只能作为「附件级 Office 编辑」；
  - 协同会话是独立的 iframe 生命周期，与我们的评论/版本/知识库树**无法打通**；
  - 部署重（DocumentServer 需 Postgres + RabbitMQ 级别的运维）、二次开发需用其插件 API。
- 结论：**作为附件能力可选，不作为主编辑器路线**。

### 路线 E｜自研内核 / Canvas 渲染编辑器
- 形式：自研 DOM/Canvas 渲染 + 自研选区/IME/撤销。
- 结论：**否决**。此类工程在飞书、Notion 这类团队均投入数百人年；我们的差异化在知识库与画布业务，而非内核。

---

## 2. 行业事实归纳（可核验）

- **飞书开放平台 docx v1**：文档以「块（block）」为基本单元，通过 `GET /open-apis/docx/v1/documents/:document_id/blocks` 获取块列表，块有 `block_type` 与 `children` 结构 —— 说明飞书是**块树数据模型**，不是单一富文本流。（页面为 SPA，正文未逐页抓取，结论来自其接口目录与官方文档描述）
- **Google Docs**：早期基于 OT（Operational Transformation）引擎；公开技术分享中常被概括为 "Jupiter" 客户端与 "Wave" 服务端管线。
- **Microsoft Fluid Framework**：以 Fluid Container / Data Structures 为基础的 **CRDT** 路线，官方开源。
- **Etherpad**：经典 **OT** 协同编辑器（可自托管，附 Etherpad CLI 工具）。
- **Automerge**：CRDT 库，主打 JSON 文档与本地优先。
- **Local-first 七原则**（Ink & Switch 提出）：本地优先、远端同步、多设备并发、无网络也能工作、协作与协作引擎解耦、保留历史与隐私、数据可导出与再导入 —— 可作为我们「离线编辑 + 后端同步」的验收标准。
- **编辑器内 AI 的主流做法**：块级 JSON + 节点级定位（按 block id 增删改）优于对整段 HTML 做字符串操作 —— 这也是飞书「AI 划词/块改写」的底层前提。

---

## 3. 四条分水岭（选型时真正要看的）

1. **块树 vs 富文本流**：飞书/Notion = 块树（每块独立 id，可并行编辑、可单块 AI 改写）；Tiptap 传统 = 单文档流（ProseMirror 节点树仍可给节点加 id，但默认不暴露）。→ 我们要往块树靠，但**不必换内核**，只需给顶层块加稳定 id 并把块内容映射到 Y.Map（现有 `crdtDoc.ts` 已近此形）。
2. **OT vs CRDT**：OT 需要中心化转换服务器且对离线/乱序敏感；CRDT 可交换、可幂等、离线友好 → 我们已选 CRDT（Yjs），**不要中途混入 OT**。
3. **存储形态**：HTML（我们现状 `kb_documents.current_data`）/ 块 JSON（飞书）/ OOXML（OnlyOffice）。HTML 便于渲染与导出，但**不适合机器改写与结构化检索**；建议长期以**块 JSON 为事实源、HTML 为派生视图**。
4. **渲染载体**：DOM 渲染（ProseMirror/Lexical/BlockNote，可访问性好、选区天然）vs Canvas 渲染（性能天花板高，但 a11y 与富文本交互成本极高）。→ 保持 DOM 渲染；画布类产品走现有自研 Canvas，不混进文档内核。

---

## 4. 我们现状盘点（代码级证据）

**前端**
- `pros/web/package.json`：`@tiptap/core|pm|starter-kit|vue-3|table|...` 均 `^3.32.0`；**已依赖 `yjs ^13.6.33`**。提交 `4f438f1` 另预装 `@tiptap/extension-collaboration` 与 `@tiptap/extension-collaboration-caret`（^3.32.0），源码仍为零引用。若工作区未提交改动去掉了这两项，以提交为准，开工前先核对。
- `pros/web/src/components/knowledge/collab/crdtDoc.ts`：自研协同层，基于 Yjs，粒度是**顶层块 LWW**（`Y.Map<HTML>`），传输层 `httpTransport()` 走 `fetchCrdtUpdates` / `appendCrdtUpdate`（HTTP 拉/推增量，无 WebSocket）。
- 使用方：`pros/web/src/components/knowledge/DocView.vue`（**动态 import** 后初始化）——**尚未接入 `RichTextEditor.vue` 主编辑器**，即「协同能力存在但用户用不到」。
- 编辑器体系：`src/components/rte/**`（ribbon 工具栏、块面板、图表、公式栏、评论线程、模板、Markdown 导入等）+ `src/utils/rte*.ts`。

**后端**（Go + Hertz + GORM + PostgreSQL）
- `pros/api/internal/model/knowledge_v3.go`：doc 正文以 **HTML** 存 `kb_documents.current_data`；结构化节点存 `kb_node_data`。
- `pros/api/internal/model/knowledge_v6.go`：`DocCRDTUpdate`（`kb_crdt_updates`，seq 增量日志）、`KnowledgePresence`（`doc_presence`，DB 落库 + TTL）、`KnowledgeChunk`（RAG 切片）。
- 版本 `kb_doc_versions`、评论 `kb_comments`、分享 `kb_shares`。
- **全仓无 WebSocket 依赖**（grep `websocket|hocuspocus|gobwas` 无命中）；后端路由不带 `/api` 前缀。

**缺口清单**
- G1 无 WebSocket 通道 → 协同只能轮询，实时光标不可得。
- G2 CRDT 粒度为块级 LWW → 同块并发编辑互相覆盖（同段落打字会丢字）。
- G3 协同层未接入主编辑器 → 用户实际没有协同编辑能力。
- G4 正文事实源是 HTML → 块级 AI 改写、增量结构化检索、跨端渲染困难。
- G5 presence 落 DB + TTL，非实时广播 → 只能做「最后心跳」不能做「谁在线谁在编辑哪段」。

---

## 5. 落地任务清单（顺序以路线图为准）

实施顺序、工期拆分（A2a / A2b）、回填冲突策略和门禁，一律以 [rte-collab-block-roadmap.md](./rte-collab-block-roadmap.md) 为准。本节不再维护一套与之冲突的 P0/P1/P2 排期。

与路线图对齐的任务索引：

- [x] A0：D1 / D2 已于 2026-11-26 19:04 拍板；D3 / D4 / D5 建议随 A1 落地（**多人同时首开旧文档仍未实机验证**）；门禁已在干净 worktree 重测并回写路线图 §5（`4f438f1` / `311593e`：vue-tsc 62、vitest 6 失败 / 1919 通过；勿用 `54abf501` 口径）。协作扩展以 `main` @ `311593e` 已有包为准；Mac 工作区仍有未提交删除这两个包，未带进功能分支，不要在 Mac 上覆盖 `package.json`。
- [x] A1：代码已 squash 合入 `main` `311593e`（PR #297）；复制 / 拖拽 / 粘贴有单测覆盖。**浏览器实机（复制 / 拖拽 / 系统粘贴、老文档打开保存、多人首开）未验证，不能算验收通过。**
- [ ] A2a：功能分支已有 Hertz WebSocket + Collaboration + 心跳重连、成员进房、抖动抽取；`2e45f76` 补了浏览者前端只读与持久离线队列，**尚未合入 main**。双浏览器收敛与只读/离线队列均未实机验证。
- [ ] A2b：功能分支 `agent/met-4-a2a-collab-20261126` @ `64d39ab` 已将 `crdtDoc.ts` / `kb_crdt_updates` 与 `POST /:id/crdt` 降为历史只读（写入被拒绝，历史 GET 仍可用），单测已锁住「旧旁路不再写入」，**尚未合入 main**。开启/关闭协同按 D1 改为正文 Yjs 编辑模式；关闭后走单人保存。未在真实浏览器验证。不计入 A2a 的 8–12 人日。
- [ ] A3：功能分支 `bc0404e` 已做用户+文档级审计骨架，`2e45f76` 已在 DocView 侧栏加只读列表，**尚未合入 main**；块类型/父子未做。MinIO 与评论通知未做。审计列表未实机验证。
- [ ] B1：协作光标 / 选区 / 在线名单（原 P1 的 awareness 验收仍适用：光标可见、权限撤销后通道断开；P95 延迟目标未实机验证）。本轮不把 caret 塞进 A2a。
- [ ] B2：块表双写、稳定 block API、评论锚点（原 P2 验收仍适用，但块 ID 来自 A1，而不是在本阶段才从 `splitBlocks` 临时生成）
- [ ] B3 / C：见路线图

以下旧「P0 后端零改造 + 复用 HTTP → P1 WS → P2 再补块 ID」方案仅作 2026-11-26 调研原文归档，**不再作为任务清单执行**：P0 把块身份留到最后、并假设后端零改造即可完成字符级协同，这两点已被路线图否决。调研里仍有价值的部分是验收意图（同段落不丢字、断网恢复可合并、光标可见、块级 API），已并入上表与路线图对应阶段。

### 不做的事（明确否决）
- 不嵌 OnlyOffice/Collabora 作为主编辑器（仅保留为「附件级 Office 编辑」的可选插件位）。
- 不引入 OT 引擎，不与 Yjs 混用。
- 不自研编辑器内核；DOM 渲染保持不变。

---

## 6. 风险与默认决策

- **WebSocket 运维复杂度**：Hocuspocus 多一个进程与鉴权面；若团队无 Node 运维能力，退路是「Go 自研 WS 网关 + y-websocket 协议」，成本更高但可控 —— 建议先用官方 Hocuspocus 验证语义，再决定是否 Go 化。
- **HTML 事实源的迁移成本**：P2 双写需要一次性 HTML→块 JSON 编译器 + 回归用例；可复用现有 `rteMarkdown.ts` 式的「解析器 + 夹具 + 文档级断言」测试模式。
- **规模不匹配**：若真实并发用户数 < 10，协同投入的 ROI 主要是「体验可信」而非「性能必需」。即便如此，也不应在 HTML 级 LWW 上长期停驻，更不要把「只做块级 CRDT + 冲突提示」当成可以跳过 A1 块身份的理由。
- **默认决策（2026-11-26 修订）**：栈选型仍是路线 B；落地顺序改为路线图的 A0 → A1 ‖ A2 ‖ A3 → B → C。不再「先做旧 P0、块身份留到 P2」。`crdtDoc.ts` 的 transport 抽象仍可参考，但 HTML 级 LWW 不是目标态。是否继续复用 HTTP 增量，服从路线图 D1/D2，而不是作为默认的「后端零改造」前提。

---

## 7. 引用与核验说明

**已 HTTP 200 核验可访问（2026-11-26）**
- Tiptap 协作编辑指南：https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing
- Yjs 文档：https://docs.yjs.dev ；仓库 https://github.com/yjs/yjs
- Tiptap 仓库：https://github.com/ueberdosis/tiptap
- ProseMirror 参考文档：https://prosemirror.net/docs/ref
- Lexical：https://lexical.dev
- BlockNote：https://www.blocknotejs.org/docs
- Automerge：https://automerge.org
- Local-first：https://www.inkandswitch.com/local-first
- OnlyOffice DocumentServer：https://github.com/ONLYOFFICE/DocumentServer
- Collabora Online：https://github.com/CollaboraOnline/online
- Etherpad：https://etherpad.org
- Editor.js：https://editorjs.io
- Fluid Framework：https://github.com/microsoft/FluidFramework
- Notion 指南：https://www.notion.com/help/guides

**未逐页核验（公开资料/接口目录层面结论）**
- 飞书 docx v1 块接口：https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/list （SPA 页面，正文未抓取；「块为基本单元」结论来自接口目录与文档描述）
- Google Docs 内部引擎命名（Jupiter/Wave）、飞书内部协同算法：**未逐页核验**，属公开技术分享的二手结论，引用时建议标注「据公开资料」。

**本仓库证据**：见第 4 节所列文件与依赖（可用 `grep`/`cat` 复核）。

