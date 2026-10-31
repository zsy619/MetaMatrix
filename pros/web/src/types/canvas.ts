export type QuadrantPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type MarkerType = 'dot' | 'icon' | 'note' | 'image'
export type LabelPosition = 'top' | 'bottom' | 'left' | 'right'

export interface ThemeBackground {
  pattern: 'diagonal-lines' | 'none' | string
  color: string
}

export interface CanvasTheme {
  background: ThemeBackground
}

export interface AxisX {
  leftLabel: string
  rightLabel: string
}

export interface AxisY {
  topLabel: string
  bottomLabel: string
}

export interface CanvasAxes {
  x: AxisX
  y: AxisY
}

export interface QuadrantTag {
  text: string
  bgColor: string
  color: string
}

export interface QuadrantWatermark {
  letter: string
  text: string
  color: string
  position: WatermarkPosition
}

export interface QuadrantItemStyle {
  color?: string
  fontSize?: number // px
  fontWeight?: 'normal' | '500' | '600' | '700' | 'bold' | string
  fontFamily?: string
}

export interface QuadrantItem {
  id: string
  text: string
  style?: QuadrantItemStyle
}


/** 面板相关资料（文件 DataURL 或外链） */
export interface PanelAttachment {
  id: string
  name: string
  kind: 'file' | 'url'
  mimeType?: string
  size?: number
  /** 外链 URL */
  url?: string
  /** 本地文件 DataURL（体积受限） */
  dataUrl?: string
  createdAt?: number
}

export type AttachmentsByPanelId = Record<string, PanelAttachment[]>

/** 文档根级资料映射（所有画布通用，缺省 normalize 为 {}） */
export type WithPanelAttachments = {
  attachmentsByPanelId?: AttachmentsByPanelId
}


export interface QuadrantCell {
  position: QuadrantPosition
  title: string
  tag: QuadrantTag
  backgroundColor: string
  watermark: QuadrantWatermark
  items: QuadrantItem[]
}

export interface MarkerNode {
  id: string
  type: MarkerType
  x: string
  y: string
  color: string
  label: string
  labelPosition: LabelPosition
  iconName?: string
}

/** 四象限画布文档 */
export interface QuadrantDocumentJSON {
  id: string
  type: 'quadrant' | 'grid_nm' | 'swot'
  schemaVersion: number
  theme: CanvasTheme
  axes: CanvasAxes
  quadrants: QuadrantCell[]
  markers: MarkerNode[]
}

/** 双三角方块 id */
export type DualTriangleBlockId =
  | 'innovation'
  | 'scenario'
  | 'aesthetics'
  | 'system'
  | 'basics'
  | 'data'

export type DualTriangleSide = 'human' | 'ai'

export interface DualTriangleBlock {
  id: DualTriangleBlockId
  side: DualTriangleSide
  /** 如「创新：创造力」 */
  title: string
  /** 卡片正文区上方的说明文案 */
  subtitle: string
  /** 三角周围关键词，如「创造力」 */
  keyword: string
  accentColor: string
  backgroundColor: string
  watermarkIcon: 'human' | 'ai'
  items: QuadrantItem[]
}

export interface DualTriangleCenter {
  humanTitle: string
  humanSubtitle: string
  aiTitle: string
  aiSubtitle: string
  topArrowText: string
  bottomArrowText: string
  humanColor: string
  aiColor: string
  arrowColor: string
}

/** 双三角构建梳理画布文档 */
export interface DualTriangleDocumentJSON {
  id: string
  type: 'dual_triangle'
  schemaVersion: number
  theme: CanvasTheme
  center: DualTriangleCenter
  blocks: DualTriangleBlock[]
}

/** Y 模型可编辑方块 id */
export type YModelBlockId =
  | 'theory_existing'
  | 'theory_build'
  | 'facts_hypothesis'
  | 'facts_analysis'
  | 'cognition_cause'
  | 'cognition_effect'
  | 'scope'
  | 'tools'
  /** @deprecated 旧文档 id，加载时迁移为 scope */
  | 'problem'

export interface YModelBlock {
  id: YModelBlockId
  /** 方块标题 / 占位引导 */
  title: string
  items: QuadrantItem[]
}

export interface YModelCenter {
  /** 中心主标题，如「我的认知」 */
  title: string
  /** 箴言/副标题，如「实事求是 解放思想」 */
  subtitle: string
  /** Step2：「我的」 */
  prefix?: string
  /** Step2：可填写的认知领域空白 */
  blank?: string
  /** Step2：「认知」 */
  suffix?: string
  stepLabel?: string
}

/** Y 模型无限进步画布文档 */
export interface YModelDocumentJSON {
  id: string
  type: 'y_model'
  schemaVersion: number
  theme: CanvasTheme
  center: YModelCenter
  /** 分区标题文案 */
  labels: {
    /** 页眉主标题：一堂Y模型：无限进步画布 */
    pageTitle?: string
    /** 页眉副标题：科学成事道路 */
    pageSubtitle?: string
    /** 页眉英文副标题 */
    pageSubtitleEn?: string
    theory: string
    facts: string
    /** 竖脊底端静态锚点「解决真正问题」 */
    anchor: string
    toolsPrefix: string
    step1: string
    step2: string
    step3: string
    step4: string
    /** @deprecated 旧五步编号；现与 step4 同义保留兼容 */
    step5: string
    /** 箴言前半「实事求是」 */
    mottoSeek?: string
    /** 箴言后半「解放思想」（强调色） */
    mottoFree?: string
    /** 左臂朝理论 */
    arrowTheoryOut?: string
    /** 左臂朝认知 */
    arrowTheoryIn?: string
    /** 右臂朝事实（强调色） */
    arrowFactsOut?: string
    /** 右臂朝认知 */
    arrowFactsIn?: string
    /** 竖脊「知行合一」 */
    unity?: string
    /** @deprecated 旧字段，兼容读取 */
    problem?: string
    step3Theory?: string
    step3Facts?: string
  }
  blocks: YModelBlock[]
}

/** 刻意练习可编辑方块 id */
export type DeliberatePracticeBlockId =
  | 'premise'
  | 'node_a'
  | 'node_b'
  | 'node_c'
  | 'node_d'

export interface DeliberatePracticeBlock {
  id: DeliberatePracticeBlockId
  title: string
  items: QuadrantItem[]
}

export interface DeliberatePracticeNodeMeta {
  title: string
  color: string
}

/** 刻意练习画布文档 */
export interface DeliberatePracticeDocumentJSON {
  id: string
  type: 'deliberate_practice'
  schemaVersion: number
  theme: CanvasTheme
  labels: {
    premiseTitle: string
    deliberateIsPremise: string
    practiceHasMethod: string
    extractDown: string
    improveUp: string
  }
  nodes: {
    a: DeliberatePracticeNodeMeta
    b: DeliberatePracticeNodeMeta
    c: DeliberatePracticeNodeMeta
    d: DeliberatePracticeNodeMeta & { subtitle: string }
  }
  blocks: DeliberatePracticeBlock[]
}


/** 需求评估三角形 · 轴 id */
export type DemandTriangleAxisId = 'universality' | 'frequency' | 'rigidity'

