import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  buildToolbarGroups,
  bumpToolbarUndoEpoch,
  currentToolbarUndoEpoch,
  migrateToolbarGroupButtons,
  moveToolbarGroup,
  readToolbarGroupOrder,
  toolbarGroupLabels,
  toolbarOrdersEqual,
  TOOLBAR_GROUPS,
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

  let toolbarPointerId = ''
  let toolbarPointerStartX = 0
  let toolbarPointerStartY = 0

  function finishToolbarPointer(clientX: number, clientY: number) {
    const id = toolbarPointerId
    const moved = Math.hypot(clientX - toolbarPointerStartX, clientY - toolbarPointerStartY) > 6
    const index = toolbarDropIndex.value
    toolbarPointerId = ''
    toolbarDragSource.value = ''
    toolbarDropIndex.value = null
    if (!id || !moved || index == null || deps.viewMode() !== 'edit') return
    const next = moveToolbarGroup(toolbarOrder.value, id, index)
    if (next) applyToolbarOrder(next, true)
  }

  function onWindowToolbarPointerMove(event: PointerEvent) {
    if (!toolbarPointerId) return
    toolbarDropIndex.value = toolbarGroupDropIndexAt(event.clientX, event.clientY)
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
    toolbarDropIndex.value = toolbarGroupDropIndexAt(event.clientX, event.clientY)
    const handle = event.currentTarget as HTMLElement
    handle.focus()
    try {
      handle.setPointerCapture?.(event.pointerId)
    } catch {
      /* 合成指针事件没有有效 pointerId */
    }
    event.preventDefault()
  }

  function onToolbarHandlePointerMove(event: PointerEvent) {
    if (!toolbarPointerId) return
    toolbarDropIndex.value = toolbarGroupDropIndexAt(event.clientX, event.clientY)
  }

  function onToolbarHandlePointerUp(event: PointerEvent) {
    if (!toolbarPointerId) return
    finishToolbarPointer(event.clientX, event.clientY)
  }

  function onToolbarGroupDragStart(id: string, event: DragEvent) {
    if (deps.viewMode() !== 'edit') {
      event.preventDefault()
      return
    }
    toolbarDragId = id
    toolbarDragSource.value = id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
    }
  }

  function orderIndexOf(id: string | undefined, fallback: number): number {
    if (!id) return fallback
    const at = toolbarOrder.value.indexOf(id)
    return at < 0 ? fallback : at
  }

  function toolbarGroupDropIndexAt(clientX: number, clientY: number): number | null {
    const more = document.querySelector('.rte-more-menu')
    if (more instanceof HTMLElement) {
      const menu = more.getBoundingClientRect()
      const inside = clientX >= menu.left && clientX <= menu.right && clientY >= menu.top && clientY <= menu.bottom
      if (inside) {
        const groups = Array.from(more.querySelectorAll<HTMLElement>('.rte-more-group'))
        for (let i = 0; i < groups.length; i += 1) {
          const rect = groups[i]!.getBoundingClientRect()
          if (clientY < rect.top + rect.height / 2) return orderIndexOf(groups[i]!.dataset.groupId, i)
        }
        const last = groups[groups.length - 1]
        const at = orderIndexOf(last?.dataset.groupId, toolbarOrder.value.length - 1)
        return Math.min(toolbarOrder.value.length, at + 1)
      }
    }
    const host = deps.rootEl.value?.querySelector('.rte-toolbar-tools')
    if (!host) return null
    const groups = Array.from(host.querySelectorAll<HTMLElement>('.rte-tool-group'))
    for (let i = 0; i < groups.length; i += 1) {
      const rect = groups[i]!.getBoundingClientRect()
      if (clientX < rect.left + rect.width / 2) return orderIndexOf(groups[i]!.dataset.groupId, i)
    }
    const last = groups[groups.length - 1]
    const at = orderIndexOf(last?.dataset.groupId, groups.length - 1)
    return Math.min(toolbarOrder.value.length, at + 1)
  }

  function onToolbarGroupDragOver(event: DragEvent) {
    if (!toolbarDragId || deps.viewMode() !== 'edit') return
    toolbarDropIndex.value = toolbarGroupDropIndexAt(event.clientX, event.clientY)
  }

  function onWindowToolbarDragOver(event: DragEvent) {
    if (!toolbarDragId || deps.viewMode() !== 'edit') return
    event.preventDefault()
    toolbarDropIndex.value = toolbarGroupDropIndexAt(event.clientX, event.clientY)
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
      toolbarDragId = ''
      toolbarDragSource.value = ''
      toolbarDropIndex.value = null
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
    window.removeEventListener('pointermove', onWindowToolbarPointerMove)
    window.removeEventListener('pointerup', onWindowToolbarPointerUp)
    window.removeEventListener('dragover', onWindowToolbarDragOver)
    window.removeEventListener('drop', onWindowToolbarDrop)
    window.removeEventListener('keydown', onWindowToolbarUndo, true)
  })

  return {
    toolbarOrder,
    toolbarGroups,
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
