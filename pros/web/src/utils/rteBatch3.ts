/** 第三批可单测的块排序、目录光标和快捷键清单。 */

export function reorderIndexes(count: number, from: number, to: number): number[] | null {
  if (!Number.isInteger(count) || count <= 1) return null
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null
  if (from < 0 || from >= count || to < 0 || to > count) return null
  if (from === to || from + 1 === to) return null
  const next = Array.from({ length: count }, (_, index) => index)
  const [moved] = next.splice(from, 1)
  const dest = to > from ? to - 1 : to
  next.splice(dest, 0, moved!)
  return next
}

/** 光标之前最近的标题；没有则 -1。positions 需按文档顺序。 */
export function activeOutlineIndex(positions: number[], cursor: number): number {
  let active = -1
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i]! <= cursor) active = i
    else break
  }
  return active
}

export const FEISHU_BATCH3_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: 'Ctrl/⌘ + Alt + O', desc: '打开或关闭目录' },
  { keys: 'Ctrl/⌘ + Alt + M', desc: '插入公式' },
  { keys: 'Ctrl/⌘ + Alt + E', desc: '导出当前面板 Markdown' },
  { keys: 'Ctrl/⌘ + Alt + P', desc: '打印预览' },
]
