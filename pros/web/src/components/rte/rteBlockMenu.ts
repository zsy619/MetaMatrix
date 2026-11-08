import type { CalloutVariant } from '../../extensions/callout'
import type { QuoteStyle } from '../../extensions/rteBlockquote'

/**
 * 正文下拉（选区条和工具栏共用），对齐飞书的块类型菜单：
 * 正文、一到三级标题、其他标题、列表、代码块、引用、高亮块、同步块。
 * 编辑器标题只到六级，其他标题里放四到六级。
 */

export type BlockMenuAction =
  | { type: 'paragraph' }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'bullet' }
  | { type: 'ordered' }
  | { type: 'task' }
  | { type: 'code' }
  | { type: 'quote'; style: QuoteStyle }
  | { type: 'callout'; variant: CalloutVariant }
  | { type: 'sync' }
  | { type: 'submenu' }

export type BlockMenuItem = {
  id: string
  label: string
  /** 左侧短标记，对应飞书菜单里的 T / H1 / {} */
  mark: string
  action: BlockMenuAction
  children?: BlockMenuItem[]
  /** 这一项前面加分隔线 */
  splitBefore?: boolean
}

export const BLOCK_MENU: BlockMenuItem[] = [
  { id: 'paragraph', label: '正文', mark: 'T', action: { type: 'paragraph' } },
  { id: 'h1', label: '一级标题', mark: 'H1', action: { type: 'heading', level: 1 } },
  { id: 'h2', label: '二级标题', mark: 'H2', action: { type: 'heading', level: 2 } },
  { id: 'h3', label: '三级标题', mark: 'H3', action: { type: 'heading', level: 3 } },
  {
    id: 'other-headings',
    label: '其他标题',
    mark: 'Hn',
    action: { type: 'submenu' },
    children: [
      { id: 'h4', label: '四级标题', mark: 'H4', action: { type: 'heading', level: 4 } },
      { id: 'h5', label: '五级标题', mark: 'H5', action: { type: 'heading', level: 5 } },
      { id: 'h6', label: '六级标题', mark: 'H6', action: { type: 'heading', level: 6 } },
    ],
  },
  { id: 'ordered', label: '有序列表', mark: '1.', action: { type: 'ordered' } },
  { id: 'bullet', label: '无序列表', mark: '•', action: { type: 'bullet' } },
  { id: 'task', label: '任务', mark: '☑', action: { type: 'task' } },
  { id: 'code', label: '代码块', mark: '{}', action: { type: 'code' } },
  {
    id: 'quote',
    label: '引用',
    mark: '“',
    action: { type: 'quote', style: 'default' },
    splitBefore: true,
    children: [
      { id: 'quote-default', label: '标准引用', mark: '“', action: { type: 'quote', style: 'default' } },
      { id: 'quote-emphasis', label: '强调引用', mark: '“', action: { type: 'quote', style: 'emphasis' } },
      { id: 'quote-verse', label: '诗文引用', mark: '“', action: { type: 'quote', style: 'verse' } },
    ],
  },
  {
    id: 'callout',
    label: '高亮块',
    mark: '▣',
    action: { type: 'callout', variant: 'info' },
    children: [
      { id: 'callout-info', label: '提示', mark: '▣', action: { type: 'callout', variant: 'info' } },
      { id: 'callout-warn', label: '警告', mark: '▣', action: { type: 'callout', variant: 'warn' } },
      { id: 'callout-success', label: '成功', mark: '▣', action: { type: 'callout', variant: 'success' } },
      { id: 'callout-error', label: '错误', mark: '▣', action: { type: 'callout', variant: 'error' } },
    ],
  },
  { id: 'sync', label: '同步块', mark: '⇄', action: { type: 'sync' } },
]

export type BlockMenuState = {
  headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6
  bullet: boolean
  ordered: boolean
  task: boolean
  code: boolean
  quote: QuoteStyle | null
  callout: CalloutVariant | null
  sync: boolean
}

export function findBlockMenuItem(id: string, items: BlockMenuItem[] = BLOCK_MENU): BlockMenuItem | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const child = findBlockMenuItem(id, item.children)
      if (child) return child
    }
  }
  return null
}

/** 当前块对应的菜单项。外层容器优先于里面的标题。 */
export function blockMenuSelection(state: BlockMenuState): BlockMenuItem {
  if (state.sync) return findBlockMenuItem('sync')!
  if (state.callout) return findBlockMenuItem(`callout-${state.callout}`) || findBlockMenuItem('callout')!
  if (state.code) return findBlockMenuItem('code')!
  if (state.task) return findBlockMenuItem('task')!
  if (state.ordered) return findBlockMenuItem('ordered')!
  if (state.bullet) return findBlockMenuItem('bullet')!
  if (state.quote === 'emphasis') return findBlockMenuItem('quote-emphasis')!
  if (state.quote === 'verse') return findBlockMenuItem('quote-verse')!
  if (state.quote) return findBlockMenuItem('quote-default')!
  if (state.headingLevel >= 1) return findBlockMenuItem(`h${state.headingLevel}`)!
  return findBlockMenuItem('paragraph')!
}

/** 按钮上回显的名字。引用和高亮块用总称，标题用具体级别。 */
export function blockMenuButtonLabel(state: BlockMenuState): string {
  if (state.sync) return '同步块'
  if (state.callout) return '高亮块'
  if (state.code) return '代码块'
  if (state.task) return '任务'
  if (state.ordered) return '有序列表'
  if (state.bullet) return '无序列表'
  if (state.quote) return '引用'
  if (state.headingLevel >= 1) return findBlockMenuItem(`h${state.headingLevel}`)!.label
  return '正文'
}

export function isBlockMenuItemActive(id: string, state: BlockMenuState): boolean {
  const selected = blockMenuSelection(state).id
  if (id === selected) return true
  const item = findBlockMenuItem(id)
  return !!item?.children?.some((child) => child.id === selected)
}

/** 键盘上下移动时的可见行：下级只在展开时计入。 */
export function visibleBlockMenuItems(submenuId: string | null, items: BlockMenuItem[] = BLOCK_MENU): BlockMenuItem[] {
  const rows: BlockMenuItem[] = []
  for (const item of items) {
    rows.push(item)
    if (item.children && submenuId === item.id) rows.push(...item.children)
  }
  return rows
}
