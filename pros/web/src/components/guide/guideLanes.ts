import type { TemplateCategory, TemplateId } from '../../stores/document'

export interface GuideLane {
  id: string
  title: string
  hint?: string
  /** 按顺序编号，例如五步法 1 到 6 */
  series?: boolean
  ids: TemplateId[]
}

/**
 * 每一类里再按用途排开。每张画布只出现一次。
 *
 * 分类口径：一张画布归哪类，取决于「你在哪个阶段用它」，不取决于「它谈什么主题」。
 * 同一个方法家族（例如业务公式四张、项目管理四张）必须在同一条轨道里，
 * 否则引导页会把它们拆到不同类里，用户找不到。
 */
export const GUIDE_LANES: Record<TemplateCategory, GuideLane[]> = {
  method: [
    {
      id: 'think',
      title: '想清楚一件事',
      hint: '双三角、Y 模型、基本功',
      ids: ['dual-triangle', 'dual-triangle-human-ai', 'y-model', 'three-ring-basics', 'context-six-elements', 'deliberate-practice'],
    },
    {
      id: 'time',
      title: '时间与状态',
      hint: '时间矩阵、工作状态、STAR',
      ids: ['time-matrix', 'work-state-zones', 'star-quadrant'],
    },
    {
      id: 'evaluate',
      title: '评估与取舍',
      hint: '需求、AI 边界、ROI 权衡',
      ids: ['demand-triangle', 'ai-tradeoff', 'key-resistance', 'roi-tradeoff', 'roi-decision'],
    },
    {
      id: 'choice',
      title: '做选择与排序',
      hint: '黄金圈、VRIO、RICE、MoSCoW',
      ids: ['golden-circle', 'soar', 'playing-to-win', 'vrio', 'impact-effort', 'rice', 'moscow'],
    },
  ],
  growth: [
    {
      id: 'five-step',
      title: '五步法',
      hint: '基础 → 分工 → 提高 → 进阶 → 挑战 → 原版',
      series: true,
      ids: ['five-step-basic', 'five-step-division', 'five-step-advanced', 'five-step-pro', 'five-step-challenge', 'five-step'],
    },
    {
      id: 'customer',
      title: '产品与客户',
      hint: '旅程、卡诺、内核、转化取舍',
      ids: ['customer-journey', 'kano', 'product-content', 'product-features-5d', 'conversion-tradeoff'],
    },
    {
      id: 'model',
      title: '商业模式',
      hint: '商业模式、精益、价值主张',
      ids: ['business-model-canvas', 'lean-canvas', 'value-proposition'],
    },
    {
      id: 'formula',
      title: '业务公式',
      hint: '公式、ABC 模型、十大范式、修炼爬山',
      ids: ['business-formula', 'abc-model', 'business-formula-patterns', 'cultivation-mountain'],
    },
    {
      id: 'money',
      title: '钱和经营',
      hint: '现金流、利润、盈亏平衡',
      ids: ['cash-flow', 'income-statement', 'break-even', 'growth-assumptions', 'unit-model-quadrant'],
    },
  ],
  industry: [
    {
      id: 'research',
      title: '调研与预判',
      hint: 'OSCAR、行业分析、行业预判',
      ids: ['oscar', 'industry-analysis', 'industry-forecast', 'hacker-five-steps'],
    },
    {
      id: 'competition',
      title: '竞争结构',
      hint: '波特五力、SWOT、价值链',
      ids: ['five-forces', 'swot', 'value-chain'],
    },
  ],
  org: [
    {
      id: 'project',
      title: '项目怎么排',
      hint: '甘特、RACI、干系人、OKR',
      ids: ['project-gantt', 'raci-matrix', 'stakeholder-map', 'okr'],
    },
    {
      id: 'pm-self',
      title: '项目自评',
      hint: '敏感度、竞争力、方案评估',
      ids: ['pm-sensitivity-6d', 'pm-competency', 'pm-solution-triangle'],
    },
    {
      id: 'org-run',
      title: '组织怎么转',
      hint: '7S、PDCA、每日看板',
      ids: ['seven-s', 'pdca', 'daily-kanban', 'ipo', 'leadership-triangle'],
    },
    {
      id: 'meeting',
      title: '开会和沟通',
      hint: '科学开会、十大原则、线上线下',
      ids: ['scientific-meeting', 'scientific-meeting-10p', 'online-offline-comm'],
    },
  ],
  review: [
    {
      id: 'period',
      title: '按周期写',
      hint: '周 → 月 → 季 → 年',
      series: true,
      ids: ['weekly-summary', 'monthly-summary', 'quarterly-summary', 'annual-summary'],
    },
    {
      id: 'deep',
      title: '把一件事写透',
      hint: '故障、深度复盘、项目复盘',
      ids: ['incident-review', 'deep-review', 'pm-retro-value'],
    },
  ],
  fde: [
    {
      id: 'pick',
      title: '先判断做不做',
      hint: '十格自检、三高，或先看别用 AI 的四种情况',
      ids: ['ten-check', 'scene-three-high', 'ai-boundary', 'fde-scenario', 'fde-select'],
    },
    {
      id: 'listen',
      title: '听清楚再开工',
      hint: '访谈、需求、启动检查',
      ids: ['fde-interview', 'fde-requirements', 'fde-kickoff'],
    },
    {
      id: 'pilot',
      title: '试点到上线',
      hint: '简报、评测、上线、验收，再看收益',
      ids: ['fde-pilot', 'fde-eval', 'fde-launch', 'fde-acceptance', 'fde-roi'],
    },
    {
      id: 'company',
      title: '公司和交付',
      hint: '收费、组织、选型、合同。不拿来给单个场景打分',
      ids: ['fde-pricing', 'fde-org', 'fde-self', 'fde-reliable-quadrant', 'fde-tooling', 'fde-contract', 'fde-portfolio'],
    },
  ],
}

export function guideLaneCount(category: TemplateCategory): number {
  return GUIDE_LANES[category].length
}

export function splitMatch(text: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text, hit: false }]
  const index = text.toLowerCase().indexOf(needle)
  if (index < 0) return [{ text, hit: false }]
  const end = index + needle.length
  return [
    { text: text.slice(0, index), hit: false },
    { text: text.slice(index, end), hit: true },
    { text: text.slice(end), hit: false },
  ].filter((part) => part.text.length > 0)
}

export function lanesFor<T extends { id: TemplateId }>(category: TemplateCategory, cards: T[]): { lane: GuideLane; cards: T[] }[] {
  const byId = new Map(cards.map((card) => [card.id, card]))
  const placed = new Set<TemplateId>()
  const blocks: { lane: GuideLane; cards: T[] }[] = []
  for (const lane of GUIDE_LANES[category]) {
    const items = lane.ids.flatMap((id) => {
      const card = byId.get(id)
      if (!card || placed.has(id)) return []
      placed.add(id)
      return [card]
    })
    if (items.length) blocks.push({ lane, cards: items })
  }
  const rest = cards.filter((card) => !placed.has(card.id))
  if (rest.length) {
    blocks.push({
      lane: { id: `${category}-rest`, title: '其他', ids: rest.map((card) => card.id) },
      cards: rest,
    })
  }
  return blocks
}
