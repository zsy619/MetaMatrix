export type CrossRefDoc = {
  descendants: (
    f: (
      node: {
        type: { name: string }
        attrs: Record<string, unknown>
        textContent: string
      },
      pos: number,
    ) => boolean | void,
  ) => void
}

/** 按目标 id 或标题文本找回块位置，供提及式引用点击跳转。 */
export function findCrossRefPos(
  doc: CrossRefDoc,
  targetId: string,
  label = '',
): number | null {
  let found: number | null = null
  const plain = label.replace(/^§\s*/, '').trim()
  doc.descendants((node, pos) => {
    if (found != null) return false
    if (node.type.name === 'heading') {
      const id = String(node.attrs.id || `h-${pos}`)
      const text = node.textContent.trim()
      if ((targetId && id === targetId) || (plain && text === plain)) {
        found = pos
        return false
      }
    }
    if (node.type.name === 'image') {
      const id = String(node.attrs.xrefId || `fig-${pos}`)
      if (targetId && id === targetId) {
        found = pos
        return false
      }
    }
    if (node.type.name === 'table') {
      const id = String(node.attrs.xrefId || `tbl-${pos}`)
      if (targetId && id === targetId) {
        found = pos
        return false
      }
    }
  })
  return found
}
