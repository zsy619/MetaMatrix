/**
 * 图表删除的「回声守护」。
 *
 * 背景：富文本编辑器的宿主（画布面板）会把内容以 HTML 的形式回写。
 * 属性面板删掉图表块后，宿主若把**旧 HTML**整篇写回
 * （`setContent(..., { emitUpdate: false })`），
 * 刚删掉的图表块会连同旧内容一起复活 —— 表现就是「删除按钮点了没反应」。
 *
 * 这里记录「刚被删掉的图表块 id」，在宿主整篇回写（事务里出现覆盖全文的
 * 替换步骤）时再删一次；普通编辑 / 撤销都不会触发，避免误删。
 */
import type { Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'

/** 守护窗口：删除后这段时间内的整篇回写才算「回声」。 */
const GUARD_WINDOW_MS = 8000

export type ChartDeleteGuardOptions = {
  /** 编辑器实例（跟随时序变化）。 */
  editorRef: Ref<Editor | undefined>
  /** 按 chartId 在文档里找图表块位置。 */
  findPos: (editor: Editor, chartId: string) => number | null
}

/** 事务里是否有「覆盖整篇文档」的替换步骤（宿主整篇回写的特征）。 */
export function isWholeDocReplace(tr: Transaction): boolean {
  const size = tr.before.content.size
  if (size <= 0) return false
  return tr.steps.some((step) => {
    const s = step as unknown as { from?: number; to?: number }
    return s.from === 0 && s.to === size
  })
}

export function createChartDeleteGuard(options: ChartDeleteGuardOptions) {
  /** chartId → 删除时间戳。 */
  const deleted = new Map<string, number>()

  /** 记一笔：这个图表块刚被删掉。 */
  function markDeleted(chartId: string) {
    if (!chartId) return
    deleted.set(chartId, Date.now())
  }

  /** 事务回调：整篇回写把图表块带回来了 → 再删一次。 */
  function handleTransaction(payload: { transaction: Transaction }) {
    if (deleted.size === 0) return
    const tr = payload?.transaction
    if (!tr) return
    if (!isWholeDocReplace(tr)) return
    const now = Date.now()
    for (const [id, ts] of Array.from(deleted.entries())) {
      if (now - ts > GUARD_WINDOW_MS) deleted.delete(id)
    }
    if (deleted.size === 0) return
    const ids = Array.from(deleted.keys())
    // 延后一拍再删：不在事务回调里嵌套 dispatch。
    setTimeout(() => {
      const ed = options.editorRef.value
      if (!ed) return
      for (const id of ids) {
        const pos = options.findPos(ed, id)
        if (pos === null) continue
        const node = ed.state.doc.nodeAt(pos)
        if (!node) continue
        ed.view.dispatch(ed.state.tr.delete(pos, pos + node.nodeSize))
      }
    }, 0)
  }

  return { markDeleted, handleTransaction }
}
