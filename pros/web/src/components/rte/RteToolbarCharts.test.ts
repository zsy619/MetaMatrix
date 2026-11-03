// @vitest-environment happy-dom
/**
 * 工具栏「图表」分组的特征测试：
 * - 独立分组存在（不再挂在「插入」组里）；
 * - 一级分类（基础 / 统计 / … / 3D·GL）各自是工具栏上的独立下拉按钮；
 * - 点某个分类下拉只列该分类下的具体图表类型，选中后插入对应图表块；
 * - 斜杠命令与「一键生成」对话框共用同一份目录。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import { CHART_TOOLBAR_KEYS, TOOLBAR_GROUPS } from '../../utils/rteToolbarGroups'
import { CHART_GROUPS } from '../../utils/echarts/chartGroups'
import { ECHARTS_CATEGORIES, ECHARTS_TEMPLATES } from '../../utils/echarts/templates'
import type { CanvasDocumentJSON } from '../../types/canvas'

const FIXTURE = '<h2>标题</h2><p>一段文字</p>'

async function mountEditor() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: FIXTURE, panelId: 'panel-a', expanded: true },
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

describe('工具栏「图表」分组', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('图表是独立分组，不再挂在插入分组里', () => {
    const charts = TOOLBAR_GROUPS.find((group) => group.id === 'charts')
    expect(charts).toBeTruthy()
    expect(charts?.label).toBe('图表')
    // 9 个一级分类各占一个工具栏 key（不再是单一总入口）
    expect(charts?.keys).toHaveLength(9)
    for (const key of CHART_TOOLBAR_KEYS) expect(charts?.keys).toContain(key)
    expect(charts?.keys).not.toContain('echarts')
    const insert = TOOLBAR_GROUPS.find((group) => group.id === 'insert')
    for (const key of CHART_TOOLBAR_KEYS) expect(insert?.keys).not.toContain(key)
  })

  it('目录覆盖官方 39 类，3D / GL 单独分区', () => {
    expect(ECHARTS_CATEGORIES).toHaveLength(39)
    const gl = ECHARTS_CATEGORIES.filter((item) => item.section === 'gl')
    expect(gl).toHaveLength(11)
    expect(ECHARTS_TEMPLATES.length).toBeGreaterThanOrEqual(39)
  })

  it('工具栏直接露出 9 个一级分类按钮', async () => {
    const wrapper = await mountEditor()
    for (const group of CHART_GROUPS) {
      const button = wrapper.find(`button[title="插入${group.label}图表"]`)
      expect(button.exists()).toBe(true)
    }
    // 旧的总入口按钮没有了
    expect(wrapper.find('button[title="插入 ECharts 图表"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点某个分类下拉只列该分类下的图表类型', async () => {
    const wrapper = await mountEditor()
    const button = wrapper.find('button[title="插入基础图表"]')
    await button.trigger('click')
    await flushPromises()
    await nextTick()
    const menu = document.querySelector('.rte-menu-echarts')
    expect(menu).toBeTruthy()
    const cats = menu?.querySelectorAll('.rte-menu-cat') || []
    // 基础组 5 类（不是全部 39 类）
    expect(cats.length).toBe(5)
    const labels = Array.from(cats).map((el) => el.textContent || '')
    expect(labels.some((text) => text.includes('折线'))).toBe(true)
    expect(labels.some((text) => text.includes('饼图'))).toBe(true)
    wrapper.unmount()
  })

  it('3D·GL 是独立下拉，只列 3D/GL 的类型', async () => {
    const wrapper = await mountEditor()
    const button = wrapper.find('button[title="插入3D·GL图表"]')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()
    await nextTick()
    const menu = document.querySelector('.rte-menu-echarts')
    const cats = menu?.querySelectorAll('.rte-menu-cat') || []
    expect(cats.length).toBe(11)
    wrapper.unmount()
  })

  it('再点一次同一个按钮收起下拉；同一时间只开一个分类下拉', async () => {
    const wrapper = await mountEditor()
    const basic = wrapper.find('button[title="插入基础图表"]')
    await basic.trigger('click')
    await flushPromises()
    await nextTick()
    expect(document.querySelectorAll('.rte-menu-echarts').length).toBe(1)
    // 换成「统计」：基础的下拉收起，只剩一个
    const stats = wrapper.find('button[title="插入统计图表"]')
    await stats.trigger('click')
    await flushPromises()
    await nextTick()
    expect(document.querySelectorAll('.rte-menu-echarts').length).toBe(1)
    const cats = document.querySelectorAll('.rte-menu-echarts .rte-menu-cat')
    expect(cats.length).toBe(5)
    // 再点一次「统计」→ 收起
    await stats.trigger('click')
    await flushPromises()
    await nextTick()
    expect(document.querySelectorAll('.rte-menu-echarts').length).toBe(0)
    wrapper.unmount()
  })

  it('点类别展开子类型，点子类型插入图表块', async () => {
    const wrapper = await mountEditor()
    const button = wrapper.find('button[title="插入基础图表"]')
    await button.trigger('click')
    await flushPromises()
    await nextTick()
    const menu = document.querySelector('.rte-menu-echarts') as HTMLElement
    const firstCat = menu.querySelector('.rte-menu-cat') as HTMLElement
    firstCat.click()
    await flushPromises()
    await nextTick()
    const subs = menu.querySelectorAll('.rte-menu-sub button')
    expect(subs.length).toBeGreaterThan(0)
    ;(subs[0] as HTMLElement).click()
    await flushPromises()
    await nextTick()
    const blocks = wrapper.findAll('.rte-echarts-block')
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })
})
