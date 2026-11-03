// @vitest-environment happy-dom
/** 源码面板（CodeMirror）挂载特征：懒加载成功、格式化按钮生效。 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RteSourceCodeEditor from './RteSourceCodeEditor.vue'

/** 等待动态 import 的 CodeMirror 完成挂载。 */
async function waitForEditor(wrapper: ReturnType<typeof mount>) {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    await flushPromises()
    if (wrapper.find('.cm-editor').exists()) return
  }
}

describe('RteSourceCodeEditor', () => {
  it('懒加载 CodeMirror 并渲染编辑器', async () => {
    const wrapper = mount(RteSourceCodeEditor, {
      props: { modelValue: '<p>hello</p>' },
    })
    await waitForEditor(wrapper)
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    expect(wrapper.find('.rte-source-code-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('格式化按钮会回填格式化后的源码', async () => {
    const wrapper = mount(RteSourceCodeEditor, {
      props: { modelValue: '<div><p>a</p><p>b</p></div>' },
    })
    await waitForEditor(wrapper)
    const buttons = wrapper.findAll('.rte-source-code-btn')
    const formatBtn = buttons.find((b) => b.text() === '格式化')
    expect(formatBtn).toBeTruthy()
    await formatBtn!.trigger('click')
    await flushPromises()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as string
    expect(last).toContain('<div>')
    expect(last).toContain('  <p>a</p>')
    wrapper.unmount()
  })
})