export interface DemandTriangleScaleLevel {
  label: string
  detail: string
}

export interface DemandTriangleAxisMeta {
  id: DemandTriangleAxisId
  title: string
  /** 由高到低（外→内）四级刻度 */
  levels: DemandTriangleScaleLevel[]
}

export interface DemandTriangleScores {
  universality: number
  frequency: number
  rigidity: number
}

export interface DemandTriangleDirection {
  id: string
  color: string
  stroke: string
  scores: DemandTriangleScores
}

/** 业务方向图例块 */
export interface DemandTriangleLegendBlock {
  id: 'legend'
  title: string
  items: QuadrantItem[]
}

/** 单方向描述富文本块 id：notes:<dirId> */
export type DemandTriangleNotesBlockId = `notes:${string}`

/** 单方向描述块（全屏 RTE） */
export interface DemandTriangleNotesBlock {
  id: DemandTriangleNotesBlockId
  title: string
  items: QuadrantItem[]
}

export type DemandTriangleBlock =
  | DemandTriangleLegendBlock
  | DemandTriangleNotesBlock

/** notes:<dirId> */
export function demandTriangleNotesBlockId(
  dirId: string,
): DemandTriangleNotesBlockId {
  return `notes:${dirId}`
}

export function parseDemandTriangleNotesDirId(
  blockId: string,
): string | null {
  if (!blockId.startsWith('notes:')) return null
  const dirId = blockId.slice('notes:'.length)
  return dirId || null
}

/** 需求评估三角形画布文档 */
export interface DemandTriangleDocumentJSON {
  id: string
  type: 'demand_triangle'
  schemaVersion: number
  theme: CanvasTheme
  axes: {
    universality: DemandTriangleAxisMeta
    frequency: DemandTriangleAxisMeta
    rigidity: DemandTriangleAxisMeta
  }
  directions: DemandTriangleDirection[]
  blocks: DemandTriangleBlock[]
}


/** 五步法画布 · 列 id */
export type FiveStepColumnId =
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

/** 五步法可编辑方块 id */
export type FiveStepBlockId =
  | 'demand_persona'
  | 'demand_problems'
  | 'demand_quant'
  | 'solution_core'
  | 'solution_quant'
  | 'business_model'
  | 'business_unit'
  | 'business_quant'
  | 'growth_metric'
  | 'growth_channels'
  | 'growth_quant'
  | 'moat_qual'
  | 'moat_quant'

