# 全局规则 · 画布面板相关资料

**生效日期：** 2026-10-24  
**范围：** 元矩阵 MetaMatrix 全部画布（含以后新增）  
**权威：** 本文件；另存建议：`/workspace/outputs/metamatrix/GLOBAL_RULES/panel-attachments.md`。

## 规则

1. **每个可编辑面板**底部必须提供 **「相关资料」** 区：可添加本地文件与外链 URL，列表展示，支持 **在线预览** 与删除。
2. 最大化浮层底部同样渲染同一资料区（共用同一 `panelId`，数据不丢）。
3. **数据落点（统一）：** 文档根级 `attachmentsByPanelId: Record<string, PanelAttachment[]>`；`panelId` 与最大化 key 对齐（如 `block:<id>` / `cell:<position>` / `demand:legend`；KR/转化取舍等 cell 面板 id 为 `block:<rowId:cell>`）。
4. **实现落点：**
   - 共享组件：`PanelAttachments.vue` + `AttachmentPreviewModal.vue`
   - Store：`getPanelAttachments` / `addPanelAttachment` / `removePanelAttachment`
   - 类型：`PanelAttachment`；加载时 `normalizeLoadedDoc` 缺省补 `{}`
   - 主路径：`YModelBlock.vue`；同步：`QuadrantCell`、`DualTriangleBlock`、需求三角图例区
5. **文件限制：** 单文件 DataURL ≤ 3MB；超限提示；优先图片 / PDF / txt / md。
6. **预览：** 图 → `<img>`；PDF → `<embed>`；文本 → 解码展示；其它/外链 → iframe 尝试，失败则「新窗口打开」。
7. **以后新增画布：** 评审/实现时默认带本能力（走 `YModelBlock` 即可）；缺相关资料视为未完成。

## 验收

- 任意 `/canvas/:templateId` 下每个可编辑面板底部可见「相关资料」；
- 可添加文件/链接、预览、删除，刷新后 localStorage 仍在；
- `npm run build` 通过。
