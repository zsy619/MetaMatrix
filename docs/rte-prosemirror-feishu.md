# 富文本编辑器：飞书文档与 ProseMirror / Tiptap 对照

全功能入口矩阵（含本轮之后的落库缺口）见 [rte-feature-matrix.md](./rte-feature-matrix.md)。本文仍是 2026-11-06 对内核的对照，不替代那份矩阵。

日期：2026-11-06。范围：`pros/web`（Vue 3）里的文档编辑器，以及它落到 `pros/api` 的素材与通讯录接口。对照的是写作能力，不是飞书品牌、素材或协同光标。

**结论：编辑器已经是 Tiptap 3.32（ProseMirror）。不另起一套。** 本文只记录代码里能对上的能力。飞书网页端这一轮没有打开对照，飞书侧的交互细节一律标「未验证」。本轮补上的两处是当前代码里写死、改动面小的缺口，不是飞书级编辑器。

历史记录 `docs/rte-feishu-gap.md`（2026-11-03）里有几条已经过时，见文末。

## 1. 判定依据

| 证据 | 路径 |
|---|---|
| 依赖：`@tiptap/core`、`@tiptap/vue-3`、`@tiptap/pm`、`@tiptap/starter-kit` 均为 `^3.32.0` | `pros/web/package.json` |
| ProseMirror 三件套被锁在 `prosemirror-view@1.42.7`、`prosemirror-state@1.4.4`、`prosemirror-model@1.25.12` | 同文件 `overrides` |
| 全文档一个 `useEditor` | `pros/web/src/components/rte/composables/useRteExtensions.ts` |
| 根组件、工具栏、正文、弹层 | `RichTextEditor.vue`、`rte/RteToolbar.vue`、`rte/RteDocumentBody.vue`、`rte/RtePortals.vue` |
| 扩展目录 | `pros/web/src/extensions/` |
| 正文以 HTML 交给父级，160ms 节流 | `RichTextEditor.vue` 的 `scheduleHtmlEmit` → `update:modelValue` |
| 评论、版本、页眉、工具栏顺序等写在画布 JSON，按面板 id | `RichTextEditor.vue` 与 `pros/web/src/types/canvas.ts`（本轮未逐字段复验每个 key 的读写） |
| 素材稳定路径 `/media/{id}`，签名地址不回写正文 | `extensions/mediaHydrate.ts`、`api/mediaUpload.ts` |

`pros/web/src/components/RichTextItem.vue` 也 `import { useEditor } from '@tiptap/vue-3'`，是另一处更小的 Tiptap 实例，不是第二套编辑器内核。

## 2. 正文怎么落库

编辑器内部是 ProseMirror 文档。对外仍是 HTML 字符串：`getHTML()` 后 `emit('update:modelValue', html)`。节点上的 `data-*`（代码块行号、图片组间距、图表 option、公式 `data-formula`）随这段 HTML 走。不另建编辑器表。

图片、音视频进入素材库后，正文里留 `/media/{id}`。`MediaHydrate` 只用登录态去拉签名地址，再换成 blob URL 显示，不把临时地址写回文档。链接协议白名单同样放行 `/^\/media\/[0-9a-zA-Z-]+$/`（`useRteExtensions.ts` 的 `Link.configure`）。

## 3. 对照表

「生态」列说的是 Tiptap 3 官方扩展或必须自写，不是「装上就等于飞书」。

「判定」：

- **已具备**：本仓库有实现，并给出文件。不等于本轮在浏览器里逐项点过。
- **缺口**：检索后没有对应实现，或实现把能力写死。
- **未验证**：有入口或文档声称，但本轮没有跑通，或飞书侧没有打开页面核对。

### 3.1 内核与文本

