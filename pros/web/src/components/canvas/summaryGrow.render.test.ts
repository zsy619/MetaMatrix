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
import AnnualSummaryCanvas from './AnnualSummaryCanvas.vue'
import PeriodSummaryCanvas from './PeriodSummaryCanvas.vue'
import type { AnnualSummaryDocumentJSON, PeriodSummaryDocumentJSON } from '../../types/canvas'

describe('总结画布跟着正文长高', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('年总结三段都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('annual-summary')
    const wrapper = mount(AnnualSummaryCanvas, {
      props: { doc: store.current_data as AnnualSummaryDocumentJSON },
    })
    for (const title of ['重点业务进展', '个人成长进步', '不足与改进计划']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.as-panel')).toHaveLength(3)
    wrapper.unmount()
  })

  it('周总结三段都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('weekly-summary')
    const wrapper = mount(PeriodSummaryCanvas, {
      props: { doc: store.current_data as PeriodSummaryDocumentJSON },
    })
    for (const title of ['本周关键执行', '卡点与应对', '下周优先事项']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.as-panel')).toHaveLength(3)
    wrapper.unmount()
  })
})
