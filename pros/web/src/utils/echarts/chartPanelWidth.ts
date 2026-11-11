/** 读正文里这张图现在的宽度。还没画出来时是 0。 */
export function measureChartBlockWidth(chartId: string): number {
  if (!chartId || typeof document === 'undefined') return 0
  const block = document.querySelector(`[data-chart-id="${CSS.escape(chartId)}"]`)
  return block instanceof HTMLElement ? block.getBoundingClientRect().width : 0
}

/** 图表属性面板的默认宽度：跟正文里那张图的宽度一致，过窄时仍用 760。 */
export function chartPanelWidth(chartWidth: number, viewport = 1280): number {
  const cap = Math.max(320, Math.round(viewport * 0.92))
  const measured = Math.round(chartWidth)
  if (!Number.isFinite(measured) || measured < 320) return Math.min(760, cap)
  return Math.min(measured, cap)
}
