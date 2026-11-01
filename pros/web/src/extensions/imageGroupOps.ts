import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  groupInsertIndex,
  groupUsesAspect,
  imagesFromColumns,
  insertRatio,
  moveItem,
  normalizeGroupRatios,
  ratiosToAttr,
  removeRatio,
  rowCanAccept,
  type MiniNode,
} from '../utils/rteImageGroup'

function groupInfo(doc: PMNode, imagePos: number): { groupPos: number; index: number } | null {
  const node = doc.nodeAt(imagePos)
  if (!node || node.type.name !== 'image') return null
  const $pos = doc.resolve(imagePos)
  if ($pos.parent.type.name !== 'imageGroup') return null
  return { groupPos: $pos.before($pos.depth), index: $pos.index() }
}

function imageForGroup(node: PMNode): PMNode {
  return node.type.create({ ...node.attrs, layout: 'block' }, null, node.marks)
}

function dispatchChecked(view: EditorView, tr: Transaction, selectPos?: number): boolean {
  try {
    tr.doc.check()
  } catch {
    return false
  }
  if (selectPos != null) {
    try {
      tr = tr.setSelection(NodeSelection.create(tr.doc, selectPos)).scrollIntoView()
    } catch {
      tr = tr.scrollIntoView()
    }
  } else {
    tr = tr.scrollIntoView()
  }
  view.dispatch(tr)
  view.focus()
  return true
}

export function setGroupAlign(view: EditorView, groupPos: number, align: 'left' | 'center' | 'right'): boolean {
  if (!view.editable) return false
  const node = view.state.doc.nodeAt(groupPos)
  if (!node || node.type.name !== 'imageGroup') return false
  const tr = view.state.tr.setNodeMarkup(groupPos, undefined, { ...node.attrs, align })
  return dispatchChecked(view, tr, groupPos)
}

export function setGroupRatios(view: EditorView, groupPos: number, ratios: number[]): boolean {
  if (!view.editable) return false
  const node = view.state.doc.nodeAt(groupPos)
  if (!node || node.type.name !== 'imageGroup' || ratios.length !== node.childCount) return false
  const tr = view.state.tr.setNodeMarkup(groupPos, undefined, {
    ...node.attrs,
    ratios: ratiosToAttr(ratios),
    ratioMode: 'custom',
  })
  return dispatchChecked(view, tr)
}

export function splitImageGroup(view: EditorView, groupPos: number): boolean {
  if (!view.editable) return false
  const node = view.state.doc.nodeAt(groupPos)
  if (!node || node.type.name !== 'imageGroup' || node.childCount < 2) return false
  const images: PMNode[] = []
  node.forEach((child) => images.push(child.type.create(child.attrs, child.content, child.marks)))
  const tr = view.state.tr.replaceWith(groupPos, groupPos + node.nodeSize, images)
  return dispatchChecked(view, tr, groupPos)
}

export function reorderInGroup(
  view: EditorView,
  groupPos: number,
  fromIndex: number,
  targetIndex: number,
  side: 'left' | 'right',
): boolean {
  if (!view.editable) return false
  const group = view.state.doc.nodeAt(groupPos)
  if (!group || group.type.name !== 'imageGroup') return false
  const dest = groupInsertIndex(fromIndex, targetIndex, side)
  const images: PMNode[] = []
  group.forEach((child) => images.push(child))
  const ratios = normalizeGroupRatios(images.length, group.attrs.ratios)
  const nextImages = moveItem(images, fromIndex, dest)
  const nextRatios = moveItem(ratios, fromIndex, dest)
  if (!nextImages || !nextRatios) return false
  const next = group.type.create(
    groupUsesAspect(group.attrs.ratioMode)
      ? { ...group.attrs, ratios: null, ratioMode: null }
      : { ...group.attrs, ratios: ratiosToAttr(nextRatios), ratioMode: 'custom' },
    nextImages.map((child) => child.type.create(child.attrs, child.content, child.marks)),
  )
  const tr = view.state.tr.replaceWith(groupPos, groupPos + group.nodeSize, next)
  return dispatchChecked(view, tr, groupPos)
}

function nodeToMini(node: PMNode): MiniNode {
  const content: MiniNode[] = []
  node.forEach((child) => content.push(nodeToMini(child)))
  return {
    type: node.type.name,
    attrs: node.attrs as Record<string, unknown>,
    text: node.isText ? node.text || '' : undefined,
    content,
  }
}

