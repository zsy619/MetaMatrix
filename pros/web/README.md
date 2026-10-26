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

## 目录要点

- `src/templates/star-quadrant-v1.json` — STAR 四象限模板（对齐 docs 技术选型 §6.1）
- `src/components/canvas/` — Background / Quadrant / Axes / Markers 四层渲染
- `src/stores/` — document / selection / history / ui

## MVP 说明

当前为静态四象限渲染 + Pinia stub。Markers 结构与百分比坐标已就绪，拖拽可后续接入 `@vueuse/core` / 自研 pointer。
