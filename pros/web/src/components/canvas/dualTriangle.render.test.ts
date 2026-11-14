// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import DualTriangleCanvas from './DualTriangleCanvas.vue'
import type { DualTriangleDocumentJSON } from '../../types/canvas'

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DualTriangleCanvas.vue'),
  'utf8',
)

describe('双三角画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('六张卡片、中心关键词和窄屏阅读顺序都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('dual-triangle')
    const wrapper = mount(DualTriangleCanvas, {
      props: { doc: store.current_data as DualTriangleDocumentJSON },
    })
    for (const title of [
      '创新：创造力',
      '起点：场景',
      '终点：审美',
      '过程：体系',
      '能力：基本功',
      '资产：数据',
    ]) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.text()).toContain('人类三角')
    expect(wrapper.text()).toContain('AI三角')
    expect(wrapper.findAll('[data-dt-card]')).toHaveLength(6)
    expect(wrapper.findAll('[data-dt-kw]')).toHaveLength(6)
    expect(source).toContain("@media (max-width: 800px)")
    expect(source).toContain("'innovation'\n      'scenario'\n      'center'")
    wrapper.unmount()
  })
})
