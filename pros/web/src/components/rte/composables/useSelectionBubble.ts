import type { ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'

/**
 * 选区浮动工具条（选区气泡）的出现条件与选区判定。
 *
 * 规则（与飞书 / Word 一致）：
 * - 只有非空选区才出现（空选区不打扰）；
 * - 代码块、图表块（ECharts / Mermaid）内部不出现（那里是代码 / 画布自己的交互）；
 * - 图片节点选中时走图片气泡，不出现文字气泡。
 */

/** 选区里出现这些块时，文字工具条不出现。 */
export const BLOCKED_SELECTION_NODE_TYPES = ['codeBlock', 'echartsBlock', 'mermaidBlock']

export function useSelectionBubble(deps: {
  editor: ShallowRef<Editor | undefined>
  viewMode: () => { value: string }
  isImageNodeSelected: () => boolean
}) {
  /**
   * 选区是否碰到「不显示工具条」的块。
   * 既看选区端点的祖先链（选区首尾所在块），也看选区覆盖到的块
   * （跨块选区把代码块或图表块圈进来时同样不显示）。
   */
  function selectionTouchesBlockedNode(ed: Editor, from?: number, to?: number): boolean {
    const sel = ed.state.selection
    const rawFrom = from ?? sel.from
    const rawTo = to ?? sel.to
    const start = Math.min(rawFrom, rawTo)
    const end = Math.max(rawFrom, rawTo)
    for (const pos of [start, end]) {
      const $pos = ed.state.doc.resolve(Math.min(pos, ed.state.doc.content.size))
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if (BLOCKED_SELECTION_NODE_TYPES.includes($pos.node(depth).type.name)) return true
      }
    }
    let blocked = false
    ed.state.doc.nodesBetween(start, end, (node) => {
      if (BLOCKED_SELECTION_NODE_TYPES.includes(node.type.name)) {
        blocked = true
        return false
      }
      return true
    })
    return blocked
  }

  /** 选区覆盖了几个顶层段落（跨段选区判定，单测与提示都用它）。 */
  function selectionBlockCount(ed: Editor): number {
    const sel = ed.state.selection
    if (sel.from === sel.to) return 0
    const types = new Set<string>()
    ed.state.doc.nodesBetween(sel.from, sel.to, (node, _pos, parent) => {
      if (parent && parent.type.name === 'doc') types.add(node.type.name)
      return true
    })
    return types.size
  }

  /** 气泡工具条的显示条件。 */
  function selectionBubbleShouldShow(payload: {
    editor?: unknown
    from: number
    to: number
  }): boolean {
    if (deps.viewMode().value !== 'edit') return false
    const ed = deps.editor.value
    if (!ed || ed.isDestroyed || ed.isEditable === false) return false
    // 空选区不出现
    if (!payload || payload.from === payload.to) return false
    // 图片节点选中时走图片气泡
    if (deps.isImageNodeSelected()) return false
    // 代码块 / 图表块内不出现
    if (selectionTouchesBlockedNode(ed, payload.from, payload.to)) return false
    return true
  }

  return {
    selectionBubbleShouldShow,
    selectionTouchesBlockedNode,
    selectionBlockCount,
  }
}