export function buildImageGroupMigration(state: EditorState): Transaction | null {
  const groupType = state.schema.nodes.imageGroup
  if (!groupType) return null
  const hits: Array<{ pos: number; images: PMNode[]; ratios: number[] }> = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'columns') return true
    const planned = imagesFromColumns(nodeToMini(node))
    if (!planned) return false
    const images: PMNode[] = []
    node.forEach((column) => {
      column.forEach((child) => {
        if (child.type.name === 'image') images.push(child)
      })
    })
    if (images.length === planned.images.length) hits.push({ pos, images, ratios: planned.ratios })
    return false
  })
  const singletons: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'imageGroup' && node.childCount <= 1) singletons.push(pos)
    return node.type.name !== 'imageGroup'
  })
  if (!hits.length && !singletons.length) return null
  let tr = state.tr
  const ordered = [
    ...hits.map((hit) => ({ pos: hit.pos, kind: 'columns' as const, hit })),
    ...singletons.map((pos) => ({ pos, kind: 'single' as const, hit: null })),
  ].sort((a, b) => b.pos - a.pos)
  for (const item of ordered) {
    const pos = tr.mapping.map(item.pos, -1)
    const current = tr.doc.nodeAt(pos)
    if (!current) continue
    if (item.kind === 'columns' && item.hit && current.type.name === 'columns') {
      const group = groupType.create(
        { align: 'center', ratios: ratiosToAttr(item.hit.ratios) },
        item.hit.images.map((image) => imageForGroup(image)),
      )
      tr = tr.replaceWith(pos, pos + current.nodeSize, group)
      continue
    }
    if (item.kind === 'single' && current.type.name === 'imageGroup' && current.childCount <= 1) {
      if (current.childCount === 1) tr = tr.replaceWith(pos, pos + current.nodeSize, current.child(0)!)
      else tr = tr.delete(pos, pos + current.nodeSize)
    }
  }
  tr.setMeta('imageGroupMigrate', true)
  try {
    tr.doc.check()
  } catch {
    return null
  }
  return tr
}

export function clearGroupRatios(view: EditorView, groupPos: number): boolean {
  if (!view.editable) return false
  const node = view.state.doc.nodeAt(groupPos)
  if (!node || node.type.name !== 'imageGroup') return false
  const tr = view.state.tr.setNodeMarkup(groupPos, undefined, {
    ...node.attrs,
    ratios: null,
    ratioMode: null,
  })
  return dispatchChecked(view, tr, groupPos)
}

export function placeBeside(view: EditorView, from: number, target: number, side: 'left' | 'right'): boolean {
  if (!view.editable) return false
  const { state } = view
  const moving = state.doc.nodeAt(from)
  const host = state.doc.nodeAt(target)
  if (!moving || !host || moving.type.name !== 'image' || host.type.name !== 'image' || from === target) return false
  const groupType = state.schema.nodes.imageGroup
  if (!groupType) return false
  const src = groupInfo(state.doc, from)
  const dst = groupInfo(state.doc, target)
  if (src && dst && src.groupPos === dst.groupPos) {
    return reorderInGroup(view, src.groupPos, src.index, dst.index, side)
  }
  const destCount = dst ? state.doc.nodeAt(dst.groupPos)?.childCount || 1 : 1
  if (!rowCanAccept(destCount, 1)) return false

  const movingCopy = imageForGroup(moving)
  let tr = state.tr.delete(from, from + moving.nodeSize)
  if (src) {
    const mappedGroup = tr.mapping.map(src.groupPos, -1)
    const group = tr.doc.nodeAt(mappedGroup)
    const original = state.doc.nodeAt(src.groupPos)
    if (group?.type.name === 'imageGroup' && original?.type.name === 'imageGroup') {
      if (group.childCount <= 1) {
        if (group.childCount === 1) tr = tr.replaceWith(mappedGroup, mappedGroup + group.nodeSize, group.child(0)!)
        else tr = tr.delete(mappedGroup, mappedGroup + group.nodeSize)
      } else if (!groupUsesAspect(original.attrs.ratioMode)) {
        const ratios = removeRatio(normalizeGroupRatios(original.childCount, original.attrs.ratios), src.index)
        tr = tr.setNodeMarkup(mappedGroup, undefined, {
          ...group.attrs,
          ratios: ratiosToAttr(ratios),
          ratioMode: 'custom',
        })
      }
    }
  }

  const mappedTarget = tr.mapping.map(target, -1)
  const hostNow = tr.doc.nodeAt(mappedTarget)
  if (!hostNow || hostNow.type.name !== 'image') return false
  const dstNow = groupInfo(tr.doc, mappedTarget)
  let selectAt = mappedTarget
  if (dstNow) {
    const group = tr.doc.nodeAt(dstNow.groupPos)
    if (!group || group.type.name !== 'imageGroup') return false
    const images: PMNode[] = []
    group.forEach((child) => images.push(imageForGroup(child)))
    const index = side === 'left' ? dstNow.index : dstNow.index + 1
    images.splice(index, 0, movingCopy)
    const attrs = groupUsesAspect(group.attrs.ratioMode)
      ? { ...group.attrs, ratios: null, ratioMode: null }
      : {
          ...group.attrs,
          ratios: ratiosToAttr(insertRatio(normalizeGroupRatios(group.childCount, group.attrs.ratios), index)),
          ratioMode: 'custom',
        }
    const next = group.type.create(attrs, images)
    tr = tr.replaceWith(dstNow.groupPos, dstNow.groupPos + group.nodeSize, next)
    selectAt = dstNow.groupPos
  } else {
    const left = side === 'left' ? movingCopy : imageForGroup(hostNow)
    const right = side === 'left' ? imageForGroup(hostNow) : movingCopy
    const group = groupType.create({ align: 'center' }, [left, right])
    tr = tr.replaceWith(mappedTarget, mappedTarget + hostNow.nodeSize, group)
    selectAt = mappedTarget
  }
  return dispatchChecked(view, tr, selectAt)
}

