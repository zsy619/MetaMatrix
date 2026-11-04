# 元矩阵 MetaMatrix · 一页纸教程

> **元数据驱动的通用矩阵 / 象限画布 + 飞书式富文本编辑器**：画布结构与内容分离，画布即 JSON，同一套渲染与存储机制承载四象限、双三角、Y 模型、需求三角等 42 个模板。

本文是**一页纸上手指南**：5 分钟跑起来，10 分钟用会「写文档 + 插图表 + 导出」。更详细的 Schema 与设计取舍见 [`docs/技术选型.md`](./docs/技术选型.md)、[`docs/API.md`](./docs/API.md)、[`docs/GLOBAL_RULES/`](./docs/GLOBAL_RULES/)。

---

## 1. 核心功能清单

- **结构化画布**：42 个模板（`star-quadrant` 四象限、`dual-triangle` 双三角、`y-model` Y 模型、`demand-triangle` 需求三角、五步法系列等），轴标签 / 象限标题 / 条目富文本 / markers 均可编辑；模板 JSON 在 `pros/web/src/templates/`。
- **飞书式富文本编辑器（RTE）**：11 个工具栏分组（编辑、字体与颜色、段落与列表、插入、图表、表格、块与结构、注释与引用、审阅、视图、文件与导出）、斜杠菜单、`@` 提及、查找替换、修订 / 建议模式、只读预览与打印预览。
- **ECharts 图表**：工具栏「图表」分组下 9 个一级分类下拉（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL），覆盖 39 种图表类型；插入后可在「图表属性」面板改类型、改数据、配接口。
- **画布 + 文档双层**：画布页承载模板画布，画布格子内是可放大的富文本编辑器（`最大化` 按钮进入沉浸编辑）。
- **评论 / 批注**：正文选区加评论，线程支持回复、解决 / 重新打开，**随文档 JSON 保存**（不是独立评论服务）。
- **版本与云端**：登录后多用户同步；`存版`、`版本历史`、`与上一版对比`、`AI 上下文`、`克隆画布`；保存为乐观并发模型，冲突时提示并可保留云端或本地版本。
- **导出**：画布级 `导出 JSON` / `导出 Markdown` / `导出图片(PNG)`；编辑器级 `复制为 HTML(飞书)` / `HTML` / `纯文本` / `Markdown` / `PNG` / `PDF` / `Word(.docx)`，图表以真实快照嵌入。
- **工作面板**（`/workspace`）：新建 / 编辑 / 修订趋势、模板与类型占比、活跃热力图、全文搜索、备注待办、CSV 导出。
- **后端 API**：Go + CloudWeGo Hertz + GORM + PostgreSQL（JSONB 存画布）；JWT 登录、图形验证码、登录限流、文档 CRUD / 修订 / 检索 / 备份 / AI 上下文导出；`/health` 健康检查、`/metrics` Prometheus 指标。

> ⚠️ **没有实时协同**：代码中不存在 OT / CRDT，也没有线上光标或成员列表（`yjs` / `WebSocket` / `BroadcastChannel` 均未使用）。多人协作靠「保存时乐观并发 + 409 冲突提示」实现。

---

## 2. 技术栈与目录结构

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Vue Router + Element Plus + TipTap（ProseMirror）+ ECharts / echarts-gl + mermaid + KaTeX |
| 后端 | Go 1.27 + CloudWeGo Hertz + GORM + PostgreSQL（画布存 JSONB）+ golang-jwt + godotenv |
| 部署 | Docker Compose（根目录 `docker-compose.yml`：Postgres + API + nginx 前端） |
| 校验 | vitest（前端单测 / 组件测）+ playwright-core（浏览器 e2e）+ `go test`（后端） |

