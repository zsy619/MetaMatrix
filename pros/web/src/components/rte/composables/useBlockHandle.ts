import { nextTick, ref, type Ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import { reorderIndexes } from '../../../utils/rteBatch3'
import { moveHeadingAt } from '../../../utils/rteHeadingSection'
import { blockHandleLeft, proseContentLeft } from '../../../utils/rteGutter'

/** 指针离开「+」/面板后的宽限期：够跨过两者之间的空隙，又不至于赖着不走。 */
const BLOCK_MENU_CLOSE_DELAY_MS = 200

/** 块手柄、块菜单与块拖拽。模板绑定名与原先一致。 */
export function useBlockHandle(deps: {
  editor: ShallowRef<Editor | undefined>
  viewMode: () => { value: string }
  rteRootEl: Ref<HTMLElement | null>
}) {
/** —— 块操作：全选当前块 / 复制块 / 上移下移 —— */
function getTopLevelBlockRange(): { from: number; to: number; node: { type: { name: string }; nodeSize: number; copy: (c?: unknown) => unknown } } | null {
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
/** 面板是否被点击「钉住」；悬停打开的面板移开指针就关。 */
const blockMenuPinned = ref(false)
/** 指针从「+」挪到面板的宽限期，避免中途误关。 */
let blockMenuCloseTimer: ReturnType<typeof setTimeout> | null = null

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
  const left = blockHandleLeft(contentLeft, canvasRect.left)
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
  cancelBlockMenuClose()
  blockHandle.value = { ...blockHandle.value, visible: false, index: -1 }
  blockMenuOpen.value = false
  blockMenuPinned.value = false
}

/**
 * 面板的开关只有两条路：悬停打开（移开即关）与点击钉住（再点一次才关）。
 * 两者共用一个关闭计时，指针在「+」与面板之间移动时不误关。
 */
function cancelBlockMenuClose() {
  if (blockMenuCloseTimer) {
    clearTimeout(blockMenuCloseTimer)
    blockMenuCloseTimer = null
  }
}

/** 指针进入「+」：直接亮出块操作面板，不抢正文焦点。 */
function onBlockAddEnter() {
  cancelBlockMenuClose()
  const index = blockHandle.value.index
  if (index < 0) return
  if (blockMenuOpen.value && blockMenuIndex.value === index) return
  blockMenuIndex.value = index
  blockMenuOpen.value = true
  blockMenuPinned.value = false
}

/** 指针进入面板：只取消关闭计时。 */
function onBlockPanelEnter() {
  cancelBlockMenuClose()
}

/** 指针离开「+」或面板：延迟关闭；只是挪到另一个部件上时不关。 */
function onBlockPanelLeave(event: MouseEvent) {
  const next = event.relatedTarget as Element | null
  if (next && typeof next.closest === 'function') {
    if (next.closest('.rte-block-tools, .rte-block-menu')) return
  }
  cancelBlockMenuClose()
  blockMenuCloseTimer = setTimeout(() => {
    blockMenuCloseTimer = null
    blockMenuOpen.value = false
    blockMenuPinned.value = false
  }, BLOCK_MENU_CLOSE_DELAY_MS)
}

function toggleBlockMenu() {
  const index = blockHandle.value.index
  // 点击「+」是钉住：钉住后再点一次才关闭；悬停打开的面板不因这次点击消失。
  if (
    blockMenuOpen.value &&
    blockMenuPinned.value &&
    blockMenuIndex.value === index
  ) {
    blockMenuOpen.value = false
    blockMenuPinned.value = false
    return
  }
  blockMenuIndex.value = index
  blockMenuOpen.value = blockMenuIndex.value >= 0
  blockMenuPinned.value = blockMenuOpen.value
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
  blockMenuPinned.value = true
  focusBlockMenuSoon()
}

function onBlockMenuKeydown(event: KeyboardEvent) {
  const menu = event.currentTarget as HTMLElement
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    blockMenuOpen.value = false
    blockMenuPinned.value = false
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

type BlockTurn =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'code'
  | 'quote'
  | 'info'
  | 'warn'
  | 'success'
  | 'error'

function turnHoveredBlock(kind: BlockTurn) {
  const index = blockMenuIndex.value
  if (!focusTopLevelBlock(index)) return
  const ed = deps.editor.value
  if (!ed) return
  const chain = ed.chain().focus()
  if (kind === 'paragraph') chain.setParagraph()
  else if (kind === 'h1') chain.setHeading({ level: 1 })
  else if (kind === 'h2') chain.setHeading({ level: 2 })
  else if (kind === 'h3') chain.setHeading({ level: 3 })
  else if (kind === 'bullet' && !ed.isActive('bulletList')) chain.toggleBulletList()
  else if (kind === 'ordered' && !ed.isActive('orderedList')) chain.toggleOrderedList()
  else if (kind === 'task' && !ed.isActive('taskList')) chain.toggleTaskList()
  else if (kind === 'code' && !ed.isActive('codeBlock')) chain.toggleCodeBlock()
  else if (kind === 'quote' && !ed.isActive('blockquote')) chain.toggleBlockquote()
  else if (kind === 'info' || kind === 'warn' || kind === 'success' || kind === 'error') {
    chain.setCallout(kind)
  }
  chain.run()
  blockMenuOpen.value = false
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

/**
 * 在目标顶层块后创建段落并放置光标。
 * 斜杠入口写入「/」，直接插入入口传空文本；两条路径共享同一个定位事务，
 * 避免图片、表格等命令落到原段段首，或把斜杠触发符留在正文里。
 */
function insertParagraphBelowHoveredBlock(text = ''): boolean {
  const ed = deps.editor.value
  const index = blockMenuIndex.value
  if (!ed || index < 0 || index >= ed.state.doc.childCount) return false
  const paragraph = ed.schema.nodes.paragraph
  if (!paragraph) return false
  let pos = 0
  ed.state.doc.forEach((_node, offset, i) => {
    if (i === index) pos = offset
  })
  const node = ed.state.doc.child(index)
  const at = pos + node.nodeSize
  const block = paragraph.create(null, text ? ed.schema.text(text) : null)
  let tr = ed.state.tr.insert(at, block)
  const cursor = at + block.nodeSize - 1
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)))
  ed.view.dispatch(tr.scrollIntoView())
  ed.commands.focus()
  blockMenuOpen.value = false
  return true
}

/** 保留原「在下方插入」行为：新段落写入 / 并唤起斜杠菜单。 */
function insertBelowHoveredBlock() {
  insertParagraphBelowHoveredBlock('/')
}

/** 「+」面板直接插入前准备干净的新段落，不写斜杠触发符。 */
function prepareInsertBelowHoveredBlock(): boolean {
  return insertParagraphBelowHoveredBlock()
}

/** 「+」按钮点击：刚拖动完时不要再弹面板。 */
function onBlockAddClick() {
  if (gripDragged || blockDragFrom >= 0) return
  toggleBlockMenu()
}

function onBlockDragStart(event: DragEvent) {
  gripDragged = true
  blockDragFrom = blockHandle.value.index
  // 拖拽排序时收起面板，别让它跟着手柄留在原地。
  blockMenuOpen.value = false
  blockMenuPinned.value = false
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
    onBlockAddEnter,
    onBlockPanelEnter,
    onBlockPanelLeave,
    placeBlockToolsAtIndex,
    focusBlockMenuSoon,
    openBlockMenuForSelection,
    onBlockMenuKeydown,
    focusTopLevelBlock,
    turnHoveredBlock,
    copyHoveredBlock,
    deleteHoveredBlock,
    moveHoveredBlock,
    insertBelowHoveredBlock,
    prepareInsertBelowHoveredBlock,
    onBlockAddClick,
    onBlockDragStart,
    onBlockDragEnd,
    onCanvasBlockDragOver,
    onCanvasBlockDrop,
  }
}
