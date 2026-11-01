/**
 * TipTap Slash「/」命令条目：块级 / 媒体 / 表单控件 / 文档模板。
 * 宿主（RichTextEditor）按 action 调用已有插入逻辑。
 */
import {
  RTE_DOC_TEMPLATES,
  RTE_DOC_TEMPLATE_GROUPS,
  type RteDocTemplateGroup,
} from './rteDocTemplates'

export type RteSlashGroup =
  | 'block'
  | 'media'
  | 'form'
  | 'template'

export type RteSlashFormKind =
  | 'radio'
  | 'checkbox'
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'date'
  | 'datetime'
  | 'switch'

export type RteSlashAction =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'paragraph' }
  | { type: 'bulletList' }
  | { type: 'orderedList' }
  | { type: 'taskList' }
  | { type: 'blockquote' }
  | { type: 'codeBlock' }
  | { type: 'hr' }
  | { type: 'plainDate' }
  | { type: 'plainDateTime' }
  | { type: 'dateChip' }
  | { type: 'dateRemind' }
  | { type: 'columns'; cols: 2 | 3 }
  | { type: 'docTitle' }
  | { type: 'table' }
  | { type: 'image' }
  | { type: 'video' }
  | { type: 'link' }
  | { type: 'formula' }
  | { type: 'attach' }
  | { type: 'note' }
  | { type: 'bookmark' }
  | { type: 'toggleBlock' }
  | { type: 'audio' }
  | { type: 'linkCard' }
  | { type: 'footnote' }
  | { type: 'qrcode' }
  | { type: 'timeline' }
  | { type: 'statusChip' }
  | { type: 'progressBar' }
  | { type: 'tabsBlock' }
  | { type: 'mermaid' }
  | { type: 'ruby' }
  | { type: 'xref' }
  | { type: 'snippet' }
  | { type: 'callout'; variant: 'info' | 'warn' | 'success' | 'error' }
  | { type: 'form'; kind: RteSlashFormKind }
  | { type: 'template'; id: string }

export type RteSlashItem = {
  id: string
  label: string
  description?: string
  group: RteSlashGroup
  /** 模板子分组（仅 template） */
  templateGroup?: RteDocTemplateGroup
  keywords: string[]
  action: RteSlashAction
  /** 菜单临时分组，例如「最近使用」 */
  sectionLabel?: string
}

export const RTE_SLASH_GROUP_LABELS: Record<RteSlashGroup, string> = {
  block: '常用块',
  media: '媒体与插入',
  form: '表单控件',
  template: '文档模板',
}

