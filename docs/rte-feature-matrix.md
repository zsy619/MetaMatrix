# 富文本全功能矩阵

日期：2026-11-06。基线：`main` @ `e5e170a`（PR #107 已合入）之后的本分支。

编辑器仍是 **一个 Tiptap 3 / ProseMirror 实例**（`pros/web/src/components/rte/composables/useRteExtensions.ts`）。没有另加编辑器，没有 Yjs。

本文件覆盖工具栏 11 组（外加「其他」空组）和正文旁路入口。**覆盖全部入口不等于全部已经深度优化。** 判定只根据当前代码和本轮实际跑过的检查。飞书网页没有打开，不能写成飞书级。

历史对照仍见 `docs/rte-prosemirror-feishu.md`。素材库七项见 `docs/acceptance/media-1106/README.md`（飞书租户凭证仍未验证）。

## 判定

- **已实现**：代码里有入口，并且能指出函数或扩展。不等于本轮在浏览器里点过。
- **缺口**：代码写明做不到，或本轮确认会丢状态 / 按钮无效。
- **未验证**：有实现，但本轮没有浏览器或读屏复验。真实系统输入法、飞书租户凭证一律未验证。

优先级：P0 用户能看见的失败或数据丢失；P1 设置保存后丢失；P2 体验不完整；P3 明确不做。

## 首批（本分支）

只做了两件有失败证据的事：

1. **标题号按钮点了没有编号，刷新也记不住。** 样式写在未加 `scoped` 的 `editor.global.css` 里，选择器却用了 `:deep()`。这不是合法 CSS，浏览器把整条规则丢掉，所以开关只改 class、成功提示会出现，标题前没有号。另外开关只活在组件 `ref` 里，H5/H6 原来也没写。现在改成普通选择器，补上 H5/H6，并按面板写入 `headingAutoNumByPanelId`（只在打开时记 `true`）。不改页面大小、页边距、页眉。编号仍是 CSS 计数器，不写进标题文字。Markdown / Word 导出因此**不会**带上这些编号，这仍是缺口。
2. **表格「表筛选」编辑一下就失效。** 筛选把 `display` 写在 `<tr>` 上，文档一更新 ProseMirror 按文档重画表格，隐藏行回来。现在记住表格位置，事务落地后再画一次。筛选仍然不进 HTML。

## 正文怎么保存

`RichTextEditor.vue` 的 `scheduleHtmlEmit` 把 `getHTML()` 交给 `update:modelValue`。评论、版本、页眉、工具栏顺序、标题编号等在画布 JSON，按面板 id，整份 `current_data` 被 `JSON.stringify` 进本地存储（`stores/document.ts` 的 `localStorageKey`）。素材正文只留 `/media/{id}`（`extensions/mediaHydrate.ts`）。

嵌入小区块是否套 A4 由 `pageSheet` 决定，本轮没有改这条路径（`useRtePageLayout.ts`、`rteEmbeddedPaper.test.ts`）。

## 1. 编辑

| 入口 | 行为 | 判定 | 证据 | 优先级 |
|---|---|---|---|---|
| 撤销 / 重做 | `undo()` / `redo()`，不能做时按钮禁用 | 已实现 | `RichTextEditor.vue` 工具项 `undo` / `redo` | — |
| 查找替换 | 区分大小写、全词、正则 | 已实现；本轮未在浏览器搜 | `useFindReplace.ts`、`rteFindRegex.test.ts` | 未验证 |
| 格式刷 | 复制选区格式再刷 | 已实现；本轮未点 | `activateFormatPainter` | 未验证 |
| 纯文本粘贴 / 粘贴格式 | 粘贴清洗、Word 提示 | 已实现；本轮未贴 | `useRteExtensions.ts` 的 `transformPastedHTML` | 未验证 |
| 清除格式 | 去掉 mark、对齐、段距 | 已实现；本轮未点 | `clearFormat` | 未验证 |
| 键盘 | 标题、列表、查找等快捷键在 `editorProps.handleKeyDown` | 已实现代码；真实系统输入法未验证 | `useRteExtensions.ts` | 未验证 |

## 2. 字体与颜色

