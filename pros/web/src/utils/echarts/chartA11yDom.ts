/**
 * 图表无障碍的 DOM 部分：把摘要写进 `aria-label`，并生成视觉隐藏的数据表。
 *
 * 与 `chartA11y.ts` 分开是为了守住「单文件 < 300 行」的规模约束。
 */
import { buildChartA11ySummary, type ChartA11ySummary } from './chartA11y'

/**
 * 把无障碍信息写进 DOM：
 * - 图表容器打上 `role="img"` + `aria-label`（摘要）；
 * - 视觉隐藏节点里放描述段落 + 数据表。
 *
 * 隐藏节点必须是 role="img" 元素的**兄弟**（role="img" 的后代会被当成纯装饰）。
 */
export function applyChartA11y(
  chartEl: HTMLElement,
  hiddenEl: HTMLElement,
  option: unknown,
): ChartA11ySummary {
  const summary = buildChartA11ySummary(option)
  const doc = chartEl.ownerDocument
  chartEl.setAttribute('role', 'img')
  chartEl.setAttribute('aria-label', summary.ariaLabel)

  hiddenEl.className = 'rte-sr-only rte-chart-a11y'
  hiddenEl.textContent = ''
  if (summary.description) {
    const desc = doc.createElement('p')
    desc.className = 'rte-chart-a11y-desc'
    desc.textContent = summary.description
    hiddenEl.appendChild(desc)
  }
  if (summary.table) {
    const table = doc.createElement('table')
    table.className = 'rte-chart-a11y-table'
    const caption = doc.createElement('caption')
    caption.textContent = summary.table.caption
    table.appendChild(caption)
    const thead = doc.createElement('thead')
    const headRow = doc.createElement('tr')
    summary.table.headers.forEach((text) => {
      const th = doc.createElement('th')
      th.setAttribute('scope', 'col')
      th.textContent = text
      headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    table.appendChild(thead)
    const tbody = doc.createElement('tbody')
    summary.table.rows.forEach((row) => {
      const tr = doc.createElement('tr')
      row.forEach((cell, index) => {
        const td = doc.createElement('td')
        if (index === 0) td.setAttribute('scope', 'row')
        td.textContent = cell
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    hiddenEl.appendChild(table)
  }
  return summary
}
