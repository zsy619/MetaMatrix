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
import { isThreeRingBasicsDoc } from '../../types/canvas'
import type {
  ThreeRingBasicsDocumentJSON,
  ThreeRingBasicsRegionId,
} from '../../types/canvas'

const REGION_IDS: ThreeRingBasicsRegionId[] = [
  'ring_practical',
  'ring_trainable',
  'ring_value',
  'hex_concreteness',
  'hex_scenario',
  'hex_independence',
  'hex_verifiability',
  'hex_compounding',
  'hex_repeatability',
  'overlap_value_low',
  'overlap_not_trainable',
  'overlap_too_vague',
  'core',
]

describe('模板注册 · 苦练基本功三环分析法', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('模板库里能查到该模板（元信息 + 可创建）', () => {
    expect(isTemplateId('three-ring-basics')).toBe(true)
    const meta = TEMPLATE_META['three-ring-basics']
    expect(meta).toBeTruthy()
    expect(meta.name).toBe('苦练基本功三环分析法')
    expect(meta.category).toBe('method')
    expect(meta.description.length).toBeGreaterThan(0)
  })

  it('cloneTemplate 产出 three_ring_basics 文档', () => {
    const doc = cloneTemplate('three-ring-basics')
    expect(isThreeRingBasicsDoc(doc)).toBe(true)
    expect(doc.type).toBe('three_ring_basics')
    expect(doc.schemaVersion).toBe(1)
  })

  it('默认数据结构完整：三环 + 六顶点 + 三交叠 + 中心，共 13 个区域', () => {
    const doc = cloneTemplate(
      'three-ring-basics',
    ) as unknown as ThreeRingBasicsDocumentJSON

    expect(Object.keys(doc.regions).sort()).toEqual([...REGION_IDS].sort())
    expect(doc.regions.ring_practical.title).toBe('足够务实')
    expect(doc.regions.ring_trainable.title).toBe('足够可练')
    expect(doc.regions.ring_value.title).toBe('足够价值')
    expect(doc.regions.core.title).toBe('关键基本功')
    expect(doc.regions.overlap_value_low.title).toBe('价值低')
    expect(doc.regions.overlap_not_trainable.title).toBe('不可练')
    expect(doc.regions.overlap_too_vague.title).toBe('太虚了')

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

describe('编辑写回 · 苦练基本功三环分析法', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('区域内容写回文档 JSON（update / add / remove）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('three-ring-basics')

    const doc = store.current_data as unknown as ThreeRingBasicsDocumentJSON
    const core = doc.blocks.find((b) => b.id === 'core')!
    const itemId = core.items[0]!.id

    expect(store.updateBlockItem('core', itemId, { text: '把事做扎实' })).toBe(
      true,
    )
    expect(
      doc.blocks.find((b) => b.id === 'core')!.items[0]!.text,
    ).toBe('把事做扎实')

    store.addBlockItem('core', { text: '每天复盘' })
    expect(
      doc.blocks.find((b) => b.id === 'core')!.items,
    ).toHaveLength(2)

    const added = doc.blocks.find((b) => b.id === 'core')!.items[1]!
    expect(store.removeBlockItem('core', added.id)).toBe(true)
    expect(
      doc.blocks.find((b) => b.id === 'core')!.items,
    ).toHaveLength(1)
  })

  it('保存后重新打开内容仍在（JSON 往返 + 重新载入文档）', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('three-ring-basics')
    const doc = store.current_data as unknown as ThreeRingBasicsDocumentJSON
    const itemId = doc.blocks.find((b) => b.id === 'ring_practical')!.items[0]!
      .id
    store.updateBlockItem('ring_practical', itemId, { text: '贴地干活' })

    // 落库：序列化 → 反序列化（与服务端保存的形态一致）
    const saved = JSON.parse(
      JSON.stringify(store.current_data),
    ) as ThreeRingBasicsDocumentJSON

    // 重新打开
    const store2 = useDocumentStore()
    store2.setCurrentData(saved)
    const reopened = store2.current_data as unknown as ThreeRingBasicsDocumentJSON
    expect(
      reopened.blocks.find((b) => b.id === 'ring_practical')!.items[0]!.text,
    ).toBe('贴地干活')
  })

  it('ensureThreeRingBasicsBlocks 会补齐缺失的区域块', () => {
    const store = useDocumentStore()
    store.loadFromTemplate('three-ring-basics')
    const doc = store.current_data as unknown as ThreeRingBasicsDocumentJSON
    doc.blocks = doc.blocks.filter((b) => b.id !== 'core')

    expect(store.ensureThreeRingBasicsBlocks()).toBe(true)
    expect(doc.blocks).toHaveLength(REGION_IDS.length)
    expect(doc.blocks.find((b) => b.id === 'core')).toBeTruthy()
  })
})
