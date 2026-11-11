import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

function childByTag(parent: Element, tag: string, predicate?: (el: Element) => boolean): HTMLElement | null {
  for (const child of parent.children) {
    if (child.tagName !== tag) continue
    if (predicate && !predicate(child)) continue
    return child as HTMLElement
  }
  return null
}

/** 把第一行表头复制进 thead。屏幕上藏起来，打印时浏览器会在每页重复。 */
export function syncPrintTableHeads(root: ParentNode) {
  root.querySelectorAll('table').forEach((table) => {
    const tbody = childByTag(table, 'TBODY')
    const existing = childByTag(table, 'THEAD', (el) => el.classList.contains('rte-print-head'))
    const realHead = childByTag(table, 'THEAD', (el) => !el.classList.contains('rte-print-head'))
    const row = tbody ? childByTag(tbody, 'TR') : null
    const cells = row ? Array.from(row.children) : []
    const header = !realHead && cells.length > 0 && cells.every((cell) => cell.tagName === 'TH')
    if (!header || !row || !tbody) {
      existing?.remove()
      return
    }
    const thead = existing ?? document.createElement('thead')
    thead.className = 'rte-print-head'
    thead.setAttribute('aria-hidden', 'true')
    const clone = row.cloneNode(true) as HTMLElement
    clone.setAttribute('contenteditable', 'false')
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'false'))
    thead.replaceChildren(clone)
    if (!existing) table.insertBefore(thead, tbody)
  })
}

export function createPrintTableHeadPlugin(): Plugin {
  return new Plugin({
    view(editorView: EditorView) {
      const paint = () => {
        if (!editorView.isDestroyed) syncPrintTableHeads(editorView.dom)
      }
      queueMicrotask(paint)
      return { update: paint }
    },
  })
}
