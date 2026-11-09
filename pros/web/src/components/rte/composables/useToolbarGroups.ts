import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  buildToolbarGroups,
  bumpToolbarUndoEpoch,
  currentToolbarUndoEpoch,
  migrateToolbarGroupButtons,
  moveToolbarGroup,
  readToolbarGroupOrder,
  RIBBON_TABS,
  ribbonGroupsFor,
  toolbarDropIndexFromBoxes,
  toolbarGroupLabels,
  toolbarOrdersEqual,
  TOOLBAR_GROUPS,
  type ToolbarDropBox,
} from '../../../utils/rteToolbarGroups'
import {
  isDefaultToolbarGroupConfig,
  moveGroupButton,
  readToolbarGroupButtons,
  toggleGroupButtonHidden,
  type ToolbarGroupButtonConfig,
  type ToolbarGroupButtonsByPanelId,
} from '../../../utils/rteToolbarGroupButtons'

type ToolLike = { key: string; kind?: string; label?: string }

type GroupLineBox = {
  left: number
  top: number
  width: number
  height: number
  seam: 'both' | 'before' | 'after' | 'none'
}

/** 流式工具栏里分组本身不占盒子，按每一行按钮的外接矩形命中。 */
function groupLineBoxes(el: HTMLElement): GroupLineBox[] {
  const rect = el.getBoundingClientRect()
  if (getComputedStyle(el).display !== 'contents' && rect.width >= 8 && rect.height >= 8) {
    return [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, seam: 'both' }]
  }
  const rects = [...el.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => child.getBoundingClientRect())
    .filter((item) => item.width >= 2 && item.height >= 2)
    .sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: { left: number; right: number; top: number; bottom: number }[] = []
  for (const item of rects) {
    const line = lines.find((row) => Math.abs(row.top - item.top) < 10)
    if (!line) {
      lines.push({ left: item.left, right: item.right, top: item.top, bottom: item.bottom })
      continue
    }
    line.left = Math.min(line.left, item.left)
    line.right = Math.max(line.right, item.right)
    line.top = Math.min(line.top, item.top)
    line.bottom = Math.max(line.bottom, item.bottom)
  }
  return lines.map((line, index) => ({
    left: line.left,
    top: line.top,
    width: line.right - line.left,
    height: line.bottom - line.top,
    seam: lines.length === 1 ? 'both' : index === 0 ? 'before' : index === lines.length - 1 ? 'after' : 'none',
  }))
}

