# 紧凑态主栏与方案 A 分组对齐（对照文档）

- 分支：`cursor/dsh-rte-p0-compact`（基线 `main` @ 593227f）
- 范围：`pros/web`（Vue3 + Tiptap）
- 目标：**紧凑画布主栏**与**最大化工具栏（方案 A 的 11 个分组）**不再是两套心智；
  紧凑态高频键由方案 A 分组派生，用户拖拽分组顺序后紧凑主栏随之同步。
- 文档定位：**已对齐 / 未对齐 / 未验证** 三段式对照，附验证方式与截图路径。

---

## 1. 需求对照总表

| # | 需求 | 状态 | 落点 | 验证方式 |
|---|---|---|---|---|
| 1 | 紧凑主栏的高频键不再单独维护一份扁平顺序表 | 已对齐 | `utils/rteToolbarGroups.ts` 的 `COMPACT_PRIMARY_KEYS_BY_GROUP`；`RichTextEditor.vue` 直接用 `COMPACT_PRIMARY_KEY_SET`（原 `FEISHU_PRIMARY_ORDER` 已删除） | vitest `rteToolbarGroups.compact.test.ts`（断言源码里不再出现 `FEISHU_PRIMARY_ORDER`） |
| 2 | 紧凑主栏的 key ⊆ 当前 `TOOLBAR_GROUPS` | 已对齐 | 同上 | vitest「紧凑主栏高频键 ⊆ TOOLBAR_GROUPS」 |
| 3 | 相对顺序与分组顺序一致（组内 = 分组 keys 顺序，组间 = 分组顺序） | 已对齐 | `compactPrimaryKeys()` / `compactPrimaryKeysByGroup()` | vitest「组内相对顺序」「默认顺序 = 各组拼接」 |
| 4 | 用户拖拽调整分组顺序后，紧凑态高频键随之同步 | 已对齐 | 紧凑态与最大化态共用 `useToolbarGroups` 的 `toolbarOrder`（同一份分组顺序），紧凑主栏 = 分组顺序 × 组内高频键 | vitest「拖拽后组间顺序跟随」+ e2e「Alt+→ 拖动后紧凑主栏分组顺序变化」（截图 02） |
| 5 | 窄屏下主栏或「更多」里一定能找到图表入口（9 分类下拉） | 已对齐 | 图表 9 个一级分类统一收在「更多」的「图表」分组；紧凑态点分类项就地展开该分类下拉（`RteToolbar.vue` 的 `.rte-chart-more-flyout`） | vitest「9 个分类 key 都在「更多」里」+ e2e 截图 04 / 05 / 08 / 09 |
| 6 | 图表分类顺序 = `CHART_GROUPS` 顺序（基础/统计/关系/层级/地理/金融/坐标系/组件/3D·GL） | 已对齐 | `charts` 分组的 keys = `CHART_TOOLBAR_KEYS`（= `CHART_GROUPS` 顺序） | vitest「图表分类顺序」+ e2e「「更多」里 9 个分类的顺序」 |

---

## 2. 口径（产品/实现约定）

### 2.1 紧凑主栏怎么来的

```
紧凑主栏 = 用户当前分组顺序（toolbarOrder）
         × 每组声明的高频键（COMPACT_PRIMARY_KEYS_BY_GROUP）
         组内顺序 = 该组 TOOLBAR_GROUPS.keys 的顺序
```

- 高频键声明（`utils/rteToolbarGroups.ts`）：

  | 分组 | 高频键 |
  |---|---|
  | 编辑 `edit` | 撤销、重做 |
  | 字体与颜色 `style` | 粗体、斜体、下划线、删除线、文字颜色、高亮 |
  | 段落与列表 `paragraph` | 标题、列表、对齐、引用、代码块 |
  | 插入 `insert` | 链接、图片 |

- 组内顺序**不再另写一份**：按上表声明「想要哪些键」，实际顺序取 `TOOLBAR_GROUPS` 里该组的 keys 顺序，
  所以紧凑态与最大化态的组内顺序天然一致（改一处、两处生效）。
- 组间顺序来自用户拖拽后的分组顺序（按面板保存），紧凑态与最大化态共用同一份数据，**不存在第二套顺序表**。

### 2.2 图表入口放在「更多」里

