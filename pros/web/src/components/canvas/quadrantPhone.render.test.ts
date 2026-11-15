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
import OnlineOfflineCommCanvas from './OnlineOfflineCommCanvas.vue'
import TimeMatrixCanvas from './TimeMatrixCanvas.vue'
import UnitModelQuadrantCanvas from './UnitModelQuadrantCanvas.vue'
import WorkStateZonesCanvas from './WorkStateZonesCanvas.vue'
import type {
  OnlineOfflineCommDocumentJSON,
  TimeMatrixDocumentJSON,
  UnitModelQuadrantDocumentJSON,
  WorkStateZonesDocumentJSON,
} from '../../types/canvas'

const dir = dirname(fileURLToPath(import.meta.url))

describe('象限窄屏把坐标写在卡片上', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('时间矩阵用格子标题说明重要和紧急', () => {
    const source = readFileSync(join(dir, 'TimeMatrixCanvas.vue'), 'utf8')
    expect(source).toContain('.tm-axis-label {\n    display: none;')
    const store = useDocumentStore()
    store.loadFromTemplate('time-matrix')
    const wrapper = mount(TimeMatrixCanvas, { props: { doc: store.current_data as TimeMatrixDocumentJSON } })
    expect(wrapper.text()).toContain('A.重要但不紧急')
    expect(wrapper.text()).toContain('D.紧急但不重要')
    wrapper.unmount()
  })

  it('单元模型把两条坐标写在结论下面', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('unit-model-quadrant')
    const wrapper = mount(UnitModelQuadrantCanvas, {
      props: { doc: store.current_data as UnitModelQuadrantDocumentJSON },
    })
    expect(wrapper.text()).toContain('健康模型')
    expect(wrapper.text()).toContain('单元模型长期成立 · 公司账长期成立')
    expect(wrapper.text()).toContain('单元模型不成立 · 公司账不成立')
    wrapper.unmount()
  })

  it('工作状态把自治和舒适区写在区间下面', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('work-state-zones')
    const wrapper = mount(WorkStateZonesCanvas, {
      props: { doc: store.current_data as WorkStateZonesDocumentJSON },
    })
    expect(wrapper.text()).toContain('幸福做事区')
    expect(wrapper.text()).toContain('自治 · 舒适区')
    expect(wrapper.text()).toContain('不自治 · 非舒适区')
    wrapper.unmount()
  })

  it('线上线下沟通在窄屏卡片上写出名称', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('online-offline-comm')
    const wrapper = mount(OnlineOfflineCommCanvas, {
      props: { doc: store.current_data as OnlineOfflineCommDocumentJSON },
    })
    expect(wrapper.findAll('.ooc-title').map((node) => node.text())).toEqual([
      '线上·异步',
      '线上·同步',
      '线下·异步',
      '线下·同步',
    ])
    wrapper.unmount()
  })
})
