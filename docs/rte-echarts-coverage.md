# ECharts 官方示例覆盖对照表（2026-11-03，ECharts 6.1.0）

来源：https://echarts.apache.org/examples/zh/index.html（官方示例分类，共 **39 类**）。

- 基线：`origin/main` 0889aa1，echarts 5.6.0（只注册 Bar/Line/Pie/Scatter/Radar + SVG）。
- 本次：升级到 **echarts 6.1.0**（含 6.0 新增的矩阵坐标系 / 和弦图），
  新增 **echarts-gl 2.1.0**（3D / GL 11 类），工具栏新增独立「图表」分组，
  按官方类别分区，39 类全部覆盖（原先「不做」的 13 类清零）。
- 模板目录：`pros/web/src/utils/echarts/templates/*.ts`（一个类别一个文件）。
- 净化器白名单：`pros/web/src/utils/rteEchartsOption.ts`（series 类型 / 组件 / label.rich）。

## 对照表

| # | key | 类别 | 状态 | 子类型（模板 id） | 模板文件 |
|---|---|---|---|---|---|
| 1 | line | 折线图 | 已对齐 | 基础 / 平滑 / 面积 / 堆叠 / 阶梯 / 双轴（`line-basic`…`line-multi-axis`） | `templates/line.ts` |
| 2 | bar | 柱状图 | 已对齐 | 基础 / 堆叠 / 横向 / 极坐标 / 瀑布（`bar-basic`…`bar-waterfall`） | `templates/bar.ts` |
| 3 | pie | 饼图 | 已对齐 | 基础 / 环形 / 玫瑰 / 南丁格尔（`pie-basic`…`pie-nightingale`） | `templates/pie.ts` |
| 4 | scatter | 散点图 | 已对齐 | 基础 / 气泡 / 涟漪(effectScatter) / 带标签（`scatter-basic`…`scatter-label`） | `templates/scatter.ts` |
| 5 | radar | 雷达图 | 已对齐 | 基础 / 填充 / 多边形（`radar-basic`…`radar-shape`） | `templates/radar.ts` |
| 6 | map | 地理坐标/地图 | 已对齐 | 基础地图 / 地图热力 / 地图散点（`map-basic`…`map-scatter`） | `templates/map.ts` |
| 7 | candlestick | K 线图 | 已对齐 | 基础 / +成交量 / +均线（`candlestick-basic`…`candlestick-ma`） | `templates/candlestick.ts` |
| 8 | boxplot | 盒须图 | 已对齐 | 基础 / 多组（`boxplot-basic`、`boxplot-multi`） | `templates/boxplot.ts` |
| 9 | heatmap | 热力图 | 已对齐 | 基础 / 渐变色带 / 点状（`heatmap-basic`…`heatmap-scatter`） | `templates/heatmap.ts` |
| 10 | graph | 关系图 | 已对齐 | 力导向 / 环形 / 有向（`graph-force`…`graph-directed`） | `templates/graph.ts` |
| 11 | lines | 路径图 | 已对齐 | 基础 / 流动（`lines-basic`、`lines-effect`） | `templates/lines.ts` |
| 12 | tree | 树图 | 已对齐 | 基础 / 横向（`tree-basic`、`tree-horizontal`） | `templates/tree.ts` |
| 13 | treemap | 矩形树图 | 已对齐 | 基础 / 多层级（`treemap-basic`、`treemap-level`） | `templates/treemap.ts` |
| 14 | sunburst | 旭日图 | 已对齐 | 基础 / 玫瑰（`sunburst-basic`、`sunburst-rose`） | `templates/sunburst.ts` |
| 15 | parallel | 平行坐标系 | 已对齐 | 基础 / 多系列（`parallel-basic`、`parallel-multi`） | `templates/parallel.ts` |
| 16 | sankey | 桑基图 | 已对齐 | 基础 / 多层（`sankey-basic`、`sankey-multi`） | `templates/sankey.ts` |
| 17 | funnel | 漏斗图 | 已对齐 | 基础 / 带标签（`funnel-basic`、`funnel-label`） | `templates/funnel.ts` |
| 18 | gauge | 仪表盘 | 已对齐 | 基础 / 多仪表（`gauge-basic`、`gauge-multi`） | `templates/gauge.ts` |
| 19 | pictorialBar | 象形柱图 | 已对齐 | 基础 / 堆叠（`pictorialBar-basic`、`pictorialBar-stack`） | `templates/pictorialBar.ts` |
| 20 | themeRiver | 主题河流图 | 已对齐 | 基础（`themeRiver-basic`） | `templates/themeRiver.ts` |
| 21 | calendar | 日历坐标系 | 已对齐 | 日历热力 / 日历散点（`calendar-heatmap`、`calendar-scatter`） | `templates/calendar.ts` |
| 22 | custom | 自定义系列 | 已对齐 | 散点 / 柱状 / 热力格（`custom-scatter`…`custom-heatmap`，renderItem 走内置白名单预设） | `templates/custom.ts` |
| 23 | dataset | 数据集 | 已对齐 | 基础 / +transform（`dataset-basic`、`dataset-transform`） | `templates/dataset.ts` |
| 24 | dataZoom | 数据区域缩放 | 已对齐 | 框内 / 滑块（`dataZoom-inside`、`dataZoom-slider`） | `templates/dataZoom.ts` |
| 25 | graphic | 图形组件 | 已对齐 | 文字 / 形状（`graphic-text`、`graphic-shape`） | `templates/graphic.ts` |
| 26 | rich | 富文本 | 已对齐 | 富文本标签 / 富文本坐标轴（`rich-label`、`rich-axis`，label.rich 已进白名单） | `templates/rich.ts` |
| 27 | matrix | 矩阵坐标系 | 已对齐（ECharts 6.0 新增） | 矩阵热力（`matrix-basic`） | `templates/matrix.ts` |
| 28 | chord | 和弦图 | 已对齐（ECharts 6.0 新增） | 和弦（`chord-basic`） | `templates/chord.ts` |
| 29 | globe | 3D 地球 | 已对齐（echarts-gl） | 地球 + 散点（`globe`） | `templates/gl.ts` |
| 30 | bar3D | 3D 柱状图 | 已对齐（echarts-gl） | grid3D 柱状（`bar3D`） | `templates/gl.ts` |
| 31 | scatter3D | 3D 散点图 | 已对齐（echarts-gl） | grid3D 散点（`scatter3D`） | `templates/gl.ts` |
| 32 | surface | 3D 曲面 | 已对齐（echarts-gl） | grid3D 曲面（`surface`） | `templates/gl.ts` |
| 33 | map3D | 3D 地图 | 已对齐（echarts-gl） | geo3D 地图（`map3D`） | `templates/gl.ts` |
| 34 | lines3D | 3D 路径图 | 已对齐（echarts-gl） | globe 航线（`lines3D`） | `templates/gl.ts` |
| 35 | line3D | 3D 折线图 | 已对齐（echarts-gl） | grid3D 折线（`line3D`） | `templates/gl.ts` |
| 36 | scatterGL | GL 散点图 | 已对齐（echarts-gl） | GPU 散点（`scatterGL`） | `templates/gl.ts` |
| 37 | linesGL | GL 路径图 | 已对齐（echarts-gl） | GPU 路径（`linesGL`） | `templates/gl.ts` |
| 38 | flowGL | GL 矢量场图 | 已对齐（echarts-gl） | GPU 粒子流（`flowGL`） | `templates/gl.ts` |
| 39 | graphGL | GL 关系图 | 已对齐（echarts-gl） | GPU 力导向（`graphGL`） | `templates/gl.ts` |

