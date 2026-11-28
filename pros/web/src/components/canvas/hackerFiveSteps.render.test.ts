// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

// 富文本块里嵌了 tiptap，happy-dom 里不能安全挂载，测测里用占位元素代替
vi.mock('./YModelBlock.vue', () => ({
  default: defineComponent({
    name: 'YModelBlockCard',
    props: { block: { type: Object, required: true } },
    template: '<div class="ym-stub" />',
  }),
}))

import { useDocumentStore } from '../../stores/document'
import HackerFiveStepsCanvas from './HackerFiveStepsCanvas.vue'
import type { HackerFiveStepsDocumentJSON } from '../../types/canvas'

function mountHfs() {
  const store = useDocumentStore()
  store.loadFromTemplate('hacker-five-steps')
  const wrapper = mount(HackerFiveStepsCanvas, {
    props: { doc: store.current_data as HackerFiveStepsDocumentJSON },
  })
  return { store, wrapper }
}

describe('调用黑客五部曲', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('五步四列全部画出来', () => {
    const { wrapper } = mountHfs()
    const text = wrapper.text()

    for (const label of [
      '步骤',
      '关键工作',
      '依次回答',
      '真正难点',
      '明确你的调研目标',
      '缩小你的调研范围',
      '罗列调研产品清单',
      '不择手段获取情报',
      '拿到信息正确判断',
      '最考验调研意识',
      '最考验正确归因',
    ]) {
      expect(text, `缺少 ${label}`).toContain(label)
    }
    expect(wrapper.findAll('.hfs-row')).toHaveLength(5)
    expect(wrapper.findAll('.hfs-badge')).toHaveLength(5)
    expect(wrapper.findAll('.hfs-diff')).toHaveLength(5)
    // 每一步都有一个富文本回答块
    expect(wrapper.findAll('.hfs-answer')).toHaveLength(5)
    expect(wrapper.findAll('.ym-stub')).toHaveLength(5)
    wrapper.unmount()
  })

  it('表头四列顺序与参考图一致', () => {
    const { wrapper } = mountHfs()
    expect(wrapper.findAll('.hfs-head .hfs-cell').map((c) => c.text())).toEqual([
      '步骤',
      '关键工作',
      '依次回答',
      '真正难点',
    ])
    wrapper.unmount()
  })

  it('回答块走 store 的 items 通用路径，写完就进一格进度', async () => {
    const { store, wrapper } = mountHfs()
    const doc = store.current_data as HackerFiveStepsDocumentJSON
    expect(wrapper.get('.hfs-progress-text').text()).toContain('0')

    const first = doc.steps[0]!
    const added = store.addBlockItem(first.blockId, { text: '目标是找到价格破缺点' })
    expect(added).toBeTruthy()
    await wrapper.vm.$nextTick()

    expect(doc.blocks[0]!.items[0]!.text).toBe('目标是找到价格破缺点')
    expect(wrapper.get('.hfs-progress-text').text()).toContain('1')
    expect(wrapper.get('.hfs-progress-fill').attributes('style')).toContain('20%')
    wrapper.unmount()
  })

  it('清空答案能把内容全部抹掉', async () => {
    const { store, wrapper } = mountHfs()
    const doc = store.current_data as HackerFiveStepsDocumentJSON
    store.addBlockItem(doc.steps[0]!.blockId, { text: '临时答案' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.hfs-progress-text').text()).toContain('1')

    await wrapper.get('.hfs-btn').trigger('click')
    expect(doc.blocks.every((b) => b.items.length === 0)).toBe(true)
    expect(wrapper.get('.hfs-progress-text').text()).toContain('0')
    wrapper.unmount()
  })
})
