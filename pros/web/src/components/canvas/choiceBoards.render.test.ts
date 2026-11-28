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
import JourneyCanvas from './JourneyCanvas.vue'
import KanoCanvas from './KanoCanvas.vue'
import MoscowCanvas from './MoscowCanvas.vue'
import PlayingToWinCanvas from './PlayingToWinCanvas.vue'
import VrioCanvas from './VrioCanvas.vue'
import type {
  JourneyDocumentJSON,
  KanoDocumentJSON,
  MoscowDocumentJSON,
  PlayingToWinDocumentJSON,
  VrioDocumentJSON,
} from '../../types/canvas'
import { isKanoDoc } from '../../types/canvas'

describe('选择类画布', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('卡诺四格都在，主题写完会留下', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('kano')
    const wrapper = mount(KanoCanvas, { props: { doc: store.current_data as KanoDocumentJSON } })
    expect(wrapper.findAll('[data-block]').map((node) => node.attributes('data-block'))).toEqual([
      'must',
      'performance',
      'attractive',
      'indifferent',
    ])
    const topic = wrapper.get('[data-block="must"] input[aria-label="内容主题"]')
    await topic.setValue('刷新不丢')
    await topic.trigger('blur')
    const doc = store.current_data
    expect(isKanoDoc(doc) && doc.blocks.find((block) => block.id === 'must')?.keyword).toBe('刷新不丢')
    wrapper.unmount()
  })

  it('MoSCoW、VRIO、制胜选择和客户旅程的格子都在', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('moscow')
    const moscow = mount(MoscowCanvas, { props: { doc: store.current_data as MoscowDocumentJSON } })
    for (const title of ['必须有', '应该有', '可以有', '这次不做']) expect(moscow.text()).toContain(title)
    moscow.unmount()

    store.loadFromTemplate('vrio')
    const vrio = mount(VrioCanvas, { props: { doc: store.current_data as VrioDocumentJSON } })
    for (const title of ['有价值', '稀缺', '难模仿', '有组织']) expect(vrio.text()).toContain(title)
    vrio.unmount()

    store.loadFromTemplate('playing-to-win')
    const playing = mount(PlayingToWinCanvas, { props: { doc: store.current_data as PlayingToWinDocumentJSON } })
    for (const title of ['制胜愿景', '在哪竞争', '如何取胜', '所需能力', '管理体系']) expect(playing.text()).toContain(title)
    playing.unmount()

    store.loadFromTemplate('customer-journey')
    const journey = mount(JourneyCanvas, { props: { doc: store.current_data as JourneyDocumentJSON } })
    for (const title of ['认知', '考虑', '购买', '使用', '忠诚']) expect(journey.text()).toContain(title)
    expect(journey.findAll('section')).toHaveLength(5)
    journey.unmount()
  })
})
