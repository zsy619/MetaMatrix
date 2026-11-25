# 富文本表情库（emoji1016 集成）

- 范围：`pros/web`（Vue3 + Tiptap）
- 目标：把 `emoji1016.txt` 的**全部** emoji 接入富文本表情面板，**全局不重复**，**按 Unicode 官方 8 大类分类**。

---

## 1. 两套图标体系

| 体系 | 文件 | 用途 | 本次是否改动 |
|---|---|---|---|
| 通用图标库 | `src/components/common/iconData.ts`（3489 个） | `IconPicker.vue` 图标选择器 | 否——已 100% 覆盖 `emoji1016.txt` |
| 富文本表情面板 | `src/utils/rteEmojiList.ts` | RTE 工具栏「表情」浮层 | 是——原先只有手工挑选的一小撮 |

`iconData.ts` 的归类是 **UI 导向**（👔👕在「常用」、❤️在「笑脸」、🌈☀️在「旅行」），不适合当语义分类器；
所以富文本表情面板单独走 `emoji1016.txt` 自带的 8 大类分组。

---

## 2. 数据流

```
scripts/data/emoji1016.txt          ← 数据源（空行分组 = Unicode 8 大类）
        │  node scripts/gen-rte-emoji.mjs
        ▼
src/utils/rteEmojiThemed.ts        ← 生成物：10 个主题分类，共 1789 个 emoji
        │
        ▼
src/utils/rteEmojiList.ts          ← 精选 + 主题分类，buildCategories() 全局去重
        │
        ▼
RteToolbar.vue / RichTextEditor.vue  → RTE_EMOJI_CATEGORIES / activeEmojiList
```

重新生成：

```bash
cd pros/web && node scripts/gen-rte-emoji.mjs
```

> 生成脚本按**码点数组**遍历切分（不是 emoji-regex），
> 否则 ZWJ 序列、变体选择符（VS15/VS16）、肤色修饰（U+1F3FB–FF）、
> RI 对（🇨🇳）与 tag 序列（🏴󠁧󠁢󠁥󠁮󠁧󠁿）会被拆碎。
> `readIconGroups` 必须跳过 `favorites` 组，否则 👔👕🧠👥 会被错误归到「笑脸」。

---

## 3. 去重规则

沿用 `iconData.ts` 的「常用优先占位」约定：

1. 归一化：去掉 VS15 / VS16 / ZWJ；
2. 按标签页顺序遍历，**先出现者占位**，后续标签页跳过已占用的字符；
3. 全库一个 emoji 只出现一次（😀 与 😀 归一化后是同一个，只保留先出现的）。

**副作用（已知并接受）**：「常用」页的 30 个 emoji 会从主题分类里移除，
所以 😀😂🤣 等经典脸**只在「常用」页出现**，「笑脸」页里没有。
若要改为「精选页与主题页允许重叠」，放开 `buildCategories()` 里的 `taken` 判重即可。

---

## 4. 面板结构（13 个标签页）

| 标签页 | 数量 | 说明 |
|---|---|---|
| 常用 | 30 | 精选，优先占位 |
| 大号表情 | 92 | `large: true`，网格列更少、字号更大 |
| 颜文字 | 30 | `kaomoji: true`，宽格文本展示 |
| 笑脸 | 73 | |
| 手势 | 44 | |
| 人物 | 253 | |
| 自然 | 171 | |
| 食物 | 122 | |
| 物品 | 245 | |
| 符号 | 260 | |
| 旅行 | 128 | |
| 活动 | 114 | |
| 旗帜 | 258 | |

面板合计 **1820** 个按钮，归一化后 **全局 1820 唯一，0 重复**。
其中 emoji 1789 个（= `emoji1016.txt` 的 1795 条目去重去跨组重复后）
+ 🫶(U+1FAF6，txt 里没有，仅在精选里) + 30 条颜文字。

---

## 5. 样式变更

`src/components/rte/styles/editor.global.css` → `.rte-picker-tabs`：

```diff
- flex-wrap: nowrap;      →  + flex-wrap: wrap;
- height: 40px;          →  + height: auto;
- max-height: 40px;      →  + max-height: none;
- overflow-x: auto;      →  + overflow-x: hidden;
```

分类从 10 个增到 13 个后单行放不下，原来的横向滚动会把末尾的「旗帜」藏住，
改成折行后 13 个标签页全部可见（实测 2 行，`.rte-picker-tabs` offsetHeight = 71px）。

---

## 6. 验证

```bash
cd pros/web
npx vitest run src/utils/rteEmojiList.test.ts   # 7 tests passed
npx vitest run                                   # 6 failed / 246 passed（= 基线）
npx vue-tsc -b --pretty false                    # 63 errors（= 基线，改动文件 0 错）
```

浏览器实测（Chrome，文档编辑器内打开「表情」面板）：

- 面板 380 × 340，`.rte-picker-tabs` 13 个标签页折成 2 行，offsetHeight 71px；
- 各标签页按钮数与上表一致，逐页实测 `uniq === n`；
- 全量遍历 13 页累计 1820 个按钮，归一化后全局唯一 1820，重复 0；
- 插入功能实测：点 🥲 → `.ProseMirror` 内容变为 `🥲`；撤销后回到空文档并刷新确认仍是空。

截图：`/tmp/rte-emoji-flags.png`、`/tmp/rte-emoji-smile.png`

---

## 7. 已知限制

- `emoji1016.txt` 是 Unicode 13 时代集合，**不含** U14/15/16 新 emoji
  （🫠🪿🪉🐦‍🔥🍋‍🟩⛓️‍💥🧑‍🧑‍🧒🫆🪾🛜 均无）。
  同目录 `emoji14.txt` / `emoji144.txt` / `emoji264.txt` / `emoji1014.txt` 可换用，
  重跑生成脚本即可。
- 画布内 RTE（`.canvas-viewport .rte-root .rte-toolbar`）被设计性地 `display:none`，
  表情面板只能在文档编辑器 / 页面纸里打开——既有设计，非本次引入。