| 能力 | 飞书（本轮未打开页面） | ProseMirror / Tiptap 生态 | 本仓库 | 判定 |
|---|---|---|---|---|
| 段落、撤销 | 有 | StarterKit（`paragraph`、history） | `useRteExtensions.ts` 的 `StarterKit.configure` | 已具备 |
| 标题 1–6 | 有；飞书是否到 9 级，未验证 | `Heading`，`levels` 可配 | `heading: { levels: [1, 2, 3, 4, 5, 6] }` | 已具备到 6 级 |
| 标题 7–9 | 未验证 | 官方 Heading 可配到更多级 | 未注册 7–9 | 缺口 |
| 标题自动编号（1 / 1.1） | 未验证 | 无官方一键扩展，需属性或 CSS 计数器 | 全文检索无标题序号实现 | 缺口 |
| 加粗、斜体、删除线、行内代码 | 有 | StarterKit marks | StarterKit | 已具备 |
| 下划线、上标、下标 | 有 | `@tiptap/extension-underline` 等 | 同名依赖，已 `configure` 进编辑器 | 已具备 |
| 字色、高亮、字体、字号、行高 | 有 | TextStyle / Color / Highlight / TextAlign | `useRteExtensions.ts`；两端对齐在 `alignments: ['left','center','right','justify']` | 已具备 |
| 字距、段前段后、首行缩进 | 未验证是否与飞书档位一致 | 需自写属性 | `extensions/letterSpacing.ts`、`paragraphAttrs.ts` | 已具备实现；与飞书档位一致与否未验证 |
| 清除格式、格式刷 | 有 | 命令组合，无单一官方「格式刷」包 | `RichTextEditor.vue` 的 `clearFormat`、`activateFormatPainter` | 已具备；格式刷手感未在本轮浏览器复验 |
| 字数统计 | 有 | 官方 `@tiptap/extension-character-count` 未安装 | 自写 `wordCount` / `docExtraStats`，工具栏「字数」 | 已具备（自写） |

### 3.2 块

