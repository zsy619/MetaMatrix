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
import PmCompetencyCanvas from './PmCompetencyCanvas.vue'
import PmSensitivity6dCanvas from './PmSensitivity6dCanvas.vue'
import PmSolutionTriangleCanvas from './PmSolutionTriangleCanvas.vue'
import ProductFeatures5dCanvas from './ProductFeatures5dCanvas.vue'
import type {
  PmCompetencyDocumentJSON,
  PmSensitivity6dDocumentJSON,
  PmSolutionTriangleDocumentJSON,
  ProductFeatures5dDocumentJSON,
} from '../../types/canvas'

describe('雷达备注在窄屏写成卡片', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('竞争力五张备注卡都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('pm-competency')
    const wrapper = mount(PmCompetencyCanvas, {
      props: { doc: store.current_data as PmCompetencyDocumentJSON },
    })
    expect(wrapper.findAll('.pmc-card')).toHaveLength(5)
    expect(wrapper.text()).toContain('项目管理意识')
    expect(wrapper.text()).toContain('基本功1：定方案')
    wrapper.unmount()
  })

  it('六维敏感度六张备注卡都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('pm-sensitivity-6d')
    const wrapper = mount(PmSensitivity6dCanvas, {
      props: { doc: store.current_data as PmSensitivity6dDocumentJSON },
    })
    expect(wrapper.findAll('.pm6d-card')).toHaveLength(6)
    expect(wrapper.text()).toContain('预算敏感')
    expect(wrapper.text()).toContain('时间敏感')
    wrapper.unmount()
  })

  it('产品特性五张备注卡都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('product-features-5d')
    const wrapper = mount(ProductFeatures5dCanvas, {
      props: { doc: store.current_data as ProductFeatures5dDocumentJSON },
    })
    expect(wrapper.findAll('.pf5d-card')).toHaveLength(5)
    expect(wrapper.text()).toContain('开放性')
    expect(wrapper.text()).toContain('创新性')
    wrapper.unmount()
  })

  it('方案三角三张备注卡都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('pm-solution-triangle')
    const wrapper = mount(PmSolutionTriangleCanvas, {
      props: { doc: store.current_data as PmSolutionTriangleDocumentJSON },
    })
    expect(wrapper.findAll('.pmst-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('投入产出比ROI')
    expect(wrapper.text()).toContain('机会窗口')
    wrapper.unmount()
  })
})
