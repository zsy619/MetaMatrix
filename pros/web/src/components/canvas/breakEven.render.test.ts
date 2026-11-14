// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import BreakEvenCanvas from './BreakEvenCanvas.vue'
import type { BreakEvenDocumentJSON } from '../../types/canvas'

describe('盈亏平衡', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认算出销量和收入，单价不高于变动成本时无法覆盖', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('break-even')
    const wrapper = mount(BreakEvenCanvas, { props: { doc: store.current_data as BreakEvenDocumentJSON } })
    expect(wrapper.get('[aria-label^="单位贡献"]').text()).toBe('贡献 60')
    expect(wrapper.get('[aria-label^="盈亏平衡销量"]').text()).toBe('销量 200')
    expect(wrapper.get('[aria-label^="盈亏平衡收入"]').text()).toBe('收入 20000')
    const price = wrapper.get('input[aria-label="单价"]')
    await price.setValue('40')
    await price.trigger('change')
    expect(wrapper.get('[aria-label^="盈亏平衡销量"]').text()).toBe('销量 无法覆盖')
    expect(wrapper.get('[aria-label^="单位贡献"]').classes()).toContain('is-out')
    wrapper.unmount()
  })
})