/** 顶栏分组顺序、拖拽排序，以及和页边距共用的 Ctrl+Z。监听在挂载时注册、卸载时移除。 */
export function useToolbarGroups<T extends ToolLike>(deps: {
  panelId: () => string | undefined
  expanded: () => boolean
  orderMap: () => Parameters<typeof readToolbarGroupOrder>[0]
  setPanelToolbarOrder: (panelId: string, order: readonly string[]) => void
  /** 组内按钮显隐与顺序的持久化入口（按面板）。 */
  buttonConfigMap: () => ToolbarGroupButtonsByPanelId | undefined
  setPanelGroupButtons: (
    panelId: string,
    groupId: string,
    config: ToolbarGroupButtonConfig | null,
  ) => void
  tools: () => readonly T[]
  primaryKeys: ReadonlySet<string>
  viewMode: () => string
  announce: (message: string) => void
  rootEl: Ref<HTMLElement | null>
  marginUndoArmed: () => boolean
  marginUndoStamp: () => number
  undoPageMargin: () => boolean
  disarmMarginUndo: () => void
  /** 拖动真正开始时把收起的工具栏展开，否则被裁掉的分组接不到指针。 */
  openToolbarRows?: () => void
}) {
  const localToolbarOrder = ref<string[] | null>(null)
  const toolbarOrderUndo = ref<string[][]>([])
  let toolbarUndoArmed = false
  let toolbarUndoStamp = 0
  const toolbarDropIndex = ref<number | null>(null)
  const toolbarDragSource = ref('')
  let toolbarDragId = ''

  const toolbarOrder = computed(() => {
    const panelId = deps.panelId()
    if (panelId) return readToolbarGroupOrder(deps.orderMap(), panelId)
    return readToolbarGroupOrder(
      localToolbarOrder.value ? { local: localToolbarOrder.value } : undefined,
      localToolbarOrder.value ? 'local' : '',
    )
  })

  const toolbarGroups = computed(() => {
    const tools = deps.expanded()
      ? deps.tools().filter((tool) => tool.kind !== 'divider')
      : deps.tools().filter((tool) => tool.kind !== 'divider' && deps.primaryKeys.has(tool.key))
    return buildToolbarGroups(tools, toolbarOrder.value, toolbarGroupButtonConfigs.value)
  })

  const ribbonTab = ref(RIBBON_TABS[0]!.id)
  const ribbonTabs = RIBBON_TABS
  function setRibbonTab(id: string) {
    if (!RIBBON_TABS.some((tab) => tab.id === id)) return
    ribbonTab.value = id
    deps.openToolbarRows?.()
  }
  /** 最大化时只渲染当前栏目的分组。画布小编辑器仍一次放出全部高频分组。 */
  const visibleToolbarGroups = computed(() => {
    if (!deps.expanded()) return toolbarGroups.value
    const allow = new Set(ribbonGroupsFor(ribbonTab.value))
    return toolbarGroups.value.filter((group) => allow.has(group.id))
  })

  /** 每个分组当前生效的组内按钮配置（已归一化）。旧分组 id 的配置先迁移到新分组。 */
  const toolbarGroupButtonConfigs = computed(() => {
    const map = migrateToolbarGroupButtons(deps.buttonConfigMap())
    const panelId = deps.panelId()
    const out: Record<string, Required<ToolbarGroupButtonConfig>> = {}
    for (const group of TOOLBAR_GROUPS) {
      out[group.id] = readToolbarGroupButtons(map, panelId, group.id, group.keys)
    }
    return out
  })

  /** 某个分组里可配置的全部按钮（含被隐藏的），用于配置面板。 */
  function toolbarGroupButtonEntries(groupId: string) {
    const def = TOOLBAR_GROUPS.find((group) => group.id === groupId)
    if (!def) return []
    const config = toolbarGroupButtonConfigs.value[groupId]
    const labels = new Map(deps.tools().map((tool) => [tool.key, tool.label || tool.key]))
    return def.keys.map((key, index) => ({
      key,
      label: labels.get(key) || key,
      hidden: config.hidden.includes(key),
      order: config.order.indexOf(key),
      defaultIndex: index,
    }))
  }

  function persistGroupButtonConfig(groupId: string, config: ToolbarGroupButtonConfig | null) {
    const def = TOOLBAR_GROUPS.find((group) => group.id === groupId)
    if (!def) return
    const normalized =
      config && !isDefaultToolbarGroupConfig(config, def.keys) ? config : null
    const panelId = deps.panelId()
    if (!panelId) return
    deps.setPanelGroupButtons(panelId, groupId, normalized)
  }

  /** 显示 / 隐藏某个组内按钮。 */
  function toggleToolbarGroupButton(groupId: string, key: string) {
    const def = TOOLBAR_GROUPS.find((group) => group.id === groupId)
    if (!def) return
    const current = toolbarGroupButtonConfigs.value[groupId]
    const next = toggleGroupButtonHidden(current, def.keys, key)
    if (!next) return
    persistGroupButtonConfig(groupId, next)
    deps.announce(`${def.label}分组：${key} ${(next.hidden ?? []).includes(key) ? '已隐藏' : '已显示'}`)
  }

  /** 组内按钮前后移动。dir: -1 上移，1 下移。 */
  function moveToolbarGroupButton(groupId: string, key: string, dir: -1 | 1) {
    const def = TOOLBAR_GROUPS.find((group) => group.id === groupId)
    if (!def) return
    const current = toolbarGroupButtonConfigs.value[groupId]
    const from = current.order.indexOf(key)
    if (from < 0) return
    const to = from + dir
    if (to < 0 || to >= current.order.length) return
    const next = moveGroupButton(current, def.keys, key, to)
    if (!next) return
    persistGroupButtonConfig(groupId, next)
    deps.announce(`${def.label}分组：按钮顺序已调整`)
  }

  function applyToolbarOrder(next: readonly string[], recordUndo: boolean) {
    const prev = toolbarOrder.value
    if (toolbarOrdersEqual(prev, next)) return
    if (recordUndo) {
      toolbarOrderUndo.value = [...toolbarOrderUndo.value, prev].slice(-20)
      toolbarUndoStamp = bumpToolbarUndoEpoch()
      deps.disarmMarginUndo()
    }
    toolbarUndoArmed = recordUndo || toolbarOrderUndo.value.length > 0
    const panelId = deps.panelId()
    if (panelId) deps.setPanelToolbarOrder(panelId, next)
    else localToolbarOrder.value = [...next]
    deps.announce('工具栏分组顺序：' + toolbarGroupLabels(next))
  }

  /** 拖动过程中换位：不播报、不记撤销，松手时再记一次起点。 */
  function writeToolbarOrderSilent(next: readonly string[]) {
    if (toolbarOrdersEqual(toolbarOrder.value, next)) return
    const panelId = deps.panelId()
    if (panelId) deps.setPanelToolbarOrder(panelId, next)
    else localToolbarOrder.value = [...next]
  }

  function undoToolbarGroupOrder(): boolean {
    if (!toolbarUndoArmed || !toolbarOrderUndo.value.length) return false
    const prev = toolbarOrderUndo.value[toolbarOrderUndo.value.length - 1]!
    toolbarOrderUndo.value = toolbarOrderUndo.value.slice(0, -1)
    toolbarUndoArmed = toolbarOrderUndo.value.length > 0
    const panelId = deps.panelId()
    if (panelId) deps.setPanelToolbarOrder(panelId, prev)
    else localToolbarOrder.value = [...prev]
    deps.announce('工具栏分组顺序：' + toolbarGroupLabels(prev))
    return true
  }

  function noteToolbarOrderEdited() {
    toolbarUndoArmed = false
    deps.disarmMarginUndo()
  }

  function disarmToolbarUndo() {
    toolbarUndoArmed = false
  }

  function toolbarUndoIsNewer(marginStamp: number) {
    return toolbarUndoArmed && toolbarUndoStamp > marginStamp
  }

  /** 按下后移动这么多像素才算拖，避免点一下手柄就换位。 */
  const DRAG_START_PX = 3

  let toolbarPointerId = ''
  let toolbarPointerStartX = 0
  let toolbarPointerStartY = 0
  let toolbarGestureX = 0
  let toolbarGestureY = 0
  let toolbarDragFrame = 0
  let toolbarDragOrigin: string[] | null = null
  let toolbarRowsOpened = false
  let toolbarChip: HTMLDivElement | null = null
  let toolbarLiveX = 0
  let toolbarLiveY = 0
  let toolbarLiveApplied = false

  function clearDragChrome() {
    if (toolbarDragFrame) {
      cancelAnimationFrame(toolbarDragFrame)
      toolbarDragFrame = 0
    }
    toolbarChip?.remove()
    toolbarChip = null
    document.documentElement.classList.remove('rte-toolbar-dragging')
  }

  function dragChipLabel(id: string): string {
    if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') return id
    const sel = `[data-group-id="${CSS.escape(id)}"]`
    const root = deps.rootEl.value
    const label = root?.querySelector(`.rte-tool-group${sel} .rte-group-label`)
    const fromBar = label?.textContent?.trim()
    if (fromBar) return fromBar
    const capsule = document.querySelector(`.rte-more-group${sel} .rte-more-capsule`)
    return capsule?.textContent?.replace(/^[⠿\s]+/, '').trim() || id
  }

  function placeDragChip(clientX: number, clientY: number, id: string) {
    if (!toolbarChip) {
      toolbarChip = document.createElement('div')
      toolbarChip.className = 'rte-toolbar-drag-chip'
      document.body.appendChild(toolbarChip)
    }
    toolbarChip.textContent = dragChipLabel(id)
    toolbarChip.style.left = `${Math.round(clientX)}px`
    toolbarChip.style.top = `${Math.round(clientY)}px`
  }

  /** 主轴位移不明显时返回 0，改用中线，避免纵向换行时被误判成横向拖。 */
  function directionAlong(axis: 'x' | 'y'): -1 | 0 | 1 {
    const along = axis === 'x' ? toolbarGestureX : toolbarGestureY
    const across = axis === 'x' ? toolbarGestureY : toolbarGestureX
    if (Math.abs(along) < 8) return 0
    if (Math.abs(along) < Math.abs(across) * 0.75) return 0
    return along > 0 ? 1 : -1
  }

  function dropBoxesIn(root: ParentNode, selector: string, clip: DOMRect): ToolbarDropBox[] {
    const boxes: ToolbarDropBox[] = []
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      const id = el.dataset.groupId || ''
      if (!id) continue
      const orderIndex = toolbarOrder.value.indexOf(id)
      if (orderIndex < 0) continue
      for (const rect of groupLineBoxes(el)) {
        const visibleW = Math.min(rect.left + rect.width, clip.right) - Math.max(rect.left, clip.left)
        const visibleH = Math.min(rect.top + rect.height, clip.bottom) - Math.max(rect.top, clip.top)
        if (visibleW < 8 || visibleH < 8) continue
        boxes.push({
          id,
          orderIndex,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          seam: rect.seam,
        })
      }
    }
    return boxes
  }

  function moreMenuAt(clientX: number, clientY: number): HTMLElement | null {
    for (const menu of document.querySelectorAll<HTMLElement>('.rte-more-menu')) {
      const rect = menu.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return menu
      }
    }
    return null
  }

  function toolbarGroupDropIndexAt(clientX: number, clientY: number): number | null {
    const gesture = { dx: toolbarGestureX, dy: toolbarGestureY }
    const menu = moreMenuAt(clientX, clientY)
    if (menu) {
      return toolbarDropIndexFromBoxes(
        clientX,
        clientY,
        dropBoxesIn(menu, '.rte-more-group', menu.getBoundingClientRect()),
        'y',
        toolbarOrder.value.length,
        directionAlong('y'),
        gesture,
      )
    }
    const host = deps.rootEl.value?.querySelector('.rte-toolbar-tools')
    if (!(host instanceof HTMLElement)) return null
    return toolbarDropIndexFromBoxes(
      clientX,
      clientY,
      dropBoxesIn(host, '.rte-tool-group', host.getBoundingClientRect()),
      'x',
      toolbarOrder.value.length,
      directionAlong('x'),
      gesture,
    )
  }

  function autoScrollToolbar(clientX: number, clientY: number) {
    const menu = moreMenuAt(clientX, clientY)
    if (menu) {
      const rect = menu.getBoundingClientRect()
      const edge = 28
      if (clientY < rect.top + edge) menu.scrollTop -= 14
      else if (clientY > rect.bottom - edge) menu.scrollTop += 14
      return
    }
    const host = deps.rootEl.value?.querySelector('.rte-toolbar-tools')
    if (!(host instanceof HTMLElement)) return
    const rect = host.getBoundingClientRect()
    if (clientY < rect.top - 24 || clientY > rect.bottom + 24) return
    const edge = 36
    if (clientX < rect.left + edge) host.scrollLeft -= 18
    else if (clientX > rect.right - edge) host.scrollLeft += 18
  }

  function trackToolbarPointer(clientX: number, clientY: number) {
    if (!toolbarPointerId) return
    toolbarGestureX = clientX - toolbarPointerStartX
    toolbarGestureY = clientY - toolbarPointerStartY
    if (Math.hypot(toolbarGestureX, toolbarGestureY) < DRAG_START_PX) {
      if (toolbarDropIndex.value != null) toolbarDropIndex.value = null
      return
    }
    placeDragChip(clientX, clientY, toolbarPointerId)
    autoScrollToolbar(clientX, clientY)
    if (!toolbarRowsOpened) {
      toolbarRowsOpened = true
      const collapsed = !!deps.rootEl.value?.querySelector('.rte-toolbar.is-one-row')
      if (collapsed) deps.openToolbarRows?.()
      if (collapsed) {
        toolbarDragFrame = requestAnimationFrame(() => {
          toolbarDragFrame = 0
        })
        return
      }
    }
    if (toolbarDragFrame) return
    const index = toolbarGroupDropIndexAt(clientX, clientY)
    const next = index == null ? null : moveToolbarGroup(toolbarOrder.value, toolbarPointerId, index)
    const shown = next ? index : null
    if (toolbarDropIndex.value !== shown) toolbarDropIndex.value = shown
    if (!next || index == null) return
    toolbarLiveApplied = true
    toolbarLiveX = clientX
    toolbarLiveY = clientY
    writeToolbarOrderSilent(next)
    toolbarDragFrame = requestAnimationFrame(() => {
      toolbarDragFrame = 0
    })
  }

  function finishToolbarPointer(clientX: number, clientY: number) {
    const id = toolbarPointerId
    const origin = toolbarDragOrigin
    toolbarGestureX = clientX - toolbarPointerStartX
    toolbarGestureY = clientY - toolbarPointerStartY
    const moved = Math.hypot(toolbarGestureX, toolbarGestureY) >= DRAG_START_PX
    const index = id && moved ? toolbarGroupDropIndexAt(clientX, clientY) : null
    clearDragChrome()
    toolbarPointerId = ''
    toolbarDragSource.value = ''
    toolbarDropIndex.value = null
    toolbarDragOrigin = null
    toolbarRowsOpened = false
    toolbarGestureX = 0
    toolbarGestureY = 0
    if (!id || !moved || deps.viewMode() !== 'edit') return
    const sameSpot =
      toolbarLiveApplied && Math.hypot(clientX - toolbarLiveX, clientY - toolbarLiveY) < 2
    if (index != null && !sameSpot) {
      const next = moveToolbarGroup(toolbarOrder.value, id, index)
      if (next) writeToolbarOrderSilent(next)
    }
    if (!origin || toolbarOrdersEqual(origin, toolbarOrder.value)) return
    toolbarOrderUndo.value = [...toolbarOrderUndo.value, origin].slice(-20)
    toolbarUndoStamp = bumpToolbarUndoEpoch()
    deps.disarmMarginUndo()
    toolbarUndoArmed = true
    deps.announce('工具栏分组顺序：' + toolbarGroupLabels(toolbarOrder.value))
  }

  function onWindowToolbarPointerMove(event: PointerEvent) {
    trackToolbarPointer(event.clientX, event.clientY)
  }

  function onWindowToolbarPointerUp(event: PointerEvent) {
    if (!toolbarPointerId) return
    finishToolbarPointer(event.clientX, event.clientY)
  }

  function onToolbarHandlePointerDown(id: string, event: PointerEvent) {
    if (deps.viewMode() !== 'edit' || event.button !== 0) return
    toolbarPointerId = id
    toolbarDragSource.value = id
    toolbarPointerStartX = event.clientX
    toolbarPointerStartY = event.clientY
    toolbarGestureX = 0
    toolbarGestureY = 0
    toolbarDropIndex.value = null
    toolbarDragOrigin = [...toolbarOrder.value]
    toolbarRowsOpened = false
    toolbarLiveApplied = false
    document.documentElement.classList.add('rte-toolbar-dragging')
    const handle = event.currentTarget
    if (handle instanceof HTMLElement) {
      handle.focus()
      try {
        handle.setPointerCapture?.(event.pointerId)
      } catch {
        /* 合成指针事件没有有效 pointerId */
      }
    }
    event.preventDefault()
  }

  function onToolbarHandlePointerMove(event: PointerEvent) {
    trackToolbarPointer(event.clientX, event.clientY)
  }

  function onToolbarHandlePointerUp(event: PointerEvent) {
    if (!toolbarPointerId) return
    finishToolbarPointer(event.clientX, event.clientY)
  }

  function onToolbarGroupDragStart(id: string, event: DragEvent) {
    if (toolbarPointerId || deps.viewMode() !== 'edit') {
      event.preventDefault()
      return
    }
    toolbarDragId = id
    toolbarDragSource.value = id
    toolbarPointerStartX = event.clientX
    toolbarPointerStartY = event.clientY
    toolbarGestureX = 0
    toolbarGestureY = 0
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
    }
  }

  function onToolbarGroupDragOver(event: DragEvent) {
    if (toolbarPointerId || !toolbarDragId || deps.viewMode() !== 'edit') return
    toolbarGestureX = event.clientX - toolbarPointerStartX
    toolbarGestureY = event.clientY - toolbarPointerStartY
    const index = toolbarGroupDropIndexAt(event.clientX, event.clientY)
    if (toolbarDropIndex.value !== index) toolbarDropIndex.value = index
  }

  function onWindowToolbarDragOver(event: DragEvent) {
    if (toolbarPointerId || !toolbarDragId || deps.viewMode() !== 'edit') return
    event.preventDefault()
    toolbarGestureX = event.clientX - toolbarPointerStartX
    toolbarGestureY = event.clientY - toolbarPointerStartY
    const index = toolbarGroupDropIndexAt(event.clientX, event.clientY)
    if (toolbarDropIndex.value !== index) toolbarDropIndex.value = index
  }

  function onToolbarGroupDrop() {
    if (!toolbarDragId || toolbarDropIndex.value == null) return
    const next = moveToolbarGroup(toolbarOrder.value, toolbarDragId, toolbarDropIndex.value)
    if (next) applyToolbarOrder(next, true)
    toolbarDragId = ''
    toolbarDragSource.value = ''
    toolbarDropIndex.value = null
  }

  function onWindowToolbarDrop(event: DragEvent) {
    if (!toolbarDragId) return
    event.preventDefault()
    onToolbarGroupDrop()
  }

  function onWindowToolbarUndo(event: KeyboardEvent) {
    if (!toolbarUndoArmed && !deps.marginUndoArmed()) return
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    if (event.key.toLowerCase() !== 'z') return
    const target = event.target
    const root = deps.rootEl.value
    if (target instanceof Element && target.closest('input, textarea') && !root?.contains(target)) return
    const inThis = target instanceof Node && !!root?.contains(target)
    if (target instanceof Element) {
      const host = target.closest('.rte-root')
      if (host && host !== root) return
    }
    const stamp = deps.marginUndoArmed() ? deps.marginUndoStamp() : toolbarUndoStamp
    if (!inThis && stamp !== currentToolbarUndoEpoch()) return
    const undone = deps.marginUndoArmed() ? deps.undoPageMargin() : undoToolbarGroupOrder()
    if (!undone) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onToolbarGroupDragEnd() {
    window.setTimeout(() => {
      if (toolbarPointerId) return
      toolbarDragId = ''
      toolbarDragSource.value = ''
      toolbarDropIndex.value = null
      document.documentElement.classList.remove('rte-toolbar-dragging')
    }, 50)
  }

  function onToolbarGroupKeydown(id: string, event: KeyboardEvent) {
    if (deps.viewMode() !== 'edit' || !event.altKey) return
    const dir = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    event.preventDefault()
    const order = toolbarOrder.value
    const index = order.indexOf(id)
    if (index < 0) return
    const next = moveToolbarGroup(order, id, dir < 0 ? index - 1 : index + 2)
    if (next) applyToolbarOrder(next, true)
  }

  onMounted(() => {
    window.addEventListener('pointermove', onWindowToolbarPointerMove)
    window.addEventListener('pointerup', onWindowToolbarPointerUp)
    window.addEventListener('dragover', onWindowToolbarDragOver)
    window.addEventListener('drop', onWindowToolbarDrop)
    window.addEventListener('keydown', onWindowToolbarUndo, true)
  })
  onBeforeUnmount(() => {
    clearDragChrome()
    window.removeEventListener('pointermove', onWindowToolbarPointerMove)
    window.removeEventListener('pointerup', onWindowToolbarPointerUp)
    window.removeEventListener('dragover', onWindowToolbarDragOver)
    window.removeEventListener('drop', onWindowToolbarDrop)
    window.removeEventListener('keydown', onWindowToolbarUndo, true)
  })

  return {
    toolbarOrder,
    toolbarGroups,
    visibleToolbarGroups,
    ribbonTab,
    ribbonTabs,
    setRibbonTab,
    toolbarGroupButtonConfigs,
    toolbarGroupButtonEntries,
    toggleToolbarGroupButton,
    moveToolbarGroupButton,
    toolbarDropIndex,
    toolbarDragSource,
    undoToolbarGroupOrder,
    noteToolbarOrderEdited,
    disarmToolbarUndo,
    toolbarUndoIsNewer,
    onToolbarHandlePointerDown,
    onToolbarHandlePointerMove,
    onToolbarHandlePointerUp,
    onToolbarGroupDragStart,
    onToolbarGroupDragOver,
    onToolbarGroupDrop,
    onToolbarGroupDragEnd,
    onToolbarGroupKeydown,
  }
}
