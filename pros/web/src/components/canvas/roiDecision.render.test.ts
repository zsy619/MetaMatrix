// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { coerceYModelDoc, type RoiDecisionDocumentJSON, type YModelDocumentJSON } from '../../types/canvas'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditor',
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' },
    },
    template: '<div class="rte-stub ProseMirror">{{ placeholder }}</div>',
  }),
}))

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import RoiDecisionCanvas from './RoiDecisionCanvas.vue'

describe('ROI决策评估', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('别的画布类型不会被上一张 Y 模型改写成 y_model', () => {
    const roi = {
      id: 'canvas_roi_decision',
      type: 'roi_decision',
      schemaVersion: 1,
      title: 'ROI决策评估',
      rows: [{ id: 'row_basic', dimension: '基础ROI', benefitBlockId: 'b', costBlockId: 'c' }],
      blocks: [],
    }
    const kept = coerceYModelDoc(roi as unknown as YModelDocumentJSON, 'y-model')
    expect(kept.type).toBe('roi_decision')

    const legacy = coerceYModelDoc(
      { id: 'canvas_y_model', type: 'y-model' } as unknown as YModelDocumentJSON,
      'roi-decision',
    )
    expect(legacy.type).toBe('y_model')
  })

  it('打开 ROI 决策时，误存成 Y 模型的草稿会回到决策表', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('y-model')
    const yModel = JSON.parse(JSON.stringify(store.current_data))
    localStorage.setItem('metamatrix:doc:roi-decision', JSON.stringify(yModel))

    store.loadFromTemplate('roi-decision')
    const doc = store.current_data as RoiDecisionDocumentJSON
    expect(doc.type).toBe('roi_decision')
    expect(doc.rows.map((row) => row.dimension)).toEqual(['基础ROI', '长期视角', '公司视角'])
    expect(doc.rows.some((row) => row.benefitBlockId)).toBe(true)
  })

  it('行还在的决策稿即使类型被写成 y_model，也保留原来的维度', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('roi-decision')
    const draft = JSON.parse(JSON.stringify(store.current_data)) as RoiDecisionDocumentJSON
    draft.rows[0]!.dimension = '客户回报'
    draft.decision = '要不要做会员'
    const poisoned = { ...draft, type: 'y_model' }
    localStorage.setItem('metamatrix:doc:roi-decision', JSON.stringify(poisoned))

    store.loadFromTemplate('y-model')
    store.loadFromTemplate('roi-decision')
    const doc = store.current_data as RoiDecisionDocumentJSON
    expect(doc.type).toBe('roi_decision')
    expect(doc.rows[0]?.dimension).toBe('客户回报')
    expect(doc.decision).toBe('要不要做会员')
  })

  it('能写下要决定的事，并给维度和整张表做判断', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('roi-decision')
    const wrapper = mount(RoiDecisionCanvas, {
      props: { doc: store.current_data as RoiDecisionDocumentJSON },
    })

    expect(wrapper.find('.y-model-canvas').exists()).toBe(false)
    expect(wrapper.find('.rd-canvas').exists()).toBe(true)
    expect(wrapper.text()).toContain('这次要决定')
    expect(wrapper.text()).toContain('得到什么')
    expect(wrapper.text()).toContain('付出什么')
    expect(wrapper.text()).toContain('机会成本')
    expect(wrapper.text()).toContain('时间窗口')
    expect(wrapper.text()).toContain('最终结论')
    expect(wrapper.text()).toContain('写具体结果')

    await wrapper.get('input[aria-label="这次要决定的事"]').setValue('要不要做会员')
    expect((store.current_data as RoiDecisionDocumentJSON).decision).toBe('要不要做会员')

    const rowId = (store.current_data as RoiDecisionDocumentJSON).rows[0]!.id
    await wrapper.get('.rd-verdict--worth').trigger('click')
    expect((store.current_data as RoiDecisionDocumentJSON).rows[0]?.verdict).toBe('worth')
    expect(wrapper.text()).toContain('1 个已判断')

    await wrapper.get('.rd-choice--validate').trigger('click')
    expect((store.current_data as RoiDecisionDocumentJSON).choice).toBe('validate')

    await wrapper.get('.rd-verdict--worth').trigger('click')
    expect((store.current_data as RoiDecisionDocumentJSON).rows.find((row) => row.id === rowId)?.verdict).toBe('')

    wrapper.unmount()
  })
})
