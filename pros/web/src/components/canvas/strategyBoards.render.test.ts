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
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  }),
}))

vi.mock('./PanelAttachments.vue', () => ({
  default: defineComponent({
    name: 'PanelAttachments',
    template: '<div class="pa-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import LeanCanvas from './LeanCanvas.vue'
import ValuePropositionCanvas from './ValuePropositionCanvas.vue'
import type { LeanCanvasDocumentJSON, ValuePropositionDocumentJSON } from '../../types/canvas'

describe('战略画布格子', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('精益画布九格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('lean-canvas')
    const wrapper = mount(LeanCanvas, {
      props: { doc: store.current_data as LeanCanvasDocumentJSON },
    })
    for (const title of ['问题', '解决方案', '独特价值主张', '客户细分', '关键指标', '成本结构', '收入来源']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.lean-cell')).toHaveLength(9)
    wrapper.unmount()
  })

  it('价值主张左右六格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('value-proposition')
    const wrapper = mount(ValuePropositionCanvas, {
      props: { doc: store.current_data as ValuePropositionDocumentJSON },
    })
    expect(wrapper.text()).toContain('价值图')
    expect(wrapper.text()).toContain('客户画像')
    for (const title of ['产品与服务', '痛点缓解', '收益创造', '客户要完成的事', '痛点', '收益']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('article')).toHaveLength(6)
    wrapper.unmount()
  })
})
