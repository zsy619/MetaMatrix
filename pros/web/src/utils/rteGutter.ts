/**
 * 块手柄留白（gutter）。
 *
 * 正文左侧只留一个「+」按钮：点开是块操作面板（插入 / 转换 / 块操作），
 * 拖动可调整块顺序。按钮整体落在正文左侧的空白里，不与正文重叠，
 * 首字之前也能正常点击设光标。这里把「手柄宽度」「手柄与正文的间距」
 * 集中定义，CSS 与 JS 共用同一组数值。
 */

/** 单个手柄按钮的边长（与 .rte-block-handle 的 width/height 一致）。 */
export const RTE_HANDLE_BUTTON_SIZE = 22
/** 手柄右边缘与正文左边缘之间的间距。 */
export const RTE_HANDLE_TEXT_GAP = 4

/** 手柄工具条的实际宽度：只有一个「+」按钮。 */
export const RTE_BLOCK_TOOLS_WIDTH = RTE_HANDLE_BUTTON_SIZE

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
): number {
  return contentLeft - canvasLeft - RTE_BLOCK_TOOLS_WIDTH - RTE_HANDLE_TEXT_GAP
}

/** 手柄右边界（相对 canvas 左边界），用于断言手柄与正文无横向重叠。 */
export function blockHandleRight(left: number): number {
  return left + RTE_BLOCK_TOOLS_WIDTH
}
