# 富文本图表工具栏子分组 + 图表属性面板（对照文档）

- 分支：`cursor/dsh-rte-chart-panel`（基线 `main` @ bec35e9，ECharts 6.1.0 + echarts-gl 2.1.0 + 39 类 / 81 模板）
- 范围：`pros/web`（Vue3 + Tiptap）
- 文档定位：**已对齐 / 未对齐 / 未验证** 三段式对照，附验证方式与截图路径。

---

## 1. 需求对照总表

| # | 需求 | 状态 | 落点 | 验证方式 |
|---|---|---|---|---|
| 1 | 图表工具栏拆成多个子分组按钮栏（基础/统计/关系/层级/地理/金融/坐标系/组件/3D·GL） | 已对齐 | `src/utils/echarts/chartGroups.ts`、`RteToolbar.vue` | e2e 截图 01 / 02 |
| 2 | 3D/GL 独立一组 | 已对齐 | 同上（`is-gl` 独立样式 + 分隔线） | e2e 截图 02 |
| 3 | 超出可折叠 / 下拉 | 已对齐 | 组头点击折叠（`toggleEchartsGroup`）+ 分组 chip 筛选 | 手动 + e2e 截图 01 |
| 4 | 选中图表块弹出属性面板（侧栏） | 已对齐 | `useChartPanelBridge.ts` + `ChartPanel.vue` | e2e 截图 03–10、vitest `ChartPanel.test.ts` |
| 5 | 按图表类型显示不同面板（schema 驱动，每类一份） | 已对齐 | `src/utils/echarts/panelSchemas/`（39 类 + 兜底） | vitest `panelSchemas.test.ts` |
| 6 | title / legend / tooltip / grid / xAxis / yAxis / series / visualMap / dataZoom / color 主题可配 | 已对齐 | 各 schema 的 general / axis / series / style 段 | vitest `panelSchemas.test.ts` + e2e 截图 |
| 7 | 未覆盖字段用「高级 JSON」编辑（CodeMirror）+ 校验 | 已对齐 | `ChartAdvancedJsonSection.vue` + `codemirror/jsonEditor.ts` | e2e 截图 10、e2e 断言「非法 JSON 被拦下」 |
| 8 | 数据编辑：表格增删改行列 + JSON 双向同步 | 已对齐 | `ChartDataSection.vue` + `utils/echarts/chartDataTable.ts` | vitest `chartDataTable.test.ts`、`ChartPanel.persist.test.ts` |
| 9 | 删除按钮（二次确认） | 已对齐 | `ChartPanel.vue` + `useChartPanelHost.remove()` | vitest `ChartPanel.test.ts`、e2e 截图 08 |
| 10 | 数据接口：地址 / 方法 / 请求体 / 参数 / 刷新间隔 / 字段映射 | 已对齐 | `utils/echarts/chartDataSource.ts` + `chartDataRequest.ts` + `chartDataMapping.ts` + `chartDataRuntime.ts` + `ChartDataSourceSection.vue` | vitest `chartDataSource.test.ts`、`chartDataRequest.test.ts`、`chartDataMapping.test.ts`、`chartDataRuntime.test.ts` |
| 11 | 鉴权：无 / 自定义（Header + Bearer）/ 读取本系统登录态 | 已对齐 | `chartDataRequest.buildDataSourceRequest` + `chartSecret.ts` | vitest `chartDataRequest.test.ts`、`chartDataRuntime.test.ts` |
| 12 | 配置随图表块属性持久化 | 已对齐 | `echartsBlock` 的 `dataSource` 属性 | vitest `ChartPanel.persist.test.ts` |
| 13 | token 不写入导出 HTML 明文（自定义 token 提示风险） | 已对齐 | 密钥只进 localStorage（`chartSecret.ts`），文档只存布尔开关 | vitest「数据接口配置持久化（不含明文密钥）」 |
| 14 | 不堆积：按区块拆分文件，单文件 < 300 行 | 已对齐 | `components/rte/chart-panel/`（7 个区块组件 + 4 个 composable） | vitest `chartPanelModuleSize.test.ts`（守卫测试：超 300 行直接红） |
| 15 | 不得回归：39 类 / 81 模板插入与渲染、HTML 预览、导出 | 已对齐 | 未改模板与净化器；渲染 e2e 81/81 通过 | e2e `rte-echarts-render-e2e.mjs` |