```
MetaMatrix/
├── README.md                 # 本文件（一页纸教程）
├── docker-compose.yml        # 一键起 Postgres(5433) + API(3000) + Web(8080)
├── docs/                     # 产品与设计文档
│   ├── 技术选型.md            # 栈决策、Schema、版本设计
│   ├── API.md                 # 接口清单
│   ├── 生产配置.md             # 上线前核对项、限流、验证码、快捷键
│   ├── GLOBAL_RULES/          # 全局交互规则（面板最大化、相关资料等）
│   └── _sources/              # 原始材料归档（追溯用）
└── pros/
    ├── README.md             # 前后端启动说明
    ├── api/                  # Hertz + GORM + PostgreSQL
    │   ├── cmd/server/       # main.go：路由注册、/health、/metrics
    │   ├── internal/         # config / db / handler / middleware / service
    │   ├── migrations/       # SQL 迁移
    │   ├── docker-compose.yml# 仅 Postgres（本地跑 Go 用）
    │   └── .env.example      # DATABASE_URL / PORT / JWT_SECRET / CORS 等
    └── web/                  # Vue3 前端
        ├── src/views/        # GuideView(模板库) / WorkspaceView / HomeView(画布) …
        ├── src/components/rte/   # 工具栏、图表属性面板、评论面板 …
        ├── src/templates/    # 42 个画布模板 JSON
        ├── scripts/          # smoke 与 e2e 脚本
        └── package.json      # scripts：dev / build / test / type-check / test:e2e…
```

常用模板 ID（完整列表见 `pros/web/src/templates/`）：

| 模板 ID | 说明 |
| --- | --- |
| `star-quadrant` | 探索–变革–提速–落地（STAR 四象限） |
| `dual-triangle` | 双三角 |
| `dual-triangle-human-ai` | 人类三角 × AI 三角（双三角实例，与 `dual-triangle` 并存） |
| `y-model` | Y 模型 |
| `demand-triangle` | 需求三角 |
| `deliberate-practice` | 刻意练习 |
| `three-ring-basics` | 苦练基本功三环分析法（务实 / 可练 / 价值 三环交叠） |
| `leadership-triangle` | 领导核心价值驱动三角（心甘情愿 → 领导力 → 5 层金字塔） |
| `context-six-elements` | 上下文六要素（富文本画布：目标 / AI 角色 / 我的角色 / 关键信息 / 行为规则 / 交付格式） |
| `product-content` | 产品内核 |
| `scientific-meeting` | 科学开会思考 |
| `annual-summary` | 个人年度工作总结 |
| `deep-review` | 深度复盘关键成果 |
| `incident-review` | 故障复盘 |
| … | 另有 IPO、奥斯卡、行业分析/预测、五步法、权衡类等 |

---

## 3. 快速开始

### 3.1 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 22（CI 与 `pros/web/Dockerfile` 用 22；实测 24 亦可） | 前端构建与测试 |
| Go | 1.27（`pros/api/go.mod`） | 后端 |
| Docker + Compose | 任意较新版本 | 起 PostgreSQL；也可用本机 PostgreSQL 16+ |
| 浏览器 | Chrome / Chromium | 仅 e2e 脚本需要（`CHROME_PATH`，默认 `/usr/bin/google-chrome`） |

### 3.2 一键启动（Docker 全栈）

在**仓库根目录**执行：

```bash
docker compose up --build
```

会拉起三个服务：PostgreSQL 16（宿主机 `5433`）、API（`3000`）、nginx 前端（`8080`，把 `/api` 反代到 API）。
打开 <http://localhost:8080/> 即是模板库。生产部署前请把 `JWT_SECRET` 换成随机长串、把 `CORS_ORIGINS` 改成实际前端地址（默认 `http://localhost:8080`）。

### 3.3 本地开发（推荐日常使用）

```bash
# 终端 1：数据库 + 后端
cd pros/api
cp .env.example .env          # 按需改 DATABASE_URL / JWT_SECRET
docker compose up -d          # 只起 Postgres，宿主机端口 5433
go run ./cmd/server           # http://localhost:3000

# 终端 2：前端
cd pros/web
npm ci                        # 与 CI 一致，严格按 package-lock.json 安装
npm run dev                   # http://localhost:5173
```

`pros/web/vite.config.ts` 已把 `/api` 代理到 `http://localhost:3000`，所以浏览器只用访问 5173。

