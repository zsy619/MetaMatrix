import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ApiError } from '../api/http'
import * as documentsApi from '../api/documents'
import { getToken } from '../api/http'
import type {
  BlockCanvasDocumentJSON,
  CanvasDocumentJSON,
  DualTriangleBlockId,
  DualTriangleDocumentJSON,
  QuadrantDocumentJSON,
  QuadrantItem,
  QuadrantItemStyle,
  QuadrantPosition,
  YModelDocumentJSON,
  DeliberatePracticeDocumentJSON,
  DemandTriangleDocumentJSON,
  DemandTriangleDirection,
  DemandTriangleScores,
  FiveStepDocumentJSON,
  AiTradeoffDocumentJSON,
  ProductContentDocumentJSON,
  OscarDocumentJSON,
  IndustryAnalysisDocumentJSON,
  KeyResistanceDocumentJSON,
  KeyResistanceCellKey,
  KeyResistanceRow,
  ConversionTradeoffDocumentJSON,
  ConversionTradeoffCellKey,
  ConversionTradeoffRow,
  IndustryForecastDocumentJSON,
  ScientificMeetingDocumentJSON,
  IpoDocumentJSON,
  IncidentReviewDocumentJSON,
  IncidentReviewTimelineRow,
  AnnualSummaryDocumentJSON,
  DeepReviewDocumentJSON,
  PanelAttachment,
  AttachmentsByPanelId,
} from '../types/canvas'
import {
  isAiTradeoffDoc,
  isBlockCanvasDoc,
  isDeliberatePracticeDoc,
  isDemandTriangleDoc,
  isDualTriangleDoc,
  isFiveStepDoc,
  isIndustryAnalysisDoc,
  isIndustryForecastDoc,
  isKeyResistanceDoc,
  isConversionTradeoffDoc,
  isOscarDoc,
  isProductContentDoc,
  isQuadrantDoc,
  isScientificMeetingDoc,
  isYModelDoc,
  isIncidentReviewDoc,
  isAnnualSummaryDoc,
  isDeepReviewDoc,
  normalizeYModelDoc,
} from '../types/canvas'
import dualTriangleTemplate from '../templates/dual-triangle-v1.json'
import starQuadrantTemplate from '../templates/star-quadrant-v1.json'
import yModelTemplate from '../templates/y-model-v1.json'
import deliberatePracticeTemplate from '../templates/deliberate-practice-v1.json'
import demandTriangleTemplate from '../templates/demand-triangle-v1.json'
import fiveStepTemplate from '../templates/five-step-v1.json'
import aiTradeoffTemplate from '../templates/ai-tradeoff-v1.json'
import productContentTemplate from '../templates/product-content-v1.json'
import oscarTemplate from '../templates/oscar-v1.json'
import industryAnalysisTemplate from '../templates/industry-analysis-v1.json'
import keyResistanceTemplate from '../templates/key-resistance-v1.json'
import conversionTradeoffTemplate from '../templates/conversion-tradeoff-v1.json'
import industryForecastTemplate from '../templates/industry-forecast-v1.json'
import scientificMeetingTemplate from '../templates/scientific-meeting-v1.json'
import ipoTemplate from '../templates/ipo-v1.json'
import incidentReviewTemplate from '../templates/incident-review-v1.json'
import annualSummaryTemplate from '../templates/annual-summary-v1.json'
import deepReviewTemplate from '../templates/deep-review-v1.json'

export type TemplateId =
  | 'dual-triangle'
  | 'star-quadrant'
  | 'y-model'
  | 'deliberate-practice'
  | 'demand-triangle'
  | 'five-step'
  | 'ai-tradeoff'
  | 'product-content'
  | 'oscar'
  | 'industry-analysis'
  | 'key-resistance'
  | 'conversion-tradeoff'
  | 'industry-forecast'
  | 'scientific-meeting'
  | 'ipo'
  | 'incident-review'
  | 'annual-summary'
  | 'deep-review'

const TEMPLATES: Record<TemplateId, CanvasDocumentJSON> = {
  'dual-triangle': dualTriangleTemplate as DualTriangleDocumentJSON,
  'star-quadrant': starQuadrantTemplate as QuadrantDocumentJSON,
  'y-model': yModelTemplate as YModelDocumentJSON,
  'deliberate-practice':
    deliberatePracticeTemplate as DeliberatePracticeDocumentJSON,
  'demand-triangle': demandTriangleTemplate as DemandTriangleDocumentJSON,
  'five-step': fiveStepTemplate as FiveStepDocumentJSON,
  'ai-tradeoff': aiTradeoffTemplate as AiTradeoffDocumentJSON,
  'product-content': productContentTemplate as ProductContentDocumentJSON,
  oscar: oscarTemplate as OscarDocumentJSON,
  'industry-analysis': industryAnalysisTemplate as IndustryAnalysisDocumentJSON,
  'key-resistance': keyResistanceTemplate as KeyResistanceDocumentJSON,
  'conversion-tradeoff': conversionTradeoffTemplate as ConversionTradeoffDocumentJSON,
  'industry-forecast': industryForecastTemplate as IndustryForecastDocumentJSON,
  'scientific-meeting': scientificMeetingTemplate as ScientificMeetingDocumentJSON,
  ipo: ipoTemplate as IpoDocumentJSON,
  'incident-review': incidentReviewTemplate as IncidentReviewDocumentJSON,
  'annual-summary': annualSummaryTemplate as AnnualSummaryDocumentJSON,
  'deep-review': deepReviewTemplate as DeepReviewDocumentJSON,
}

export function isTemplateId(id: string): id is TemplateId {
  return id in TEMPLATES
}