| 能力 | 飞书 | 生态 | 本仓库 | 判定 |
|---|---|---|---|---|
| 无序 / 有序 / 待办 | 有 | StarterKit + `@tiptap/extension-list` | `TaskList` / `TaskItem`，列表样式 `listStyleAttrs.ts`，重编号 `utils/rteListRenumber.ts` | 已具备 |
| 引用、分割线 | 有 | 官方节点；本仓库换成自己的 | `rteBlockquote.ts`、`rteHorizontalRule.ts` | 已具备 |
| 代码块语法高亮 | 有 | `@tiptap/extension-code-block-lowlight` | `extensions/codeHighlight.ts`，浮层可选语言、复制 | 已具备 |
| 代码块行号、自动换行 | 未验证飞书按钮文案 | 官方低亮扩展不带这两项 | 本轮补上，见第 4 节。缺省关闭 | 本轮已补；折行后行号是否与视觉行对齐，未按像素验证（行号按逻辑行） |
| Markdown 段首规则 | 飞书支持 `#`、列表、待办、引用、代码围栏、分割线，未验证全部容器 | 各节点自带 input rule；本仓库再包一层更高优先级 | `extensions/rteMarkdownInputRules.ts` 与其测试 | 已具备。本轮跑过该测试文件，131 个相关用例里该文件全部通过 |
| 高亮块 / 折叠 / 分栏 | 有 | 无对等官方包（Details 只覆盖折叠语义的一部分） | `callout.ts`、`toggleBlock.ts`、`columns.ts` | 已具备自写实现；与飞书分栏上限是否一致未验证 |
| 表格：插入、列宽、合并、单元格背景 | 有 | `@tiptap/extension-table`（`resizable: true`） | `useTableOps.ts`、`rteTableCells.ts`、`RtePortals.vue`「单元格背景」 | 已具备 |
| 表格公式栏 | 飞书表格公式面更宽，未验证 | 无官方公式栏 | `RteTableFormulaBar.vue`、`utils/rteTableFormula.ts`。函数：`SUM/AVERAGE/COUNT/MAX/MIN`，`ABOVE`、`LEFT`、区域、四则 | 已具备这一子集 |
| 跨表引用、单元格命名 | 未验证 | 需自写 | `rteTableFormula.ts` 只描述单表 grid | 缺口 |
| 图片：缩放、对齐、裁剪、alt、环绕 | 有 | `@tiptap/extension-image` 的 resize；环绕需自写 | `rteImage.ts`、`useImageTools.ts`（含 `wrap-left` / `wrap-right`） | 已具备实现；环绕在窄页是否破版，本轮未复验 |
| 图片组（一行多图） | 未验证飞书是否提供可调间距 | 官方 Image 没有图片组 | `extensions/imageGroup.ts`。间距原先写死 8px | 组本身已具备；可调间距本轮补上 |
| 音视频、附件链接 | 有 | 自写节点 | `audio.ts`、`video.ts`；链接允许 `data:` / `blob:` / `/media/{id}` | 已具备路径；本轮未上传新文件 |
| 公式 | 有 | 无官方 KaTeX 节点（Mathematics 扩展未安装） | `extensions/math.ts`，依赖 `katex` | 已具备；排版与飞书公式菜单是否一致未验证 |
| 图表 | 飞书是数据表联动，未验证 | 无官方 ECharts 节点 | `echartsBlock.ts`、`components/rte/chart-panel/`、`docs/rte-chart-panel.md` | 已具备自写图表块。暗色编辑区是否换图表主题：`echartsBlock.ts` 无 dark 分支，判定为缺口 |
| 流程图 | 未验证 | 无官方 Mermaid 节点 | `mermaidBlock.ts` | 已具备自写 |
| 同步块 | 飞书可跟随源文档，未验证刷新策略 | 无官方包 | `syncBlock.ts`、`docs/rte-sync-block.md`。代码注释与文档写的是快照 + 手动刷新 | 已具备这一子集；后台推送未实现，标缺口 |
| 提及 @ | 有 | `@tiptap/extension-mention` | `mentionSuggestion.ts`、`useDirectoryPeople.ts` | 已具备前端。后端 `GET /directory/users` 在 `pros/api/internal/handler/directory.go`。本轮未登录打这条接口，真人列表是否非空标未验证 |
| 斜杠菜单 | 有 | `@tiptap/suggestion` | `slashCommands.ts`、`rteSlashItems.ts` | 已具备 |
| 评论线程、建议模式 | 有 | 无官方评论产品，需 Mark + 侧栏 | `commentAnchor.ts`、`suggestionMode.ts`、`CommentThreadPanel.vue` | 已具备实现；本轮未在浏览器里发一条评论 |
| 正文版本 | 飞书是独立历史，未验证 | 无 | 画布 JSON `editorRevisionsByPanelId`（`docs/rte-feishu-gap.md` 的描述；本轮未改这条路径，也未在浏览器恢复一版） | 实现声称见旧文档；本轮未复验，标未验证 |
| 查找替换（含正则） | 有 | 自写 | `useFindReplace.ts`、`rteFindRegex.test.ts` | 已具备代码与单测；本轮未在浏览器里搜 |
| 目录侧栏 | 飞书有大纲 | 官方 Table of Contents 未安装 | 代码注释写明「目录已按产品要求移除，勿恢复」（`RichTextEditor.vue` 约 5469 行） | 按产品要求不做。不要装 `@tiptap/extension-table-of-contents` 把目录加回去 |
| 页眉页脚、页码、页面大小、演示 | 飞书页面设置未逐项核对 | 与编辑器内核无关，是排版壳 | `usePageChrome.ts`、`useRtePageLayout.ts`、`PageSettingsPanel.vue` | 已具备壳；打印像素本轮未复验 |
| 导入导出 | 飞书支持 Word 等，未验证格式清单 | 无官方导出包 | `useImport.ts`、`useExport.ts`、`rteExportPdf.ts`、`rteExportDocx.ts`、`rteExportMd.ts` | 已具备入口。图表导出走快照替换占位：`rteExportChartSnapshots.ts` 及单测。导出文件的像素本轮未打开 |
| 投票、思维笔记、多维表格、白板 | 飞书有独立块 | 都不在 Tiptap 官方节点里 | 仅有表单模板文案里出现「投票」「白板」字样（`rteFormDocTemplates.ts`），没有对应块节点 | 缺口。旧文档已写明不属于当前 TipTap 面板 |
| 多人实时光标 | 飞书有 | 官方 Collaboration（Yjs） | 依赖与源码均无 `yjs` / `@tiptap/extension-collaboration` | 缺口，且本仓库明确不做 |
| 长文虚拟化 | 未验证 | 官方无「一篇文档拆成多编辑器」方案 | 仍是一个 `useEditor` | 缺口。拆开会碰到评论锚点、交叉引用和画布回写，本轮不做 |

### 3.3 图表无障碍（纠正旧文档）

`docs/rte-feishu-gap.md` 写「没有无障碍数据表」。当前代码不是这样：

- `extensions/echartsBlock.ts` 给容器 `role="img"` 和 `aria-label`
- `extensions/echartsBlock.a11y.test.ts` 断言节点视图里有视觉隐藏的 `.rte-chart-a11y table`，且不在 `role="img"` 里面

判定：**已具备代码与单测**。读屏是否真的念出摘要，本轮没有用读屏软件，标未验证。

## 4. 本轮补上的两处

只做代码里已经写死、且不碰图表、公式栏、Markdown 规则和 `/media/{id}` 的部分。

### 4.1 代码块行号与自动换行

