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

vi.mock('./YModelBlock.vue', () => ({
  default: defineComponent({
    name: 'YModelBlockCard',
    props: { block: { type: Object, required: true } },
    template: '<div class="ym-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import DeepReviewCanvas from './DeepReviewCanvas.vue'
import type { DeepReviewDocumentJSON } from '../../types/canvas'

describe('深度复盘', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('项目名称和复盘时间写回文档，评分说明留在格子上', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('deep-review')
    const wrapper = mount(DeepReviewCanvas, {
      props: { doc: store.current_data as DeepReviewDocumentJSON },
    })

    await wrapper.get('input[placeholder="填写项目名称"]').setValue('支付改造')
    await wrapper.get('input[placeholder="例如 2026-10"]').setValue('2026-11')
    const doc = store.current_data as DeepReviewDocumentJSON
    expect(doc.projectName).toBe('支付改造')
    expect(doc.reviewTime).toBe('2026-11')
    expect(wrapper.get('.dr-hint').text()).toContain('低于预期')
    for (const title of ['整体评价', '亮点共识', '问题共识', '坚持做', '放弃做', '新任务', '过程资产']) {
      expect(wrapper.text()).toContain(title)
    }
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'DeepReviewCanvas.vue'), 'utf8')
    expect(source).toContain('overflow-wrap: anywhere')
    wrapper.unmount()
  })
})
