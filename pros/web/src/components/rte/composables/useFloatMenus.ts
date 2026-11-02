import { nextTick, onBeforeUnmount, onMounted, type Directive } from 'vue'

/** 工具条浮层定位与点击外部关闭。pointerdown 监听在本组合式内成对注册。 */
export function useFloatMenus(deps: {
  headingOpen: () => { value: boolean }
  listOpen: () => { value: boolean }
  formOpen: () => { value: boolean }
  templateOpen: () => { value: boolean }
  alignOpen: () => { value: boolean }
  tableMenuOpen: () => { value: boolean }
  importMenuOpen: () => { value: boolean }
  exportMenuOpen: () => { value: boolean }
  pasteFormatOpen: () => { value: boolean }
  bookmarkPanelOpen: () => { value: boolean }
  caseMenuOpen: () => { value: boolean }
  zoomMenuOpen: () => { value: boolean }
  viewExtrasOpen: () => { value: boolean }
  emojiOpen: () => { value: boolean }
  specialCharsOpen: () => { value: boolean }
  columnsOpen: () => { value: boolean }
  spacingOpen: () => { value: boolean }
  wordStatsOpen: () => { value: boolean }
  shortcutsOpen: () => { value: boolean }
  calloutOpen: () => { value: boolean }
  moreCalloutOpen: () => { value: boolean }
  hrOpen: () => { value: boolean }
  blockOpsOpen: () => { value: boolean }
  insertDateOpen: () => { value: boolean }
  codeLangOpen: () => { value: boolean }
  closeFontMenus: () => void
  closeColorMenus: () => void
  closeHighlightMenus: () => void
  closeMore: () => void
}) {
/** tool-wrap @mouseleave：仅当指针真正离开按钮+菜单时才关（避免点选项前被关掉） */
/** 工具条下拉：fixed + Teleport 到 body，按按钮 rect 自动翻转/夹紧 */
const FLOAT_VIEW_PAD = 8
const FLOAT_GAP = 2
const floatAnchors = new Map<string, HTMLElement>()
const menuCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const floatMenuEls = new Map<string, HTMLElement>()
/** 打开瞬间抑制 mouseleave / document pointerdown 误关 */
let ignoreDocMenuCloseUntil = 0
function markToolbarMenuOpening() {
  ignoreDocMenuCloseUntil = Date.now() + 500
  // 取消所有待关闭定时器
  for (const [k, t] of menuCloseTimers) {
    clearTimeout(t)
    menuCloseTimers.delete(k)
  }
}

function setFloatAnchor(key: string, el: unknown) {
  if (el && el instanceof HTMLElement) floatAnchors.set(key, el)
  else floatAnchors.delete(key)
}

function cancelMenuClose(key: string) {
  const t = menuCloseTimers.get(key)
  if (t != null) {
    clearTimeout(t)
    menuCloseTimers.delete(key)
  }
}

function scheduleMenuClose(key: string, close: () => void) {
  cancelMenuClose(key)
  menuCloseTimers.set(
    key,
    setTimeout(() => {
      menuCloseTimers.delete(key)
      close()
    }, 200),
  )
}

function onToolMenuEnter(key: string) {
  cancelMenuClose(key)
}

function onToolMenuLeave(
  event: MouseEvent,
  key: string,
  close: () => void,
) {
  // Teleport 挂载/重排时浏览器常对 wrap 甩一次 relatedTarget=null 的 mouseleave
  if (Date.now() < ignoreDocMenuCloseUntil) return
  const wrap = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (wrap && next && wrap.contains(next)) return
  const menu = floatMenuEls.get(key) || document.querySelector(`[data-rte-float-key="${key}"]`)
  if (menu && next && menu.contains(next)) return
  // 指针仍在菜单上（elementFromPoint）也不关
  if (typeof document !== 'undefined' && document.elementFromPoint) {
    const x = (event as MouseEvent).clientX
    const y = (event as MouseEvent).clientY
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const under = document.elementFromPoint(x, y)
      if (under && (under.closest?.(`[data-rte-float-key="${key}"]`) || under.closest?.('.rte-float-menu'))) {
        return
      }
    }
  }
  scheduleMenuClose(key, close)
}

function setFloatStyle(
  el: HTMLElement,
  prop: string,
  value: string,
) {
  // 必须 important：若 CSS 带 !important，普通 inline 会被盖掉，菜单落在 body 流末尾
  el.style.setProperty(prop, value, 'important')
}

