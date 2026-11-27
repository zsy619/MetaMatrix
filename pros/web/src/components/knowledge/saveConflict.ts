/** 协同保存冲突：选择谁的版本，或做最小合并。不清洗审阅标记。 */

export type SaveConflictChoice = 'mine' | 'theirs' | 'merge'

export type SaveConflictVersions = {
  mineHtml: string
  theirsHtml: string
  mineLabel?: string
  theirsLabel?: string
}

const SUGGESTION_ATTR = 'data-suggestion'

export function htmlPreviewText(html: string, max = 280): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

/** 保留两边 HTML，包括 data-suggestion 审阅标记；不做接受/拒绝清洗。 */
export function mergeConflictHtml(versions: SaveConflictVersions): string {
  const mine = versions.mineHtml ?? ''
  const theirs = versions.theirsHtml ?? ''
  if (mine === theirs) return mine
  if (hasBlockIds(mine) || hasBlockIds(theirs)) return mergeByBlockId(versions)
  return concatConflictHtml(versions)
}

function concatConflictHtml(versions: SaveConflictVersions): string {
  const theirsTitle = escapeText(versions.theirsLabel || '对方的版本')
  const mineTitle = escapeText(versions.mineLabel || '你的版本')
  return [
    `<p data-conflict-merge="true">以下为合并结果：先保留对方版本，再附上你的版本。</p>`,
    `<h3 data-conflict-side="theirs">${theirsTitle}</h3>`,
    versions.theirsHtml,
    `<h3 data-conflict-side="mine">${mineTitle}</h3>`,
    versions.mineHtml,
  ].join('')
}

function hasBlockIds(html: string): boolean {
  return /data-block-id\s*=\s*["'][^"']+["']/i.test(html)
}

function topLevelBlocks(html: string): { id: string; html: string }[] {
  if (typeof document === 'undefined' || !document.createElement) return [{ id: '', html }]
  const root = document.createElement('div')
  root.innerHTML = html
  return [...root.children].map((el) => ({
    id: (el.getAttribute('data-block-id') || '').trim(),
    html: el.outerHTML,
  }))
}

/** 按稳定 data-block-id 合并：相同块只保留一份，内容冲突则先对方后本地并排保留。不是飞书级三方合并。 */
export type BlockMergeSummary = {
  hasBlockIds: boolean
  same: number
  conflict: number
  onlyTheirs: number
  onlyMine: number
}

export function summarizeBlockMerge(versions: SaveConflictVersions): BlockMergeSummary {
  const mineBlocks = topLevelBlocks(versions.mineHtml ?? '')
  const theirsBlocks = topLevelBlocks(versions.theirsHtml ?? '')
  const mineById = new Map<string, string>()
  for (const block of mineBlocks) {
    if (block.id && !mineById.has(block.id)) mineById.set(block.id, block.html)
  }
  const theirsIds = new Set<string>()
  let same = 0
  let conflict = 0
  let onlyTheirs = 0
  for (const block of theirsBlocks) {
    if (!block.id) {
      onlyTheirs += 1
      continue
    }
    if (theirsIds.has(block.id)) continue
    theirsIds.add(block.id)
    const mine = mineById.get(block.id)
    if (!mine) onlyTheirs += 1
    else if (mine === block.html) same += 1
    else conflict += 1
  }
  let onlyMine = 0
  const seenMine = new Set<string>()
  for (const block of mineBlocks) {
    if (!block.id) {
      onlyMine += 1
      continue
    }
    if (seenMine.has(block.id)) continue
    seenMine.add(block.id)
    if (!theirsIds.has(block.id)) onlyMine += 1
  }
  const hasBlockIds = mineById.size > 0 || theirsIds.size > 0
  return { hasBlockIds, same, conflict, onlyTheirs, onlyMine }
}

export function describeBlockMerge(summary: BlockMergeSummary): string {
  if (!summary.hasBlockIds) return '正文缺少稳定块 ID，合并将先保留对方全文再附上你的全文。'
  const parts = [`相同 ${summary.same} 块`, `内容冲突 ${summary.conflict} 块`]
  if (summary.onlyTheirs) parts.push(`仅对方 ${summary.onlyTheirs} 块`)
  if (summary.onlyMine) parts.push(`仅你的 ${summary.onlyMine} 块`)
  return `按块对照：${parts.join('，')}。冲突块会并排保留，不是飞书级三方合并。`
}

export function mergeByBlockId(versions: SaveConflictVersions): string {
  const mineBlocks = topLevelBlocks(versions.mineHtml ?? '')
  const theirsBlocks = topLevelBlocks(versions.theirsHtml ?? '')
  if (!mineBlocks.length && !theirsBlocks.length) return concatConflictHtml(versions)
  const mineById = new Map<string, { id: string; html: string }>()
  for (const block of mineBlocks) {
    if (block.id && !mineById.has(block.id)) mineById.set(block.id, block)
  }
  const used = new Set<string>()
  const out: string[] = [
    `<p data-conflict-merge="true">以下为按块合并的结果：相同块只保留一份；有冲突的块先保留对方的，再附上你的。不是飞书级三方合并。</p>`,
  ]
  for (const block of theirsBlocks) {
    if (block.id && mineById.has(block.id)) {
      used.add(block.id)
      const mine = mineById.get(block.id)!
      if (mine.html === block.html) {
        out.push(block.html)
      } else {
        out.push(`<h3 data-conflict-side="theirs" data-conflict-block="${escapeText(block.id)}">${escapeText(versions.theirsLabel || '对方的版本')}</h3>`)
        out.push(block.html)
        out.push(`<h3 data-conflict-side="mine" data-conflict-block="${escapeText(block.id)}">${escapeText(versions.mineLabel || '你的版本')}</h3>`)
        out.push(mine.html)
      }
      continue
    }
    out.push(block.html)
  }
  for (const block of mineBlocks) {
    if (block.id && used.has(block.id)) continue
    out.push(block.html)
  }
  return out.join('')
}

export function resolveConflictHtml(choice: SaveConflictChoice, versions: SaveConflictVersions): string {
  if (choice === 'mine') return versions.mineHtml
  if (choice === 'theirs') return versions.theirsHtml
  return mergeConflictHtml(versions)
}

export function htmlHasSuggestionMarks(html: string): boolean {
  return html.includes(SUGGESTION_ATTR)
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
