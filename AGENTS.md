# 元矩阵 MetaMatrix — 项目全局规则

> 本文件是本仓库（`元矩阵/`，业务代码在 `pros/`）的强制规则。
> 与用户当次指令冲突时以用户指令为准；与本文件冲突时以本文件为准。

---

## 1. 项目结构与运行环境

- `元矩阵/pros/api/`：Go + Hertz + GORM（模块名 `metamatrix/api`）
  - `cmd/server/main.go`：入口，**所有路由注册在这里**
  - `internal/handler/`：HTTP 层，只做参数解析 + 调 service
  - `internal/service/`：业务层（事务、权限、组装）
  - `internal/model/`：GORM 模型，表结构唯一事实来源
  - `internal/db/`：连接 + AutoMigrate + `ensure*Schema` 补丁
  - `api/.env`：`DATABASE_URL` / `PORT` / `JWTSecret`
- `元矩阵/pros/web/`：Vue3 + Element Plus + Pinia + Vite
  - `src/views/` 路由页面；`src/components/{knowledge,canvas,rte,common}/`；`src/api/`；`src/styles/`；`src/store/`
  - token 在 Pinia `useUserStore().token`
- `元矩阵/docs/`：规划与设计文档

运行：

- 前端 `http://localhost:5173`，后端 `http://localhost:3000`。
- 后端路由 **不带 `/api` 前缀**（Vite 代理负责去掉），前端只写 `/projects/...`。
- 数据库 PostgreSQL `localhost:5433`。
- 启动：`cd pros && ./dev.sh`（`./dev.sh restart` 重启）；常驻服务由 launchd `com.metamatrix.dev` 托管，
  改后端后 `launchctl kickstart -k "gui/$(id -u)/com.metamatrix.dev"` 生效。
- 调试 token 放 `/tmp/tok.txt`，调用带 `Authorization: Bearer $(cat /tmp/tok.txt)`。

---

## 2. 全局设计规范：Telegram Web K（硬性规则，优先级最高）

**唯一实现入口：`pros/web/src/styles/telegram.css`**，在 `main.ts` **最后**导入（晚于 `glass.css` / `enterprise.css`），
冲突时以本规范为准。完整规范文档：`docs/design/telegram-design-system.md`（色彩 / 圆角 / 尺寸 / 弹窗 / 表单 / 动效）。

- **所有弹出框**（`el-dialog`、`el-message-box`、`el-drawer`、下拉/气泡/选择器、面板最大化 `.pm-card`、
  RTE `.rte-modal`、版本历史 / 公式 / 附件预览 / 画布属性等自绘浮层）统一走本套表面：
  纯白底、圆角 `12px`、中性投影 `0 24px 64px rgba(15,23,42,.18)`、遮罩 `rgba(0,0,0,.45)` + `blur(3px)`。
- **标题**：左对齐 `16px/600`，**不再加竖条装饰**；关闭按钮 `28×28`、圆角 `8px`、hover 填充浅灰。
- **按钮**：圆角 `12px`，高度 `32/36/40`；主按钮实心 `--tg-blue(#3390ec)`，次按钮白底 + 发丝线；
  弹窗底部动作区右对齐，主次按钮最小宽度 `88px`。
- **输入类**：圆角 `12px`、白底 + `1px` 发丝线，聚焦转品牌蓝并带 `3px` 柔光环。
- **分段控件**（目录/收藏/归档、概览/内容/图谱、树结构/最近更新等）：灰底圆角容器 + 白色药丸选中块，
  **单项不再各自描边**，整组看起来是一个按钮组。
- **令牌只从 `telegram.css` 的 `:root` 取**（`--tg-*`），不要在组件里另起一套颜色。
- 文字对比度 ≥ 4.5:1；正文纸面（富文本正文、思维导图画布、多维表格内容区）保持不透明。
- 动效统一 `160ms cubic-bezier(.2,.8,.3,1)`；`prefers-reduced-motion` 下关闭过渡。

---

## 2.1 玻璃拟态设计系统（页面外壳材质，优先级低于第 2 节）

唯一实现入口：`pros/web/src/styles/glass.css`（在 `main.ts` 于 `telegram.css` **之前**导入）。
玻璃负责「页面外壳」质感（极光背景、侧栏、卡片外壳）；**表面之上的弹窗/浮层/表单一律按第 2 节 Telegram 规范**。

### 2.1.1 三条不可破坏的实现约束

1. **背景必须分层**：`html` 承担底色，`body` / `#app` 必须 `background: transparent`，
   极光渐变放 `body::before`（`position: fixed; inset: 0; z-index: -1`）。
   给 `body` / `#app` 加任何不透明背景，都会让 `backdrop-filter` 采不到颜色层，
   玻璃退化成"纯白半透明"——本项目已踩过的坑，禁止重犯。
2. **正文纸面保持不透明白**：富文本正文纸面、思维导图画布、多维表格内容区保持不透明，
   只把"外壳 / 工具栏 / 弹窗"做成玻璃，保证长文与数据的可读性。
3. **文字对比度 ≥ 4.5:1**：玻璃只改表面质感，不改文字颜色层级。

### 2.1.2 令牌（只用这些，不要另起一套）

`--glass-blur: 18px` / `--glass-blur-sm: 10px` / `--glass-saturate: 165%` /
`--glass-bg: rgba(255,255,255,.24)` / `--glass-bg-strong` / `--glass-bg-soft` /
`--glass-bg-hover` / `--glass-border: rgba(255,255,255,.7)` /
`--glass-ring: rgba(15,23,42,.09)` / `--glass-shadow` / `--glass-shadow-sm` /
`--glass-sheen`（顶部反光）/ `--glass-aurora`（页面极光背景）。

