// @vitest-environment happy-dom
/**
 * Ribbon 图标统一规范（回归门禁）：
 * - 功能区里每个命令都必须是 SVG 线稿，不能再出现「汉字 / Emoji」当图标；
 * - 所有线稿统一 stroke-width 1.7 + round 端点（与 Telegram 图标语言一致）；
 * - 图标槽位保持 32×32（不改变现有图标大小）。
 */
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import RichTextEditor from '../RichTextEditor.vue'
import { useDocumentStore } from '../../stores/document'
import type { CanvasDocumentJSON } from '../../types/canvas'
import { chartGroupIcon } from '../rteToolbarIcons'

async function mountRibbon() {
  localStorage.removeItem('rte.toolbar.style')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDocumentStore()
  store.current_data = {
    schemaVersion: 1,
    templateId: 'y-model',
    title: '图标',
  } as unknown as CanvasDocumentJSON
  const wrapper = mount(RichTextEditor, {
    props: { modelValue: '<p>甲</p>', panelId: 'panel-icons', expanded: true },
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

describe('Ribbon 图标统一规范', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('9 个图表一级分类都有单色线稿图标', () => {
    for (const id of ['basic', 'stats', 'relation', 'hierarchy', 'geo', 'finance', 'coordinate', 'component', 'gl']) {
      expect(chartGroupIcon(id)).toBeTruthy()
    }
    // 未知 id 兜底，不抛错
    expect(chartGroupIcon('not-exist')).toBeTruthy()
  })

  it('功能区命令图标全是 SVG 线稿，且描边统一 1.7 / round', async () => {
    const wrapper = await mountRibbon()
    const tabs = wrapper.findAll('.rte-ribbon-tab')
    expect(tabs.length).toBeGreaterThan(10)
    let checked = 0
    for (const tab of tabs) {
      await tab.trigger('click')
      await nextTick()
      await flushPromises()
      for (const tool of wrapper.findAll('.rte-toolbar-tools .rte-tool')) {
        const icon = tool.find('.rte-tool-icon')
        if (!icon.exists()) continue
        const svg = icon.find('svg')
        expect(svg.exists(), `命令 ${tool.text().trim()} 的图标不是 SVG`).toBe(true)
        expect(svg.attributes('stroke-width')).toBe('1.7')
        expect(svg.attributes('stroke-linecap')).toBe('round')
        expect(svg.attributes('fill')).toBe('none')
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(100)
    wrapper.unmount()
  })
})