export const TEMPLATE_META: Record<
  TemplateId,
  { name: string; badge: string; description: string }
> = {
  'dual-triangle': {
    name: '双三角构建梳理',
    badge: '双三角 · MVP',
    description: '人类三角 × AI 三角，梳理创造力、场景与系统能力闭环。',
  },
  'star-quadrant': {
    name: 'STAR 四象限',
    badge: 'STAR · MVP',
    description: 'Seek / Try / Act / Reflect 四象限，个人与组织的上下限探索。',
  },
  'y-model': {
    name: 'Y 模型无限进步',
    badge: 'Y模型 · MVP',
    description: '理论 × 事实驱动认知升级，从真正问题到组织工具的进步闭环。',
  },
  'deliberate-practice': {
    name: '刻意练习',
    badge: '刻意练习 · MVP',
    description: '固定套路 → 非舒适区 → 及时反馈，以大量重复驱动持续进步。',
  },
  'demand-triangle': {
    name: '需求评估三角形',
    badge: '需求评估 · MVP',
    description: '普遍性 × 频次 × 刚性三维雷达，叠加对比多个业务方向的需求强度。',
  },
  'five-step': {
    name: '五步法',
    badge: '五步法 · MVP',
    description: '需求 → 解决方案 → 商业模式 → 增长 → 壁垒，定性定量一体的方法论画布。',
  },
  'ai-tradeoff': {
    name: 'AI场景取舍评估',
    badge: '取舍评估 · MVP',
    description: '价值侧 × 成本侧二维取舍，用 1-10 分与事实论证筛选值得做的 AI 场景。',
  },
  'product-content': {
    name: '产品内核画布',
    badge: '产品内核 · MVP',
    description: '用户 × 核心指标，加法备选与减法内核假设，并用验证手段迭代认知。',
  },
  oscar: {
    name: 'OSCAR调研画布',
    badge: 'OSCAR · MVP',
    description: '目标 → 范围 → 清单 → 获取 → 用好情报，结构化调研闭环。',
  },
  'industry-analysis': {
    name: '行业分析画布',
    badge: '行业分析 · MVP',
    description: '产业链拆解、变化洞察、稳态预判，叠加周期、天花板与集中度判断。',
  },
  'key-resistance': {
    name: '关键阻力分析画布',
    badge: '关键阻力 · MVP',
    description: '阻力假设 × 消除假设 × 策略文案，动态多行拆解关键转化阻力。',
  },
  'conversion-tradeoff': {
    name: '转化率取舍画布',
    badge: '转化取舍 · MVP',
    description: '优先级 × 动力 × 阻力 × 触点，动态多行拆解转化率取舍。',
  },
  'industry-forecast': {
    name: '行业预判分析框架',
    badge: '行业预判 · MVP',
    description: '六步行业预判：产业链、变化、稳态B点、周期、天花板与集中度。',
  },
  'scientific-meeting': {
    name: '科学开会思考画布',
    badge: '科学开会 · MVP',
    description: '目标 → 原则 → 关键流程，用结构化三栏梳理高效会议。',
  },
  ipo: {
    name: 'IPO梳理画布',
    badge: 'IPO · MVP',
    description: '输入 → 处理 → 输出，叠加目标、模型与反馈闭环的 IPO 梳理画布。',
  },
  'incident-review': {
    name: '故障复盘',
    badge: '故障复盘 · MVP',
    description: '详细描述 → 发生过程 → 原因分析 → 解决方案 → 影响范围 → 关联需求 → 反思总结。',
  },
  'annual-summary': {
    name: '个人年度工作总结',
    badge: '年度总结 · MVP',
    description: '重点业务进展 · 个人成长进步 · 不足与改进计划，结构化年度复盘。',
  },
  'deep-review': {
    name: '深度复盘关键成果',
    badge: '深度复盘 · MVP',
    description: '整体评价 → 亮点/问题共识 → 坚持/放弃/新任务 → 过程资产沉淀。',
  },
}

function createItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export const useDocumentStore = defineStore('document', () => {
  const current_data = ref<CanvasDocumentJSON | null>(null)
  const dirty = ref(false)
  const head_revision_id = ref<string | null>(null)
  const document_id = ref<string | null>(null)
  /** Currently loaded template id (for localStorage / panel) */
  const activeTemplateId = ref<TemplateId | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  /** 任务名称（文档 title，与画布模板 id 解耦） */
  const doc_title = ref('')
  /** 备注信息 */
  const doc_notes = ref('')
  const created_at = ref<string | null>(null)
  const updated_at = ref<string | null>(null)

  const title = computed(() => doc_title.value || current_data.value?.id || '')
  const hasDocument = computed(() => current_data.value !== null)
  const isDualTriangle = computed(() => isDualTriangleDoc(current_data.value))
  const isYModel = computed(() => isYModelDoc(current_data.value))
  const isDeliberatePractice = computed(() =>
    isDeliberatePracticeDoc(current_data.value),
  )
  const isDemandTriangle = computed(() =>
    isDemandTriangleDoc(current_data.value),
  )
  const isFiveStep = computed(() => isFiveStepDoc(current_data.value))
  const isAiTradeoff = computed(() => isAiTradeoffDoc(current_data.value))
  const isProductContent = computed(() =>
    isProductContentDoc(current_data.value),
  )
  const isOscar = computed(() => isOscarDoc(current_data.value))
  const isIndustryAnalysis = computed(() =>
    isIndustryAnalysisDoc(current_data.value),
  )
  const isKeyResistance = computed(() =>
    isKeyResistanceDoc(current_data.value),
  )
  const isConversionTradeoff = computed(() =>
    isConversionTradeoffDoc(current_data.value),
  )
  const isIndustryForecast = computed(() =>
    isIndustryForecastDoc(current_data.value),
  )
  const isScientificMeeting = computed(() =>
    isScientificMeetingDoc(current_data.value),
  )
  const isIncidentReview = computed(() =>
    isIncidentReviewDoc(current_data.value),
  )
  const isAnnualSummary = computed(() =>
    isAnnualSummaryDoc(current_data.value),
  )
  const isDeepReview = computed(() => isDeepReviewDoc(current_data.value))
  const isQuadrant = computed(() => isQuadrantDoc(current_data.value))

  function asQuadrant(): QuadrantDocumentJSON | null {
    return isQuadrantDoc(current_data.value) ? current_data.value : null
  }

  function asBlockDoc(): BlockCanvasDocumentJSON | null {
    return isBlockCanvasDoc(current_data.value) ? current_data.value : null
  }

  function findQuadrantIndex(position: QuadrantPosition): number {
    const doc = asQuadrant()
    if (!doc) return -1
    return doc.quadrants.findIndex((q) => q.position === position)
  }

  function findBlockIndex(blockId: DualTriangleBlockId | string): number {
    const doc = asBlockDoc()
    if (!doc) return -1
    return doc.blocks.findIndex((b) => b.id === blockId)
  }

  function asKeyResistance(): KeyResistanceDocumentJSON | null {
    return isKeyResistanceDoc(current_data.value) ? current_data.value : null
  }

  function asConversionTradeoff(): ConversionTradeoffDocumentJSON | null {
    return isConversionTradeoffDoc(current_data.value)
      ? current_data.value
      : null
  }

  function asScientificMeeting(): ScientificMeetingDocumentJSON | null {
    return isScientificMeetingDoc(current_data.value) ? current_data.value : null
  }

  function asIncidentReview(): IncidentReviewDocumentJSON | null {
    return isIncidentReviewDoc(current_data.value) ? current_data.value : null
  }

  const KR_CELLS: KeyResistanceCellKey[] = ['resistance', 'eliminate', 'notes']

  function parseKeyResistanceCellId(
    blockId: string,
  ): { rowId: string; cell: KeyResistanceCellKey } | null {
    const idx = blockId.lastIndexOf(':')
    if (idx <= 0) return null
    const rowId = blockId.slice(0, idx)
    const cell = blockId.slice(idx + 1) as KeyResistanceCellKey
    if (!KR_CELLS.includes(cell)) return null
    return { rowId, cell }
  }

  function findKeyResistanceCell(
    blockId: string,
  ): { row: KeyResistanceRow; cell: KeyResistanceCellKey } | null {
    const doc = asKeyResistance()
    if (!doc) return null
    const parsed = parseKeyResistanceCellId(blockId)
    if (!parsed) return null
    const row = doc.rows.find((r) => r.id === parsed.rowId)
    if (!row) return null
    return { row, cell: parsed.cell }
  }

  function createRowId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `row_${crypto.randomUUID()}`
    }
    return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
  }

  function emptyKeyResistanceRow(): KeyResistanceRow {
    const mk = (): QuadrantItem[] => [
      {
        id: createItemId(),
        text: '',
        style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
      },
    ]
    return {
      id: createRowId(),
      resistance: mk(),
      eliminate: mk(),
      notes: mk(),
    }
  }

  function updateKeyResistanceRateLabel(label: string): boolean {
    const doc = asKeyResistance()
    if (!doc) return false
    doc.rateLabel = label
    markDirty()
    return true
  }

  function addKeyResistanceRow(): KeyResistanceRow | null {
    const doc = asKeyResistance()
    if (!doc) return null
    const row = emptyKeyResistanceRow()
    doc.rows = [...doc.rows, row]
    markDirty()
    return row
  }

  function removeKeyResistanceRow(rowId: string): boolean {
    const doc = asKeyResistance()
    if (!doc) return false
    if (doc.rows.length <= 1) return false
    const before = doc.rows.length
    doc.rows = doc.rows.filter((r) => r.id !== rowId)
    if (doc.rows.length === before) return false
    markDirty()
    return true
  }

  const CT_CELLS: ConversionTradeoffCellKey[] = [
    'drive',
    'resistance',
    'touchpoint',
  ]

  function parseConversionTradeoffCellId(
    blockId: string,
  ): { rowId: string; cell: ConversionTradeoffCellKey } | null {
    const idx = blockId.lastIndexOf(':')
    if (idx <= 0) return null
    const rowId = blockId.slice(0, idx)
    const cell = blockId.slice(idx + 1) as ConversionTradeoffCellKey
    if (!CT_CELLS.includes(cell)) return null
    return { rowId, cell }
  }

  function findConversionTradeoffCell(
    blockId: string,
  ): { row: ConversionTradeoffRow; cell: ConversionTradeoffCellKey } | null {
    const doc = asConversionTradeoff()
    if (!doc) return null
    const parsed = parseConversionTradeoffCellId(blockId)
    if (!parsed) return null
    const row = doc.rows.find((r) => r.id === parsed.rowId)
    if (!row) return null
    return { row, cell: parsed.cell }
  }

  function emptyConversionTradeoffRow(
    priorityLabel = '新优先级',
  ): ConversionTradeoffRow {
    const mk = (): QuadrantItem[] => [
      {
        id: createItemId(),
        text: '',
        style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
      },
    ]
    return {
      id: createRowId(),
      priorityLabel,
      drive: mk(),
      resistance: mk(),
      touchpoint: mk(),
    }
  }

  function updateConversionTradeoffPriorityLabel(
    rowId: string,
    label: string,
  ): boolean {
    const doc = asConversionTradeoff()
    if (!doc) return false
    const row = doc.rows.find((r) => r.id === rowId)
    if (!row) return false
    row.priorityLabel = label
    markDirty()
    return true
  }

  function addConversionTradeoffRow(): ConversionTradeoffRow | null {
    const doc = asConversionTradeoff()
    if (!doc) return null
    const row = emptyConversionTradeoffRow()
    doc.rows = [...doc.rows, row]
    markDirty()
    return row
  }

  function removeConversionTradeoffRow(rowId: string): boolean {
    const doc = asConversionTradeoff()
    if (!doc) return false
    if (doc.rows.length <= 1) return false
    const before = doc.rows.length
    doc.rows = doc.rows.filter((r) => r.id !== rowId)
    if (doc.rows.length === before) return false
    markDirty()
    return true
  }


  function parseIncidentReviewTimelineCellId(
    blockId: string,
  ): { rowId: string; cell: 'behavior' } | null {
    const idx = blockId.lastIndexOf(':')
    if (idx <= 0) return null
    const rowId = blockId.slice(0, idx)
    const cell = blockId.slice(idx + 1)
    if (cell !== 'behavior') return null
    return { rowId, cell: 'behavior' }
  }

  function findIncidentReviewTimelineCell(
    blockId: string,
  ): { row: IncidentReviewTimelineRow; cell: 'behavior' } | null {
    const doc = asIncidentReview()
    if (!doc) return null
    const parsed = parseIncidentReviewTimelineCellId(blockId)
    if (!parsed) return null
    const row = doc.timelineRows.find((r) => r.id === parsed.rowId)
    if (!row) return null
    return { row, cell: parsed.cell }
  }

  function emptyIncidentReviewTimelineRow(
    time = '',
  ): IncidentReviewTimelineRow {
    return {
      id: createRowId(),
      time,
      behavior: [
        {
          id: createItemId(),
          text: '',
          style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
        },
      ],
    }
  }

  function updateIncidentReviewTimelineTime(
    rowId: string,
    time: string,
  ): boolean {
    const doc = asIncidentReview()
    if (!doc) return false
    const row = doc.timelineRows.find((r) => r.id === rowId)
    if (!row) return false
    row.time = time
    markDirty()
    return true
  }

  function addIncidentReviewTimelineRow(): IncidentReviewTimelineRow | null {
    const doc = asIncidentReview()
    if (!doc) return null
    const row = emptyIncidentReviewTimelineRow()
    doc.timelineRows = [...doc.timelineRows, row]
    markDirty()
    return row
  }

  function removeIncidentReviewTimelineRow(rowId: string): boolean {
    const doc = asIncidentReview()
    if (!doc) return false
    if (doc.timelineRows.length <= 1) return false
    const before = doc.timelineRows.length
    doc.timelineRows = doc.timelineRows.filter((r) => r.id !== rowId)
    if (doc.timelineRows.length === before) return false
    markDirty()
    return true
  }

  function updateScientificMeetingMeta(
    patch: Partial<{ meetingType: string; organizer: string }>,
  ): boolean {
    const doc = asScientificMeeting()
    if (!doc) return false
    if (patch.meetingType !== undefined) doc.meetingType = patch.meetingType
    if (patch.organizer !== undefined) doc.organizer = patch.organizer
    markDirty()
    return true
  }

  function asDeepReview(): DeepReviewDocumentJSON | null {
    return isDeepReviewDoc(current_data.value) ? current_data.value : null
  }

  function updateDeepReviewMeta(
    patch: Partial<{ projectName: string; reviewTime: string }>,
  ): boolean {
    const doc = asDeepReview()
    if (!doc) return false
    if (patch.projectName !== undefined) doc.projectName = patch.projectName
    if (patch.reviewTime !== undefined) doc.reviewTime = patch.reviewTime
    markDirty()
    return true
  }

  function loadFromTemplate(templateId: TemplateId | string = 'dual-triangle') {
    const id: TemplateId = isTemplateId(templateId) ? templateId : 'dual-triangle'
    activeTemplateId.value = id
    const local = loadLocal(id)
    const meta = loadLocalMeta(id)
    if (local) {
      current_data.value = normalizeLoadedDoc(local)
      dirty.value = false
      head_revision_id.value = null
      document_id.value = meta?.documentId || null
      if (meta) {
        applyMeta(meta)
      } else {
        clearMeta()
        doc_title.value = TEMPLATE_META[id]?.name || ''
      }
      return
    }
    const template = TEMPLATES[id]
    current_data.value = normalizeLoadedDoc(
      structuredClone(template) as CanvasDocumentJSON,
    )
    dirty.value = false
    head_revision_id.value = null
    document_id.value = null
    clearMeta()
    if (meta) {
      applyMeta(meta)
    } else {
      doc_title.value = TEMPLATE_META[id]?.name || ''
    }
  }

  /** Force reload bare template (ignore localStorage) */
  function resetToTemplate(templateId?: TemplateId | string) {
    const id: TemplateId =
      (templateId && isTemplateId(templateId) && templateId) ||
      activeTemplateId.value ||
      'dual-triangle'
    activeTemplateId.value = id
    const template = TEMPLATES[id]
    current_data.value = normalizeLoadedDoc(
      structuredClone(template) as CanvasDocumentJSON,
    )
    dirty.value = false
    head_revision_id.value = null
    document_id.value = null
    clearMeta()
    doc_title.value = TEMPLATE_META[id]?.name || ''
  }

  /** 加载后温和升级已知模板结构（Y 模型 + attachmentsByPanelId） */
  function normalizeLoadedDoc(doc: CanvasDocumentJSON): CanvasDocumentJSON {
    let next: CanvasDocumentJSON = doc
    if (isYModelDoc(next)) {
      next = normalizeYModelDoc(next)
    }
    if (!next.attachmentsByPanelId) {
      next = { ...next, attachmentsByPanelId: {} }
    }
    return next
  }

  function ensureAttachmentsMap(): AttachmentsByPanelId | null {
    const doc = current_data.value
    if (!doc) return null
    if (!doc.attachmentsByPanelId) {
      doc.attachmentsByPanelId = {}
    }
    return doc.attachmentsByPanelId
  }

  function getPanelAttachments(panelId: string): PanelAttachment[] {
    const map = current_data.value?.attachmentsByPanelId
    if (!map) return []
    return map[panelId] ?? []
  }

  function addPanelAttachment(
    panelId: string,
    partial: Omit<PanelAttachment, 'id' | 'createdAt'> & {
      id?: string
      createdAt?: number
    },
  ): PanelAttachment | null {
    const map = ensureAttachmentsMap()
    if (!map) return null
    const att: PanelAttachment = {
      id: partial.id ?? createItemId(),
      name: partial.name,
      kind: partial.kind,
      ...(partial.mimeType ? { mimeType: partial.mimeType } : {}),
      ...(partial.size != null ? { size: partial.size } : {}),
      ...(partial.url ? { url: partial.url } : {}),
      ...(partial.dataUrl ? { dataUrl: partial.dataUrl } : {}),
      createdAt: partial.createdAt ?? Date.now(),
    }
    const prev = map[panelId] ?? []
    map[panelId] = [...prev, att]
    markDirty()
    return att
  }

  function removePanelAttachment(panelId: string, id: string): boolean {
    const map = ensureAttachmentsMap()
    if (!map) return false
    const prev = map[panelId]
    if (!prev) return false
    const next = prev.filter((a) => a.id !== id)
    if (next.length === prev.length) return false
    if (next.length === 0) {
      delete map[panelId]
    } else {
      map[panelId] = next
    }
    markDirty()
    return true
  }

  type LocalDocMeta = {
    title: string
    notes: string
    createdAt: string
    updatedAt: string
    documentId?: string | null
  }

  function localMetaKey(templateId?: string | null): string {
    const id =
      templateId ||
      activeTemplateId.value ||
      current_data.value?.id ||
      'unknown'
    return `metamatrix:doc-meta:${id}`
  }

  function applyMeta(meta: {
    title?: string | null
    notes?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }) {
    if (meta.title != null) doc_title.value = meta.title
    if (meta.notes != null) doc_notes.value = meta.notes
    if (meta.createdAt !== undefined) created_at.value = meta.createdAt
    if (meta.updatedAt !== undefined) updated_at.value = meta.updatedAt
  }

  function clearMeta() {
    doc_title.value = ''
    doc_notes.value = ''
    created_at.value = null
    updated_at.value = null
  }

  function persistLocalMeta(templateId?: string | null): boolean {
    try {
      const now = new Date().toISOString()
      if (!created_at.value) created_at.value = now
      updated_at.value = now
      const meta: LocalDocMeta = {
        title: doc_title.value,
        notes: doc_notes.value,
        createdAt: created_at.value,
        updatedAt: updated_at.value,
        documentId: document_id.value,
      }
      localStorage.setItem(localMetaKey(templateId), JSON.stringify(meta))
      return true
    } catch (err) {
      console.warn('[documentStore.persistLocalMeta]', err)
      return false
    }
  }

  function loadLocalMeta(templateId?: string | null): LocalDocMeta | null {
    try {
      const raw = localStorage.getItem(localMetaKey(templateId))
      if (!raw) return null
      return JSON.parse(raw) as LocalDocMeta
    } catch (err) {
      console.warn('[documentStore.loadLocalMeta]', err)
      return null
    }
  }

  function setDocTitle(v: string) {
    doc_title.value = v
    dirty.value = true
  }

  function setDocNotes(v: string) {
    doc_notes.value = v
    dirty.value = true
  }

  function localStorageKey(templateId?: string | null): string {
    const id =
      templateId ||
      activeTemplateId.value ||
      current_data.value?.id ||
      'unknown'
    return `metamatrix:doc:${id}`
  }

  function persistLocal(templateId?: string | null): boolean {
    if (!current_data.value) return false
    try {
      const key = localStorageKey(templateId)
      localStorage.setItem(key, JSON.stringify(current_data.value))
      persistLocalMeta(templateId)
      return true
    } catch (err) {
      console.warn('[documentStore.persistLocal]', err)
      return false
    }
  }

  function loadLocal(templateId?: string | null): CanvasDocumentJSON | null {
    try {
      const key = localStorageKey(templateId)
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw) as CanvasDocumentJSON
    } catch (err) {
      console.warn('[documentStore.loadLocal]', err)
      return null
    }
  }

  /** Download current_data as JSON file (Excalidraw-style export) */
  function exportJson(): boolean {
    if (!current_data.value) return false
    const name =
      (activeTemplateId.value || current_data.value.id || 'metamatrix').replace(
        /\s+/g,
        '_',
      )
    const blob = new Blob([JSON.stringify(current_data.value, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
    return true
  }

  /** Load document from API by id */
  async function load(id: string): Promise<void> {
    loading.value = true
    try {
      const doc = await documentsApi.getDocument(id)
      current_data.value = normalizeLoadedDoc(doc.currentData)
      document_id.value = doc.id
      head_revision_id.value = doc.headRevisionId
      if (doc.templateId && isTemplateId(doc.templateId)) {
        activeTemplateId.value = doc.templateId
      }
      applyMeta({
        title: doc.title,
        notes: doc.notes ?? '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })
      dirty.value = false
      persistLocal(activeTemplateId.value)
    } finally {
      loading.value = false
    }
  }

  /** Create server document from current template data (or bare template). */
  async function createOnServer(opts?: {
    templateId?: TemplateId | string
    title?: string
    notes?: string
    data?: CanvasDocumentJSON
  }): Promise<string> {
    const tid: TemplateId =
      (opts?.templateId && isTemplateId(opts.templateId) && opts.templateId) ||
      activeTemplateId.value ||
      'dual-triangle'
    const data =
      opts?.data ??
      current_data.value ??
      (structuredClone(TEMPLATES[tid]) as CanvasDocumentJSON)
    const title =
      (opts?.title != null ? opts.title : doc_title.value) ||
      TEMPLATE_META[tid]?.name ||
      (typeof data.id === 'string' ? data.id : 'Untitled')
    const notes = opts?.notes != null ? opts.notes : doc_notes.value
    const canvasType =
      typeof (data as { type?: string }).type === 'string'
        ? String((data as { type?: string }).type)
        : tid
    saving.value = true
    try {
      const doc = await documentsApi.createDocument({
        title,
        notes,
        canvasType,
        templateId: tid,
        data: normalizeLoadedDoc(structuredClone(data) as CanvasDocumentJSON),
      })
      current_data.value = normalizeLoadedDoc(doc.currentData)
      document_id.value = doc.id
      head_revision_id.value = doc.headRevisionId
      activeTemplateId.value = tid
      applyMeta({
        title: doc.title,
        notes: doc.notes ?? '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })
      dirty.value = false
      persistLocal(tid)
      return doc.id
    } finally {
      saving.value = false
    }
  }

  /** Ensure logged-in user has a server doc; create if needed. */
  async function ensureServerDocument(): Promise<string | null> {
    if (!getToken()) return null
    if (document_id.value) return document_id.value
    if (!current_data.value || !activeTemplateId.value) return null
    return createOnServer({ templateId: activeTemplateId.value })
  }

  /** Save current_data to API (falls back to localStorage when logged out). */
  async function save(opts?: {
    expected_head_revision_id?: string | null
    checkpoint?: boolean
    title?: string
    notes?: string
  }): Promise<void> {
    if (!current_data.value) return
    if (opts?.title != null) doc_title.value = opts.title
    if (opts?.notes != null) doc_notes.value = opts.notes
    persistLocal(activeTemplateId.value)

    if (!getToken()) {
      dirty.value = false
      return
    }

    const effectiveTitle = (opts?.title != null ? opts.title : doc_title.value).trim()
    const effectiveNotes = opts?.notes != null ? opts.notes : doc_notes.value

    saving.value = true
    try {
      let id = document_id.value
      if (!id) {
        if (!effectiveTitle) {
          throw new Error('请先填写任务名称后再创建云端文档')
        }
        id = await createOnServer({
          templateId: activeTemplateId.value || undefined,
          title: effectiveTitle,
          notes: effectiveNotes,
        })
        return
      }
      const expected =
        opts?.expected_head_revision_id !== undefined
          ? opts.expected_head_revision_id
          : head_revision_id.value
      try {
        const doc = await documentsApi.updateDocument(id, {
          title: effectiveTitle || undefined,
          notes: effectiveNotes,
          currentData: current_data.value,
          expectedHeadRevisionId: expected,
          checkpoint: opts?.checkpoint ?? false,
        })
        document_id.value = doc.id
        head_revision_id.value = doc.headRevisionId
        applyMeta({
          title: doc.title,
          notes: doc.notes ?? '',
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })
        persistLocalMeta(activeTemplateId.value)
        dirty.value = false
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const body = e.body as { headRevisionId?: string } | undefined
          // reload latest and surface conflict
          await load(id)
          throw new Error(
            `保存冲突（服务端 head=${body?.headRevisionId ?? '?'}），已拉取最新版本`,
          )
        }
        throw e
      }
    } finally {
      saving.value = false
    }
  }

  async function checkpoint(label?: string): Promise<void> {
    if (!getToken()) {
      throw new Error('请先登录后再存版')
    }
    await ensureServerDocument()
    if (!document_id.value || !current_data.value) return
    // flush latest content first
    await save({ checkpoint: false })
    saving.value = true
    try {
      const res = await documentsApi.createRevision(document_id.value, {
        expectedHeadRevisionId: head_revision_id.value,
        label: label || 'manual-snapshot',
      })
      document_id.value = res.document.id
      head_revision_id.value = res.document.headRevisionId
      dirty.value = false
    } finally {
      saving.value = false
    }
  }

  async function listMyDocuments(templateId?: string) {
    return documentsApi.listDocuments(
      templateId ? { templateId } : undefined,
    )
  }

  function markDirty() {
    dirty.value = true
  }

  function setCurrentData(data: CanvasDocumentJSON) {
    current_data.value = normalizeLoadedDoc(data)
    dirty.value = true
  }

  function addItem(
    position: QuadrantPosition,
    partial?: Partial<QuadrantItem>,
  ): QuadrantItem | null {
    const doc = asQuadrant()
    const idx = findQuadrantIndex(position)
    if (idx < 0 || !doc) return null

    const item: QuadrantItem = {
      id: partial?.id ?? createItemId(),
      text: partial?.text ?? '新条目',
      ...(partial?.style ? { style: { ...partial.style } } : {}),
    }

    const q = doc.quadrants[idx]
    q.items = [...q.items, item]
    markDirty()
    return item
  }

  function updateItem(
    position: QuadrantPosition,
    id: string,
    patch: { text?: string; style?: QuadrantItemStyle | null },
  ): boolean {
    const doc = asQuadrant()
    const idx = findQuadrantIndex(position)
    if (idx < 0 || !doc) return false

    const items = doc.quadrants[idx].items
    const itemIdx = items.findIndex((it) => it.id === id)
    if (itemIdx < 0) return false

    const item = items[itemIdx]
    const next: QuadrantItem = { ...item }
    if (patch.text !== undefined) {
      next.text = patch.text
    }
    if (patch.style === null) {
      delete next.style
    } else if (patch.style !== undefined) {
      next.style = { ...(item.style ?? {}), ...patch.style }
    }
    const nextItems = items.slice()
    nextItems[itemIdx] = next
    doc.quadrants[idx].items = nextItems

    markDirty()
    return true
  }

  function removeItem(position: QuadrantPosition, id: string): boolean {
    const doc = asQuadrant()
    const idx = findQuadrantIndex(position)
    if (idx < 0 || !doc) return false

    const items = doc.quadrants[idx].items
    const itemIdx = items.findIndex((it) => it.id === id)
    if (itemIdx < 0) return false

    items.splice(itemIdx, 1)
    markDirty()
    return true
  }

  /** 统一：双三角 / Y 模型方块条目增删改 */
  function addBlockItem(
    blockId: DualTriangleBlockId | string,
    partial?: Partial<QuadrantItem>,
  ): QuadrantItem | null {
    const kr = findKeyResistanceCell(blockId)
    if (kr) {
      const item: QuadrantItem = {
        id: partial?.id ?? createItemId(),
        text: partial?.text ?? '新条目',
        ...(partial?.style ? { style: { ...partial.style } } : {}),
      }
      kr.row[kr.cell] = [...kr.row[kr.cell], item]
      markDirty()
      return item
    }

    const ct = findConversionTradeoffCell(blockId)
    if (ct) {
      const item: QuadrantItem = {
        id: partial?.id ?? createItemId(),
        text: partial?.text ?? '新条目',
        ...(partial?.style ? { style: { ...partial.style } } : {}),
      }
      ct.row[ct.cell] = [...ct.row[ct.cell], item]
      markDirty()
      return item
    }

    const ir = findIncidentReviewTimelineCell(blockId)
    if (ir) {
      const item: QuadrantItem = {
        id: partial?.id ?? createItemId(),
        text: partial?.text ?? '新条目',
        ...(partial?.style ? { style: { ...partial.style } } : {}),
      }
      ir.row.behavior = [...ir.row.behavior, item]
      markDirty()
      return item
    }

    const doc = asBlockDoc()
    const idx = findBlockIndex(blockId)
    if (idx < 0 || !doc) return null

    const item: QuadrantItem = {
      id: partial?.id ?? createItemId(),
      text: partial?.text ?? '新条目',
      ...(partial?.style ? { style: { ...partial.style } } : {}),
    }

    const block = doc.blocks[idx]
    block.items = [...block.items, item]
    markDirty()
    return item
  }

  function updateBlockItem(
    blockId: DualTriangleBlockId | string,
    id: string,
    patch: { text?: string; style?: QuadrantItemStyle | null },
  ): boolean {
    const kr = findKeyResistanceCell(blockId)
    if (kr) {
      const items = kr.row[kr.cell]
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const item = items[itemIdx]
      const next: QuadrantItem = { ...item }
      if (patch.text !== undefined) {
        next.text = patch.text
      }
      if (patch.style === null) {
        delete next.style
      } else if (patch.style !== undefined) {
        next.style = { ...(item.style ?? {}), ...patch.style }
      }
      const nextItems = items.slice()
      nextItems[itemIdx] = next
      kr.row[kr.cell] = nextItems
      markDirty()
      return true
    }

    const ct = findConversionTradeoffCell(blockId)
    if (ct) {
      const items = ct.row[ct.cell]
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const item = items[itemIdx]
      const next: QuadrantItem = { ...item }
      if (patch.text !== undefined) {
        next.text = patch.text
      }
      if (patch.style === null) {
        delete next.style
      } else if (patch.style !== undefined) {
        next.style = { ...(item.style ?? {}), ...patch.style }
      }
      const nextItems = items.slice()
      nextItems[itemIdx] = next
      ct.row[ct.cell] = nextItems
      markDirty()
      return true
    }

    const ir = findIncidentReviewTimelineCell(blockId)
    if (ir) {
      const items = ir.row.behavior
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const item = items[itemIdx]
      const next: QuadrantItem = { ...item }
      if (patch.text !== undefined) {
        next.text = patch.text
      }
      if (patch.style === null) {
        delete next.style
      } else if (patch.style !== undefined) {
        next.style = { ...(item.style ?? {}), ...patch.style }
      }
      const nextItems = items.slice()
      nextItems[itemIdx] = next
      ir.row.behavior = nextItems
      markDirty()
      return true
    }

    const doc = asBlockDoc()
    const idx = findBlockIndex(blockId)
    if (idx < 0 || !doc) return false

    const items = doc.blocks[idx].items
    const itemIdx = items.findIndex((it) => it.id === id)
    if (itemIdx < 0) return false

    const item = items[itemIdx]
    const next: QuadrantItem = { ...item }
    if (patch.text !== undefined) {
      next.text = patch.text
    }
    if (patch.style === null) {
      delete next.style
    } else if (patch.style !== undefined) {
      next.style = { ...(item.style ?? {}), ...patch.style }
    }
    const nextItems = items.slice()
    nextItems[itemIdx] = next
    doc.blocks[idx].items = nextItems

    markDirty()
    return true
  }

  function removeBlockItem(
    blockId: DualTriangleBlockId | string,
    id: string,
  ): boolean {
    const kr = findKeyResistanceCell(blockId)
    if (kr) {
      const items = kr.row[kr.cell]
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const nextItems = items.slice()
      nextItems.splice(itemIdx, 1)
      kr.row[kr.cell] = nextItems
      markDirty()
      return true
    }

    const ct = findConversionTradeoffCell(blockId)
    if (ct) {
      const items = ct.row[ct.cell]
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const nextItems = items.slice()
      nextItems.splice(itemIdx, 1)
      ct.row[ct.cell] = nextItems
      markDirty()
      return true
    }

    const ir = findIncidentReviewTimelineCell(blockId)
    if (ir) {
      const items = ir.row.behavior
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      const nextItems = items.slice()
      nextItems.splice(itemIdx, 1)
      ir.row.behavior = nextItems
      markDirty()
      return true
    }

    const doc = asBlockDoc()
    const idx = findBlockIndex(blockId)
    if (idx < 0 || !doc) return false

    const items = doc.blocks[idx].items
    const itemIdx = items.findIndex((it) => it.id === id)
    if (itemIdx < 0) return false

    items.splice(itemIdx, 1)
    markDirty()
    return true
  }


  function asDemandTriangle(): DemandTriangleDocumentJSON | null {
    return isDemandTriangleDoc(current_data.value) ? current_data.value : null
  }

  function ensureDemandDirection(
    id: string,
    partial?: Partial<DemandTriangleDirection>,
  ): DemandTriangleDirection | null {
    const doc = asDemandTriangle()
    if (!doc) return null
    const existing = doc.directions.find((d) => d.id === id)
    if (existing) return existing
    const next: DemandTriangleDirection = {
      id,
      color: partial?.color ?? 'rgba(100, 181, 246, 0.4)',
      stroke: partial?.stroke ?? '#42a5f5',
      scores: {
        universality: partial?.scores?.universality ?? 0.5,
        frequency: partial?.scores?.frequency ?? 0.5,
        rigidity: partial?.scores?.rigidity ?? 0.5,
      },
    }
    doc.directions = [...doc.directions, next]
    markDirty()
    return next
  }

  function updateDemandDirectionScores(
    id: string,
    patch: Partial<DemandTriangleScores>,
  ): boolean {
    const doc = asDemandTriangle()
    if (!doc) return false
    const idx = doc.directions.findIndex((d) => d.id === id)
    if (idx < 0) {
      ensureDemandDirection(id)
      const again = doc.directions.findIndex((d) => d.id === id)
      if (again < 0) return false
      const d = doc.directions[again]
      doc.directions[again] = {
        ...d,
        scores: { ...d.scores, ...patch },
      }
      markDirty()
      return true
    }
    const d = doc.directions[idx]
    const next = doc.directions.slice()
    next[idx] = {
      ...d,
      scores: { ...d.scores, ...patch },
    }
    doc.directions = next
    markDirty()
    return true
  }

  function removeDemandDirection(id: string): boolean {
    const doc = asDemandTriangle()
    if (!doc) return false
    const before = doc.directions.length
    doc.directions = doc.directions.filter((d) => d.id !== id)
    if (doc.directions.length === before) return false
    markDirty()
    return true
  }

  /** 统一按容器更新条目（象限 position 或 blockId） */
  function updateItemByContainer(
    container: { kind: 'quadrant'; position: QuadrantPosition } | { kind: 'block'; blockId: string },
    id: string,
    patch: { text?: string; style?: QuadrantItemStyle | null },
  ): boolean {
    if (container.kind === 'quadrant') {
      return updateItem(container.position, id, patch)
    }
    return updateBlockItem(container.blockId, id, patch)
  }

  return {
    current_data,
    dirty,
    head_revision_id,
    document_id,
    activeTemplateId,
    loading,
    saving,
    doc_title,
    doc_notes,
    created_at,
    updated_at,
    title,
    hasDocument,
    isDualTriangle,
    isYModel,
    isDeliberatePractice,
    isDemandTriangle,
    isFiveStep,
    isAiTradeoff,
    isProductContent,
    isOscar,
    isIndustryAnalysis,
    isKeyResistance,
    isConversionTradeoff,
    isIndustryForecast,
    isScientificMeeting,
    isIncidentReview,
    isAnnualSummary,
    isDeepReview,
    isQuadrant,
    loadFromTemplate,
    resetToTemplate,
    load,
    save,
    createOnServer,
    ensureServerDocument,
    checkpoint,
    listMyDocuments,
    persistLocal,
    persistLocalMeta,
    loadLocal,
    loadLocalMeta,
    setDocTitle,
    setDocNotes,
    exportJson,
    markDirty,
    setCurrentData,
    addItem,
    updateItem,
    removeItem,
    addBlockItem,
    updateBlockItem,
    removeBlockItem,
    updateItemByContainer,
    ensureDemandDirection,
    updateDemandDirectionScores,
    removeDemandDirection,
    updateKeyResistanceRateLabel,
    addKeyResistanceRow,
    removeKeyResistanceRow,
    updateConversionTradeoffPriorityLabel,
    addConversionTradeoffRow,
    removeConversionTradeoffRow,
    updateIncidentReviewTimelineTime,
    addIncidentReviewTimelineRow,
    removeIncidentReviewTimelineRow,
    updateScientificMeetingMeta,
    updateDeepReviewMeta,
    getPanelAttachments,
    addPanelAttachment,
    removePanelAttachment,
  }
})
