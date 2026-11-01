/**
 * 表格分色：每格 / 每列独立的饱和抬头 + 浅色内容区 + 深色主题词。
 *
 * 前 6 色与人类×AI 双三角表（DualTriangleBlock TABLE_PALETTE）同一色值，
 * 后续色相沿同一明度拉开，避免一张画布里超过 6 列时撞色。
 * 六套五步法画布保持已定稿的参考表黄头，不从这里取色。
 */
export interface TableTone {
  header: string
  body: string
  topic: string
}

export const fiveStepPalette: readonly TableTone[] = [
  { header: '#0E8A84', body: '#E5F6F5', topic: '#0B6B66' },
  { header: '#A67C00', body: '#FBF6E4', topic: '#7A5C00' },
  { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  { header: '#2A649F', body: '#E8F1FA', topic: '#1C4C7C' },
  { header: '#187A4E', body: '#E7F6EF', topic: '#125C3B' },
  { header: '#A84562', body: '#FBEFF2', topic: '#84344C' },
  { header: '#4C4F9C', body: '#EEEEF8', topic: '#383B78' },
  { header: '#6A7818', body: '#F4F6E6', topic: '#4E5A10' },
  { header: '#7A3E86', body: '#F6EEF8', topic: '#5C2C66' },
  { header: '#1A7088', body: '#E6F3F6', topic: '#125468' },
  { header: '#8A5A2A', body: '#F8F1E8', topic: '#684218' },
  { header: '#3E5A78', body: '#EEF2F6', topic: '#2C4258' },
]

export function toneAt(index: number): TableTone {
  const len = fiveStepPalette.length
  const n = ((index % len) + len) % len
  return fiveStepPalette[n]!
}

/** 写到格子或列上，供抬头 / 内容区 CSS 变量使用。 */
export function toneVars(index: number): Record<string, string> {
  const tone = toneAt(index)
  return {
    '--tbl-header': tone.header,
    '--tbl-body': tone.body,
    '--tbl-topic': tone.topic,
  }
}
