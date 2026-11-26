import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'

/**
 * 最小块身份（路线图 A1）。
 *
 * 在顶层块以及 D3 约定的一级嵌套块上维护稳定 `data-block-id`。
 * 不改 heading 的 `attrs.id`、图表的 `xrefId`、syncBlock 的 `blockId`
 * （后者仍表示跨文档来源，HTML 为 `data-sync-block`）。
 *
 * 继承规则：
 * - 插入：缺失 ID 的身份块补 `crypto.randomUUID()`。
 * - 复制 / 粘贴：必须重新生成（两块不得共享 ID）。
 * - 拖拽 / 移动：保留原 ID。
 * - 拆分：原块保留 ID，新块补新 ID。
 * - 合并：存活块保留自身 ID，被吸收块的 ID 随节点消失。
 * - 文档内冲突：保留映射到旧文档的那一块（否则保留文中先出现的），其余重生成。
 * - 老文档懒回填：打开时只补缺失 ID，事务带 preventUpdate，不单独触发保存。
 */

export const BLOCK_IDENTITY_ATTR = 'dataBlockId'
export const BLOCK_IDENTITY_HTML_ATTR = 'data-block-id'
export const BLOCK_IDENTITY_META = 'blockIdentity'
export const blockIdentityPluginKey = new PluginKey('blockIdentity')

/** 需要挂载 dataBlockId 属性的块类型。不包含 column / tabPane 等结构壳，也不占用 syncBlock.blockId。 */
export const IDENTITY_ATTR_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'taskList',
  'table',
  'horizontalRule',
  'image',
  'pageBreak',
  'columns',
  'imageGroup',
  'callout',
  'toggleBlock',
  'audio',
  'linkCard',
  'mermaidBlock',
  'echartsBlock',
  'canvasEmbed',
  'tianziGrid',
  'linkButton',
  'syncBlock',
  'tocBlock',
  'progressBar',
  'timeline',
  'tabsBlock',
  'mathDisplay',
  'docTitle',
  'formTextInput',
  'formRadioGroup',
  'formCheckboxGroup',
  'formSelect',
  'formTextarea',
  'formNumberInput',
  'formDateInput',
  'formSwitch',
  'formShowIf',
] as const

/** 这些容器的直接子块也是身份块（D3：顶层 + 一级嵌套）。 */
export const IDENTITY_NEST_PARENTS = new Set([
  'callout',
  'toggleBlock',
  'column',
  'tabPane',
  'timelineItem',
])

const IDENTITY_ATTR_TYPE_SET = new Set<string>(IDENTITY_ATTR_TYPES)

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockIdentity: {
      /** 给缺失 / 冲突的身份块补 ID。仅补 ID 时带 preventUpdate，不触发 update。 */
      ensureBlockIdentities: () => ReturnType
    }
  }
}

export function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function readBlockId(node: PmNode): string | null {
  const raw = node.attrs?.[BLOCK_IDENTITY_ATTR]
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return id || null
}

export function hasIdentityAttr(node: PmNode): boolean {
  return Object.prototype.hasOwnProperty.call(node.attrs ?? {}, BLOCK_IDENTITY_ATTR)
}

export function isIdentityBlock(node: PmNode, parentTypeName: string): boolean {
  if (!node.isBlock || !hasIdentityAttr(node)) return false
  if (!IDENTITY_ATTR_TYPE_SET.has(node.type.name)) return false
  if (parentTypeName === 'doc') return true
  return IDENTITY_NEST_PARENTS.has(parentTypeName)
}

export type IdentityNodeRef = { node: PmNode; pos: number }

export function collectIdentityNodes(doc: PmNode): IdentityNodeRef[] {
  const out: IdentityNodeRef[] = []
  doc.descendants((node, pos) => {
    const parentName = doc.resolve(pos).parent.type.name
    if (isIdentityBlock(node, parentName)) out.push({ node, pos })
  })
  return out
}

/**
 * 在事务文档上补缺失 ID，并解开冲突。
 * 冲突时优先保留「从旧文档映射过来」的那一块；没有映射则保留文中先出现的。
 * 成功改动时返回 true（已原地写入 tr）。
 */