function placeFloatMenuEl(menuEl: HTMLElement, key: string) {
  let anchor = floatAnchors.get(key)
  if (!anchor || !anchor.isConnected) {
    const found = document.querySelector(`[data-rte-anchor="${key}"]`)
    if (found instanceof HTMLElement) {
      anchor = found
      floatAnchors.set(key, found)
    }
  }
  // 非最大化从「更多」打开时，emoji/特殊字符/段距/字数按钮不在顶栏：回退锚到「更多」
  if (
    (!anchor || !anchor.isConnected) &&
    (key === 'emoji' || key === 'specialChars' || key === 'spacing' || key === 'wordStats')
  ) {
    const more =
      floatAnchors.get('more') ||
      (document.querySelector('[data-rte-anchor="more"]') as HTMLElement | null)
    if (more instanceof HTMLElement) {
      anchor = more
      floatAnchors.set(key, more)
    }
  }
  if (!anchor || !menuEl.isConnected) {
    menuEl.style.setProperty('visibility', 'visible', 'important')
    return
  }

  const rect = anchor.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  setFloatStyle(menuEl, 'position', 'fixed')
  setFloatStyle(menuEl, 'right', 'auto')
  setFloatStyle(menuEl, 'bottom', 'auto')
  setFloatStyle(menuEl, 'margin', '0')
  setFloatStyle(menuEl, 'z-index', '5200')
  // 先放到视口内可测，避免 top/left:auto 落在文档流末尾
  setFloatStyle(menuEl, 'left', '0px')
  setFloatStyle(menuEl, 'top', '0px')
  setFloatStyle(menuEl, 'max-height', 'none')
  menuEl.style.width = ''
  setFloatStyle(menuEl, 'visibility', 'hidden')

  const mw = Math.max(menuEl.offsetWidth, 1)
  const mh = Math.max(menuEl.offsetHeight, 1)
  const spaceBelow = vh - rect.bottom - FLOAT_VIEW_PAD
  const spaceAbove = rect.top - FLOAT_VIEW_PAD
  const preferBelow =
    spaceBelow >= Math.min(mh, 220) || spaceBelow >= spaceAbove

  let maxH: number
  let top: number
  if (preferBelow) {
    maxH = Math.max(120, spaceBelow - FLOAT_GAP)
    top = rect.bottom - FLOAT_GAP
  } else {
    maxH = Math.max(120, spaceAbove - FLOAT_GAP)
    const usedH = Math.min(mh, maxH)
    top = rect.top + FLOAT_GAP - usedH
  }

  const preferEnd =
    key === 'import' || key === 'export' || key === 'table' || key === 'more' || key.startsWith('more-')
  let left = preferEnd ? rect.right - mw : rect.left
  const maxW = Math.max(160, vw - FLOAT_VIEW_PAD * 2)
  if (mw > maxW) {
    menuEl.style.width = `${Math.floor(maxW)}px`
    left = FLOAT_VIEW_PAD
  } else {
    if (left + mw > vw - FLOAT_VIEW_PAD) left = vw - FLOAT_VIEW_PAD - mw
    if (left < FLOAT_VIEW_PAD) left = FLOAT_VIEW_PAD
  }

  if (top < FLOAT_VIEW_PAD) top = FLOAT_VIEW_PAD
  if (top + Math.min(mh, maxH) > vh - FLOAT_VIEW_PAD) {
    top = Math.max(FLOAT_VIEW_PAD, vh - FLOAT_VIEW_PAD - Math.min(mh, maxH))
  }

  setFloatStyle(menuEl, 'left', `${Math.round(left)}px`)
  setFloatStyle(menuEl, 'top', `${Math.round(top)}px`)
  setFloatStyle(menuEl, 'max-height', `${Math.round(maxH)}px`)
  setFloatStyle(menuEl, 'visibility', 'visible')
  menuEl.style.setProperty('--rte-float-max-h', `${Math.round(maxH)}px`)
  if (menuEl.classList.contains('rte-template-menu')) {
    setFloatStyle(menuEl, 'overflow', 'hidden')
  } else {
    setFloatStyle(menuEl, 'overflow-x', 'hidden')
    setFloatStyle(menuEl, 'overflow-y', 'auto')
  }
}

type FloatMenuEl = HTMLElement & { __rteFloatCleanup?: () => void }

