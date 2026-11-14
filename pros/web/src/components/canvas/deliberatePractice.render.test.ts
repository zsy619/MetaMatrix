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
import DeliberatePracticeCanvas from './DeliberatePracticeCanvas.vue'
import type { DeliberatePracticeDocumentJSON } from '../../types/canvas'

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DeliberatePracticeCanvas.vue'),
  'utf8',
)

describe('刻意练习画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('五个填写区和窄屏卡片都在', () => {
    expect(source).toContain('@media (max-width: 800px)')
    expect(source).toContain('clip-path: none')

    const store = useDocumentStore()
    store.loadFromTemplate('deliberate-practice')
    const wrapper = mount(DeliberatePracticeCanvas, {
      props: { doc: store.current_data as DeliberatePracticeDocumentJSON },
    })
    for (const title of ['前提：长期追求', 'A.固定套路', 'B.非舒适区', 'C.及时反馈', 'D.大量重复']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.dp-card')).toHaveLength(5)
    wrapper.unmount()
  })
})