export function applyBlockIdentities(tr: Transaction, oldDoc?: PmNode | null): boolean {
  const keepers = new Map<string, number>()
  if (oldDoc) {
    for (const { node, pos } of collectIdentityNodes(oldDoc)) {
      const id = readBlockId(node)
      if (!id) continue
      const mapped = tr.mapping.map(pos)
      const at = tr.doc.nodeAt(mapped)
      if (at && readBlockId(at) === id) keepers.set(id, mapped)
    }
  }

  const seen = new Map<string, number>()
  const changes: Array<{ pos: number; id: string }> = []

  for (const { node, pos } of collectIdentityNodes(tr.doc)) {
    const id = readBlockId(node)
    if (!id) {
      changes.push({ pos, id: newBlockId() })
      continue
    }
    const first = seen.get(id)
    if (first == null) {
      seen.set(id, pos)
      continue
    }
    const keeper = keepers.get(id)
    if (keeper === pos) {
      changes.push({ pos: first, id: newBlockId() })
      seen.set(id, pos)
    } else {
      changes.push({ pos, id: newBlockId() })
    }
  }

  if (!changes.length) return false
  changes.sort((a, b) => b.pos - a.pos)
  for (const change of changes) {
    const node = tr.doc.nodeAt(change.pos)
    if (!node || !hasIdentityAttr(node)) continue
    if (readBlockId(node) === change.id) continue
    tr.setNodeMarkup(change.pos, undefined, {
      ...node.attrs,
      [BLOCK_IDENTITY_ATTR]: change.id,
    })
  }
  return tr.docChanged
}

function regenerateNodeIdentities(node: PmNode, parentTypeName: string): PmNode {
  const nextContent = regenerateFragmentIdentities(node.content, node.type.name)
  let attrs = node.attrs
  if (isIdentityBlock(node, parentTypeName)) {
    attrs = { ...node.attrs, [BLOCK_IDENTITY_ATTR]: newBlockId() }
  }
  if (attrs === node.attrs && nextContent === node.content) return node
  return node.type.create(attrs, nextContent, node.marks)
}

function regenerateFragmentIdentities(fragment: Fragment, parentTypeName: string): Fragment {
  const nodes: PmNode[] = []
  let changed = false
  fragment.forEach((child) => {
    const next = regenerateNodeIdentities(child, parentTypeName)
    if (next !== child) changed = true
    nodes.push(next)
  })
  return changed ? Fragment.from(nodes) : fragment
}

/** 粘贴切片内的身份块一律换新 ID（复制不得沿用）。 */
export function regenerateIdentitiesInSlice(slice: Slice): Slice {
  const next = regenerateFragmentIdentities(slice.content, 'doc')
  if (next === slice.content) return slice
  return new Slice(next, slice.openStart, slice.openEnd)
}

function markIdentityTransaction(tr: Transaction, reason: 'backfill' | 'append'): Transaction {
  tr.setMeta(BLOCK_IDENTITY_META, reason)
  tr.setMeta('addToHistory', false)
  if (reason === 'backfill') tr.setMeta('preventUpdate', true)
  return tr
}

export const BlockIdentity = Extension.create({
  name: 'blockIdentity',

  addGlobalAttributes() {
    return [
      {
        types: [...IDENTITY_ATTR_TYPES],
        attributes: {
          [BLOCK_IDENTITY_ATTR]: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute(BLOCK_IDENTITY_HTML_ATTR) || null,
            renderHTML: (attrs: { dataBlockId?: string | null }) => {
              const id = typeof attrs.dataBlockId === 'string' ? attrs.dataBlockId.trim() : ''
              return id ? { [BLOCK_IDENTITY_HTML_ATTR]: id } : {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      ensureBlockIdentities:
        () =>
        ({ state, dispatch }) => {
          const tr = state.tr
          if (!applyBlockIdentities(tr, null)) return false
          markIdentityTransaction(tr, 'backfill')
          dispatch?.(tr)
          return true
        },
    }
  },

  onCreate() {
    this.editor.commands.ensureBlockIdentities()
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdentityPluginKey,
        view(editorView) {
          // onCreate 时 view 可能还不能 dispatch；在这里对打开的老文档做懒回填。
          const tr = editorView.state.tr
          if (applyBlockIdentities(tr, null)) {
            editorView.dispatch(markIdentityTransaction(tr, 'backfill'))
          }
          return {}
        },
        props: {
          transformPasted(slice: Slice) {
            return regenerateIdentitiesInSlice(slice)
          },
        },
        appendTransaction(transactions, oldState, state) {
          if (transactions.some((tr) => tr.getMeta(BLOCK_IDENTITY_META))) return null
          if (!transactions.some((tr) => tr.docChanged)) return null
          const tr = state.tr
          if (!applyBlockIdentities(tr, oldState.doc)) return null
          return markIdentityTransaction(tr, 'append')
        },
      }),
    ]
  },
})

export default BlockIdentity
