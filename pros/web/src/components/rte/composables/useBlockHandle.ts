import { nextTick, ref, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { DOMSerializer, Fragment } from '@tiptap/pm/model'
import { reorderIndexes } from '../../../utils/rteBatch3'
import { moveHeadingAt } from '../../../utils/rteHeadingSection'
import { blockHandleLeft, blockToolsWidth, proseContentLeft } from '../../../utils/rteGutter'
import { applyTextAlignToSelection } from '../selectionFormat'
import {
  blockFaceFromNode,
  type BlockHandleAlign,
  type BlockHandleTurn,
} from '../blockHandleMenu'

/** 块手柄、块菜单与块拖拽。模板绑定名与原先一致。 */
export function useBlockHandle(deps: {
  editor: ShallowRef<Editor | undefined>
  viewMode: () => { value: string }
  rteRootEl: Ref<HTMLElement | null>
  expanded: () => boolean
}) {
/** —— 块操作：全选当前块 / 复制块 / 上移下移 —— */
function getTopLevelBlockRange(): {
  from: number
  to: number
  node: {
    type: { name: string }
    nodeSize: number
    textContent: string
    copy: (c?: unknown) => unknown
  }
} | null {
  const ed = deps.editor.value
  if (!ed) return null
  const { $from } = ed.state.selection
  if ($from.depth < 1) return null
  const depth = 1
  const from = $from.before(depth)
  const node = $from.node(depth)
  return { from, to: from + node.nodeSize, node: node as any }
}

function selectCurrentBlock() {
  const ed = deps.editor.value
  const range = getTopLevelBlockRange()
  if (!ed || !range) {
    ElMessage.warning('无法选中当前块')
    return
  }
  try {
    ed.view.dispatch(
      ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, range.from)),
    )
    ed.view.focus()
  } catch {
    ed.chain().focus().setTextSelection({ from: range.from, to: range.to }).run()
  }
}

function duplicateCurrentBlock() {
  const ed = deps.editor.value
  const range = getTopLevelBlockRange()
  if (!ed || !range) {
    ElMessage.warning('无法复制当前块')
    return
  }
  const copy = range.node.copy((range.node as any).content)
  const tr = ed.state.tr.insert(range.to, copy as any)
  ed.view.dispatch(tr.scrollIntoView())
  ed.view.focus()
  ElMessage.success('已复制当前块')
}

function moveCurrentBlock(dir: -1 | 1) {
  const ed = deps.editor.value
  if (!ed) return
  const { $from } = ed.state.selection
  if ($from.depth < 1) return
  const index = $from.index(0)
  const doc = ed.state.doc
  const targetIndex = index + dir
  if (targetIndex < 0 || targetIndex >= doc.childCount) {
    ElMessage.info(dir < 0 ? '已在最顶部' : '已在最底部')
    return
  }
  const current = doc.child(index)
  if (current?.type.name === 'heading') {
    const pos = $from.before(1)
    if (!moveHeadingAt(ed, pos, dir)) ElMessage.info(dir < 0 ? '已在最顶部' : '已在最底部')
    return
  }
  const children: ReturnType<typeof doc.child>[] = []
  doc.forEach((child) => {
    children.push(child)
  })
  const [moved] = children.splice(index, 1)
  children.splice(targetIndex, 0, moved)
  const copies = children.map((c) => c.copy(c.content))
  let tr = ed.state.tr
  tr = tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  let selPos = 0
  for (let i = 0; i < targetIndex; i += 1) selPos += children[i].nodeSize
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  } catch {
    /* ignore */
  }
  ed.view.dispatch(tr)
  ed.view.focus()
}

function moveTopLevelBlock(from: number, toGap: number) {
  const ed = deps.editor.value
  if (!ed) return
  const doc = ed.state.doc
  const order = reorderIndexes(doc.childCount, from, toGap)
  if (!order) return
  const children: Array<ReturnType<typeof doc.child>> = []
  doc.forEach((child) => {
    children.push(child)
  })
  const copies = order.map((index) => {
    const node = children[index]!
    return node.copy(node.content)
  })
  let tr = ed.state.tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  let selPos = 0
  const dest = toGap > from ? toGap - 1 : toGap
  for (let i = 0; i < dest; i += 1) selPos += copies[i]!.nodeSize
  try {
    tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  } catch {
    /* 选区落在原子块上失败时仍保留新顺序 */
  }
  ed.view.dispatch(tr)
  ed.view.focus()
}

