import { Node, mergeAttributes } from '@tiptap/core'

/**
 * 正文内嵌多维表格块（路线图 B3 最小骨架）。
 *
 * 本身是带 A1 `data-block-id` 的身份块，可引用知识库树上既有的 `kind=sheet`
 * 节点（data-sheet-node-id）。不取代、不删除树上的独立表格。
 * 本轮不做筛选、视图切换、块内协同编辑。
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      insertDatabaseBlock: (attrs?: {
        sheetNodeId?: string
        title?: string
      }) => ReturnType
    }
  }
}

export const DATABASE_BLOCK_NAME = 'databaseBlock'
export const DATABASE_BLOCK_HTML_TYPE = 'database-block'

export type DatabaseBlockOpenTarget = {
  sheetNodeId: string
  title: string
}

export function readDatabaseBlockOpenTarget(
  el: Element | null | undefined,
): DatabaseBlockOpenTarget | null {
  const host = el?.closest?.(`[data-type="${DATABASE_BLOCK_HTML_TYPE}"], [data-type="${DATABASE_BLOCK_NAME}"]`)
  if (!host) return null
  const sheetNodeId = (host.getAttribute('data-sheet-node-id') || '').trim()
  if (!sheetNodeId) return null
  const title =
    (host.getAttribute('data-title') || '').trim() ||
    host.querySelector('.rte-database-block__title')?.textContent?.trim() ||
    '多维表格'
  return { sheetNodeId, title }
}

export const DatabaseBlock = Node.create({
  name: DATABASE_BLOCK_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sheetNodeId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sheet-node-id') || '',
        renderHTML: (attrs: { sheetNodeId?: string }) =>
          attrs.sheetNodeId ? { 'data-sheet-node-id': attrs.sheetNodeId } : {},
      },
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
        renderHTML: (attrs: { title?: string }) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
    }
  },

  parseHTML() {
    return [
      { tag: `div[data-type="${DATABASE_BLOCK_HTML_TYPE}"]` },
      { tag: `div[data-type="${DATABASE_BLOCK_NAME}"]` },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const linked = Boolean(String(node.attrs.sheetNodeId || '').trim())
    const title = String(node.attrs.title || '').trim() || (linked ? '多维表格' : '未关联表格')
    const hint = linked ? '打开知识库表格' : '嵌入位：可关联知识库中的独立表格'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': DATABASE_BLOCK_HTML_TYPE,
        class: linked ? 'rte-database-block is-linked' : 'rte-database-block is-empty',
        contenteditable: 'false',
        role: 'button',
        'data-open-sheet': linked ? 'true' : 'false',
      }),
      ['span', { class: 'rte-database-block__icon' }, '▦'],
      ['span', { class: 'rte-database-block__title' }, title],
      ['span', { class: 'rte-database-block__hint' }, hint],
    ]
  },

  addCommands() {
    return {
      insertDatabaseBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: DATABASE_BLOCK_NAME,
            attrs: {
              sheetNodeId: attrs?.sheetNodeId || '',
              title: attrs?.title || '',
            },
          }),
    }
  },
})
