// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { cloneTemplate, isTemplateId, TEMPLATE_META, useDocumentStore } from '../../stores/document'
import { isLeanCanvasDoc, isOkrDoc, isSwotDoc, isValuePropositionDoc } from '../../types/canvas'
import { formatSuccessors } from '../../utils/projectGantt'
import LeanCanvas from './LeanCanvas.vue'
import OkrCanvas from './OkrCanvas.vue'
import SwotCanvas from './SwotCanvas.vue'
import ValuePropositionCanvas from './ValuePropositionCanvas.vue'

describe('实用商业画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('四张新画布都登记在模板库', () => {
    for (const id of ['swot', 'lean-canvas', 'value-proposition', 'okr'] as const) {
      expect(isTemplateId(id)).toBe(true)
      expect(TEMPLATE_META[id].name.length).toBeGreaterThan(0)
    }
  })

  it('SWOT 四格、精益九格、价值主张左右六格', () => {
    const swot = cloneTemplate('swot')
    const lean = cloneTemplate('lean-canvas')
    const value = cloneTemplate('value-proposition')
    expect(isSwotDoc(swot) && swot.blocks).toHaveLength(4)
    expect(isLeanCanvasDoc(lean) && lean.blocks).toHaveLength(9)
    expect(isValuePropositionDoc(value) && value.blocks).toHaveLength(6)
    const store = useDocumentStore()
    store.loadFromTemplate('swot')
    const wrapper = mount(SwotCanvas, { props: { doc: store.current_data as never } })
    expect(wrapper.findAll('[data-block]')).toHaveLength(4)
    wrapper.unmount()
    store.loadFromTemplate('lean-canvas')
    const leanView = mount(LeanCanvas, { props: { doc: store.current_data as never } })
    expect(leanView.find('.lean-cell--uvp').exists()).toBe(true)
    leanView.unmount()
    store.loadFromTemplate('value-proposition')
    const valueView = mount(ValuePropositionCanvas, { props: { doc: store.current_data as never } })
    expect(valueView.text()).toContain('价值图')
    expect(valueView.text()).toContain('客户画像')
    valueView.unmount()
  })

  it('OKR 目标完成度是关键结果的平均', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('okr')
    const doc = store.current_data
    expect(isOkrDoc(doc)).toBe(true)
    if (!isOkrDoc(doc)) return
    const wrapper = mount(OkrCanvas, { props: { doc } })
    expect(wrapper.text()).toContain('30%')
    const range = wrapper.get('input[aria-label="甘特图能按依赖排出关键路径进度"]')
    await range.setValue('100')
    const current = store.current_data
    expect(isOkrDoc(current) && current.objectives[0].keyResults[0].progress).toBe(100)
  })

  it('甘特图后置任务指向依赖它的行', () => {
    const doc = cloneTemplate('project-gantt')
    if (!doc || doc.type !== 'project_gantt') return
    const demand = doc.tasks.find((task) => task.name === '需求澄清')
    expect(demand && formatSuccessors(doc.tasks, demand)).toBe('3,4')
  })
})
