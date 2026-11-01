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
}

export const TREND_COLORS = ['#1a73e8', '#34a853', '#a142f4', '#f9a825', '#ea4335', '#00897b']

export function templateName(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return TEMPLATE_META[id].name
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
  return canvasType.replace(/_/g, ' ')
}

export function categoryLabel(id: TemplateCategory): string {
  return CATEGORY_LABELS[id]
}
