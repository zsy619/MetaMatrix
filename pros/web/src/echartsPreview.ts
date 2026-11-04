/**
 * ECharts 模板渲染预览页（e2e 用，不进生产入口）。
 *
 * 用途：在真实浏览器里把 39 个类别的全部模板渲染一遍，
 * 供 scripts/rte-echarts-render-e2e.mjs 校验（含 WebGL 的 3D / GL 图）。
 * 页面暴露 window.__ECHARTS_PREVIEW_RESULT__ / __ECHARTS_PREVIEW_DONE__。
 */
import { ECHARTS_TEMPLATES } from './utils/echarts/templates'
import { sanitizeEchartsOption } from './utils/rteEchartsOption'
import { echarts } from './utils/echartsRuntime'
import { echartsRendererFor, resolveEchartsRenderItems } from './utils/echarts/prepare'
import { applyChartAria } from './utils/echarts/chartA11yOption'
import { loadEchartsGl } from './utils/echartsGlRuntime'

type PreviewResult = {
  id: string
  categoryId: string
  label: string
  ok: boolean
  error: string
  renderer: string
  hasSvg: boolean
  hasCanvas: boolean
}

const root = document.getElementById('root')
const results: PreviewResult[] = []

async function main() {
  for (const template of ECHARTS_TEMPLATES) {
    const wrap = document.createElement('div')
    wrap.className = 'item'
    const heading = document.createElement('h3')
    heading.textContent = `${template.categoryId} / ${template.label}`
    const host = document.createElement('div')
    host.className = 'chart'
    wrap.appendChild(heading)
    wrap.appendChild(host)
    root?.appendChild(wrap)

    const item: PreviewResult = {
      id: template.id,
      categoryId: template.categoryId,
      label: template.label,
      ok: false,
      error: '',
      renderer: template.renderer,
      hasSvg: false,
      hasCanvas: false,
    }
    results.push(item)

    const sanitized = sanitizeEchartsOption(template.build({}))
    if (!sanitized.ok) {
      item.error = `净化失败：${sanitized.error}`
      continue
    }
    const option = applyChartAria(resolveEchartsRenderItems(sanitized.option))
    const renderer = echartsRendererFor(option)
    item.renderer = renderer
    try {
      if (renderer === 'canvas') {
        await loadEchartsGl()
      }
      const chart = echarts.init(host, undefined, { renderer, width: 640, height: 360 })
      chart.setOption(option, { notMerge: true })
      await new Promise((resolve) => setTimeout(resolve, 120))
      item.hasSvg = !!host.querySelector('svg')
      item.hasCanvas = !!host.querySelector('canvas')
      item.ok = item.hasSvg || item.hasCanvas
      if (!item.ok) item.error = '没有渲染出 svg/canvas'
    } catch (err) {
      item.error = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    }
  }
  ;(window as unknown as Record<string, unknown>).__ECHARTS_PREVIEW_RESULT__ = results
  ;(window as unknown as Record<string, unknown>).__ECHARTS_PREVIEW_DEBUG__ = {
    hasGetMap: typeof (echarts as unknown as { getMap?: unknown }).getMap === 'function',
    mapKeys: (() => {
      try {
        const getMap = (echarts as unknown as { getMap?: (name: string) => unknown }).getMap
        const map = getMap ? getMap('meta-demo') : null
        return map ? Object.keys(map as object) : 'null'
      } catch (err) {
        return `error: ${String(err)}`
      }
    })(),
  }
  ;(window as unknown as Record<string, unknown>).__ECHARTS_PREVIEW_DONE__ = true
}

void main()
