// @vitest-environment happy-dom
/**
 * 两个新模板的「画布组件」级回归：
 * - 参考图里的静态标签（圈名 / 顶点名 / 交叠区名 / 层级）确实渲染出来；
 * - 在区域浮层里填写内容后，内容写回文档 JSON（走通用 block store 通道）。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

vi.mock('../../api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/http')>()
  return { ...actual, getToken: () => 'test-token' }
})

/** 富文本编辑器在单测里换成轻量替身：只保留 modelValue / update:modelValue 通道 */
vi.mock('../RichTextEditor.vue', () => ({
  default: {
    name: 'RichTextEditor',
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  },
}))

import { useDocumentStore } from '../../stores/document'
import ThreeRingBasicsCanvas from './ThreeRingBasicsCanvas.vue'
import LeadershipTriangleCanvas from './LeadershipTriangleCanvas.vue'

describe('三环分析法画布组件', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('渲染参考图里的静态标签，并为每个区域提供编辑入口', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('three-ring-basics')
    const wrapper = mount(ThreeRingBasicsCanvas, {
      props: { doc: store.current_data as never },
    })

    const text = wrapper.text()
    for (const label of [
      '足够务实',
      '足够可练',
      '足够价值',
      '具体性',
      '场景性',
      '独立性',
      '检验性',
      '复利性',
      '重复性',
      '价值低',
      '不可练',
      '太虚了',
      '关键基本功',
    ]) {
      expect(text, `缺少标签 ${label}`).toContain(label)
    }

    const regions = wrapper.findAll('[data-region-id]')
    expect(regions).toHaveLength(13)
  })

  it('在区域里填写内容后写回文档 JSON', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('three-ring-basics')
    const wrapper = mount(ThreeRingBasicsCanvas, {
      props: { doc: store.current_data as never },
    })

    const core = wrapper.find('[data-region-id="core"]')
    expect(core.exists()).toBe(true)
    const input = core.find('.region-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('contenteditable')).toBe('true')
    input.element.innerHTML = '<p>每周一次刻意练习</p>'
    await input.trigger('input')
    await wrapper.vm.$nextTick()

    const doc = store.current_data as unknown as {
      blocks: Array<{ id: string; items: Array<{ text: string }> }>
    }
    const coreBlock = doc.blocks.find((b) => b.id === 'core')!
    expect(coreBlock.items[0]!.text).toContain('每周一次刻意练习')
  })
})

describe('领导核心价值驱动三角画布组件', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('渲染参考图里的静态标签与 5 层金字塔，并为每个区域提供编辑入口', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('leadership-triangle')
    const wrapper = mount(LeadershipTriangleCanvas, {
      props: { doc: store.current_data as never },
    })

    const text = wrapper.text()
    for (const label of [
      '心甘情愿',
      '领导力',
      '高水平影响力',
      '难题',
      '第1层',
      '第2层',
      '第3层',
      '第4层',
      '第5层',
      '挑战现状',
      '稳定运营',
      '难度越大',
      '管理',
      '确定执行',
      '权力',
      '强制执行',
    ]) {
      expect(text, `缺少标签 ${label}`).toContain(label)
    }

    expect(wrapper.findAll('[data-region-id]')).toHaveLength(12)
    expect(wrapper.findAll('.lt-card-title')).toHaveLength(12)
    // 5 层金字塔
    expect(wrapper.findAll('polygon')).toHaveLength(5)
  })

  it('在「难度越大」区域里填写内容后写回文档 JSON', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('leadership-triangle')
    const wrapper = mount(LeadershipTriangleCanvas, {
      props: { doc: store.current_data as never },
    })

    const region = wrapper.find('[data-region-id="difficulty"]')
    expect(region.exists()).toBe(true)
    const input = region.find('.region-input')
    expect(input.exists()).toBe(true)
    input.element.innerHTML = '<p>目标越高 / 层级越高</p>'
    await input.trigger('input')
    await wrapper.vm.$nextTick()

    const doc = store.current_data as unknown as {
      blocks: Array<{ id: string; items: Array<{ text: string }> }>
    }
    const block = doc.blocks.find((b) => b.id === 'difficulty')!
    expect(block.items[0]!.text).toContain('目标越高')
  })
})
