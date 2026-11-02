import { nextTick, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { exitSuggestion } from '@tiptap/suggestion'
import {
  mentionPluginKey,
  type RteMentionRenderProps,
  type RteMentionUiHandlers,
} from '../../../extensions/mentionSuggestion'
import type { RteMentionItem } from '../../rteMentionItems'
import { stepMenuIndex } from '../../../utils/rteRound7'

/** @ 提及菜单。模板绑定名与原先一致，resize/scroll 监听在本组合式内成对注册。 */
export function useMentionMenu(deps: {
  editor: () => ShallowRef<Editor | undefined>
}) {
/** —— @提及建议菜单（与 Slash 同定位模式；候选见 rteMentionItems） —— */
const mentionOpen = ref(false)
const mentionItems = ref<RteMentionItem[]>([])
const mentionIndex = ref(0)
const mentionQuery = ref('')
const mentionMenuStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
  zIndex: '10050',
})
let mentionCommand: ((item: RteMentionItem) => void) | null = null
let mentionClientRectFn: (() => DOMRect | null) | null = null
const mentionMenuEl = ref<HTMLElement | null>(null)


function placeMentionMenuFromRect(rect: DOMRect | null) {
  const el = mentionMenuEl.value
  if (!el || !rect) {
    mentionMenuStyle.value = {
      ...mentionMenuStyle.value,
      visibility: 'hidden',
    }
    return
  }
  const gap = 4
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = el.offsetWidth || 280
  const menuH = el.offsetHeight || 200
  let left = rect.left
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8)
  if (left < 8) left = 8
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top
  let top: number
  let maxH: number
  if (spaceBelow >= Math.min(menuH, 180) || spaceBelow >= spaceAbove) {
    maxH = Math.max(140, spaceBelow - gap)
    top = rect.bottom + gap
  } else {
    maxH = Math.max(140, spaceAbove - gap)
    const usedH = Math.min(menuH, maxH)
    top = rect.top - gap - usedH
  }
  mentionMenuStyle.value = {
    position: 'fixed',
    top: `${Math.max(8, top)}px`,
    left: `${left}px`,
    maxHeight: `${maxH}px`,
    visibility: 'visible',
    zIndex: '10050',
  }
}

function syncMentionFromProps(props: RteMentionRenderProps) {
  mentionItems.value = props.items
  mentionQuery.value = props.query
  mentionCommand = props.command
  mentionClientRectFn = props.clientRect ?? null
  if (mentionIndex.value >= props.items.length) {
    mentionIndex.value = Math.max(0, props.items.length - 1)
  }
}

function closeMentionMenu() {
  mentionOpen.value = false
  mentionItems.value = []
  mentionIndex.value = 0
  mentionQuery.value = ''
  mentionCommand = null
  mentionClientRectFn = null
  mentionMenuStyle.value = {
    ...mentionMenuStyle.value,
    visibility: 'hidden',
  }
}

const mentionUi: RteMentionUiHandlers = {
  onStart(props) {
    mentionOpen.value = true
    mentionIndex.value = 0
    syncMentionFromProps(props)
    nextTick(() => placeMentionMenuFromRect(mentionClientRectFn?.() ?? null))
  },
  onUpdate(props) {
    if (!mentionOpen.value) mentionOpen.value = true
    syncMentionFromProps(props)
    nextTick(() => placeMentionMenuFromRect(mentionClientRectFn?.() ?? null))
  },
  onExit() {
    closeMentionMenu()
  },
  onKeyDown({ event }) {
    if (!mentionOpen.value) return false
    const mentionNext = stepMenuIndex(mentionIndex.value, mentionItems.value.length, event.key)
    if (
      mentionNext != null ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp'
    ) {
      event.preventDefault()
      if (mentionNext != null) mentionIndex.value = mentionNext
      nextTick(() => {
        const active = mentionMenuEl.value?.querySelector?.('.rte-mention-item.is-active') as HTMLElement | null
        active?.scrollIntoView?.({ block: 'nearest' })
      })
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = mentionItems.value[mentionIndex.value]
      if (item && mentionCommand) mentionCommand(item)
      return true
    }
    if (event.key === 'Escape') {
      const ed = deps.editor().value
      if (ed) {
        try {
          exitSuggestion(ed.view, mentionPluginKey)
        } catch {
          closeMentionMenu()
        }
      } else {
        closeMentionMenu()
      }
      return true
    }
    return false
  },
}

function pickMentionItem(item: RteMentionItem) {
  if (mentionCommand) mentionCommand(item)
}

function repositionMentionMenu() {
  if (!mentionOpen.value) return
  placeMentionMenuFromRect(mentionClientRectFn?.() ?? null)
}



  onMounted(() => {
    window.addEventListener('resize', repositionMentionMenu)
    window.addEventListener('scroll', repositionMentionMenu, true)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', repositionMentionMenu)
    window.removeEventListener('scroll', repositionMentionMenu, true)
  })

  return {
    mentionOpen,
    mentionItems,
    mentionIndex,
    mentionQuery,
    mentionMenuStyle,
    mentionCommand,
    mentionClientRectFn,
    mentionMenuEl,
    placeMentionMenuFromRect,
    syncMentionFromProps,
    closeMentionMenu,
    mentionUi,
    pickMentionItem,
    repositionMentionMenu,
  }
}
