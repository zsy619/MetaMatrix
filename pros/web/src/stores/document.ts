import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { normalizeCanvasTheme } from '../components/canvas/canvasChrome'
import { ApiError } from '../api/http'
import * as documentsApi from '../api/documents'
import { rememberRecentOpen } from '../utils/canvasTransfer'
import { normalizePageSize, readPageSize, writePageSizeMap } from '../utils/rtePageSize'
import { normalizePageMargin, writePageMargin, type PageMargin } from '../utils/rtePageMargin'
import { writeToolbarGroupOrder } from '../utils/rteToolbarGroups'
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
  DeliberatePracticeBlockId,
  DemandTriangleDocumentJSON,
  DemandTriangleDirection,
  DemandTriangleScores,
  DemandTriangleNotesBlock,
  FiveStepDocumentJSON,
  FiveStepDivisionDocumentJSON,
  FiveStepBasicDocumentJSON,
  FiveStepAdvancedDocumentJSON,
  FiveStepProDocumentJSON,
  FiveStepChallengeDocumentJSON,
  FiveStepFamilyDocumentJSON,
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
  IpoBlockId,
  IncidentReviewDocumentJSON,
  IncidentReviewTimelineRow,
  AnnualSummaryDocumentJSON,
  PeriodSummaryDocumentJSON,
  DeepReviewDocumentJSON,
  PmRetroValueDocumentJSON,
  RoiTradeoffDocumentJSON,
  RoiDecisionDocumentJSON,
  RoiDecisionRow,
  RoiDecisionFixedBlockId,
  TimeMatrixDocumentJSON,
  WorkStateZonesDocumentJSON,
  OnlineOfflineCommDocumentJSON,
  UnitModelQuadrantDocumentJSON,
  PmSensitivity6dDocumentJSON,
  PmSensitivity6dAxisId,
  PmSensitivity6dScores,
  PmCompetencyDocumentJSON,
  PmCompetencyAxisId,
  PmCompetencyScores,
  ScientificMeeting10pDocumentJSON,
  ScientificMeeting10pAxisId,
  ScientificMeeting10pScores,
  ProductFeatures5dDocumentJSON,
  ProductFeatures5dAxisId,
  ProductFeatures5dScores,
  PmSolutionTriangleDocumentJSON,
  PmSolutionTriangleAxisId,
  PmSolutionTriangleScores,
  GrowthAssumptionsDocumentJSON,
  GrowthAssumptionsCellKey,
  GrowthAssumptionsRow,
  BusinessFormulaDocumentJSON,
  PanelAttachment,
  AttachmentsByPanelId,
} from '../types/canvas'
import {
  demandTriangleNotesBlockId,
  parseDemandTriangleNotesDirId,
  isAiTradeoffDoc,
  isBlockCanvasDoc,
  isDeliberatePracticeDoc,
  isDemandTriangleDoc,
  isPmSensitivity6dDoc,
  isPmCompetencyDoc,
  isScientificMeeting10pDoc,
  isProductFeatures5dDoc,
  isPmSolutionTriangleDoc,
  isIpoDoc,
  isDualTriangleDoc,
  isFiveStepDoc,
  isFiveStepDivisionDoc,
  isFiveStepBasicDoc,
  isFiveStepAdvancedDoc,
  isFiveStepProDoc,
  isFiveStepChallengeDoc,
  isFiveStepFamilyDoc,
  isIndustryAnalysisDoc,
  isIndustryForecastDoc,
  isKeyResistanceDoc,
  isConversionTradeoffDoc,
  isRoiDecisionDoc,
  isOscarDoc,
  isProductContentDoc,
  isQuadrantDoc,
  isScientificMeetingDoc,
  isYModelDoc,
  isIncidentReviewDoc,
  isAnnualSummaryDoc,
  isPeriodSummaryDoc,
  isDeepReviewDoc,
  isGrowthAssumptionsDoc,
  coerceYModelDoc,
  normalizeYModelDoc,
} from '../types/canvas'
import dualTriangleTemplate from '../templates/dual-triangle-v1.json'
import dualTriangleHumanAiTemplate from '../templates/dual-triangle-human-ai-v1.json'
import starQuadrantTemplate from '../templates/star-quadrant-v1.json'
import yModelTemplate from '../templates/y-model-v1.json'
import deliberatePracticeTemplate from '../templates/deliberate-practice-v1.json'
import demandTriangleTemplate from '../templates/demand-triangle-v1.json'
import fiveStepTemplate from '../templates/five-step-v1.json'
import fiveStepDivisionTemplate from '../templates/five-step-division-v1.json'
import fiveStepBasicTemplate from '../templates/five-step-basic-v1.json'
import fiveStepAdvancedTemplate from '../templates/five-step-advanced-v1.json'
import fiveStepProTemplate from '../templates/five-step-pro-v1.json'
import fiveStepChallengeTemplate from '../templates/five-step-challenge-v1.json'
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
import weeklySummaryTemplate from '../templates/weekly-summary-v1.json'
import monthlySummaryTemplate from '../templates/monthly-summary-v1.json'
import quarterlySummaryTemplate from '../templates/quarterly-summary-v1.json'
import deepReviewTemplate from '../templates/deep-review-v1.json'
import pmRetroValueTemplate from '../templates/pm-retro-value-v1.json'
import roiTradeoffTemplate from '../templates/roi-tradeoff-v1.json'
import roiDecisionTemplate from '../templates/roi-decision-v1.json'
import timeMatrixTemplate from '../templates/time-matrix-v1.json'
import workStateZonesTemplate from '../templates/work-state-zones-v1.json'
import onlineOfflineCommTemplate from '../templates/online-offline-comm-v1.json'
import unitModelQuadrantTemplate from '../templates/unit-model-quadrant-v1.json'
import pmSensitivity6dTemplate from '../templates/pm-sensitivity-6d-v1.json'
import pmCompetencyTemplate from '../templates/pm-competency-v1.json'
import scientificMeeting10pTemplate from '../templates/scientific-meeting-10p-v1.json'
import productFeatures5dTemplate from '../templates/product-features-5d-v1.json'
import pmSolutionTriangleTemplate from '../templates/pm-solution-triangle-v1.json'
import growthAssumptionsTemplate from '../templates/growth-assumptions-v1.json'
import businessFormulaTemplate from '../templates/business-formula-v1.json'

export type TemplateId =
  | 'dual-triangle'
  | 'dual-triangle-human-ai'
  | 'star-quadrant'
  | 'y-model'
  | 'deliberate-practice'
  | 'demand-triangle'
  | 'five-step-basic'
  | 'five-step-division'
  | 'five-step-advanced'
  | 'five-step-pro'
  | 'five-step-challenge'
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
  | 'weekly-summary'
  | 'monthly-summary'
  | 'quarterly-summary'
  | 'deep-review'
  | 'pm-retro-value'
  | 'roi-tradeoff'
  | 'roi-decision'
  | 'time-matrix'
  | 'work-state-zones'
  | 'online-offline-comm'
  | 'unit-model-quadrant'
  | 'pm-sensitivity-6d'
  | 'pm-competency'
  | 'scientific-meeting-10p'
  | 'product-features-5d'
  | 'pm-solution-triangle'
  | 'growth-assumptions'
  | 'business-formula'

const TEMPLATES: Record<TemplateId, CanvasDocumentJSON> = {
  'dual-triangle': dualTriangleTemplate as DualTriangleDocumentJSON,
  'dual-triangle-human-ai':
    dualTriangleHumanAiTemplate as DualTriangleDocumentJSON,
  'star-quadrant': starQuadrantTemplate as QuadrantDocumentJSON,
  'y-model': yModelTemplate as YModelDocumentJSON,
  'deliberate-practice':
    deliberatePracticeTemplate as DeliberatePracticeDocumentJSON,
  'demand-triangle': demandTriangleTemplate as DemandTriangleDocumentJSON,
  'five-step-basic': fiveStepBasicTemplate as FiveStepBasicDocumentJSON,
  'five-step-division': fiveStepDivisionTemplate as FiveStepDivisionDocumentJSON,
  'five-step-advanced': fiveStepAdvancedTemplate as FiveStepAdvancedDocumentJSON,
  'five-step-pro': fiveStepProTemplate as FiveStepProDocumentJSON,
  'five-step-challenge': fiveStepChallengeTemplate as FiveStepChallengeDocumentJSON,
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
  'weekly-summary': weeklySummaryTemplate as PeriodSummaryDocumentJSON,
  'monthly-summary': monthlySummaryTemplate as PeriodSummaryDocumentJSON,
  'quarterly-summary': quarterlySummaryTemplate as PeriodSummaryDocumentJSON,
  'deep-review': deepReviewTemplate as DeepReviewDocumentJSON,
  'pm-retro-value': pmRetroValueTemplate as PmRetroValueDocumentJSON,
  'roi-tradeoff': roiTradeoffTemplate as RoiTradeoffDocumentJSON,
  'roi-decision': roiDecisionTemplate as RoiDecisionDocumentJSON,
  'time-matrix': timeMatrixTemplate as TimeMatrixDocumentJSON,
  'work-state-zones': workStateZonesTemplate as WorkStateZonesDocumentJSON,
  'online-offline-comm': onlineOfflineCommTemplate as OnlineOfflineCommDocumentJSON,
  'unit-model-quadrant': unitModelQuadrantTemplate as UnitModelQuadrantDocumentJSON,
  'pm-sensitivity-6d': pmSensitivity6dTemplate as PmSensitivity6dDocumentJSON,
  'pm-competency': pmCompetencyTemplate as PmCompetencyDocumentJSON,
  'scientific-meeting-10p': scientificMeeting10pTemplate as ScientificMeeting10pDocumentJSON,
  'product-features-5d': productFeatures5dTemplate as ProductFeatures5dDocumentJSON,
  'pm-solution-triangle': pmSolutionTriangleTemplate as PmSolutionTriangleDocumentJSON,
  'growth-assumptions': growthAssumptionsTemplate as GrowthAssumptionsDocumentJSON,
  'business-formula': businessFormulaTemplate as BusinessFormulaDocumentJSON,
}

