/** 表格公式栏定位：找 table 元素 + 计算视口位置（纯函数，便于单测）。 */
import type { Editor } from '@tiptap/core'

/** 与表格、工具栏之间留的空隙（px）。 */
export const BAR_GAP = 6
export const BAR_FALLBACK_HEIGHT = 36

/**
 * 找到表格的 <table> 元素。
 *
 * tablePos 是表格节点「之前」的位置：domAtPos(tablePos) 落在父容器上（.ProseMirror），
 * closest('table') 找不到，过去 barStyle 因此一直为空、栏停在画布左上角。
 * 这里用 nodeDOM 拿到节点自身的 DOM（tiptap 下是 .tableWrapper），再找里面的 table。
 */
export function resolveTableElement(ed: Editor, tablePos: number): HTMLElement | null {
  const dom = ed.view.nodeDOM(tablePos)
  if (dom instanceof HTMLElement) {
    if (dom.tagName === 'TABLE') return dom
    const inner = dom.querySelector('table')
    if (inner) return inner as HTMLElement
    const outer = dom.closest('table')
    if (outer) return outer as HTMLElement
  }
  const { node } = ed.view.domAtPos(tablePos + 1)
  const el = node instanceof HTMLElement ? node : node?.parentElement
  return (el?.closest?.('table') as HTMLElement | null) ?? null
}

export type Box = { top: number; bottom: number; left: number; right: number }

/**
 * 计算公式栏在视口里的位置：优先贴在表格上方，上方空间被吸顶工具栏挡住时放到下方；
 * 左边与表格对齐，并夹在视口内。返回视口坐标。
 */
export function placeFormulaBar(
  table: Box,
  bar: { width: number; height: number },
  viewport: { width: number; height: number },
  safeTop: number,
): { top: number; left: number } {
  const above = table.top - BAR_GAP - bar.height
  let top: number
  if (above >= safeTop + BAR_GAP) top = above
  else {
    const below = table.bottom + BAR_GAP
    top = below + bar.height <= viewport.height ? below : safeTop + BAR_GAP
  }
  const maxLeft = Math.max(BAR_GAP, viewport.width - bar.width - BAR_GAP)
  const left = Math.min(Math.max(table.left, BAR_GAP), maxLeft)
  return { top, left }
}

