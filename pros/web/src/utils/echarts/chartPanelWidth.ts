/** 读正文里这张图现在的宽度。还没画出来时是 0。 */
export function measureChartBlockWidth(chartId: string): number {
  if (!chartId || typeof document === 'undefined') return 0
  const block = document.querySelector(`[data-chart-id="${CSS.escape(chartId)}"]`)
  return block instanceof HTMLElement ? block.getBoundingClientRect().width : 0
}

/**
 * 图表属性面板的默认宽度：跟正文里那张图的宽度一致，但不超过 480px。
 * 面板太宽会把正文挤没，这里给一个硬上限；视口更窄时再按视口收。
 */
export const CHART_PANEL_MAX_WIDTH = 480

export function chartPanelWidth(chartWidth: number, viewport = 1280): number {
  const cap = Math.max(320, Math.min(CHART_PANEL_MAX_WIDTH, Math.round(viewport * 0.92)))
  const measured = Math.round(chartWidth)
  if (!Number.isFinite(measured) || measured < 320) return Math.min(CHART_PANEL_MAX_WIDTH, cap)
  return Math.min(measured, cap)
}
