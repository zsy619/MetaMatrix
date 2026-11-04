/**
 * 窄屏布局判定（工具栏 / 内容防溢出）。
 *
 * 背景：画布里的富文本编辑器在 375 / 768 这类窄视口下，
 * 最大化工具栏（11 个分组、每组几十个按钮）会横向撑破视口，
 * 页面出现整页横向滚动条；表格 / 图表 / 代码块 / 长链接同理。
 *
 * 这里只放「可单测的纯逻辑」，CSS 断点常量与 utils/rteNarrowLayout.ts 保持一致：
 * - NARROW_LAYOUT_MAX_WIDTH：窄屏阈值（CSS 侧 @media (max-width: 900px)）；
 * - resolveToolbarLayout：窄屏一律用紧凑工具栏（主栏 +「更多」），其余工具收进「更多」。
 */

/** 窄屏阈值（px）。CSS 侧断点必须与此一致，否则会出现「JS 已切紧凑、CSS 仍按宽屏排版」。 */
export const NARROW_LAYOUT_MAX_WIDTH = 900

/** 与 CSS 断点对应的媒体查询串。 */
export const NARROW_LAYOUT_MEDIA_QUERY = `(max-width: ${NARROW_LAYOUT_MAX_WIDTH}px)`

/** 工具栏布局形态。 */
export type RteToolbarLayout = 'expanded' | 'compact'

/** 视口宽度是否属于窄屏（≤ NARROW_LAYOUT_MAX_WIDTH）。 */
export function isNarrowViewportWidth(width: number | null | undefined): boolean {
  if (typeof width !== 'number' || !Number.isFinite(width)) return false
  return width <= NARROW_LAYOUT_MAX_WIDTH
}

/**
 * 工具栏布局：
 * - 宽屏 + 最大化 → expanded（分组全展开）；
 * - 窄屏（无论是否最大化）→ compact（飞书式主栏 +「更多」，其余工具收进「更多」）。
 */
export function resolveToolbarLayout(
  expanded: boolean,
  narrow: boolean,
): RteToolbarLayout {
  return expanded && !narrow ? 'expanded' : 'compact'
}
