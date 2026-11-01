export type HighlightPart = { text: string; hit: boolean }

/** Split a snippet that uses «» markers from the search API. */
export function highlightParts(snippet: string): HighlightPart[] {
  if (!snippet) return []
  const parts: HighlightPart[] = []
  const re = /«([^»]*)»/g
  let cursor = 0
  for (const match of snippet.matchAll(re)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ text: snippet.slice(cursor, index), hit: false })
    parts.push({ text: match[1] ?? '', hit: true })
    cursor = index + match[0].length
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), hit: false })
  return parts.length ? parts : [{ text: snippet, hit: false }]
}

/** Scroll the first visible match inside a canvas root. */
export function focusSearchMatch(root: ParentNode | null, query: string, panelId: string) {
  if (!root) return false
  if (panelId) {
    const byId = root.querySelector(`[id="${cssEscape(panelId)}"]`)
    if (byId instanceof HTMLElement) {
      mark(byId)
      return true
    }
  }
  const needle = query.trim().toLowerCase()
  if (!needle) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent || ''
    if (text.toLowerCase().includes(needle) && node.parentElement) {
      mark(node.parentElement)
      return true
    }
    node = walker.nextNode()
  }
  return false
}

function mark(el: HTMLElement) {
  el.classList.add('mm-search-hit')
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  window.setTimeout(() => el.classList.remove('mm-search-hit'), 2400)
}

function cssEscape(value: string) {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/"/g, '')
}
