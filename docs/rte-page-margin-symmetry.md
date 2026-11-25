# 富文本纸张左右留白对称（对照文档）

- 范围：`pros/web`（Vue3 + Tiptap）
- 现象：A4 纸张页脚处，左侧「纸张边缘 → 虚线版心」比右侧宽（展开态实测 74px vs 48px，差 26px）。
- 目标：左右留白宽度一致，纸张版心居中，版心虚线框与正文起始位置严格对齐。

---

## 1. 根因

页边距变量本身是左右对称的（`--rte-margin-left` / `--rte-margin-right` 同值），
不对称来自 CSS 里「块手柄列（gutter）」只加在左侧：

| 落点 | 原规则 | 后果 |
| --- | --- | --- |
| `editor.global.css` `.rte-root.is-page-sheet .rte-body` | `padding-left: max(var(--rte-margin-left), var(--rte-gutter-size))` | 左侧被手柄列撑宽，右侧只保留页边距 |
| `editor.global.css` `.rte-root.is-page-sheet .rte-body::before` | `inset` 右侧用 `--rte-margin-right` | 虚线版心右侧贴页边距，与左侧不对齐 |
| `editor.global.css` `.rte-root.is-page-sheet .rte-page-break` | `margin-right: calc(-1 * var(--rte-margin-right))` | 分页符横线右端按旧边距算，横线不对称 |

`--rte-gutter-size` 由 `editor.scoped.css` 定义：紧凑态 50px、展开态 74px。
展开态 74px > 页边距 12.7mm（48px），所以差值 = 74 - 48 = 26px。

## 2. 修订口径

**两侧都按「页边距 / 手柄列宽度」取大值预留**，手柄列只在左侧使用，
但右侧同样预留同等宽度，保证纸张版心居中：

```css
.rte-root.is-page-sheet .rte-body {
  padding-left: max(var(--rte-margin-left, 31.8mm), var(--rte-gutter-size, 50px));
  padding-right: max(var(--rte-margin-right, 31.8mm), var(--rte-gutter-size, 50px));
}
.rte-root.is-page-sheet .rte-body::before {
  inset: var(--rte-margin-top, 25.4mm) var(--rte-margin-right, 31.8mm) var(--rte-margin-bottom, 25.4mm) max(var(--rte-margin-left, 31.8mm), var(--rte-gutter-size, 50px));
  right: max(var(--rte-margin-right, 31.8mm), var(--rte-gutter-size, 50px));
}
```

- 打印 / 导出 PDF 不受影响：打印走 `@page` 边距（`utils/rtePageChrome.ts` `printSheetCss`），
  屏幕上的留白只是版心预览。
- 「装订线」（`chrome.gutter`）仍是打印装订语义，只加左边，屏幕同样保持左偏，这是有意为之。
- 自定义左右不等边距时，屏幕跟随用户设置保持不等，属预期。

## 3. 验证（Chromium headless + Playwright 实测 DOM 数值）

页面：`/projects/:pid/knowledge/docs/:did`，展开态（`--rte-gutter-size: 74px`）。

| 页边距 | 左侧留白 | 右侧留白 | 正文左距 | 正文右距 | 差值 |
| --- | --- | --- | --- | --- | --- |
| 窄 12.7mm（默认） | 74px | 74px | 74px | 74px | 0 |
| 常规 31.8mm | 120px | 120px | 120px | 120px | 0 |
| 无边距 0mm | 74px | 74px | 74px | 74px | 0 |

- 修订前同一场景：左 74px / 右 48px / 差值 26px。
- 虚线版心框：修订前后均与正文起始位置重合（修订后左右各 74px）。
- 分页符：`.rte-page-break` 修订后 `left 0 / right 0`（横线铺满纸张），
  内边距 74px / 74px。

## 4. 回归门禁

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线（改动前后一致）：`vue-tsc` 62 个错误（集中在 `src/components/rte/**` 与 `src/utils/rte*.ts`），
`vitest` 6 个 rte 文件失败。
