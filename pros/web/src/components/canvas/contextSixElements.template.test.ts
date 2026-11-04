// @vitest-environment happy-dom
/**
 * 画布模板「上下文六要素」回归：
 * - 模板库可创建（注册 + 元信息 + 默认结构）；
 * - 新建即带出六段（二级标题 + 一行占位文字），与富文本文档模板文案一致；
 * - 富文本里改内容会写回文档 JSON（通用 block store 通道），保存重开仍在。
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

import {
  cloneTemplate,
  isTemplateId,
  TEMPLATE_META,
  useDocumentStore,
} from '../../stores/document'
import { isContextSixElementsDoc } from '../../types/canvas'
import type { ContextSixElementsDocumentJSON } from '../../types/canvas'
import { RTE_DOC_TEMPLATES } from '../rteDocTemplates'
import { CONTEXT_SIX_ELEMENTS_SECTIONS } from '../../utils/contextSixElements'
import ContextSixElementsCanvas from './ContextSixElementsCanvas.vue'

const TITLES = CONTEXT_SIX_ELEMENTS_SECTIONS.map((s) => s.title)
const PLACEHOLDERS = CONTEXT_SIX_ELEMENTS_SECTIONS.map((s) => s.placeholder)

describe('模板注册 · 上下文六要素', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('模板库里能查到该模板（元信息 + 可创建）', () => {
    expect(isTemplateId('context-six-elements')).toBe(true)
    const meta = TEMPLATE_META['context-six-elements']
    expect(meta).toBeTruthy()
    expect(meta.name).toBe('上下文六要素')
    expect(meta.description.length).toBeGreaterThan(0)
  })

  it('cloneTemplate 产出 context_six_elements 文档', () => {
    const doc = cloneTemplate('context-six-elements')
    expect(isContextSixElementsDoc(doc)).toBe(true)
    expect(doc.type).toBe('context_six_elements')
    expect(doc.schemaVersion).toBe(1)
  })

  it('默认内容带出六段（二级标题 + 一行占位文字）', () => {
    const doc = cloneTemplate(
      'context-six-elements',
    ) as unknown as ContextSixElementsDocumentJSON

    const block = doc.blocks[0]!
    expect(block.id).toBe('context')
    // 6 段 × （二级标题 + 占位行）= 12 条
    expect(block.items).toHaveLength(TITLES.length * 2)

    const headings = block.items
      .map((it) => it.text)
      .filter((t) => t.startsWith('<h2>'))
    const bodies = block.items
      .map((it) => it.text)
      .filter((t) => t.startsWith('<p>'))

    expect(headings).toEqual(TITLES.map((t) => `<h2>${t}</h2>`))
    expect(bodies).toEqual(PLACEHOLDERS.map((t) => `<p>${t}</p>`))
  })

  it('富文本文档模板「上下文六要素」与画布模板文案一致', () => {
    const tpl = RTE_DOC_TEMPLATES.find((t) => t.id === 'context-six-elements')
    expect(tpl).toBeTruthy()
    expect(tpl!.label).toBe('上下文六要素')

    const nodes = tpl!.build()
    const headings = nodes.filter((n) => n.type === 'heading')
    const paragraphs = nodes.filter((n) => n.type === 'paragraph')
    expect(headings).toHaveLength(TITLES.length)
    expect(paragraphs).toHaveLength(PLACEHOLDERS.length)

    const headingText = headings.map((n) => n.content?.[0]?.text ?? '')
    expect(headingText).toEqual(TITLES)
    headings.forEach((n) => expect(n.attrs?.level).toBe(2))

    const paragraphText = paragraphs.map((n) => n.content?.[0]?.text ?? '')
    expect(paragraphText).toEqual(PLACEHOLDERS)
  })
})

describe('编辑写回 · 上下文六要素', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('正文内容写回文档 JSON（update / add / remove）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('context-six-elements')
    const doc = store.current_data as unknown as ContextSixElementsDocumentJSON
    const block = doc.blocks[0]!
    const initialCount = block.items.length
    const itemId = block.items[0]!.id

    expect(store.updateBlockItem('context', itemId, { text: '<h2>任务目标</h2>' })).toBe(
      true,
    )
    expect(doc.blocks[0]!.items[0]!.text).toBe('<h2>任务目标</h2>')

    store.addBlockItem('context', { text: '<p>补充说明</p>' })
    expect(doc.blocks[0]!.items).toHaveLength(initialCount + 1)

    const added = doc.blocks[0]!.items[doc.blocks[0]!.items.length - 1]!
    expect(store.removeBlockItem('context', added.id)).toBe(true)
    expect(doc.blocks[0]!.items).toHaveLength(initialCount)
  })

  it('保存后重新打开内容仍在（JSON 往返 + 重新载入文档）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('context-six-elements')
    const doc = store.current_data as unknown as ContextSixElementsDocumentJSON
    const itemId = doc.blocks[0]!.items[1]!.id
    store.updateBlockItem('context', itemId, {
      text: '<p>把季度目标写清楚</p>',
    })

    const saved = JSON.parse(
      JSON.stringify(store.current_data),
    ) as ContextSixElementsDocumentJSON

    const store2 = useDocumentStore()
    store2.setCurrentData(saved)
    const reopened = store2.current_data as unknown as ContextSixElementsDocumentJSON
    expect(reopened.blocks[0]!.items[1]!.text).toBe('<p>把季度目标写清楚</p>')
  })

  it('ensureContextSixElementsBlocks 会补齐缺失的正文块', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('context-six-elements')
    const doc = store.current_data as unknown as ContextSixElementsDocumentJSON
    doc.blocks = []

    expect(store.ensureContextSixElementsBlocks()).toBe(true)
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]!.id).toBe('context')
    expect(doc.blocks[0]!.items).toHaveLength(TITLES.length * 2)
  })
})

describe('画布组件 · 上下文六要素', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('渲染出六段标题与占位文字', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('context-six-elements')
    const wrapper = mount(ContextSixElementsCanvas, {
      props: { doc: store.current_data as never },
    })

    const text = wrapper.text()
    for (const title of TITLES) {
      expect(text, `缺少标题 ${title}`).toContain(title)
    }
    for (const placeholder of PLACEHOLDERS) {
      expect(text, `缺少占位 ${placeholder}`).toContain(placeholder)
    }
  })

  it('编辑器里改内容后写回文档 JSON', async () => {
    const store = useDocumentStore()
    store.loadFromTemplate('context-six-elements')
    const wrapper = mount(ContextSixElementsCanvas, {
      props: { doc: store.current_data as never },
    })

    const stub = wrapper.findComponent({ name: 'RichTextEditor' })
    expect(stub.exists()).toBe(true)
    await stub.vm.$emit('update:modelValue', '<h2>任务目标</h2><p>三周内上线</p>')
    await wrapper.vm.$nextTick()

    const doc = store.current_data as unknown as ContextSixElementsDocumentJSON
    const texts = doc.blocks[0]!.items.map((it) => it.text)
    expect(texts).toContain('<p>三周内上线</p>')
  })
})