const blockHandle = ref({ visible: false, top: 0, left: 0, index: -1 })
const blockDropLine = ref<number | null>(null)
let blockDragFrom = -1
let blockDropGap = 0
/** 刚拖完块时忽略紧接着的 click，避免松手又把块菜单打开。 */
let gripDragged = false

function topLevelBlockElements(canvas: HTMLElement): HTMLElement[] {
  const prose = canvas.querySelector('.ProseMirror')
  if (!prose) return []
  return Array.from(prose.children).filter((el): el is HTMLElement => el instanceof HTMLElement)
}

function blockGapAt(canvas: HTMLElement, clientY: number) {
  const blocks = topLevelBlockElements(canvas)
  const canvasRect = canvas.getBoundingClientRect()
  let gap = blocks.length
  for (let i = 0; i < blocks.length; i += 1) {
    const rect = blocks[i]!.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) {
      gap = i
      break
    }
  }
  const edge =
    gap >= blocks.length
      ? (blocks.at(-1)?.getBoundingClientRect().bottom ?? canvasRect.top)
      : blocks[gap]!.getBoundingClientRect().top
  return { gap, line: edge - canvasRect.top + canvas.scrollTop }
}

const blockMenuOpen = ref(false)
const blockMenuIndex = ref(-1)
const bubbleSwatch = ref<'text' | 'highlight' | null>(null)

/**
 * 手柄左边界（相对 canvas 左边界）。
 *
 * 手柄整体落在正文左侧的留白（gutter）里，右边缘始终在正文左边界之前，
 * 因此不会盖住每行的第一个字，点击首字前也能正常放置光标。
 */
function handleLeftFor(canvas: HTMLElement, blockRect: { left: number }): number {
  const canvasRect = canvas.getBoundingClientRect()
  const prose = canvas.querySelector('.ProseMirror') as HTMLElement | null
  // 正文内容左边界；找不到 ProseMirror 时退回块自身的左边界。
  const contentLeft = prose ? proseContentLeft(prose) : blockRect.left
  const toolsWidth = blockToolsWidth(deps.expanded())
  const left = blockHandleLeft(contentLeft, canvasRect.left, toolsWidth)
  // 留白被外部样式挤掉时也不要跑到 canvas 之外，避免手柄被裁掉。
  return Math.max(0, Math.round(left))
}

function onCanvasBlockHover(event: MouseEvent) {
  if (deps.viewMode().value !== 'edit' || blockDragFrom >= 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.rte-block-menu, .rte-block-tools')) return
  const canvas = event.currentTarget as HTMLElement
  const blocks = topLevelBlockElements(canvas)
  const canvasRect = canvas.getBoundingClientRect()
  let index = -1
  for (let i = 0; i < blocks.length; i += 1) {
    const rect = blocks[i]!.getBoundingClientRect()
    if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
      index = i
      const left = handleLeftFor(canvas, rect)
      blockHandle.value = {
        visible: true,
        top: rect.top - canvasRect.top + canvas.scrollTop,
        left,
        index,
      }
      return
    }
  }
  blockHandle.value = { ...blockHandle.value, visible: false, index: -1 }
}

function hideBlockHandle() {
  if (blockDragFrom >= 0) return
  blockHandle.value = { ...blockHandle.value, visible: false, index: -1 }
  blockMenuOpen.value = false
}

function toggleBlockMenu() {
  if (blockMenuOpen.value && blockMenuIndex.value === blockHandle.value.index) {
    blockMenuOpen.value = false
    return
  }
  blockMenuIndex.value = blockHandle.value.index
  blockMenuOpen.value = blockMenuIndex.value >= 0
  if (blockMenuOpen.value) focusBlockMenuSoon()
}

