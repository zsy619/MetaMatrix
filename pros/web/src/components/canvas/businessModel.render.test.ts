// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import BusinessModelCanvas from './BusinessModelCanvas.vue'
import type { BusinessModelCanvasDocumentJSON } from '../../types/canvas'

describe('商业模式画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('九格提示都在，价值主张写回文档', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('business-model-canvas')
    const wrapper = mount(BusinessModelCanvas, {
      props: { doc: store.current_data as BusinessModelCanvasDocumentJSON },
    })

    for (const title of ['重要伙伴', '价值主张', '客户细分', '成本结构', '收入来源']) {
      expect(wrapper.text()).toContain(title)
    }
    const area = wrapper.get('textarea[aria-label="价值主张"]')
    await area.setValue('帮团队把报价从一天缩短到一小时')
    await area.trigger('change')
    const doc = store.current_data as BusinessModelCanvasDocumentJSON
    expect(doc.blocks.find((item) => item.id === 'value')?.text).toBe('帮团队把报价从一天缩短到一小时')
    wrapper.unmount()
  })
})
