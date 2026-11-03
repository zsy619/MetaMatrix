// @vitest-environment jsdom
/**
 * 模板目录的回归测试：
 * - 每个模板都要能过净化器（白名单不误伤）；
 * - 每个非 GL 模板都要能 setOption 不报错（SVG 渲染器，jsdom）。
 *
 * GL / 3D 模板需要 WebGL，jsdom 里跑不了，只做净化校验；
 * 真实渲染由 scripts/rte-echarts-e2e.mjs 在真实浏览器里验证。
 */
import { describe, expect, it, vi } from 'vitest'
import { ECHARTS_CATEGORIES, ECHARTS_TEMPLATES } from './templates'
import { sanitizeEchartsOption } from '../rteEchartsOption'
import { echarts } from '../echartsRuntime'
import { resolveEchartsRenderItems } from './prepare'

/** 收集渲染期间的 console.error（ECharts 内部用 error() 打警告）。 */
function collectErrors(): { errors: string[]; restore: () => void } {
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((item) => String(item)).join(' '))
  })
  return { errors, restore: () => spy.mockRestore() }
}

function renderInSvg(option: Record<string, unknown>): string[] {
  const errors: string[] = []
  const host = document.createElement('div')
  host.style.width = '640px'
  host.style.height = '360px'
  document.body.appendChild(host)
  const chart = echarts.init(host, undefined, { renderer: 'svg', width: 640, height: 360 })
  const collected = collectErrors()
  try {
    chart.setOption(resolveEchartsRenderItems(option), { notMerge: true })
  } finally {
    collected.restore()
    errors.push(...collected.errors)
    chart.dispose()
    host.remove()
  }
  return errors
}

describe('官方示例 39 类模板目录', () => {
  it('类别数量是 39（官方示例分类数）', () => {
    expect(ECHARTS_CATEGORIES).toHaveLength(39)
  })

  it('每个类别至少有一个子类型，且 id 全局唯一', () => {
    const ids = ECHARTS_TEMPLATES.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const category of ECHARTS_CATEGORIES) {
      expect(category.templates.length).toBeGreaterThan(0)
    }
  })

  it('3D / GL 单独分区，且都标记为 canvas + gl', () => {
    const glCategories = ECHARTS_CATEGORIES.filter((item) => item.section === 'gl')
    expect(glCategories).toHaveLength(11)
    for (const category of glCategories) {
      for (const template of category.templates) {
        expect(template.gl).toBe(true)
        expect(template.renderer).toBe('canvas')
      }
    }
  })
})

describe('每个模板：净化通过', () => {
  for (const template of ECHARTS_TEMPLATES) {
    it(`${template.categoryId} / ${template.label} 能过净化器`, () => {
      const option = template.build({})
      const result = sanitizeEchartsOption(option)
      if (!result.ok) {
        throw new Error(`${template.id} 净化失败：${result.error}（${result.warnings.join('，')}）`)
      }
      const series = result.option.series as Array<Record<string, unknown>>
      expect(Array.isArray(series)).toBe(true)
      expect(series.length).toBeGreaterThan(0)
    })
  }
})

describe('每个模板：setOption 不报错', () => {
  for (const template of ECHARTS_TEMPLATES) {
    it(`${template.categoryId} / ${template.label} 渲染不报错`, () => {
      if (template.gl) {
        // GL 需要 WebGL，jsdom 跑不了：这里只保证净化通过（上一组用例已覆盖）
        expect(template.renderer).toBe('canvas')
        return
      }
      const sanitized = sanitizeEchartsOption(template.build({}))
      expect(sanitized.ok).toBe(true)
      if (!sanitized.ok) return
      const errors = renderInSvg(sanitized.option)
      const fatal = errors.filter((message) =>
        /unknown|not exist|cannot read|undefined is not|series type/i.test(message),
      )
      expect(fatal.join('；')).toBe('')
    })
  }
})