### 3.4 默认端口与访问地址

| 用途 | 地址 | 依据 |
| --- | --- | --- |
| 前端（本地开发） | <http://localhost:5173/> | `pros/web/vite.config.ts` `server.port` |
| 前端（Docker 一键） | <http://localhost:8080/> | 根 `docker-compose.yml` `web` 服务 |
| API | <http://localhost:3000> | `pros/api/internal/config/config.go` 默认 `PORT=3000` |
| 健康检查 / 指标 | `GET /health` · `GET /metrics` | `pros/api/cmd/server/main.go` |
| PostgreSQL | 宿主机 `5433`（容器内 `5432`） | `docker-compose.yml` |
| 模板库 / 登录 / 注册 / 工作面板 / 画布 | `/` · `/login` · `/register` · `/workspace` · `/canvas/:templateId` | `pros/web/src/router/index.ts` |

---

## 4. 5 分钟上手

### 4.1 登录与建档

1. 打开模板库（`/`）。右下角用户卡 `…` 菜单里选 `登录` 或 `注册`；**登录与注册都要先填图形验证码**。
2. 在模板库里挑一张卡片，点 `进入画布 →`，地址会变成 `/canvas/<templateId>`。
3. 右侧「页面设置」面板 → `当前文档` → 填 `任务名称`（必填）→ 顶栏点 `保存`（快捷键 `Ctrl/⌘ + S`）即可云端建档。
   未登录时只保存在本机浏览器，保存后会提示 `已存本地（登录后可同步云端）`。

### 4.2 编辑画布里的富文本

- 画布格子内点文字进入编辑；格子标题栏上的 `最大化` 按钮可把该格放大成沉浸编辑面板。
- 工具栏分 11 组：**编辑 / 字体与颜色 / 段落与列表 / 插入 / 图表 / 表格 / 块与结构 / 注释与引用 / 审阅 / 视图 / 文件与导出**；分组可拖拽排序，右键可调组内按钮显隐。
- 常用快捷键：`Ctrl/⌘+B/I/U` 加粗 / 斜体 / 下划线、`Ctrl/⌘+K` 链接、`Ctrl/⌘+F` 查找替换、`/` 斜杠菜单、`@` 提及、`Ctrl/⌘+Z` 撤销；按 `?` 随时打开快捷键说明。

### 4.3 插入图表

1. 工具栏 `图表` 分组有 **9 个独立分类下拉**：`基础` `统计` `关系` `层级` `地理` `金融` `坐标系` `组件` `3D·GL`（共 39 种图表类型）。
2. 点分类下拉 → 选具体类别 → 选一个模板（如 `折线图`），即插入带示例数据的图表块，提示 `已插入…（选中图表可在属性面板改类型 / 改数据）`。
   下拉底部选 `一键生成…` 会打开「一键生成图表」弹窗，可填 `图表标题（可留空）`，也可勾选 `用光标所在表格的数据生成`，再点 `插入`。
3. 单个文档最多 20 个图表；图表内容不参与逐条修订。

### 4.4 在属性面板里配图表

选中图表块后，右侧弹出「图表属性」面板：

| 区域 | 能配什么 |
| --- | --- |
| 顶部 | `图表类型` 下拉，可在 39 种类型之间切换 |
| `通用` | 标题、副标题、标题位置、图例、提示框等 |
| `坐标轴` | `X 轴` / `Y 轴`：轴类型、名称、最小 / 最大值、标签旋转等 |
| `系列` | 多系列时切换系列，逐系列改字段 |
| `数据` | `表格` / `JSON` 两个页签共享同一份数据，改一侧另一侧同步；可增删行与系列 |
| `数据接口` | 启用接口拉取、请求地址与方法、Query / Body、刷新间隔、字段映射、鉴权（无鉴权 / Header / Bearer / 读取登录态） |
| `样式` | 主题色板、背景色、全局字号、动画开关 |
| `高级 JSON` | 直接编辑整份 ECharts option，按白名单校验后 `应用 JSON` |

面板底部有 `删除图表`（二次确认）。所有改动实时写回文档。