export function isTemplateId(id: string): id is TemplateId {
  return id in TEMPLATES
}


/** Deep-clone plain canvas JSON. Vue proxies are not structuredClone-safe. */
function cloneDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value as object))) as T
}

/** Blank canvas JSON for a template, without touching the open document. */
export function cloneTemplate(templateId: TemplateId): CanvasDocumentJSON {
  return cloneDoc(TEMPLATES[templateId]) as CanvasDocumentJSON
}

/** 旧「人类-AI 双三角」模板里的示例条目。原文未改时清掉，让格子回到参考图的空白可填区。 */
const LEGACY_HAI_SEED_TEXTS = new Set([
  '1. AI先理解，后提问',
  '1. 个人场景',
  '2. 业务场景',
  '3. 公司场景',
  '1. Truman美好想象',
  '2. 优秀的教练辅导过程',
  '3. 课上的ROI最佳实践案例',
  '1. 工作流：辅导工作流 #难',
  '2. ROI模型：投入产出分析',
  '3. 科学决策三角形：深度高度宽度',
  '4. 决策深度：简单定性，区间定量，定量公式',
  '1. 提示词',
  '2. Agent多轮打磨',
  '1. 理想案例推演（流程具体化）',
  '2. 课程方法论Datapack',
  '3. 沟通话术Datapack',
  '4. 停车场模型Datapack',
  '5. todolist+Not todolisst',
])

function plainItemText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLegacyHumanAiSeed(item: QuadrantItem): boolean {
  return (
    item.id.startsWith('item_hai_') &&
    LEGACY_HAI_SEED_TEXTS.has(plainItemText(item.text))
  )
}

/** 旧模板把主题名写在 keyword 上；这些值升级为内容主题词，用户改过的词保留。 */
const LEGACY_HAI_KEYWORDS = new Set([
  '创造力',
  '场景',
  '审美',
  '体系',
  '基本功',
  '数据',
  '审美❤️',
  '体系❤️',
  '数据❤️',
])

function humanAiContentKeyword(
  existing: string | undefined,
  fallback: string,
): string {
  const raw = (existing ?? '').trim()
  const plain = raw.replace(/❤|❤️/g, '').trim()
  if (!plain || LEGACY_HAI_KEYWORDS.has(raw) || LEGACY_HAI_KEYWORDS.has(plain)) {
    return fallback
  }
  return raw
}

/**
 * 人类-AI 表格式画布：抬头与配色跟模板走，内容主题词和正文保留用户修改。
 * 几何双三角（另一份模板）不走这里。
 */
function normalizeHumanAiDualTriangleDoc(
  doc: DualTriangleDocumentJSON,
): DualTriangleDocumentJSON {
  const template = dualTriangleHumanAiTemplate as DualTriangleDocumentJSON
  const byId = new Map(doc.blocks.map((b) => [b.id, b]))
  const blocks = template.blocks.map((tb) => {
    const existing = byId.get(tb.id)
    if (!existing) return cloneDoc(tb)
    const items = (Array.isArray(existing.items) ? existing.items : []).filter(
      (it) => !isLegacyHumanAiSeed(it),
    )
    return {
      ...existing,
      side: tb.side,
      title: tb.title,
      subtitle: tb.subtitle,
      keyword: humanAiContentKeyword(existing.keyword, tb.keyword),
      accentColor: tb.accentColor,
      backgroundColor: tb.backgroundColor,
      watermarkIcon: tb.watermarkIcon,
      items,
    }
  })
  const hasFooter =
    !!doc.footer?.lead?.trim() &&
    !!doc.footer.reminders?.some((line) => line.trim())
  return {
    ...doc,
    footer: hasFooter ? doc.footer : template.footer,
    blocks,
  }
}


export type TemplateCategory = 'method' | 'growth' | 'industry' | 'org' | 'review'

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  method: '方法框架',
  growth: '产品增长',
  industry: '行业调研',
  org: '组织协作',
  review: '复盘总结',
}

export const TEMPLATE_META: Record<
  TemplateId,
  { name: string; badge: string; description: string; category: TemplateCategory }
