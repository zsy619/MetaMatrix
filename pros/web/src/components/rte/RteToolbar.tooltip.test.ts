// @vitest-environment happy-dom
/**
 * Telegram 风格常驻气泡提示：
 * - 工具按钮始终带 data-tip（两种工具栏风格都能出提示）；
 * - 悬停 320ms 后出现自定义提示，并摘掉原生 title（避免双气泡）；
 * - 原生 title 不再还原：浏览器自带气泡会压在刚打开的颜色 / 高亮面板上，
 *   文本转存到 data-tip 供自定义气泡继续使用（键盘聚焦时仍会还原）。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'

async function mountEditor(expanded: boolean) {
  localStorage.removeItem('rte.toolbar.style')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: '提示',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>甲</p>', panelId: 'panel-tip', expanded },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  return wrapper
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('工具栏常驻气泡提示', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('紧凑工具栏按钮带 data-tip，且提示内容与 title 一致', async () => {
    const wrapper = await mountEditor(false)
    const tool = wrapper.find('.rte-toolbar-tools .rte-tool')
    expect(tool.exists()).toBe(true)
    expect(tool.attributes('data-tip')).toBeTruthy()
    expect(tool.attributes('data-tip')).toBe(tool.attributes('title'))
    wrapper.unmount()
  })

  it('悬停出现提示并摘掉原生 title，移开后不再还原（避免气泡压住面板）', async () => {
    const wrapper = await mountEditor(false)
    const tool = wrapper.find('.rte-toolbar-tools .rte-tool')
    const el = tool.element as HTMLElement
    const originalTitle = el.getAttribute('title') || ''

    // happy-dom 下 VTU 的 trigger('mouseover') 不冒泡，这里手动派发冒泡事件
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    await wait(420)
    await nextTick()
    await flushPromises()
    const tip = document.querySelector('.rte-tip') as HTMLElement | null
    expect(tip).toBeTruthy()
    expect(tip?.textContent?.trim()).toBe(originalTitle)
    // 原生 title 已被临时摘除，避免与自定义气泡重复
    expect(el.hasAttribute('title')).toBe(false)

    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }))
    await wait(150)
    await nextTick()
    await flushPromises()
    expect(document.querySelector('.rte-tip')).toBeFalsy()
    // 原生 title 不还原：浏览器气泡不会在移开按钮后继续挡住颜色面板
    expect(el.hasAttribute('title')).toBe(false)
    // 提示文本转存到 data-tip，自定义气泡下次仍能取到
    expect(el.getAttribute('data-tip')).toBe(originalTitle)
    wrapper.unmount()
  })
})
