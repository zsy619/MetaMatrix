// @vitest-environment happy-dom
/**
 * 画布里的紧凑区块：嵌入态的编辑器按内容流式排版（不走 A4 纸张），
 * 最大化后仍然是 A4 纸张视图。
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 富文本编辑器在单测里换成轻量替身：只保留 props 通道，便于断言页面模式开关。 */
vi.mock('../RichTextEditor.vue', () => ({
  default: {
    name: 'RichTextEditor',
    props: {
      modelValue: { type: String, default: '' },
      panelId: { type: String, default: '' },
      compact: { type: Boolean, default: false },
      expanded: { type: Boolean, default: false },
      pageSheet: { type: Boolean, default: true },
      showMarkdownHint: { type: Boolean, default: true },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    template: '<div class="rte-stub">{{ modelValue }}</div>',
  },
}))

import YModelBlock from './YModelBlock.vue'

const BLOCK = { id: 'b1', title: '如何定性定量分析', items: [] }

describe('画布紧凑区块的纸张模式', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('嵌入态不按纸张渲染，最大化后回到纸张视图', async () => {
    const wrapper = mount(YModelBlock, {
      props: { block: BLOCK },
      global: { stubs: { teleport: true } },
    })
    const editors = wrapper.findAllComponents({ name: 'RichTextEditor' })
    expect(editors.length).toBe(1)
    expect(editors[0]!.props('pageSheet')).toBe(false)
    expect(editors[0]!.props('compact')).toBe(true)

    await wrapper.get('button[aria-label="最大化"]').trigger('click')

    const after = wrapper.findAllComponents({ name: 'RichTextEditor' })
    // 最大化时嵌入态的那个实例被换下，只剩浮层里的纸张视图。
    expect(after.length).toBe(1)
    const maximized = after[0]!
    expect(maximized.props('expanded')).toBe(true)
    expect(maximized.props('pageSheet')).toBe(true)
    wrapper.unmount()
  })

  it('Y 模型格子的默认编辑器与双三角一样，先藏起工具条', () => {
    const wrapper = mount(YModelBlock, {
      props: { block: BLOCK, editor: 'card', accent: '#A67C00' },
      global: { stubs: { teleport: true } },
    })
    const editor = wrapper.getComponent({ name: 'RichTextEditor' })
    expect(editor.props('showMarkdownHint')).toBe(false)
    expect(editor.props('placeholder')).toBe('点击填写…')
    expect(editor.props('pageSheet')).toBe(false)
    expect(wrapper.get('.ym-block').classes()).toContain('ym-block--card')
    wrapper.unmount()
  })
})