原先浮层只有语言和复制（`RteDocumentBody.vue`）。`pre` 样式是 `overflow: auto`，没有行号，也没有换行开关（`editor.scoped.css`）。

现在 `codeBlock` 增加两个属性，缺省都是关，旧文档外观不变：

- `data-line-numbers="1"`：逻辑行号画在块内左侧，不写入文档文本，复制代码不带行号
- `data-word-wrap="1"`：`white-space: pre-wrap`

入口：代码块浮层和工具栏「代码」旁的「行号」「换行」。属性在 `getHTML()` 里，随现有 HTML 落库。

文件：

- `pros/web/src/extensions/codeHighlight.ts`
- `pros/web/src/extensions/codeHighlight.test.ts`
- `pros/web/src/components/RichTextEditor.vue`
- `pros/web/src/components/rte/RteDocumentBody.vue`
- `pros/web/src/components/rte/RteToolbar.vue`
- `pros/web/src/components/rte/styles/editor.scoped.css`
- `pros/web/src/components/rte/styles/editor.global.css`

限制：行号按逻辑行，不按折行后的视觉行重排。自动换行打开后，长行折行处行号不会再加一行。这不是飞书像素对齐。

### 4.2 图片组组内间距

`utils/rteImageGroup.ts` 里行布局和 CSS 原先都是 `gap: 8px`。`docs/rte-feishu-gap.md` 把「组内留白可调」列为未做。飞书是否就是这四档，本轮未打开飞书，标未验证。

现在图片组有 `data-gap`。缺省 8 不写入 HTML。悬停工具条上的数字在 0、8、16、24 之间循环，上限夹在 0–48。行高用同一个间距重算，避免间距变了而高度仍按 8px 扣。

文件：

- `pros/web/src/utils/rteImageGroup.ts`
- `pros/web/src/extensions/imageGroup.ts`
- `pros/web/src/extensions/imageGroupOps.ts`
- `pros/web/src/extensions/imageGroup.gap.test.ts`

## 5. 本轮浏览器复验

预览页（不进生产路由）：`pros/web/rte-code-gap-preview.html`。

```bash
cd pros/web
npm run dev
# 另开终端
node scripts/rte-code-gap-e2e.mjs
```

脚本打开 `http://127.0.0.1:5173/rte-code-gap-preview.html`，点击代码块浮层的「行号」「换行」，再把图片组间距从 8 点到 24，并检查 `getHTML()`。

2026-11-06 本机 headless Chrome 跑过一次，结果是通过：

- 代码块 `data-line-numbers="1"`、`data-word-wrap="1"`，行号文本为 `1` 到 `4`，`code` 的 `white-space` 为 `pre-wrap`，`getHTML()` 含这两个属性
- 图片组间距按钮从 `8` 到 `24`，`data-gap="24"`，行的计算间距为 `24px`，`getHTML()` 含 `data-gap="24"`

截图（不进仓库）：`/opt/cursor/artifacts/rte-code-line-wrap.png`、`/opt/cursor/artifacts/rte-image-group-gap.png`。

没有在这次脚本里点过的能力，仍然算未验证。行号没有按折行后的视觉行重排，脚本也没有做逐像素对齐断言。

## 6. 仍缺，且本轮不做

按「日常写作会不会立刻撞上」排序，不是工期。

1. 标题自动编号。改动要进大纲、导出和打印，比两个属性大。
2. 表格跨表引用、单元格命名。公式栏已经在用，不适合顺手加。
3. 图表不跟随暗色编辑区。
4. 同步块仍是手动刷新，没有推送。
5. 长文仍是整篇一个 ProseMirror 实例。
6. 实时协同光标。明确不做。
7. 投票、思维笔记、多维表格、白板。明确不在当前编辑器里做。
8. 分享链接、水印、对外权限。在文档产品，不在编辑器内核。

## 7. 未验证清单

- 飞书网页端当前按钮、档位、文案。本文没有把旧文档的「飞书有」当成新的实测。
- 通讯录接口在已登录环境下是否返回真人。代码和 handler 测试在，本轮没有打通登录。
- 图表读屏播报、导出 PNG/PDF 的像素、打印预览里的图表。
- 代码块折行与行号的像素对齐（见 4.1 的限制）。
- 图片组在打印 / PDF 里间距是否与屏幕一致。
- 正文版本恢复、评论发送、格式刷、环绕，本轮没有在浏览器里重走。
- `RichTextItem.vue` 那套较小编辑器没有接行号和图片组间距。主文档编辑器是 `RichTextEditor.vue`。
