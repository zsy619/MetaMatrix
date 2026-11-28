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

type LegacyRibbonSnapshot = {
  ids: string[]
  titles: string[]
  groupTitles: Record<string, string[]>
  groupToolCounts: Record<string, number>
}

/**
 * 当前 Ribbon 每次只渲染一个栏目，逐栏收集后才能验证整份旧文档的迁移结果。
 * 全部隐藏的分组会保留设置占位，因此额外记录真实按钮数，不能把占位当成按钮复活。
 */
async function readRibbonSnapshot(wrapper: ReturnType<typeof mount>): Promise<LegacyRibbonSnapshot> {
  const snapshot: LegacyRibbonSnapshot = {
    ids: [],
    titles: [],
    groupTitles: {},
    groupToolCounts: {},
  }
  const tabs = wrapper.findAll('button.rte-ribbon-tab')
  for (const tab of tabs) {
    await tab.trigger('click')
    await nextTick()
    await flushPromises()
    for (const group of wrapper.findAll('.rte-tool-group')) {
      const id = group.attributes('data-group-id') || ''
      const tools = group.findAll('.rte-tool')
      const titles = tools.map((tool) => tool.attributes('title') || '')
      snapshot.ids.push(id)
      snapshot.titles.push(...titles)
      snapshot.groupTitles[id] = titles
      snapshot.groupToolCounts[id] = tools.length
    }
  }
  return snapshot
}

describe('旧画布 JSON 打开后的工具栏', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('最老一代（text 单入口）：11 组齐全、无重复、无空组', async () => {
    const { wrapper } = await mountLegacyEditor(legacyTextSingleEntry)
    const snapshot = await readRibbonSnapshot(wrapper)
    for (const id of VISIBLE_GROUP_IDS) expect(snapshot.ids, `缺少分组 ${id}`).toContain(id)
    expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length)
    // 分组外壳可能用于设置占位，必须用真实按钮数判断是否为空组。
    for (const id of VISIBLE_GROUP_IDS) {
      expect(snapshot.groupToolCounts[id] ?? 0, `${id} 是空组`).toBeGreaterThan(0)
    }
    wrapper.unmount()
  })

  it('最老一代：隐藏过的注音 / 打印 / 导入按钮迁移后仍然不显示', async () => {
    const { wrapper } = await mountLegacyEditor(legacyTextSingleEntry)
    const snapshot = await readRibbonSnapshot(wrapper)
    expect(snapshot.titles.some((t) => t.includes('ruby'))).toBe(false)
    expect(snapshot.titles.some((t) => t.includes('打印预览'))).toBe(false)
    expect(snapshot.titles.some((t) => t.includes('导入'))).toBe(false)
    // 导出位于「文件」栏目，跨栏目快照可以确认未隐藏的按钮没有丢失。
    expect(snapshot.titles.some((t) => t.includes('导出'))).toBe(true)
    wrapper.unmount()
  })

  it('第二代（拆分组 + 旧 echarts 总入口）：11 组齐全，图表变成 9 个分类下拉', async () => {
    const { wrapper } = await mountLegacyEditor(legacySplitGroupsEcharts)
    const snapshot = await readRibbonSnapshot(wrapper)
    for (const id of VISIBLE_GROUP_IDS) expect(snapshot.ids, `缺少分组 ${id}`).toContain(id)
    expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length)
    // 旧总入口不再是一个按钮，9 个分类下拉都在图表栏目中。
    const titles = snapshot.groupTitles.charts ?? []
    expect(titles.length).toBe(CHART_TOOLBAR_KEYS.length)
    for (const title of titles) expect(title).toContain('图表')
    wrapper.unmount()
  })

  it('旧图表总入口混在链接组里并被隐藏：图表按钮整体隐藏', async () => {
    const { wrapper } = await mountLegacyEditor(legacyEchartsInInsert)
    const snapshot = await readRibbonSnapshot(wrapper)
    // 全隐藏分组可以保留设置占位，但其中不能出现任何真实图表按钮。
    expect(snapshot.groupToolCounts.charts ?? 0).toBe(0)
    for (const id of VISIBLE_GROUP_IDS.filter((x) => x !== 'charts')) {
      expect(snapshot.ids, `缺少分组 ${id}`).toContain(id)
    }
    expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length)
    // 二维码仍然隐藏，其他未隐藏按钮通过完整快照参与检查。
    expect(snapshot.titles.some((t) => t.includes('二维码'))).toBe(false)
    wrapper.unmount()
  })

  it('旧图表总入口被隐藏：图表按钮整体隐藏，其他分组不受影响', async () => {
    const { wrapper } = await mountLegacyEditor(legacyEchartsEntryOnly)
    const snapshot = await readRibbonSnapshot(wrapper)
    expect(snapshot.groupToolCounts.charts ?? 0).toBe(0)
    for (const id of VISIBLE_GROUP_IDS.filter((x) => x !== 'charts')) {
      expect(snapshot.ids, `缺少分组 ${id}`).toContain(id)
    }
    expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length)
    wrapper.unmount()
  })
})