- 紧凑主栏不放图表按钮：9 个一级分类全放进去会把主栏撑爆。
- 9 个分类统一收在「更多」→「图表」分组，顺序 = `CHART_GROUPS` 顺序。
- 紧凑态点某个分类 → **就地展开该分类的下拉**（分类 → 具体图表类型 + 「一键生成…」），
  不再像以前那样直接跳「一键生成」对话框（那样窄屏用户找不到具体分类）。
- 最大化态行为不变：工具栏上仍是 9 个独立下拉按钮。

### 2.3 已知未对齐 / 遗留

- **未对齐**：「更多」菜单把 11 个分组全列出来（内容很长），菜单滚动位置在工具栏重渲染时会被复位，
  窄屏滚动体验一般 → 归到 P1-4「窄屏工具栏溢出重构」，本任务未动。
- **未验证**：真实登录 + 后端画布里的紧凑态（本任务用组件 harness 页验证，见第 4 节）；
  旧文档迁移后的紧凑态（本任务只改工具栏口径，未动迁移逻辑，migrate 任务单独回归）。

---

## 3. 改动文件

| 文件 | 改动 |
|---|---|
| `pros/web/src/utils/rteToolbarGroups.ts` | 新增 `COMPACT_PRIMARY_KEYS_BY_GROUP`、`compactPrimaryKeys()`、`compactPrimaryKeysByGroup()`、`compactOverflowKeys()`、`COMPACT_PRIMARY_KEY_SET` |
| `pros/web/src/components/RichTextEditor.vue` | 删除 `FEISHU_PRIMARY_ORDER`（平行顺序表），改用 `COMPACT_PRIMARY_KEY_SET`；「更多」里点图表分类改为就地展开分类下拉（`moreChartGroupKey`） |
| `pros/web/src/components/rte/RteToolbar.vue` | 「更多」菜单新增图表分类下拉（`.rte-chart-more-flyout`）与 ▸ 箭头 |
| `pros/web/src/components/rte/styles/editor.global.css` | 「更多」里图表下拉的样式（Teleport 到 body，用 unscoped 兜底） |
| `pros/web/src/utils/rteToolbarGroups.compact.test.ts` | 新增单测（①②③ 口径锁定） |
| `pros/web/src/rteCompactPreview.ts`、`pros/web/rte-compact-preview.html` | e2e harness 组件页（无后端、无登录） |
| `pros/web/scripts/rte-compact-toolbar-e2e.mjs` | e2e：紧凑主栏 / 拖拽同步 / 「更多」图表入口 / 窄屏截图 |

---

## 4. 验证方式

### 单测（vitest）

```bash
cd pros/web && npx vitest run src/utils/rteToolbarGroups.compact.test.ts
```

锁定：高频键 ⊆ `TOOLBAR_GROUPS`；组内相对顺序 = 分组 keys 顺序；拖拽后组间顺序跟随；
图表 9 分类都在「更多」里且顺序 = `CHART_GROUPS`；源码里不再有 `FEISHU_PRIMARY_ORDER`。

### e2e（playwright，无需登录 / 无需后端）

```bash
cd pros/web
npx vite --port 5173 --host 127.0.0.1     # 前置
node scripts/rte-compact-toolbar-e2e.mjs   # RTE_WEB_URL / RTE_BASELINE_DIR 可覆盖
```

harness 方式：`/rte-compact-preview.html`（`src/rteCompactPreview.ts`）直接挂 `RichTextEditor` 的紧凑态，
用最小画布数据顶替后端，不触网。

截图目录：`/workspace/outputs/metamatrix/shots/rte-p0-compact/`

| 截图 | 内容 |
|---|---|
| `01-compact-primary.png` | 紧凑主栏（编辑 / 字体与颜色 / 段落与列表 / 插入 + 更多） |
| `02-compact-primary-reordered.png` | 拖动分组顺序后紧凑主栏随之变化 |
| `03-more-open.png` | 「更多」全量分组 |
| `04-more-chart-group.png` | 「更多」里的图表 9 个一级分类 |
| `05-more-chart-dropdown.png` | 点「基础」展开的分类下拉（分类 → 具体图表类型 + 一键生成） |
| `06-compact-narrow.png` | 窄屏（390px）紧凑主栏 |
| `07-narrow-more-open.png` | 窄屏「更多」 |
| `08-narrow-more-chart-group.png` | 窄屏「更多」里的图表 9 分类 |
| `09-narrow-more-chart-dropdown.png` | 窄屏下的图表分类下拉 |