function placeBlockToolsAtIndex(index: number) {
  const canvas = deps.rteRootEl.value?.querySelector('.rte-canvas') as HTMLElement | null
  if (!canvas) return
  const el = topLevelBlockElements(canvas)[index]
  if (!el) return
  const canvasRect = canvas.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  blockHandle.value = {
    visible: true,
    top: rect.top - canvasRect.top + canvas.scrollTop,
    left: handleLeftFor(canvas, rect),
    index,
  }
}

function focusBlockMenuSoon() {
  void nextTick(() => {
    const btn = deps.rteRootEl.value?.querySelector(
      '.rte-block-menu [role="menuitem"]',
    ) as HTMLButtonElement | null
    btn?.focus()
  })
}

function openBlockMenuForSelection() {
  const ed = deps.editor.value
  if (!ed || deps.viewMode().value !== 'edit') return
  const index = ed.state.selection.$from.index(0)
  placeBlockToolsAtIndex(index)
  blockMenuIndex.value = index
  blockMenuOpen.value = true
  focusBlockMenuSoon()
}

function onBlockMenuKeydown(event: KeyboardEvent) {
  const menu = event.currentTarget as HTMLElement
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    blockMenuOpen.value = false
    deps.editor.value?.commands.focus()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  if (!items.length) return
  const next =
    event.key === 'ArrowDown'
      ? (current + 1) % items.length
      : (current - 1 + items.length) % items.length
  items[next]?.focus()
}

function focusTopLevelBlock(index: number): boolean {
  const ed = deps.editor.value
  if (!ed) return false
  if (index < 0 || index >= ed.state.doc.childCount) return false
  let pos = 0
  ed.state.doc.forEach((_node, offset, i) => {
    if (i === index) pos = offset
  })
  const node = ed.state.doc.child(index)
  const inside = Math.min(pos + 1, Math.max(pos, pos + node.nodeSize - 1))
  try {
    ed.chain().focus().setTextSelection(inside).run()
    return true
  } catch {
    return false
  }
}

function hoveredBlockFace(): string {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return ''
  const node = ed.state.doc.child(index)
  return blockFaceFromNode(node.type.name, node.attrs)
}

function readAlign(attrs: { textAlign?: unknown } | null | undefined): BlockHandleAlign | '' {
  const align = String(attrs?.textAlign || '')
  if (align === 'center' || align === 'right' || align === 'justify' || align === 'left') return align
  return ''
}

function hoveredBlockAlign(): BlockHandleAlign {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return 'left'
  const node = ed.state.doc.child(index)
  const own = readAlign(node.attrs)
  if (own) return own
  let found: BlockHandleAlign = 'left'
  node.descendants((child) => {
    if (child.type.name !== 'paragraph' && child.type.name !== 'heading') return
    const align = readAlign(child.attrs)
    if (!align) return
    found = align
    return false
  })
  return found
}

function turnHoveredBlock(kind: BlockHandleTurn) {
  const index = blockMenuIndex.value
  if (!focusTopLevelBlock(index)) return
  const ed = deps.editor.value
  if (!ed) return
  if (kind === 'hr') {
    const range = getTopLevelBlockRange()
    const hrType = ed.schema.nodes.horizontalRule
    if (!range || !hrType) return
    ed.view.dispatch(ed.state.tr.insert(range.to, hrType.create()).scrollIntoView())
    ed.view.focus()
    blockMenuOpen.value = false
    return
  }
  const chain = ed.chain().focus()
  if (kind === 'paragraph') chain.setParagraph()
  else if (kind === 'h1') chain.setHeading({ level: 1 })
  else if (kind === 'h2') chain.setHeading({ level: 2 })
  else if (kind === 'h3') chain.setHeading({ level: 3 })
  else if (kind === 'h4') chain.setHeading({ level: 4 })
  else if (kind === 'bullet' && !ed.isActive('bulletList')) chain.toggleBulletList()
  else if (kind === 'ordered' && !ed.isActive('orderedList')) chain.toggleOrderedList()
  else if (kind === 'task' && !ed.isActive('taskList')) chain.toggleTaskList()
  else if (kind === 'quote' && !ed.isActive('blockquote')) chain.toggleBlockquote()
  else if (kind === 'code' && !ed.isActive('codeBlock')) chain.toggleCodeBlock()
  else if (kind === 'info' || kind === 'warn' || kind === 'success' || kind === 'error') {
    chain.setCallout(kind)
  }
  chain.run()
  blockMenuOpen.value = false
}

