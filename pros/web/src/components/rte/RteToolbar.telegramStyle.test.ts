// @vitest-environment happy-dom
/**
 * Telegram 风格工具栏自测：
 * - 功能区（最大化）保留 Ribbon 栏目菜单，只切换呈现风格；
 * - 紧凑态同样可切换；
 * - Telegram 风格下分组拖拽手柄仍可见；
 * - 「更多」面板里有「工具栏设置」入口，可打开分组按钮的显隐 / 顺序面板。
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
    title: '切换',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>甲</p>', panelId: 'panel-tg', expanded },
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

describe('Telegram 风格工具栏', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('最大化（功能区）里保留 Ribbon 菜单，只切换 Telegram 风格', async () => {
    const wrapper = await mountEditor(true)
    expect(wrapper.find('.rte-ribbon-bar').exists()).toBe(true)
    const toggle = wrapper.find('.rte-toolbar-style-toggle')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    await nextTick()
    // 仍然是功能区 Ribbon，只是换成 Telegram 风格
    expect(wrapper.find('.is-tg-style').exists()).toBe(true)
    expect(wrapper.find('.rte-ribbon-bar').exists()).toBe(true)
    expect(wrapper.findAll('.rte-ribbon-tab').length).toBeGreaterThan(10)
    expect(localStorage.getItem('rte.toolbar.style')).toBe('tg')
    // 再点一次回到标准样式
    await wrapper.find('.rte-toolbar-style-toggle').trigger('click')
    await nextTick()
    expect(localStorage.getItem('rte.toolbar.style')).toBe('ribbon')
    expect(wrapper.find('.is-tg-style').exists()).toBe(false)
    expect(wrapper.find('.rte-ribbon-bar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('紧凑态下也能切换，且切过去后仍是紧凑条', async () => {
    const wrapper = await mountEditor(false)
    const toggle = wrapper.find('.rte-tg-switch-btn')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    await nextTick()
    expect(wrapper.find('.is-tg-style').exists()).toBe(true)
    expect(wrapper.find('.rte-ribbon-bar').exists()).toBe(false)
    expect(localStorage.getItem('rte.toolbar.style')).toBe('tg')
    wrapper.unmount()
  })

  it('Telegram 风格下分组拖拽手柄仍然可见', async () => {
    const wrapper = await mountEditor(false)
    await wrapper.find('.rte-tg-switch-btn').trigger('click')
    await nextTick()
    const handles = wrapper.findAll('.rte-toolbar-tools .rte-group-handle')
    expect(handles.length).toBeGreaterThan(0)
    // 手柄带着拖拽语义（aria-label 指向分组名）
    expect(handles[0].attributes('aria-label')).toContain('拖动')
    wrapper.unmount()
  })

  it('「更多」面板里有工具栏设置入口，可打开分组个性化', async () => {
    const wrapper = await mountEditor(false)
    await wrapper.find('.rte-tg-switch-btn').trigger('click')
    await nextTick()
    await wrapper.find('.rte-more-wrap .rte-tool').trigger('click')
    await nextTick()
    // 「更多」浮层是 Teleport 到 body 的，wrapper.find 看不到，要从 document 找
    const entry = document.querySelector('.rte-more-settings-toggle') as HTMLElement | null
    expect(entry).toBeTruthy()
    expect(entry?.textContent || '').toContain('工具栏设置')
    entry?.click()
    await nextTick()
    const rows = document.querySelectorAll('.rte-more-settings-row')
    expect(rows.length).toBeGreaterThan(5)
    // 每组一个 ⚙：打开该组的按钮显隐 / 顺序面板
    const gear = rows[0].querySelector('.rte-more-settings-btn') as HTMLElement | null
    expect(gear).toBeTruthy()
    gear?.click()
    await nextTick()
    expect(document.querySelector('.rte-group-buttons-menu')).toBeTruthy()
    wrapper.unmount()
  })
})
