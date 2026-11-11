import { TableView } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** 可缩放表格的节点视图只同步列宽，不会把斑马纹和阅读配色写到真实 table 上。 */
function syncTableChrome(table: HTMLTableElement, node: ProseMirrorNode) {
  if (node.attrs.zebra) table.setAttribute('data-zebra', '1')
  else table.removeAttribute('data-zebra')
  const tone = String(node.attrs.readTone || '')
  if (tone) table.setAttribute('data-read', tone)
  else table.removeAttribute('data-read')
}

export class RteTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes)
    syncTableChrome(this.table, node)
  }

  update(node: ProseMirrorNode) {
    const ok = super.update(node)
    if (ok) syncTableChrome(this.table, node)
    return ok
  }
}
