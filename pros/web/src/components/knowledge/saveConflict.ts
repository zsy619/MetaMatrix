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
  const theirsTitle = escapeText(versions.theirsLabel || '对方的版本')
  const mineTitle = escapeText(versions.mineLabel || '你的版本')
  return [
    `<p data-conflict-merge="true">以下为合并结果：先保留对方版本，再附上你的版本。</p>`,
    `<h3 data-conflict-side="theirs">${theirsTitle}</h3>`,
    theirs,
    `<h3 data-conflict-side="mine">${mineTitle}</h3>`,
    mine,
  ].join('')
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
