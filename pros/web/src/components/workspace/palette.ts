import {
  CATEGORY_LABELS,
  isTemplateId,
  TEMPLATE_META,
  type TemplateCategory,
} from '../../stores/document'

export const CATEGORY_ACCENT: Record<TemplateCategory, string> = {
  method: '#1a73e8',
  growth: '#34a853',
  industry: '#f9a825',
  org: '#a142f4',
  review: '#ea4335',
  fde: '#0f766e',
}

export const TREND_COLORS = ['#1a73e8', '#34a853', '#a142f4', '#f9a825', '#ea4335', '#00897b']

/** 不是模板画布的类型（节点画布）也要有中文名，别在界面上露出英文 id。 */
const CANVAS_TYPE_LABELS: Record<string, string> = {
  'node-graph': '节点画布',
}

export function templateName(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return TEMPLATE_META[id].name
  if (id && CANVAS_TYPE_LABELS[id]) return CANVAS_TYPE_LABELS[id]
  return id || '未归档'
}

export function accentOf(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return CATEGORY_ACCENT[TEMPLATE_META[id].category]
  return '#5f6368'
}

export function canvasTypeLabel(canvasType: string): string {
  const asId = canvasType.replace(/_/g, '-')
  if (isTemplateId(asId)) return TEMPLATE_META[asId].name
  if (!canvasType || canvasType === 'unknown') return '未分类'
  if (CANVAS_TYPE_LABELS[canvasType]) return CANVAS_TYPE_LABELS[canvasType]
  return canvasType.replace(/_/g, ' ')
}

export function categoryLabel(id: TemplateCategory): string {
  return CATEGORY_LABELS[id]
}
