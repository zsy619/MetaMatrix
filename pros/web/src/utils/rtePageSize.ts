/** 富文本面板的页面大小。缺省与无法识别的值都是宽度 100%。 */

export const RTE_PAGE_SIZE_IDS = [
  'full',
  'feishu',
  'a3',
  'a4',
  'a5',
  '8k',
  'b5',
  'letter',
] as const

export type RtePageSizeId = (typeof RTE_PAGE_SIZE_IDS)[number]

export type RtePageSizeOption = {
  id: RtePageSizeId
  label: string
  hint: string
  /** 纸面宽度。流体布局没有物理宽度。 */
  widthMm: number | null
  heightMm: number | null
  /** 居中白纸（页边距 + 阴影）。飞书样式只是阅读栏，不是纸张。 */
  paper: boolean
}

export const RTE_PAGE_SIZES: readonly RtePageSizeOption[] = [
  { id: 'full', label: '宽度 100%', hint: '铺满面板', widthMm: null, heightMm: null, paper: false },
  { id: 'feishu', label: '飞书样式', hint: '居中适中阅读宽度', widthMm: null, heightMm: null, paper: false },
  { id: 'a3', label: 'A3', hint: '297×420mm', widthMm: 297, heightMm: 420, paper: true },
  { id: 'a4', label: 'A4', hint: '210×297mm', widthMm: 210, heightMm: 297, paper: true },
  { id: 'a5', label: 'A5', hint: '148×210mm', widthMm: 148, heightMm: 210, paper: true },
  { id: '8k', label: '8K', hint: '约 270×390mm', widthMm: 270, heightMm: 390, paper: true },
  { id: 'b5', label: 'B5', hint: '176×250mm', widthMm: 176, heightMm: 250, paper: true },
  { id: 'letter', label: 'Letter', hint: '216×279mm', widthMm: 215.9, heightMm: 279.4, paper: true },
]

const BY_ID = new Map(RTE_PAGE_SIZES.map((item) => [item.id, item]))

export function normalizePageSize(value: unknown): RtePageSizeId {
  if (typeof value === 'string' && BY_ID.has(value as RtePageSizeId)) return value as RtePageSizeId
  return 'full'
}

export function pageSizeOption(id: RtePageSizeId): RtePageSizeOption {
  return BY_ID.get(id) || RTE_PAGE_SIZES[0]!
}

export function readPageSize(
  map: Record<string, string> | null | undefined,
  panelId: string | null | undefined,
): RtePageSizeId {
  if (!map || !panelId) return 'full'
  return normalizePageSize(map[panelId])
}

/** 选回宽度 100% 时删掉该面板的记录，让旧文档保持没有这个字段。 */
export function writePageSizeMap(
  map: Record<string, string> | null | undefined,
  panelId: string,
  size: RtePageSizeId,
): Record<string, string> | undefined {
  const next = { ...(map || {}) }
  if (!panelId) return Object.keys(next).length ? next : undefined
  if (size === 'full') delete next[panelId]
  else next[panelId] = size
  return Object.keys(next).length ? next : undefined
}

/** CSS 像素，96dpi。 */
export function mmToPx(mm: number): number {
  return Math.round((mm * 96) / 25.4)
}

export function sheetBox(id: RtePageSizeId): { widthPx: number; heightPx: number } | null {
  const spec = pageSizeOption(id)
  if (!spec.paper || spec.widthMm == null || spec.heightMm == null) return null
  return { widthPx: mmToPx(spec.widthMm), heightPx: mmToPx(spec.heightMm) }
}

/** 只返回预设里的 @page size，不接受外部字符串。 */
export function cssPageSize(id: RtePageSizeId): string {
  switch (id) {
    case 'a3':
      return 'A3'
    case 'a4':
      return 'A4'
    case 'a5':
      return 'A5'
    case 'b5':
      return 'B5'
    case 'letter':
      return 'letter'
    case '8k':
      return '270mm 390mm'
    case 'feishu':
      return '180mm 260mm'
    default:
      return 'auto'
  }
}

/** jsPDF format：标准名，或毫米 [宽, 高]。流体宽度导出时用 A4。 */
export function pdfPageFormat(id: RtePageSizeId): string | [number, number] {
  switch (id) {
    case 'a3':
      return 'a3'
    case 'a5':
      return 'a5'
    case 'b5':
      return 'b5'
    case 'letter':
      return 'letter'
    case '8k':
      return [270, 390]
    case 'feishu':
      return [180, 260]
    case 'a4':
    case 'full':
    default:
      return 'a4'
  }
}
