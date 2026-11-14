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

  it('换成折线后数值轴仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '金额', show: false },
        series: [{ name: '今年', type: 'bar', data: [12, 18] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { show?: boolean }
    expect(yAxis.show).toBe(false)
  })

  it('换成折线后数值轴偏移还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '金额', offset: 24 },
        series: [{ name: '今年', type: 'bar', data: [12, 18] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { offset?: number }
    expect(yAxis.offset).toBe(24)
  })

  it('换成折线后数值轴仍在右侧', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '金额', position: 'right' },
        series: [{ name: '今年', type: 'bar', data: [12, 18] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { position?: string }
    expect(yAxis.position).toBe('right')
  })

  it('换成折线后数值轴最小刻度间隔还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '金额', minInterval: 5 },
        series: [{ name: '今年', type: 'bar', data: [12, 18] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { minInterval?: number }
    expect(yAxis.minInterval).toBe(5)
  })

  it('换成折线后数值轴仍不从零起', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', name: '金额', scale: true },
        series: [{ name: '今年', type: 'bar', data: [12, 13] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { scale?: boolean }
    expect(yAxis.scale).toBe(true)
  })

  it('换成折线后坐标轴名称的角度还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], name: '月份', nameRotate: 30 },
        yAxis: { type: 'value', name: '金额', nameRotate: -15 },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { nameRotate?: number }
    const yAxis = next.yAxis as { nameRotate?: number }
    expect(xAxis.nameRotate).toBe(30)
    expect(yAxis.nameRotate).toBe(-15)
  })

  it('换成折线后图例仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        legend: { show: false },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const legend = next.legend as { show?: boolean }
    expect(legend.show).toBe(false)
  })

  it('换成折线后类目轴网格线仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], splitLine: { show: false } },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { splitLine?: { show?: boolean } }
    expect(xAxis.splitLine?.show).toBe(false)
  })

  it('换成折线后数值轴文字仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', axisLabel: { show: false } },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { axisLabel?: { show?: boolean } }
    expect(yAxis.axisLabel?.show).toBe(false)
  })

  it('换成折线后数值轴刻度线仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', axisTick: { show: false } },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { axisTick?: { show?: boolean } }
    expect(yAxis.axisTick?.show).toBe(false)
  })

  it('换成折线后类目标签仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], axisLabel: { show: false, rotate: 30 } },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { axisLabel?: { show?: boolean; rotate?: number } }
    expect(xAxis.axisLabel?.show).toBe(false)
    expect(xAxis.axisLabel?.rotate).toBe(30)
  })

  it('换成折线后数值轴的轴线仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', axisLine: { show: false } },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { axisLine?: { show?: boolean } }
    expect(yAxis.axisLine?.show).toBe(false)
  })

  it('换成折线后类目轴刻度线仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], axisTick: { show: false } },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { axisTick?: { show?: boolean } }
    expect(xAxis.axisTick?.show).toBe(false)
  })

  it('换成折线后数值轴仍有间隔底色', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', splitArea: { show: true } },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { splitArea?: { show?: boolean } }
    expect(yAxis.splitArea?.show).toBe(true)
  })

  it('换成折线后类目轴的轴线仍然隐藏', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], axisLine: { show: false } },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { axisLine?: { show?: boolean } }
    expect(xAxis.axisLine?.show).toBe(false)
  })

  it('换成折线后数值轴仍不画网格线', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', splitLine: { show: false } },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { splitLine?: { show?: boolean } }
    expect(yAxis.splitLine?.show).toBe(false)
  })

  it('换成折线后坐标轴名称的位置还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], name: '月份', nameLocation: 'end', nameGap: 28 },
        yAxis: { type: 'value', name: '数量', nameLocation: 'start', nameGap: 12 },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const xAxis = next.xAxis as { nameLocation?: string; nameGap?: number }
    const yAxis = next.yAxis as { nameLocation?: string; nameGap?: number }
    expect(xAxis.nameLocation).toBe('end')
    expect(xAxis.nameGap).toBe(28)
    expect(yAxis.nameLocation).toBe('start')
    expect(yAxis.nameGap).toBe(12)
  })

  it('换成柱状图再换回折线后仍不画点', () => {
    const bar = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', showSymbol: false, data: [2, 8] }],
      },
      'bar',
    )
    const back = retypeEchartsOption(bar, 'line')
    const series = back.series as Array<{ type?: string; showSymbol?: boolean }>
    expect(series[0]?.type).toBe('line')
    expect(series[0]?.showSymbol).toBe(false)
  })

  it('换成柱状图再换回折线后类目仍贴着刻度', () => {
    const bar = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'], boundaryGap: false },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', data: [2, 8] }],
      },
      'bar',
    )
    const back = retypeEchartsOption(bar, 'line')
    const xAxis = back.xAxis as { boundaryGap?: boolean }
    expect(xAxis.boundaryGap).toBe(false)
  })

  it('换成折线再换回柱状图后柱间距还在', () => {
    const line = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', barGap: '30%', barCategoryGap: '20%', data: [2, 8] }],
      },
      'line',
    )
    const back = retypeEchartsOption(line, 'bar')
    const series = back.series as Array<{ type?: string; barGap?: string; barCategoryGap?: string }>
    expect(series[0]?.type).toBe('bar')
    expect(series[0]?.barGap).toBe('30%')
    expect(series[0]?.barCategoryGap).toBe('20%')
  })

  it('换成柱状图再换回折线后还是虚线', () => {
    const bar = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', lineStyle: { width: 4, type: 'dashed' }, data: [2, 8] }],
      },
      'bar',
    )
    const back = retypeEchartsOption(bar, 'line')
    const series = back.series as Array<{ type?: string; lineStyle?: { width?: number; type?: string } }>
    expect(series[0]?.type).toBe('line')
    expect(series[0]?.lineStyle?.width).toBe(4)
    expect(series[0]?.lineStyle?.type).toBe('dashed')
  })

  it('换成柱状图再换回折线后符号还在', () => {
    const bar = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', symbol: 'diamond', symbolSize: 16, data: [2, 8] }],
      },
      'bar',
    )
    const back = retypeEchartsOption(bar, 'line')
    const series = back.series as Array<{ type?: string; symbol?: string; symbolSize?: number }>
    expect(series[0]?.type).toBe('line')
    expect(series[0]?.symbol).toBe('diamond')
    expect(series[0]?.symbolSize).toBe(16)
  })

  it('换成柱状图再换回折线后还是阶梯线', () => {
    const bar = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', step: 'middle', smooth: false, data: [2, 8] }],
      },
      'bar',
    )
    const back = retypeEchartsOption(bar, 'line')
    const series = back.series as Array<{ type?: string; step?: string }>
    expect(series[0]?.type).toBe('line')
    expect(series[0]?.step).toBe('middle')
  })

  it('换成折线再换回柱状图后柱宽还在', () => {
    const line = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', barWidth: '40%', barMaxWidth: 28, data: [2, 8] }],
      },
      'line',
    )
    const back = retypeEchartsOption(line, 'bar')
    const series = back.series as Array<{ type?: string; barWidth?: string; barMaxWidth?: number }>
    expect(series[0]?.type).toBe('bar')
    expect(series[0]?.barWidth).toBe('40%')
    expect(series[0]?.barMaxWidth).toBe(28)
  })

  it('换成折线后对数轴和底数还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'log', logBase: 2, min: 1 },
        series: [{ name: '今年', type: 'bar', data: [2, 8] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { type?: string; logBase?: number; min?: number }
    expect(yAxis.type).toBe('log')
    expect(yAxis.logBase).toBe(2)
    expect(yAxis.min).toBe(1)
  })

  it('换成折线后数值轴的刻度间隔还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value', interval: 20, inverse: true },
        series: [{ name: '今年', type: 'bar', data: [10, 40] }],
      },
      'line',
    )
    const yAxis = next.yAxis as { interval?: number; inverse?: boolean }
    expect(yAxis.interval).toBe(20)
    expect(yAxis.inverse).toBe(true)
  })

  it('换成折线后提示框还按单点弹出', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        tooltip: { trigger: 'item', confine: true, backgroundColor: '#fff7e8' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    const tooltip = next.tooltip as { trigger?: string; confine?: boolean; backgroundColor?: string }
    expect(tooltip.trigger).toBe('item')
    expect(tooltip.confine).toBe(true)
    expect(tooltip.backgroundColor).toBe('#fff7e8')
  })

  it('换成折线后绘图区边距还在', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        grid: { left: '12%', right: 80, containLabel: false },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    const grid = next.grid as { left?: string; right?: number; top?: number; containLabel?: boolean }
    expect(grid.left).toBe('12%')
    expect(grid.right).toBe(80)
    expect(grid.containLabel).toBe(false)
    expect(grid.top).toBe(48)
  })

  it('折线再点一次还是直线，也不会铺上面积', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'line', smooth: false, data: [1, 2] }],
      },
      'line',
    )
    const series = next.series as Array<{ smooth?: boolean; areaStyle?: { opacity: number } }>
    expect(series[0]?.smooth).toBe(false)
    expect(series[0]?.areaStyle).toBeUndefined()
  })

  it('换成折线后图例还在右侧', () => {
    const next = retypeEchartsOption(
      {
        title: { text: '销售' },
        legend: { right: 0, orient: 'vertical', data: ['今年'] },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ name: '今年', type: 'bar', data: [1, 2] }],
      },
      'line',
    )
    const legend = next.legend as { right?: number; orient?: string; bottom?: number; data?: string[] }
    expect(legend.right).toBe(0)
    expect(legend.orient).toBe('vertical')
    expect(legend.bottom).toBeUndefined()
    expect(legend.data).toEqual(['今年'])
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