统计：**已对齐 39 / 未对齐 0 / 不做 0**（共 81 个子类型模板）。

## 关键实现说明

### 1. 工具栏独立「图表」分组

- `src/utils/rteToolbarGroups.ts`：新增 `{ id: 'charts', label: '图表', keys: ['echarts'] }`，
  并从原「插入（链接）」分组里移除 `echarts`。
- `src/components/rte/RteToolbar.vue`：下拉按官方类别分区展示（39 个类别行），
  点类别展开该类子类型；**3D / GL 单独分区**（`.rte-menu-section`）。
- 斜杠命令 `/tubiao` 与「一键生成」对话框共用同一份目录（`utils/echarts/templates`），
  对话框左侧是 39 个类别、右侧是该类子类型。

### 2. 运行时与懒加载

`src/utils/echartsRuntime.ts`（echarts 6.1.0 模块化入口）注册了：
全部 24 个常规 chart（Bar/Line/Pie/Scatter/Radar/EffectScatter/Candlestick/Boxplot/Heatmap/
Graph/Lines/Tree/Treemap/Sunburst/Parallel/Sankey/Funnel/Gauge/PictorialBar/ThemeRiver/Custom/Map/Chord）、
全部组件（Grid/Tooltip/Legend/Title/Radar/Aria/AxisPointer/Calendar/DataZoom×3/Dataset/Geo/Graphic/
MarkArea/MarkLine/MarkPoint/Matrix/Parallel/Polar/SingleAxis/Toolbox/Transform/VisualMap×3）、
特性（LabelLayout / UniversalTransition）与渲染器（SVG + Canvas）。

- 该文件由 `extensions/echartsBlock.ts` **动态 import**：文档里没有图表块时完全不下载 echarts。
- `src/utils/echartsGlRuntime.ts`：echarts-gl **单独动态 import**，只在渲染 3D/GL 图时加载；
  不进主包、也不进普通图表 chunk。
  echarts-gl 内部 `import 'echarts/lib/echarts'` 必须和应用侧的 `echarts/core` 是同一个模块实例，
  因此在 `vite.config.ts` 加了 alias：`echarts/lib/echarts → echarts/core`（否则会出现两套 core，
  地图注册互不可见）。

### 3. 地图数据方案（体积最小）

- echarts 5 起不再内置地图数据；官方 china.json 数百 KB～数 MB，不能进包；
- 走 URL 加载会依赖外部服务，离线/内网直接失效，且图表内容属于文档正文，不应该在渲染时请求第三方；
- 因此**内置一份极小示例 GeoJSON**（`src/utils/echarts/demoMap.ts`，约 1KB，4 个示意区域，
  注册名 `meta-demo`），保证「地理坐标/地图」类目能真正跑通渲染；
  真实业务地图请在属性面板的「数据」区里替换。

