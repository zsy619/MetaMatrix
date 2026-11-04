# 块手柄留白（gutter）修复结果

> 任务：富文本编辑器里悬停段落时，左侧「⠿ 拖拽」「⋮ 菜单」浮在正文上，盖住每行第一个字，
> 且点击首字前无法放置光标。要求手柄落到正文左侧留白里、不拦截正文点击、窄屏与 A4 窄边距也不遮挡。

## 一、根因

`pros/web/src/components/rte/composables/useBlockHandle.ts` 原来按「块左边界 − 28px」放手柄：

```ts
const left = Math.max(4, rect.left - canvasRect.left - 28)   // 旧实现
```

而手柄条本身宽 `22 + 2 + 22 = 46px`（`.rte-block-handle` 宽 22，`.rte-block-tools` gap 2）。
即手柄左边界只比正文左边界靠前 28px，右侧仍有 18px 压在正文上——正好压住首字
（用户截图里「航海案主」的「航」被盖住）。
同时 `.rte-block-tools` 容器铺在正文上方，容器本身会吃掉落在首字附近的点击，首字前点不到光标。

另一个隐患：正文左侧**根本没有预留留白**，A4 窄边距（12.7mm ≈ 48px）是页边距本身，
放不下 46px 的手柄列。

## 二、方案（对齐飞书）

1. **留白（gutter）先行**：正文内容列左侧强制留出一列空白，宽度 ≥ 手柄列宽 + 间距。
   - 收起态（只有「⋮ 菜单」一个按钮）：`--rte-gutter-size: 26px`
   - 展开态（「⠿ 拖拽」+「⋮ 菜单」两个按钮）：`--rte-gutter-size: 50px`
   - 各版式（纸卡片 / A4 纸张 / 铺满 / 窄屏 / 纸张导览）统一用
     `max(原有左内边距, var(--rte-gutter-size))` 取值，保证留白不被版式挤掉。
   - A4 纸张模式留白落在纸张左页边距里：`padding-left: max(var(--rte-margin-left), var(--rte-gutter-size))`，
     虚线页边距框同步右移，仍与正文起始位置对齐。
2. **手柄定位按内容左边界算**：JS 不再用「块左边界 − 28px」的魔数，改为量出
   ProseMirror 内容盒左边界（`rect.left + border-left + padding-left`），手柄右边缘固定停在
   「正文左边界 − 4px」，因此**恒有 `handle.right <= text.left`**。
3. **容器不拦截正文点击**：`.rte-block-tools { pointer-events: none }`，
   仅 `.rte-block-handle { pointer-events: auto }`——首字前可点击设光标、可选中首字。
4. **功能不变**：拖拽排序（HTML5 dragstart/dragover/drop）、块菜单（⋮）逻辑、
   块级菜单项（转正文/标题/列表/复制/上移/下移/删除）全部沿用原逻辑，未改事件流。

新增常量集中在 `pros/web/src/utils/rteGutter.ts`（CSS 与 JS 共用同一组数值，避免两边漂移）。

## 三、改动文件

| 文件 | 改动 |
| --- | --- |
| `pros/web/src/utils/rteGutter.ts` | 新增：手柄宽度/间距/留白常量、`blockHandleLeft()`、`proseContentLeft()` 等纯函数 |
| `pros/web/src/components/rte/composables/useBlockHandle.ts` | 手柄左边界改为按正文内容左边界计算（展开/收起两种宽度） |
| `pros/web/src/components/RichTextEditor.vue` | `useBlockHandle` 增加 `expanded` 入参（决定手柄列宽度） |
| `pros/web/src/components/rte/styles/editor.scoped.css` | `--rte-gutter-size` 变量、正文列左内边距预留、`.rte-block-tools`/`.rte-block-handle` 的 `pointer-events` |
| `pros/web/src/components/rte/styles/editor.global.css` | A4 纸张页边距与虚线框按留白取值；纸张导览版左内边距下限 |
| `pros/web/src/utils/rteGutter.test.ts` | 新增单测：三种版式几何断言 + CSS 规则断言 |
| `pros/web/src/components/rte/composables/useBlockHandle.gutter.test.ts` | 新增单测：happy-dom 下跑真实 hover 路径，断言 `handle.right <= 正文左边界 - 4px` |
| `pros/web/rte-gutter-preview.html`、`pros/web/src/rteGutterPreview.ts`、`pros/web/scripts/rte-gutter-handle-e2e.mjs` | 上一轮留下的 A4 预览页 + e2e 断言脚本（本轮不跑，交给 CI） |

## 四、验收对照表

| 需求 | 状态 | 证据 |
| --- | --- | --- |
| 手柄放在正文左侧留白，不与文字重叠 | ✅ 已对齐 | `useBlockHandle.gutter.test.ts` 断言展开/收起/A4 三种版式下 `handle.right <= 正文左边界 - 4px`；`rteGutter.test.ts` 断言三种版式几何 |
| 正文内容区左侧留足 padding | ✅ 已对齐 | `--rte-gutter-size`（收起 26px / 展开 50px）+ 各版式 `max(原值, var(--rte-gutter-size))`；A4 纸张用 `max(--rte-margin-left, --rte-gutter-size)` |
| 手柄容器不拦截正文点击（首字前可设光标、可选中首字） | ✅ 已对齐 | `.rte-block-tools { pointer-events: none }` + `.rte-block-handle { pointer-events: auto }`（CSS 断言在单测里） |
| 不改变拖拽与块菜单功能 | ✅ 已对齐 | 事件流未改：dragstart/dragover/drop 与块菜单各项逻辑原样保留 |
| 窄屏 / A4 窄边距不遮挡 | ⚠️ 部分对齐 | CSS 上窄屏（≤720px）左内边距取 `max(14px, var(--rte-gutter-size))`、A4 窄边距取 `max(--rte-margin-left, var(--rte-gutter-size))`，逻辑上均 ≥ 手柄列宽；**但未在真实浏览器量过** |
| 1440×900 / 1280×800 悬停截图 | ❌ 未验证 | 本轮禁止起 dev server / 装 chromium / 跑 e2e，截图由 CI 跑 `scripts/rte-gutter-handle-e2e.mjs` 产出到 `shots/rte-gutter-handle/` |
| 点击首字左边缘光标落在 offset 0 | ❌ 未验证 | e2e 脚本已含该断言（`$from.parentOffset === 0`），本轮未在浏览器执行 |
| 拖拽排序仍可用 | ❌ 未验证 | e2e 脚本已含拖拽前后块顺序对比断言，本轮未在浏览器执行 |

## 五、本地执行记录

| 命令 | 结果 |
| --- | --- |
| `npx vitest run` | ✅ 68 个测试文件 / 463 个用例全绿（含新增 2 个文件） |
| `npx vue-tsc -b --pretty false` | ✅ 无错误 |
| `npx vite build` | ✅ built in 6.11s |

> 说明：本 worktree 无独立 `node_modules`，验证时软链到同 commit 邻近 worktree
> （`MetaMatrix-p0-syncblock/pros/web/node_modules`）的依赖目录；`node_modules`/`dist` 均在
> `.gitignore` 内，未进入提交。

## 六、遗留与后续

- e2e 与截图需在 CI 或有浏览器的环境执行：
  `node pros/web/scripts/rte-gutter-handle-e2e.mjs`（依赖本地 vite dev + `pros/web/rte-gutter-preview.html`）。
- 打印样式已复核：`.rte-root.rte-printing.is-page-sheet` 会把纸张内边距清零，屏幕上的留白不会带进打印。
