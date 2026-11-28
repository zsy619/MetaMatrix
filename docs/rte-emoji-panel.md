# 富文本「表情」面板（Telegram Web K 重做）

- 范围：`pros/web`（Vue3 + Tiptap）
- 入口：工具栏「表情 ▾」（Ribbon 展开态 + 紧凑态各一份）、「更多 → 表情」浮层
- 组件：`src/components/rte/RteEmojiPicker.vue`（薄封装）
- 外壳：`src/components/rte/RteGlyphPicker.vue`（与符号面板共用的选择器外壳：搜索框 / 分类条 / 网格）
- 数据：`src/utils/rteEmojiList.ts`（1820 个不重复 emoji，13 个分类）+
  `src/utils/rteEmojiSearch.ts`（搜索索引）

---

## 1. 改前的问题

| 问题 | 表现 |
|---|---|
| 分类标签折行 | 13 个文字分类折成 2 行（71px），「旗帜」挤在第二行末尾 |
| 大片留白 | 面板固定 `380×340`，「常用」只有 30 个 → 下方约 180px 空白 |
| 没有检索 | 1820 个 emoji 只能靠分类翻找 |
| 规格不符 | 10px 圆角 + `0 8px 24px rgba(0,0,0,.12)`，与 AGENTS.md §2 的浮层表面规格不一致 |
| 重复代码 | 展开态 / 紧凑态各写一份同样的面板 markup |
| 样式被压制 | 运行时面板会被加上 `.rte-float-menu` 类，`telegram.ui.css` 用 `!important` 统一按钮样式，emoji 字号被压成 13px |

## 2. 现在的结构

```
┌─ 搜索框（圆角 12，聚焦品牌蓝 + 3px 柔光环，可清除）
├─ 分类条：灰底容器 + 白色药丸选中块，13 个图标一行排完（420px 内不横向滚动）
├─ 网格标题：当前分类名 + 数量（或「搜索结果 N」）
└─ 网格：10 列；大号表情 6 列 28px；颜文字 3 列；高度随内容自适应，超出内部滚动
```

- **分类图标**：每个分类一个代表性 emoji（常用 ⭐ / 大号表情 😀 / 颜文字 ^_^ / 笑脸 😊 / 手势 👋 /
  人物 🧑 / 自然 🌿 / 食物 🍎 / 物品 💡 / 符号 ❤️ / 旅行 ✈️ / 活动 ⚽ / 旗帜 🚩），
  `title` 里给出「分类名 · 数量 · 说明」，`aria-label` 给分类名。
- **高度自适应**：面板 `height: auto`，上限 `min(460px, 70vh)`；
  「常用」只有 30 个 → 面板 254px，不再留白；「人物」253 个 → 411px，网格内部滚动。
- **搜索**（`src/utils/rteEmojiSearch.ts`）：
  - 中文别名：`ZH_ALIAS`（约 170 条高频表情，手工维护）；
  - 英文名：`components/common/iconData.ts` 里已有的 CLDR 名（页面本来就在用，不额外增大包体）；
  - 分类名：输入「旗帜」「手」直接命中该分类；
  - 粘贴 emoji：直接粘贴表情字符即可精确命中。
- **选中分类会清空搜索词**，避免搜索态下点分类「没反应」。

## 3. 表面规格（AGENTS.md §2）

| 项 | 值 |
|---|---|
| 宽度 | `420px`（`max-width: min(420px, calc(100vw - 24px))`） |
| 圆角 | `12px` |
| 描边 | `1px solid var(--tg-border)` |
| 投影 | `0 24px 64px rgba(15,23,42,.18)` |
| 令牌 | 全部取 `--tg-*` |

> **例外说明**：浮层运行时会被加上 `.rte-float-menu` 类，`telegram.ui.css` 对
> `.rte-float-menu` 及其 `button` 用了 `!important`（4px 内边距 / 8px 圆角 / 13px 字号 / 30px 行高）。
> 因此：
> - 面板外壳的 `padding: 0`、12px 圆角、shadow-3 写在 `telegram.ui.css` 的
>   `.rte-emoji-panel` 规则里（同文件更靠后 + `!important`）；
> - emoji 网格单元、分类药丸、清除按钮在组件内用 `!important` 覆盖按钮默认样式，
>   代码注释里写明原因（AGENTS.md §2.1.3 允许此做法）。

## 4. 与「符号」面板共用外壳

表情面板与符号面板共用 `RteGlyphPicker.vue`（搜索框 + 图标分类条 + 自适应网格），
两个薄封装只提供分类数据、代表字符与搜索索引。详见
[rte-special-chars-panel.md](./rte-special-chars-panel.md)。

## 5. 已知取舍

- 中文别名只覆盖约 170 个高频表情，其余 emoji 只能用英文名 / 粘贴字符检索
  （`emoji1016.txt` 只给字符、不给名称）。
- 分类药丸只有图标没有文字，依赖 `title` 与网格标题里的分类名传达语义；
  13 个分类在 420px 内不横向滚动，再加分类会溢出（届时打开横向滚动 + 选中项自动滚入视野）。
- 深色模式（`.rte-root.is-dark-editor`）下未做适配。

## 6. 验证

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线：`vitest` 6 个 rte 文件失败（改动前后一致）、`vue-tsc` 62 个错误（= 基线）；
新增 `src/utils/rteEmojiSearch.test.ts` 9 个用例全过。

浏览器实测（Chrome headless + Playwright）：

- 面板 `420×254`（常用，30 个）、`420×411`（人物 253 个，网格内部滚动）、`420×173`（搜索 5 条）；
- 圆角 `12px`、投影 `0 24px 64px rgba(15,23,42,.18)`、描边 `rgb(230,230,230)`、外壳 `padding: 0`；
- 分类条 13 个药丸，`scrollWidth === clientWidth`（无横向滚动）；
- emoji 单元格 `font-size: 20px`、圆角 `8px`、内边距 `0`（大号表情 28px）；
- 搜索「火」→ 3 条（🔥 😡 🚀）；搜索 `rocket` → 🚀；搜索「庆祝」→ 5 条；
- 点分类后网格标题与数量同步切换（「人物 253」「手势 44」）；
- 选中 🎉 后正文实测写入 🎉。

截图：`/tmp/rte-emoji-panel.png`、`/tmp/rte-emoji-search.png`、`/tmp/rte-emoji-large.png`、
`/tmp/rte-emoji-kaomoji.png`、`/tmp/rte-emoji-people.png`