const BLOCK_ITEMS: RteSlashItem[] = [
  {
    id: 'heading-1',
    label: '标题 1',
    description: '一级大标题',
    group: 'block',
    keywords: ['h1', '标题', 'heading', 'title'],
    action: { type: 'heading', level: 1 },
  },
  {
    id: 'heading-2',
    label: '标题 2',
    description: '二级标题',
    group: 'block',
    keywords: ['h2', '标题', 'heading'],
    action: { type: 'heading', level: 2 },
  },
  {
    id: 'heading-3',
    label: '标题 3',
    description: '三级标题',
    group: 'block',
    keywords: ['h3', '标题', 'heading'],
    action: { type: 'heading', level: 3 },
  },
  {
    id: 'heading-4',
    label: '标题 4',
    description: '四级标题',
    group: 'block',
    keywords: ['h4', '标题', 'heading'],
    action: { type: 'heading', level: 4 },
  },
  {
    id: 'heading-5',
    label: '标题 5',
    description: '五级标题',
    group: 'block',
    keywords: ['h5', '标题', 'heading'],
    action: { type: 'heading', level: 5 },
  },
  {
    id: 'heading-6',
    label: '标题 6',
    description: '六级标题',
    group: 'block',
    keywords: ['h6', '标题', 'heading'],
    action: { type: 'heading', level: 6 },
  },
  {
    id: 'bullet-list',
    label: '无序列表',
    description: '项目符号列表',
    group: 'block',
    keywords: ['ul', '列表', 'bullet', 'unordered'],
    action: { type: 'bulletList' },
  },
  {
    id: 'ordered-list',
    label: '有序列表',
    description: '数字编号列表',
    group: 'block',
    keywords: ['ol', '列表', 'ordered', 'number'],
    action: { type: 'orderedList' },
  },
  {
    id: 'task-list',
    label: '任务列表',
    description: '可勾选待办',
    group: 'block',
    keywords: ['todo', 'task', '任务', '清单', 'checkbox'],
    action: { type: 'taskList' },
  },
  {
    id: 'blockquote',
    label: '引用',
    description: '引用段落',
    group: 'block',
    keywords: ['quote', '引用', 'blockquote'],
    action: { type: 'blockquote' },
  },
  {
    id: 'code-block',
    label: '代码块',
    description: '多行代码',
    group: 'block',
    keywords: ['code', '代码', 'pre'],
    action: { type: 'codeBlock' },
  },
  {
    id: 'hr',
    label: '分割线',
    description: '水平分隔',
    group: 'block',
    keywords: ['hr', '分割', 'divider', 'line'],
    action: { type: 'hr' },
  },
  {
    id: 'plain-date',
    label: '今天日期',
    description: '插入当前日期文本',
    group: 'block',
    keywords: ['date', '日期', 'today', '今天'],
    action: { type: 'plainDate' },
  },
  {
    id: 'plain-datetime',
    label: '现在时间',
    description: '插入当前日期时间文本',
    group: 'block',
    keywords: ['datetime', '时间', 'now', '此刻'],
    action: { type: 'plainDateTime' },
  },
  {
    id: 'date-chip',
    label: '日期',
    description: '行内日期',
    group: 'block',
    keywords: ['date', '日期', 'chip', '今天'],
    action: { type: 'dateChip' },
  },
  {
    id: 'date-remind',
    label: '提醒',
    description: '带说明的日期',
    group: 'block',
    keywords: ['remind', '提醒', 'todo', '日期'],
    action: { type: 'dateRemind' },
  },
  {
    id: 'doc-title',
    label: '标题块',
    description: '正文内标题，不改面板名',
    group: 'block',
    keywords: ['title', '标题', '封面', '文档标题'],
    action: { type: 'docTitle' },
  },
  {
    id: 'columns-2',
    label: '双栏',
    description: '左右两栏',
    group: 'block',
    keywords: ['column', '分栏', '双栏', '两栏'],
    action: { type: 'columns', cols: 2 },
  },
  {
    id: 'columns-3',
    label: '三栏',
    description: '三等分栏',
    group: 'block',
    keywords: ['column', '分栏', '三栏'],
    action: { type: 'columns', cols: 3 },
  },
  {
    id: 'table',
    label: '表格',
    description: '插入表格',
    group: 'block',
    keywords: ['table', '表格', 'grid'],
    action: { type: 'table' },
  },
  {
    id: 'callout-info',
    label: '告示框 · 提示',
    description: '信息提示块',
    group: 'block',
    keywords: ['callout', '告示', '提示', 'info', 'tip', '注意'],
    action: { type: 'callout', variant: 'info' },
  },
  {
    id: 'callout-warn',
    label: '告示框 · 警告',
    description: '警告提示块',
    group: 'block',
    keywords: ['callout', '告示', '警告', 'warn', 'warning'],
    action: { type: 'callout', variant: 'warn' },
  },
  {
    id: 'callout-success',
    label: '告示框 · 成功',
    description: '成功提示块',
    group: 'block',
    keywords: ['callout', '告示', '成功', 'success'],
    action: { type: 'callout', variant: 'success' },
  },
  {
    id: 'callout-error',
    label: '告示框 · 错误',
    description: '错误/危险提示块',
    group: 'block',
    keywords: ['callout', '告示', '错误', 'error', '危险'],
    action: { type: 'callout', variant: 'error' },
  },
]

