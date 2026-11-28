// @vitest-environment happy-dom
/**
 * 预置菜单类工具（注音 / 着重号 …）的悬停展开：
 * - 悬停「注音」按钮即可展开下拉面板（手动填写 / 自动注音），与「大小写」一致；
 * - 点击按钮只保证展开，不做开合切换（否则悬停已展开后再点击会把面板关掉）。
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
    title: '注音',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>甲</p>', panelId: 'panel-ruby', expanded },
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

describe('预置菜单悬停展开', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('悬停注音按钮展开「手动填写 / 自动注音」面板', async () => {
    const wrapper = await mountEditor(true)
    await flushPromises()
    // 注音在「字体与颜色」分组，先切到该 ribbon 页签
    const tab = wrapper.find('.rte-ribbon-tab[aria-label="字体与颜色"]')
    if (tab.exists()) await tab.trigger('click')
    await nextTick()
    const btn = wrapper.find('[data-rte-anchor="ruby"]')
    expect(btn.exists()).toBe(true)
    const wrap = btn.element.closest('.rte-tool-wrap') as HTMLElement
    expect(wrap).toBeTruthy()
    wrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await wait(260)
    await nextTick()
    const menu = document.querySelector('[data-rte-float-key="ruby"]')
    expect(menu).toBeTruthy()
    const labels = Array.from(menu!.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).toEqual(['手动填写', '自动注音'])
    wrapper.unmount()
  })

  it('展开后点击按钮不会把面板关掉', async () => {
    const wrapper = await mountEditor(true)
    await flushPromises()
    const tab = wrapper.find('.rte-ribbon-tab[aria-label="字体与颜色"]')
    if (tab.exists()) await tab.trigger('click')
    await nextTick()
    const btn = wrapper.find('[data-rte-anchor="ruby"]')
    const wrap = btn.element.closest('.rte-tool-wrap') as HTMLElement
    wrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await wait(260)
    await nextTick()
    expect(document.querySelector('[data-rte-float-key="ruby"]')).toBeTruthy()
    await wrapper.find('[data-rte-anchor="ruby"]').trigger('click')
    await nextTick()
    expect(document.querySelector('[data-rte-float-key="ruby"]')).toBeTruthy()
    wrapper.unmount()
  })
})
