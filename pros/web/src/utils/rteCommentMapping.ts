import type { EditorState } from '@tiptap/pm/state'
import type { Mapping } from '@tiptap/pm/transform'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import * as Y from 'yjs'

export type MappedCommentRange = {
  from: number
  to: number
  /** 原区间在这次 mapping 里被删掉，或相对位置已失效。 */
  lost: boolean
}

/** 用 ProseMirror Mapping 平移评论区间。删掉的选区标 lost，不瞎猜新位置。 */
export function mapCommentRange(mapping: Mapping, from: number, to: number): MappedCommentRange {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  const mappedFrom = mapping.mapResult(start, 1)
  const mappedTo = mapping.mapResult(end, -1)
  if (mappedFrom.deleted && mappedTo.deleted) {
    return { from: mappedFrom.pos, to: mappedTo.pos, lost: true }
  }
  const nextFrom = mappedFrom.pos
  const nextTo = Math.max(mappedTo.pos, nextFrom)
  return { from: nextFrom, to: nextTo, lost: nextTo <= nextFrom }
}

export type CommentRelPayload = {
  from: unknown
  to: unknown
}

function syncBinding(state: EditorState) {
  return ySyncPluginKey.getState(state) ?? null
}

/**
 * 把当前编辑器里的评论区间编码成可落库的 Yjs 相对位置。
 * 没有 Collaboration 同步插件时返回 null，调用方应退回 quote / 偏移量锚点。
 */
export function encodeCommentRel(state: EditorState, from: number, to: number): string | null {
  const ystate = syncBinding(state)
  if (!ystate?.type || !ystate.binding?.mapping) return null
  const fromRel = absolutePositionToRelativePosition(from, ystate.type, ystate.binding.mapping)
  const toRel = absolutePositionToRelativePosition(to, ystate.type, ystate.binding.mapping)
  const payload: CommentRelPayload = {
    from: Y.relativePositionToJSON(fromRel),
    to: Y.relativePositionToJSON(toRel),
  }
  return JSON.stringify(payload)
}

/** 用相对位置找回评论区间。文档结构被删光或载荷无效时返回 lost / null。 */
export function decodeCommentRel(state: EditorState, raw: string): MappedCommentRange | null {
  let payload: CommentRelPayload
  try {
    payload = JSON.parse(raw) as CommentRelPayload
  } catch {
    return null
  }
  const ystate = syncBinding(state)
  if (!ystate?.doc || !ystate.type || !ystate.binding?.mapping) return null
  try {
    const fromRel = Y.createRelativePositionFromJSON(payload.from)
    const toRel = Y.createRelativePositionFromJSON(payload.to)
    const fromAbs = relativePositionToAbsolutePosition(
      ystate.doc,
      ystate.type,
      fromRel,
      ystate.binding.mapping,
    )
    const toAbs = relativePositionToAbsolutePosition(
      ystate.doc,
      ystate.type,
      toRel,
      ystate.binding.mapping,
    )
    if (fromAbs == null || toAbs == null) return { from: 0, to: 0, lost: true }
    const from = fromAbs
    const to = toAbs
    if (to <= from) return { from, to, lost: true }
    return { from, to, lost: false }
  } catch {
    return null
  }
}
