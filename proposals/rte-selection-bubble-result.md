# 选区浮动工具条（多行选择 + 气泡）结果

> 任务：富文本编辑器支持跨多个段落/块拖选或 Shift+点击选中多行文本，选中后浮出
> 气泡工具条（字体、字号、加粗/斜体/下划线/删除线、文字颜色、背景高亮、清除格式、
> 链接、对齐），工具条不遮挡选区、贴近视口边缘自动翻转，空选区与代码块/图表块内不出现。

## 一、方案（对齐飞书 / Word）

1. **跨块选区不被打断**
   - ProseMirror 原生支持跨段落拖选与 Shift+点击扩展选区，编辑器不额外拦截。
   - 之前真正打断拖选的是左侧块手柄（`⠿ 拖拽` / `⋮ 菜单`）会抢指针事件。
     现在正文按下鼠标即进入「拖选中」态（`RichTextEditor.vue` 的 `dragSelecting`），
     根节点加 `.is-drag-select`，CSS 让 `.rte-block-tools` / `.rte-block-menu`
     在这段时间 `pointer-events: none`——手柄仍能悬停显示，但不会吃掉拖选。
2. **跨块选区的格式操作对所有选中段落生效**
   - TipTap 的 `setMark` / `updateAttributes` 语义天然覆盖「选区里的所有段落」，
     所以一次命令调用就会作用到选区覆盖的每个段落。
   - 新增 `pros/web/src/components/rte/selectionFormat.ts` 统一封装
     `applyFontSizeToSelection` / `applyFontFamilyToSelection` / `applyTextAlignToSelection`，
     顶部工具栏与气泡共用同一套命令，不存在两处逻辑漂移。
3. **气泡工具条（新组件单独成文件）**
   - 新增 `pros/web/src/components/rte/RteSelectionBubble.vue`（TipTap `BubbleMenu`）。
   - 按钮全部走既有 bindings：`applyFontSize` / `applyFontFamily` / `toggleBold` /
     `toggleItalic` / `toggleUnderline` / `toggleStrike` / `applyTextColor` /
     `applyHighlightColor` / `clearFormat` / `insertLink` / `setAlign`，
     加上原有气泡里的列表、引用、评论、复制、转链接、转表格、改写。
   - 字体 / 字号 / 对齐是气泡内的下拉面板，选项直接取工具栏的
     `FONT_FAMILY_OPTIONS` / `FONT_SIZE_OPTIONS`；面板下方空间不足时朝上展开
     （`resolvePanelUp()`）。
4. **出现条件**（`composables/useSelectionBubble.ts`）
   - 空选区不出现；非编辑态不出现；图片节点选中时走图片气泡不出现；
     选区端点祖先链或选区覆盖范围里出现 `codeBlock` / `echartsBlock` /
     `mermaidBlock` 时不出现（跨块选区把代码块圈进来同样不出现）。
5. **不遮挡 + 自动翻转**
   - `BubbleMenu` 用 `placement: 'top'`、`offset: 8`，并打开 floating-ui 的
     `flip` / `shift`：上方空间不够时自动翻到选区下方，左右贴边时平移不溢出。

## 二、改动文件

| 文件 | 改动 |
| --- | --- |
| `pros/web/src/components/rte/RteSelectionBubble.vue` | 新增：选区浮动工具条组件（字体/字号/加粗/斜体/下划线/删除线/文字颜色/高亮/清除格式/链接/对齐 + 原有列表/评论等） |
| `pros/web/src/components/rte/composables/useSelectionBubble.ts` | 新增：气泡出现条件、空选区 / 代码块 / 图表块判定、跨块选区计数 |
| `pros/web/src/components/rte/selectionFormat.ts` | 新增：字号 / 字体 / 对齐的选区应用统一封装（工具栏与气泡共用） |
| `pros/web/src/components/rte/RteSelectionBubble.test.ts` | 新增：跨段落选区应用字号 / 字体 / 对齐的单测 + 出现条件单测 |
| `pros/web/src/components/rte/RteDocumentBody.vue` | 原来的行内气泡替换为 `<RteSelectionBubble />`（图片气泡保留） |
| `pros/web/src/components/RichTextEditor.vue` | 接入 `useSelectionBubble` / `selectionFormat`；拖选态 `dragSelecting` + `.is-drag-select` |
| `pros/web/src/components/rte/styles/editor.scoped.css` | 气泡下拉面板样式、`.is-drag-select` 下块手柄不抢指针 |
| `pros/web/selection-bubble-preview.html`、`pros/web/src/selectionBubblePreview.ts` | e2e 预览页（多段正文 + 代码块 + 图表块），本轮不跑，交给 CI |
| `pros/web/scripts/rte-selection-bubble-e2e.mjs` | e2e 断言脚本（跨段拖选、改字号两段生效、代码块/图表块/空选区不出现、贴边翻转），本轮不跑，交给 CI |

## 三、验收对照表

### 已对齐

