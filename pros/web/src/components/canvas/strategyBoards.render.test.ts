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
import FiveForcesCanvas from './FiveForcesCanvas.vue'
import LeanCanvas from './LeanCanvas.vue'
import PdcaCanvas from './PdcaCanvas.vue'
import SwotCanvas from './SwotCanvas.vue'
import ValueChainCanvas from './ValueChainCanvas.vue'
import ValuePropositionCanvas from './ValuePropositionCanvas.vue'
import type {
  FiveForcesDocumentJSON,
  LeanCanvasDocumentJSON,
  PdcaDocumentJSON,
  SwotDocumentJSON,
  ValueChainDocumentJSON,
  ValuePropositionDocumentJSON,
} from '../../types/canvas'
import { isPdcaDoc } from '../../types/canvas'

describe('战略画布格子', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('精益画布九格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('lean-canvas')
    const wrapper = mount(LeanCanvas, {
      props: { doc: store.current_data as LeanCanvasDocumentJSON },
    })
    for (const title of ['问题', '解决方案', '独特价值主张', '客户细分', '关键指标', '成本结构', '收入来源']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('.lean-cell')).toHaveLength(9)
    wrapper.unmount()
  })

  it('价值主张左右六格都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('value-proposition')
    const wrapper = mount(ValuePropositionCanvas, {
      props: { doc: store.current_data as ValuePropositionDocumentJSON },
    })
    expect(wrapper.text()).toContain('价值图')
    expect(wrapper.text()).toContain('客户画像')
    for (const title of ['产品与服务', '痛点缓解', '收益创造', '客户要完成的事', '痛点', '收益']) {
      expect(wrapper.text()).toContain(title)
    }
    expect(wrapper.findAll('article')).toHaveLength(6)
    wrapper.unmount()
  })

  it('PDCA 四格都在，主题写完会留下', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('pdca')
    const wrapper = mount(PdcaCanvas, { props: { doc: store.current_data as PdcaDocumentJSON } })
    for (const title of ['计划', '执行', '检查', '处理']) expect(wrapper.text()).toContain(title)
    const topic = wrapper.get('[data-block="plan"] input[aria-label="内容主题"]')
    await topic.setValue('先写清楚')
    await topic.trigger('blur')
    const doc = store.current_data
    expect(isPdcaDoc(doc) && doc.blocks.find((block) => block.id === 'plan')?.keyword).toBe('先写清楚')
    wrapper.unmount()
  })

  it('波特五力、SWOT 和价值链的格子都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('five-forces')
    const forces = mount(FiveForcesCanvas, { props: { doc: store.current_data as FiveForcesDocumentJSON } })
    for (const title of ['新进入者', '供应商', '行业竞争', '买方', '替代品']) expect(forces.text()).toContain(title)
    expect(forces.findAll('section')).toHaveLength(5)
    forces.unmount()

    store.loadFromTemplate('swot')
    const swot = mount(SwotCanvas, { props: { doc: store.current_data as SwotDocumentJSON } })
    for (const title of ['优势', '劣势', '机会', '威胁']) expect(swot.text()).toContain(title)
    expect(swot.findAll('section')).toHaveLength(4)
    swot.unmount()

    store.loadFromTemplate('value-chain')
    const chain = mount(ValueChainCanvas, { props: { doc: store.current_data as ValueChainDocumentJSON } })
    for (const title of ['基础设施', '人力资源', '技术开发', '采购', '进料后勤', '生产运营', '出货后勤', '市场销售', '服务']) {
      expect(chain.text()).toContain(title)
    }
    expect(chain.findAll('section')).toHaveLength(9)
    chain.unmount()
  })
})
