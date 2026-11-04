/**
 * 块手柄留白（gutter）。
 *
 * 飞书式块手柄（⠿ 拖拽 / ⋮ 菜单）整体落在正文左侧的空白里，不与正文重叠，
 * 首字之前也能正常点击设光标。这里把「手柄宽度」「手柄与正文的间距」
 * 「正文左侧必须留出的空白宽度」集中定义，CSS 与 JS 共用同一组数值。
 */

/** 单个手柄按钮的边长（与 .rte-block-handle 的 width/height 一致）。 */
export const RTE_HANDLE_BUTTON_SIZE = 22
/** 两个手柄按钮之间的间距（与 .rte-block-tools 的 gap 一致）。 */
export const RTE_HANDLE_BUTTON_GAP = 2
/** 手柄右边缘与正文左边缘之间的间距。 */
export const RTE_HANDLE_TEXT_GAP = 4

/** 展开态：⠿ 拖拽 + ⋮ 菜单 两个按钮的总宽。 */
export const RTE_BLOCK_TOOLS_WIDTH = RTE_HANDLE_BUTTON_SIZE * 2 + RTE_HANDLE_BUTTON_GAP
/** 收起态：只有 ⋮ 菜单 一个按钮的宽度。 */
export const RTE_BLOCK_TOOLS_WIDTH_SINGLE = RTE_HANDLE_BUTTON_SIZE

/** 展开态正文左侧必须留出的空白宽度。 */
export const RTE_GUTTER_SIZE = RTE_BLOCK_TOOLS_WIDTH + RTE_HANDLE_TEXT_GAP
/** 收起态正文左侧必须留出的空白宽度。 */
export const RTE_GUTTER_SIZE_SINGLE = RTE_BLOCK_TOOLS_WIDTH_SINGLE + RTE_HANDLE_TEXT_GAP

/** 手柄工具条的实际宽度（展开态两个按钮，收起态一个）。 */
export function blockToolsWidth(expanded: boolean): number {
  return expanded ? RTE_BLOCK_TOOLS_WIDTH : RTE_BLOCK_TOOLS_WIDTH_SINGLE
}

/** 正文左侧需要预留的空白宽度。 */
export function gutterSize(expanded: boolean): number {
  return expanded ? RTE_GUTTER_SIZE : RTE_GUTTER_SIZE_SINGLE
}

/**
 * 正文内容左边界（ProseMirror 内容盒的左边）。
 *
 * 手柄列就贴在这个边界左侧的空白里，所以要先扣掉 ProseMirror 自身的
 * padding-left / border-left，得到真正的文字起始位置。
 */
export function proseContentLeft(prose: {
  getBoundingClientRect: () => { left: number }
}): number {
  const rect = prose.getBoundingClientRect()
  let paddingLeft = 0
  let borderLeft = 0
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(prose as unknown as Element)
    paddingLeft = parseFloat(style.paddingLeft) || 0
    borderLeft = parseFloat(style.borderLeftWidth) || 0
  }
  return rect.left + borderLeft + paddingLeft
}

/**
 * 手柄左边界（相对 canvas 左边界）。
 *
 * 恒有 handle.right = left + toolsWidth <= 正文左边界 - RTE_HANDLE_TEXT_GAP，
 * 即手柄永远不压住首字。
 */
export function blockHandleLeft(
  contentLeft: number,
  canvasLeft: number,
  toolsWidth: number,
): number {
  return contentLeft - canvasLeft - toolsWidth - RTE_HANDLE_TEXT_GAP
}

/** 手柄右边界（相对 canvas 左边界），用于断言手柄与正文无横向重叠。 */
export function blockHandleRight(left: number, toolsWidth: number): number {
  return left + toolsWidth
}
