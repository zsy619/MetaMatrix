import { describe, expect, it } from 'vitest'
import {
  ECHARTS_CHART_TYPES,
  ECHARTS_MAX_DATA_POINTS,
  ECHARTS_OPTION_MAX_BYTES,
  buildOptionFromTable,
  buildTemplateOption,
  retypeEchartsOption,
  cloneEchartsOption,
  safeParseEchartsOption,
  sanitizeEchartsOption,
  serializeEchartsOption,
  type EchartsChartType,
} from './rteEchartsOption.ts'

describe('ECharts option 净化', () => {
  it('已放行的组件（toolbox / graphic / markPoint）能保留', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      toolbox: { feature: { saveAsImage: {}, restore: {} } },
      graphic: [{ type: 'text', style: { text: 'x' } }],
      series: [{ type: 'bar', data: [1, 2], markPoint: { data: [] } }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.option.toolbox).toBeTruthy()
    expect(result.option.graphic).toBeTruthy()
    const series = result.option.series as Array<Record<string, unknown>>
    expect(series[0].markPoint).toBeTruthy()
  })

  it('剥离未登记的字段（含危险的 brush）', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      brush: { toolbox: [] },
      totallyUnknown: { a: 1 },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.option.brush).toBeUndefined()
    expect(result.option.totallyUnknown).toBeUndefined()
    expect(result.warnings.join('，')).toContain('totallyUnknown')
  })

  it('保留 aria 白名单字段（enabled / label / decal）', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      aria: {
        enabled: true,
        label: { enabled: true, description: '示例图表的数据摘要' },
        decal: { show: true },
      },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aria = result.option.aria as Record<string, unknown>
    expect(aria.enabled).toBe(true)
    const label = aria.label as Record<string, unknown>
    expect(label.enabled).toBe(true)
    expect(label.description).toBe('示例图表的数据摘要')
    const decal = aria.decal as Record<string, unknown>
    expect(decal.show).toBe(true)
  })

  it('丢弃 aria 非白名单 / 危险字段', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      aria: {
        enabled: true,
        evil: 'xss',
        label: { enabled: true, unknown: 1, innerHTML: '<img onerror=1>' },
        decal: { show: true, extra: 'x' },
        domProps: { innerHTML: '<script>alert(1)</script>' },
      },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aria = result.option.aria as Record<string, unknown>
    expect(aria.evil).toBeUndefined()
    expect(aria.domProps).toBeUndefined()
    const label = aria.label as Record<string, unknown>
    expect(label.unknown).toBeUndefined()
    expect(label.innerHTML).toBeUndefined()
    const decal = aria.decal as Record<string, unknown>
    expect(decal.extra).toBeUndefined()
    expect(result.warnings.join('，')).toContain('aria.evil')
  })

  it('aria 里的非布尔 enabled / 非字符串 description 会被丢弃', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      aria: { enabled: 'yes', label: { description: { evil: 1 } } },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 非法值全被丢弃后，aria 整体不再保留
    expect(result.option.aria).toBeUndefined()
    expect(result.warnings.join('，')).toContain('aria.enabled')
  })

  it('丢弃 aria 里的函数 / 可执行内容', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      aria: {
        enabled: true,
        evil: () => 'boom',
        label: {
          enabled: true,
          description: () => 'boom',
        },
        decal: { show: true, danger: () => 'boom' },
      },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const aria = result.option.aria as Record<string, unknown>
    expect(aria.enabled).toBe(true)
    expect(aria.evil).toBeUndefined()
    const label = aria.label as Record<string, unknown>
    expect(label.description).toBeUndefined()
    const decal = aria.decal as Record<string, unknown>
    expect(decal.danger).toBeUndefined()
    expect(decal.show).toBe(true)
    expect(JSON.stringify(result.option)).not.toContain('boom')
  })

  it('series 里不允许出现 aria', () => {
    const result = sanitizeEchartsOption({
      series: [{ type: 'bar', data: [1, 2], aria: { enabled: true } }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as Array<Record<string, unknown>>
    expect(series[0].aria).toBeUndefined()
  })

  it('丢弃未登记的顶层字段', () => {
    const result = sanitizeEchartsOption({
      title: { text: '示例' },
      unknownRoot: { center: ['50%', '50%'] },
      series: [{ type: 'line', data: [1, 2, 3] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.option.unknownRoot).toBeUndefined()
  })

  it('丢弃未支持的图表类型', () => {
    const result = sanitizeEchartsOption({
      series: [
        { type: 'bar', data: [1, 2] },
        { type: 'notAChartType', data: [1] },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as unknown[]
    expect(series).toHaveLength(1)
  })

  it('深拷贝：改结果不影响入参', () => {
    const input = { title: { text: '示例' }, series: [{ type: 'bar', data: [1, 2] }] }
    const result = sanitizeEchartsOption(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    ;(result.option.series as Array<Record<string, unknown>>)[0].data = [9]
    expect((input.series[0].data as number[])[0]).toBe(1)
  })

  it('数据点超限直接报错', () => {
    const data = new Array(ECHARTS_MAX_DATA_POINTS + 10).fill(1)
    const result = sanitizeEchartsOption({ series: [{ type: 'bar', data }] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('数据点过多')
  })

  it('数据点刚好到上限不报错', () => {
    const data = new Array(ECHARTS_MAX_DATA_POINTS).fill(1)
    const result = sanitizeEchartsOption({ series: [{ type: 'bar', data }] })
    expect(result.ok).toBe(true)
  })

  it('option 体积超限直接报错', () => {
    const many = new Array(2000).fill('y'.repeat(50))
    const result = sanitizeEchartsOption({ xAxis: { type: 'category', data: many } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('体积过大')
    expect(result.error).toContain(String(ECHARTS_OPTION_MAX_BYTES))
  })

  it('数组超长不静默截断，直接报错', () => {
    const many = new Array(2500).fill('分类')
    const result = sanitizeEchartsOption({ xAxis: { type: 'category', data: many } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('截断')
  })

  it('文本超长不静默截断，直接报错', () => {
    const result = sanitizeEchartsOption({ title: { text: 'x'.repeat(2500) } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('截断')
  })

  it('系列数超限不静默截断，直接报错', () => {
    const series = new Array(60).fill(0).map(() => ({ type: 'bar', data: [1] }))
    const result = sanitizeEchartsOption({ series })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('截断')
  })

  it('超限时不会把被截断的数据当成功返回', () => {
    const many = new Array(2500).fill('分类')
    const result = sanitizeEchartsOption({ xAxis: { type: 'category', data: many } })
    expect(result.ok).toBe(false)
    expect('option' in result).toBe(false)
  })

  it('非对象 option 报错', () => {
    const result = sanitizeEchartsOption([1, 2, 3])
    expect(result.ok).toBe(false)
  })
})

describe('ECharts option 解析', () => {
  it('非法 JSON 不抛异常，返回可读错误', () => {
    const result = safeParseEchartsOption('{ 这不是 JSON')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('JSON 解析失败')
  })

  it('空文本报错', () => {
    const result = safeParseEchartsOption('   ')
    expect(result.ok).toBe(false)
  })

  it('合法 JSON 往返后保持一致', () => {
    const option = buildTemplateOption('bar')
    const text = serializeEchartsOption(option)
    expect(text.includes('\n')).toBe(false)
    const result = safeParseEchartsOption(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.option.series).toBeTruthy()
  })

  it('克隆是独立副本', () => {
    const option = buildTemplateOption('line')
    const copy = cloneEchartsOption(option) as Record<string, unknown>
    ;(copy.title as Record<string, unknown>).text = '改了'
    expect((option.title as Record<string, unknown>).text).not.toBe('改了')
  })
})

describe('ECharts 模板与表格生成', () => {
  it('每个类别都能生成可用 option（39 类）', () => {
    expect(ECHARTS_CHART_TYPES.length).toBe(39)
    for (const item of ECHARTS_CHART_TYPES) {
      const option = buildTemplateOption(item.value as EchartsChartType)
      const series = option.series as Array<Record<string, unknown>>
      expect(series.length).toBeGreaterThan(0)
      const result = sanitizeEchartsOption(option)
      expect(result.ok).toBe(true)
    }
  })

  it('从表格生成柱状图：首列作分类轴，其余数值列作系列', () => {
    const option = buildOptionFromTable('bar', {
      headers: ['月份', '销量', '利润'],
      rows: [
        ['1月', '120', '30'],
        ['2月', '150', '42'],
      ],
    })
    expect(option).toBeTruthy()
    if (!option) return
    const xAxis = option.xAxis as Record<string, unknown>
    expect(xAxis.data).toEqual(['1月', '2月'])
    const series = option.series as Array<Record<string, unknown>>
    expect(series).toHaveLength(2)
    expect(series[0].data).toEqual([120, 150])
  })

  it('从表格生成饼图：首列作名称、次列作数值', () => {
    const option = buildOptionFromTable('pie', {
      headers: ['渠道', '占比'],
      rows: [
        ['直营', '60'],
        ['分销', '40'],
      ],
    })
    expect(option).toBeTruthy()
    if (!option) return
    const series = option.series as Array<Record<string, unknown>>
    const data = series[0].data as Array<Record<string, unknown>>
    expect(data[0]).toEqual({ name: '直营', value: 60 })
  })

  it('柱状换成饼图时留下原来的类目和数值', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['华东', '华南'] },
        yAxis: { type: 'value' },
        series: [{ name: '本年', type: 'bar', data: [12, 8] }],
      },
      'pie',
    )
    const series = next.series as Array<{ type: string; data: Array<{ name: string; value: number }> }>
    expect(series[0]!.type).toBe('pie')
    expect(series[0]!.data).toEqual([
      { name: '华东', value: 12 },
      { name: '华南', value: 8 },
    ])
    expect((next.title as { text: string }).text).toBe('销售')
  })

  it('带千分位和百分号的数在换类型后仍是原数', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['华东'] },
        yAxis: { type: 'value' },
        series: [{ name: '本年', type: 'bar', data: ['1,200', '50%'] }],
      },
      'line',
    )
    const series = next.series as Array<{ data: number[] }>
    expect(series[0]!.data).toEqual([1200, 0.5])
  })

  it('换成折线后类目标签的角度还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], axisLabel: { rotate: 45 } },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    expect((next.xAxis as { axisLabel?: { rotate?: number } }).axisLabel?.rotate).toBe(45)
    const horizontal = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: ['华东', '华南'], axisLabel: { rotate: -30 } },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    expect((horizontal.yAxis as { axisLabel?: { rotate?: number } }).axisLabel?.rotate).toBe(-30)
  })

  it('换成折线后数值轴的上下限还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '万元', min: 0, max: 100 },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { min?: number; max?: number; name?: string }
    expect(yAxis).toMatchObject({ name: '万元', min: 0, max: 100 })
    const horizontal = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'value', min: 0, max: 50 },
        yAxis: { type: 'category', data: ['华东', '华南'] },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    expect(horizontal.xAxis).toMatchObject({ type: 'value', min: 0, max: 50 })
    expect((horizontal.yAxis as { type: string }).type).toBe('category')
  })

  it('换成折线后数据标签还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [1, 2], label: { show: true, position: 'top', formatter: '{c}' } }],
      },
      'line',
    )
    const series = next.series as Array<{ label?: { show?: boolean; position?: string; formatter?: string } }>
    expect(series[0]!.label).toEqual({ show: true, position: 'top', formatter: '{c}' })
  })

  it('换成折线后坐标轴名称还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', name: '月份', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '万元' },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    expect((next.xAxis as { name?: string }).name).toBe('月份')
    expect((next.yAxis as { name?: string }).name).toBe('万元')
    const horizontal = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'value', name: '万元' },
        yAxis: { type: 'category', name: '地区', data: ['华东', '华南'] },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    expect((horizontal.yAxis as { name?: string; data: string[] }).name).toBe('地区')
    expect((horizontal.yAxis as { data: string[] }).data).toEqual(['华东', '华南'])
    expect((horizontal.xAxis as { name?: string; type: string }).name).toBe('万元')
    expect((horizontal.xAxis as { type: string }).type).toBe('value')
  })

  it('换成折线后系列颜色还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月'] },
        yAxis: { type: 'value' },
        series: [
          { name: '今年', type: 'bar', data: [10], itemStyle: { color: '#d83931' } },
          { name: '去年', type: 'bar', data: [8], itemStyle: { color: '#245bdb' } },
        ],
      },
      'line',
    )
    const series = next.series as Array<{ itemStyle?: { color?: string } }>
    expect(series[0]!.itemStyle?.color).toBe('#d83931')
    expect(series[1]!.itemStyle?.color).toBe('#245bdb')
  })

  it('堆叠柱状图换成折线后仍然堆在一起', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [
          { name: '直营', type: 'bar', stack: '总量', data: [10, 20] },
          { name: '渠道', type: 'bar', stack: '总量', data: [5, 8] },
        ],
      },
      'line',
    )
    const series = next.series as Array<{ type: string; stack?: string; data: number[] }>
    expect(series.map((item) => item.type)).toEqual(['line', 'line'])
    expect(series.map((item) => item.stack)).toEqual(['总量', '总量'])
    expect(series[1]!.data).toEqual([5, 8])
  })

  it('折线中间的空点保持断开，不画成 0', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '趋势' },
        xAxis: { type: 'category', data: ['一月', '二月', '三月'] },
        yAxis: { type: 'value' },
        series: [{ name: '新增', type: 'line', data: [10, null, 30] }],
      },
      'bar',
    )
    const series = next.series as Array<{ data: Array<number | null> }>
    expect(series[0]!.data).toEqual([10, null, 30])
  })

  it('横向柱状图换成折线后类目仍在纵轴', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: ['华东', '华南'] },
        series: [{ name: '本年', type: 'bar', data: [12, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { type: string; data: string[] }
    const xAxis = next.xAxis as { type: string }
    const series = next.series as Array<{ type: string; data: number[] }>
    expect(yAxis.type).toBe('category')
    expect(yAxis.data).toEqual(['华东', '华南'])
    expect(xAxis.type).toBe('value')
    expect(series[0]).toMatchObject({ type: 'line', data: [12, 8] })
  })

  it('饼图换成折线时把扇区收成一条线', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '占比' },
        series: [{ name: '占比', type: 'pie', data: [{ name: 'A', value: 30 }, { name: 'B', value: 70 }] }],
      },
      'line',
    )
    const series = next.series as Array<{ type: string; name: string; data: number[] }>
    const axis = next.xAxis as { data: string[] }
    expect(series[0]!.type).toBe('line')
    expect(series[0]!.name).toBe('占比')
    expect(series[0]!.data).toEqual([30, 70])
    expect(axis.data).toEqual(['A', 'B'])
  })

  it('表格没有数值列时返回 null', () => {
    const option = buildOptionFromTable('bar', {
      headers: ['月份', '备注'],
      rows: [['1月', '无数据']],
    })
    expect(option).toBe(null)
  })
})
