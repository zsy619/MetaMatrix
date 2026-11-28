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
import PmRetroValueCanvas from './PmRetroValueCanvas.vue'
import RoiTradeoffCanvas from './RoiTradeoffCanvas.vue'
import type { PmRetroValueDocumentJSON, RoiTradeoffDocumentJSON } from '../../types/canvas'

const dir = dirname(fileURLToPath(import.meta.url))

describe('对照画布窄屏改成上下卡片', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('ROI 权衡左右两列和窄屏单列规则都在', () => {
    const source = readFileSync(join(dir, 'RoiTradeoffCanvas.vue'), 'utf8')
    expect(source).toContain('@media (max-width: 800px)')
    expect(source).toContain('grid-template-columns: minmax(0, 1fr)')

    const store = useDocumentStore()
    store.loadFromTemplate('roi-tradeoff')
    const wrapper = mount(RoiTradeoffCanvas, {
      props: { doc: store.current_data as RoiTradeoffDocumentJSON },
    })
    expect(wrapper.text()).toContain('关键收益')
    expect(wrapper.text()).toContain('关键成本')
    expect(wrapper.findAll('.roi-col')).toHaveLength(2)
    wrapper.unmount()
  })

  it('复盘过程资产前后两列和窄屏单列规则都在', () => {
    const source = readFileSync(join(dir, 'PmRetroValueCanvas.vue'), 'utf8')
    expect(source).toContain('@media (max-width: 800px)')
    expect(source).toContain('grid-template-columns: minmax(0, 1fr)')

    const store = useDocumentStore()
    store.loadFromTemplate('pm-retro-value')
    const wrapper = mount(PmRetroValueCanvas, {
      props: { doc: store.current_data as PmRetroValueDocumentJSON },
    })
    expect(wrapper.text()).toContain('Before: LEO不挖')
    expect(wrapper.text()).toContain('After: LEO认真挖')
    expect(wrapper.findAll('.prv-col')).toHaveLength(2)
    wrapper.unmount()
  })
})
