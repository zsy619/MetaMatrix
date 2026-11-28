# 富文本「字数统计」面板（Telegram Web K 重做）

- 范围：`pros/web`（Vue3 + Tiptap）
- 入口：
  - 工具栏「字数 ▾」下拉面板（Ribbon 展开态与紧凑态各一份入口）；
  - 正文底栏「字数 138 · 中 85 · 英 16 · 图 0 · 约 1 分钟」点击后的抽屉。
- 组件：`src/components/rte/RteWordStatsPanel.vue`（独立 SFC，样式全部 scoped）
- 数据口径：`src/utils/rteWordStats.ts` 的 `buildWordStatsPanelData()`，
  两个入口共用同一份映射，避免字段口径漂移。

---

## 1. 改前的问题

| 问题 | 表现 |
|---|---|
| 信息平铺 | 9 行「标签 — 数字」，没有主次，看不出「字数」和「英文词」的权重差 |
| 视觉不统一 | 10px 圆角 + 轻阴影，与 AGENTS.md §2 的浮层表面规格不一致 |
| 选区空态 | 无选区时是两个孤零零的「—」，用户不知道是没选还是没数据 |
| tooltip 遮挡 | 按钮 `title` 常驻，浏览器原生提示会压在面板标题上 |
| 重复代码 | 展开态 / 紧凑态两处各写一份同样的面板 markup |
| 底栏重复 | 底栏抽屉是另一套手写统计（`--mm-*` 令牌、旧配色、9 行平铺） |

## 2. 现在的结构

```
RteToolbar.vue ──┐
                 ├── <RteWordStatsPanel v-bind="wordStatsPanelProps" @close="…" />
RteDocumentBody.vue ─┘
```

面板自上而下四段：

1. **头部**：标题「字数统计」（16px/600，左对齐，无竖条）+ 口径说明
   （「全文含标题、表格和代码中的文字，不含评论。」）+ 28×28 / 圆角 8px 的关闭按钮。
2. **概览三卡**：字数 / 词数 / 阅读时长。每卡 = 图标 chip + label + 22px/700 数字
   （`font-variant-numeric: tabular-nums`，刷新时不左右跳）。
3. **明细网格**：段落 / 行数 / 标题数 / 汉字 / 英文词 / 图片，两列 label-value。
4. **选区**：有选区时整行品牌蓝软底 + 「字符 / 词数」两个 chip；
   无选区时显示「未选中内容」（不再是两个「—」）。

## 3. 表面规格（AGENTS.md §2）

| 项 | 值 |
|---|---|
| 底色 | `--tg-surface`（纯白） |
| 圆角 | `12px`（`--tg-radius-md`） |
| 描边 | `1px solid var(--tg-border)` |
| 投影 | `--tg-shadow-3` = `0 24px 64px rgba(15,23,42,.18)` |
| 宽度 | `320px`，`max-width: 100%` |
| 令牌 | 全部取 `--tg-*`，不另起一套 |

> **例外说明**：`src/components/rte/styles/telegram.ui.css` 是富文本专属层，
> 对 `.rte-float-menu` / `.rte-float-menu button` 用了 `!important`
> 统一成「8px 圆角 + 30px 行高菜单项」。
> 因此浮层外壳写成 `.rte-float-menu.rte-wordstats-panel`（特异性 0,2,0）并用 `!important`
> 覆盖外壳规则；面板内部的关闭按钮同样用 `!important` 压掉「菜单项按钮」样式，
> 代码注释里写明原因（AGENTS.md §2.1.3 允许此做法）。

## 4. 底栏抽屉的合并

底栏入口原来手写 9 行统计（`字符/词数/中文/英文词/图片/阅读/段落/标题/选区`），
配色用 `--mm-*`、宽度铺满正文栏。现在改为同一个组件 + 一层浮层外壳：

```css
.rte-word-dock {
  width: 320px;
  margin: 0 auto 12px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface);
  box-shadow: var(--tg-shadow-3);
}
```

结果：两个入口看到的数字、行序、空态文案完全一致。

## 5. 已知取舍

- 面板高度随内容变化（实测 320×333 / 选区高亮时 320×336），不做固定高度与内部滚动。
- 底栏抽屉仍是「跟随正文流」的卡片（居中放在正文末尾），没有改成悬浮在底栏之上的浮层，
  以避免与 `useOverlayStack` 的遮罩栈、滚动容器产生定位冲突。
- 底栏按钮 `.rte-wordcount` 的 hover 态已从 `--mm-*` 切到 `--tg-blue*`，
  但其余底栏控件仍保留旧的 `--mm-*` 令牌（历史遗留，未在本次范围内统一）。

## 6. 验证

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线：`vitest` 6 个 rte 文件失败、`vue-tsc` 62 个错误（改动前后一致，见 AGENTS.md §6）。

浏览器实测（Chrome headless + Playwright）：

- 面板 `320×333`（选区高亮态 `320×336`），圆角 `12px`，
  投影 `0 24px 64px rgba(15,23,42,.18)`，描边 `#e6e6e6`，内边距由组件自管（外壳 `padding: 0`）；
- 选区行：`is-active` 时底色 `rgba(51,144,236,.12)`、圆角 `8px`、宽 `302px`、高 `33px`；
- 面板打开时「字数」按钮 `title` 为 `null`（原生 tooltip 不再遮挡标题）。
