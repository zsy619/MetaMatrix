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

## 目录要点

- `src/templates/star-quadrant-v1.json` — STAR 四象限模板（对齐 docs 技术选型 §6.1）
- `src/components/canvas/` — Background / Quadrant / Axes / Markers 四层渲染
- `src/stores/` — document / selection / history / ui

## MVP 说明

当前为静态四象限渲染 + Pinia stub。Markers 结构与百分比坐标已就绪，拖拽可后续接入 `@vueuse/core` / 自研 pointer。
