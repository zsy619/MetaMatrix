import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { canEditBlockContent } from '../components/knowledge/blockPermission'
import { readBlockId } from './blockIdentity'

export const BLOCK_PERMISSION_GUARD = 'blockPermissionGuard'

export type BlockPermissionGuardStorage = {
  role: string
  canWrite: boolean
  permissions: Record<string, string>
}

export function defaultBlockPermissionStorage(): BlockPermissionGuardStorage {
  return { role: 'owner', canWrite: true, permissions: {} }
}

export function canEditStoredBlock(storage: BlockPermissionGuardStorage | undefined, blockId: string): boolean {
  if (!blockId) return Boolean(storage?.canWrite ?? true)
  const state = storage ?? defaultBlockPermissionStorage()
  return canEditBlockContent(state.permissions[blockId] || '', state.role, state.canWrite)
}

export function guardStorageFrom(editor: { storage?: unknown } | null | undefined): BlockPermissionGuardStorage {
  const bag = editor?.storage as Record<string, BlockPermissionGuardStorage> | undefined
  return bag?.[BLOCK_PERMISSION_GUARD] ?? defaultBlockPermissionStorage()
}

export function setBlockPermissionGuardState(
  editor: { storage?: unknown; view?: { dispatch: (tr: any) => void }; state?: { tr: any } } | null | undefined,
  next: Partial<BlockPermissionGuardStorage>,
) {
  if (!editor?.storage) return
  const bag = editor.storage as Record<string, BlockPermissionGuardStorage>
  const current = bag[BLOCK_PERMISSION_GUARD] ?? defaultBlockPermissionStorage()
  if (!bag[BLOCK_PERMISSION_GUARD]) bag[BLOCK_PERMISSION_GUARD] = current
  current.role = next.role ?? current.role
  current.canWrite = next.canWrite ?? current.canWrite
  if (next.permissions) current.permissions = next.permissions
  if (editor.view && editor.state) {
    editor.view.dispatch(editor.state.tr.setMeta('blockPermissionRefresh', true))
  }
}

export function blockIdCovering(doc: PMNode, pos: number): string {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const id = readBlockId($pos.node(depth))
    if (id) return id
  }
  const node = doc.nodeAt($pos.pos) ?? ($pos.pos > 0 ? doc.nodeAt($pos.pos - 1) : null)
  return node ? readBlockId(node) || '' : ''
}

export function canEditRange(editor: { storage?: unknown; state: { doc: PMNode } }, from: number, to: number): boolean {
  const storage = guardStorageFrom(editor)
  const doc = editor.state.doc
  const lo = Math.max(0, Math.min(from, to, doc.content.size))
  const hi = Math.max(0, Math.min(Math.max(from, to), doc.content.size))
  const ids = new Set<string>()
  const start = blockIdCovering(doc, lo)
  if (start) ids.add(start)
  if (hi > lo) {
    doc.nodesBetween(lo, hi, (node) => {
      const id = readBlockId(node)
      if (id) ids.add(id)
      return true
    })
  }
  const end = blockIdCovering(doc, Math.max(lo, hi - 1))
  if (end) ids.add(end)
  for (const id of ids) {
    if (!canEditStoredBlock(storage, id)) return false
  }
  return true
}

export function lockedBlockFingerprints(doc: PMNode, storage: BlockPermissionGuardStorage): Map<string, string> {
  const out = new Map<string, string>()
  doc.descendants((node) => {
    const id = readBlockId(node)
    if (id && !canEditStoredBlock(storage, id)) out.set(id, fingerprint(node))
    return true
  })
  return out
}

export function transactionTouchesLockedBlocks(tr: Transaction, oldDoc: PMNode, storage: BlockPermissionGuardStorage): boolean {
  if (!tr.docChanged) return false
  const before = lockedBlockFingerprints(oldDoc, storage)
  if (!before.size) return false
  const after = new Map<string, string>()
  tr.doc.descendants((node) => {
    const id = readBlockId(node)
    if (id && before.has(id)) after.set(id, fingerprint(node))
    return true
  })
  for (const [id, snap] of before) {
    const next = after.get(id)
    if (next == null || next !== snap) return true
  }
  return false
}

function fingerprint(node: PMNode): string {
  return JSON.stringify({
    type: node.type.name,
    attrs: node.attrs,
    content: node.content.toJSON(),
  })
}

const pluginKey = new PluginKey(BLOCK_PERMISSION_GUARD)

export const BlockPermissionGuard = Extension.create({
  name: BLOCK_PERMISSION_GUARD,

  addStorage() {
    return defaultBlockPermissionStorage()
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: pluginKey,
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true
          if (isChangeOrigin(tr)) return true
          return !transactionTouchesLockedBlocks(tr, state.doc, extension.storage)
        },
        props: {
          decorations: (state) => {
            const storage = extension.storage
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              const id = readBlockId(node)
              if (!id || canEditStoredBlock(storage, id)) return true
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'is-block-readonly',
                  'data-block-readonly': 'true',
                }),
              )
              return true
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
