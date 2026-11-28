/**
 * 「+」块操作面板的菜单配置。
 *
 * 面板分四段：基础（图标快捷区）、插入（常用 / 更多插入）、转换为、块操作。
 * 同一段以外的命令不允许重复出现 —— 归一化后的命令（转换目标 / 斜杠命令 id）
 * 全局判重，**先出现的段落占位**，后面的段落自动去掉重复项。
 *
 * 去重前后的差异（去重是自动的，不是手工删的）：
 *  - 「公式」「分割线」既在基础图标区、也在常用插入区 → 常用区不再重复列出；
 *  - 「正文 / 标题 1-3 / 无序列表 / 有序列表 / 任务列表 / 引用」既在基础图标区、
 *    也在转换为区 → 转换为区只剩基础区没覆盖的告示类型（警告 / 成功 / 错误）。
 */

/** 可转换的块类型。 */
export type BlockPanelTurn =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'code'
  | 'quote'
  | 'info'
  | 'warn'
  | 'success'
  | 'error'

export type BlockPanelEntry = {
  /** RteMenuGlyph 图标 id */
  id: string
  /** 菜单文案 */
  label: string
  /** 转换目标：把当前悬停块转成该类型 */
  turn?: BlockPanelTurn
  /** 斜杠命令 id：插入新块 */
  slashId?: string
}

export type BlockPanelInsertSection = {
  label: string
  items: BlockPanelEntry[]
}

/** 面板条目的唯一命令键：转换目标与插入命令分属两个命名空间。 */
export function blockPanelCommandKey(entry: BlockPanelEntry): string {
  if (entry.turn) return `turn:${entry.turn}`
  return `insert:${entry.slashId ?? entry.id}`
}

/** 基础：高频块类型的图标快捷区。 */
const RAW_QUICK_ACTIONS: BlockPanelEntry[] = [
  { id: 'paragraph', label: '正文', turn: 'paragraph' },
  { id: 'h1', label: '标题 1', turn: 'h1' },
  { id: 'h2', label: '标题 2', turn: 'h2' },
  { id: 'h3', label: '标题 3', turn: 'h3' },
  { id: 'bullet', label: '无序列表', turn: 'bullet' },
  { id: 'ordered', label: '有序列表', turn: 'ordered' },
  { id: 'task', label: '任务列表', turn: 'task' },
  { id: 'code', label: '代码块', turn: 'code' },
  { id: 'quote', label: '引用', turn: 'quote' },
  { id: 'info', label: '高亮块', turn: 'info' },
  { id: 'formula', label: '公式', slashId: 'formula' },
  { id: 'hr', label: '分割线', slashId: 'hr' },
]

/** 插入：常用与更多插入。 */
const RAW_INSERT_SECTIONS: BlockPanelInsertSection[] = [
  {
    label: '常用',
    items: [
      { id: 'image', label: '图片', slashId: 'image' },
      { id: 'video', label: '视频', slashId: 'video' },
      { id: 'attach', label: '附件', slashId: 'attach' },
      { id: 'table', label: '表格', slashId: 'table' },
      { id: 'columns', label: '分栏', slashId: 'columns-2' },
      { id: 'linkButton', label: '按钮', slashId: 'link-button' },
      { id: 'formula', label: '公式', slashId: 'formula' },
      { id: 'hr', label: '分割线', slashId: 'hr' },
      { id: 'link', label: '链接', slashId: 'link' },
    ],
  },
  {
    label: '更多插入',
    items: [
      { id: 'toc', label: '目录', slashId: 'toc' },
      { id: 'toggleBlock', label: '折叠块', slashId: 'toggle-block' },
      { id: 'date', label: '今天日期', slashId: 'plain-date' },
      { id: 'linkCard', label: '网页卡片', slashId: 'link-card' },
      { id: 'mermaid', label: '流程图', slashId: 'mermaid' },
      { id: 'echarts', label: '图表', slashId: 'echarts' },
    ],
  },
]

/** 转换为：可把当前块转成的全部类型。 */
const RAW_TURN_ACTIONS: BlockPanelEntry[] = [
  { id: 'paragraph', label: '正文', turn: 'paragraph' },
  { id: 'h1', label: '标题 1', turn: 'h1' },
  { id: 'h2', label: '标题 2', turn: 'h2' },
  { id: 'h3', label: '标题 3', turn: 'h3' },
  { id: 'bullet', label: '无序列表', turn: 'bullet' },
  { id: 'ordered', label: '有序列表', turn: 'ordered' },
  { id: 'task', label: '任务列表', turn: 'task' },
  { id: 'quote', label: '引用', turn: 'quote' },
  { id: 'info', label: '提示', turn: 'info' },
  { id: 'warn', label: '警告', turn: 'warn' },
  { id: 'success', label: '成功', turn: 'success' },
  { id: 'error', label: '错误', turn: 'error' },
]

function buildBlockPanel(): {
  quick: BlockPanelEntry[]
  insertSections: BlockPanelInsertSection[]
  turnActions: BlockPanelEntry[]
} {
  const taken = new Set<string>()
  const claim = (entries: BlockPanelEntry[]): BlockPanelEntry[] =>
    entries.filter((entry) => {
      const key = blockPanelCommandKey(entry)
      if (taken.has(key)) return false
      taken.add(key)
      return true
    })

  return {
    quick: claim(RAW_QUICK_ACTIONS),
    insertSections: RAW_INSERT_SECTIONS.map((section) => ({
      label: section.label,
      items: claim(section.items),
    })),
    turnActions: claim(RAW_TURN_ACTIONS),
  }
}

const panel = buildBlockPanel()

export const BLOCK_PANEL_QUICK_ACTIONS: BlockPanelEntry[] = panel.quick
export const BLOCK_PANEL_INSERT_SECTIONS: BlockPanelInsertSection[] = panel.insertSections
export const BLOCK_PANEL_TURN_ACTIONS: BlockPanelEntry[] = panel.turnActions

/** 面板里全部条目（基础 + 插入 + 转换为），用于查重。 */
export const BLOCK_PANEL_ENTRIES: BlockPanelEntry[] = [
  ...BLOCK_PANEL_QUICK_ACTIONS,
  ...BLOCK_PANEL_INSERT_SECTIONS.flatMap((section) => section.items),
  ...BLOCK_PANEL_TURN_ACTIONS,
]