### 4.5 导出

- **画布级**（右侧「页面设置」→ `文件`）：`导出 JSON`、`导出 Markdown`、`导出图片`（PNG）。
- **编辑器级**（工具栏 `文件与导出` → `导出`）：`复制为 HTML`（飞书，可直接粘贴）、`导出 HTML`、`导出纯文本(.txt)`、`导出 Markdown(.md)`、`导出图片(PNG)`、`导出 PDF`、`导出 Word(.docx)`。
  另有独立按钮 `复制MD`（复制 Markdown 到剪贴板）和 `打印`（打印预览）。快捷键：`Ctrl/⌘+Alt+E` 导出当前面板 Markdown，`Ctrl/⌘+Alt+P` 打印预览。
- 图表在 md / html / docx 里是**真实快照图**，不是占位文字（`test:e2e:chart-export` 会断言这一点）。

### 4.6 新建画布、版本与评论

- **新建画布**：模板由 URL 决定，画布页没有模板切换器；点顶栏 `← 返回引导` 回模板库换一张，或在工作面板折叠区 `搜索、备注与快速新建` 里按模板名快速新建。画布页顶栏 `新建` + 页面设置 `新建任务` 用于**同一模板下新建一份任务**。
- **版本**：顶栏 `存版`（手动存版）、`版本`（版本历史对话框，可 `查看差异` / `恢复`）、`与上一版对比`；`AI 上下文` 导出 JSON 或纯文本。
- **评论**：在正文选中文字 → 工具栏 `注释与引用` → `评论` → 在评论面板写下并 `发送`；支持 `回复`、`解决` / `重新打开`、删除自己的消息、跳回被评论的原文。线程写在文档 JSON 里，会随文档一起同步。

---

## 5. 常用脚本

前端（`cd pros/web`）：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（5173，`/api` 代理到 3000） |
| `npm run build` | `vue-tsc -b` 类型检查 + `vite build`，产物到 `dist/` |
| `npm run type-check` | 只做类型检查（`vue-tsc -b --pretty false`） |
| `npm test` | vitest 单测 / 组件测（54 个测试文件 / 382 个用例） |
| `npm run test:smoke` | `node scripts/smoke-flow.mjs`：路由自检；设置 `SMOKE_API=http://127.0.0.1:3000` 后跑「登录 → 工作面板 → 建画布 → 保存 → 克隆」全流程 |
| `npm run test:e2e` | `scripts/rte-baseline.mjs`：登录后跑富文本主路径基线（需 Chrome + 前端 + API） |
| `npm run test:e2e:echarts` | `scripts/rte-echarts-e2e.mjs`：按类别插入图表并验证真实渲染 |
| `npm run test:e2e:echarts:render` | `scripts/rte-echarts-render-e2e.mjs`：图表渲染专项 |
| `npm run test:e2e:chart-export` | `scripts/rte-chart-export-e2e.mjs`：md / docx / html 导出与打印预览保真 |
| `npm run test:e2e:clone` | `scripts/clone-canvas-e2e.mjs`：克隆画布一致性 |
| `npm run preview` | 预览 `dist/` 产物 |

e2e 脚本通用环境变量：`CHROME_PATH`（浏览器，默认 `/usr/bin/google-chrome`）、`RTE_WEB_URL`（前端地址，默认 `http://127.0.0.1:5173`）、`RTE_BASELINE_DIR`（截图与产物目录）。

后端（`cd pros/api`）：

```bash
go test ./internal/...                              # 单元测试（config / handler / middleware / service）
go build -o /tmp/metamatrix-api ./cmd/server        # 编译二进制
```

CI（`.github/workflows/ci.yml`）跑的就是：`go test ./internal/...`、`go build`、`npm ci`、`npm run type-check`、`npm run build`、`npm test`、`node scripts/smoke-flow.mjs`（外加带 Postgres 服务的完整冒烟 job）。

---

## 6. 常见问题与排错

