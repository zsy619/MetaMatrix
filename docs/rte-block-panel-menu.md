# 「+」块操作面板：命令去重

- 范围：`pros/web`（Vue3 + Tiptap）
- 面板入口：文档 / 页面纸里悬停块左侧的 `+` → `.rte-block-menu`
- 落点：`pros/web/src/utils/rteBlockPanelMenu.ts`（配置 + 去重）、`pros/web/src/components/rte/RteDocumentBody.vue`（渲染）

---

## 1. 问题

面板分「基础（图标快捷区）/ 常用 / 更多插入 / 转换为 / 块操作」五段，
但同一条命令会在多段里重复出现：

| 重复项 | 原本出现的位置 | 实际动作 |
|---|---|---|
| 公式 | 基础图标区、常用区 | 都是 `slashId: 'formula'` |
| 分割线 | 基础图标区、常用区 | 都是 `slashId: 'hr'` |
| 正文 / 标题 1-3 / 无序列表 / 有序列表 / 任务列表 / 引用 | 基础图标区、转换为区 | 都是 `turnHoveredBlock(kind)` |
| 高亮块 / 提示 | 基础图标区、转换为区 | 都是 `turnHoveredBlock('info')` → `setCallout('info')` |

---

## 2. 口径

**面板里一条命令只能出现一次。** 命令键归一化后全局判重，**先出现的段落占位**：

```
turn:<kind>          转换当前悬停块
insert:<slashId>     插入新块
```

去重按段落的固定顺序进行：基础 → 常用 → 更多插入 → 转换为。

去重后各段：

| 段 | 条目 |
|---|---|
| 基础（图标，2 行 6 列 = 12 个） | 正文、标题 1/2/3、无序列表、有序列表、任务列表、代码块、引用、高亮块、公式、分割线 |
| 常用（7） | 图片、视频、附件、表格、分栏、按钮、链接 |
| 更多插入（6） | 目录、折叠块、今天日期、网页卡片、流程图、图表 |
| 转换为（3） | 警告、成功、错误 |
| 块操作（4） | 复制块、上移、下移、删除 |

公式 / 分割线仍可用（基础图标区），正文 / 标题 / 列表 / 引用 / 高亮块仍可用（基础图标区），
只是不再在第二处重复出现。

---

## 3. 实现

`rteBlockPanelMenu.ts` 保留三份**原始配置**（与改动前完全一致），
再用 `claim()` 做一次全局去重，输出 `BLOCK_PANEL_QUICK_ACTIONS` /
`BLOCK_PANEL_INSERT_SECTIONS` / `BLOCK_PANEL_TURN_ACTIONS`。

好处：以后谁再往原始配置里加一条重复命令，会被自动挡掉，不会重新出现重复入口。
`转换为` 段在模板里改成 `v-for` 渲染，不再手写 12 个按钮。

---

## 4. 验证

```bash
cd pros/web
npx vitest run src/utils/rteBlockPanelMenu.test.ts   # 5 tests passed
npx vitest run                                          # 6 failed / 246 passed（= 基线）
npx vue-tsc -b --pretty false                           # 63 errors（= 基线，改动文件 0 错）
```

浏览器实测（Chrome，需求文档 `775eafa4`，悬停「非功能需求」→ 点 `+`）：

- `.rte-block-menu` 304 × 520，`grid-template-columns` = 6 列 × 44.33px，图标区 2 行；
- 段落顺序：基础 / 常用 / 更多插入 / 转换为 / 块操作；
- 基础 12 个、菜单项 21 个；
- **`data-command` 重复数 0，label 重复数 0**。

截图：`/tmp/block-panel-after.png`（顶部）、`/tmp/block-panel-bottom.png`（内部滚动到底）

---

## 5. 已知限制

- 面板固定向下展开（`top = 手柄 top + 26px`），块位于文档下半部分时会被
  `.doc-view__body` 裁掉底部，需要在面板内滚动才能看到「转换为 / 块操作」。
  这是既有行为，本次未改动。
- 去重口径是「先出现者占位」。若希望某一类命令优先出现在文字列表而不是图标区，
  需要调整段落顺序，而不是直接删条目。
