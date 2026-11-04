// @vitest-environment happy-dom
/**
 * 图表无障碍摘要的行为测试：
 * - 折线 / 柱 / 饼都能生成可读文本（系列名、类目、数值）；
 * - 长数据被截断，并在文本里说明省略了多少项；
 * - DOM 上写入 role="img" + aria-label 与视觉隐藏的数据表。
 */
import { describe, expect, it } from 'vitest'
import { CHART_A11Y_MAX_ITEMS_PER_SERIES, buildChartA11ySummary } from './chartA11y.ts'
import { applyChartA11y } from './chartA11yDom.ts'

describe('图表无障碍摘要', () => {
  it('折线图：输出系列名、类目与数值', () => {
    const summary = buildChartA11ySummary({
      title: { text: '月度趋势' },
      xAxis: { type: 'category', data: ['一月', '二月', '三月'] },
      series: [
        { type: 'line', name: '新增用户', data: [820, 932, 901] },
        { type: 'line', name: '活跃用户', data: [620, 682, 741] },
      ],
    })
    expect(summary.chartLabel).toBe('折线图')
    expect(summary.ariaLabel).toContain('月度趋势')
    expect(summary.ariaLabel).toContain('新增用户')
    expect(summary.ariaLabel).toContain('活跃用户')
    expect(summary.ariaLabel).toContain('一月 820')
    expect(summary.ariaLabel).toContain('二月 932')
    // 视觉隐藏数据表：类目 + 每个系列一列
    expect(summary.table?.headers).toEqual(['类目', '新增用户', '活跃用户'])
    expect(summary.table?.rows[0]).toEqual(['一月', '820', '620'])
    expect(summary.table?.rows).toHaveLength(3)
  })

  it('柱状图：输出类目与数值', () => {
    const summary = buildChartA11ySummary({
      title: { text: '季度销售额' },
      xAxis: { type: 'category', data: ['Q1', 'Q2'] },
      series: [{ type: 'bar', name: '本年', data: [120, 200] }],
    })
    expect(summary.chartLabel).toBe('柱状图')
    expect(summary.ariaLabel).toContain('本年')
    expect(summary.ariaLabel).toContain('Q1 120')
    expect(summary.ariaLabel).toContain('Q2 200')
    expect(summary.table?.rows).toEqual([
      ['Q1', '120'],
      ['Q2', '200'],
    ])
  })

  it('饼图：输出扇区名称与数值', () => {
    const summary = buildChartA11ySummary({
      title: { text: '占比构成' },
      series: [
        {
          type: 'pie',
          name: '占比',
          data: [
            { name: '移动端', value: 60 },
            { name: '桌面端', value: 40 },
          ],
        },
      ],
    })
    expect(summary.chartLabel).toBe('饼图')
    expect(summary.ariaLabel).toContain('移动端 60')
    expect(summary.ariaLabel).toContain('桌面端 40')
    expect(summary.table?.headers).toEqual(['类目', '数值'])
    expect(summary.table?.rows).toEqual([
      ['移动端', '60'],
      ['桌面端', '40'],
    ])
  })

  it('长数据被截断，并写明省略了多少项', () => {
    const categories = Array.from({ length: 20 }, (_, i) => `第${i + 1}月`)
    const data = Array.from({ length: 20 }, (_, i) => i * 10)
    const summary = buildChartA11ySummary({
      title: { text: '长数据' },
      xAxis: { type: 'category', data: categories },
      series: [{ type: 'line', name: '系列一', data }],
    })
    expect(summary.ariaLabel).toContain(`共 20 项，已省略 ${20 - CHART_A11Y_MAX_ITEMS_PER_SERIES} 项`)
    expect(summary.ariaLabel).not.toContain(`第${CHART_A11Y_MAX_ITEMS_PER_SERIES + 1}月`)
    // 数据表按类目给全量行（受表格行数上限约束）
    expect(summary.table?.rows.length).toBeLessThanOrEqual(20)
  })

  it('摘要文本有长度上限', () => {
    const categories = Array.from({ length: 10 }, (_, i) => `类目${i}`)
    const data = Array.from({ length: 10 }, (_, i) => i)
    const series = Array.from({ length: 30 }, (_, i) => ({
      type: 'bar',
      name: `系列${i}${String(i).repeat(20)}`,
      data,
    }))
    const summary = buildChartA11ySummary({
      xAxis: { type: 'category', data: categories },
      series,
    })
    expect(summary.ariaLabel.length).toBeLessThanOrEqual(640)
    expect(summary.ariaLabel).toContain('全文见图表数据表')
  })

  it('没有数据的图表也给出可读兜底文本', () => {
    const summary = buildChartA11ySummary({})
    expect(summary.ariaLabel).toContain('图表')
    expect(summary.table).toBeNull()
  })

  it('applyChartA11y：DOM 上有 role="img"、aria-label 与隐藏数据表', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html')
    const chartEl = doc.createElement('div')
    const hiddenEl = doc.createElement('div')
    const host = doc.createElement('div')
    host.appendChild(chartEl)
    host.appendChild(hiddenEl)

    const summary = applyChartA11y(chartEl as unknown as HTMLElement, hiddenEl as unknown as HTMLElement, {
      title: { text: '月度趋势' },
      xAxis: { type: 'category', data: ['一月', '二月'] },
      series: [{ type: 'line', name: '新增用户', data: [820, 932] }],
    })

    expect(chartEl.getAttribute('role')).toBe('img')
    expect(chartEl.getAttribute('aria-label')).toBe(summary.ariaLabel)
    expect(chartEl.getAttribute('aria-label')).toContain('新增用户')
    // 隐藏表是 role="img" 的兄弟节点（不是后代）
    expect(hiddenEl.querySelector('table')).toBeTruthy()
    expect(chartEl.querySelector('table')).toBeNull()
    expect(hiddenEl.querySelector('caption')?.textContent).toContain('月度趋势')
    expect(hiddenEl.querySelectorAll('tbody tr')).toHaveLength(2)
  })
})
