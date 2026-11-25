/**
 * 字数统计面板的数据汇总。
 *
 * 工具栏下拉面板与底栏抽屉是同一个统计面板的两个入口，
 * 这里做唯一的数据映射口，避免两处各写一遍字段口径而漂移。
 */

export interface WordStatsPanelData {
  charCount: number
  wordCount: number
  readingMinutes: number
  paragraphs: number
  lines: number
  headings: number
  cjk: number
  asciiWords: number
  images: number
  hasSelection: boolean
  selectionChars: number
  selectionWords: number
}

export interface WordStatsSource {
  charCount?: number
  wordCount?: number
  readingMinutes?: number
  docExtraStats?: {
    paragraphs?: number
    lines?: number
    headings?: number
    cjk?: number
    asciiWords?: number
  }
  wordParts?: { images?: number }
  selectionStats?: { chars?: number; words?: number; hasSelection?: boolean }
}

export function buildWordStatsPanelData(rte: WordStatsSource): WordStatsPanelData {
  const extra = rte.docExtraStats ?? {}
  const selection = rte.selectionStats ?? {}
  return {
    charCount: rte.charCount ?? 0,
    wordCount: rte.wordCount ?? 0,
    readingMinutes: rte.readingMinutes ?? 0,
    paragraphs: extra.paragraphs ?? 0,
    lines: extra.lines ?? 0,
    headings: extra.headings ?? 0,
    cjk: extra.cjk ?? 0,
    asciiWords: extra.asciiWords ?? 0,
    images: rte.wordParts?.images ?? 0,
    hasSelection: selection.hasSelection ?? false,
    selectionChars: selection.chars ?? 0,
    selectionWords: selection.words ?? 0,
  }
}
