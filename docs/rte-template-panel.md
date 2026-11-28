# 富文本「模板」面板（Telegram Web K 重做）

- 范围：`pros/web`（Vue3 + Tiptap）
- 入口：工具栏「模板 ▾」（Ribbon「结构」栏目 / 紧凑工具栏），以及「更多 → 模板」浮层
- 数据源：`src/components/rteDocTemplates.ts`（13 组 / 88 条，`RTE_DOC_TEMPLATE_GROUPS` + `RTE_DOC_TEMPLATES`）

---

## 1. 改前的问题

| 问题 | 表现 |
|---|---|
| 没有检索 | 88 条模板只能靠滚动翻找 |
| 网格过密 | 3 列等宽卡片，条目之间没有呼吸感 |
| 图标无区分 | 全部 fallback 到同一个灰色文档图标 |
| 分组弱 | 灰字小标题，没有色标 / 计数 |
| 面板松散 | 宽度不定，内容散在一大片空白里 |

## 2. 现在的结构

```
RteToolbar.vue
  ├─ 工具栏直开面板  <Teleport body> .rte-menu.rte-template-menu  (v-rte-float="template")
  └─ 「更多」浮层    .rte-menu.rte-more-flyout.rte-template-menu
        └─ <RteTemplatePicker @select="rte.insertDocTemplate($event)" />
```

新组件：`src/components/rte/RteTemplatePicker.vue`（独立 SFC，样式全部 scoped）。

- **头部固定**：标题「模板」+ 右侧 `已匹配 / 总数` 计数（`88 / 88`），下方是搜索框。
- **搜索**：匹配 `label` 与 `description`，输入即过滤；无结果时显示空态（图标 + 文案 + 提示）。
  搜索框 `@mousedown.stop`，避免被浮层的 `@mousedown.prevent` 抢焦点。
- **分组**：色标竖条 + 组名 + 组内条数；组色即该组条目 chip 的强调色。
- **条目**：卡片（图标 chip + 标题 + 一行描述），两列自适应
  （`repeat(auto-fill, minmax(228px, 1fr))`，窄容器 1 列、宽容器 3 列）。
- **图标**：组内 3 个同色系图标轮换，避免整组条目图标完全一样；颜色跟随分组。

分组配色（`GROUP_UI`）：

| 组 | 色值 | 组 | 色值 |
|---|---|---|---|
| 办公文档 / 项目表单 | `#3390ec` | 人事行政 / 人事表单 | `#26a6a6` |
| 产品研发 / 办公表单 | `#8b5cf6` | 个人笔记 / 调研表单 | `#e05b8a` |
| 项目管理 / 财务表单 | `#4fae4e` | 销售客户 / 销售表单 | `#ef8f3c` |
| 审批表单 | `#f7bc2f` | | |

## 3. 表面规格（AGENTS.md §2）

面板统一走「浮层表面」：纯白底、圆角 `12px`、`1px` 发丝线 `--tg-border`、
中性投影 `--tg-shadow-3`（`0 24px 64px rgba(15,23,42,.18)`）。
颜色令牌一律取 `--tg-*`（`src/styles/telegram.css`），动效 `160ms cubic-bezier(.2,.8,.3,1)`。

> **例外说明**：`src/components/rte/styles/telegram.ui.css` 是富文本专属层，
> 对 `.rte-float-menu` / `.rte-more-flyout` 及其 `button` 用了 `!important`
> 统一成「8px 圆角 + 30px 行高菜单项」。
> 模板面板是 600px 的大浮层 + 卡片式条目，因此在本组件内用 `!important` 覆盖这两条，
> 并在代码注释里写明原因（AGENTS.md §2.1.3 允许此做法）。

## 4. 已知取舍

- 「更多 → 模板」浮层宽度受 `.rte-more-menu` 约束，面板高 `min(380px, 56vh)`，
  内部自行滚动；此时「更多」菜单会被 `:has(.rte-template-menu)` 撑到 `min(600px, 92vw)`。
- 面板沿用 `useFloatMenus` 的浮层定位（视口内翻转 / 夹紧），宽屏 600px，窄屏自动收窄。

## 5. 验证

```bash
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线：`vitest` 6 个 rte 文件失败、`vue-tsc` 62 个错误（均为改动前既有基线，见 AGENTS.md §6）。