export interface FiveStepBlock {
  id: FiveStepBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepColumn {
  id: FiveStepColumnId
  /** 黄底表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
  qualitativeBlockIds: FiveStepBlockId[]
  quantitativeBlockId: FiveStepBlockId
}

/** 五步法画布文档 */
export interface FiveStepDocumentJSON {
  id: string
  type: 'five_step'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepColumn[]
  blocks: FiveStepBlock[]
}


/** 五步法（分工版）· 列 id */
export type FiveStepDivisionColumnId =
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

/** 五步法（分工版）· 行 id */
export type FiveStepDivisionRowId =
  | 'qualitative'
  | 'quantitative'
  | 'team'

/** 五步法（分工版）可编辑方块 id：{col}_{row} */
export type FiveStepDivisionBlockId =
  `${FiveStepDivisionColumnId}_${FiveStepDivisionRowId}`

export interface FiveStepDivisionBlock {
  id: FiveStepDivisionBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepDivisionColumn {
  id: FiveStepDivisionColumnId
  /** 黄底表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
}

export interface FiveStepDivisionRow {
  id: FiveStepDivisionRowId
  /** 左侧竖排维度标签 */
  label: string
}

/** 五步法（分工版）画布文档 */
export interface FiveStepDivisionDocumentJSON {
  id: string
  type: 'five_step_division'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepDivisionColumn[]
  rows: FiveStepDivisionRow[]
  blocks: FiveStepDivisionBlock[]
}

/** 五步法（基础版）· 列 / 方块 id（每列一块富文本） */
export type FiveStepBasicColumnId =
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

export type FiveStepBasicBlockId = FiveStepBasicColumnId

export interface FiveStepBasicBlock {
  id: FiveStepBasicBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepBasicColumn {
  id: FiveStepBasicColumnId
  /** 浅灰表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
}

/** 五步法（基础版）画布文档：五列空白富文本 + 表头/页脚 */
export interface FiveStepBasicDocumentJSON {
  id: string
  type: 'five_step_basic'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepBasicColumn[]
  blocks: FiveStepBasicBlock[]
}


/** 五步法（提高版）· 列 id */
export type FiveStepAdvancedColumnId =
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

/** 固定分区文案色调：normal=黑，negate=红（非用户/非内核/非壁垒） */
export type FiveStepAdvancedSectionTone = 'normal' | 'negate'

export type FiveStepAdvancedBlockId =
  | 'demand_req'
  | 'demand_non_user'
  | 'solution_core'
  | 'solution_non_core'
  | 'business_unit'
  | 'growth_metric'
  | 'moat_barrier'
  | 'moat_non_barrier'

export interface FiveStepAdvancedBlock {
  id: FiveStepAdvancedBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepAdvancedSection {
  blockId: FiveStepAdvancedBlockId
  /** 分区固定标题（在 RTE 外），如「需求：」「非用户：」 */
  label: string
  tone: FiveStepAdvancedSectionTone
}

export interface FiveStepAdvancedColumn {
  id: FiveStepAdvancedColumnId
  /** 亮黄表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
  sections: FiveStepAdvancedSection[]
}

/** 五步法（提高版）画布：黄头五列 + 分区固定标题 + 每区一块可最大化 RTE */
export interface FiveStepAdvancedDocumentJSON {
  id: string
  type: 'five_step_advanced'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepAdvancedColumn[]
  blocks: FiveStepAdvancedBlock[]
}


export type FiveStepProColumnId =
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

/** 固定分区文案色调：normal=黑字提示标签，negate=红（非用户/非内核/非壁垒） */
export type FiveStepProSectionTone = 'normal' | 'negate'

export type FiveStepProBlockId =
  | 'demand_users'
  | 'demand_scene'
  | 'demand_non_user'
  | 'solution_selling'
  | 'solution_plan'
  | 'solution_non_core'
  | 'business_revenue'
  | 'business_cost'
  | 'growth_metric'
  | 'growth_channel'
  | 'moat_upper'
  | 'moat_non_barrier'

export interface FiveStepProBlock {
  id: FiveStepProBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepProSection {
  blockId: FiveStepProBlockId
  /** 分区固定标题（在 RTE 外，黑字）；空字符串=不渲染（如壁垒上区空白） */
  label: string
  tone: FiveStepProSectionTone
}

export interface FiveStepProColumn {
  id: FiveStepProColumnId
  /** 亮黄表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
  sections: FiveStepProSection[]
}

/** 五步法（进阶版）画布：黄头五列 + 每 ● 提示独立可最大化 RTE（黑字固定标签）+ 红固定「非*」 */
export interface FiveStepProDocumentJSON {
  id: string
  type: 'five_step_pro'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepProColumn[]
  blocks: FiveStepProBlock[]
}




export type FiveStepChallengeColumnId =
  | 'hypothesis'
  | 'demand'
  | 'solution'
  | 'business'
  | 'growth'
  | 'moat'

/** 固定分区文案色调：normal=黑，negate=橙（非用户/非内核/非壁垒，挑战版） */
export type FiveStepChallengeSectionTone = 'normal' | 'negate'

export type FiveStepChallengeBlockId =
  | 'hypothesis_global'
  | 'hypothesis_stage'
  | 'hypothesis_self'
  | 'demand_split'
  | 'demand_push'
  | 'demand_eval'
  | 'demand_calc'
  | 'demand_non_user'
  | 'solution_core'
  | 'solution_quant'
  | 'solution_non_core'
  | 'business_unit_io'
  | 'business_roi'
  | 'growth_metric'
  | 'growth_channel'
  | 'growth_five_forces'
  | 'moat_barrier'
  | 'moat_competitors'
  | 'moat_crn'
  | 'moat_non_barrier'

export interface FiveStepChallengeBlock {
  id: FiveStepChallengeBlockId
  title: string
  items: QuadrantItem[]
}

export interface FiveStepChallengeSection {
  blockId: FiveStepChallengeBlockId
  /** 分区固定标题（在 RTE 外）；空字符串=不渲染 */
  label: string
  tone: FiveStepChallengeSectionTone
}

export interface FiveStepChallengeColumn {
  id: FiveStepChallengeColumnId
  /** 亮黄表头文案 */
  header: string
  /** 底部固定方法论标签 */
  footerLabel: string
  sections: FiveStepChallengeSection[]
}

/** 五步法（挑战版）画布：黄头六列（假设+五步）+ 每要点独立可最大化 RTE（附图预填） */
export interface FiveStepChallengeDocumentJSON {
  id: string
  type: 'five_step_challenge'
  schemaVersion: number
  theme: CanvasTheme
  columns: FiveStepChallengeColumn[]
  blocks: FiveStepChallengeBlock[]
}

/** AI场景取舍评估 · 单元格 id */
export type AiTradeoffCellId =
  | 'a1'
  | 'a2'
  | 'a3'
  | 'a4'
  | 'b1'
  | 'b2'
  | 'b3'
  | 'b4'

export type AiTradeoffColumnId = 'value' | 'cost'

export interface AiTradeoffBlock {
  id: AiTradeoffCellId
  column: AiTradeoffColumnId
  /** 如「A1.价值差异」 */
  title: string
  /** 灰色斜体引导文案 */
  prompt: string
  items: QuadrantItem[]
}

/** AI场景取舍评估画布文档 */
export interface AiTradeoffDocumentJSON {
  id: string
  type: 'ai_tradeoff'
  schemaVersion: number
  theme: CanvasTheme
  /** 画布主标题 */
  title: string
  columns: {
    value: { header: string }
    cost: { header: string }
  }
  blocks: AiTradeoffBlock[]
  footerNote: string
}


/** 产品内核画布 · 方块 id */
export type ProductContentBlockId =
  | 'user'
  | 'metrics'
  | 'add_hypotheses'
  | 'core_hypotheses'
  | 'validation'

export interface ProductContentBlock {
  id: ProductContentBlockId
  title: string
  /** 灰色斜体引导文案 */
  prompt: string
  items: QuadrantItem[]
}

/** 产品内核画布文档 */
export interface ProductContentDocumentJSON {
  id: string
  type: 'product_content'
  schemaVersion: number
  theme: CanvasTheme
  blocks: ProductContentBlock[]
}

/** OSCAR调研画布 · 方块 id */
export type OscarBlockId =
  | 'objective'
  | 'scope'
  | 'checklist'
  | 'acquire'
  | 'utilize'

export interface OscarBlock {
  id: OscarBlockId
  /** 水印字母 O/S/C/A/R */
  letter: string
  title: string
  /** 灰色斜体引导文案 */
  prompt: string
  items: QuadrantItem[]
}

/** OSCAR调研画布文档 */
export interface OscarDocumentJSON {
  id: string
  type: 'oscar'
  schemaVersion: number
  theme: CanvasTheme
  blocks: OscarBlock[]
}

/** 行业分析画布 · 方块 id */
export type IndustryAnalysisBlockId =
  | 'chain'
  | 'changes'
  | 'steady_b'
  | 'cycle'
  | 'ceiling'
  | 'concentration'

export interface IndustryAnalysisBlock {
  id: IndustryAnalysisBlockId
  title: string
  /** 灰色副标题 */
  subtitle: string
  items: QuadrantItem[]
}

/** 行业分析画布文档 */
export interface IndustryAnalysisDocumentJSON {
  id: string
  type: 'industry_analysis'
  schemaVersion: number
  theme: CanvasTheme
  blocks: IndustryAnalysisBlock[]
}


/** 关键阻力分析画布 · 单元格列 */
export type KeyResistanceCellKey = 'resistance' | 'eliminate' | 'notes'

export interface KeyResistanceRow {
  id: string
  resistance: QuadrantItem[]
  eliminate: QuadrantItem[]
  notes: QuadrantItem[]
}

/** 关键阻力分析画布文档 */
export interface KeyResistanceDocumentJSON {
  id: string
  type: 'key_resistance'
  schemaVersion: number
  theme: CanvasTheme
  /** 率指标空白，如「转化」→ 显示为「关键阻力分析画布：转化率」 */
  rateLabel: string
  rows: KeyResistanceRow[]
  tipsTitle: string
  tips: string[]
}

/** 转化率取舍画布 · 单元格列 */
export type ConversionTradeoffCellKey = 'drive' | 'resistance' | 'touchpoint'

export interface ConversionTradeoffRow {
  id: string
  /** 优先级列文案，如 Top3 / 其他备选 */
  priorityLabel: string
  drive: QuadrantItem[]
  resistance: QuadrantItem[]
  touchpoint: QuadrantItem[]
}

/** 转化率取舍画布文档 */
export interface ConversionTradeoffDocumentJSON {
  id: string
  type: 'conversion_tradeoff'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  columnLabels: {
    priority: string
    drive: string
    resistance: string
    touchpoint: string
  }
  rows: ConversionTradeoffRow[]
}

/** 行业预判分析框架 · 方块 id */
export type IndustryForecastBlockId =
  | 'chain'
  | 'changes'
  | 'steady_b'
  | 'cycle'
  | 'ceiling'
  | 'concentration'

export interface IndustryForecastBlock {
  id: IndustryForecastBlockId
  /** 序号 1-6 */
  number: number
  title: string
  subtitle: string
  items: QuadrantItem[]
}

/** 行业预判分析框架文档 */
export interface IndustryForecastDocumentJSON {
  id: string
  type: 'industry_forecast'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  blocks: IndustryForecastBlock[]
}

/** 科学开会思考画布 · 方块 id */
export type ScientificMeetingBlockId =
  | 'goal'
  | 'principles'
  | 'process'

export interface ScientificMeetingBlock {
  id: ScientificMeetingBlockId
  title: string
  prompt: string
  items: QuadrantItem[]
}

/** 科学开会思考画布文档 */
export interface ScientificMeetingDocumentJSON {
  id: string
  type: 'scientific_meeting'
  schemaVersion: number
  theme: CanvasTheme
  meetingType: string
  organizer: string
  blocks: ScientificMeetingBlock[]
}


/** IPO梳理画布 · 方块 id */
export type IpoBlockId =
  | 'input'
  | 'process'
  | 'output'
  | 'goal'
  | 'pattern'
  | 'feedback'

export interface IpoBlock {
  id: IpoBlockId
  title: string
  items: QuadrantItem[]
}

/** IPO梳理画布文档（Input / Process / Output + Goal / Pattern / Feedback） */
export interface IpoDocumentJSON {
  id: string
  type: 'ipo'
  schemaVersion: number
  theme: CanvasTheme
  blocks: IpoBlock[]
}


/** 故障复盘 · 可编辑方块 id */
export type IncidentReviewBlockId =
  | 'description'
  | 'evidence'
  | 'probability'
  | 'root_cause'
  | 'solution'
  | 'impact'
  | 'related_req'
  | 'reflection'

export interface IncidentReviewBlock {
  id: IncidentReviewBlockId
  title: string
  required: boolean
  items: QuadrantItem[]
}

export interface IncidentReviewTimelineRow {
  id: string
  time: string
  behavior: QuadrantItem[]
}

/** 故障复盘画布文档 */
export interface IncidentReviewDocumentJSON {
  id: string
  type: 'incident_review'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  labels: {
    descriptionHint: string
    evidenceTitle: string
    probabilityTitle: string
    probabilityHint: string
    processHint: string
    rootCauseHint: string
    solutionHint: string
    solutionTip: string
    impactClient: string
    impactServer: string
    relatedHint: string
    reflectionHint: string
    timeCol: string
    behaviorCol: string
  }
  blocks: IncidentReviewBlock[]
  timelineRows: IncidentReviewTimelineRow[]
}


/** 个人年工作总结 · 方块 id */
export type AnnualSummaryBlockId =
  | 'business_progress'
  | 'personal_growth'
  | 'improvement'

export interface AnnualSummaryBlock {
  id: AnnualSummaryBlockId
  title: string
  prompt: string
  items: QuadrantItem[]
}

export interface AnnualSummaryDocumentJSON {
  id: string
  type: 'annual_summary'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  labels: {
    businessHint: string
    growthHint: string
    improveHint: string
  }
  blocks: AnnualSummaryBlock[]
}


/** 周/月/季工作总结 · 方块 */
export interface PeriodSummaryBlock {
  id: string
  title: string
  prompt: string
  items: QuadrantItem[]
}

export type PeriodSummaryDocType =
  | 'weekly_summary'
  | 'monthly_summary'
  | 'quarterly_summary'

export interface PeriodSummaryDocumentJSON {
  id: string
  type: PeriodSummaryDocType
  schemaVersion: number
  theme: CanvasTheme
  title: string
  labels: Record<string, string>
  blocks: PeriodSummaryBlock[]
}

export type WeeklySummaryDocumentJSON = PeriodSummaryDocumentJSON & {
  type: 'weekly_summary'
}
export type MonthlySummaryDocumentJSON = PeriodSummaryDocumentJSON & {
  type: 'monthly_summary'
}
export type QuarterlySummaryDocumentJSON = PeriodSummaryDocumentJSON & {
  type: 'quarterly_summary'
}

/** 深度复盘关键成果 · 方块 id */
export type DeepReviewBlockId =
  | 'overall'
  | 'highlights'
  | 'problems'
  | 'keep'
  | 'stop'
  | 'new_tasks'
  | 'assets'

export interface DeepReviewBlock {
  id: DeepReviewBlockId
  title: string
  prompt: string
  items: QuadrantItem[]
}

export interface DeepReviewDocumentJSON {
  id: string
  type: 'deep_review'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  projectName: string
  reviewTime: string
  blocks: DeepReviewBlock[]
}

/** 项目管理复盘挖掘价值 · 方块 id */
export type PmRetroValueBlockId = 'before' | 'after'

export interface PmRetroValueBlock {
  id: PmRetroValueBlockId
  title: string
  items: QuadrantItem[]
}

/** 项目管理复盘挖掘价值（Before/After 双栏过程资产） */
export interface PmRetroValueDocumentJSON {
  id: string
  type: 'pm_retro_value'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  blocks: PmRetroValueBlock[]
}

/** 综合决策ROI权衡 · 方块 id */
export type RoiTradeoffBlockId = 'benefits' | 'costs'

export interface RoiTradeoffBlock {
  id: RoiTradeoffBlockId
  title: string
  items: QuadrantItem[]
}

/** 综合决策ROI权衡（关键收益 / 关键成本 双栏） */
export interface RoiTradeoffDocumentJSON {
  id: string
  type: 'roi_tradeoff'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  blocks: RoiTradeoffBlock[]
}

/** ROI决策评估 · 固定面板 block id */
export type RoiDecisionFixedBlockId =
  | 'opportunityCost'
  | 'timeWindow'
  | 'conclusion'

export interface RoiDecisionRow {
  id: string
  dimension: string
  benefitBlockId: string
  costBlockId: string
}

export interface RoiDecisionBlock {
  id: string
  title: string
  items: QuadrantItem[]
}

/** ROI决策评估（维度×收益/成本动态行 + 机会成本/时间窗口 + 最终结论） */
export interface RoiDecisionDocumentJSON {
  id: string
  type: 'roi_decision'
  schemaVersion: number
  theme: CanvasTheme
  title: string
  rows: RoiDecisionRow[]
  blocks: RoiDecisionBlock[]
}

/** 时间管理矩阵（艾森豪威尔） · 象限 id */
export type TimeMatrixBlockId = 'a' | 'b' | 'c' | 'd'

export type TimeMatrixTone = 'pink' | 'yellow' | 'cream' | 'green'

export interface TimeMatrixBlock {
  id: TimeMatrixBlockId
  title: string
  tone: TimeMatrixTone
  items: QuadrantItem[]
}

export interface TimeMatrixAxes {
  importanceHigh: string
  importanceLow: string
  urgencyLow: string
  urgencyHigh: string
}

/** 时间管理矩阵画布文档 */
export interface TimeMatrixDocumentJSON {
  id: string
  type: 'time_matrix'
  schemaVersion: number
  theme: CanvasTheme
  axes: TimeMatrixAxes
  blocks: TimeMatrixBlock[]
}




/** 人生红点工作状态区间 · 象限 id */
export type WorkStateZonesBlockId = 'a' | 'b' | 'c' | 'd'

export type WorkStateZonesTone = 'green' | 'yellow' | 'pink' | 'grey'

export interface WorkStateZonesBlock {
  id: WorkStateZonesBlockId
  title: string
  description: string
  tone: WorkStateZonesTone
  items: QuadrantItem[]
}

export interface WorkStateZonesAxisEnd {
  label: string
  sub: string
}

export interface WorkStateZonesAxes {
  autonomyHigh: WorkStateZonesAxisEnd
  autonomyLow: WorkStateZonesAxisEnd
  comfort: WorkStateZonesAxisEnd
  nonComfort: WorkStateZonesAxisEnd
}

/** 人生红点工作状态区间画布文档 */
export interface WorkStateZonesDocumentJSON {
  id: string
  type: 'work_state_zones'
  schemaVersion: number
  theme: CanvasTheme
  axes: WorkStateZonesAxes
  blocks: WorkStateZonesBlock[]
}


/** 线上线下沟通 · 象限 id */
export type OnlineOfflineCommBlockId = 'a' | 'b' | 'c' | 'd'

export type OnlineOfflineCommTone = 'blue' | 'green' | 'purple' | 'pink'

export interface OnlineOfflineCommBlock {
  id: OnlineOfflineCommBlockId
  title: string
  tone: OnlineOfflineCommTone
  items: QuadrantItem[]
}

export interface OnlineOfflineCommAxes {
  online: string
  offline: string
  asyncComm: string
  syncComm: string
}

/** 线上线下沟通画布文档 */
export interface OnlineOfflineCommDocumentJSON {
  id: string
  type: 'online_offline_comm'
  schemaVersion: number
  theme: CanvasTheme
  axes: OnlineOfflineCommAxes
  blocks: OnlineOfflineCommBlock[]
}


/** 单元模型象限 · 块 id（a=右上健康 · b=左上总部成本 · c=左下放弃 · d=右下不存在） */
export type UnitModelQuadrantBlockId = 'a' | 'b' | 'c' | 'd'

export type UnitModelQuadrantTone = 'teal' | 'mustard' | 'red' | 'amber'

export interface UnitModelQuadrantBlock {
  id: UnitModelQuadrantBlockId
  title: string
  tone: UnitModelQuadrantTone
  items: QuadrantItem[]
}

export interface UnitModelQuadrantAxes {
  /** 上：单元模型长期成立 */
  unitModelLongTerm: string
  /** 下：单元模型不成立 */
  unitModelInvalid: string
  /** 左：公司账不成立 */
  companyAccountInvalid: string
  /** 右：公司账长期成立 */
  companyAccountLongTerm: string
}

/** 单元模型象限分析画布文档 */
export interface UnitModelQuadrantDocumentJSON {
  id: string
  type: 'unit_model_quadrant'
  schemaVersion: number
  theme: CanvasTheme
  axes: UnitModelQuadrantAxes
  blocks: UnitModelQuadrantBlock[]
}


/** 项目管理6维敏感度 · 轴 id */
export type PmSensitivity6dAxisId =
  | 'budget'
  | 'boss'
  | 'risk'
  | 'collaboration'
  | 'manpower'
  | 'time'

export interface PmSensitivity6dAxisMeta {
  id: PmSensitivity6dAxisId
  title: string
}

/** 分值连续 0–100（外缘=100） */
export type PmSensitivity6dScores = Record<PmSensitivity6dAxisId, number>

export interface PmSensitivity6dBlock {
  /** 与雷达轴一一对应 */
  id: PmSensitivity6dAxisId
  title: string
  items: QuadrantItem[]
}

/** 项目管理6维敏感度模型画布文档 */
export interface PmSensitivity6dDocumentJSON {
  id: string
  type: 'pm_sensitivity_6d'
  schemaVersion: number
  theme: CanvasTheme
  axes: Record<PmSensitivity6dAxisId, PmSensitivity6dAxisMeta>
  scores: PmSensitivity6dScores
  blocks: PmSensitivity6dBlock[]
}


/** 项目管理竞争力测评 · 轴 id */
export type PmCompetencyAxisId =
  | 'awareness'
  | 'proposal'
  | 'plan'
  | 'execution'
  | 'review'

export interface PmCompetencyAxisMeta {
  id: PmCompetencyAxisId
  title: string
}

/** 分值连续 0–100（外缘=100） */
export type PmCompetencyScores = Record<PmCompetencyAxisId, number>

export interface PmCompetencyBlock {
  /** 与雷达轴一一对应 */
  id: PmCompetencyAxisId
  title: string
  items: QuadrantItem[]
}

/** 项目管理竞争力测评画布文档 */
export interface PmCompetencyDocumentJSON {
  id: string
  type: 'pm_competency'
  schemaVersion: number
  theme: CanvasTheme
  axes: Record<PmCompetencyAxisId, PmCompetencyAxisMeta>
  scores: PmCompetencyScores
  blocks: PmCompetencyBlock[]
}


/** 科学开会十大原则 · 轴 id（顺时针自顶） */
export type ScientificMeeting10pAxisId =
  | 'democratic'
  | 'implementable'
  | 'motivating'
  | 'inspiring'
  | 'devoting'
  | 'efficient'
  | 'learning'
  | 'responsible'
  | 'pragmatic'
  | 'friendly'

export interface ScientificMeeting10pAxisMeta {
  id: ScientificMeeting10pAxisId
  title: string
}

/** 分值连续 0–100（外缘=100） */
export type ScientificMeeting10pScores = Record<ScientificMeeting10pAxisId, number>

export interface ScientificMeeting10pBlock {
  /** 与花瓣轴一一对应 */
  id: ScientificMeeting10pAxisId
  title: string
  items: QuadrantItem[]
}

/** 科学开会十大原则画布文档 */
export interface ScientificMeeting10pDocumentJSON {
  id: string
  type: 'scientific_meeting_10p'
  schemaVersion: number
  theme: CanvasTheme
  axes: Record<ScientificMeeting10pAxisId, ScientificMeeting10pAxisMeta>
  scores: ScientificMeeting10pScores
  blocks: ScientificMeeting10pBlock[]
}





/** 产品内容5维特征 · 轴 id */
export type ProductFeatures5dAxisId =
  | 'openness'
  | 'engagement'
  | 'error_prone'
  | 'iterativity'
  | 'innovation'

export interface ProductFeatures5dAxisMeta {
  id: ProductFeatures5dAxisId
  title: string
}

/** 分值连续 0–100（外缘=100） */
export type ProductFeatures5dScores = Record<ProductFeatures5dAxisId, number>

export interface ProductFeatures5dBlock {
  /** 与雷达轴一一对应 */
  id: ProductFeatures5dAxisId
  title: string
  items: QuadrantItem[]
}

/** 产品内容5维特征画布文档 */
export interface ProductFeatures5dDocumentJSON {
  id: string
  type: 'product_features_5d'
  schemaVersion: number
  theme: CanvasTheme
  axes: Record<ProductFeatures5dAxisId, ProductFeatures5dAxisMeta>
  scores: ProductFeatures5dScores
  blocks: ProductFeatures5dBlock[]
}

/** 项目管理方案评估三角形 · 轴 id */
export type PmSolutionTriangleAxisId =
  | 'roi'
  | 'opportunity_cost'
  | 'opportunity_window'

export interface PmSolutionTriangleAxisMeta {
  id: PmSolutionTriangleAxisId
  title: string
}

/** 分值连续 0–100（外缘=100） */
export type PmSolutionTriangleScores = Record<PmSolutionTriangleAxisId, number>

export interface PmSolutionTriangleBlock {
  /** 与雷达轴一一对应 */
  id: PmSolutionTriangleAxisId
  title: string
  items: QuadrantItem[]
}

/** 项目管理方案评估三角形画布文档 */
export interface PmSolutionTriangleDocumentJSON {
  id: string
  type: 'pm_solution_triangle'
  schemaVersion: number
  theme: CanvasTheme
  axes: Record<PmSolutionTriangleAxisId, PmSolutionTriangleAxisMeta>
  scores: PmSolutionTriangleScores
  blocks: PmSolutionTriangleBlock[]
}



/** 增长假设清单 · 列 */
export type GrowthAssumptionsCellKey =
  | 'assumption'
  | 'proposer'
  | 'proposedAt'
  | 'owner'
  | 'result'

export interface GrowthAssumptionsColumn {
  key: GrowthAssumptionsCellKey
  label: string
}

export interface GrowthAssumptionsRow {
  id: string
  assumption: QuadrantItem[]
  proposer: QuadrantItem[]
  proposedAt: QuadrantItem[]
  owner: QuadrantItem[]
  result: QuadrantItem[]
}

/** 增长假设清单画布文档 */
export interface GrowthAssumptionsDocumentJSON {
  id: string
  type: 'growth_assumptions'
  schemaVersion: number
  theme: CanvasTheme
  columns: GrowthAssumptionsColumn[]
  rows: GrowthAssumptionsRow[]
}


/** 业务公式画布文档 */
export interface BusinessFormulaSavedItem {
  name: string
  content: string
}

export interface BusinessFormulaDocumentJSON {
  id: string
  type: 'business_formula'
  schemaVersion: number
  theme: CanvasTheme
  formulaText: string
  layout: 'horizontal' | 'vertical'
  palette: 'rainbow' | 'classic' | 'business' | 'warm' | 'cool'
  savedFormulas: BusinessFormulaSavedItem[]
}

/** 科学决策三角形（宽度 / 高度 / 深度） */
export type DecisionTriangleBlockId = 'width' | 'height' | 'depth'

export type DecisionTriangleTone = 'yellow' | 'orange' | 'teal'

export interface DecisionTriangleBlock {
  id: DecisionTriangleBlockId
  title: string
  tone: DecisionTriangleTone
  hints: string[]
  items: QuadrantItem[]
}

export interface DecisionTriangleDocumentJSON {
  id: string
  type: 'decision_triangle'
  schemaVersion: number
  theme: CanvasTheme
  blocks: DecisionTriangleBlock[]
}

export type CanvasDocumentJSON = (
  | QuadrantDocumentJSON
  | DualTriangleDocumentJSON
  | YModelDocumentJSON
  | DeliberatePracticeDocumentJSON
  | DemandTriangleDocumentJSON
  | FiveStepDocumentJSON
  | FiveStepDivisionDocumentJSON
  | FiveStepBasicDocumentJSON
  | FiveStepAdvancedDocumentJSON
  | FiveStepProDocumentJSON
  | FiveStepChallengeDocumentJSON
  | AiTradeoffDocumentJSON
  | ProductContentDocumentJSON
  | OscarDocumentJSON
  | IndustryAnalysisDocumentJSON
  | KeyResistanceDocumentJSON
  | ConversionTradeoffDocumentJSON
  | IndustryForecastDocumentJSON
  | ScientificMeetingDocumentJSON
  | IpoDocumentJSON
  | IncidentReviewDocumentJSON
  | AnnualSummaryDocumentJSON
  | PeriodSummaryDocumentJSON
  | DeepReviewDocumentJSON
  | PmRetroValueDocumentJSON
  | RoiTradeoffDocumentJSON
  | RoiDecisionDocumentJSON
  | TimeMatrixDocumentJSON
  | WorkStateZonesDocumentJSON
  | OnlineOfflineCommDocumentJSON
  | UnitModelQuadrantDocumentJSON
  | PmSensitivity6dDocumentJSON
  | PmCompetencyDocumentJSON
  | ScientificMeeting10pDocumentJSON
  | ProductFeatures5dDocumentJSON
  | PmSolutionTriangleDocumentJSON
  | GrowthAssumptionsDocumentJSON
  | BusinessFormulaDocumentJSON
) & WithPanelAttachments

/** 带 blocks 的画布（双三角 / Y 模型 / 刻意练习） */
export type BlockCanvasDocumentJSON =
  | DualTriangleDocumentJSON
  | YModelDocumentJSON
  | DeliberatePracticeDocumentJSON
  | DemandTriangleDocumentJSON
  | FiveStepDocumentJSON
  | FiveStepDivisionDocumentJSON
  | FiveStepBasicDocumentJSON
  | FiveStepAdvancedDocumentJSON
  | FiveStepProDocumentJSON
  | FiveStepChallengeDocumentJSON
  | AiTradeoffDocumentJSON
  | ProductContentDocumentJSON
  | OscarDocumentJSON
  | IndustryAnalysisDocumentJSON
  | IndustryForecastDocumentJSON
  | ScientificMeetingDocumentJSON
  | IpoDocumentJSON
  | IncidentReviewDocumentJSON
  | AnnualSummaryDocumentJSON
  | PeriodSummaryDocumentJSON
  | DeepReviewDocumentJSON
  | PmRetroValueDocumentJSON
  | RoiTradeoffDocumentJSON
  | RoiDecisionDocumentJSON
  | TimeMatrixDocumentJSON
  | WorkStateZonesDocumentJSON
  | OnlineOfflineCommDocumentJSON
  | UnitModelQuadrantDocumentJSON
  | PmSensitivity6dDocumentJSON
  | PmCompetencyDocumentJSON
  | ScientificMeeting10pDocumentJSON
  | ProductFeatures5dDocumentJSON
  | PmSolutionTriangleDocumentJSON

export function isDualTriangleDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is DualTriangleDocumentJSON {
  return !!doc && doc.type === 'dual_triangle'
}

/** Coerce legacy / poisoned drafts into canonical y_model before type guards. */
export function coerceYModelDoc(
  doc: CanvasDocumentJSON,
  templateId?: string | null,
): CanvasDocumentJSON {
  const raw = doc as CanvasDocumentJSON & { type?: string; id?: string }
  // Cast: poisoned drafts may carry hyphenated "y-model" outside the union.
  const type = raw.type as string | undefined
  const looksY =
    type === 'y_model' ||
    type === 'y-model' ||
    raw.id === 'canvas_y_model' ||
    templateId === 'y-model'
  if (!looksY) return doc
  if (type === 'y_model') return doc
  return { ...doc, type: 'y_model' } as YModelDocumentJSON
}

export function isYModelDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is YModelDocumentJSON {
  return !!doc && doc.type === 'y_model'
}

/** 将旧版 Y 模型文档温和升级到当前结构（scope / title+subtitle / 新 labels） */
export function normalizeYModelDoc(doc: YModelDocumentJSON): YModelDocumentJSON {
  const defaults = {
    title: '我的认知',
    subtitle: '实事求是 解放思想',
    prefix: '我的',
    suffix: '认知',
    labels: {
      pageTitle: '一堂Y模型：无限进步画布',
      pageSubtitle: '科学成事道路',
      pageSubtitleEn:
        'Yitang Y Model: Infinite Progress Canvas / Scientific Path To Success',
      theory: '理论',
      facts: '事实',
      anchor: '解决真正问题',
      toolsPrefix: '∴ 配套的组织和管理工具：',
      step1: 'Step1',
      step2: 'Step2',
      step3: 'Step3',
      step4: 'Step4',
      step5: 'Step4',
      mottoSeek: '实事求是',
      mottoFree: '解放思想',
      arrowTheoryOut: '提炼建模',
      arrowTheoryIn: '科学类比',
      arrowFactsOut: '假设驱动',
      arrowFactsIn: '定性定量',
      unity: '知行合一',
    },
  }

  // Persisted drafts may omit theme; YModelCanvas reads theme.background.color.
  const theme = (doc.theme ?? {}) as CanvasTheme
  const background = (theme.background ?? {}) as ThemeBackground
  doc.theme = {
    background: {
      pattern: background.pattern || 'none',
      color: background.color || '#ffffff',
    },
  }

  const center = doc.center ?? ({} as YModelCenter)
  if (!center.title) {
    const fromParts = [center.prefix, center.suffix].filter(Boolean).join('')
    center.title =
      fromParts && fromParts !== '我的认知' && !center.blank
        ? fromParts
        : defaults.title
  }
  if (!center.subtitle || center.subtitle === '知行合一的因果规律') {
    center.subtitle = defaults.subtitle
  }
  if (!center.prefix) center.prefix = defaults.prefix
  if (!center.suffix) center.suffix = defaults.suffix
  if (center.blank == null) center.blank = ''
  doc.center = center

  const labels = { ...(doc.labels ?? {}) } as YModelDocumentJSON['labels']
  if (!labels.anchor) {
    labels.anchor = labels.problem || defaults.labels.anchor
  }
  if (!labels.theory) labels.theory = defaults.labels.theory
  if (!labels.facts) labels.facts = defaults.labels.facts
  if (!labels.toolsPrefix) labels.toolsPrefix = defaults.labels.toolsPrefix
  if (!labels.pageTitle) labels.pageTitle = defaults.labels.pageTitle
  if (!labels.pageSubtitle) labels.pageSubtitle = defaults.labels.pageSubtitle
  if (!labels.pageSubtitleEn) labels.pageSubtitleEn = defaults.labels.pageSubtitleEn
  if (!labels.mottoSeek) labels.mottoSeek = defaults.labels.mottoSeek
  if (!labels.mottoFree) labels.mottoFree = defaults.labels.mottoFree
  if (!labels.arrowTheoryOut) labels.arrowTheoryOut = defaults.labels.arrowTheoryOut
  if (!labels.arrowTheoryIn) labels.arrowTheoryIn = defaults.labels.arrowTheoryIn
  if (!labels.arrowFactsOut) labels.arrowFactsOut = defaults.labels.arrowFactsOut
  if (!labels.arrowFactsIn) labels.arrowFactsIn = defaults.labels.arrowFactsIn
  if (!labels.unity) labels.unity = defaults.labels.unity

  // 旧五步文案 / 缺字段 → 合并稿四步（Step1–4）
  const looksLegacySteps =
    !labels.step1 ||
    labels.step1.includes('范围') ||
    labels.step1 === 'Step 1' ||
    labels.step2?.includes('目标') ||
    labels.step3?.includes('框架') ||
    labels.step4?.includes('预判') ||
    labels.step5?.includes('配套') ||
    !!labels.step3Theory ||
    labels.step4 === 'Step 4'

  if (looksLegacySteps) {
    labels.step1 = defaults.labels.step1
    labels.step2 = defaults.labels.step2
    labels.step3 = defaults.labels.step3
    labels.step4 = defaults.labels.step4
    labels.step5 = defaults.labels.step5
  } else {
    if (!labels.step1) labels.step1 = defaults.labels.step1
    if (!labels.step2) labels.step2 = defaults.labels.step2
    if (!labels.step3) labels.step3 = defaults.labels.step3
    if (!labels.step4) labels.step4 = defaults.labels.step4
    if (!labels.step5) labels.step5 = defaults.labels.step5
  }
  doc.labels = labels

  const blocks = Array.isArray(doc.blocks) ? [...doc.blocks] : []
  const hasScope = blocks.some((b) => b.id === 'scope')
  const problemIdx = blocks.findIndex((b) => b.id === 'problem')
  if (!hasScope && problemIdx >= 0) {
    const prev = blocks[problemIdx]
    blocks[problemIdx] = {
      ...prev,
      id: 'scope',
      title:
        prev.title === '圈定问题范围' || !prev.title
          ? '解决真正问题'
          : prev.title,
    }
  } else if (!hasScope) {
    blocks.push({
      id: 'scope',
      title: '解决真正问题',
      items: [
        {
          id: 'item_scope_1',
          text: '在此填写真正要解决的问题…',
          style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
        },
      ],
    })
  }

  /** 画面上全部虚线富文本框（缺则补齐，保 id 稳定） */
  const requiredRteBlocks: Array<{ id: YModelBlockId; title: string; placeholder: string }> = [
    { id: 'theory_existing', title: '使用现成模型/规律', placeholder: '在此填写现成模型/规律…' },
    { id: 'theory_build', title: '自己建模型', placeholder: '在此填写自建模型…' },
    { id: 'facts_hypothesis', title: '提出新假设', placeholder: '在此填写新假设…' },
    { id: 'facts_analysis', title: '如何定性定量分析', placeholder: '在此填写定性定量方法…' },
    { id: 'cognition_cause', title: '理解因：我的框架 (1-5条)', placeholder: '在此填写框架条目…' },
    { id: 'cognition_effect', title: '理解果：我的目标 (TopN)', placeholder: '在此填写目标条目…' },
    { id: 'tools', title: '∴ 配套的组织和管理工具：', placeholder: '在此填写配套组织与管理工具…' },
  ]
  const present = new Set(blocks.map((b) => b.id))
  for (const req of requiredRteBlocks) {
    if (present.has(req.id)) continue
    blocks.push({
      id: req.id,
      title: req.title,
      items: [
        {
          id: `item_${req.id}_1`,
          text: req.placeholder,
          style: { color: '#3c4043', fontSize: 13, fontWeight: '500' },
        },
      ],
    })
  }

  // 温和对齐附图默认标题（仅当仍是旧默认时）
  for (const b of blocks) {
    if (b.id === 'cognition_cause' && b.title === '理解因：基本可行框架 (2-5条)') {
      b.title = '理解因：我的框架 (1-5条)'
    }
    if (b.id === 'scope' && b.title === '圈定问题范围') {
      b.title = '解决真正问题'
    }
    if (b.id === 'tools' && (b.title === '配套的组织和管理工具' || !b.title)) {
      b.title = '∴ 配套的组织和管理工具：'
    }
  }

  doc.blocks = blocks as YModelBlock[]
  if (!doc.schemaVersion || doc.schemaVersion < 2) {
    doc.schemaVersion = 2
  }
  return doc
}

export function isDeliberatePracticeDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is DeliberatePracticeDocumentJSON {
  return !!doc && doc.type === 'deliberate_practice'
}

export function isDemandTriangleDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is DemandTriangleDocumentJSON {
  return !!doc && doc.type === 'demand_triangle'
}

export function isFiveStepDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepDocumentJSON {
  return !!doc && doc.type === 'five_step'
}


export function isFiveStepDivisionDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepDivisionDocumentJSON {
  return !!doc && doc.type === 'five_step_division'
}

export function isFiveStepBasicDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepBasicDocumentJSON {
  return !!doc && doc.type === 'five_step_basic'
}


export function isFiveStepAdvancedDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepAdvancedDocumentJSON {
  return !!doc && doc.type === 'five_step_advanced'
}


export function isFiveStepProDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepProDocumentJSON {
  return !!doc && doc.type === 'five_step_pro'
}


export function isFiveStepChallengeDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is FiveStepChallengeDocumentJSON {
  return !!doc && doc.type === 'five_step_challenge'
}


export function isAiTradeoffDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is AiTradeoffDocumentJSON {
  return !!doc && doc.type === 'ai_tradeoff'
}

export function isProductContentDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is ProductContentDocumentJSON {
  return !!doc && doc.type === 'product_content'
}

export function isOscarDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is OscarDocumentJSON {
  return !!doc && doc.type === 'oscar'
}

export function isIndustryAnalysisDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is IndustryAnalysisDocumentJSON {
  return !!doc && doc.type === 'industry_analysis'
}


export function isKeyResistanceDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is KeyResistanceDocumentJSON {
  return !!doc && doc.type === 'key_resistance'
}

export function isConversionTradeoffDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is ConversionTradeoffDocumentJSON {
  return !!doc && doc.type === 'conversion_tradeoff'
}

export function isIndustryForecastDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is IndustryForecastDocumentJSON {
  return !!doc && doc.type === 'industry_forecast'
}

export function isScientificMeetingDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is ScientificMeetingDocumentJSON {
  return !!doc && doc.type === 'scientific_meeting'
}



export function isIpoDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is IpoDocumentJSON {
  return !!doc && doc.type === 'ipo'
}

export function isIncidentReviewDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is IncidentReviewDocumentJSON {
  return !!doc && doc.type === 'incident_review'
}

export function isAnnualSummaryDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is AnnualSummaryDocumentJSON {
  return !!doc && doc.type === 'annual_summary'
}

export function isPeriodSummaryDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is PeriodSummaryDocumentJSON {
  return (
    !!doc &&
    (doc.type === 'weekly_summary' ||
      doc.type === 'monthly_summary' ||
      doc.type === 'quarterly_summary')
  )
}

export function isWeeklySummaryDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is WeeklySummaryDocumentJSON {
  return !!doc && doc.type === 'weekly_summary'
}

export function isMonthlySummaryDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is MonthlySummaryDocumentJSON {
  return !!doc && doc.type === 'monthly_summary'
}

export function isQuarterlySummaryDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is QuarterlySummaryDocumentJSON {
  return !!doc && doc.type === 'quarterly_summary'
}

export function isDeepReviewDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is DeepReviewDocumentJSON {
  return !!doc && doc.type === 'deep_review'
}


export function isPmRetroValueDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is PmRetroValueDocumentJSON {
  return !!doc && doc.type === 'pm_retro_value'
}

export function isRoiTradeoffDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is RoiTradeoffDocumentJSON {
  return !!doc && doc.type === 'roi_tradeoff'
}

export function isRoiDecisionDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is RoiDecisionDocumentJSON {
  return !!doc && doc.type === 'roi_decision'
}

export function isTimeMatrixDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is TimeMatrixDocumentJSON {
  return !!doc && doc.type === 'time_matrix'
}


export function isWorkStateZonesDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is WorkStateZonesDocumentJSON {
  return !!doc && doc.type === 'work_state_zones'
}


export function isOnlineOfflineCommDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is OnlineOfflineCommDocumentJSON {
  return !!doc && doc.type === 'online_offline_comm'
}


export function isUnitModelQuadrantDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is UnitModelQuadrantDocumentJSON {
  return !!doc && doc.type === 'unit_model_quadrant'
}


export function isPmSensitivity6dDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is PmSensitivity6dDocumentJSON {
  return !!doc && doc.type === 'pm_sensitivity_6d'
}


export function isPmCompetencyDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is PmCompetencyDocumentJSON {
  return !!doc && doc.type === 'pm_competency'
}


export function isScientificMeeting10pDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is ScientificMeeting10pDocumentJSON {
  return !!doc && doc.type === 'scientific_meeting_10p'
}





export function isProductFeatures5dDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is ProductFeatures5dDocumentJSON {
  return !!doc && doc.type === 'product_features_5d'
}

export function isPmSolutionTriangleDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is PmSolutionTriangleDocumentJSON {
  return !!doc && doc.type === 'pm_solution_triangle'
}



export function isGrowthAssumptionsDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is GrowthAssumptionsDocumentJSON {
  return !!doc && doc.type === 'growth_assumptions'
}

export function isBusinessFormulaDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is BusinessFormulaDocumentJSON {
  return !!doc && doc.type === 'business_formula'
}


export function isBlockCanvasDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is BlockCanvasDocumentJSON {
  return (
    isDualTriangleDoc(doc) ||
    isYModelDoc(doc) ||
    isDeliberatePracticeDoc(doc) ||
    isDemandTriangleDoc(doc) ||
    isFiveStepDoc(doc) ||
    isFiveStepDivisionDoc(doc) ||
    isFiveStepBasicDoc(doc) ||
    isFiveStepAdvancedDoc(doc) ||
    isFiveStepProDoc(doc) ||
    isFiveStepChallengeDoc(doc) ||
    isAiTradeoffDoc(doc) ||
    isProductContentDoc(doc) ||
    isOscarDoc(doc) ||
    isIndustryAnalysisDoc(doc) ||
    isIndustryForecastDoc(doc) ||
    isScientificMeetingDoc(doc) ||
    isIpoDoc(doc) ||
    isIncidentReviewDoc(doc) ||
    isAnnualSummaryDoc(doc) ||
    isPeriodSummaryDoc(doc) ||
    isDeepReviewDoc(doc) ||
    isPmRetroValueDoc(doc) ||
    isRoiTradeoffDoc(doc) ||
    isRoiDecisionDoc(doc) ||
    isTimeMatrixDoc(doc) ||
    isWorkStateZonesDoc(doc) ||
    isOnlineOfflineCommDoc(doc) ||
    isUnitModelQuadrantDoc(doc) ||
    isPmSensitivity6dDoc(doc) ||
    isPmCompetencyDoc(doc) ||
    isScientificMeeting10pDoc(doc) ||
    isProductFeatures5dDoc(doc) ||
    isPmSolutionTriangleDoc(doc)
  )
}

export function isQuadrantDoc(
  doc: CanvasDocumentJSON | null | undefined,
): doc is QuadrantDocumentJSON {
  // Positive match only — unknown / other canvas types must not fall into STAR quadrant.
  return !!doc && doc.type === 'quadrant'
}