function alignHoveredBlock(align: BlockHandleAlign) {
  if (!selectHoveredBlockText() && !focusTopLevelBlock(blockMenuIndex.value)) return
  applyTextAlignToSelection(deps.editor.value, align)
  blockMenuOpen.value = false
}

function indentHoveredBlock(dir: 1 | -1) {
  if (!focusTopLevelBlock(blockMenuIndex.value)) return
  const ed = deps.editor.value
  if (!ed) return
  if (dir > 0) ed.chain().focus().indent().run()
  else ed.chain().focus().outdent().run()
  blockMenuOpen.value = false
}

/** 选中当前块里的文字，供上色和评论使用。空块返回 false。 */
function selectHoveredBlockText(): boolean {
  if (!focusTopLevelBlock(blockMenuIndex.value)) return false
  const ed = deps.editor.value
  const range = getTopLevelBlockRange()
  if (!ed || !range || !range.node.textContent.trim()) return false
  const from = range.from + 1
  const to = range.to - 1
  if (to <= from) return false
  return ed.chain().focus().setTextSelection({ from, to }).run()
}

function paintHoveredBlock(kind: 'color' | 'highlight', color: string) {
  if (!selectHoveredBlockText()) {
    ElMessage.info('这一块里没有可上色的文字')
    return
  }
  const ed = deps.editor.value
  if (!ed) return
  const chain = ed.chain().focus()
  if (kind === 'color') {
    if (!color) chain.unsetColor()
    else chain.setColor(color)
  } else if (!color) chain.unsetHighlight()
  else chain.setHighlight({ color })
  chain.run()
  blockMenuOpen.value = false
}

function hoveredBlockPayload(): { html: string; text: string } | null {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return null
  const node = ed.state.doc.child(index)
  const host = document.createElement('div')
  host.appendChild(DOMSerializer.fromSchema(ed.schema).serializeNode(node))
  return { html: host.innerHTML, text: node.textContent || '' }
}

