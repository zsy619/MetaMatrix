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
    emits: ['update:modelValue'],
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import FdeSheetCanvas from './FdeSheetCanvas.vue'
import type { FdeSheetDocumentJSON } from '../../types/canvas'

describe('FDE 画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('评估结论打勾后计入进度', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('fde-scenario')
    const wrapper = mount(FdeSheetCanvas, {
      props: { doc: store.current_data as FdeSheetDocumentJSON },
    })

    expect(wrapper.text()).toContain('过了')
    expect(wrapper.text()).toContain('0')
    await wrapper.get('input[type="checkbox"]').trigger('change')
    const doc = store.current_data as FdeSheetDocumentJSON
    const gate = doc.blocks.find((item) => item.id === 'gate')
    expect(gate?.kind).toBe('checks')
    if (gate?.kind === 'checks') expect(gate.items[0]?.checked).toBe(true)
    expect(wrapper.text()).toContain('过了')
    wrapper.unmount()
  })
})
