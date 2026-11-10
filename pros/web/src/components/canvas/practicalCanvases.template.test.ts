// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../RichTextEditor.vue', () => ({
  default: {
    name: 'RichTextEditor',
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  },
}))

import { cloneTemplate, isTemplateId, TEMPLATE_META, useDocumentStore } from '../../stores/document'
import {
  isFiveForcesDoc,
  isBreakEvenDoc,
  isIncomeStatementDoc,
  isRiceDoc,
  isSevenSDoc,
  isValueChainDoc,
  isLeanCanvasDoc,
  isOkrDoc,
  isPdcaDoc,
  isStakeholderDoc,
  isSwotDoc,
  isValuePropositionDoc,
} from '../../types/canvas'
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
    expect(wrapper.findAll('.rte-stub')).toHaveLength(4)
    expect((wrapper.get('[data-block="strengths"] input[aria-label="内容主题"]').element as HTMLInputElement).placeholder).toBe('我们已经做得比别人好的地方')
    expect(store.addBlockItem('strengths', { text: '还能自己复盘' })?.text).toContain('复盘')
    expect(store.updateBlockKeyword('strengths', '交付')).toBe(true)
    wrapper.unmount()
    store.loadFromTemplate('lean-canvas')
    const leanView = mount(LeanCanvas, { props: { doc: store.current_data as never } })
    expect(leanView.find('.lean-cell--uvp').exists()).toBe(true)
    expect(leanView.findAll('.rte-stub')).toHaveLength(9)
    leanView.unmount()
    store.loadFromTemplate('value-proposition')
    const valueView = mount(ValuePropositionCanvas, { props: { doc: store.current_data as never } })
    expect(valueView.text()).toContain('价值图')
    expect(valueView.text()).toContain('客户画像')
    expect(valueView.findAll('.rte-stub')).toHaveLength(6)
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

  it('旧的 SWOT 纯文本会按行迁进富文本', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('swot')
    const source = store.current_data
    if (!isSwotDoc(source)) return
    store.setCurrentData({
      ...source,
      blocks: source.blocks.map((block) =>
        block.id === 'strengths'
          ? { id: block.id, title: block.title, hint: block.hint, text: '第一行\n第二行' }
          : block,
      ),
    } as typeof source)
    const current = store.current_data
    expect(isSwotDoc(current)).toBe(true)
    if (!isSwotDoc(current)) return
    expect(current.blocks.find((block) => block.id === 'strengths')?.items.map((item) => item.text)).toEqual(['第一行', '第二行'])
  })

  it('干系人、PDCA、五力和利润表都登记并能算出利润', () => {
    for (const id of ['stakeholder-map', 'pdca', 'five-forces', 'income-statement'] as const) {
      expect(isTemplateId(id)).toBe(true)
    }
    const stakeholder = cloneTemplate('stakeholder-map')
    const pdca = cloneTemplate('pdca')
    const forces = cloneTemplate('five-forces')
    const income = cloneTemplate('income-statement')
    expect(isStakeholderDoc(stakeholder) && stakeholder.blocks).toHaveLength(4)
    expect(isPdcaDoc(pdca) && pdca.blocks).toHaveLength(4)
    expect(isFiveForcesDoc(forces) && forces.blocks).toHaveLength(5)
    expect(isIncomeStatementDoc(income)).toBe(true)
    if (!isIncomeStatementDoc(income)) return
    const sum = (id: 'revenue' | 'cost' | 'expense') =>
      income.sections.find((section) => section.id === id)!.lines.reduce((total, line) => total + line.amount, 0)
    expect(sum('revenue') - sum('cost') - sum('expense')).toBe(110)
  })

  it('价值链、7S、RICE 和盈亏平衡都能算出结果', () => {
    for (const id of ['value-chain', 'seven-s', 'rice', 'break-even'] as const) expect(isTemplateId(id)).toBe(true)
    const chain = cloneTemplate('value-chain')
    const seven = cloneTemplate('seven-s')
    const rice = cloneTemplate('rice')
    const point = cloneTemplate('break-even')
    expect(isValueChainDoc(chain) && chain.blocks).toHaveLength(9)
    expect(isSevenSDoc(seven) && seven.blocks).toHaveLength(7)
    expect(isRiceDoc(rice)).toBe(true)
    if (isRiceDoc(rice)) {
      const first = rice.items[0]
      const score = (first.reach * first.impact * (first.confidence / 100)) / first.effort
      expect(score).toBe(320)
    }
    expect(isBreakEvenDoc(point)).toBe(true)
    if (isBreakEvenDoc(point)) {
      expect(point.fixedCost / (point.price - point.variableCost)).toBe(200)
    }
  })

  it('甘特图后置任务指向依赖它的行', () => {
    const doc = cloneTemplate('project-gantt')
    if (!doc || doc.type !== 'project_gantt') return
    const demand = doc.tasks.find((task) => task.name === '需求澄清')
    expect(demand && formatSuccessors(doc.tasks, demand)).toBe('3,4')
  })
})