| 入口 | 行为 | 判定 | 证据 |
|---|---|---|---|
| 字号、字体、字色、高亮 | TextStyle / Color / Highlight | 已实现 | `useRteExtensions.ts` |
| 加粗、斜体、下划线、删除线、上标、下标、行内代码 | StarterKit 与对应扩展 | 已实现 | 同上；加粗往返见 `RichTextEditor.char.test.ts` |
| 着重号、大小写、注音 | 自写 mark / 命令 | 已实现代码；本轮未点 | `emphasisDot.ts`、`ruby.ts`、`rteCaseTransform.ts` |

与飞书色板是否逐格一致：未验证。

## 3. 段落与列表

| 入口 | 行为 | 判定 | 证据 | 优先级 |
|---|---|---|---|---|
| 标题 1–6 | StarterKit `levels: [1..6]` | 已实现 | `useRteExtensions.ts` | — |
| 标题 7–9 | 未注册 | 缺口 | 同上 | P3 |
| 段样式 | `applyParagraphStyle` | 已实现代码；本轮未点 | `rteWave21.ts` | 未验证 |
| 标题号 | 打开后 H1–H6 用 CSS 计数器；按面板落库 | 本轮修掉无效的 `:deep()` 选择器，并补落库和 H5/H6。导出 Word/Markdown 不含编号 | `editor.global.css`、`rteHeadingAutoNum.ts`、`RichTextEditor.char.test.ts`、`scripts/rte-heading-num-e2e.mjs` | 导出仍是 P1 |
| 列表、编号样式、重编号 | 列表扩展 + `rteListRenumber.ts` | 已实现；本轮未点菜单 | `listStyleAttrs.ts` | 未验证 |
| 对齐（含两端）、行高、段距、缩进、首行缩进 | TextAlign、ParagraphAttrs | 已实现 | `useRteExtensions.ts` | 未验证像素 |
| 引用、代码块 | 自写引用；代码块含语言、复制、行号、换行 | 行号/换行见 #107。本轮未再点 | `rteBlockquote.ts`、`codeHighlight.ts` | — |
| Markdown 段首 | `#`、列表、待办、引用、代码围栏、分割线；容器策略在测试里 | 已实现。本轮未重跑整文件，规则文件未改 | `rteMarkdownInputRules.ts` 与其测试 | — |

## 4. 插入、素材、音视频

| 入口 | 行为 | 判定 | 证据 |
|---|---|---|---|
| 链接、按钮、网页卡片 | 对话框；按钮只开 http(s) | 已实现 | `RichTextEditor.vue` 链接函数、`linkButton.ts`、`linkCard.ts` |
| 图片 | 上传走素材库 `/media/{id}`；缩放、裁剪、环绕、图片组 | 素材路径见 `mediaHydrate.ts`、`docs/acceptance/media-1106/README.md`。图片组间距见 #107。本轮未再上传 | 未验证本轮回归 |
| 音频、视频 | 同一套选择弹窗 | 已实现代码；本轮未再打开弹窗 | `avMediaPicker.ts`、`RteAvPickDialog.vue` |
| 附件 | 3MB 上限与链接芯片在既有路径 | 已实现；本轮未传附件 | `useMediaLibrary.ts` |
| 二维码、表情、特殊字符、公式 | 各有插入命令 | 已实现代码；本轮未点 | `math.ts`、工具项 `qrcode` / `emoji` / `formula` |

签名 URL 与用户隔离：本轮没有改 `mediaHydrate.ts` 和 API。不能把旧验收自动说成今天又跑过一遍。飞书租户仍未验证。

## 5. 图表

9 个工具栏下拉：`chart:basic`、`chart:stats`、`chart:relation`、`chart:hierarchy`、`chart:geo`、`chart:finance`、`chart:coord`、`chart:component`、`chart:gl`（`chartGroups.ts`）。

| 能力 | 判定 | 证据 |
|---|---|---|
| 按类插入、属性面板、数据表、删除 | 已实现；本轮未再点面板 | `docs/rte-chart-panel.md`、`chart-panel/`、`ChartPanel.ops.test.ts` |
| 暗色编辑区不换图表主题 | 缺口 | `echartsBlock.ts` 无暗色分支（见对照报告） |
| 读屏是否念出摘要 | 未验证 | 有 `echartsBlock.a11y.test.ts`，没有读屏 |

