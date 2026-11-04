// @vitest-environment happy-dom
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

import {
  cloneTemplate,
  isTemplateId,
  TEMPLATE_META,
  useDocumentStore,
} from '../../stores/document'
import { isLeadershipTriangleDoc } from '../../types/canvas'
import type {
  LeadershipTriangleDocumentJSON,
  LeadershipTriangleRegionId,
} from '../../types/canvas'

const REGION_IDS: LeadershipTriangleRegionId[] = [
  'top_exchange',
  'apex',
  'pyramid_1',
  'pyramid_2',
  'pyramid_3',
  'pyramid_4',
  'pyramid_5',
  'challenge',
  'stable',
  'difficulty',
  'management',
  'power',
]

describe('模板注册 · 领导核心价值驱动三角', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('模板库里能查到该模板（元信息 + 可创建）', () => {
    expect(isTemplateId('leadership-triangle')).toBe(true)
    const meta = TEMPLATE_META['leadership-triangle']
    expect(meta).toBeTruthy()
    expect(meta.name).toBe('领导核心价值驱动三角')
    expect(meta.category).toBe('org')
    expect(meta.description.length).toBeGreaterThan(0)
  })

  it('cloneTemplate 产出 leadership_triangle 文档', () => {
    const doc = cloneTemplate('leadership-triangle')
    expect(isLeadershipTriangleDoc(doc)).toBe(true)
    expect(doc.type).toBe('leadership_triangle')
    expect(doc.schemaVersion).toBe(1)
  })

  it('默认数据结构完整：顶部交换 + 顶点 + 5 层 + 右侧 + 管理/权力，共 12 个区域', () => {
    const doc = cloneTemplate(
      'leadership-triangle',
    ) as unknown as LeadershipTriangleDocumentJSON

    expect(Object.keys(doc.regions).sort()).toEqual([...REGION_IDS].sort())
    expect(doc.regions.top_exchange.title).toBe('心甘情愿')
    expect(doc.regions.apex.title).toContain('领导力')
    expect(doc.regions.pyramid_3.title).toBe('难题')
    expect(doc.regions.challenge.title).toBe('挑战现状')
    expect(doc.regions.stable.title).toBe('稳定运营')
    expect(doc.regions.difficulty.title).toBe('难度越大')
    expect(doc.regions.management.title).toContain('管理')
    expect(doc.regions.power.title).toContain('权力')

    expect(doc.blocks).toHaveLength(REGION_IDS.length)
    for (const id of REGION_IDS) {
      const block = doc.blocks.find((b) => b.id === id)
      expect(block, `缺少区域 ${id}`).toBeTruthy()
      expect(block!.title).toBe(doc.regions[id].title)
      expect(Array.isArray(block!.items)).toBe(true)
      expect(block!.items.length).toBeGreaterThan(0)
      expect(block!.items[0]!.text).toBe('')
    }
  })
})

describe('编辑写回 · 领导核心价值驱动三角', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('区域内容写回文档 JSON（update / add / remove）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('leadership-triangle')

    const doc = store.current_data as unknown as LeadershipTriangleDocumentJSON
    const layer = doc.blocks.find((b) => b.id === 'pyramid_3')!
    const itemId = layer.items[0]!.id

    expect(
      store.updateBlockItem('pyramid_3', itemId, { text: '跨部门协同难题' }),
    ).toBe(true)
    expect(
      doc.blocks.find((b) => b.id === 'pyramid_3')!.items[0]!.text,
    ).toBe('跨部门协同难题')

    store.addBlockItem('pyramid_3', { text: '需要一把手' })
    expect(
      doc.blocks.find((b) => b.id === 'pyramid_3')!.items,
    ).toHaveLength(2)

    const added = doc.blocks.find((b) => b.id === 'pyramid_3')!.items[1]!
    expect(store.removeBlockItem('pyramid_3', added.id)).toBe(true)
    expect(
      doc.blocks.find((b) => b.id === 'pyramid_3')!.items,
    ).toHaveLength(1)
  })

  it('保存后重新打开内容仍在（JSON 往返 + 重新载入文档）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('leadership-triangle')
    const doc = store.current_data as unknown as LeadershipTriangleDocumentJSON
    const itemId = doc.blocks.find((b) => b.id === 'difficulty')!.items[0]!.id
    store.updateBlockItem('difficulty', itemId, { text: '目标越高' })

    const saved = JSON.parse(
      JSON.stringify(store.current_data),
    ) as LeadershipTriangleDocumentJSON

    const store2 = useDocumentStore()
    store2.setCurrentData(saved)
    const reopened = store2.current_data as unknown as LeadershipTriangleDocumentJSON
    expect(
      reopened.blocks.find((b) => b.id === 'difficulty')!.items[0]!.text,
    ).toBe('目标越高')
  })

  it('ensureLeadershipTriangleBlocks 会补齐缺失的区域块', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('leadership-triangle')
    const doc = store.current_data as unknown as LeadershipTriangleDocumentJSON
    doc.blocks = doc.blocks.filter((b) => b.id !== 'power')

    expect(store.ensureLeadershipTriangleBlocks()).toBe(true)
    expect(doc.blocks).toHaveLength(REGION_IDS.length)
    expect(doc.blocks.find((b) => b.id === 'power')).toBeTruthy()
  })
})
