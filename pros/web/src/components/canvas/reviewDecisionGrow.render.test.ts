// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import IncidentReviewCanvas from './IncidentReviewCanvas.vue'
import RoiDecisionCanvas from './RoiDecisionCanvas.vue'
import type { IncidentReviewDocumentJSON, RoiDecisionDocumentJSON } from '../../types/canvas'

describe('复盘和决策画布跟着正文长高', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('故障复盘的七段和发生过程都在，正文可以换行长高', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'IncidentReviewCanvas.vue'), 'utf8')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).toContain('height: auto')

    const store = useDocumentStore()
    store.loadFromTemplate('incident-review')
    const wrapper = mount(IncidentReviewCanvas, {
      props: { doc: store.current_data as IncidentReviewDocumentJSON },
    })
    for (const title of ['详细描述', '原因分析', '解决方案', '影响范围', '关联需求', '反思总结']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.find('.ir-timeline').exists()).toBe(true)
    wrapper.unmount()
  })

  it('ROI 决策的矩阵、机会成本和结论都在', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'RoiDecisionCanvas.vue'), 'utf8')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).toContain('grid-auto-rows: max-content')

    const store = useDocumentStore()
    store.loadFromTemplate('roi-decision')
    const wrapper = mount(RoiDecisionCanvas, {
      props: { doc: store.current_data as RoiDecisionDocumentJSON },
    })
    expect(wrapper.text()).toContain('收益项')
    expect(wrapper.text()).toContain('成本项')
    expect(wrapper.text()).toContain('机会成本')
    expect(wrapper.text()).toContain('时间窗口')
    expect(wrapper.text()).toContain('最终结论')
    wrapper.unmount()
  })
})