## 6. 表格

| 入口 | 行为 | 判定 | 证据 | 优先级 |
|---|---|---|---|---|
| 插入、合并、列宽、单元格背景 | 已实现 | 本轮未点 | `useTableOps.ts`、`rteTableCells.ts` | 未验证 |
| 公式栏 | `SUM/AVERAGE/COUNT/MAX/MIN`、区域、四则。无跨表、无命名 | 已实现这一子集 | `rteTableFormula.ts`、`RteTableFormulaBar.vue` | 跨表是 P2 |
| 表 CSV | 复制当前表 | 已实现代码；本轮未点 | `copyTableAs` | 未验证 |
| 表筛选 | 关键词隐藏数据行；编辑后仍隐藏；不进 HTML | 本轮已补重画 | `rteWave21.ts` 的 `paintTableFilterAt`、`rteTableFilter.reapply.test.ts` | — |
| 表头冻结 | 只改根上的 class，不落库 | 缺口（刷新即关） | `tableHeaderSticky` ref、`is-table-sticky` | P1，留到下一批 |

## 7. 块与结构

| 入口 | 判定 | 证据 |
|---|---|---|
| 告示、分割线、分栏、分页、折叠、标签页 | 已实现代码 | `callout.ts`、`rteHorizontalRule.ts`、`columns.ts`、`pageBreak.ts`、`toggleBlock.ts`、`tabsBlock.ts` |
| 块菜单：转换、复制、上下移、拖拽 | 已实现。手柄不压首字有独立验收，本轮未重跑 | `useBlockHandle.ts`、`docs` 未单列；脚本 `scripts/rte-gutter-handle-e2e.mjs` |
| 日期、表单、模板、时间线、状态、进度、流程图 | 已实现代码；本轮未逐个插入 | 对应 `extensions/*.ts`、工具项 `run` |
| 片段 | 本地片段库 | 已实现代码；本轮未点 | `rteWave21.ts` 的 `saveSnippets` |
| 跨文档 / 同步块 | 快照 + 手动刷新，无推送 | 已实现这一子集；推送是缺口 | `syncBlock.ts`、`docs/rte-sync-block.md` |

## 8. 注释与引用

| 入口 | 判定 | 证据 |
|---|---|---|
| 评论线程 | 锚点在 HTML，讨论在 `commentThreadsByPanelId` | 已实现；本轮未发评论 | `commentAnchor.ts`、`rteCommentThreads.ts` |
| 行内批注 | 留在正文 | 已实现代码 | `annotation.ts` |
| 脚注、图注编号、书签、交叉引用 | 已实现代码；本轮未点 | `footnote.ts`、`bookmark.ts`、`crossRef.ts` |
| @ 提及、@ 权限 | 前端走 `/directory/users` | 已实现。本轮未登录打接口，真人列表是否非空未验证 | `useDirectoryPeople.ts`、`pros/api/internal/handler/directory.go` |

## 9. 审阅

| 入口 | 判定 | 证据 |
|---|---|---|
| 拼写 | 切 `spellcheck` | 已实现代码；浏览器字典未验证 | 工具项 `spellcheck` |
| 敏感词、标题检查、死链检查 | 本地扫描 | 已实现代码；本轮未点 | `rteSensitiveWords.ts`、`runHeadingHierarchyCheck`、`runDeadLinkCheck` |
| 中文禁则 | 只加 CSS，提示「完整排版请导出校对」 | 已实现这一子集 | `is-cjk-typography` |
| 修订高亮、建议模式、接受/拒绝 | 建议模式有作者和时间 | 已实现；本轮未走一遍接受 | `suggestionMode.ts` |
| 朗读 / 停止 | 依赖 `speechSynthesis` | 已实现代码；本环境未验证 | `speakText` |

## 10. 视图与页面

