# 「+」块操作面板的面板形态（对照文档）

- 范围：`pros/web`（Vue3 + Tiptap）
- 对象：正文左侧「+」手柄点开的块操作面板（`RteDocumentBody.vue` 的 `.rte-block-menu`）
- 目标：基础区不再是一排认不出的图标；分组层级清楚；面板尺寸、圆角、阴影按项目规范统一。

---

## 1. 修订前的问题

| # | 问题 | 证据（修订前实测） |
| --- | --- | --- |
| 1 | 基础区 12 个入口只有图标、没有文字 | `.rte-block-quick` 44×38px 纯图标格，标签是 `.rte-sr-only`（视觉上不存在） |
| 2 | 六列太密，每格只有 44px | `grid-template-columns: repeat(6, …)` → 每格 44px，图标 20px，辨识度低 |
| 3 | 分组标题是弱灰小字，整块菜单像一张平铺清单 | `.rte-block-menu-section` 12px `#8f959e`，组间只有一条 `rte-menu-sep` |
| 4 | 「在下方插入」被放在插入区末尾，语义错位 | 它其实是块操作，却排在「更多插入」下面 |
| 5 | 面板规格与项目规范不一致 | 宽 304px、圆角 10px、`max-height: min(520px, 70vh)` |

## 2. 修订后的结构

    ┌ 基础 ────────────────────────────┐  分组标题（12px/600 + 发丝线）
    │  [图标]正文 [图标]标题1 [图标]标题2 [图标]标题3 │  4 列 × 3 行，74×54px 格子
    │  [图标]无序 [图标]有序 [图标]任务 [图标]代码   │  图标在上、11px 名称在下
    │  [图标]引用 [图标]高亮 [图标]公式 [图标]分割   │
    ├ 常用 ────────────────────────────┤  组间 1px #f0f1f3 发丝线
    │  🖼 图片 / 🎬 视频 / 📎 附件 / …      │  34px 行高、18px 线性图标 + 13px 文字
    ├ 更多插入 ─────────────────────────┤
    │  目录 / 折叠块 / 今天日期 / …          │
    ├ 块操作 ────────────────────────────┤
    │  在下方插入                          │
    │  转换为                             │  子分组标题（11px 灰字，不画线）
    │  警告 / 成功 / 错误 / 复制块 / 上移 / 下移 / 删除 │
    └────────────────────────────────────┘

### 2.1 具体改动

| 位置 | 改动 |
| --- | --- |
| `RteDocumentBody.vue` | 基础格子补 `.rte-block-quick-label` 可见标签（原 `.rte-sr-only`） |
| `RteDocumentBody.vue` | 「在下方插入」移到「块操作」分组下；「转换为」降为 `.rte-block-menu-sublabel` 子标题；去掉两条 `rte-menu-sep` |
| `editor.scoped.css` | 基础区 6 列 → **4 列**，格子 38px → **54px**（图标 + 名称） |
| `editor.scoped.css` | 分组标题 12px/500 `#8f959e` → **12px/600 `#4e5969`**，组间加 1px `#f0f1f3` 发丝线 |
| `editor.scoped.css` | 新增 `.rte-block-menu-sublabel`（11px 灰字，无分隔线） |
| `editor.scoped.css` | 面板宽 304 → **320px**，圆角 10 → **12px**，阴影 `0 8px 24px` → `0 12px 32px`，`max-height` 520 → **560px** |
| `editor.scoped.css` | 行文字 14px → **13px**，行圆角 6 → **8px**；图标 hover 转主色 `#3370ff` |

### 2.2 状态

| 状态 | 表现 |
| --- | --- |
| 基础格子默认 | 透明底 + 无边框，图标 20px 灰，名称 11px `#4e5969` |
| 基础格子 hover | 底 `#f5f6f7`、边框 `#dee0e3`、圆角 8px，图标与名称同时转主色 `#3370ff` |
| 命令行 hover | 底 `#f2f3f5`，图标转主色 |
| 删除项 | 图标与文字 `#f54a45`，hover 底 `#fef1f1` |

## 3. 文件落点

| 文件 | 作用 |
| --- | --- |
| `components/rte/RteDocumentBody.vue` | 面板结构：可见标签、块操作分组、子分组标题 |
| `components/rte/styles/editor.scoped.css` | 面板尺寸 / 圆角 / 阴影、分组标题与分隔线、基础格子与标签 |
| `components/rte/RteBlockPanelUi.test.ts` | 面板形态的特征测试（四列格子、可见标签、发丝线、子分组） |
| `utils/rteBlockPanelMenu.test.ts` | 用例名同步为「四列三行」（条目数 12 不变） |

## 4. 验证

浏览器实测（Chromium headless + Playwright，悬停段落 → 点「+」）：

| 指标 | 修订前 | 修订后 |
| --- | --- | --- |
| 面板宽度 | 304px | 320px |
| 面板圆角 / 阴影 | 10px / `0 8px 24px` | 12px / `0 12px 32px` |
| 基础区分栏 | 6 列 × 44px | **4 列 × 73.5px**，3 行 |
| 基础格子高度 | 38px（纯图标） | 54px（图标 + 11px 名称） |
| 分组标题 | 12px/500 `#8f959e`，无分隔线 | 12px/600 `#4e5969`，组间 1px `#f0f1f3` |
| 命令行高 / 字号 | 34px / 14px | 34px / 13px |
| 格子 hover | 无（只有边框+浅灰） | 底 `rgb(245,246,247)` + 边框 `#dee0e3` + 名称转 `rgb(51,112,255)` |
| 面板内容高度 | 1000+ | 1073（`clientHeight` 558，超出部分内部滚动） |

回归门禁：

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线（改动前后一致）：`vue-tsc` 62 个错误；`vitest` 6 个 rte 文件失败。