---

## 2. 图表属性面板：区块与字段

面板固定 7 个区块（`src/components/rte/chart-panel/`）：

| 区块 | 组件 | 内容 |
|---|---|---|
| 通用 | `ChartGeneralSection.vue` | title / subtitle / legend / tooltip / grid 等（schema 的 `general` 段） |
| 坐标轴 | `ChartAxisSection.vue` | X 轴 / Y 轴各一份（schema 的 `axis` 段；饼图、仪表盘等无坐标轴的类别不渲染该段） |
| 系列 | `ChartSeriesSection.vue` | 逐系列字段，多系列时可切换（schema 的 `series` 段） |
| 数据 | `ChartDataSection.vue` | 表格 ⇄ JSON 双视图，增删行列、改单元格 |
| 数据接口 | `ChartDataSourceSection.vue` | 地址 / 方法 / 参数 / 请求体 / 刷新间隔 / 字段映射 / 鉴权 / 预览请求 |
| 样式 | `ChartStyleSection.vue` | 主题色板 / 背景色 / 全局字号 / 动画（schema 的 `style` 段） |
| 高级 JSON | `ChartAdvancedJsonSection.vue` | 整份 option 的 CodeMirror 编辑 + 净化器校验 |

schema 目录 `src/utils/echarts/panelSchemas/`：39 个类别各一个文件（`line.ts` … `graphGL.ts`）+ `common.ts`（公共字段构造）+ `index.ts`（汇总与兜底）。

字段类型：`text / textarea / number / boolean / select / color / json`（`panelSchemas/types.ts`）。

---

## 3. 数据接口（运行时）

| 能力 | 实现 | 说明 |
|---|---|---|
| 请求构造 | `chartDataRequest.buildDataSourceRequest` | GET 把 `params`（JSON）转 query；POST 带 `body` 并补 `Content-Type` |
| 鉴权 | 同上 + `chartSecret.ts` | `none` / `custom`（本机保存的 Header、Bearer Token）/ `session`（复用 `api/http.ts` 的 `getToken()`，不另存） |
| 拉取 | `chartDataRuntime.fetchChartData` | 非 2xx 抛「接口请求失败：HTTP xxx」；非 JSON 抛「接口响应不是合法 JSON」 |
| 字段映射 | `chartDataRuntime.mergeChartDataIntoOption` | 有 `dataset` → 写 `dataset[0].source`；否则 → `xAxis.data` + `series[].data`；`seriesField` 有值时按它拆多系列 |
| 刷新间隔 | `chartDataRuntime.startChartDataPolling` | `refreshInterval > 0` 按秒轮询；0 只拉一次；失败走 `onError` |
| 落点 | `extensions/echartsBlock.ts` 的 NodeView | 拉到的数据只影响**显示**，不回写文档；文档里的数据被改后，接口数据让位到下一次拉取 |

> 密钥安全：自定义 Bearer Token / Header 值只写 `localStorage`（按图表块 `chartId` 隔离），
> 不进文档属性，因此不会出现在导出 / 打印的 HTML 明文里；面板上有明确的泄露风险提示。

---

## 4. 文件与行数（不堆积）

面板区块（`src/components/rte/chart-panel/`）：