> = {
  'dual-triangle': {
    name: '双三角构建梳理',
    badge: '双三角 · MVP',
    description: '人类三角 × AI 三角，梳理创造力、场景与系统能力闭环。',
    category: 'method',
  },
  'dual-triangle-human-ai': {
    name: '一堂 AI 双三角',
    badge: '双三角 · 预判',
    description:
      '3×2 梳理与预判画布：AI 侧（场景、数据、基本功）与人类侧（审美、体系、创造力），用于判断 AI 场景落地的潜力。',
    category: 'method',
  },
  'star-quadrant': {
    name: 'STAR 四象限',
    badge: 'STAR · MVP',
    description: 'Seek / Try / Act / Reflect 四象限，个人与组织的上下限探索。',
    category: 'method',
  },
  'y-model': {
    name: '一堂Y模型：无限进步画布',
    badge: 'Y模型 · 科学成事',
    description:
      '科学成事道路：理论 × 事实驱动「我的认知」，知行合一解决真正问题，并配套组织管理工具。',
    category: 'method',
  },
  'deliberate-practice': {
    name: '刻意练习',
    badge: '刻意练习 · MVP',
    description: '固定套路 → 非舒适区 → 及时反馈，以大量重复驱动持续进步。',
    category: 'method',
  },
  'demand-triangle': {
    name: '需求评估三角形',
    badge: '需求评估 · MVP',
    description: '普遍性 × 频次 × 刚性三维雷达，叠加对比多个业务方向的需求强度。',
    category: 'growth',
  },
  'five-step-basic': {
    name: '五步法（基础版）',
    badge: '五步法 · 基础',
    description: '系列入门：需求 → 解决方案 → 商业模式 → 增长 → 壁垒，五列等宽空白画布，格内直接填写。',
    category: 'growth',
  },
  'five-step-division': {
    name: '五步法（分工版）',
    badge: '五步法 · 分工',
    description: '系列分工：五列步骤 × 定性取舍 / 定量测量 / 团队分工，十五格协同拆解。',
    category: 'growth',
  },
  'five-step-advanced': {
    name: '五步法（提高版）',
    badge: '五步法 · 提高',
    description: '系列提高：分区固定标题 + 每区一块可编辑富文本，含红色「非*」对照。',
    category: 'growth',
  },
  'five-step-pro': {
    name: '五步法（进阶版）',
    badge: '五步法 · 进阶',
    description: '系列进阶：每个 ● 提示独立可最大化富文本，黑字固定标签在外，红色「非*」对照。',
    category: 'growth',
  },
  'five-step-challenge': {
    name: '五步法（挑战版）',
    badge: '五步法 · 挑战',
    description: '系列挑战：假设 + 五步六列，附图方法全文预填可改富文本（紫方法名 / 橙非* / 蓝要点）。',
    category: 'growth',
  },
  'five-step': {
    name: '五步法（原版）',
    badge: '五步法 · 原版',
    description: '系列原版：需求 → 解决方案 → 商业模式 → 增长 → 壁垒，定性定量一体的方法论画布。',
    category: 'growth',
  },
  'ai-tradeoff': {
    name: 'AI场景取舍评估',
    badge: '取舍评估 · MVP',
    description: '价值侧 × 成本侧二维取舍，用 1-10 分与事实论证筛选值得做的 AI 场景。',
    category: 'growth',
  },
  'product-content': {
    name: '产品内核画布',
    badge: '产品内核 · MVP',
    description: '用户 × 核心指标，加法备选与减法内核假设，并用验证手段迭代认知。',
    category: 'growth',
  },
  oscar: {
    name: 'OSCAR调研画布',
    badge: 'OSCAR · MVP',
    description: '目标 → 范围 → 清单 → 获取 → 用好情报，结构化调研闭环。',
    category: 'industry',
  },
  'industry-analysis': {
    name: '行业分析画布',
    badge: '行业分析 · MVP',
    description: '产业链拆解、变化洞察、稳态预判，叠加周期、天花板与集中度判断。',
    category: 'industry',
  },
  'key-resistance': {
    name: '关键阻力分析画布',
    badge: '关键阻力 · MVP',
    description: '阻力假设 × 消除假设 × 策略文案，动态多行拆解关键转化阻力。',
    category: 'growth',
  },
  'conversion-tradeoff': {
    name: '转化率取舍画布',
    badge: '转化取舍 · MVP',
    description: '优先级 × 动力 × 阻力 × 触点，动态多行拆解转化率取舍。',
    category: 'growth',
  },
  'industry-forecast': {
    name: '行业预判分析框架',
    badge: '行业预判 · MVP',
    description: '六步行业预判：产业链、变化、稳态B点、周期、天花板与集中度。',
    category: 'industry',
  },
  'scientific-meeting': {
    name: '科学开会思考',
    badge: '科学开会 · MVP',
    description: '目标 → 原则 → 关键流程，用结构化三栏梳理高效会议。',
    category: 'org',
  },
  ipo: {
    name: 'IPO梳理画布',
    badge: 'IPO · MVP',
    description: '输入 → 处理 → 输出，叠加目标、模型与反馈闭环的 IPO 梳理画布。',
    category: 'org',
  },
  'incident-review': {
    name: '故障复盘',
    badge: '故障复盘 · MVP',
    description: '详细描述 → 发生过程 → 原因分析 → 解决方案 → 影响范围 → 关联需求 → 反思总结。',
    category: 'review',
  },
  'annual-summary': {
    name: '个人年工作总结',
    badge: '年度总结 · MVP',
    description: '重点业务进展 · 个人成长进步 · 不足与改进计划，结构化年度复盘。',
    category: 'review',
  },
  'weekly-summary': {
    name: '个人周工作总结',
    badge: '周总结 · MVP',
    description: '本周关键执行 · 卡点与应对 · 下周优先事项，侧重执行复盘。',
    category: 'review',
  },
  'monthly-summary': {
    name: '个人月工作总结',
    badge: '月总结 · MVP',
    description: '目标完成情况 · 关键进展与贡献 · 差距与下月计划，侧重目标进展。',
    category: 'review',
  },
  'quarterly-summary': {
    name: '个人季工作总结',
    badge: '季总结 · MVP',
    description: '阶段性成果 · 能力与方法沉淀 · 下季度方向，侧重阶段性成果。',
    category: 'review',
  },
  'deep-review': {
    name: '深度复盘关键成果',
    badge: '深度复盘 · MVP',
    description: '整体评价 → 亮点/问题共识 → 坚持/放弃/新任务 → 过程资产沉淀。',
    category: 'review',
  },
  'pm-retro-value': {
    name: '项目管理复盘挖掘价值',
    badge: '复盘挖掘 · MVP',
    description: 'Before 不挖 vs After 认真挖：把过程资产沉淀为方法、清单与 SOP。',
    category: 'review',
  },
  'roi-tradeoff': {
    name: '综合决策ROI权衡',
    badge: 'ROI权衡 · MVP',
    description: '关键收益 × 关键成本双栏权衡，结构化梳理综合决策的 ROI。',
    category: 'method',
  },
  'roi-decision': {
    name: 'ROI决策评估',
    badge: 'ROI决策 · MVP',
    description: '维度 × 收益/成本动态矩阵，叠加机会成本、时间窗口与最终结论，评估决策 ROI。',
    category: 'method',
  },
  'time-matrix': {
    name: '时间管理矩阵',
    badge: '时间矩阵 · MVP',
    description: '重要 × 紧急四象限（艾森豪威尔矩阵），按 A/B/C/D 分类梳理待办与精力分配。',
    category: 'method',
  },
  'work-state-zones': {
    name: '人生红点工作状态区间',
    badge: '工作状态 · MVP',
    description: '自治 × 舒适区四象限：幸福做事 / 无限进步 / 低头做事 / 自我怀疑，梳理红点工作状态。',
    category: 'method',
  },
  'pm-sensitivity-6d': {
    name: '项目管理6维敏感度模型',
    badge: '6维敏感度 · MVP',
    description: '预算/老板/风险/协作/人力/时间六维雷达，拖拽评分评估项目敏感度，并记录备注。',
    category: 'method',
  },
  'pm-competency': {
    name: '项目管理竞争力测评',
    badge: '竞争力测评 · MVP',
    description: '意识 × 定方案 × 拆计划 × 管执行 × 做复盘五维雷达，0–100 拖拽评分测评项目管理竞争力。',
    category: 'method',
  },
  'scientific-meeting-10p': {
    name: '科学开会十大原则',
    badge: '十大原则 · MVP',
    description: '民主 × 落实 × 激发 × 点燃 × 投入 × 高效 × 学习 × 责任 × 务实 × 良性十瓣花，0–100 评分刻画科学开会原则践行度。',
    category: 'org',
  },
  'product-features-5d': {
    name: '产品内容5维特征',
    badge: '5维特征 · MVP',
    description: '开放性 × 投入性 × 易错性 × 迭代性 × 创新性五维雷达，0–100 拖拽评分刻画产品内容特征。',
    category: 'growth',
  },
  'pm-solution-triangle': {
    name: '项目管理方案评估三角形',
    badge: '方案评估 · MVP',
    description: '投入产出比ROI × 机会成本 × 机会窗口三角雷达，0–100 拖拽评分评估项目管理方案，并记录备注。',
    category: 'method',
  },
  'online-offline-comm': {
    name: '线上线下沟通',
    badge: '线上线下 · MVP',
    description: '线上/线下 × 异步/同步四象限，梳理文档、看板、消息、当面与封闭研发等沟通方式。',
    category: 'org',
  },
  'unit-model-quadrant': {
    name: '单元模型象限',
    badge: '单元模型 · MVP',
    description: '单元模型成立与否 × 公司账成立与否四象限，区分健康模型、总部成本过高、放弃调整与不存在区间。',
    category: 'growth',
  },
  'growth-assumptions': {
    name: '增长假设清单',
    badge: '增长假设 · MVP',
    description: '关键假设 → 提出者/时间 → 负责人 → 验证结果，表格化跟踪增长假设。',
    category: 'growth',
  },
  'business-formula': {
    name: '业务公式',
    badge: '业务公式 · MVP',
    description: '深度解构业务逻辑，发现增长杠杆',
    category: 'growth',
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
  /** Local draft kept when a 409 replaces the editor with the server copy. */
  const conflict = ref<{ draft: CanvasDocumentJSON } | null>(null)
  const conflictKey = 'metamatrix:save-conflict'

  function rememberConflict(id: string, draft: CanvasDocumentJSON) {
    conflict.value = { draft }
    try {
      sessionStorage.setItem(conflictKey, JSON.stringify({ id, draft }))
    } catch {
      /* private mode or quota */
    }
  }

  function discardConflict() {
    conflict.value = null
    try {
      sessionStorage.removeItem(conflictKey)
    } catch {
      /* ignore */
    }
  }

  function hydrateConflict(id: string) {
    try {
      const raw = sessionStorage.getItem(conflictKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { id?: string; draft?: CanvasDocumentJSON }
      if (parsed.id === id && parsed.draft) conflict.value = { draft: parsed.draft }
      else if (parsed.id && parsed.id !== id) conflict.value = null
    } catch {
      conflict.value = null
    }
  }
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
  const isFiveStepDivision = computed(() =>
    isFiveStepDivisionDoc(current_data.value),
  )
  const isFiveStepBasic = computed(() =>
    isFiveStepBasicDoc(current_data.value),
  )
  const isFiveStepAdvanced = computed(() =>
    isFiveStepAdvancedDoc(current_data.value),
  )
  const isFiveStepPro = computed(() =>
    isFiveStepProDoc(current_data.value),
  )
  const isFiveStepChallenge = computed(() =>
    isFiveStepChallengeDoc(current_data.value),
  )
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
  const isPeriodSummary = computed(() =>
    isPeriodSummaryDoc(current_data.value),
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


  const GA_CELLS: GrowthAssumptionsCellKey[] = [
    'assumption',
    'proposer',
    'proposedAt',
    'owner',
    'result',
  ]

  function asGrowthAssumptions(): GrowthAssumptionsDocumentJSON | null {
    return isGrowthAssumptionsDoc(current_data.value)
      ? current_data.value
      : null
  }

  function parseGrowthAssumptionsCellId(
    blockId: string,
  ): { rowId: string; cell: GrowthAssumptionsCellKey } | null {
    const idx = blockId.lastIndexOf(':')
    if (idx <= 0) return null
    const rowId = blockId.slice(0, idx)
    const cell = blockId.slice(idx + 1) as GrowthAssumptionsCellKey
    if (!GA_CELLS.includes(cell)) return null
    return { rowId, cell }
  }

  function findGrowthAssumptionsCell(
    blockId: string,
  ): { row: GrowthAssumptionsRow; cell: GrowthAssumptionsCellKey } | null {
    const doc = asGrowthAssumptions()
    if (!doc) return null
    const parsed = parseGrowthAssumptionsCellId(blockId)
    if (!parsed) return null
    const row = doc.rows.find((r) => r.id === parsed.rowId)
    if (!row) return null
    return { row, cell: parsed.cell }
  }

  function emptyGrowthAssumptionsRow(): GrowthAssumptionsRow {
    const mk = (): QuadrantItem[] => [
      {
        id: createItemId(),
        text: '',
        style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
      },
    ]
    return {
      id: createRowId(),
      assumption: mk(),
      proposer: mk(),
      proposedAt: mk(),
      owner: mk(),
      result: mk(),
    }
  }

  function addGrowthAssumptionsRow(): GrowthAssumptionsRow | null {
    const doc = asGrowthAssumptions()
    if (!doc) return null
    const row = emptyGrowthAssumptionsRow()
    doc.rows = [...doc.rows, row]
    markDirty()
    return row
  }

  function removeGrowthAssumptionsRow(rowId: string): boolean {
    const doc = asGrowthAssumptions()
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


  const RD_FIXED_BLOCKS: RoiDecisionFixedBlockId[] = [
    'opportunityCost',
    'timeWindow',
    'conclusion',
  ]

  const RD_FIXED_TITLE: Record<RoiDecisionFixedBlockId, string> = {
    opportunityCost: '机会成本',
    timeWindow: '时间窗口',
    conclusion: '最终结论',
  }

  function asRoiDecision(): RoiDecisionDocumentJSON | null {
    return isRoiDecisionDoc(current_data.value) ? current_data.value : null
  }

  function emptyRoiDecisionCellItems() {
    return [
      {
        id: createItemId(),
        text: '',
        style: { color: '#202124', fontSize: 14, fontWeight: '500' as const },
      },
    ]
  }

  function makeRoiDecisionRow(dimension = '新维度'): RoiDecisionRow {
    const id = createRowId()
    return {
      id,
      dimension,
      benefitBlockId: `${id}:benefit`,
      costBlockId: `${id}:cost`,
    }
  }

  function upsertRoiDecisionBlock(
    byId: Map<string, { id: string; title: string; items: QuadrantItem[] }>,
    id: string,
    title: string,
  ) {
    const existing = byId.get(id)
    if (existing) return existing
    return {
      id,
      title,
      items: emptyRoiDecisionCellItems(),
    }
  }

  /** 确保 ROI 决策评估：每行收益/成本块 + 机会成本/时间窗口/最终结论 */
  function ensureRoiDecisionBlocks(): boolean {
    const d = asRoiDecision()
    if (!d) return false
    if (!Array.isArray(d.rows)) d.rows = []
    if (!Array.isArray(d.blocks)) d.blocks = []
    if (d.rows.length === 0) {
      d.rows = [
        makeRoiDecisionRow('基础ROI'),
        makeRoiDecisionRow('长期视角'),
        makeRoiDecisionRow('公司视角'),
      ]
    }

    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    const next: typeof d.blocks = []
    const keep = new Set<string>()

    for (const row of d.rows) {
      if (!row.benefitBlockId) row.benefitBlockId = `${row.id}:benefit`
      if (!row.costBlockId) row.costBlockId = `${row.id}:cost`
      keep.add(row.benefitBlockId)
      keep.add(row.costBlockId)
      next.push(upsertRoiDecisionBlock(byId, row.benefitBlockId, '收益项'))
      next.push(upsertRoiDecisionBlock(byId, row.costBlockId, '成本项'))
    }

    for (const id of RD_FIXED_BLOCKS) {
      keep.add(id)
      next.push(upsertRoiDecisionBlock(byId, id, RD_FIXED_TITLE[id]))
    }

    const same =
      d.blocks.length === next.length &&
      d.blocks.every((b, i) => b.id === next[i].id && b === next[i])
    if (!same) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }

  function updateRoiDecisionDimension(rowId: string, dimension: string): boolean {
    const doc = asRoiDecision()
    if (!doc) return false
    const row = doc.rows.find((r) => r.id === rowId)
    if (!row) return false
    row.dimension = dimension
    markDirty()
    return true
  }

  function addRoiDecisionRow(dimension = '新维度'): RoiDecisionRow | null {
    const doc = asRoiDecision()
    if (!doc) return null
    const row = makeRoiDecisionRow(dimension)
    doc.rows = [...doc.rows, row]
    // seed blocks immediately
    if (!Array.isArray(doc.blocks)) doc.blocks = []
    doc.blocks = [
      ...doc.blocks,
      {
        id: row.benefitBlockId,
        title: '收益项',
        items: emptyRoiDecisionCellItems(),
      },
      {
        id: row.costBlockId,
        title: '成本项',
        items: emptyRoiDecisionCellItems(),
      },
    ]
    markDirty()
    return row
  }

  function removeRoiDecisionRow(rowId: string): boolean {
    const doc = asRoiDecision()
    if (!doc) return false
    if (doc.rows.length <= 1) return false
    const row = doc.rows.find((r) => r.id === rowId)
    if (!row) return false
    doc.rows = doc.rows.filter((r) => r.id !== rowId)
    const drop = new Set([row.benefitBlockId, row.costBlockId])
    doc.blocks = doc.blocks.filter((b) => !drop.has(b.id))
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
    let local = loadLocal(id)
    const meta = loadLocalMeta(id)
    if (local) {
      current_data.value = normalizeLoadedDoc(local, id)
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
      cloneDoc(template) as CanvasDocumentJSON,
      id,
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
      cloneDoc(template) as CanvasDocumentJSON,
      id,
    )
    dirty.value = false
    head_revision_id.value = null
    document_id.value = null
    clearMeta()
    doc_title.value = TEMPLATE_META[id]?.name || ''
  }

  /** 加载后温和升级已知模板结构（Y 模型 + attachmentsByPanelId） */
  function normalizeLoadedDoc(
    doc: CanvasDocumentJSON,
    templateId?: TemplateId | string | null,
  ): CanvasDocumentJSON {
    const tid = templateId ?? activeTemplateId.value
    let next: CanvasDocumentJSON = coerceYModelDoc(doc, tid)
    if (isYModelDoc(next)) {
      next = normalizeYModelDoc(next)
    }
    if (isFiveStepProDoc(next)) {
      next = normalizeFiveStepProDoc(next)
    }
    if (isFiveStepFamilyDoc(next)) {
      next = applyFiveStepChrome(next)
    }
    if (
      isDualTriangleDoc(next) &&
      (tid === 'dual-triangle-human-ai' ||
        next.id === 'canvas_dual_triangle_human_ai')
    ) {
      next = normalizeHumanAiDualTriangleDoc(next)
    }
    if (!next.attachmentsByPanelId) {
      next = { ...next, attachmentsByPanelId: {} }
    }
    return {
      ...next,
      theme: normalizeCanvasTheme(next.theme),
    }
  }

  /** 温和升级进阶版：旧 upper 合并块 → 每提示独立 RTE */
  function normalizeFiveStepProDoc(
    doc: FiveStepProDocumentJSON,
  ): FiveStepProDocumentJSON {
    const template = fiveStepProTemplate as FiveStepProDocumentJSON
    const byId = new Map<string, (typeof doc.blocks)[number]>(
      (Array.isArray(doc.blocks) ? doc.blocks : []).map((b) => [b.id, b]),
    )
    const requiredIds = template.blocks.map((b) => b.id)
    const missing = requiredIds.some((id) => !byId.has(id))
    const hasLegacy = [
      'demand_upper',
      'solution_upper',
      'business_upper',
      'growth_upper',
    ].some((id) => byId.has(id))

    const colSame =
      Array.isArray(doc.columns) &&
      doc.columns.length === template.columns.length &&
      doc.columns.every((c, i) => {
        const tc = template.columns[i]
        return (
          c.id === tc.id &&
          Array.isArray(c.sections) &&
          c.sections.length === tc.sections.length &&
          c.sections.every(
            (s, j) =>
              s.blockId === tc.sections[j].blockId &&
              s.label === tc.sections[j].label &&
              s.tone === tc.sections[j].tone,
          )
        )
      })

    if (!missing && !hasLegacy && colSame) return doc

    const nextBlocks = template.blocks.map((tb) => {
      const existing = byId.get(tb.id)
      if (existing) {
        return {
          id: tb.id,
          title: existing.title || tb.title,
          keyword: existing.keyword != null ? existing.keyword : tb.keyword,
          items: Array.isArray(existing.items) ? existing.items : [],
        }
      }
      return {
        id: tb.id,
        title: tb.title,
        keyword: tb.keyword,
        items: [] as typeof tb.items,
      }
    })

    return {
      ...doc,
      footer: doc.footer ?? template.footer,
      columns: template.columns.map((c) => ({
        id: c.id,
        header: c.header,
        footerLabel: c.footerLabel,
        sections: c.sections.map((s) => ({
          blockId: s.blockId,
          label: s.label,
          tone: s.tone,
        })),
      })),
      blocks: nextBlocks,
    }
  }

  function fiveStepFamilyTemplate(
    doc: FiveStepFamilyDocumentJSON,
  ): FiveStepFamilyDocumentJSON {
    switch (doc.type) {
      case 'five_step':
        return fiveStepTemplate as FiveStepDocumentJSON
      case 'five_step_division':
        return fiveStepDivisionTemplate as FiveStepDivisionDocumentJSON
      case 'five_step_basic':
        return fiveStepBasicTemplate as FiveStepBasicDocumentJSON
      case 'five_step_advanced':
        return fiveStepAdvancedTemplate as FiveStepAdvancedDocumentJSON
      case 'five_step_pro':
        return fiveStepProTemplate as FiveStepProDocumentJSON
      case 'five_step_challenge':
        return fiveStepChallengeTemplate as FiveStepChallengeDocumentJSON
    }
  }

  /**
   * 旧五步法文档没有主题词和页脚时，用模板补上。
   * 用户已经写过的 keyword / footer 保留。仍写在 current_data 里。
   */
  function applyFiveStepChrome(
    doc: FiveStepFamilyDocumentJSON,
  ): FiveStepFamilyDocumentJSON {
    const template = fiveStepFamilyTemplate(doc)
    const templateKeywords = new Map(
      template.blocks.map((block) => [block.id, block.keyword]),
    )
    let changed = false
    const blocks = doc.blocks.map((block) => {
      const fallback = templateKeywords.get(block.id)
      if (block.keyword != null || !fallback) return block
      changed = true
      return { ...block, keyword: fallback }
    })
    const hasFooter =
      !!doc.footer?.lead?.trim() &&
      !!doc.footer.reminders?.some((line) => line.trim())
    if (!changed && (hasFooter || !template.footer)) return doc
    return {
      ...doc,
      blocks: (changed ? blocks : doc.blocks) as typeof doc.blocks,
      footer: hasFooter ? doc.footer : template.footer,
    } as FiveStepFamilyDocumentJSON
  }

  function ensureAttachmentsMap(): AttachmentsByPanelId | null {
    const doc = current_data.value
    if (!doc) return null
    if (!doc.attachmentsByPanelId) {
      doc.attachmentsByPanelId = {}
    }
    return doc.attachmentsByPanelId
  }

  function setPanelToolbarOrder(panelId: string, order: readonly string[]) {
    const doc = current_data.value
    if (!doc || !panelId) return
    const prev = JSON.stringify(doc.toolbarGroupOrderByPanelId ?? null)
    const next = writeToolbarGroupOrder(doc.toolbarGroupOrderByPanelId, panelId, order)
    if (next) doc.toolbarGroupOrderByPanelId = next
    else delete doc.toolbarGroupOrderByPanelId
    if (JSON.stringify(doc.toolbarGroupOrderByPanelId ?? null) !== prev) markDirty()
  }

  function getPanelPageSize(panelId: string) {
    return readPageSize(current_data.value?.pageSizeByPanelId, panelId)
  }

  function setPanelPageSize(panelId: string, size: string) {
    const doc = current_data.value
    if (!doc || !panelId) return
    const next = writePageSizeMap(doc.pageSizeByPanelId, panelId, normalizePageSize(size))
    const prev = JSON.stringify(doc.pageSizeByPanelId ?? null)
    if (next) doc.pageSizeByPanelId = next
    else delete doc.pageSizeByPanelId
    if (JSON.stringify(doc.pageSizeByPanelId ?? null) !== prev) markDirty()
  }

  function setPanelPageMargin(panelId: string, margin: PageMargin, pageIsPaper: boolean) {
    const doc = current_data.value
    if (!doc || !panelId) return
    const normalized = normalizePageMargin(margin)
    if (!normalized) return
    const prev = JSON.stringify(doc.pageMarginByPanelId ?? null)
    const next = writePageMargin(doc.pageMarginByPanelId, panelId, normalized, pageIsPaper)
    if (next) doc.pageMarginByPanelId = next
    else delete doc.pageMarginByPanelId
    if (JSON.stringify(doc.pageMarginByPanelId ?? null) !== prev) markDirty()
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
    } catch {
      console.warn('[documentStore.persistLocalMeta] failed')
      return false
    }
  }

  function loadLocalMeta(templateId?: string | null): LocalDocMeta | null {
    try {
      const raw = localStorage.getItem(localMetaKey(templateId))
      if (!raw) return null
      return JSON.parse(raw) as LocalDocMeta
    } catch {
      console.warn('[documentStore.loadLocalMeta] failed')
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
    } catch {
      console.warn('[documentStore.persistLocal] failed')
      return false
    }
  }

  function loadLocal(templateId?: string | null): CanvasDocumentJSON | null {
    try {
      const key = localStorageKey(templateId)
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw) as CanvasDocumentJSON
    } catch {
      console.warn('[documentStore.loadLocal] failed')
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
      hydrateConflict(doc.id)
      rememberRecentOpen({
        id: doc.id,
        title: doc.title || '未命名文档',
        templateId: doc.templateId || activeTemplateId.value || 'dual-triangle',
      })
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
      (cloneDoc(TEMPLATES[tid]) as CanvasDocumentJSON)
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
        data: normalizeLoadedDoc(cloneDoc(data) as CanvasDocumentJSON),
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
          const draft = current_data.value ? cloneDoc(current_data.value) : null
          try {
            await load(id)
          } catch {
            throw new Error('保存冲突，但拉取云端版本失败。本地修改还在，请稍后重试。')
          }
          if (draft) rememberConflict(id, draft)
          throw new Error('内容已在其他地方更新，已载入云端版本。')
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
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && document_id.value) {
        await load(document_id.value)
        throw new Error('存版时云端已有更新，已重新载入最新版本。请再存一次。')
      }
      throw e
    } finally {
      saving.value = false
    }
  }

  async function restoreRevision(revisionId: string): Promise<void> {
    if (!document_id.value) throw new Error('尚未建档')
    saving.value = true
    try {
      const doc = await documentsApi.restoreDocument(document_id.value, {
        revisionId,
        expectedHeadRevisionId: head_revision_id.value,
      })
      await load(doc.id)
      dirty.value = false
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && document_id.value) {
        await load(document_id.value)
        throw new Error('恢复时云端已有更新，已重新载入最新版本。请再试一次。')
      }
      throw e
    } finally {
      saving.value = false
    }
  }

  async function restoreConflictDraft(): Promise<void> {
    const draft = conflict.value?.draft
    const id = document_id.value
    if (!draft || !id) {
      throw new Error('没有可恢复的本地修改')
    }
    current_data.value = cloneDoc(draft)
    dirty.value = true
    try {
      await save()
      discardConflict()
    } catch (e) {
      rememberConflict(id, draft)
      if (e instanceof ApiError && e.status === 409) {
        throw new Error('云端又更新了一次。你的修改还在，可以再试一次覆盖保存。')
      }
      if (e instanceof Error && /其他地方更新/.test(e.message)) {
        throw new Error('云端又更新了一次。你的修改还在，可以再试一次覆盖保存。')
      }
      throw e
    }
  }

  async function listMyDocuments(templateId?: string, limit?: number) {
    return documentsApi.listDocuments({
      ...(templateId ? { templateId } : {}),
      ...(limit != null ? { limit } : {}),
    })
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


    const ga = findGrowthAssumptionsCell(blockId)
    if (ga) {
      const item: QuadrantItem = {
        id: partial?.id ?? createItemId(),
        text: partial?.text ?? '新条目',
        ...(partial?.style ? { style: { ...partial.style } } : {}),
      }
      ga.row[ga.cell] = [...ga.row[ga.cell], item]
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

  /**
   * 内容主题词，写在 block.keyword 上（current_data，不另建表）。
   * 人类-AI 双三角与五步法系列共用。
   */
  function updateBlockKeyword(blockId: string, keyword: string): boolean {
    const doc = current_data.value
    if (!doc || (!isDualTriangleDoc(doc) && !isFiveStepFamilyDoc(doc))) {
      return false
    }
    const block = doc.blocks.find((b) => b.id === blockId)
    if (!block) return false
    const next = keyword.trim()
    if (block.keyword === next) return true
    block.keyword = next
    markDirty()
    return true
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


    const ga = findGrowthAssumptionsCell(blockId)
    if (ga) {
      const items = ga.row[ga.cell]
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
      ga.row[ga.cell] = nextItems
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


    const ga = findGrowthAssumptionsCell(blockId)
    if (ga) {
      const items = ga.row[ga.cell]
      const itemIdx = items.findIndex((it) => it.id === id)
      if (itemIdx < 0) return false
      ga.row[ga.cell] = items.filter((it) => it.id !== id)
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



  function asPmSensitivity6d(): PmSensitivity6dDocumentJSON | null {
    return isPmSensitivity6dDoc(current_data.value) ? current_data.value : null
  }

  function updatePmSensitivity6dScore(
    axis: PmSensitivity6dAxisId,
    value: number,
  ): boolean {
    const d = asPmSensitivity6d()
    if (!d) return false
    const raw = Number(value)
    if (!Number.isFinite(raw)) return false
    const v = Math.min(100, Math.max(0, Math.round(raw)))
    d.scores = { ...d.scores, [axis]: v }
    markDirty()
    return true
  }

  function updatePmSensitivity6dScores(
    patch: Partial<PmSensitivity6dScores>,
  ): boolean {
    const d = asPmSensitivity6d()
    if (!d) return false
    const next = { ...d.scores }
    for (const key of Object.keys(patch) as PmSensitivity6dAxisId[]) {
      const raw = patch[key]
      if (raw == null) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(100, Math.max(0, Math.round(n)))
    }
    d.scores = next
    markDirty()
    return true
  }

  const PM_SENSITIVITY_6D_AXIS_ORDER: PmSensitivity6dAxisId[] = [
    'budget',
    'boss',
    'risk',
    'collaboration',
    'manpower',
    'time',
  ]

  const PM_SENSITIVITY_6D_DEFAULT_TITLE: Record<PmSensitivity6dAxisId, string> = {
    budget: '预算敏感',
    boss: '老板敏感',
    risk: '风险敏感',
    collaboration: '协作敏感',
    manpower: '人力敏感',
    time: '时间敏感',
  }

  /** 确保六轴各有一块 RTE；旧 1–4 分制一次性 ×25 迁到 0–100 */
  function ensurePmSensitivity6dBlocks(): boolean {
    const d = asPmSensitivity6d()
    if (!d) return false
    let changed = false

    if (!Array.isArray(d.blocks)) {
      d.blocks = []
      changed = true
    }
    if (!d.axes || typeof d.axes !== 'object') {
      d.axes = {} as PmSensitivity6dDocumentJSON['axes']
      changed = true
    }
    if (!d.scores || typeof d.scores !== 'object') {
      d.scores = {} as PmSensitivity6dScores
      changed = true
    }

    for (const axis of PM_SENSITIVITY_6D_AXIS_ORDER) {
      if (!d.axes[axis]) {
        d.axes[axis] = {
          id: axis,
          title: PM_SENSITIVITY_6D_DEFAULT_TITLE[axis],
        }
        changed = true
      }
    }

    // 旧 1–4 环吸附分制：若当前最大分 ≤4，一次性 ×25 迁到 0–100
    const scoreVals = PM_SENSITIVITY_6D_AXIS_ORDER.map((a) => Number(d.scores[a]))
    const finite = scoreVals.filter((n) => Number.isFinite(n))
    if (finite.length > 0) {
      const maxScore = Math.max(...finite)
      if (maxScore <= 4) {
        const nextScores = { ...d.scores }
        for (const axis of PM_SENSITIVITY_6D_AXIS_ORDER) {
          const raw = Number(d.scores[axis])
          const base = Number.isFinite(raw) ? raw : 0
          nextScores[axis] = Math.min(100, Math.max(0, Math.round(base * 25)))
        }
        d.scores = nextScores
        changed = true
      }
    }

    for (const axis of PM_SENSITIVITY_6D_AXIS_ORDER) {
      const raw = Number(d.scores[axis])
      if (!Number.isFinite(raw)) {
        d.scores[axis] = 0
        changed = true
      } else {
        const clamped = Math.min(100, Math.max(0, Math.round(raw)))
        if (clamped !== d.scores[axis]) {
          d.scores[axis] = clamped
          changed = true
        }
      }
    }

    const byId = new Map(d.blocks.map((b) => [b.id as string, b]))
    const next = PM_SENSITIVITY_6D_AXIS_ORDER.map((axis) => {
      const existing = byId.get(axis)
      const title =
        d.axes[axis]?.title || PM_SENSITIVITY_6D_DEFAULT_TITLE[axis] || axis
      if (existing) {
        if (existing.title !== title) {
          changed = true
          return { ...existing, id: axis, title }
        }
        return { ...existing, id: axis }
      }
      changed = true
      return {
        id: axis,
        title,
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })

    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }

  function asPmCompetency(): PmCompetencyDocumentJSON | null {
    return isPmCompetencyDoc(current_data.value) ? current_data.value : null
  }

  function updatePmCompetencyScore(
    axis: PmCompetencyAxisId,
    value: number,
  ): boolean {
    const d = asPmCompetency()
    if (!d) return false
    const raw = Number(value)
    if (!Number.isFinite(raw)) return false
    const v = Math.min(100, Math.max(0, raw))
    d.scores = { ...d.scores, [axis]: v }
    markDirty()
    return true
  }

  function updatePmCompetencyScores(
    patch: Partial<PmCompetencyScores>,
  ): boolean {
    const d = asPmCompetency()
    if (!d) return false
    const next = { ...d.scores }
    for (const key of Object.keys(patch) as PmCompetencyAxisId[]) {
      const raw = patch[key]
      if (raw == null) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(100, Math.max(0, n))
    }
    d.scores = next
    markDirty()
    return true
  }


  const PM_COMPETENCY_AXIS_ORDER: PmCompetencyAxisId[] = [
    'awareness',
    'review',
    'execution',
    'plan',
    'proposal',
  ]

  /** 确保五轴各有一块 RTE（替换旧 notes；缺轴则补齐） */
  function ensurePmCompetencyBlocks(): boolean {
    const d = asPmCompetency()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    if (!d.axes || typeof d.axes !== 'object') {
      d.axes = {} as PmCompetencyDocumentJSON['axes']
    }
    for (const axis of PM_COMPETENCY_AXIS_ORDER) {
      if (!d.axes[axis]) {
        d.axes[axis] = { id: axis, title: axis }
      }
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = PM_COMPETENCY_AXIS_ORDER.map((axis) => {
      const existing = byId.get(axis)
      const title = d.axes[axis]?.title || axis
      if (existing) {
        if (existing.title !== title) {
          changed = true
          return { ...existing, title }
        }
        return existing
      }
      changed = true
      return {
        id: axis,
        title,
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }



  function asScientificMeeting10p(): ScientificMeeting10pDocumentJSON | null {
    return isScientificMeeting10pDoc(current_data.value) ? current_data.value : null
  }

  function updateScientificMeeting10pScore(
    axis: ScientificMeeting10pAxisId,
    value: number,
  ): boolean {
    const d = asScientificMeeting10p()
    if (!d) return false
    const raw = Number(value)
    if (!Number.isFinite(raw)) return false
    const v = Math.min(100, Math.max(0, raw))
    d.scores = { ...d.scores, [axis]: v }
    markDirty()
    return true
  }

  function updateScientificMeeting10pScores(
    patch: Partial<ScientificMeeting10pScores>,
  ): boolean {
    const d = asScientificMeeting10p()
    if (!d) return false
    const next = { ...d.scores }
    for (const key of Object.keys(patch) as ScientificMeeting10pAxisId[]) {
      const raw = patch[key]
      if (raw == null) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(100, Math.max(0, n))
    }
    d.scores = next
    markDirty()
    return true
  }

  const SM10P_AXIS_ORDER: ScientificMeeting10pAxisId[] = [
    'democratic',
    'implementable',
    'motivating',
    'inspiring',
    'devoting',
    'efficient',
    'learning',
    'responsible',
    'pragmatic',
    'friendly',
  ]

  const SM10P_DEFAULT_TITLE: Record<ScientificMeeting10pAxisId, string> = {
    democratic: '民主',
    implementable: '落实',
    motivating: '激发',
    inspiring: '点燃',
    devoting: '投入',
    efficient: '高效',
    learning: '学习',
    responsible: '责任',
    pragmatic: '务实',
    friendly: '良性',
  }

  /** 确保十瓣各有一块 RTE（缺轴则补齐） */
  function ensureScientificMeeting10pBlocks(): boolean {
    const d = asScientificMeeting10p()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    if (!d.axes || typeof d.axes !== 'object') {
      d.axes = {} as ScientificMeeting10pDocumentJSON['axes']
    }
    if (!d.scores || typeof d.scores !== 'object') {
      d.scores = {} as ScientificMeeting10pScores
    }
    for (const axis of SM10P_AXIS_ORDER) {
      if (!d.axes[axis]) {
        d.axes[axis] = { id: axis, title: SM10P_DEFAULT_TITLE[axis] }
      }
      if (d.scores[axis] == null || !Number.isFinite(Number(d.scores[axis]))) {
        d.scores[axis] = 75
      }
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = SM10P_AXIS_ORDER.map((axis) => {
      const existing = byId.get(axis)
      const title = d.axes[axis]?.title || SM10P_DEFAULT_TITLE[axis]
      if (existing) {
        if (existing.title !== title) {
          changed = true
          return { ...existing, title }
        }
        return existing
      }
      changed = true
      return {
        id: axis,
        title,
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }


  function asProductFeatures5d(): ProductFeatures5dDocumentJSON | null {
    return isProductFeatures5dDoc(current_data.value) ? current_data.value : null
  }

  function updateProductFeatures5dScore(
    axis: ProductFeatures5dAxisId,
    value: number,
  ): boolean {
    const d = asProductFeatures5d()
    if (!d) return false
    const raw = Number(value)
    if (!Number.isFinite(raw)) return false
    const v = Math.min(100, Math.max(0, raw))
    d.scores = { ...d.scores, [axis]: v }
    markDirty()
    return true
  }

  function updateProductFeatures5dScores(
    patch: Partial<ProductFeatures5dScores>,
  ): boolean {
    const d = asProductFeatures5d()
    if (!d) return false
    const next = { ...d.scores }
    for (const key of Object.keys(patch) as ProductFeatures5dAxisId[]) {
      const raw = patch[key]
      if (raw == null) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(100, Math.max(0, n))
    }
    d.scores = next
    markDirty()
    return true
  }

  const PRODUCT_FEATURES_5D_AXIS_ORDER: ProductFeatures5dAxisId[] = [
    'openness',
    'engagement',
    'error_prone',
    'iterativity',
    'innovation',
  ]

  const PRODUCT_FEATURES_5D_DEFAULT_TITLE: Record<ProductFeatures5dAxisId, string> = {
    openness: '开放性',
    engagement: '投入性',
    error_prone: '易错性',
    iterativity: '迭代性',
    innovation: '创新性',
  }

  /** 确保五轴各有一块 RTE（缺轴则补齐） */
  function ensureProductFeatures5dBlocks(): boolean {
    const d = asProductFeatures5d()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    if (!d.axes || typeof d.axes !== 'object') {
      d.axes = {} as ProductFeatures5dDocumentJSON['axes']
    }
    if (!d.scores || typeof d.scores !== 'object') {
      d.scores = {} as ProductFeatures5dScores
    }
    for (const axis of PRODUCT_FEATURES_5D_AXIS_ORDER) {
      if (!d.axes[axis]) {
        d.axes[axis] = {
          id: axis,
          title: PRODUCT_FEATURES_5D_DEFAULT_TITLE[axis],
        }
      }
      if (d.scores[axis] == null || !Number.isFinite(Number(d.scores[axis]))) {
        const defaults: ProductFeatures5dScores = {
          openness: 100,
          engagement: 60,
          error_prone: 40,
          iterativity: 50,
          innovation: 100,
        }
        d.scores = { ...d.scores, [axis]: defaults[axis] }
      }
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = PRODUCT_FEATURES_5D_AXIS_ORDER.map((axis) => {
      const existing = byId.get(axis)
      const title =
        d.axes[axis]?.title || PRODUCT_FEATURES_5D_DEFAULT_TITLE[axis] || axis
      if (existing) {
        if (existing.title !== title) {
          changed = true
          return { ...existing, title }
        }
        return existing
      }
      changed = true
      return {
        id: axis,
        title,
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }

  function asPmSolutionTriangle(): PmSolutionTriangleDocumentJSON | null {
    return isPmSolutionTriangleDoc(current_data.value) ? current_data.value : null
  }

  function updatePmSolutionTriangleScore(
    axis: PmSolutionTriangleAxisId,
    value: number,
  ): boolean {
    const d = asPmSolutionTriangle()
    if (!d) return false
    const raw = Number(value)
    if (!Number.isFinite(raw)) return false
    const v = Math.min(100, Math.max(0, raw))
    d.scores = { ...d.scores, [axis]: v }
    markDirty()
    return true
  }

  function updatePmSolutionTriangleScores(
    patch: Partial<PmSolutionTriangleScores>,
  ): boolean {
    const d = asPmSolutionTriangle()
    if (!d) return false
    const next = { ...d.scores }
    for (const key of Object.keys(patch) as PmSolutionTriangleAxisId[]) {
      const raw = patch[key]
      if (raw == null) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(100, Math.max(0, n))
    }
    d.scores = next
    markDirty()
    return true
  }

  const PM_SOLUTION_TRIANGLE_AXIS_ORDER: PmSolutionTriangleAxisId[] = [
    'roi',
    'opportunity_cost',
    'opportunity_window',
  ]

  /** 确保三轴各有一块 RTE（替换旧 notes；缺轴则补齐） */
  function ensurePmSolutionTriangleBlocks(): boolean {
    const d = asPmSolutionTriangle()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    if (!d.axes || typeof d.axes !== 'object') {
      d.axes = {} as PmSolutionTriangleDocumentJSON['axes']
    }
    for (const axis of PM_SOLUTION_TRIANGLE_AXIS_ORDER) {
      if (!d.axes[axis]) {
        d.axes[axis] = { id: axis, title: axis }
      }
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = PM_SOLUTION_TRIANGLE_AXIS_ORDER.map((axis) => {
      const existing = byId.get(axis)
      const title = d.axes[axis]?.title || axis
      if (existing) {
        if (existing.title !== title) {
          changed = true
          return { ...existing, title }
        }
        return existing
      }
      changed = true
      return {
        id: axis,
        title,
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })
    // drop legacy notes / unknown blocks
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }


  const IPO_BLOCK_ORDER: IpoBlockId[] = [
    'input',
    'process',
    'output',
    'goal',
    'pattern',
    'feedback',
  ]

  const IPO_DEFAULT_TITLE: Record<IpoBlockId, string> = {
    input: '输入',
    process: '处理',
    output: '输出',
    goal: '目标',
    pattern: '模型',
    feedback: '反馈',
  }

  function asIpo(): IpoDocumentJSON | null {
    return isIpoDoc(current_data.value) ? current_data.value : null
  }

  /** 确保 IPO 六块各有一块 RTE（缺块则补齐；未知块丢弃） */
  function ensureIpoBlocks(): boolean {
    const d = asIpo()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = IPO_BLOCK_ORDER.map((id) => {
      const existing = byId.get(id)
      if (existing) {
        return existing
      }
      changed = true
      return {
        id,
        title: IPO_DEFAULT_TITLE[id],
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 13, fontWeight: '500' as const },
          },
        ],
      }
    })
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }


  const DP_BLOCK_ORDER: DeliberatePracticeBlockId[] = [
    'premise',
    'node_a',
    'node_b',
    'node_c',
    'node_d',
  ]

  const DP_DEFAULT_TITLE: Record<DeliberatePracticeBlockId, string> = {
    premise: '前提要点',
    node_a: 'A.固定套路',
    node_b: 'B.非舒适区',
    node_c: 'C.及时反馈',
    node_d: 'D.大量重复',
  }

  function asDeliberatePractice(): DeliberatePracticeDocumentJSON | null {
    return isDeliberatePracticeDoc(current_data.value) ? current_data.value : null
  }

  /** 确保刻意练习五块各有一块 RTE（缺块则补齐；保留已有 items） */
  function ensureDeliberatePracticeBlocks(): boolean {
    const d = asDeliberatePractice()
    if (!d) return false
    if (!Array.isArray(d.blocks)) {
      d.blocks = []
    }
    const byId = new Map(d.blocks.map((b) => [b.id, b]))
    let changed = false
    const next = DP_BLOCK_ORDER.map((id) => {
      const existing = byId.get(id)
      if (existing) {
        return existing
      }
      changed = true
      return {
        id,
        title: DP_DEFAULT_TITLE[id],
        items: [
          {
            id: createItemId(),
            text: '',
            style: { color: '#3c4043', fontSize: 14, fontWeight: '500' as const },
          },
        ],
      }
    })
    if (
      changed ||
      d.blocks.length !== next.length ||
      d.blocks.some((b, i) => b.id !== next[i].id)
    ) {
      d.blocks = next
      markDirty()
      return true
    }
    return false
  }


  /** 进阶版：每个 ● 提示独立 RTE；升级旧 demand_upper 等合并块 */
  function ensureFiveStepProBlocks(): boolean {
    if (!isFiveStepProDoc(current_data.value)) return false
    const d = current_data.value
    const template = fiveStepProTemplate as FiveStepProDocumentJSON
    const requiredIds = template.blocks.map((b) => b.id)
    const byId = new Map<string, (typeof d.blocks)[number]>(
      (Array.isArray(d.blocks) ? d.blocks : []).map((b) => [b.id, b]),
    )
    const missing = requiredIds.some((id) => !byId.has(id))
    const legacyIds = [
      'demand_upper',
      'solution_upper',
      'business_upper',
      'growth_upper',
    ]
    const hasLegacy = legacyIds.some((id) => byId.has(id))

    if (!missing && !hasLegacy) {
      // still sync columns section shape if drifted
      const colSame =
        Array.isArray(d.columns) &&
        d.columns.length === template.columns.length &&
        d.columns.every((c, i) => {
          const tc = template.columns[i]
          return (
            c.id === tc.id &&
            Array.isArray(c.sections) &&
            c.sections.length === tc.sections.length &&
            c.sections.every(
              (s, j) =>
                s.blockId === tc.sections[j].blockId &&
                s.label === tc.sections[j].label &&
                s.tone === tc.sections[j].tone,
            )
          )
        })
      if (colSame) return false
    }

    // Preserve user content on surviving / new ids; drop legacy uppers
    const nextBlocks = template.blocks.map((tb) => {
      const existing = byId.get(tb.id)
      if (existing) {
        return {
          id: tb.id,
          title: existing.title || tb.title,
          keyword: existing.keyword != null ? existing.keyword : tb.keyword,
          items: Array.isArray(existing.items) ? existing.items : [],
        }
      }
      return {
        id: tb.id,
        title: tb.title,
        keyword: tb.keyword,
        items: [],
      }
    })

    d.columns = template.columns.map((c) => ({
      id: c.id,
      header: c.header,
      footerLabel: c.footerLabel,
      sections: c.sections.map((s) => ({
        blockId: s.blockId,
        label: s.label,
        tone: s.tone,
      })),
    }))
    if (!d.footer && template.footer) d.footer = template.footer
    d.blocks = nextBlocks
    markDirty()
    return true
  }


  /** 挑战版：六列 + 每要点独立 RTE；缺块/旧单列 blob 时用模板默认 items */
  function ensureFiveStepChallengeBlocks(): boolean {
    if (!isFiveStepChallengeDoc(current_data.value)) return false
    const d = current_data.value
    const template = fiveStepChallengeTemplate as FiveStepChallengeDocumentJSON
    const requiredIds = template.blocks.map((b) => b.id)
    const byId = new Map<string, (typeof d.blocks)[number]>(
      (Array.isArray(d.blocks) ? d.blocks : []).map((b) => [b.id, b]),
    )
    const missing = requiredIds.some((id) => !byId.has(id))
    // 旧版整列 blob + 商业模式曾拆的 business_unit / business_roi（保留 business_unit_io + business_roi；增长为 metric/channel/five_forces）
    const legacyIds = [
      'hypothesis',
      'demand',
      'solution',
      'business',
      'growth',
      'moat',
      'business_unit',
      'growth_channel_now',
      'growth_channel_future',
      'growth_flywheel',
    ]
    const hasLegacy = legacyIds.some((id) => byId.has(id))

    const colSame =
      Array.isArray(d.columns) &&
      d.columns.length === template.columns.length &&
      d.columns.every((c, i) => {
        const tc = template.columns[i]
        return (
          c.id === tc.id &&
          c.header === tc.header &&
          c.footerLabel === tc.footerLabel &&
          Array.isArray(c.sections) &&
          c.sections.length === tc.sections.length &&
          c.sections.every(
            (s, j) =>
              s.blockId === tc.sections[j].blockId &&
              s.label === tc.sections[j].label &&
              s.tone === tc.sections[j].tone,
          )
        )
      })

    if (!missing && !hasLegacy && colSame) return false

    // Preserve user content on surviving tip ids; drop legacy single-column blobs
    const nextBlocks = template.blocks.map((tb) => {
      const existing = byId.get(tb.id)
      if (existing) {
        return {
          id: tb.id,
          title: existing.title || tb.title,
          keyword: existing.keyword != null ? existing.keyword : tb.keyword,
          items: Array.isArray(existing.items)
            ? existing.items
            : JSON.parse(JSON.stringify(tb.items)),
        }
      }
      return {
        id: tb.id,
        title: tb.title,
        keyword: tb.keyword,
        items: JSON.parse(JSON.stringify(tb.items)),
      }
    })

    d.columns = template.columns.map((c) => ({
      id: c.id,
      header: c.header,
      footerLabel: c.footerLabel,
      sections: c.sections.map((s) => ({
        blockId: s.blockId,
        label: s.label,
        tone: s.tone,
      })),
    }))
    if (!d.footer && template.footer) d.footer = template.footer
    d.blocks = nextBlocks
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
    const notesId = demandTriangleNotesBlockId(id)
    const beforeBlocks = doc.blocks.length
    doc.blocks = doc.blocks.filter((b) => b.id !== notesId)
    if (doc.directions.length === before && doc.blocks.length === beforeBlocks) {
      return false
    }
    markDirty()
    return true
  }

  /**
   * 确保每个业务方向都有 notes:<dirId> 描述块（全屏 RTE）。
   * 保留 legend；按当前方向 / 图例条目补齐；清理孤儿描述块。
   */
  function ensureDemandTriangleNotesBlocks(): boolean {
    const doc = asDemandTriangle()
    if (!doc) return false
    if (!Array.isArray(doc.blocks)) {
      doc.blocks = []
    }
    if (!Array.isArray(doc.directions)) {
      doc.directions = []
    }

    const legend =
      doc.blocks.find((b) => b.id === 'legend') ??
      ({
        id: 'legend' as const,
        title: '业务方向',
        items: [],
      })

    const dirIds = new Set<string>()
    for (const d of doc.directions) dirIds.add(d.id)
    for (const it of legend.items ?? []) dirIds.add(it.id)

    const byId = new Map(doc.blocks.map((b) => [b.id, b]))
    const notesBlocks: DemandTriangleNotesBlock[] = []
    let changed = false

    for (const dirId of dirIds) {
      const nid = demandTriangleNotesBlockId(dirId)
      const existing = byId.get(nid) as DemandTriangleNotesBlock | undefined
      const legendItem = (legend.items ?? []).find((it) => it.id === dirId)
      const plain = (legendItem?.text ?? '')
        .replace(/<[^>]+>/g, '')
        .trim()
      const title = plain ? `${plain} · 描述` : '业务方向 · 描述'
      if (existing) {
        if (existing.title !== title) {
          changed = true
          notesBlocks.push({ ...existing, title })
        } else {
          notesBlocks.push(existing)
        }
      } else {
        changed = true
        notesBlocks.push({
          id: nid,
          title,
          items: [
            {
              id: createItemId(),
              text: '',
              style: {
                color: '#3c4043',
                fontSize: 14,
                fontWeight: '500' as const,
              },
            },
          ],
        })
      }
    }

    const keptOthers = doc.blocks.filter((b) => {
      if (b.id === 'legend') return false
      const dir = parseDemandTriangleNotesDirId(String(b.id))
      if (dir != null) return false
      return true
    })

    const next = [legend, ...notesBlocks, ...keptOthers]
    const sameLength = next.length === doc.blocks.length
    const sameIds =
      sameLength && next.every((b, i) => b.id === doc.blocks[i]?.id)
    const sameTitles =
      sameIds &&
      next.every((b, i) => {
        const prev = doc.blocks[i]
        return !prev || prev.title === b.title
      })
    if (changed || !sameIds || !sameTitles) {
      doc.blocks = next
      markDirty()
      return true
    }
    return false
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
    conflict,
    discardConflict,
    restoreConflictDraft,
    restoreRevision,
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
    isFiveStepDivision,
    isFiveStepBasic,
    isFiveStepAdvanced,
    isFiveStepPro,
    isFiveStepChallenge,
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
    isPeriodSummary,
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
    updateBlockKeyword,
    updateBlockItem,
    removeBlockItem,
    updateItemByContainer,
    ensureDemandDirection,
    updateDemandDirectionScores,
    removeDemandDirection,
    ensureDemandTriangleNotesBlocks,
    updatePmSensitivity6dScore,
    updatePmSensitivity6dScores,
    ensurePmSensitivity6dBlocks,
    updatePmCompetencyScore,
    updatePmCompetencyScores,
    ensurePmCompetencyBlocks,
    updateScientificMeeting10pScore,
    updateScientificMeeting10pScores,
    ensureScientificMeeting10pBlocks,
    updateProductFeatures5dScore,
    updateProductFeatures5dScores,
    ensureProductFeatures5dBlocks,
    updatePmSolutionTriangleScore,
    updatePmSolutionTriangleScores,
    ensurePmSolutionTriangleBlocks,
    ensureIpoBlocks,
    ensureDeliberatePracticeBlocks,
    ensureFiveStepProBlocks,
    ensureFiveStepChallengeBlocks,
    updateKeyResistanceRateLabel,
    addKeyResistanceRow,
    removeKeyResistanceRow,
    addGrowthAssumptionsRow,
    removeGrowthAssumptionsRow,
    updateConversionTradeoffPriorityLabel,
    addConversionTradeoffRow,
    removeConversionTradeoffRow,
    ensureRoiDecisionBlocks,
    updateRoiDecisionDimension,
    addRoiDecisionRow,
    removeRoiDecisionRow,
    updateIncidentReviewTimelineTime,
    addIncidentReviewTimelineRow,
    removeIncidentReviewTimelineRow,
    updateScientificMeetingMeta,
    updateDeepReviewMeta,
    setPanelToolbarOrder,
    getPanelPageSize,
    setPanelPageSize,
    setPanelPageMargin,
    getPanelAttachments,
    addPanelAttachment,
    removePanelAttachment,
  }
})