### 2.1.3 组件规则

- **表格**：`.el-table` 表头 `rgba(255,255,255,.62)` + blur，行悬停 `rgba(255,255,255,.58~.62)`，
  表格外框用玻璃卡片容器（圆角 + 1px 玻璃描边 + `--glass-shadow-sm`）。
- **弹窗**：已改为按第 2 节 Telegram 规范（实心白底 + 12px 圆角），玻璃只保留给页面外壳；
  不要再给 `.el-dialog` / `.el-message-box` 加反光与玻璃底。
- **工具栏按钮悬停（全局一致）**：白玻璃片 + 顶部高光 + `translateY(-1px)` + `--glass-shadow-sm`；
  主按钮保留品牌色渐变。禁止出现与整体风格冲突的不透明底色悬停（如 `--mm-hover` 这类旧灰底）；
  需要覆盖组件 scoped 旧规则时用 `!important`，并写清原因。
- **Element Plus 默认白底**（tree / card / collapse / tabs / table）统一透明化，
  否则会盖住背后的极光层。
- 新增组件默认玻璃材质；确需不透明白的场景要写注释说明原因。

---

## 3. 知识库与分享域规则

- 知识库内容有四种 `kind`：`doc` / `canvas` / `mindmap` / `sheet`，
  由 `model.KnowledgeShare.Kind` 承载；新增类型必须同步 handler / service / 前端分派。
- 分享目标二选一：`DocumentID`（文档/画布文档）**或** `NodeID`（导图/表格节点），不能同时为空。
- 权限语义：口令只存 SHA-256 摘要；`AllowCopy=false` 禁止复制正文；
  白名单 `AllowUsers` 非空时仅名单内可访问。
- **当前限制（写代码要尊重）**：思维导图、多维表格的分享页是只读预览，
  不支持在线编辑与评论落地；`AddShareComment` / `UpdateShareContent` 对非 doc 类型直接报错。
- 节点分享走 `/projects/:projectId/knowledge/nodes/:nodeId/shares`；文档分享走 `/documents/:id/shares`。
- 改既有表结构（如 `knowledge_shares`）时，在 `internal/db/db.go` 的 `ensure*Schema` 里补迁移
  （放开 NOT NULL、加列、加索引、回填存量），不要只依赖 AutoMigrate。
- 单元测试里的 SQLite 影子模型（`knowledge_v3_test.go` 等）必须与 GORM 模型同步增删字段，
  否则报 `table X has no column named Y`。

---

## 4. 后端约定

- 分层严格：`handler`（解析/校验/调 service）→ `service`（事务/权限/组装）→ `model`。
- 新表结构：`model` 定义 + `db.Connect` 的 AutoMigrate 注册 + `ensure*Schema` 补丁。
- 路由统一在 `api/cmd/server/main.go` 注册，按域分组。
- 错误不能吞：对外统一 JSON 错误结构，内部留日志。
- 审计写库失败只记日志不阻断主流程（已知噪声：
  `activity log write failed: value too long for type character varying(96)`）。

## 5. 前端约定

- 鉴权：token 一律取 `useUserStore().token`，`httpPost/httpGet` 自动注入 `Bearer`；
  **禁止**从 `window.*` / `localStorage` 取 token，禁止裸 `fetch` 手写 Authorization。
- 上传：优先用现成封装（如 `src/api/infra/file.ts` 的 `appFileUploadApi`），不要裸 fetch。
- 图标：统一走系统组件 `src/components/common/IconPicker.vue`（分组、≥1000 图标、颜色分组），
  知识库标题 / 画布标题等所有入口共用同一个组件。
- 组件样式：scoped 覆盖不了全局玻璃层时，要么把该表面挪进全局 `glass.css`，
  要么在组件内用 `--glass-*` 变量 + `!important` 覆盖旧规则并写清原因。
- 新建/菜单类交互按飞书范式：多级联动、悬停展开下级，不做大面板。

---

## 6. 验证门禁（每次改完必须跑）

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

**已知基线噪声（改动前后一致，不算回归）**：

- `vue-tsc` 63 个错误，全部在 `src/components/rte/**` 与 `src/utils/rte*.ts`。
- `vitest` 6 个 rte 文件失败（`RichTextEditor.char` / `rteThreads.char` / `RteTableFormulaBar` /
  `ChartPanel.ops` / `chartPanelModuleSize` / `rteRevisions`）。
- 判定回归的唯一办法：`git stash` 后跑同一条命令对比基线，**不要**凭印象判断。
- 调试产生的分享记录、临时节点要在交付前清理（`DELETE .../shares/:shareId`）。

## 7. 浏览器验证（视觉改动必做）

- 用 CUA 接管 Chrome：`cua.getTab(tabId, { browser: "3" })` → `tab.playwright` / `tab.screenshot()`。
- 悬停效果无法用 AX 触发：用 CDP `Input.dispatchMouseEvent {type:"mouseMoved"}` 移到元素中心，
  再 `evaluate` 读 `getComputedStyle` 的 `background / boxShadow / transform` 作为证据。
- 布局问题要读**具体数值**（`offsetTop`、`getBoundingClientRect`），不要只看截图说"好了"。
- 截图写 `/tmp/*.png`，回复里用绝对路径引用。
- 改完 `glass.css` 必须整页 reload 再截图：aurora 层是 fixed 伪元素，HMR 不一定刷新。

---

## 8. 协作偏好

- 中文回复，结论先行；复杂任务先给 3 步计划再给结果。
- 用户要"截图确认"时，回复里必须带图，并附上关键 DOM 数值。
- 交付说明显式写出：**跳过了什么、没检查什么、用户需要承担的风险**。