### 4. custom 系列的 renderItem

- 文档里存的是**纯 JSON**，不可能带函数；因此 renderItem 只允许内置白名单预设名：
  `preset:scatter` / `preset:bar` / `preset:heatmap` / `preset:pie`
  （`src/utils/echarts/customRenderItems.ts`）。
- 渲染前由 `src/utils/echarts/prepare.ts` 把预设名换成真正的函数执行。
  **不存在「从文档 JSON 执行任意函数」的路径。**

### 5. 净化器（白名单）

- 放行：39 类用到的 series 类型、组件（含 `dataset` / `dataZoom` / `visualMap` / `polar` /
  `singleAxis` / `calendar` / `parallel` / `graphic` / `geo` / `matrix` / `toolbox` /
  `markLine` / `markPoint` / `markArea` / `grid3D` / `geo3D` / `globe` / `xAxis3D`…）以及 `label.rich`。
- 仍然丢弃：未登记的顶层 / series 字段、`brush`、`aria`、非白名单的 `renderItem`。
- **上限不变**：单图 option 64KB、数据点 5000、每文档 20 个图表；超限一律报错，不静默截断。

### 6. 体积（vite build 实测，gzip）

| chunk | 触发条件 | raw | gzip |
|---|---|---|---|
| `echartsRuntime-*.js`（echarts 6.1.0 + zrender） | 文档里存在图表块时 | 680.8 kB | **224.7 kB** |
| `install-*.js`（echarts-gl 2.1.0 + claygl） | 插入 / 渲染 3D·GL 图时 | 413.9 kB | **114.1 kB** |
| `components-*.js`（echarts-gl 的 grid3D/geo3D/globe 组件） | 同上 | 51.2 kB | 14.8 kB |

两个 chunk 都是动态加载，**不进主包**（主包 `index-*.js` 1,010 kB / gzip 326.6 kB，
`HomeView-*.js` 3,026 kB / gzip 939.1 kB，其中不含 echarts 运行时）。

> 对比：本次之前 echarts 5.6.0 只注册 5 类图表，运行时 chunk gzip 约 191 kB。
> 现在覆盖 39 类，运行时 gzip 升到约 225 kB，仍按需下载。

### 7. echarts 6 升级与 echarts-gl 兼容性

- echarts 5.6.0 → 6.1.0：模块化入口（`echarts/core` / `echarts/charts` / `echarts/components` /
  `echarts/features` / `echarts/renderers`）与 `echarts.use([...])` 语义不变；
  6.x 新增 `ChordChart`、`MatrixComponent` 已一并注册。
  6.x 的 `series.step` 由字符串改为布尔，模板里已按新语义写。
- echarts-gl：`2.1.0` 的 peerDependencies 为 `echarts: ^5.1.2 || ^6.0.0`，**与 echarts 6.1.0 兼容**，
  无需降级 echarts（实测 3D / GL 11 类在真实浏览器里全部渲染成功）。

## 验证情况

| 项目 | 方式 | 结果 |
|---|---|---|
| 模板净化 + setOption | `npx vitest run src/utils/echarts/templates.test.ts`（jsdom + SVG） | ✅ 165 用例全过（81 模板 × 净化 + 渲染；GL 只做净化） |
| 白名单 fixture | `npx vitest run src/utils/echarts/fixtures.test.ts` | ✅ 56 用例全过（33 种 series + 21 个组件） |
| 全量单测 | `npx vitest run` | ✅ 43 个文件 / 316 用例全过 |
| 类型检查 | `npx vue-tsc -b` | ✅ 无错误 |
| 构建 | `npx vite build` | ✅ 通过（体积见上表） |
| 39 类真实浏览器渲染（含 WebGL） | `node scripts/rte-echarts-render-e2e.mjs` | ✅ 81 个模板全部渲染成功（12 个 Canvas/GL 模板失败 0） |
| 工具栏分组 + 逐类插入（组件级） | `npx vitest run src/components/rte/RteToolbarCharts.test.ts` | ✅ 4 用例全过（分组独立、下拉 39 类、3D/GL 分区、点子类型能插入图表块） |
| 工具栏分组 + 逐类插入（浏览器级） | `node scripts/rte-echarts-e2e.mjs` | ⚠️ 未验证：需要 API + Postgres 起服务（本次环境未起后端） |

截图产出路径（`RTE_BASELINE_DIR`，默认 `/opt/cursor/artifacts`）：

- `echarts_templates.png`：39 类 × 81 个模板的全量渲染长截图（含 3D / GL 的 WebGL 画面）。
- `echarts_blocks.png` / `echarts_blocks_full.png`：工具栏「图表」分组逐类插入后的编辑器截图。

复现命令：

```bash
cd pros/web
npx vite --port 5180 &                      # 预览页只依赖前端
RTE_WEB_URL=http://127.0.0.1:5180 node scripts/rte-echarts-render-e2e.mjs
```
