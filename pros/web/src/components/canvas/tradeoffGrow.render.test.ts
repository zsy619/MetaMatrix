// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditor',
    props: { modelValue: { type: String, default: '' } },
    template: '<div class="rte-stub ProseMirror">{{ modelValue }}</div>',
  }),
}))

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import AiTradeoffCanvas from './AiTradeoffCanvas.vue'
import ConversionTradeoffCanvas from './ConversionTradeoffCanvas.vue'
import GrowthAssumptionsCanvas from './GrowthAssumptionsCanvas.vue'
import KeyResistanceCanvas from './KeyResistanceCanvas.vue'
import type {
  AiTradeoffDocumentJSON,
  ConversionTradeoffDocumentJSON,
  GrowthAssumptionsDocumentJSON,
  KeyResistanceDocumentJSON,
} from '../../types/canvas'

describe('取舍表格子跟着正文长高', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('四张表的标题都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('growth-assumptions')
    const growth = mount(GrowthAssumptionsCanvas, {
      props: { doc: store.current_data as GrowthAssumptionsDocumentJSON },
    })
    expect(growth.text()).toContain('关键假设')
    growth.unmount()

    store.loadFromTemplate('conversion-tradeoff')
    const conversion = mount(ConversionTradeoffCanvas, {
      props: { doc: store.current_data as ConversionTradeoffDocumentJSON },
    })
    expect(conversion.findAll('.ct-cell').length).toBeGreaterThan(0)
    conversion.unmount()

    store.loadFromTemplate('key-resistance')
    const resistance = mount(KeyResistanceCanvas, {
      props: { doc: store.current_data as KeyResistanceDocumentJSON },
    })
    expect(resistance.text()).toContain('关键阻力分析画布')
    resistance.unmount()

    store.loadFromTemplate('ai-tradeoff')
    const ai = mount(AiTradeoffCanvas, {
      props: { doc: store.current_data as AiTradeoffDocumentJSON },
    })
    expect(ai.text()).toContain('A1.价值差异')
    expect(ai.text()).toContain('B4.数据可行')
    ai.unmount()
  })
})
