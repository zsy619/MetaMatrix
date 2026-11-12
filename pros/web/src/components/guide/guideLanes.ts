import type { TemplateCategory, TemplateId } from '../../stores/document'

export interface GuideLane {
  id: string
  title: string
  hint?: string
  /** 按顺序编号，例如五步法 1 到 6 */
  series?: boolean
  ids: TemplateId[]
}

/** 每一类里再按用途排开。每张画布只出现一次。 */
export const GUIDE_LANES: Record<TemplateCategory, GuideLane[]> = {
  method: [
    {
      id: 'think',
      title: '把一件事想清楚',
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
      id: 'choice',
      title: '做选择',
      hint: '黄金圈、SOAR、制胜、VRIO、RICE',
      ids: ['golden-circle', 'soar', 'playing-to-win', 'vrio', 'impact-effort', 'rice', 'moscow'],
    },
    {
      id: 'project',
      title: '项目怎么排',
      hint: '甘特、RACI、干系人、OKR',
      ids: ['project-gantt', 'raci-matrix', 'stakeholder-map', 'okr'],
    },
    {
      id: 'pm',
      title: '项目管理自评',
      hint: '敏感度、竞争力、ROI',
      ids: ['pm-sensitivity-6d', 'pm-competency', 'pm-solution-triangle', 'roi-tradeoff', 'roi-decision'],
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
      id: 'model',
      title: '商业模式',
      hint: '商业模式、精益、价值主张、SWOT',
      ids: ['business-model-canvas', 'lean-canvas', 'value-proposition', 'swot', 'value-chain', 'business-formula'],
    },
    {
      id: 'money',
      title: '钱和增长',
      hint: '现金流、利润、盈亏平衡',
      ids: ['cash-flow', 'income-statement', 'break-even', 'growth-assumptions', 'unit-model-quadrant'],
    },
    {
      id: 'customer',
      title: '产品和客户',
      hint: '需求、旅程、卡诺、取舍',
      ids: ['demand-triangle', 'customer-journey', 'kano', 'product-content', 'product-features-5d', 'ai-tradeoff', 'key-resistance', 'conversion-tradeoff'],
    },
  ],
  industry: [
    {
      id: 'industry',
      title: '行业调研',
      ids: ['oscar', 'industry-analysis', 'industry-forecast', 'five-forces'],
    },
  ],
  org: [
    {
      id: 'meeting',
      title: '开会和沟通',
      ids: ['scientific-meeting', 'scientific-meeting-10p', 'online-offline-comm'],
    },
    {
      id: 'org-run',
      title: '组织怎么转',
      hint: '7S、PDCA、每日看板',
      ids: ['seven-s', 'pdca', 'daily-kanban', 'ipo', 'leadership-triangle'],
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
      ids: ['fde-pricing', 'fde-org', 'fde-self', 'fde-tooling', 'fde-contract', 'fde-portfolio'],
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
