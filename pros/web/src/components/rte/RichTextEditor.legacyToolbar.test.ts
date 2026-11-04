// @vitest-environment happy-dom
/**
 * 旧画布 JSON 打开后的工具栏迁移回归（P0-4 端到端）。
 *
 * 直接把三代旧画布 JSON（带旧的 toolbarGroupOrderByPanelId /
 * toolbarGroupButtonsByPanelId）塞进画布 store，挂载富文本编辑器，断言：
 * - 11 个可见分组齐全、无重复、无空组；
 * - 用户曾隐藏的按钮迁移后仍然不渲染；
 * - 旧图表总入口 `echarts` 展开成 9 个一级分类下拉。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'
import legacyTextSingleEntry from '../../utils/__fixtures__/legacy-toolbar-text-single-entry.canvas.json'
import legacySplitGroupsEcharts from '../../utils/__fixtures__/legacy-toolbar-split-groups-echarts.canvas.json'
import legacyEchartsEntryOnly from '../../utils/__fixtures__/legacy-toolbar-echarts-entry-only.canvas.json'
import legacyEchartsInInsert from '../../utils/__fixtures__/legacy-toolbar-echarts-in-insert.canvas.json'
import { CHART_TOOLBAR_KEYS, DEFAULT_TOOLBAR_GROUP_ORDER } from '../../utils/rteToolbarGroups'

const VISIBLE_GROUP_IDS = DEFAULT_TOOLBAR_GROUP_ORDER.filter((id) => id !== 'other')

async function mountLegacyEditor(doc: unknown, panelId = 'panel-1') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = doc as CanvasDocumentJSON
  store.dirty = false
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>旧文档</p>', panelId, expanded: true },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  return { wrapper, store }
}

function groupIds(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.rte-tool-group').map((el) => el.attributes('data-group-id') || '')
}

describe('旧画布 JSON 打开后的工具栏', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('最老一代（text 单入口）：11 组齐全、无重复、无空组', async () => {
    const { wrapper } = await mountLegacyEditor(legacyTextSingleEntry)
    const ids = groupIds(wrapper)
    for (const id of VISIBLE_GROUP_IDS) expect(ids, `缺少分组 ${id}`).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    // 没有空组
    for (const el of wrapper.findAll('.rte-tool-group')) {
      expect(el.findAll('.rte-tool').length, '存在空组').toBeGreaterThan(0)
    }
    wrapper.unmount()
  })

  it('最老一代：隐藏过的注音 / 打印 / 导入按钮迁移后仍然不显示', async () => {
    const { wrapper } = await mountLegacyEditor(legacyTextSingleEntry)
    const titles = wrapper.findAll('.rte-tool').map((el) => el.attributes('title') || '')
    expect(titles.some((t) => t.includes('ruby'))).toBe(false)
    expect(titles.some((t) => t.includes('打印预览'))).toBe(false)
    expect(titles.some((t) => t.includes('导入'))).toBe(false)
    // 没隐藏的按钮不能丢
    expect(titles.some((t) => t.includes('导出'))).toBe(true)
    wrapper.unmount()
  })

  it('第二代（拆分组 + 旧 echarts 总入口）：11 组齐全，图表变成 9 个分类下拉', async () => {
    const { wrapper } = await mountLegacyEditor(legacySplitGroupsEcharts)
    const ids = groupIds(wrapper)
    for (const id of VISIBLE_GROUP_IDS) expect(ids, `缺少分组 ${id}`).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    // 旧总入口不再是一个按钮，9 个分类下拉都在
    const chartGroup = wrapper.findAll('.rte-tool-group').find((el) => el.attributes('data-group-id') === 'charts')
    expect(chartGroup).toBeTruthy()
    expect(chartGroup!.findAll('.rte-tool').length).toBe(CHART_TOOLBAR_KEYS.length)
    const titles = chartGroup!.findAll('.rte-tool').map((el) => el.attributes('title') || '')
    for (const title of titles) expect(title).toContain('图表')
    wrapper.unmount()
  })

  it('旧图表总入口混在链接组里并被隐藏：图表分组整体不渲染', async () => {
    const { wrapper } = await mountLegacyEditor(legacyEchartsInInsert)
    const ids = groupIds(wrapper)
    expect(ids).not.toContain('charts')
    for (const id of VISIBLE_GROUP_IDS.filter((x) => x !== 'charts')) {
      expect(ids, `缺少分组 ${id}`).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
    // 二维码仍然隐藏，链接按钮还在
    const titles = wrapper.findAll('.rte-tool').map((el) => el.attributes('title') || '')
    expect(titles.some((t) => t.includes('二维码'))).toBe(false)
    wrapper.unmount()
  })

  it('旧图表总入口被隐藏：图表分组整体不渲染，其他分组不受影响', async () => {
    const { wrapper } = await mountLegacyEditor(legacyEchartsEntryOnly)
    const ids = groupIds(wrapper)
    expect(ids).not.toContain('charts')
    for (const id of VISIBLE_GROUP_IDS.filter((x) => x !== 'charts')) {
      expect(ids, `缺少分组 ${id}`).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
    wrapper.unmount()
  })
})
