/** 书写栏目的纸面样式。空字符串是编辑器默认纸面。 */
export const WRITING_PAPERS = [
  { id: '', label: '默认' },
  { id: 'xhs', label: '小红书' },
  { id: 'wechat', label: '公众号' },
  { id: 'letter', label: '信纸' },
  { id: 'draft', label: '稿纸' },
  { id: 'tianzi', label: '田字格' },
  { id: 'mizi', label: '米字格' },
  { id: 'english', label: '四线三格' },
  { id: 'dot', label: '点阵' },
  { id: 'cornell', label: '康奈尔' },
  { id: 'vertical', label: '竖排' },
  { id: 'graph', label: '坐标纸' },
] as const

export type WritingPaperId = (typeof WRITING_PAPERS)[number]['id']

const IDS = new Set<string>(WRITING_PAPERS.map((item) => item.id))

export function normalizeWritingPaper(value: unknown): WritingPaperId {
  return typeof value === 'string' && IDS.has(value) ? (value as WritingPaperId) : ''
}

export function writingPaperStorageKey(panelId: string | undefined): string {
  return `rte-writing-paper:${panelId || 'default'}`
}

export function readWritingPaper(panelId: string | undefined): WritingPaperId {
  if (typeof localStorage === 'undefined') return ''
  try {
    return normalizeWritingPaper(localStorage.getItem(writingPaperStorageKey(panelId)))
  } catch {
    return ''
  }
}

export function writeWritingPaper(panelId: string | undefined, id: WritingPaperId): void {
  try {
    const key = writingPaperStorageKey(panelId)
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* 隐私模式写不进去时，这一次切换仍然生效 */
  }
}