export function extractOrMoveImage(view: EditorView, from: number, insertAt: number): boolean {
  if (!view.editable) return false
  const { state } = view
  const moving = state.doc.nodeAt(from)
  if (!moving || moving.type.name !== 'image') return false
  if (insertAt >= from && insertAt <= from + moving.nodeSize) return false
  const src = groupInfo(state.doc, from)
  if (src) {
    const group = state.doc.nodeAt(src.groupPos)
    if (group && insertAt > src.groupPos && insertAt < src.groupPos + group.nodeSize) {
      return false
    }
  }
  const copy = imageForGroup(moving)
  let tr = state.tr.delete(from, from + moving.nodeSize)
  if (src) {
    const mappedGroup = tr.mapping.map(src.groupPos, -1)
    const group = tr.doc.nodeAt(mappedGroup)
    const original = state.doc.nodeAt(src.groupPos)
    if (group?.type.name === 'imageGroup' && original?.type.name === 'imageGroup') {
      if (group.childCount <= 1) {
        if (group.childCount === 1) tr = tr.replaceWith(mappedGroup, mappedGroup + group.nodeSize, group.child(0)!)
        else tr = tr.delete(mappedGroup, mappedGroup + group.nodeSize)
      } else if (!groupUsesAspect(original.attrs.ratioMode)) {
        const ratios = removeRatio(normalizeGroupRatios(original.childCount, original.attrs.ratios), src.index)
        tr = tr.setNodeMarkup(mappedGroup, undefined, {
          ...group.attrs,
          ratios: ratiosToAttr(ratios),
          ratioMode: 'custom',
        })
      }
    }
  }
  let dest = tr.mapping.map(insertAt, -1)
  if (dest < 0) dest = 0
  if (dest > tr.doc.content.size) dest = tr.doc.content.size
  tr = tr.insert(dest, copy)
  return dispatchChecked(view, tr, dest)
}

export function moveImageGroup(view: EditorView, from: number, insertAt: number): boolean {
  if (!view.editable) return false
  const node = view.state.doc.nodeAt(from)
  if (!node || node.type.name !== 'imageGroup') return false
  if (insertAt >= from && insertAt <= from + node.nodeSize) return false
  let tr = view.state.tr.delete(from, from + node.nodeSize)
  let dest = tr.mapping.map(insertAt, -1)
  if (dest < 0) dest = 0
  if (dest > tr.doc.content.size) dest = tr.doc.content.size
  const copy = node.copy(node.content)
  tr = tr.insert(dest, copy)
  return dispatchChecked(view, tr, dest)
}

export function insertImagesBeside(
  view: EditorView,
  target: number,
  side: 'left' | 'right',
  images: PMNode[],
): boolean {
  if (!view.editable || !images.length) return false
  const host = view.state.doc.nodeAt(target)
  if (!host || host.type.name !== 'image') return false
  const groupType = view.state.schema.nodes.imageGroup
  if (!groupType) return false
  const prepared = images.map((image) => imageForGroup(image)).filter((image) => image.type.name === 'image')
  if (!prepared.length) return false
  const dst = groupInfo(view.state.doc, target)
  const destCount = dst ? view.state.doc.nodeAt(dst.groupPos)?.childCount || 1 : 1
  if (!rowCanAccept(destCount, prepared.length)) return false
  if (dst) {
    const group = view.state.doc.nodeAt(dst.groupPos)
    if (!group || group.type.name !== 'imageGroup') return false
    const kids: PMNode[] = []
    group.forEach((child) => kids.push(imageForGroup(child)))
    const index = side === 'left' ? dst.index : dst.index + 1
    kids.splice(index, 0, ...prepared)
    const next = group.type.create(
      groupUsesAspect(group.attrs.ratioMode)
        ? { ...group.attrs, ratios: null, ratioMode: null }
        : { ...group.attrs, ratioMode: 'custom' },
      kids,
    )
    return dispatchChecked(view, view.state.tr.replaceWith(dst.groupPos, dst.groupPos + group.nodeSize, next), dst.groupPos)
  }
  const hostCopy = imageForGroup(host)
  const content = side === 'left' ? [...prepared, hostCopy] : [hostCopy, ...prepared]
  const group = groupType.create({ align: 'center' }, content)
  return dispatchChecked(view, view.state.tr.replaceWith(target, target + host.nodeSize, group), target)
}
