// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>()
  return { ...actual, cloneDocument: vi.fn(), listDocuments: vi.fn() }
})

import { useDocumentStore } from '../../stores/document'
import AbcModelCanvas from './AbcModelCanvas.vue'
import type { AbcModelDocumentJSON } from '../../types/canvas'

const STUBS = {
  RichTextEditor: true,
  RichTextItem: true,
  PanelAttachments: true,
}

function mountAbc() {
  const store = useDocumentStore()
  store.loadFromTemplate('abc-model')
  const wrapper = mount(AbcModelCanvas, {
    props: { doc: store.current_data as AbcModelDocumentJSON },
    global: { stubs: STUBS },
  })
  return { store, wrapper }
}

describe('业务公式ABC模型', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('三个顶点、要点清单与图例都画在图上', () => {
    const { wrapper } = mountAbc()
    const text = wrapper.text()

    for (const label of ['A. 目标', 'Ambition', 'B. 参数', 'Basis', 'C. 逻辑关系', 'Connection']) {
      expect(text, `缺少顶点标题 ${label}`).toContain(label)
    }
    for (const hint of [
      '梳理业务',
      '挑战目标',
      '拆子目标',
      '关键财务指标',
      '关键行为动作',
      '关键运营节点',
      '关键业务要素',
      '相关/因果关系',
      '分支/关键路径',
      '弱关系-强公式',
    ]) {
      expect(text, `缺少要点 ${hint}`).toContain(hint)
    }
    expect(text).toContain('借鉴公式(实事求是)')
    expect(text).toContain('创新公式(解放思想)')
    expect(wrapper.findAll('.abc-vertex')).toHaveLength(3)
    wrapper.unmount()
  })

  it('点顶点打开该层的全屏编辑', async () => {
    const { wrapper } = mountAbc()

    await wrapper.get('.abc-vertex--basis').trigger('click')
    await wrapper.vm.$nextTick()

    const overlay = document.body.querySelector('.pm-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay?.getAttribute('aria-label')).toBe('B. 参数')
    wrapper.unmount()
  })

  it('公式构建器把 B 层参数写进文档，并存成 C 层条目', async () => {
    const { store, wrapper } = mountAbc()
    const doc = store.current_data as AbcModelDocumentJSON
    doc.blocks.find((b) => b.id === 'basis')!.items = [
      { id: 'b1', text: '流量' },
      { id: 'b2', text: '客单价' },
    ]
    await wrapper.vm.$nextTick()

    await wrapper.get('.abc-param-tag').trigger('click')
    await wrapper.get('.abc-formula-btn[aria-label="添加乘号"]').trigger('click')
    await wrapper.findAll('.abc-param-tag')[1]!.trigger('click')
    expect(doc.formula).toBe('流量 × 客单价')

    await wrapper.get('.abc-formula-btn--save').trigger('click')
    const conn = doc.blocks.find((b) => b.id === 'connection')!
    expect(conn.items.map((i) => i.text)).toContain('公式: 流量 × 客单价')
    expect(doc.formula).toBe('')
    wrapper.unmount()
  })

  it('括号没配平时不允许把公式存进 C 层', async () => {
    const { store, wrapper } = mountAbc()
    const doc = store.current_data as AbcModelDocumentJSON

    await wrapper.get('.abc-formula-btn[aria-label="添加左括号"]').trigger('click')
    expect(wrapper.find('.abc-formula-warn').exists()).toBe(true)
    expect(wrapper.get('.abc-formula-btn--save').attributes('disabled')).toBeDefined()

    await wrapper.get('.abc-formula-btn[aria-label="添加右括号"]').trigger('click')
    expect(wrapper.find('.abc-formula-warn').exists()).toBe(false)
    expect(doc.formula).toBe('( )')
    wrapper.unmount()
  })

  it('借鉴公式区列出十大经典范式，点一条写进 C 层', async () => {
    const { store, wrapper } = mountAbc()
    const doc = store.current_data as AbcModelDocumentJSON

    const chips = wrapper.findAll('.abc-classic-chip')
    expect(chips).toHaveLength(10)
    expect(wrapper.findAll('.abc-classic-group')).toHaveLength(3)
    expect(wrapper.text()).toContain('流量变现型')

    await chips[0]!.trigger('click')
    const conn = doc.blocks.find((b) => b.id === 'connection')!
    expect(conn.items).toHaveLength(1)
    // 公式里的 * 换成画布统一的 ×
    expect(conn.items[0]!.text).toBe('公式: 流量变现型 = 流量 × 转化率 × 客单价 × 复购率')
    wrapper.unmount()
  })

  it('两个三角区都是可点的入口', () => {
    const { wrapper } = mountAbc()
    const zones = wrapper.findAll('.abc-zone')
    expect(zones).toHaveLength(2)
    expect(zones[0]!.attributes('role')).toBe('button')
    expect(zones[0]!.attributes('aria-label')).toContain('公式构建器')
    expect(zones[1]!.attributes('aria-label')).toContain('十大经典范式')
    wrapper.unmount()
  })
})