1. **`pnpm install` 之后 `pnpm build` 报 `Failed to resolve import "@tiptap/extension-horizontal-rule"`（或 `-blockquote` / `-list`）**
   原因：`pros/web/package.json` 没有把这三个 `@tiptap/extension-*` 声明为直接依赖，pnpm 默认的隔离 node_modules 不会把它们提升到顶层。
   解法（任选）：改用 `npm ci`（扁平 node_modules，与 CI 一致）；或 `pnpm install --node-linker=hoisted`。两者实测 `build` 与 `test` 均通过。

2. **pnpm 提示 `Ignored build scripts: core-js@…, esbuild@…`**
   esbuild 的安装脚本被跳过时二进制可能缺失。执行 `pnpm approve-builds` 放行，或绕过脚本直接调用 CLI：`node node_modules/vite/bin/vite.js build`。

3. **端口被占用**：`5433`（Postgres）、`3000`（API）、`5173`（前端）、`8080`（Docker 前端）冲突时，改 `.env` 的 `DATABASE_URL` / `PORT`，或改 `vite.config.ts` 的 `server.port`；不要同时跑根目录与 `pros/api/docker-compose.yml` 两份 Postgres。

4. **保存时提示「请先在右侧填写任务名称后再同步云端」**：右侧「页面设置」→ `当前文档` → 填 `任务名称` 后再保存。

5. **登录失败 / 返回 429 `rate_limited`**：滑动窗口内失败次数超限。本机调试可设 `CAPTCHA_DEBUG_LOOPBACK=true`（仅回环地址返回验证码明文）或 `CAPTCHA_DEBUG=true`（**仅限本机与 CI**）。窗口参数：`LOGIN_WINDOW`（默认 `15m`）、`LOGIN_PAIR_LIMIT`（默认 `8`）、`LOGIN_IP_LIMIT`（默认 `30`）。详见 [`docs/生产配置.md`](./docs/生产配置.md)。

6. **API 启动即 `db connect` 失败**：确认 Postgres 已在 `5433` 上起好，且 `.env` 里 `DATABASE_URL=postgresql://metamatrix:metamatrix@localhost:5433/metamatrix`（表结构由 GORM `AutoMigrate` 自动创建）。

7. **编辑器偶发崩溃（`DecorationGroup` / `instanceof` 不匹配）**：TipTap / ProseMirror 必须整树共用同一份 `prosemirror-view`。不要混用 npm 扁平与 pnpm 嵌套的 `node_modules`；`vite.config.ts` 里已配 `resolve.dedupe` 兜底。

8. **图表报 `[ECharts] Specified grid.containLabel but no use(LegacyGridContainLabel)`**：属警告，不影响构建与测试（测试输出里可见）。

---

## 7. 贡献方式与许可证

**贡献方式**

1. 从 `main` 切分支（如 `feat/xxx`、`docs/xxx`），提交信息用中文描述改动，格式参考仓库历史（`feat(web): …` / `fix(web): …` / `docs: …`）。
2. 提交前本地跑一遍：`cd pros/api && go test ./internal/... && go build ./...`；`cd pros/web && npm ci && npm run type-check && npm run build && npm test`。
3. 推分支并开 PR 到 `main`；CI 会重跑上面这些命令以及带 Postgres 的冒烟 job。
4. 产品与设计类改动请同步更新 `docs/`（交互规则进 `docs/GLOBAL_RULES/`，接口变更进 `docs/API.md`，上线配置进 `docs/生产配置.md`）。

**文档索引**

| 文档 | 内容 |
| --- | --- |
| [`pros/README.md`](./pros/README.md) | 前后端启动与接口入口 |
| [`docs/技术选型.md`](./docs/技术选型.md) | 栈决策、Schema、版本设计 |
| [`docs/API.md`](./docs/API.md) | 接口清单 |
| [`docs/生产配置.md`](./docs/生产配置.md) | 上线核对项、限流、验证码、快捷键 |
| [`docs/GLOBAL_RULES/`](./docs/GLOBAL_RULES/) | 面板最大化、相关资料等全局规则 |

**许可证**：待确认（仓库未包含 LICENSE 文件）。