| 需求 | 状态 | 证据 |
| --- | --- | --- |
| 跨多个段落/块拖选、Shift+点击选中多行文本 | ✅ 已对齐 | ProseMirror 原生跨段选区；拖选期间 `.is-drag-select` 让块手柄 / 块菜单 `pointer-events: none`（`RichTextEditor.vue` + `editor.scoped.css`） |
| 跨块选区的格式操作对所有选中段落生效 | ✅ 已对齐 | `selectionFormat.ts` 统一封装；`RteSelectionBubble.test.ts` 断言：跨两段改字号 → 第一、二段都是 `20px`、第三段不受影响；字体同理；对齐同理 |
| 选中文字后出现浮动工具条（BubbleMenu） | ✅ 已对齐 | `RteSelectionBubble.vue` 用 TipTap `BubbleMenu`，`:should-show="rte.selectionBubbleShouldShow"` |
| 工具条含字体、字号、加粗/斜体/下划线/删除线、文字颜色、背景高亮、清除格式、链接、对齐 | ✅ 已对齐 | 组件内逐项实现，按钮 `aria-label` 分别为「字体 / 字号 / 加粗 / 斜体 / 下划线 / 删除线 / 文字颜色 / 高亮颜色 / 清除格式 / 插入链接 / 对齐」 |
| 复用工具栏已有的命令与组件，不重复造逻辑 | ✅ 已对齐 | 全部走既有 bindings（`applyFontSize` / `applyFontFamily` / `toggleBold` / `applyTextColor` / `applyHighlightColor` / `clearFormat` / `insertLink` / `setAlign`）；字体 / 字号选项直接复用 `FONT_FAMILY_OPTIONS` / `FONT_SIZE_OPTIONS` |
| 新组件单独成文件 | ✅ 已对齐 | `RteSelectionBubble.vue` 独立文件 + 独立 composable `useSelectionBubble.ts` + 独立命令封装 `selectionFormat.ts` |
| 工具条不遮挡选区，靠近视口边缘自动翻转 | ✅ 已对齐（代码层） | `placement: 'top'` + `offset: 8` + floating-ui `flip` / `shift`；面板下方空间不足时朝上（`resolvePanelUp()`） |
| 空选区、代码块、图表块内不出现 | ✅ 已对齐（代码层） | `useSelectionBubble.ts`：`from === to` → 隐藏；选区端点祖先链或覆盖范围含 `codeBlock` / `echartsBlock` / `mermaidBlock` → 隐藏；单测覆盖空选区、代码块、图表块、非编辑态 |
| vitest 单测覆盖跨段落选区应用字号 / 字体 | ✅ 已对齐 | `RteSelectionBubble.test.ts`：9 passed / 1 skipped（整编辑器集成用例默认跳过，需 `RTE_FULL_EDITOR=1` 打开） |
| `vitest` / `vue-tsc` / `vite build` 全部通过 | ✅ 已对齐 | rebase 到 `origin/main` 之后重跑：vitest 72 files / 517 passed、vue-tsc exit 0、vite build exit 0 |

### 未对齐

| 需求 | 状态 | 说明 |
| --- | --- | --- |
| （无） | — | 三条功能需求在代码与单测层面均已落地；未对齐项集中在浏览器实测（见下表） |

### 未验证

| 项 | 状态 | 原因 / 补齐方式 |
| --- | --- | --- |
| 1440×900 截图（选中两段后工具条可见、改字号两段都生效） | ⛔ 未验证 | 本轮（串行重开）明令禁止起 vite/dev server、禁止 Playwright/chromium、禁止 e2e，故未产出 PNG。断言脚本已就绪：`pros/web/scripts/rte-selection-bubble-e2e.mjs`（跨两段拖选 → 断言气泡可见与 11 个按钮齐备 → 在气泡里改 20px → 断言两段都是 20px、第三段未变 → 代码块 / 图表块 / 空选区不出现 → 贴视口上边缘时气泡翻转到选区下方），预览页 `pros/web/selection-bubble-preview.html`，由 CI / 有浏览器的环境执行 |
| 浏览器里真实鼠标拖选手感（是否仍被块容器 / 块手柄打断） | ⛔ 未验证 | 同上：本轮不跑浏览器。代码层已用 `.is-drag-select` 关闭手柄指针事件，等 CI e2e 实测 |
| 气泡贴视口边缘的实际翻转效果 | ⛔ 未验证 | 同上。代码层已打开 floating-ui `flip` / `shift` |
| 气泡面板（字体 / 字号 / 对齐）下拉的实际渲染与朝上展开 | ⛔ 未验证 | 同上。面板样式在 `editor.scoped.css`，DOM 由 `data-rte-own` + `useParentScopeStamp` 打到根 SFC 的 scope 上 |

## 四、命令与结果（本轮实跑）

```bash
cd pros/web
npx vitest run                      # 72 files / 517 passed / 1 skipped  ✅
npx vue-tsc -b --pretty false       # exit 0                            ✅
npx vite build                      # exit 0                            ✅
```

以上三条均在 rebase 到 `origin/main`（371d11b）之后重跑，长命令均带 `timeout` 且后台执行 + 轮询输出。

## 五、交付

- 分支：`cursor/dsh-rte-selection-bubble`
- PR：见仓库（不合并）
- 提交：`feat(rte): 多行选择 + 选区浮动工具条（字体/字号/颜色/高亮/清除格式/链接/对齐）`
