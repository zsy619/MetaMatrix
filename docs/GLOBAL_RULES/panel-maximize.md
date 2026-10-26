# 全局规则 · 画布面板最大化

**生效日期：** 2026-10-24  
**范围：** 元矩阵 MetaMatrix 全部画布（含以后新增）  
**权威：** 本文件；与 agent memory「面板最大化全局规则」一致。另存：`/workspace/outputs/metamatrix/GLOBAL_RULES/panel-maximize.md`。

## 规则

1. **每个可编辑面板**（虚线/卡片条目区）右上角必须提供 **最大化** 入口（方框图标，`title="最大化"`）。
2. 最大化后以遮罩铺满**整个文档窗口**（视口全屏卡片）编辑；支持还原 / 关闭、点遮罩、`Esc` 关闭。
3. **同一时间全局仅允许一个面板处于最大化**（跨画布组件共用同一状态：`src/composables/usePanelMaximize.ts`）。
4. 关闭后数据与选中态不丢；原位可用占位提示，避免双编辑器抢焦点。
5. **实现落点：**
   - 优先走共用组件 `YModelBlock.vue`（`YModelBlockCard`）；
   - 不用该组件的面板（如 `QuadrantCell`、`DualTriangleBlock`、需求三角内联区）必须自行接入同一套最大化交互；
   - 最大化开关状态放在共享模块，禁止各组件各写一套互不相关的 module ref。
6. **以后新增画布：** 评审/实现时默认带本能力；缺最大化视为未完成。

## 验收

- 任意 `/canvas/:templateId` 下每个可编辑面板右上角可见最大化；
- `npm run build` 通过。
