export type CrossRefNode = {
  type: { name: string }
  attrs: Record<string, unknown>
  textContent: string
  marks?: ReadonlyArray<{ type: { name: string }; attrs: Record<string, unknown> }>
}

/** 与 ProseMirror Node.descendants 兼容，避免把 PM Node 判成不兼容。 */
export type CrossRefDoc = {
  descendants: (f: (node: CrossRefNode, pos: number) => boolean | void) => void
}

export type CrossRefHit = {
  pos: number
  lost: boolean
  via: 'blockId' | 'anchor' | 'label'
}

function nodeBlockId(attrs: Record<string, unknown>): string {
  const raw = attrs.dataBlockId ?? attrs['data-block-id']
  return typeof raw === 'string' ? raw.trim() : ''
}

function nodeAnchorIds(node: CrossRefNode, pos: number): string[] {
  const ids: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) ids.push(value.trim())
  }
  push(node.attrs.id)
  push(node.attrs.xrefId)
  push(node.attrs['data-xref-id'])
  push(node.attrs['data-bookmark-id'])
  if (node.type.name === 'heading') push(`h-${pos}`)
  if (node.type.name === 'image') push(`fig-${pos}`)
  if (node.type.name === 'table') push(`tbl-${pos}`)
  for (const mark of node.marks ?? []) {
    if (mark.type.name === 'bookmark') push(mark.attrs.id)
  }
  return ids
}

/** 按 blockId 定位；旧锚点（heading.id / xrefId / bookmark）降级；标题文本仅作失锚兜底。 */
export function findCrossRef(
  doc: CrossRefDoc,
  targetId: string,
  label = '',
): CrossRefHit | null {
  let blockHit: CrossRefHit | null = null
  let anchorHit: CrossRefHit | null = null
  let labelHit: CrossRefHit | null = null
  const plain = label.replace(/^§\s*/, '').trim()
  doc.descendants((node, pos) => {
    if (blockHit) return false
    const blockId = nodeBlockId(node.attrs)
    if (targetId && blockId && blockId === targetId) {
      blockHit = { pos, lost: false, via: 'blockId' }
      return false
    }
    if (!anchorHit && targetId && nodeAnchorIds(node, pos).includes(targetId)) {
      anchorHit = { pos, lost: false, via: 'anchor' }
    }
    if (!labelHit && node.type.name === 'heading' && plain && node.textContent.trim() === plain) {
      labelHit = { pos, lost: true, via: 'label' }
    }
  })
  return blockHit ?? anchorHit ?? labelHit
}

/** 按目标 id 或标题文本找回块位置，供提及式引用点击跳转。 */
export function findCrossRefPos(
  doc: CrossRefDoc,
  targetId: string,
  label = '',
): number | null {
  return findCrossRef(doc, targetId, label)?.pos ?? null
}
