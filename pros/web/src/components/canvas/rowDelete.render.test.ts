// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('./YModelBlock.vue', () => ({
  default: defineComponent({
    name: 'YModelBlockCard',
    props: { block: { type: Object, required: true } },
    template: '<div class="ym-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import ConversionTradeoffCanvas from './ConversionTradeoffCanvas.vue'
import GrowthAssumptionsCanvas from './GrowthAssumptionsCanvas.vue'
import IncidentReviewCanvas from './IncidentReviewCanvas.vue'
import KeyResistanceCanvas from './KeyResistanceCanvas.vue'
import RoiDecisionCanvas from './RoiDecisionCanvas.vue'

const boards = [
  { template: 'conversion-tradeoff', canvas: ConversionTradeoffCanvas },
  { template: 'growth-assumptions', canvas: GrowthAssumptionsCanvas },
  { template: 'key-resistance', canvas: KeyResistanceCanvas },
  { template: 'roi-decision', canvas: RoiDecisionCanvas },
  { template: 'incident-review', canvas: IncidentReviewCanvas },
] as const

describe('可增删行的画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it.each(boards)('$template 每一行都有删除按钮，添加后再删回去', async ({ template, canvas }) => {
    const store = useDocumentStore()
    store.loadFromTemplate(template)
    const wrapper = mount(canvas, { props: { doc: store.current_data as never } })

    const before = wrapper.findAll('button[aria-label="删除本行"]')
    expect(before.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('删除本行')
    expect(wrapper.text()).toContain('+ 添加行')

    await wrapper.get('button.ct-add-btn, button.ga-add-btn, button.kr-add-btn, button.rd-add-btn, button.ir-add-btn').trigger('click')
    expect(wrapper.findAll('button[aria-label="删除本行"]')).toHaveLength(before.length + 1)

    const deletable = wrapper.findAll('button[aria-label="删除本行"]').filter((button) => !button.attributes('disabled'))
    expect(deletable.length).toBeGreaterThan(0)
    await deletable[deletable.length - 1].trigger('click')
    expect(wrapper.findAll('button[aria-label="删除本行"]')).toHaveLength(before.length)
    wrapper.unmount()
  })
})