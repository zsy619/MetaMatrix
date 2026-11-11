import { TableView } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** 可缩放表格的节点视图只同步列宽，不会把 zebra 写到真实 table 上。 */
function syncTableZebra(table: HTMLTableElement, node: ProseMirrorNode) {
  if (node.attrs.zebra) table.setAttribute('data-zebra', '1')
  else table.removeAttribute('data-zebra')
}

export class RteTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    super(node, cellMinWidth, view, HTMLAttributes)
    syncTableZebra(this.table, node)
  }

  update(node: ProseMirrorNode) {
    const ok = super.update(node)
    if (ok) syncTableZebra(this.table, node)
    return ok
  }
}
