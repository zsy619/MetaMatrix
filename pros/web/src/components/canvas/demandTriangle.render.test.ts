// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import { useSelectionStore } from '../../stores/selection'
import DemandTriangleCanvas from './DemandTriangleCanvas.vue'
import type { DemandTriangleDocumentJSON } from '../../types/canvas'

describe('需求三角', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('三个刻度都写全，拖动普遍性会改形状', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('demand-triangle')
    const wrapper = mount(DemandTriangleCanvas, {
      props: { doc: store.current_data as DemandTriangleDocumentJSON },
      global: { stubs: { RichTextEditor: true, RichTextItem: true, YModelBlock: true, PanelAttachments: true } },
    })
    const key = wrapper.get('[aria-label="三个刻度"]')
    for (const text of ['普遍性', '全民', '几亿量级', '频次', '一天一次', '刚性', '加钱抢着用']) {
      expect(key.text()).toContain(text)
    }
    useSelectionStore().selectBlockItem('legend', 'dir_1')
    await wrapper.vm.$nextTick()
    const slider = wrapper.get('input[aria-label="普遍性"]')
    await slider.setValue('0.8')
    await slider.trigger('input')
    const doc = store.current_data as DemandTriangleDocumentJSON
    expect(doc.directions.find((item) => item.id === 'dir_1')?.scores.universality).toBe(0.8)
    wrapper.unmount()
  })
})
