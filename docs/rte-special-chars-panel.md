# 富文本「符号」面板（Telegram Web K 重做）

- 范围：`pros/web`（Vue3 + Tiptap）
- 入口：工具栏「符号 ▾」（Ribbon 展开态 + 紧凑态各一份）
- 组件：`src/components/rte/RteSpecialCharsPicker.vue`（薄封装）
- 外壳：`src/components/rte/RteGlyphPicker.vue`（与表情面板共用）
- 搜索索引：`src/utils/rteSpecialCharSearch.ts`
- 数据：`src/utils/rteSpecialChars.ts`（993 个符号，13 个分类）

---

## 1. 改前的问题

| 问题 | 表现 |
|---|---|
| 分类标签折行 | 13 个文字分类折成 2 行 |
| 内容被切 | 面板固定 `380×340`，网格最后一行被裁掉一半 |
| 没有检索 | 993 个符号只能靠分类翻找 |
| 规格不符 | 10px 圆角 + 轻阴影，与 AGENTS.md §2 的浮层表面规格不一致 |
| 重复代码 | 展开态 / 紧凑态各写一份同样的面板 markup |

## 2. 现在的结构

和表情面板完全同构（共用 `RteGlyphPicker` 外壳）：

```
┌─ 搜索框（圆角 12，聚焦品牌蓝 + 3px 柔光环，可清除）
├─ 分类条：灰底容器 + 白色药丸选中块，13 个代表字符一行排完
├─ 网格标题：当前分类名 + 数量（或「搜索结果 N」）
└─ 网格：10 列 × 18px 符号，高度随内容自适应，超出内部滚动
```

- **分类代表字符**：标点 `，` / 数学 `∑` / 货币 `¥` / 箭头 `→` / 版权 `©` / 括号 `（` /
  希腊 `α` / 单位 `°` / 序号 `①` / 罗马 `Ⅰ` / 全角 `Ａ` / 制表 `┌` / 拼音 `ā`。
- **搜索**（`rteSpecialCharSearch.ts`）：
  - 中文别名：`ALIAS_GROUPS`（约 160 组关键词，如「逗号 → ，」「求和 → ∑」「人民币 → ¥」）；
  - 分类名：输入「箭头」「版权」直接命中该分类；
  - 粘贴字符：粘贴 `¥`、`→` 等字符精确命中。
- **符号字体**：PingFang / Segoe UI Symbol / Noto Sans Symbols 字体栈，
  避免不同符号的字面宽度跳动。

## 3. 表面规格（AGENTS.md §2）

| 项 | 值 |
|---|---|
| 宽度 | `420px`（与表情面板一致） |
| 高度 | `auto`，上限 `min(460px, 70vh)` |
| 圆角 | `12px` |
| 描边 | `1px solid var(--tg-border)` |
| 投影 | `0 24px 64px rgba(15,23,42,.18)` |

> **例外说明**：浮层运行时会被加上 `.rte-float-menu` 类，`telegram.ui.css` 对
> `.rte-float-menu` 及其 `button` 用了 `!important`。
> 外壳的 `padding: 0` / 12px 圆角 / shadow-3 写在 `telegram.ui.css` 的
> `.rte-emoji-panel, .rte-specialchars-panel` 规则里；网格单元、分类药丸、清除按钮
> 在 `RteGlyphPicker` 内用 `!important` 覆盖按钮默认样式（代码注释写明原因）。

## 4. 已知取舍

- 中文别名只覆盖约 160 组高频符号，其余靠分类名或粘贴字符检索。
- 符号分类「括号」只有 2 个字符（其余括号在「标点」里），该分类药丸仍保留。
- 深色模式未适配。

## 5. 验证

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线：`vitest` 6 个 rte 文件失败（改动前后一致）、`vue-tsc` 62 个错误（= 基线）；
新增 `src/utils/rteSpecialCharSearch.test.ts` 8 个用例全过。

浏览器实测（Chrome headless + Playwright）：

- 面板 `420×411`（标点 90 个，网格内部滚动）、搜索态 `420×173`；
- 圆角 `12px`、投影 `0 24px 64px rgba(15,23,42,.18)`、描边 `rgb(230,230,230)`、外壳 `padding: 0`；
- 分类条 13 个药丸，`scrollWidth === clientWidth === 418`（无横向滚动）；
- 网格 10 列，符号 `font-size: 18px`；
- 搜索「逗号」→ 1 条（，）；搜索「箭头」→ 103 条（整个箭头分类）；粘贴 `¥` → 命中；
- 点 `¥` 后正文实测写入 `¥`；
- 表情面板回归：`420×254`，13 个药丸，30 个常用 emoji。

截图：`/tmp/rte-sc-panel.png`、`/tmp/rte-sc-search.png`