const MEDIA_ITEMS: RteSlashItem[] = [
  {
    id: 'image',
    label: '图片',
    description: '插入图片',
    group: 'media',
    keywords: ['image', 'img', '图片', 'photo'],
    action: { type: 'image' },
  },
  {
    id: 'video',
    label: '视频',
    description: '插入视频',
    group: 'media',
    keywords: ['video', '视频', 'mp4'],
    action: { type: 'video' },
  },
  {
    id: 'link',
    label: '链接',
    description: '插入或编辑链接',
    group: 'media',
    keywords: ['link', 'url', '链接', '超链接'],
    action: { type: 'link' },
  },
  {
    id: 'formula',
    label: '公式',
    description: '插入数学公式',
    group: 'media',
    keywords: ['math', 'formula', '公式', 'latex', 'katex'],
    action: { type: 'formula' },
  },
  {
    id: 'attach',
    label: '附件',
    description: '插入附件',
    group: 'media',
    keywords: ['attach', 'file', '附件', '文件'],
    action: { type: 'attach' },
  },
  {
    id: 'note',
    label: '注释',
    description: '插入注释标记',
    group: 'media',
    keywords: ['note', 'annotation', '注释', '脚注'],
    action: { type: 'note' },
  },
  {
    id: 'bookmark',
    label: '书签',
    description: '插入可跳转锚点',
    group: 'media',
    keywords: ['bookmark', '书签', '锚点', 'anchor'],
    action: { type: 'bookmark' },
  },
  {
    id: 'toggle-block',
    label: '折叠块',
    description: '可展开收起的内容块',
    group: 'block',
    keywords: ['toggle', 'fold', '折叠', 'details'],
    action: { type: 'toggleBlock' },
  },
  {
    id: 'audio',
    label: '音频',
    description: '插入音频',
    group: 'media',
    keywords: ['audio', '音频', 'music', 'mp3'],
    action: { type: 'audio' },
  },
  {
    id: 'link-card',
    label: '网页卡片',
    description: '链接卡片或受控嵌入',
    group: 'media',
    keywords: ['embed', 'iframe', '卡片', '网页'],
    action: { type: 'linkCard' },
  },
  {
    id: 'footnote',
    label: '脚注',
    description: '插入脚注标记',
    group: 'media',
    keywords: ['footnote', '脚注', 'fn'],
    action: { type: 'footnote' },
  },
  {
    id: 'qrcode',
    label: '二维码',
    description: '插入二维码图片',
    group: 'media',
    keywords: ['qr', '二维码', 'qrcode'],
    action: { type: 'qrcode' },
  },
  {
    id: 'timeline',
    label: '时间线',
    description: '里程碑时间线',
    group: 'block',
    keywords: ['timeline', '时间线', '里程碑'],
    action: { type: 'timeline' },
  },
  {
    id: 'status-chip',
    label: '状态徽章',
    description: '彩色状态 Chip',
    group: 'block',
    keywords: ['chip', '徽章', '状态', 'tag'],
    action: { type: 'statusChip' },
  },
  {
    id: 'progress-bar',
    label: '进度条',
    description: '0–100% 进度',
    group: 'block',
    keywords: ['progress', '进度'],
    action: { type: 'progressBar' },
  },
  {
    id: 'tabs-block',
    label: '标签页',
    description: '多页签内容块',
    group: 'block',
    keywords: ['tabs', '标签页', '页签'],
    action: { type: 'tabsBlock' },
  },
  {
    id: 'mermaid',
    label: '流程图',
    description: 'Mermaid 流程图',
    group: 'block',
    keywords: ['mermaid', 'flowchart', '流程图', '时序'],
    action: { type: 'mermaid' },
  },
  {
    id: 'ruby',
    label: '注音',
    description: '为选中字加拼音/注音',
    group: 'block',
    keywords: ['ruby', '注音', '拼音'],
    action: { type: 'ruby' },
  },
  {
    id: 'xref',
    label: '交叉引用',
    description: '引用标题/图/表',
    group: 'block',
    keywords: ['xref', '交叉引用', '见图'],
    action: { type: 'xref' },
  },
  {
    id: 'snippet',
    label: '文本片段',
    description: '常用语 Snippets',
    group: 'block',
    keywords: ['snippet', '片段', '常用语'],
    action: { type: 'snippet' },
  },
]