| 文件 | 行数 |
|---|---|
| `ChartDataSourceSection.vue` | 266 |
| `useChartPanel.ts` | 261 |
| `useChartPanelHost.ts` | 220 |
| `ChartPanel.vue` | 190 |
| `useChartPanelData.ts` | 159 |
| `ChartDataSection.vue` | 103 |
| `useChartPanelBridge.ts` | 102 |
| `ChartAdvancedJsonSection.vue` | 98 |
| `ChartFieldRow.vue` | 97 |
| `ChartAxisSection.vue` | 40 |
| `ChartSeriesSection.vue` | 39 |
| `ChartGeneralSection.vue` | 27 |
| `ChartStyleSection.vue` | 27 |

工具层（`src/utils/echarts/`）：

| 文件 | 行数 | 作用 |
|---|---|---|
| `chartDataTable.ts` | 204 | 表格 ⇄ JSON 的数据模型 |
| `chartDataRuntime.ts` | 190 | 拉取 / 轮询 / 合并进 option |
| `chartDataSource.ts` | 136 | 数据接口配置的类型与读写（归一化 / 序列化 / 解析） |
| `chartOptionPath.ts` | 130 | 按点号路径读写 option + `isSameEchartsOption`（比较两份 option 是否等价） |
| `chartGroups.ts` | 128 | 工具栏 9 个子分组 |
| `chartDataMapping.ts` | 119 | 接口响应 → 图表数据的映射（纯函数） |
| `panelSchemas/index.ts` | 105 | 39 类 schema 汇总与兜底 |
| `chartDataRequest.ts` | 73 | 请求构造 + query 拼装（纯函数） |
| `chartSecret.ts` | 78 | 自定义密钥的本机存储 |

> **拆分的由来**：`useChartPanel.ts`（355 行）与 `chartDataSource.ts`（310 行）原本超出 300 行上限。
> 本轮把「数据编辑」拆到 `useChartPanelData.ts`、把「请求构造」「响应映射」拆到
> `chartDataRequest.ts` / `chartDataMapping.ts`，现在**全部源文件都 < 300 行**。
> 并新增守卫测试 `chartPanelModuleSize.test.ts`：一旦有人把文件撑大，测试直接红。

新增工具层（合并视图）：

| 文件 | 作用 |
|---|---|
| `src/utils/echarts/chartOptionPath.ts` | 按点号路径读写 option + `isSameEchartsOption`（比较两份 option 是否等价） |
| `src/utils/echarts/chartDataTable.ts` | 表格 ⇄ JSON 的数据模型 |
| `src/utils/echarts/chartDataSource.ts` | 数据接口配置的类型与读写 |
| `src/utils/echarts/chartDataRequest.ts` | 数据接口的请求构造（纯函数） |
| `src/utils/echarts/chartDataMapping.ts` | 数据接口的响应映射（纯函数） |
| `src/utils/echarts/chartDataRuntime.ts` | 拉取 / 轮询 / 合并进 option |
| `src/utils/echarts/chartSecret.ts` | 自定义密钥的本机存储 |
| `src/utils/echarts/chartGroups.ts` | 工具栏 9 个子分组 |

---

## 5. 本轮修掉的问题（上一轮「改了不落盘」）

上一轮留底提交 `5ddd3a3` 的现象：属性面板里改了字段，文档里没留住。
本轮用最小复现（`ChartPanel.persist.test.ts`）定位到 **两处真实缺陷**：

1. **事务监听根本没挂上**（根因）
   `useEditor` 是在父组件 `onMounted` 才创建编辑器实例的，而 `ChartPanel` 作为子组件
   `onMounted` 更早执行 → 当时 `editorRef.value` 还是 `undefined`，
   `onTransaction` 直接返回空函数，**面板一次也没监听到文档变化**。
   修法：`useChartPanelHost` 内部用 `watch(() => editorRef.value)` 跟随编辑器实例，
   编辑器就绪 / 换实例时自动重新挂载监听（`useChartPanelHost.ts` 的 `bindEditor`）。

2. **写回可能被父级回声覆盖**
   父组件把旧 HTML 回写进来时走的是 `setContent(..., { emitUpdate: false })`，
   不会触发 `update` 事件，只监听 `update` 是发现不了的。
   修法：改监听 `transaction`，并在面板写回后的 2 秒窗口内做**回声守护**：
   只有当文档里的 option「恰好退回到写回前的值」时，才用面板的值再写一次；
   外部的真实改动不碰（`ChartPanel.vue` 的 `onEditorTransaction`）。