/** 优先写入 HTML，纯文本环境只保留文字。空块没有文字时要求 HTML 写入成功。 */
async function writeBlockClipboard(html: string, text: string): Promise<void> {
  const clip = navigator.clipboard
  if (!clip) throw new Error('no clipboard')
  const Item = typeof globalThis.ClipboardItem === 'undefined' ? undefined : globalThis.ClipboardItem
  if (Item && typeof clip.write === 'function') {
    try {
      await clip.write([
        new Item({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      /* 退回纯文本 */
    }
  }
  if (!text.trim() || typeof clip.writeText !== 'function') throw new Error('no text clipboard')
  await clip.writeText(text)
}

async function copyHoveredBlockClipboard() {
  const payload = hoveredBlockPayload()
  if (!payload) {
    ElMessage.warning('无法复制当前块')
    return
  }
  try {
    await writeBlockClipboard(payload.html, payload.text)
  } catch {
    ElMessage.warning('无法写入剪贴板')
    return
  }
  ElMessage.success('已复制到剪贴板')
  blockMenuOpen.value = false
}

async function cutHoveredBlock() {
  const payload = hoveredBlockPayload()
  if (!payload) {
    ElMessage.warning('无法剪切当前块')
    return
  }
  try {
    await writeBlockClipboard(payload.html, payload.text)
  } catch {
    ElMessage.warning('无法写入剪贴板，未删除这一块')
    return
  }
  deleteHoveredBlock()
  ElMessage.success('已剪切')
}

function copyHoveredBlock() {
  if (!focusTopLevelBlock(blockMenuIndex.value)) return
  duplicateCurrentBlock()
  blockMenuOpen.value = false
}

function deleteHoveredBlock() {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return
  let pos = 0
  ed.state.doc.forEach((_node, offset, i) => {
    if (i === index) pos = offset
  })
  const node = ed.state.doc.child(index)
  if (ed.state.doc.childCount <= 1) {
    ed.chain().focus().setContent('<p></p>').run()
  } else {
    ed.view.dispatch(ed.state.tr.delete(pos, pos + node.nodeSize))
    ed.view.focus()
  }
  blockMenuOpen.value = false
  blockHandle.value = { ...blockHandle.value, visible: false, index: -1 }
}

function moveHoveredBlock(dir: -1 | 1) {
  if (!focusTopLevelBlock(blockMenuIndex.value)) return
  moveCurrentBlock(dir)
  blockMenuOpen.value = false
}

/** 在当前块下方插入空段，并写入「/」唤起飞书式斜杠菜单。 */
function insertBelowHoveredBlock() {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return
  const paragraph = ed.schema.nodes.paragraph
  if (!paragraph) return
  let pos = 0
  ed.state.doc.forEach((_node, offset, i) => {
    if (i === index) pos = offset
  })
  const node = ed.state.doc.child(index)
  const at = pos + node.nodeSize
  const block = paragraph.create(null, ed.schema.text('/'))
  let tr = ed.state.tr.insert(at, block)
  const cursor = at + block.nodeSize - 1
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)))
  ed.view.dispatch(tr.scrollIntoView())
  ed.commands.focus()
  blockMenuOpen.value = false
}

function onBlockGripClick() {
  if (gripDragged || blockDragFrom >= 0) return
  toggleBlockMenu()
}

function onBlockDragStart(event: DragEvent) {
  gripDragged = true
  blockDragFrom = blockHandle.value.index
  event.dataTransfer?.setData('application/x-rte-block', String(blockDragFrom))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onBlockDragEnd() {
  blockDragFrom = -1
  blockDropLine.value = null
  window.setTimeout(() => {
    gripDragged = false
  }, 50)
}

function onCanvasBlockDragOver(event: DragEvent) {
  if (blockDragFrom < 0) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const metrics = blockGapAt(event.currentTarget as HTMLElement, event.clientY)
  blockDropGap = metrics.gap
  blockDropLine.value = metrics.line
}

function onCanvasBlockDrop(event: DragEvent) {
  if (blockDragFrom < 0) return
  event.preventDefault()
  event.stopPropagation()
  const from = blockDragFrom
  const gap = blockDropGap
  blockDragFrom = -1
  blockDropLine.value = null
  blockHandle.value = { ...blockHandle.value, visible: false, index: -1 }
  moveTopLevelBlock(from, gap)
}


  return {
    getTopLevelBlockRange,
    selectCurrentBlock,
    duplicateCurrentBlock,
    moveCurrentBlock,
    moveTopLevelBlock,
    blockHandle,
    blockDropLine,
    blockDragFrom,
    blockDropGap,
    topLevelBlockElements,
    blockGapAt,
    blockMenuOpen,
    blockMenuIndex,
    bubbleSwatch,
    onCanvasBlockHover,
    hideBlockHandle,
    toggleBlockMenu,
    placeBlockToolsAtIndex,
    focusBlockMenuSoon,
    openBlockMenuForSelection,
    onBlockMenuKeydown,
    focusTopLevelBlock,
    hoveredBlockFace,
    hoveredBlockAlign,
    turnHoveredBlock,
    alignHoveredBlock,
    indentHoveredBlock,
    selectHoveredBlockText,
    paintHoveredBlock,
    copyHoveredBlockClipboard,
    cutHoveredBlock,
    copyHoveredBlock,
    deleteHoveredBlock,
    moveHoveredBlock,
    insertBelowHoveredBlock,
    onBlockGripClick,
    onBlockDragStart,
    onBlockDragEnd,
    onCanvasBlockDragOver,
    onCanvasBlockDrop,
  }
}
