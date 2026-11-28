# 图表一级分类下拉面板（对照文档）

- 范围：`pros/web`（Vue3 + Tiptap + ECharts）
- 对象：工具栏「图表」分组下的 9 个一级分类下拉
  （基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）
- 目标：**Ribbon 悬浮下拉**与**「更多」菜单里的内联下拉**共用同一份面板，
  39 个类别各有专属图标，层级 / 间距 / 状态符合 Telegram 风格规范。

---

## 1. 修订前的问题

| # | 问题 | 证据（修订前实测） |
| --- | --- | --- |
| 1 | 39 个类别共用同一个通用柱状图图标 | 面板内 5 个图标的 SVG 内容完全一致（`M4 19V5…`） |
| 2 | 面板没有标题层级，只有一行灰字 | `.rte-menu-section` = 11px `#86909c` 纯文本「插入基础图表：折线 / 柱状 / 饼图 / 散点」 |
| 3 | 类别行只有「名称 + N 种」，没有用途说明与展开暗示 | 行高 30px，无图标块、无箭头 |
| 4 | 子列表与主列表视觉上没有从属关系 | `.rte-menu-sub` 只有 2px 灰线，子项图标同样是通用柱状图 |
| 5 | 底部「一键生成…」是普通菜单项 + 省略号，观感像占位符 | 与「菜单项」同样式，无图标、无强调 |
| 6 | Ribbon 悬浮面板与「更多」内联面板是两份复制粘贴的模板 | 两处各写一遍 `.rte-menu-cat` / `.rte-menu-sub` 结构，样式也各写一套 |

## 2. 修订后的结构

新增组件 `pros/web/src/components/rte/RteChartGroupMenu.vue`（Ribbon 与「更多」共用）：

    ┌ 标题栏 ──────────────────────────────┐
    │ [分类图标] 基础图表                   │  26px 图标块（accent-soft 底 + 主色图标）
    │          折线 / 柱状 / 饼图 / 散点       │  13px 标题 + 11px 副标题
    ├ 类别列表（内部滚动，标题/底部常驻）──────┤
    │ [类别图标] 折线图 趋势变化   [6 种] ›   │  36px 行高 / 24px 图标块 / 数量胶囊 / 展开箭头
    │   · 基础折线图  多条折线对比趋势           │  28px 子项 + 左侧 1px 引导线
    │   · 平滑折线图  曲线过渡，适合趋势           │
    │ [类别图标] 柱状图 分类对比   [5 种] ›   │
    │ …                                      │
    ├ 底部 ───────────────────────────────┤
    │ ✨ 一键生成图表…                        │  34px，主色（#3370ff）
    └──────────────────────────────────────┘

### 2.1 专属图标

新增 `pros/web/src/components/rte/chartCategoryIcons.ts`：

- 39 个类别各一张线稿 SVG（24×24 视框、1.7 描边、`currentColor`）；
- 通过 `menuGlyph('chart:<categoryId>')` 接入既有 `RteMenuGlyph`，
  未知类别回退到通用柱状图（`menuGlyphs.ts` 里先查 `chart:` 前缀）；
- 计数：39 个类别 → 39 张不重复图标（vitest + 浏览器实测均断言唯一）。

### 2.2 状态

| 状态 | 表现 |
| --- | --- |
| 默认行 | 图标块浅灰底 + 灰图标，名称 13px/600，说明 11px 灰字，数量胶囊浅灰 |
| hover 行 | 背景 `#f2f3f5`，圆角 8px，图标块转白底 + 主色图标 |
| 展开行 | 背景 `#eef3ff`，文字与图标转主色 `#3370ff`，数量胶囊转主色淡底，箭头旋转 90° 朝下 |
| 展开子列表 | 左移 20px、左侧 1px `#e5e6eb` 引导线，条目 28px，名称 + 说明 |
| 底部入口 | 34px，主色文字 + 闪光图标，hover 转 `#eef3ff` 底 |

### 2.3 容器与滚动

- `.rte-float-menu.rte-menu-echarts` 改为 `padding: 0; overflow: hidden`，
  滚动交给面板内部列表，**标题栏与底部「一键生成」常驻可见**；
- 面板最大高度沿用 `--rte-float-max-h`（`min(70vh, 560px)`）；
- 「更多」内的联面板列表限高 320px，避免撑破菜单。

## 3. 文件落点

| 文件 | 作用 |
| --- | --- |
| `components/rte/chartCategoryIcons.ts` | 39 个类别专属 SVG 图标 |
| `components/rte/RteChartGroupMenu.vue` | 面板本体（标题栏 / 列表 / 子列表 / 底部入口）+ 样式 |
| `components/rte/menuGlyphs.ts` | `menuGlyph()` 增加 `chart:<categoryId>` 分支 |
| `components/rte/RteToolbar.vue` | 两处下拉改用 `RteChartGroupMenu`（Ribbon 悬浮 + 「更多」内联） |
| `components/rte/styles/editor.global.css` | 删除旧的 `.rte-menu-cat` / `.rte-menu-sub` 规则，容器改为内部滚动 |
| `components/rte/RteChartGroupMenu.test.ts` | 面板结构 / 图标唯一性 / 内联面板同构的特征测试 |
| `components/rte/RteToolbarCharts.test.ts` | 选择器随结构更新（`.rte-menu-cat` → `.rte-chart-menu__row`） |

## 4. 验证

浏览器实测（Chromium headless + Playwright，展开态 Ribbon）：

| 指标 | 修订前 | 修订后 |
| --- | --- | --- |
| 面板宽度 | 240px | 254px |
| 标题栏 | 无（11px 纯文本 24px 高） | 52px（图标块 + 标题 + 副标题） |
| 类别行高 | 30px | 36px |
| 类别图标 | 5 个类别共用 1 张 | 39 类别 39 张，互不重复 |
| 子项行高 | 25px | 28px（带引导线与说明） |
| 底部入口 | 「一键生成…」普通项 | 「一键生成图表…」34px 主色项 |
| 悬停行 | `background: #f2f3f5` | `background: rgb(242,243,245)`，图标块转白底 + 主色图标 |
| 矮屏（700px 高）3D·GL | 整体滚动，标题栏滚走 | 列表内部滚动（scrollH 414 / clientH 227），标题栏与底部常驻 |

回归门禁：

```bash
cd pros/api && go build ./... && go test ./internal/service/...
cd pros/web && npx vitest run && npx vue-tsc -b --pretty false
```

基线（改动前后一致）：`vue-tsc` 62 个错误；`vitest` 6 个 rte 文件失败。
