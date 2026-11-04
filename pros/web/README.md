# 元矩阵 MetaMatrix · Web

Vue 3 + TypeScript + Vite + Pinia + Element Plus 前端脚手架。

## 环境

- Node.js ≥ 20（本机已验证 Node v22）
- npm ≥ 10

## 安装与启动

```bash
cd pros/web
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`）。

## 构建

```bash
npm run build
npm run preview
```

## 端到端脚本

| 脚本 | 说明 | 依赖 |
| --- | --- | --- |
| `npm run test:smoke` | 接口层冒烟：登录 → 工作台 → 建画布 → 保存 → 克隆（含面板条目、附件、`label=clone` 版本） | API 已启动，`SMOKE_API=http://127.0.0.1:3000` |
| `npm run test:e2e:clone` | 浏览器端到端：页面设置面板点「克隆画布」→ URL 的 `documentId` 变化 → 副本渲染与源一致 | API + 前端已启动，`CLONE_E2E_API` / `CLONE_E2E_WEB`；浏览器可用 `CHROME_PATH` 指定 |

克隆相关的单测：`pros/api/internal/service/documents_clone_test.go`、`pros/web/src/stores/document.clone.test.ts`。

## 一键复现「本机后端 + 依赖后端的 e2e」

浏览器级脚本（`rte-baseline.mjs`、`rte-echarts-e2e.mjs`、`rte-chart-panel-e2e.mjs`、
`rte-image-*.mjs`）要三样东西同时在位：**PostgreSQL**、**Go API**、**前端 dev server**，
外加一份固定的「Y 模型」样例文档（脚本里写死的 `documentId=4d5f428c-a6e7-45a7-b29e-304120fccbb5`）。
一条命令全给你准备好：

```bash
cd pros/web
bash scripts/e2e-backend-up.sh          # 起服务 → 播种 → 跑 e2e
bash scripts/e2e-backend-up.sh --up-only # 只起服务（API:3000 / 前端:5173），不跑 e2e
bash scripts/e2e-backend-up.sh --keep    # 结束后保留服务，方便手工排查
```

脚本做的事：

1. **PostgreSQL**：有 `DATABASE_URL` 就用它；否则先试 `docker compose up -d postgres`（仓库根目录的 compose 映射 5433）；
   都不行就复用本机已在跑的实例（依次探测 5434 / 5433 / 5432）。
2. **API**：`go build` 后启动 `pros/api`，等 `GET /health` 返回 `status=ok`。
   为了让自动化能过图形验证码，脚本用 `CAPTCHA_DEBUG=true` 启动（**只在本机自动化用**，生产环境不要开）。
3. **夹具**：`node scripts/seed-e2e-fixtures.mjs` —— 保证 `demo@metamatrix.local / demo123456` 存在，
   并用 `psql` 写入固定 id 的 Y 模型样例文档（API 的 `POST /documents` 不接受自定义 id，所以这一步走 SQL）。
4. **前端**：`vite --host 127.0.0.1 --port 5173`（`node_modules` 缺失时先 `npm install`）。
5. **e2e**：`smoke-routes` → `smoke-flow` → `rte-baseline` → `rte-echarts-e2e` → `rte-chart-panel-e2e`，
   截图与日志落在 `E2E_OUT`（默认 `/tmp/metamatrix-e2e`）。

手工起服务时，自己播一次夹具即可：

```bash
cd pros/web
API=http://127.0.0.1:3000 \
DATABASE_URL=postgresql://metamatrix:metamatrix@127.0.0.1:5434/metamatrix \
node scripts/seed-e2e-fixtures.mjs
```

浏览器级脚本支持用 `RTE_WEB_URL`（前端地址）、`RTE_DOCUMENT_ID`（样例文档 id）、
`RTE_BASELINE_DIR`（截图目录）、`CHROME_PATH`（浏览器）覆盖默认值。

## 目录要点

- `src/templates/star-quadrant-v1.json` — STAR 四象限模板（对齐 docs 技术选型 §6.1）
- `src/components/canvas/` — Background / Quadrant / Axes / Markers 四层渲染
- `src/stores/` — document / selection / history / ui

## MVP 说明

当前为静态四象限渲染 + Pinia stub。Markers 结构与百分比坐标已就绪，拖拽可后续接入 `@vueuse/core` / 自研 pointer。
