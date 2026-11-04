// @vitest-environment happy-dom
/**
 * 画布里嵌入的紧凑区块不走 A4 纸张模式：
 * - 嵌入态（pageSheet=false）不套 is-page-sheet，正文按内容流式排版；
 * - 独立/最大化态仍是 A4 + 窄边距 1.27cm；
 * - 嵌入态不把页面大小/页边距写回文档。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useRtePageLayout } from './composables/useRtePageLayout'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'

const FIXTURE = '<p>第一段</p><p>第二段</p>'

async function mountEditor(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: 'fixture',
  } as unknown as CanvasDocumentJSON
  store.dirty = false
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: FIXTURE, panelId: 'panel-a', ...props },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const started = Date.now()
  while (!wrapper.find('.ProseMirror').exists()) {
    await flushPromises()
    await nextTick()
    if (Date.now() - started > 20000) break
  }
  return { wrapper, store }
}

describe('嵌入式区块的纸张模式', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('嵌入态不套 is-page-sheet，但仍保留文档里的 A4 页面设置', async () => {
    const { wrapper, store } = await mountEditor({ compact: true, expanded: false, pageSheet: false })
    expect(wrapper.classes()).not.toContain('is-page-sheet')
    // 页面设置只是不再按纸张渲染，值本身没有被改写。
    expect(wrapper.attributes('data-page-size')).toBe('a4')
    expect(store.current_data?.pageSizeByPanelId).toBeUndefined()
    expect(store.current_data?.pageMarginByPanelId).toBeUndefined()
    wrapper.unmount()
  })

  it('独立/最大化态仍是 A4 纸张，页边距缺省窄（1.27cm）', async () => {
    const { wrapper, store } = await mountEditor({ compact: false, expanded: true })
    expect(wrapper.classes()).toContain('is-page-sheet')
    expect(wrapper.attributes('data-page-size')).toBe('a4')
    expect(wrapper.attributes('data-margin')).toBe('narrow')
    const style = wrapper.attributes('style') || ''
    expect(style).toContain('--rte-margin-left: 12.7mm')
    expect(style).toContain('--rte-margin-top: 12.7mm')
    expect(store.current_data?.pageSizeByPanelId).toBeUndefined()
    wrapper.unmount()
  })

  it('嵌入式区块的底部栏不再出现页面大小/页边距控件', async () => {
    const embedded = await mountEditor({ compact: true, expanded: false, pageSheet: false })
    expect(embedded.wrapper.find('select[aria-label="页面大小"]').exists()).toBe(false)
    expect(embedded.wrapper.find('select[aria-label="页边距"]').exists()).toBe(false)
    embedded.wrapper.unmount()

    const paper = await mountEditor({ compact: false, expanded: true })
    expect(paper.wrapper.find('select[aria-label="页面大小"]').exists()).toBe(true)
    expect(paper.wrapper.find('select[aria-label="页边距"]').exists()).toBe(true)
    paper.wrapper.unmount()
  })
})

describe('useRtePageLayout 的嵌入态保护', () => {
  function layout(pageSheet: boolean) {
    const setPanelPageSize = vi.fn()
    const setPanelPageMargin = vi.fn()
    const announce = vi.fn()
    const api = useRtePageLayout({
      panelId: () => 'panel-a',
      pageSizeMap: () => undefined,
      pageMarginMap: () => undefined,
      setPanelPageSize,
      setPanelPageMargin,
      viewMode: () => 'edit',
      closePageMenus: () => {},
      announce,
      disarmToolbarUndo: () => {},
      toolbarUndoIsNewer: () => false,
      pageSheet: () => pageSheet,
    })
    return { api, setPanelPageSize, setPanelPageMargin, announce }
  }

  it('嵌入态改页面大小/页边距都不写回文档', () => {
    const { api, setPanelPageSize, setPanelPageMargin, announce } = layout(false)
    api.setPageSize('full')
    api.setMarginPreset('wide')
    expect(setPanelPageSize).not.toHaveBeenCalled()
    expect(setPanelPageMargin).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalled()
    expect(api.renderPaper.value).toBe(false)
    expect(api.pageSheetEnabled.value).toBe(false)
  })

  it('纸张态仍然写回页面大小与页边距', () => {
    const { api, setPanelPageSize, setPanelPageMargin } = layout(true)
    api.setPageSize('full')
    api.setMarginPreset('wide')
    expect(setPanelPageSize).toHaveBeenCalledWith('panel-a', 'full')
    expect(setPanelPageMargin).toHaveBeenCalled()
    expect(api.renderPaper.value).toBe(true)
  })
})