const vRteFloat: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const key = String(binding.value || '')
    if (!key) return
    const node = el as FloatMenuEl
    node.classList.add('rte-float-menu')
    node.dataset.rteFloatKey = key
    floatMenuEls.set(key, node)
    markToolbarMenuOpening()
    let tries = 0
    const place = () => {
      placeFloatMenuEl(node, key)
      // 回调 ref 有时晚于 Teleport mount：短重试
      if (!floatAnchors.get(key) && tries < 10) {
        tries += 1
        requestAnimationFrame(place)
      }
    }
    nextTick(() => {
      place()
      requestAnimationFrame(place)
    })
    const ro = new ResizeObserver(() => placeFloatMenuEl(node, key))
    ro.observe(node)
    const onWin = () => placeFloatMenuEl(node, key)
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    node.__rteFloatCleanup = () => {
      ro.disconnect()
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      if (floatMenuEls.get(key) === node) floatMenuEls.delete(key)
    }
  },
  updated(el, binding) {
    const key = String(binding.value || '')
    if (!key) return
    floatMenuEls.set(key, el)
    nextTick(() => placeFloatMenuEl(el, key))
  },
  unmounted(el) {
    const node = el as FloatMenuEl
    const key = node.dataset.rteFloatKey
    node.__rteFloatCleanup?.()
    delete node.__rteFloatCleanup
    if (key && floatMenuEls.get(key) === node) floatMenuEls.delete(key)
  },
}

function closeAllToolbarMenus() {
  deps.headingOpen().value = false
  deps.listOpen().value = false
  deps.formOpen().value = false
  deps.templateOpen().value = false
  deps.alignOpen().value = false
  deps.tableMenuOpen().value = false
  deps.importMenuOpen().value = false
  deps.exportMenuOpen().value = false
  deps.pasteFormatOpen().value = false
  deps.bookmarkPanelOpen().value = false
  deps.caseMenuOpen().value = false
  deps.zoomMenuOpen().value = false
  deps.viewExtrasOpen().value = false
  deps.emojiOpen().value = false
  deps.specialCharsOpen().value = false
  deps.columnsOpen().value = false
  deps.spacingOpen().value = false
  deps.wordStatsOpen().value = false
  deps.shortcutsOpen().value = false
  deps.calloutOpen().value = false
  deps.moreCalloutOpen().value = false
  deps.hrOpen().value = false
  deps.blockOpsOpen().value = false
  deps.insertDateOpen().value = false
  deps.codeLangOpen().value = false
  // outline 侧栏独立，不随工具条菜单一并关闭
  deps.closeFontMenus()
  deps.closeColorMenus()
  deps.closeHighlightMenus()
  deps.closeMore()
}

function onDocPointerDownForMenus(e: PointerEvent) {
  if (Date.now() < ignoreDocMenuCloseUntil) return
  const t = e.target as HTMLElement | null
  if (!t) return
  if (
    t.closest(
      '.rte-tool-wrap, .rte-tool, .rte-float-menu, .rte-more-menu, .rte-more-flyout, .rte-emoji-panel, .rte-specialchars-panel, .rte-spacing-panel, .rte-wordstats-panel, .rte-shortcuts-panel, .rte-callout-menu, .rte-outline-panel, .rte-slash-menu, .rte-mention-menu, .el-overlay, .el-dialog, .el-message-box, .rte-table-dialog, .rte-attach-dialog',
    )
  ) {
    return
  }
  closeAllToolbarMenus()
}


  onMounted(() => {
    document.addEventListener('pointerdown', onDocPointerDownForMenus, true)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDownForMenus, true)
    for (const t of menuCloseTimers.values()) clearTimeout(t)
    menuCloseTimers.clear()
    floatMenuEls.clear()
    floatAnchors.clear()
  })

  return {
    FLOAT_VIEW_PAD,
    FLOAT_GAP,
    floatAnchors,
    menuCloseTimers,
    floatMenuEls,
    ignoreDocMenuCloseUntil,
    markToolbarMenuOpening,
    setFloatAnchor,
    cancelMenuClose,
    scheduleMenuClose,
    onToolMenuEnter,
    onToolMenuLeave,
    setFloatStyle,
    placeFloatMenuEl,
    vRteFloat,
    closeAllToolbarMenus,
    onDocPointerDownForMenus,
  }
}
