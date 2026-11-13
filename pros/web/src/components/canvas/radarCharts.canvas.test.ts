// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore, type TemplateId } from '../../stores/document'
import { useSelectionStore } from '../../stores/selection'
import type { DemandTriangleDocumentJSON } from '../../types/canvas'
import AiBoundaryCanvas from './AiBoundaryCanvas.vue'
import DemandTriangleCanvas from './DemandTriangleCanvas.vue'
import PmCompetencyCanvas from './PmCompetencyCanvas.vue'
import PmSensitivity6dCanvas from './PmSensitivity6dCanvas.vue'
import PmSolutionTriangleCanvas from './PmSolutionTriangleCanvas.vue'
import ProductFeatures5dCanvas from './ProductFeatures5dCanvas.vue'
import SceneThreeHighCanvas from './SceneThreeHighCanvas.vue'

const here = dirname(fileURLToPath(import.meta.url))

const quietStubs = {
  RichTextEditor: true,
  RichTextItem: true,
  YModelBlock: true,
  PanelAttachments: true,
}

function mountTemplate(id: TemplateId, component: ReturnType<typeof defineComponent>) {
  const store = useDocumentStore()
  store.loadFromTemplate(id)
  return mount(component, {
    props: { doc: store.current_data },
    global: { stubs: quietStubs },
  })
}

function flowLines(wrapper: VueWrapper) {
  return wrapper.findAll('.radar-flow-line')
}

function tickText(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.radar-scale-tick, .tick').map((node) => node.text())
}

describe('雷达图流动描边与刻度', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('别用 AI 与三高：选中业务描边更粗更快，刻度是 20/40/60/80', () => {
    for (const [id, component] of [
      ['ai-boundary', AiBoundaryCanvas],
      ['scene-three-high', SceneThreeHighCanvas],
    ] as const) {
      const wrapper = mountTemplate(id, component)
      const lines = flowLines(wrapper)
      expect(lines.length).toBeGreaterThan(1)
      const selected = lines.filter((line) => line.classes('is-selected'))
      expect(selected).toHaveLength(1)
      expect(selected[0].attributes('stroke-width')).toBe('3.2')
      expect(lines[lines.length - 1].classes('is-selected')).toBe(true)
      expect(lines.every((line) => line.attributes('fill') === 'none')).toBe(true)
      expect(lines.every((line) => line.attributes('pointer-events') === 'none')).toBe(true)
      expect(tickText(wrapper)).toEqual(['20', '40', '60', '80'])
      wrapper.unmount()
    }
  })

  it('单系列雷达画出流动轮廓，并标出内圈分值', () => {
    const cases = [
      { id: 'pm-sensitivity-6d' as const, component: PmSensitivity6dCanvas, ticks: ['25', '50', '75'] },
      { id: 'pm-competency' as const, component: PmCompetencyCanvas, ticks: ['25', '50', '75'] },
      { id: 'pm-solution-triangle' as const, component: PmSolutionTriangleCanvas, ticks: ['25', '50', '75'] },
      { id: 'product-features-5d' as const, component: ProductFeatures5dCanvas, ticks: ['20', '40', '60', '80'] },
    ]
    for (const item of cases) {
      const wrapper = mountTemplate(item.id, item.component)
      const lines = flowLines(wrapper)
      expect(lines).toHaveLength(1)
      expect(lines[0].classes('is-selected')).toBe(true)
      expect(lines[0].attributes('fill')).toBe('none')
      expect(lines[0].attributes('pointer-events')).toBe('none')
      expect(tickText(wrapper)).toEqual(item.ticks)
      wrapper.unmount()
    }
  })

  it('需求三角：每个方向一条流动边，选中的方向画在最上层', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('demand-triangle')
    const doc = store.current_data as DemandTriangleDocumentJSON
    const legend = doc.blocks.find((block) => block.id === 'legend')
    const firstId = legend && legend.id === 'legend' ? legend.items[0]?.id : ''
    expect(firstId).toBeTruthy()
    const wrapper = mount(DemandTriangleCanvas, {
      props: { doc },
      global: { stubs: quietStubs },
    })
    expect(tickText(wrapper)).toEqual(['75', '50', '25'])
    const before = flowLines(wrapper)
    expect(before.length).toBeGreaterThan(1)
    expect(before.some((line) => line.classes('is-selected'))).toBe(false)

    useSelectionStore().selectBlockItem('legend', firstId)
    await wrapper.vm.$nextTick()
    const after = flowLines(wrapper)
    const selected = after.filter((line) => line.classes('is-selected'))
    expect(selected).toHaveLength(1)
    expect(after[after.length - 1].classes('is-selected')).toBe(true)
    expect(selected[0].attributes('stroke-width')).toBe('3')
    wrapper.unmount()
  })

  it('减弱动效时流动描边停住并改回实线', () => {
    const css = readFileSync(resolve(here, '../../styles/radar-flow.css'), 'utf8')
    expect(css).toContain('stroke-dashoffset: -168')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toMatch(/\.radar-flow-line\s*\{[^}]*animation:\s*none !important/s)
    expect(css).toMatch(/\.radar-flow-line\s*\{[^}]*stroke-dasharray:\s*none/s)
  })
})
