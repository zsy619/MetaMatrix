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
import TenCheckCanvas from './TenCheckCanvas.vue'
import type { TenCheckDocumentJSON } from '../../types/canvas'

describe('十格自检', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('点「过」再点一次取消，说明文字完整留在格子上', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('ten-check')
    const wrapper = mount(TenCheckCanvas, {
      props: { doc: store.current_data as TenCheckDocumentJSON },
    })

    expect(wrapper.findAll('.row')).toHaveLength(10)
    expect(wrapper.text()).toContain('一句话：你想让 AI 替你干的那件事')
    expect(wrapper.text()).toContain('只能回答「看着差不多」')

    const pass = wrapper.get('.row[data-row="scene"] .marks button:not(.no)')
    await pass.trigger('click')
    const doc = store.current_data as TenCheckDocumentJSON
    expect(doc.rows[0]?.passed).toBe(true)
    expect(wrapper.get('.row[data-row="scene"]').attributes('data-pass')).toBe('true')

    await pass.trigger('click')
    expect(doc.rows[0]?.passed).toBe(null)
    wrapper.unmount()
  })
})