顺带修掉：

3. **高级 JSON 的 CodeMirror 永远停在「加载编辑器…」**
   宿主 `div` 之前用 `v-if` 控制，`onMounted` 时它还没渲染，`host.value` 为 `null`，
   加载函数直接 return。改成宿主常驻 + `is-hidden` 切换（`ChartAdvancedJsonSection.vue`）。
4. **数据模型把数值变成字符串**
   `optionToDataModel` / `jsonToDataModel` 现在保留数值类型（`itemToValue`），
   JSON 视图里数值不再被引号包住，ECharts 数值轴行为正确。
5. **两个文件超出 300 行上限**
   `useChartPanel.ts`（355 行）与 `chartDataSource.ts`（310 行）违反「单文件 < 300 行」。
   本轮拆成 `useChartPanelData.ts` / `chartDataRequest.ts` / `chartDataMapping.ts`，
   并加守卫测试 `chartPanelModuleSize.test.ts`，防止回退。

回归测试：`src/components/rte/chart-panel/ChartPanel.persist.test.ts`
（改字段 → option → HTML → 重新加载回读；回声覆盖后仍保留；表格 ⇄ JSON；数据源配置持久化）。

---

## 6. 测试与验证结果

| 项目 | 命令 | 结果 |
|---|---|---|
| vitest（全量） | `npx vitest run` | **52 个文件 / 369 个用例全过** |
| 类型检查 | `npx vue-tsc -b --pretty false` | 通过（0 error） |
| 构建 | `npx vite build` | 通过 |
| 模板渲染回归 | `node scripts/rte-echarts-render-e2e.mjs` | 81 个模板全部渲染成功（其中 Canvas/3D·GL 12 个，失败 0） |
| 面板截图 e2e | `node scripts/rte-chart-panel-e2e.mjs` | 9 项断言全过，退出码 0 |

> e2e 两个脚本都需要先起前端：`npx vite --host 127.0.0.1 --port 5173`；
> 渲染脚本还需要可写的截图目录：`RTE_BASELINE_DIR=/workspace/outputs/metamatrix/shots/chart-panel`。

新增/更新的测试：

| 测试文件 | 覆盖 |
|---|---|
| `utils/echarts/panelSchemas/panelSchemas.test.ts` | 39 类都有 schema；每份含通用/系列/样式三段；字段路径、kind、下拉选项合法；未知类型回落 |
| `utils/echarts/chartDataTable.test.ts` | option ⇄ 模型 ⇄ 表格 ⇄ JSON 全链路；数值类型保持 |
| `utils/echarts/chartDataSource.test.ts` | 配置归一化 / 序列化 / 解析往返；非法鉴权与方法回落 |
| `utils/echarts/chartDataRequest.test.ts` | 请求构造（GET/POST）、三种鉴权头、query 拼装 |
| `utils/echarts/chartDataMapping.test.ts` | 按路径取数组、单/多系列映射、非数值归零、写回 option |
| `utils/echarts/chartDataRuntime.test.ts` | GET/POST 请求、鉴权头（自定义 / 登录态）、响应映射（类目+数值 / 多系列 / dataset）、刷新间隔轮询、失败处理 |
| `components/rte/chart-panel/ChartPanel.test.ts` | 选中弹出面板、改字段写回 option、删除二次确认 |
| `components/rte/chart-panel/ChartPanel.persist.test.ts` | 落盘链路、回声守护、表格 ⇄ JSON、数据源配置持久化 |
| `components/rte/chart-panel/chartPanelModuleSize.test.ts` | 文件规模守卫：面板与图表工具层每个源文件 < 300 行 |

截图（`/workspace/outputs/metamatrix/shots/chart-panel/`）：

