// @vitest-environment happy-dom
/**
 * 工具栏「图表」分组的特征测试：
 * - 独立分组存在（不再挂在「插入」组里）；
 * - 下拉按官方类别分区展开，3D / GL 单独分区；
 * - 斜杠命令与「一键生成」对话框共用同一份目录。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import { TOOLBAR_GROUPS } from '../../utils/rteToolbarGroups'
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
    expect(charts?.keys).toContain('echarts')
    const insert = TOOLBAR_GROUPS.find((group) => group.id === 'insert')
    expect(insert?.keys).not.toContain('echarts')
  })

  it('目录覆盖官方 39 类，3D / GL 单独分区', () => {
    expect(ECHARTS_CATEGORIES).toHaveLength(39)
    const gl = ECHARTS_CATEGORIES.filter((item) => item.section === 'gl')
    expect(gl).toHaveLength(11)
    expect(ECHARTS_TEMPLATES.length).toBeGreaterThanOrEqual(39)
  })

  it('工具栏有图表按钮，点开后按类别列出下拉', async () => {
    const wrapper = await mountEditor()
    const button = wrapper.find('button[title="插入 ECharts 图表"]')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()
    await nextTick()
    const menu = document.querySelector('.rte-menu-echarts')
    expect(menu).toBeTruthy()
    const cats = menu?.querySelectorAll('.rte-menu-cat') || []
    expect(cats.length).toBe(39)
    // 3D / GL 分区标题
    expect(menu?.querySelectorAll('.rte-menu-section').length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('点类别展开子类型，点子类型插入图表块', async () => {
    const wrapper = await mountEditor()
    const button = wrapper.find('button[title="插入 ECharts 图表"]')
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