const FORM_ITEMS: RteSlashItem[] = [
  {
    id: 'form-radio',
    label: '单选组',
    description: '表单单选',
    group: 'form',
    keywords: ['radio', '单选', 'form'],
    action: { type: 'form', kind: 'radio' },
  },
  {
    id: 'form-checkbox',
    label: '多选组',
    description: '表单多选',
    group: 'form',
    keywords: ['checkbox', '多选', 'form'],
    action: { type: 'form', kind: 'checkbox' },
  },
  {
    id: 'form-text',
    label: '文本输入',
    description: '单行文本',
    group: 'form',
    keywords: ['input', 'text', '文本', 'form'],
    action: { type: 'form', kind: 'text' },
  },
  {
    id: 'form-textarea',
    label: '多行文本',
    description: '多行输入',
    group: 'form',
    keywords: ['textarea', '多行', 'form'],
    action: { type: 'form', kind: 'textarea' },
  },
  {
    id: 'form-number',
    label: '数字输入',
    description: '数值字段',
    group: 'form',
    keywords: ['number', '数字', 'form'],
    action: { type: 'form', kind: 'number' },
  },
  {
    id: 'form-select',
    label: '下拉选择',
    description: '下拉框',
    group: 'form',
    keywords: ['select', '下拉', 'form'],
    action: { type: 'form', kind: 'select' },
  },
  {
    id: 'form-date',
    label: '日期',
    description: '日期选择',
    group: 'form',
    keywords: ['date', '日期', 'form'],
    action: { type: 'form', kind: 'date' },
  },
  {
    id: 'form-datetime',
    label: '日期时间',
    description: '日期与时间',
    group: 'form',
    keywords: ['datetime', '时间', 'form'],
    action: { type: 'form', kind: 'datetime' },
  },
  {
    id: 'form-switch',
    label: '开关',
    description: '布尔开关',
    group: 'form',
    keywords: ['switch', '开关', 'toggle', 'form'],
    action: { type: 'form', kind: 'switch' },
  },
]

const TEMPLATE_ITEMS: RteSlashItem[] = RTE_DOC_TEMPLATES.map((tpl) => ({
  id: `tpl-${tpl.id}`,
  label: tpl.label,
  description: tpl.description,
  group: 'template' as const,
  templateGroup: tpl.group,
  keywords: [tpl.id, tpl.label, tpl.description || '', tpl.group],
  action: { type: 'template' as const, id: tpl.id },
}))

export const RTE_SLASH_ITEMS: RteSlashItem[] = [
  ...BLOCK_ITEMS,
  ...MEDIA_ITEMS,
  ...FORM_ITEMS,
  ...TEMPLATE_ITEMS,
]

const GROUP_ORDER: RteSlashGroup[] = ['block', 'media', 'form', 'template']

function matchQuery(item: RteSlashItem, q: string): boolean {
  if (!q) return true
  const hay = [item.label, item.description || '', item.id, ...item.keywords]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part))
}

/** 过滤并按分组顺序返回（模板组内再按办公/产品…） */
export function filterRteSlashItems(query: string, limit = 80): RteSlashItem[] {
  const q = (query || '').trim()
  const matched = RTE_SLASH_ITEMS.filter((it) => matchQuery(it, q))
  const tplGroupOrder = RTE_DOC_TEMPLATE_GROUPS.map((g) => g.id)
  const out: RteSlashItem[] = []
  for (const g of GROUP_ORDER) {
    const bucket = matched.filter((it) => it.group === g)
    if (g === 'template') {
      bucket.sort((a, b) => {
        const ai = tplGroupOrder.indexOf(a.templateGroup!)
        const bi = tplGroupOrder.indexOf(b.templateGroup!)
        if (ai !== bi) return ai - bi
        return a.label.localeCompare(b.label, 'zh')
      })
    }
    out.push(...bucket)
  }
  return out.slice(0, limit)
}

export { rteSlashGlyph } from '../utils/rteSlashGlyph'

export function rteSlashSectionLabel(item: RteSlashItem): string {
  if (item.sectionLabel) return item.sectionLabel
  if (item.group !== 'template' || !item.templateGroup) {
    return RTE_SLASH_GROUP_LABELS[item.group]
  }
  const g = RTE_DOC_TEMPLATE_GROUPS.find((x) => x.id === item.templateGroup)
  return g ? `模板 · ${g.label}` : RTE_SLASH_GROUP_LABELS.template
}