| 文件 | 内容 |
|---|---|
| `01-toolbar-chart-groups.png` | 工具栏「图表」下拉：9 个子分组 chip + 分组区块 |
| `02-toolbar-chart-groups-gl.png` | 只看 3D·GL 分组（独立一组） |
| `03-panel-bar.png` | 柱状图属性面板（通用 / 坐标轴 / 系列 …） |
| `04-panel-pie.png` | 饼图属性面板（无坐标轴段） |
| `05-panel-graph.png` | 关系图属性面板 |
| `06-panel-data-table.png` | 数据表格视图 |
| `07-panel-datasource.png` | 数据接口配置（地址 / 方法 / 刷新间隔 / 字段映射 / 鉴权） |
| `08-delete-confirm.png` | 删除二次确认弹窗 |
| `09-panel-title-persisted.png` | 面板改标题后文档 option 真的变了（真实浏览器断言） |
| `10-panel-advanced-json.png` | 高级 JSON（CodeMirror 高亮） |

---

## 7. 未对齐 / 有意为之的偏差

| 项 | 说明 |
|---|---|
| 面板挂在 `RichTextEditor` 而不是 `RtePortals` | 面板是**常驻侧栏**（`position: absolute`，随编辑器一起滚动），不是浮层弹层；`RtePortals` 是给 Teleport 弹层用的，挂进去反而会被父级 overflow 裁剪。 |
| 接口数据只影响显示、不回写文档 | 拉取的数据不写进 `option` 属性（否则每次刷新都会产生一条文档修订）；文档里的静态数据被手动改过后，接口数据在下一次拉取时重新覆盖显示。 |
| `visualMap` / `dataZoom` 不是所有类别都有独立区块 | 它们按类别落在「通用 / 系列」段的字段里（如 `heatmap` 的 `visualMap`、组件类的 `dataZoom`），schema 驱动，没有单列区块。 |
| 自定义密钥只有「本机浏览器」一种存放位置 | 不做服务端密钥库；面板已提示「共享文档的其他人拿不到该密钥，存在泄露风险」。 |
| 面板未做「移动 / 折叠为图标条」 | 只提供关闭按钮；侧栏固定 360px 宽（窄屏 ≤ 92vw）。 |
| 未套用 `docs/GLOBAL_RULES/panel-maximize.md`（面板最大化） | 该规则的对象是**画布面板**（Y 模型块、象限 cell、需求三角图例区），落点是 `usePanelMaximize`；图表属性面板是富文本编辑器内的侧边栏、且本身就是「选中即弹出」，最大化无实际意义，故未接入。 |
| 未套用 `docs/GLOBAL_RULES/panel-attachments.md`（相关资料区） | 同上：该规则要求每个**可编辑画布面板**底部挂「相关资料」，数据落点是文档根级 `attachmentsByPanelId`；图表属性面板是图表配置表单，不承载附件语义（其「数据接口」区块已提供 URL / 请求体入口）。 |

## 8. 未验证

| 项 | 原因 |
|---|---|
| 真实登录态下的「读取本系统登录态」端到端请求 | 本机没有可用的 API 服务（仓库用 docker-compose 起后端，当前环境无 docker），只验证了请求构造（`Authorization: Bearer <系统 token>`）与纯函数行为。 |
| 跨域接口在编辑器里的真实拉取 | 同上（没有后端可打）；CORS / 代理配置未验证。 |
| 完整应用里的属性面板（画布内 Y 模型块、放大态） | 需要登录 + API；验证在 `chart-panel-preview.html` 独立预览页完成（同一套组件与样式）。 |
| 导出的 HTML 里图表数据接口配置的实际形态 | 只验证了「密钥不进文档属性」；导出文件的最终 HTML 未做逐字比对（导出链路本轮未改动）。 |
| 旧文档里没有 `chartId` 的图表块首次打开面板 | 代码路径（`ensureChartId` 自动补 id）有分支覆盖，但没有针对「存量文档」的专门回归用例。 |
