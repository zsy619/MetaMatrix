// @vitest-environment happy-dom
/**
 * 图表一级分类下拉面板的特征测试：
 * - 面板有标题栏 / 类别行 / 数量胶囊 / 展开箭头 / 底部「一键生成」；
 * - 39 个类别各有专属图标，不再共用同一个通用柱状图；
 * - Ribbon 悬浮面板与「更多」里的内联面板共用同一套结构。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import { ECHARTS_CATEGORIES } from '../../utils/echarts/templates'
import { CHART_CATEGORY_ICONS } from './chartCategoryIcons'
import type { CanvasDocumentJSON } from '../../types/canvas'

const FIXTURE = '<h2>标题</h2><p>一段文字</p>'

async function mountEditor(expanded: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  localStorage.setItem('rte-ribbon-tab', 'charts')
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: FIXTURE, panelId: 'panel-a', expanded },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  await flushPromises()
  return wrapper
}

describe('图表一级分类下拉面板', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('39 个类别都有专属图标，且互不相同', () => {
    const ids = ECHARTS_CATEGORIES.map((item) => item.id)
    for (const id of ids) {
      expect(CHART_CATEGORY_ICONS[id], `缺少类别图标：${id}`).toBeTruthy()
    }
    // 图标是组件，用挂载后的 SVG 路径做唯一性比较
    const host = document.createElement('div')
    document.body.appendChild(host)
    const marks = ids.map((id) => {
      const app = mount(CHART_CATEGORY_ICONS[id]!, { attachTo: host })
      const mark = app.html()
      app.unmount()
      return mark
    })
    expect(new Set(marks).size).toBe(ids.length)
  })

  it('Ribbon 悬浮面板有标题栏、类别行、数量胶囊与底部入口', async () => {
    const wrapper = await mountEditor(true)
    const button = wrapper.find('button[title^="插入基础图表"]')
    await button.trigger('click')
    await flushPromises()
    await nextTick()

    const head = document.querySelector('.rte-chart-menu__head')
    expect(head?.textContent || '').toContain('基础图表')
    expect(head?.textContent || '').toContain('折线 / 柱状 / 饼图 / 散点')

    const rows = Array.from(document.querySelectorAll('.rte-chart-menu__row'))
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row.querySelector('.rte-chart-menu__icon svg')).toBeTruthy()
      expect(row.querySelector('.rte-chart-menu__count')?.textContent || '').toMatch(/^\d+ 种$/)
      expect(row.querySelector('.rte-chart-menu__caret')).toBeTruthy()
    }
    // 图标不再重复
    const marks = rows.map((row) => row.querySelector('.rte-chart-menu__icon svg')?.innerHTML || '')
    expect(new Set(marks).size).toBe(rows.length)

    expect(document.querySelector('.rte-chart-menu__gen')?.textContent || '').toContain('一键生成图表')
    wrapper.unmount()
  })

  it('点类别展开子列表，子项带说明', async () => {
    const wrapper = await mountEditor(true)
    const button = wrapper.find('button[title^="插入基础图表"]')
    await button.trigger('click')
    await flushPromises()
    await nextTick()
    const first = document.querySelector('.rte-chart-menu__row') as HTMLElement
    first.click()
    await flushPromises()
    await nextTick()
    const subs = Array.from(document.querySelectorAll('.rte-chart-menu__sub-row'))
    expect(subs.length).toBeGreaterThan(0)
    expect(subs[0]?.textContent || '').toContain('基础折线图')
    wrapper.unmount()
  })

  it('「更多」里的内联面板与悬浮面板同构', async () => {
    const wrapper = await mountEditor(false)
    const more = wrapper.find('.rte-more-wrap button')
    expect(more.exists()).toBe(true)
    await more.trigger('click')
    await flushPromises()
    await nextTick()
    const chartItem = Array.from(document.querySelectorAll('.rte-more-menu button')).find((b) =>
      /基础/.test(b.textContent || ''),
    ) as HTMLElement | undefined
    expect(chartItem).toBeTruthy()
    chartItem?.click()
    await flushPromises()
    await nextTick()
    const flyout = document.querySelector('.rte-chart-more-flyout')
    expect(flyout).toBeTruthy()
    expect(flyout?.querySelectorAll('.rte-chart-menu__row').length).toBe(5)
    expect(flyout?.querySelector('.rte-chart-menu__gen')?.textContent || '').toContain('一键生成图表')
    wrapper.unmount()
  })
})
