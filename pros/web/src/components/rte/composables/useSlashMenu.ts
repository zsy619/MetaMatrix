import { nextTick, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { exitSuggestion } from '@tiptap/suggestion'
import {
  slashPluginKey,
  type RteSlashRenderProps,
  type RteSlashUiHandlers,
} from '../../../extensions/slashCommands'
import { orderSlashForMenu, pushRecentSlash } from '../../../utils/rteRound6'
import { stepMenuIndex } from '../../../utils/rteRound7'
import type { RteSlashItem } from '../../rteSlashItems'

/** 「/」命令菜单。模板绑定名与原先一致，resize/scroll 监听在本组合式内成对注册。 */
export function useSlashMenu(deps: {
  editor: () => ShallowRef<Editor | undefined>
  applySlashCommandItem: (item: RteSlashItem) => void
}) {
/** —— Slash「/」命令菜单状态（须在 useEditor 前声明，供 Suggestion 闭包） —— */
const slashOpen = ref(false)
const slashItems = ref<RteSlashItem[]>([])
const slashIndex = ref(0)
const slashQuery = ref('')
const slashMenuStyle = ref<Record<string, string>>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  visibility: 'hidden',
  zIndex: '5300',
})
let slashSelectItem: ((item: RteSlashItem) => void) | null = null
let slashClientRectFn: (() => DOMRect | null) | null = null
const slashMenuEl = ref<HTMLElement | null>(null)


function placeSlashMenuFromRect(rect: DOMRect | null) {
  const el = slashMenuEl.value
  if (!el || !rect) {
    slashMenuStyle.value = {
      ...slashMenuStyle.value,
      visibility: 'hidden',
    }
    return
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  const gap = 4
  // 先显隐测量
  el.style.visibility = 'hidden'
  el.style.left = '0px'
  el.style.top = '0px'
  el.style.maxHeight = 'none'
  const mw = Math.max(el.offsetWidth, 280)
  const mh = Math.max(el.offsetHeight, 1)
  const spaceBelow = vh - rect.bottom - pad
  const spaceAbove = rect.top - pad
  const preferBelow = spaceBelow >= Math.min(mh, 240) || spaceBelow >= spaceAbove
  let maxH: number
  let top: number
  if (preferBelow) {
    maxH = Math.max(140, spaceBelow - gap)
    top = rect.bottom + gap
  } else {
    maxH = Math.max(140, spaceAbove - gap)
    const usedH = Math.min(mh, maxH)
    top = rect.top - gap - usedH
  }
  let left = rect.left
  if (left + mw > vw - pad) left = vw - pad - mw
  if (left < pad) left = pad
  if (top < pad) top = pad
  if (top + Math.min(mh, maxH) > vh - pad) {
    top = Math.max(pad, vh - pad - Math.min(mh, maxH))
  }
  slashMenuStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    maxHeight: `${Math.round(maxH)}px`,
    visibility: 'visible',
    zIndex: '5300',
  }
}

const SLASH_RECENT_KEY = 'metamatrix-rte-slash-recent'

function loadRecentSlash(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SLASH_RECENT_KEY) || '[]') as unknown
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function rememberSlash(id: string) {
  try {
    localStorage.setItem(SLASH_RECENT_KEY, JSON.stringify(pushRecentSlash(loadRecentSlash(), id)))
  } catch {
    /* 隐私模式忽略 */
  }
}

function syncSlashFromProps(props: RteSlashRenderProps) {
  slashItems.value = orderSlashForMenu(props.items, props.query, loadRecentSlash())
  slashQuery.value = props.query
  slashSelectItem = props.command
  slashClientRectFn = props.clientRect ?? null
  if (slashIndex.value >= props.items.length) {
    slashIndex.value = Math.max(0, props.items.length - 1)
  }
  const rect = props.clientRect?.() ?? null
  nextTick(() => {
    placeSlashMenuFromRect(rect)
    // 选中项滚入视野
    const active = slashMenuEl.value?.querySelector?.('.rte-slash-item.is-active') as HTMLElement | null
    active?.scrollIntoView?.({ block: 'nearest' })
  })
}

function closeSlashMenu() {
  slashOpen.value = false
  slashItems.value = []
  slashIndex.value = 0
  slashQuery.value = ''
  slashSelectItem = null
  slashClientRectFn = null
  slashMenuStyle.value = {
    ...slashMenuStyle.value,
    visibility: 'hidden',
  }
}

const slashUi: RteSlashUiHandlers = {
  onStart(props) {
    slashOpen.value = true
    slashIndex.value = 0
    syncSlashFromProps(props)
  },
  onUpdate(props) {
    if (!slashOpen.value) slashOpen.value = true
    syncSlashFromProps(props)
  },
  onExit() {
    closeSlashMenu()
  },
  onKeyDown({ event }) {
    if (!slashOpen.value) return false
    const slashNext = stepMenuIndex(slashIndex.value, slashItems.value.length, event.key)
    if (slashNext != null || event.key === 'Home' || event.key === 'End' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (slashNext != null) slashIndex.value = slashNext
      nextTick(() => {
        const active = slashMenuEl.value?.querySelector?.('.rte-slash-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = slashItems.value[slashIndex.value]
      if (item && slashSelectItem) slashSelectItem(item)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      const ed = deps.editor().value
      if (ed && !ed.isDestroyed) {
        try {
          exitSuggestion(ed.view, slashPluginKey)
        } catch {
          closeSlashMenu()
        }
      } else {
        closeSlashMenu()
      }
      return true
    }
    return false
  },
  onCommand(item) {
    deps.applySlashCommandItem(item)
  },
}

function pickSlashItem(item: RteSlashItem) {
  rememberSlash(item.id)
  if (slashSelectItem) slashSelectItem(item)
  else deps.applySlashCommandItem(item)
}

function repositionSlashMenu() {
  if (!slashOpen.value) return
  placeSlashMenuFromRect(slashClientRectFn?.() ?? null)
}


  onMounted(() => {
    window.addEventListener('resize', repositionSlashMenu)
    window.addEventListener('scroll', repositionSlashMenu, true)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', repositionSlashMenu)
    window.removeEventListener('scroll', repositionSlashMenu, true)
  })

  return {
    slashOpen,
    slashItems,
    slashIndex,
    slashQuery,
    slashMenuStyle,
    slashSelectItem,
    slashClientRectFn,
    slashMenuEl,
    placeSlashMenuFromRect,
    SLASH_RECENT_KEY,
    loadRecentSlash,
    rememberSlash,
    syncSlashFromProps,
    closeSlashMenu,
    slashUi,
    pickSlashItem,
    repositionSlashMenu,
  }
}
