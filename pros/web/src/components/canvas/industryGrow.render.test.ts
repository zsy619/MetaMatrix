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
import IndustryAnalysisCanvas from './IndustryAnalysisCanvas.vue'
import IndustryForecastCanvas from './IndustryForecastCanvas.vue'
import type { IndustryAnalysisDocumentJSON, IndustryForecastDocumentJSON } from '../../types/canvas'

const TITLES = ['拆解你的产业链', '洞察行业里的变化', '预判下一个稳态B点', '判断行业周期', '行业天花板大小', '行业集中度']

describe('行业画布跟着正文长高', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('行业分析六格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('industry-analysis')
    const wrapper = mount(IndustryAnalysisCanvas, {
      props: { doc: store.current_data as IndustryAnalysisDocumentJSON },
    })
    for (const title of TITLES) expect(wrapper.text()).toContain(title)
    expect(wrapper.findAll('.ia-cell, .ia-cell--full')).toHaveLength(6)
    wrapper.unmount()
  })

  it('行业预判六格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('industry-forecast')
    const wrapper = mount(IndustryForecastCanvas, {
      props: { doc: store.current_data as IndustryForecastDocumentJSON },
    })
    for (const title of TITLES) expect(wrapper.text()).toContain(title)
    expect(wrapper.findAll('.if-cell, .if-cell--full')).toHaveLength(6)
    wrapper.unmount()
  })
})