| 入口 | 判定 | 证据 |
|---|---|---|
| 专注、暗色、纸张参考线、缩放、全屏 | 会话内开关，不进画布 JSON | 已实现。刷新即丢失，标缺口（视图偏好，不是正文） | `focusMode`、`darkEditor`、`editorZoom`、`immersiveFullscreen` |
| 大纲 | 侧栏跳标题。产品要求不要把已删除的「目录」加回去 | 已实现侧栏 | `toggleOutlinePanel`；`RichTextEditor.vue` 注释「目录已按产品要求移除」 |
| 字数、阅读时长、快捷键 | 已实现代码 | `wordCount`、`openReadTimeDialog`、`ShortcutsDialog.vue` |
| 页面大小、页边距、页眉页脚页码 | 按面板落库。未保存过的纸张缺省 A4；嵌入流式不套纸 | 已实现。本轮测试确认标题编号开关不改这些字段 | `useRtePageLayout.ts`、`RichTextEditor.char.test.ts` |
| 演示 | 只读翻页 | 已实现代码；本轮未进演示 | `usePageChrome.ts` |

## 11. 文件与导出

| 入口 | 判定 | 证据 |
|---|---|---|
| 打印、预览、源码 | 编辑 / 预览 / 源码三种视图。源码用 CodeMirror | 已实现；本轮未打印 | `useViewMode.ts`、`RteSourceCodeEditor.vue` |
| 导入 | Word 粗解析、Markdown、HTML | 已实现代码；本轮未导入文件 | `useImport.ts` |
| 导出 HTML / Markdown / PDF / PNG / Word | 图表导出前换成白底快照 | 已实现代码与 `rteExportChartSnapshots.test.ts`。本轮未打开导出文件 | `useExport.ts` |
| 复制 Markdown | 已实现代码 | `exportAsMarkdown` 的复制路径在工具项 `copyMd` |
| 发布设置 | 只提示「即将支持」 | 缺口（明确的空按钮） | `onPublishSettings` | P2 |
| 标题编号进 Word/Markdown | CSS 计数器不会出现在 `getHTML()` | 缺口 | 本文件首批说明 | P1 |

## 12. 不在工具栏上、但属于编辑器

| 入口 | 判定 | 证据 |
|---|---|---|
| 斜杠菜单 | 已实现 | `slashCommands.ts`、`rteSlashItems.ts` |
| 选区气泡 | 已实现；本轮未拖选 | `RteSelectionBubble.vue` |
| 块手柄 | 已实现。不遮首字的脚本本轮没重跑 | `useBlockHandle.ts` |
| 保存重开正文 | HTML 回写 `modelValue`。本轮用挂载测试确认标题和加粗还在，并用标题编号测试确认开关写入画布 JSON | `RichTextEditor.char.test.ts` |
| 投票、白板、多维表格、思维笔记 | 没有对应节点 | 缺口，P3，不做 |
| 实时光标 | 无 Yjs | 缺口，明确不做 |

## 剩余批次（本轮不做）

1. 表头冻结、暗色、缩放、专注模式刷新后丢失（视图开关，不是正文）。
2. 标题编号不进 Markdown / Word。
3. 表格跨表公式、单元格命名。
4. 图表不跟暗色主题。
5. 同步块没有推送。
6. 「发布设置」仍是空提示。
7. 长文仍是整篇一个编辑器实例。不为此单开性能项目。
8. 飞书租户凭证、真实系统输入法。没有凭证，不伪造。

## 本轮验收

```bash
cd pros/web
npx vitest run src/utils/rteHeadingAutoNum.test.ts src/utils/rteTableFilter.reapply.test.ts src/components/rte/RichTextEditor.char.test.ts
npm run type-check
npm test
npm run build
```

浏览器（另开 `npm run dev`）：

```bash
CHROME_PATH=/usr/local/bin/google-chrome node scripts/rte-heading-num-e2e.mjs
```

2026-11-06 本机结果：

- `npx vitest run`：87 个文件，702 通过，1 跳过。
- `npx vue-tsc -b --pretty false`：通过。
- `npm run build`：通过。
- `CHROME_PATH=/usr/local/bin/google-chrome node scripts/rte-heading-num-e2e.mjs`：通过。H1 的 `::before` 计算值是 `counter(h1) ". "`，`textContent` 仍是「代码块与图片组」。截图像素里标题显示为「1. 代码块与图片组」，文件 `/opt/cursor/artifacts/rte-heading-auto-num.png`。

表筛选的「编辑后仍隐藏、HTML 不含筛选」由 `rteTableFilter.reapply.test.ts` 覆盖，本轮没有在浏览器里点「表筛选」。
