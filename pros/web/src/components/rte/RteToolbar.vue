<script setup lang="ts">
import { inject, nextTick, onMounted, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { alignToolTitle, blockMenuTitle, clampToolbarQuery, codeLangTitle, cycleSearchIndex, disabledToolTitle, EMPTY_GROUP_NOTE, FOCUS_MODE_NOTE, fontFamilyCaption, groupHandleTitle, LAST_TOOLBAR_QUERY_KEY, lineHeightCaption, listToolLabel, menuFocusStep, menuToolNeedsCaret, pageSizeTitle, pickerTabTitle, moreToolsCaption, moreToolsTitle, ribbonSearchLabel, ribbonTabForDigit, ribbonTabHint, ribbonTabTabIndex, ribbonTypeaheadQuery, SEARCH_INPUT_HINT, searchEnterActivates, searchGroupCaption, shortcutFromTitle, stepRibbonTab, stepRibbonTabBy, tableToolLabel, toolbarGroupReorderAllowed, toolbarMenuItemTitle, toolbarSearchStatus, toolIsUnavailable, wordStatTitle, zoomToolLabel, zoomToolTitle } from '../../utils/rteToolbarOptimize'
import { useParentScopeStamp } from './inheritScope'
import { buildChartGroups } from '../../utils/echarts/chartGroups'
import { TABLE_MENU_ICONS } from './tableMenuIcons'
import { TABLE_MENU_GROUPS, placeMenuFlyout } from './tableMenuGroups'
import RteMenuGlyph from './RteMenuGlyph.vue'
import RteColorBoard from './RteColorBoard.vue'
import RteSpacingFields from './RteSpacingFields.vue'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteToolbar 必须放在 RichTextEditor 里')
const tableMenuGroup = ref('')
const lastToolbarQuery = ref('')
const tableMenuFlyout = ref({ top: 0, left: 0 })
function openTableMenuGroup(id: string, event: MouseEvent) {
  tableMenuGroup.value = id
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  tableMenuFlyout.value = placeMenuFlyout(el)
}
function tableMenuOps(keys: readonly string[]) {
  const items = rte.tableOpItems as Array<{
    key: string
    label: string
    title?: string
    run: () => void
    insertCount?: boolean
    danger?: boolean
    disabled?: () => boolean
    sepBefore?: boolean
    active?: () => boolean
  }>
  return keys.map((key) => items.find((op) => op.key === key)).filter((op): op is NonNullable<typeof op> => !!op)
}
const rteBindings = rte
const vRteFloat = rteBindings.vRteFloat
useParentScopeStamp()

/**
 * 图表一级分类（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）。
 * 每个分类在工具栏上是独立的下拉按钮，下拉里只列该分类下的具体图表类型。
 */
const echartsGroups = buildChartGroups()
const chartGroupById = new Map(echartsGroups.map((item) => [item.group.id, item]))

/** 工具 key（chart:basic）→ 一级分类 id（basic）。 */
function chartGroupIdOfTool(key: string): string {
  return key.startsWith('chart:') ? key.slice('chart:'.length) : ''
}

/** 某个一级分类下的具体图表类型（类别 + 模板）。 */
function chartCategoriesOf(groupId: string) {
  return chartGroupById.get(groupId)?.categories || []
}

function onRibbonTab(id: string, event: MouseEvent) {
  clearToolbarQuery()
  rteBindings.setRibbonTab(id)
  const toolbar = (event.currentTarget as HTMLElement | null)?.closest('.rte-toolbar')
  toolbar?.querySelector(`[data-ribbon-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  toolbar?.querySelector(`[data-group-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function onRibbonTabsKeydown(event: KeyboardEvent) {
  const ids = (rteBindings.ribbonTabs || []).map((tab: { id: string }) => tab.id)
  if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault()
    clearToolbarQuery()
    rteBindings.setRibbonTab(stepRibbonTabBy(ids, rteBindings.ribbonTab, event.key === 'PageDown' ? 3 : -3))
    return
  }
  if (event.altKey && /^[1-9]$/.test(event.key)) {
    const picked = ribbonTabForDigit(ids, Number(event.key))
    if (!picked) return
    event.preventDefault()
    clearToolbarQuery()
    rteBindings.setRibbonTab(picked)
    return
  }
  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    const typed = ribbonTypeaheadQuery(event.key, rteBindings.toolbarQuery || '')
    if (typed != null) {
      event.preventDefault()
      rteBindings.toolbarQuery = typed
      const input = document.querySelector('.rte-toolbar-search input')
      if (input instanceof HTMLInputElement) input.focus()
      return
    }
  }
  const move = event.key === 'ArrowRight' ? 'next' : event.key === 'ArrowLeft' ? 'prev' : event.key === 'Home' ? 'home' : event.key === 'End' ? 'end' : ''
  if (!move) return
  const next = stepRibbonTab(ids, rteBindings.ribbonTab, move)
  event.preventDefault()
  rteBindings.setRibbonTab(next)
  const tabs = (event.currentTarget as HTMLElement | null)?.querySelector(`[data-ribbon-tab="${next}"]`)
  if (tabs instanceof HTMLElement) {
    tabs.focus()
    tabs.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

function toolbarSearchCount(): number {
  const groups = rteBindings.visibleToolbarGroups || []
  return groups.reduce((sum: number, group: { tools?: unknown[] }) => sum + (group.tools?.length || 0), 0)
}
function toolbarSearchMessage(): string {
  const groups = rteBindings.visibleToolbarGroups || []
  const bestTool = groups[0]?.tools?.[0]
  const best = bestTool?.label || ''
  const place = groups[0]?.label || ''
  return toolbarSearchStatus(
    rteBindings.toolbarQuery || '',
    toolbarSearchCount(),
    best,
    toolbarSearchCount() >= 24,
    place,
    toolIsUnavailable(bestTool),
  )
}
function ribbonHitCount(id: string): number {
  if (!rteBindings.toolbarQuery) return 0
  const group = (rteBindings.visibleToolbarGroups || []).find((item: { id: string; tools?: unknown[] }) => item.id === id)
  return group?.tools?.length || 0
}
function imageLayoutSelected(opt: { align: string; layout: string }): boolean {
  const attrs = rteBindings.editor?.getAttributes?.('image')
  return !!attrs && attrs.align === opt.align && attrs.layout === opt.layout
}
function currentAlignName(): string {
  if (rteBindings.isActive?.({ textAlign: 'center' })) return 'center'
  if (rteBindings.isActive?.({ textAlign: 'right' })) return 'right'
  if (rteBindings.isActive?.({ textAlign: 'justify' })) return 'justify'
  if (rteBindings.isActive?.({ textAlign: 'left' })) return 'left'
  return ''
}
function rememberToolbarQuery() {
  const query = clampToolbarQuery(String(rteBindings.toolbarQuery || '').trim())
  if (!query) return
  lastToolbarQuery.value = query
  try {
    sessionStorage.setItem(LAST_TOOLBAR_QUERY_KEY, query)
  } catch {
    /* 无存储时仍保留本次会话里的上次搜索 */
  }
}
function onToolbarQueryInput() {
  const next = clampToolbarQuery(String(rteBindings.toolbarQuery || ''))
  if (next !== rteBindings.toolbarQuery) rteBindings.toolbarQuery = next
  rememberToolbarQuery()
}
function clearToolbarQuery(focusInput = false) {
  rememberToolbarQuery()
  rteBindings.toolbarQuery = ''
  if (focusInput !== true) return
  void nextTick(() => {
    const input = document.querySelector('.rte-toolbar-search input')
    if (input instanceof HTMLInputElement) input.focus()
  })
}
function onGroupPointerDown(id: string, event: PointerEvent) {
  if (!toolbarGroupReorderAllowed(rteBindings.toolbarQuery || '')) return
  rteBindings.onToolbarHandlePointerDown(id, event)
}
function onGroupRestore(id: string) {
  if (!toolbarGroupReorderAllowed(rteBindings.toolbarQuery || '')) return
  rteBindings.restoreToolbarGroupButtons(id)
}
function onGroupContextMenu(id: string, event: MouseEvent) {
  if (!toolbarGroupReorderAllowed(rteBindings.toolbarQuery || '')) return
  rteBindings.onToolbarGroupContextMenu(id, event)
}
function moreMenuButtons(): HTMLElement[] {
  const root = document.querySelector('.rte-more-menu')
  if (!root) return []
  return [...root.querySelectorAll('button')].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('disabled'))
}
function onMoreMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    rteBindings.closeMore()
    const opener = document.querySelector('[data-rte-anchor="more"]')
    if (opener instanceof HTMLElement) opener.focus()
    return
  }
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return
  const buttons = moreMenuButtons()
  const current = target instanceof HTMLElement ? target.closest('button') : null
  const index = current instanceof HTMLElement ? buttons.indexOf(current) : -1
  const next = menuFocusStep(index, buttons.length, event.key)
  if (next == null) return
  event.preventDefault()
  buttons[next]?.focus()
}
function onMoreButtonKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && rteBindings.moreOpen) {
    event.preventDefault()
    rteBindings.closeMore()
    return
  }
  if (event.key !== 'ArrowDown') return
  event.preventDefault()
  if (!rteBindings.moreOpen) {
    rteBindings.markToolbarMenuOpening()
    rteBindings.moreOpen = true
    return
  }
  moreMenuButtons()[0]?.focus()
}
function onToolbarSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    clearToolbarQuery()
    return
  }
  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusFirstMatchedTool()
    return
  }
  if (event.altKey && event.key === 'ArrowUp' && !String(rteBindings.toolbarQuery || '').trim() && lastToolbarQuery.value) {
    event.preventDefault()
    rteBindings.toolbarQuery = lastToolbarQuery.value
  }
}
function focusFirstMatchedTool() {
  const best = rteBindings.visibleToolbarGroups?.[0]?.tools?.[0]
  const button = document.querySelector('[data-search-best] button.rte-tool:not([disabled])')
    || document.querySelector('.rte-toolbar-tools button.rte-tool:not([disabled])')
  if (!(button instanceof HTMLElement)) return
  if (searchEnterActivates(toolbarSearchCount(), toolIsUnavailable(best))) {
    button.click()
    clearToolbarQuery()
    return
  }
  button.focus()
}
function onMatchedToolKeydown(event: KeyboardEvent) {
  if (!String(rteBindings.toolbarQuery || '').trim()) return
  if (event.altKey || event.metaKey || event.ctrlKey) return
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('input, textarea, [contenteditable="true"]')) return
  const current = target.closest('button.rte-tool')
  if (!(current instanceof HTMLElement) || current.hasAttribute('disabled')) return
  const buttons = [...document.querySelectorAll('.rte-toolbar-tools button.rte-tool:not([disabled])')].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  )
  const index = buttons.indexOf(current)
  if (index < 0) return
  event.preventDefault()
  buttons[cycleSearchIndex(index, buttons.length, event.key === 'ArrowRight' ? 1 : -1)]?.focus()
}
onMounted(() => {
  const tab = document.querySelector(`[data-ribbon-tab="${rteBindings.ribbonTab}"]`)
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  try {
    const saved = sessionStorage.getItem(LAST_TOOLBAR_QUERY_KEY)
    if (saved) lastToolbarQuery.value = clampToolbarQuery(saved)
  } catch {
    /* 读不到上次搜索时，Alt+上 只在本次会话里生效 */
  }
})
watch(() => rteBindings.moreOpen, (open) => {
  if (!open) return
  void nextTick(() => moreMenuButtons()[0]?.focus())
})
watch(() => rteBindings.toolbarQuery, () => {
  requestAnimationFrame(() => {
    document.querySelector('[data-search-best]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})

function toggleChartGroupMenu(key: string) {
  const wasOpen = rteBindings.echartsGroupMenuKey === key
  rteBindings.echartsGroupMenuKey = wasOpen ? null : key
  if (!wasOpen && rteBindings.echartsOpenCategory !== undefined) {
    rteBindings.echartsOpenCategory = null
  }
}
</script>

<template>
    <div data-rte-own
      class="rte-toolbar"
      :class="{ 'is-one-row': rte.expanded && !rte.toolbarRowsOpen }"
      role="toolbar"
      aria-label="编辑工具栏"
    >
      <div data-rte-own class="rte-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ rte.rteAriaStatus }}
      </div>
      <div data-rte-own v-if="rte.expanded" class="rte-ribbon-bar">
        <div data-rte-own class="rte-ribbon-tabs" role="tablist" aria-label="功能区，左右方向键切换栏目" @keydown="onRibbonTabsKeydown">
          <button data-rte-own
            v-for="tab in rte.ribbonTabs"
            :key="'ribbon-' + tab.id"
            type="button"
            role="tab"
            class="rte-ribbon-tab"
            :data-ribbon-tab="tab.id"
            :class="{ active: rte.ribbonTab === tab.id, 'is-search-miss': !!rte.toolbarQuery && !ribbonHitCount(tab.id), 'is-search-best': !!rte.toolbarQuery && rte.visibleToolbarGroups[0]?.id === tab.id }"
            :aria-selected="rte.ribbonTab === tab.id"
            :tabindex="ribbonTabTabIndex(rte.ribbonTab === tab.id)"
            :title="ribbonTabHint(tab.id, tab.label)"
            :aria-label="ribbonSearchLabel(tab.label, ribbonHitCount(tab.id))"
            :aria-keyshortcuts="ribbonTabForDigit((rte.ribbonTabs || []).map((item) => item.id), (rte.ribbonTabs || []).findIndex((item) => item.id === tab.id) + 1) ? 'Alt+' + ((rte.ribbonTabs || []).findIndex((item) => item.id === tab.id) + 1) : undefined"
            :aria-controls="'rte-group-' + tab.id"
            @click="onRibbonTab(tab.id, $event)"
          >
            {{ tab.label }}
            <span v-if="ribbonHitCount(tab.id)" data-rte-own class="rte-ribbon-hit">{{ ribbonHitCount(tab.id) }}</span>
          </button>
        </div>
        <label v-if="rte.viewMode === 'edit' && !rte.focusMode" data-rte-own class="rte-toolbar-search">
          <input
            data-rte-own
            v-model="rte.toolbarQuery"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="找按钮，如拼音、饼图"
            aria-label="在工具栏里找按钮"
            :title="SEARCH_INPUT_HINT"
            maxlength="32"
            :aria-describedby="rte.toolbarQuery ? 'rte-toolbar-search-status' : undefined"
            @focus="($event.target as HTMLInputElement).select()"
            @input="onToolbarQueryInput"
            @keydown="onToolbarSearchKeydown"
          />
          <button data-rte-own v-if="rte.toolbarQuery" type="button" class="rte-toolbar-search-clear" title="清除搜索 (Esc)" aria-label="清除搜索 (Esc)" @click="clearToolbarQuery(true)">×</button>
        </label>
        <span v-if="rte.focusMode && rte.viewMode === 'edit'" data-rte-own class="rte-toolbar-mode-note">{{ FOCUS_MODE_NOTE }}</span>
        <span v-if="rte.viewMode !== 'edit'" data-rte-own class="rte-toolbar-mode-note">
          {{ rte.viewMode === 'preview' ? '预览中，编辑工具已收起' : '源码中，编辑工具已收起' }}
        </span>
        <div data-rte-own class="rte-mode-bar">
          <button data-rte-own
            v-for="opt in rte.VIEW_MODE_OPTIONS"
            :key="'vm-' + opt.id"
            type="button"
            role="tab"
            class="rte-tool rte-view-mode-tool"
            :class="{ active: rte.viewMode === opt.id }"
            :title="opt.title"
            :aria-selected="rte.viewMode === opt.id"
            @click="rte.setViewMode(opt.id)"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">{{
              opt.icon
            }}</span>
            <span data-rte-own class="rte-tool-label">{{ opt.label }}</span>
          </button>
          <button data-rte-own
            v-if="rte.viewMode === 'source' && rte.sourceDirty"
            type="button"
            class="rte-tool rte-view-mode-tool rte-view-mode-apply"
            title="把改过的源码写回文档"
            @click="rte.applySourceNow"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">↑</span>
            <span data-rte-own class="rte-tool-label">应用</span>
          </button>
          <button data-rte-own
            type="button"
            class="rte-tool rte-view-mode-tool rte-toolbar-fold"
            :aria-expanded="rte.toolbarRowsOpen"
            :title="rte.toolbarRowsOpen ? '收起工具栏面板' : '展开工具栏。收起时放不下的分组在下一行，点此全部显示'"
            @click="rte.toggleToolbarRows()"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">{{
              rte.toolbarRowsOpen ? '▴' : '▾'
            }}</span>
            <span data-rte-own class="rte-tool-label">{{ rte.toolbarRowsOpen ? '收起' : '展开' }}</span>
          </button>
        </div>
      </div>
      <label v-if="!rte.expanded && rte.viewMode === 'edit' && !rte.focusMode" data-rte-own class="rte-toolbar-search">
        <input
          data-rte-own
          v-model="rte.toolbarQuery"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="找按钮，如拼音、饼图"
          aria-label="在工具栏里找按钮"
          :title="SEARCH_INPUT_HINT"
          maxlength="32"
          :aria-describedby="rte.toolbarQuery ? 'rte-toolbar-search-status' : undefined"
          @focus="($event.target as HTMLInputElement).select()"
          @input="onToolbarQueryInput"
          @keydown="onToolbarSearchKeydown"
        />
        <button data-rte-own v-if="rte.toolbarQuery" type="button" class="rte-toolbar-search-clear" title="清除搜索 (Esc)" aria-label="清除搜索 (Esc)" @click="clearToolbarQuery(true)">×</button>
      </label>
      <span data-rte-own class="rte-sr-only" role="status">{{ toolbarSearchMessage() }}</span>
      <p v-if="toolbarSearchMessage() && !toolbarSearchCount()" id="rte-toolbar-search-status" data-rte-own class="rte-toolbar-search-jump is-empty">{{ toolbarSearchMessage() }}</p>
      <button v-else-if="toolbarSearchMessage()" id="rte-toolbar-search-status" data-rte-own type="button" class="rte-toolbar-search-jump" :title="SEARCH_INPUT_HINT" @click="focusFirstMatchedTool">{{ toolbarSearchMessage() }}</button>
      <div data-rte-own
        class="rte-toolbar-tools"
        :class="{
          'is-drop-end':
            rte.toolbarDropIndex != null &&
            rte.visibleToolbarGroups.length > 0 &&
            rte.toolbarDropIndex === rte.toolbarOrder.indexOf(rte.visibleToolbarGroups[rte.visibleToolbarGroups.length - 1].id) + 1,
        }"
        @dragover.prevent="rte.onToolbarGroupDragOver"
        @drop.prevent="rte.onToolbarGroupDrop"
        @keydown="onMatchedToolKeydown"
      >
      <div data-rte-own
        v-for="(group, groupIndex) in rte.visibleToolbarGroups"
        :key="group.id"
        class="rte-tool-group"
        :data-search-best="rte.toolbarQuery && groupIndex === 0 ? '1' : undefined"
        :title="rte.toolbarQuery ? '正在搜索，先清除搜索再调整分组' : '右键可设置组内按钮的显隐与顺序'"
        :class="{
          'is-drop-target': rte.toolbarDropIndex === rte.toolbarOrder.indexOf(group.id),
          'is-dragging': rte.toolbarDragSource === group.id,
          'is-search-group': !!rte.toolbarQuery,
        }"
        :id="'rte-group-' + group.id"
        :data-group-id="group.id"
        @contextmenu.prevent="onGroupContextMenu(group.id, $event)"
      >
        <span data-rte-own class="rte-group-head">
          <button data-rte-own
            v-if="rte.viewMode === 'edit' && !rte.toolbarQuery"
            type="button"
            class="rte-group-handle"
            draggable="false"
            :aria-label="'拖动' + group.label + '分组'"
            :title="groupHandleTitle(group.label, group.tools.length)"
            @pointerdown="onGroupPointerDown(group.id, $event)"
            @pointermove="rte.onToolbarHandlePointerMove"
            @pointerup="rte.onToolbarHandlePointerUp"
            @pointercancel="rte.onToolbarHandlePointerUp"
            @keydown="rte.onToolbarGroupKeydown(group.id, $event)"
          >
            ⠿
          </button>
          <span data-rte-own
            class="rte-group-label"
            @pointerdown="onGroupPointerDown(group.id, $event)"
            @pointermove="rte.onToolbarHandlePointerMove"
            @pointerup="rte.onToolbarHandlePointerUp"
            @pointercancel="rte.onToolbarHandlePointerUp"
            :title="rte.toolbarQuery ? '正在搜索，先清除搜索再调整分组' : '双击恢复本组按钮的默认显隐和顺序'"
            @dblclick.stop="onGroupRestore(group.id)"
          >{{ searchGroupCaption(group.label, group.tools.length, !!rte.toolbarQuery) }}</span>
          <p v-if="group.hiddenAll" data-rte-own class="rte-group-empty">{{ EMPTY_GROUP_NOTE }}</p>
          <button data-rte-own
            v-if="rte.viewMode === 'edit' && !rte.toolbarQuery"
            type="button"
            class="rte-group-settings"
            :aria-label="group.label + '的个性化设置'"
            :title="group.label + '的按钮：显示、隐藏、排序。当前 ' + group.tools.length + ' 个。双击组名恢复默认'"
            @click.stop="rte.onToolbarGroupContextMenu(group.id, $event)"
          >
            ⚙
          </button>
        </span>
      <template v-for="t in group.tools" :key="t.key">
        <div data-rte-own
          v-if="t.kind === 'heading'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('heading')"
          @mouseleave="rte.onToolMenuLeave($event, 'heading', () => (rte.headingOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => rte.setFloatAnchor('heading', el)"
            data-rte-anchor="heading"
            :class="{ active: rte.headingOpen || rte.currentParaStyleLabel !== '正文' }"
            :title="'段落样式：' + rte.currentParaStyleLabel"
            aria-label="段落样式"
            :aria-expanded="rte.headingOpen"
            aria-haspopup="menu"
            @click.stop="rte.openHeadingMenu()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('heading')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ rte.currentParaStyleLabel }}<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.headingOpen"
              class="rte-menu rte-para-menu"
              v-rte-float="'heading'"
              role="menu"
              aria-label="段落样式"
              @mousedown.prevent
              @keydown="rte.onHeadingMenuKeydown"
              @mouseenter="rte.onToolMenuEnter('heading')"
              @mouseleave="rte.onToolMenuLeave($event, 'heading', () => (rte.headingOpen = false))"
            >
              <template v-for="it in rte.BLOCK_MENU" :key="it.id">
                <div data-rte-own v-if="it.splitBefore" class="rte-menu-sep" aria-hidden="true"></div>
                <div data-rte-own
                  class="rte-para-row"
                  :class="{ 'is-sub-left': rte.blockSubmenuFlip }"
                  @mouseenter="rte.onBlockMenuEnter(it.id)"
                >
                  <button data-rte-own
                    type="button"
                    role="menuitemradio"
                    :data-para-style="it.id"
                    :aria-checked="rte.isBlockMenuActive(it.id)"
                    :aria-haspopup="it.children ? 'menu' : undefined"
                    :aria-expanded="it.children ? rte.blockSubmenuId === it.id : undefined"
                    :class="{
                      active: rte.isBlockMenuActive(it.id),
                      'has-sub': !!it.children,
                    }"
                    :title="blockMenuTitle(it.id) || undefined"
                    @click="rte.applyBlockMenu(it.id)"
                  >
                    <span data-rte-own class="rte-para-mark">{{ it.mark }}</span>
                    <span data-rte-own class="rte-para-preview">{{ it.label }}</span>
                    <span data-rte-own v-if="it.children" class="rte-more-caret" aria-hidden="true">›</span>
                  </button>
                  <div data-rte-own
                    v-if="it.children && rte.blockSubmenuId === it.id"
                    class="rte-para-submenu"
                    role="menu"
                    @mousedown.prevent
                  >
                    <button data-rte-own
                      v-for="child in it.children"
                      :key="child.id"
                      type="button"
                      role="menuitemradio"
                      :data-para-style="child.id"
                      :aria-checked="rte.isBlockMenuActive(child.id)"
                      :class="{ active: rte.isBlockMenuActive(child.id) }"
                      :title="blockMenuTitle(child.id) || undefined"
                      @mouseenter="rte.onBlockMenuEnter(child.id)"
                      @click="rte.applyBlockMenu(child.id)"
                    >
                      <span data-rte-own class="rte-para-mark">{{ child.mark }}</span>
                      <span data-rte-own class="rte-para-preview">{{ child.label }}</span>
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'list'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('list')"
          @mouseleave="rte.onToolMenuLeave($event, 'list', () => (rte.listOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('list', el)" data-rte-anchor="list"
            :class="{
              active:
                rte.isActive('bulletList') ||
                rte.isActive('orderedList') ||
                rte.isActive('taskList'),
            }"
            :title="rte.isActive('taskList') ? '任务列表' : rte.isActive('orderedList') ? '有序列表' : rte.isActive('bulletList') ? '无序列表' : '无序、有序或任务列表'"
            :aria-label="rte.isActive('taskList') ? '任务列表' : rte.isActive('orderedList') ? '有序列表' : rte.isActive('bulletList') ? '无序列表' : '列表'"
            aria-haspopup="menu"
            :aria-expanded="rte.listOpen"
            :aria-pressed="rte.isActive('bulletList') || rte.isActive('orderedList') || rte.isActive('taskList')"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.headingOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.listOpen = !rte.listOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="rte.isActive('taskList') ? rte.toolIcon('listTask') : rte.isActive('orderedList') ? rte.toolIcon('listOrdered') : rte.toolIcon('list')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ listToolLabel(rte.isActive('taskList') ? 'task' : rte.isActive('orderedList') ? 'ordered' : rte.isActive('bulletList') ? 'bullet' : '') }}<span data-rte-own class="rte-caret" aria-hidden="true"></span>
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.listOpen"
              class="rte-menu"
              v-rte-float="'list'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('list')"
              @mouseleave="rte.onToolMenuLeave($event, 'list', () => (rte.listOpen = false))"
            >
              <button data-rte-own type="button" :class="{ active: rte.isActive('bulletList') }" :aria-pressed="rte.isActive('bulletList')" :title="toolbarMenuItemTitle('无序列表')" @click="rte.toggleBulletList(); rte.listOpen = false"><RteMenuGlyph label="无序列表" />无序列表</button>
              <button data-rte-own type="button" :class="{ active: rte.isActive('orderedList') }" :aria-pressed="rte.isActive('orderedList')" :title="toolbarMenuItemTitle('有序列表')" @click="rte.toggleOrderedList(); rte.listOpen = false"><RteMenuGlyph label="有序列表" />有序列表</button>
              <button data-rte-own type="button" :class="{ active: rte.isActive('taskList') }" :aria-pressed="rte.isActive('taskList')" :title="toolbarMenuItemTitle('任务列表')" @click="rte.toggleTaskList(); rte.listOpen = false"><RteMenuGlyph label="任务列表" />任务列表</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" title="接着上一个列表往下编号" @click="rte.continueOrderedNumbering()"><RteMenuGlyph label="续号" />续号</button>
              <button data-rte-own type="button" title="从 1 重新开始一个列表" @click="rte.restartOrderedNumbering()"><RteMenuGlyph label="新列表" />新列表</button>
              <button data-rte-own type="button" title="把这一项改成指定的起始编号" @click="rte.applyListStart()"><RteMenuGlyph label="修改编号值…" />修改编号值…</button>
              <button data-rte-own type="button" title="从这一项起重新计数" @click="rte.renumberListFromHere()"><RteMenuGlyph label="从此处重编号" />从此处重编号</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" :class="{ active: rte.currentOrderedListStyle() === 'decimal' }" :aria-pressed="rte.currentOrderedListStyle() === 'decimal'" :title="toolbarMenuItemTitle('数字 1. 2. 3.')" @click="rte.applyListStyle('decimal')"><RteMenuGlyph label="数字 1. 2. 3." />数字 1. 2. 3.</button>
              <button data-rte-own type="button" :class="{ active: rte.currentOrderedListStyle() === 'lower-alpha' }" :aria-pressed="rte.currentOrderedListStyle() === 'lower-alpha'" :title="toolbarMenuItemTitle('字母 a. b. c.')" @click="rte.applyListStyle('lower-alpha')"><RteMenuGlyph label="字母 a. b. c." />字母 a. b. c.</button>
              <button data-rte-own type="button" :class="{ active: rte.currentOrderedListStyle() === 'lower-roman' }" :aria-pressed="rte.currentOrderedListStyle() === 'lower-roman'" :title="toolbarMenuItemTitle('罗马 i. ii. iii.')" @click="rte.applyListStyle('lower-roman')"><RteMenuGlyph label="罗马 i. ii. iii." />罗马 i. ii. iii.</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <div data-rte-own v-if="rte.listDepthLabel" class="rte-menu-hint">{{ rte.listDepthLabel }}</div>
              <div data-rte-own class="rte-menu-hint">Tab / Shift+Tab 调整层级</div>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('增加缩进')" @click="rte.indentBlock(); rte.listOpen = false"><RteMenuGlyph label="增加缩进" />增加缩进</button>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('只缩进文字')" @click="rte.padListItem(1)"><RteMenuGlyph label="只缩进文字" />只缩进文字</button>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('只减少缩进')" @click="rte.padListItem(-1)"><RteMenuGlyph label="只减少缩进" />只减少缩进</button>
              <button data-rte-own type="button" :class="{ active: rte.taskOpenOnly }" :aria-pressed="rte.taskOpenOnly" @click="rte.toggleTaskOpenOnly()"><RteMenuGlyph :label="rte.taskOpenOnly ? '显示全部任务' : '只看未完成'" />{{ rte.taskOpenOnly ? '显示全部任务' : '只看未完成' }}</button>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('减少缩进')" @click="rte.outdentBlock(); rte.listOpen = false"><RteMenuGlyph label="减少缩进" />减少缩进</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'form'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('form')"
          @mouseleave="rte.onToolMenuLeave($event, 'form', () => (rte.formOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('form', el)" data-rte-anchor="form"
            :class="{
              active:
                rte.formOpen ||
                rte.isActive('formTextInput') ||
                rte.isActive('formRadioGroup') ||
                rte.isActive('formCheckboxGroup') ||
                rte.isActive('formSelect') ||
                rte.isActive('formTextarea') ||
                rte.isActive('formNumberInput') ||
                rte.isActive('formDateInput') ||
                rte.isActive('formSwitch'),
            }"
            :title="t.title || '表单'"
            aria-label="插入表单控件"
            aria-haspopup="menu"
            :aria-expanded="rte.formOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.headingOpen = false; rte.listOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.formOpen = !rte.formOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('form')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >表单<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.formOpen"
              class="rte-menu"
              v-rte-float="'form'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('form')"
              @mouseleave="rte.onToolMenuLeave($event, 'form', () => (rte.formOpen = false))"
            >
              <button data-rte-own type="button" title="插入一组只能选一个的选项" @click.stop="rte.insertFormRadio()"><RteMenuGlyph label="单选组" />单选组</button>
              <button data-rte-own type="button" title="插入一组可以多选的选项" @click.stop="rte.insertFormCheckbox()"><RteMenuGlyph label="多选组" />多选组</button>
              <button data-rte-own type="button" title="插入一行文字填写框" @click.stop="rte.insertFormText()"><RteMenuGlyph label="文本输入" />文本输入</button>
              <button data-rte-own type="button" title="插入可以写多行的填写框" @click.stop="rte.insertFormTextarea()"><RteMenuGlyph label="多行文本" />多行文本</button>
              <button data-rte-own type="button" title="插入只接受数字的填写框" @click.stop="rte.insertFormNumber()"><RteMenuGlyph label="数字输入" />数字输入</button>
              <button data-rte-own type="button" title="插入从列表里选一项的框" @click.stop="rte.insertFormSelect()"><RteMenuGlyph label="下拉选择" />下拉选择</button>
              <button data-rte-own type="button" title="插入选择日期的框" @click.stop="rte.insertFormDate()"><RteMenuGlyph label="日期" />日期</button>
              <button data-rte-own type="button" title="插入选择日期和时间的框" @click.stop="rte.insertFormDateTime()"><RteMenuGlyph label="日期时间" />日期时间</button>
              <button data-rte-own type="button" title="插入开或关的开关" @click.stop="rte.insertFormSwitch()"><RteMenuGlyph label="开关" />开关</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" title="再复制一个选中的表单字段" @click.stop="rte.duplicateSelectedForm()"><RteMenuGlyph label="复制当前字段" />复制当前字段</button>
              <button data-rte-own type="button" title="检查必填项有没有空着" @click.stop="rte.checkFormFields()"><RteMenuGlyph label="检查填写" />检查填写</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" title="打开表格尺寸对话框，自己填行数和列数" @click.stop="rte.formOpen = false; rte.openTableDialog()"><RteMenuGlyph label="表格" />表格</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'template'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('template')"
          @mouseleave="rte.onToolMenuLeave($event, 'template', () => (rte.templateOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('template', el)" data-rte-anchor="template"
            :class="{ active: rte.templateOpen }"
            :title="t.title || '插入模板'"
            aria-label="插入模板"
            aria-haspopup="menu"
            :aria-expanded="rte.templateOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.alignOpen = false; rte.templateOpen = !rte.templateOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('template')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >模板<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.templateOpen"
              class="rte-menu rte-template-menu"
              v-rte-float="'template'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('template')"
              @mouseleave="rte.onToolMenuLeave($event, 'template', () => (rte.templateOpen = false))"
            >
              <div data-rte-own class="rte-template-menu-body">
                <template v-for="g in rte.RTE_DOC_TEMPLATE_GROUPS" :key="g.id">
                  <div data-rte-own class="rte-menu-section-label">{{ g.label }}</div>
                  <div data-rte-own class="rte-template-grid">
                    <button data-rte-own
                      v-for="tpl in rte.RTE_DOC_TEMPLATES.filter((x: any) => x.group === g.id)"
                      :key="tpl.id"
                      type="button"
                      class="rte-template-item"
                      :title="tpl.description || tpl.label"
                      @click.stop="rte.insertDocTemplate(tpl.id)"
                    >
                      <RteMenuGlyph :id="tpl.id" :label="tpl.label" fallback="template" />
                      <span data-rte-own class="rte-template-item-label">{{ tpl.label }}</span>
                      <span data-rte-own v-if="tpl.description" class="rte-template-item-desc">{{
                        tpl.description
                      }}</span>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'highlight'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('highlight')"
          @mouseleave="rte.onToolMenuLeave($event, 'highlight', () => (rte.highlightOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('highlight', el)" data-rte-anchor="highlight"
            :class="{ active: rte.isActive('highlight') || rte.highlightOpen }"
            :title="t.title || '高亮颜色'"
            aria-label="高亮颜色"
            :aria-expanded="rte.highlightOpen"
            aria-haspopup="dialog"
            @click.stop="rte.markToolbarMenuOpening(); rte.toggleHighlightMenu()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('highlight')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">高亮</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.highlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu"
              role="dialog"
              aria-label="高亮颜色"
              v-rte-float="'highlight'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('highlight')"
              @mouseleave="rte.onToolMenuLeave($event, 'highlight', () => (rte.highlightOpen = false))"
            >
              <RteColorBoard data-rte-own kind="highlight" />
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'color'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('color')"
          @mouseleave="rte.onToolMenuLeave($event, 'color', rte.closeColorMenus)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('color', el)" data-rte-anchor="color"
            :class="{ active: rte.colorOpen }"
            :title="t.title || '文字颜色'"
            aria-label="文字颜色"
            :aria-expanded="rte.colorOpen"
            aria-haspopup="dialog"
            @click.stop="rte.markToolbarMenuOpening(); rte.toggleColorMenu()"
          >
            <span data-rte-own
              class="rte-tool-icon rte-color-icon"
              :style="{ textDecorationColor: rte.currentTextColor() || '#1d2129', '--rte-color-bar': rte.currentTextColor() || '#1d2129' }"
            >
              <component data-rte-own :is="rte.toolIcon('color')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">颜色</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.colorOpen"
              class="rte-menu rte-color-menu"
              v-rte-float="'color'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('color')"
              @mouseleave="rte.onToolMenuLeave($event, 'color', rte.closeColorMenus)"
            >
            <RteColorBoard data-rte-own kind="text" />
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'fontSize'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('fontSize')"
          @mouseleave="rte.onToolMenuLeave($event, 'fontSize', () => (rte.fontSizeOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('fontSize', el)" data-rte-anchor="fontSize"
            :class="{ active: rte.fontSizeOpen || !!rte.currentFontSize() }"
            :title="'字号：' + rte.fontSizeButtonLabel"
            aria-label="字号"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontFamilyOpen = false; rte.lineHeightOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.fontSizeOpen = !rte.fontSizeOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ rte.fontSizeButtonLabel }}<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.fontSizeOpen"
              class="rte-menu rte-font-size-menu"
              v-rte-float="'fontSize'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('fontSize')"
              @mouseleave="rte.onToolMenuLeave($event, 'fontSize', () => (rte.fontSizeOpen = false))"
            >
              <input data-rte-own
                class="rte-font-size-entry"
                type="text"
                placeholder="小四 或 12"
                title="输入小四或 12，按 Enter 应用"
                aria-label="输入字号，按 Enter 应用"
                @mousedown.stop
                @keydown.enter.prevent="rte.applyFontSize(($event.target as HTMLInputElement).value)"
              />
              <div v-if="rte.recentFontSizeOptions.length" data-rte-own class="rte-menu-section-label">最近字号</div>
              <button data-rte-own
                v-for="opt in rte.recentFontSizeOptions"
                :key="'fs-recent-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontSize() || '')"
                @click="rte.applyFontSize(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontSize" />{{ opt.label }}</button>
              <div v-if="rte.recentFontSizeOptions.length" data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own
                v-for="opt in rte.FONT_SIZE_OPTIONS"
                :key="'fs-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontSize() || '')"
                @click="rte.applyFontSize(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontSize" />{{ opt.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'fontFamily'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('fontFamily')"
          @mouseleave="rte.onToolMenuLeave($event, 'fontFamily', () => (rte.fontFamilyOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('fontFamily', el)" data-rte-anchor="fontFamily"
            :class="{ active: rte.fontFamilyOpen || !!rte.currentFontFamily() }"
            :title="'字体：' + fontFamilyCaption(rte.currentFontFamily(), rte.FONT_FAMILY_OPTIONS)"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontSizeOpen = false; rte.lineHeightOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.fontFamilyOpen = !rte.fontFamilyOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('fontFamily')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ fontFamilyCaption(rte.currentFontFamily(), rte.FONT_FAMILY_OPTIONS) }}<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.fontFamilyOpen"
              class="rte-menu rte-font-family-menu"
              v-rte-float="'fontFamily'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('fontFamily')"
              @mouseleave="rte.onToolMenuLeave($event, 'fontFamily', () => (rte.fontFamilyOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.FONT_FAMILY_OPTIONS"
                :key="'ff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontFamily() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontFamily() || '')"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="rte.applyFontFamily(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontFamily" />{{ opt.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'lineHeight'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('lineHeight')"
          @mouseleave="rte.onToolMenuLeave($event, 'lineHeight', () => (rte.lineHeightOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('lineHeight', el)" data-rte-anchor="lineHeight"
            :class="{ active: rte.lineHeightOpen || !!rte.currentLineHeight() }"
            :title="'行距：' + lineHeightCaption(rte.currentLineHeight(), rte.LINE_HEIGHT_OPTIONS)"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontSizeOpen = false; rte.fontFamilyOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.lineHeightOpen = !rte.lineHeightOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('lineHeight')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ lineHeightCaption(rte.currentLineHeight(), rte.LINE_HEIGHT_OPTIONS) }}<span data-rte-own class="rte-caret" aria-hidden="true"></span>
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.lineHeightOpen"
              class="rte-menu"
              v-rte-float="'lineHeight'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('lineHeight')"
              @mouseleave="rte.onToolMenuLeave($event, 'lineHeight', () => (rte.lineHeightOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.LINE_HEIGHT_OPTIONS"
                :key="'lh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentLineHeight() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentLineHeight() || '')"
                @click="rte.applyLineHeight(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="lineHeight" />{{ opt.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'linkButton'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('linkButton')"
          @mouseleave="rte.onToolMenuLeave($event, 'linkButton', () => (rte.linkButtonOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('linkButton', el)"
            data-rte-anchor="linkButton"
            :class="{ active: rte.linkButtonOpen || rte.isActive('linkButton') }"
            :title="t.title || '插入打开链接的按钮'"
            aria-label="按钮"
            aria-haspopup="menu"
            :aria-expanded="rte.linkButtonOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.listOpen = false; rte.alignOpen = false; rte.linkButtonOpen = !rte.linkButtonOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('linkButton')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">按钮<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.linkButtonOpen"
              class="rte-menu"
              v-rte-float="'linkButton'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('linkButton')"
              @mouseleave="rte.onToolMenuLeave($event, 'linkButton', () => (rte.linkButtonOpen = false))"
            >
              <button data-rte-own
                v-for="tone in rte.LINK_BUTTON_TONES"
                :key="'lb-' + tone.id"
                type="button"
                :title="toolbarMenuItemTitle(tone.label + '按钮')"
                @click="rte.paintLinkButton(tone.id)"
              ><RteMenuGlyph :id="tone.id" :label="tone.label + '按钮'" />{{ tone.label }}按钮</button>
              <div data-rte-own v-if="rte.isActive('linkButton')" class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own v-if="rte.isActive('linkButton')" type="button" :title="toolbarMenuItemTitle('修改文字和链接')" @click="rte.editLinkButton()"><RteMenuGlyph label="修改文字和链接" />修改文字和链接</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'align'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('align')"
          @mouseleave="rte.onToolMenuLeave($event, 'align', () => (rte.alignOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('align', el)" data-rte-anchor="align"
            :class="{
              active:
                rte.isActive({ textAlign: 'center' }) ||
                rte.isActive({ textAlign: 'right' }) ||
                rte.isActive({ textAlign: 'justify' }),
            }"
            :title="alignToolTitle(currentAlignName())"
            aria-label="对齐"
            aria-haspopup="menu"
            :aria-expanded="rte.alignOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = !rte.alignOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('align')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">对齐<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.alignOpen"
              class="rte-menu"
              v-rte-float="'align'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('align')"
              @mouseleave="rte.onToolMenuLeave($event, 'align', () => (rte.alignOpen = false))"
            >
              <button data-rte-own type="button" :class="{ active: currentAlignName() === 'left' }" :aria-pressed="currentAlignName() === 'left'" @click="rte.setAlign('left'); rte.alignOpen = false"><RteMenuGlyph label="左对齐" />左对齐</button>
              <button data-rte-own type="button" :class="{ active: currentAlignName() === 'center' }" :aria-pressed="currentAlignName() === 'center'" @click="rte.setAlign('center'); rte.alignOpen = false"><RteMenuGlyph label="居中" />居中</button>
              <button data-rte-own type="button" :class="{ active: currentAlignName() === 'right' }" :aria-pressed="currentAlignName() === 'right'" @click="rte.setAlign('right'); rte.alignOpen = false"><RteMenuGlyph label="右对齐" />右对齐</button>
              <button data-rte-own type="button" :class="{ active: currentAlignName() === 'justify' }" :aria-pressed="currentAlignName() === 'justify'" @click="rte.setAlign('justify'); rte.alignOpen = false"><RteMenuGlyph label="两端对齐" />两端对齐</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('增加缩进')" @click="rte.indentBlock(); rte.alignOpen = false"><RteMenuGlyph label="增加缩进" />增加缩进</button>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('减少缩进')" @click="rte.outdentBlock(); rte.alignOpen = false"><RteMenuGlyph label="减少缩进" />减少缩进</button>
              <button data-rte-own
                type="button"
                :class="{ active: rte.currentTextIndent() === '2em' }"
                :aria-pressed="rte.currentTextIndent() === '2em'"
                :title="toolbarMenuItemTitle('首行缩进 2 字')"
                @click="rte.setFirstLineIndent(true); rte.alignOpen = false"
              ><RteMenuGlyph label="首行缩进 2 字" />首行缩进 2 字</button>
              <button data-rte-own
                type="button"
                :disabled="!rte.currentTextIndent()"
                :title="toolbarMenuItemTitle('取消首行缩进')"
                @click="rte.setFirstLineIndent(false); rte.alignOpen = false"
              ><RteMenuGlyph label="取消首行缩进" />取消首行缩进</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'divider'"
          class="rte-tool-divider"
          :class="{ 'is-tier': t.key === 'div-tier' }"
          aria-hidden="true"
        />
        <div data-rte-own
          v-else-if="t.kind === 'table'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('table')"
          @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('table', el)" data-rte-anchor="table"
            :class="{ active: rte.tableMenuOpen || rte.tableQuickOpen || rte.tableDialogOpen || rte.isInTable() }"
            :title="rte.isInTable() ? '表格操作' : '插入表格'"
            aria-label="表格"
            aria-haspopup="menu"
            :aria-expanded="rte.isInTable() ? rte.tableMenuOpen : rte.tableQuickOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.onTableToolbarButtonClick()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('table')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ tableToolLabel(!!rte.isInTable()) }}<span data-rte-own
                v-if="rte.isInTable()"
                class="rte-caret"
                aria-hidden="true"
              ></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.tableQuickOpen && !rte.isInTable() && rte.viewMode === 'edit'"
              class="rte-menu rte-table-quick"
              :class="{ 'is-dark': rte.darkEditor }"
              v-rte-float="'table'"
              role="menu"
              aria-label="插入表格"
              tabindex="0"
              @mousedown.prevent
              @keydown="rte.onTableQuickKeydown"
              @mouseenter="rte.onToolMenuEnter('table')"
              @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
            >
              <div data-rte-own class="rte-table-quick-label">
                {{ rte.tableQuickHover.rows || 0 }} × {{ rte.tableQuickHover.cols || 0 }} 表格
              </div>
              <div data-rte-own
                class="rte-table-quick-grid"
                @mouseleave="rte.tableQuickHover = { rows: 0, cols: 0 }"
              >
                <button data-rte-own
                  v-for="cell in rte.tableQuickCells"
                  :key="'tq-' + cell.r + '-' + cell.c"
                  type="button"
                  class="rte-table-quick-cell"
                  :class="{ 'is-on': cell.r <= rte.tableQuickHover.rows && cell.c <= rte.tableQuickHover.cols }"
                  :aria-label="cell.r + ' 行 ' + cell.c + ' 列'"
                  @mouseenter="rte.tableQuickHover = { rows: cell.r, cols: cell.c }"
                  @click="rte.insertQuickTable(cell.r, cell.c)"
                />
              </div>
              <button data-rte-own type="button" class="rte-table-quick-more" :title="toolbarMenuItemTitle('自定义尺寸…')" @click="rte.tableQuickOpen = false; rte.openTableDialog()">
                自定义尺寸…
              </button>
            </div>
            <div data-rte-own
              v-if="rte.tableMenuOpen && rte.isInTable()"
              class="rte-menu rte-table-menu"
              v-rte-float="'table'"
              role="menu"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('table')"
              @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
            >
              <div data-rte-own
                v-for="group in TABLE_MENU_GROUPS"
                :key="'tbl-group-' + group.id"
                class="rte-table-ctx-group"
              >
                <button data-rte-own
                  type="button"
                  role="menuitem"
                  :class="{ active: tableMenuGroup === group.id }"
                  :title="group.title"
                  :aria-expanded="tableMenuGroup === group.id"
                  @mouseenter="openTableMenuGroup(group.id, $event)"
                  @click.stop="openTableMenuGroup(group.id, $event)"
                >
                  <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[group.id]" /></span>
                  <span data-rte-own class="rte-table-ctx-label">{{ group.label }}</span>
                  <span data-rte-own class="rte-table-ctx-caret" aria-hidden="true">▸</span>
                </button>
                <div data-rte-own
                  v-if="tableMenuGroup === group.id"
                  class="rte-table-ctx-flyout"
                  :style="{ top: tableMenuFlyout.top + 'px', left: tableMenuFlyout.left + 'px' }"
                  @mousedown.stop
                >
                  <template v-for="op in tableMenuOps(group.keys)" :key="op.key">
                    <div data-rte-own v-if="op.insertCount" class="rte-table-insert-line">
                      <button data-rte-own type="button" role="menuitem" :title="op.title" @click="op.run()">
                        <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                        <span data-rte-own>{{ op.label }}</span>
                      </button>
                      <label data-rte-own class="rte-table-insert-count">
                        <input data-rte-own
                          v-model.number="rte.tableInsertCounts[op.key]"
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          inputmode="numeric"
                          :aria-label="op.label + '数量'"
                          title="填几就插入几行或几列，最少 1"
                          @mousedown.stop="rte.rememberTableInsertSelection()"
                          @click.stop
                          @keydown.stop
                          @blur="rte.normalizeTableInsertCount(op.key)"
                        />
                      </label>
                    </div>
                    <button data-rte-own
                      v-else
                      type="button"
                      role="menuitem"
                      :class="{ danger: op.danger, active: op.active?.() }"
                      :title="op.title || op.label"
                      :disabled="op.disabled?.()"
                      @click="op.run()"
                    >
                      <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                      <span data-rte-own>{{ op.label }}</span>
                    </button>
                  </template>
                </div>
              </div>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <div data-rte-own class="rte-menu-hint-line">拖拽列边缘调整列宽。多选单元格后可合并。</div>
              <div data-rte-own class="rte-table-cell-style-title" style="padding: 4px 10px">单元格背景</div>
              <div data-rte-own class="rte-table-swatches" style="padding: 0 10px 8px">
                <button data-rte-own
                  v-for="p in rte.TABLE_CELL_BG_PRESETS"
                  :key="'menu-bg-' + p.value"
                  type="button"
                  class="rte-table-swatch"
                  :title="p.value ? '单元格底色：' + p.label : '去掉单元格底色'"
                  :style="p.value ? { background: p.value } : undefined"
                  @click="rte.setTableCellBg(p.value); rte.closeTableMenu()"
                >{{ p.value ? '' : '无' }}</button>
              </div>
              <button data-rte-own
                type="button"
                role="menuitem"
                title="再插入一张表格，自己填行数和列数"
                @click="rte.closeTableMenu(); rte.openTableDialog()"
              >
                <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS['insert-table']" /></span>
                <span data-rte-own>插入表格</span>
              </button>
              <button data-rte-own type="button" role="menuitem" title="隔行加底色，只用于显示" @click="rte.toggleTableZebra(); rte.closeTableMenu()">
                <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS.zebra" /></span>
                <span data-rte-own>斑马纹</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'import'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('import')"
          @mouseleave="rte.onToolMenuLeave($event, 'import', rte.closeImportMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('import', el)" data-rte-anchor="import"
            :class="{ active: rte.importMenuOpen }"
            :title="t.title || '导入'"
            aria-haspopup="menu"
            :aria-expanded="rte.importMenuOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.importMenuOpen = !rte.importMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('import')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >导入<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.importMenuOpen"
              class="rte-import-menu"
              v-rte-float="'import'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('import')"
              @mouseleave="rte.onToolMenuLeave($event, 'import', rte.closeImportMenu)"
            >
              <button data-rte-own type="button" class="rte-import-item" title="打开 Markdown 或 Word 文档" @click.stop="rte.pickImportDocument">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('importDoc')" class="rte-ep-icon" />
                  <span data-rte-own>导入文档</span>
                </span>
                <span data-rte-own class="rte-import-pill">MD/Doc</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" title="从链接导入，例如公众号文章" @click.stop="rte.openImportLinkDialog">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('importLink')" class="rte-ep-icon" />
                  <span data-rte-own>导入链接</span>
                </span>
                <span data-rte-own class="rte-import-pill">公众号</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'export'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('export')"
          @mouseleave="rte.onToolMenuLeave($event, 'export', rte.closeExportMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('export', el)" data-rte-anchor="export"
            :class="{ active: rte.exportMenuOpen }"
            :title="t.title || '导出'"
            aria-haspopup="menu"
            :aria-expanded="rte.exportMenuOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.exportMenuOpen = !rte.exportMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('export')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >导出<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.exportMenuOpen"
              class="rte-import-menu"
              v-rte-float="'export'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('export')"
              @mouseleave="rte.onToolMenuLeave($event, 'export', rte.closeExportMenu)"
            >
              <button data-rte-own type="button" class="rte-import-item" title="复制成飞书能粘贴的 HTML" @click.stop="rte.copyAsFeishuHtml">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportHtml')" class="rte-ep-icon" />
                  <span data-rte-own>复制为 HTML</span>
                </span>
                <span data-rte-own class="rte-import-pill">飞书</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" title="下载成网页文件" @click.stop="rte.exportAsHtml">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportHtml')" class="rte-ep-icon" />
                  <span data-rte-own>导出 HTML</span>
                </span>
                <span data-rte-own class="rte-import-pill">.html</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" title="下载成没有格式的文本" @click.stop="rte.exportAsPlainText">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportText')" class="rte-ep-icon" />
                  <span data-rte-own>导出纯文本</span>
                </span>
                <span data-rte-own class="rte-import-pill">.txt</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" title="下载成 Markdown 文件" @click.stop="rte.exportAsMarkdown">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportText')" class="rte-ep-icon" />
                  <span data-rte-own>导出 Markdown</span>
                </span>
                <span data-rte-own class="rte-import-pill">.md</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :title="rte.exportBusy ? '正在导出，请稍候' : '把文档导出成 PNG 图片'"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsPng"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportPng')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出图片' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">PNG</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :title="rte.exportBusy ? '正在导出，请稍候' : '把文档导出成 PDF'"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsPdf"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportPdf')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出 PDF' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">.pdf</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :title="rte.exportBusy ? '正在导出，请稍候' : '把文档导出成 Word'"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsDocx"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportDocx')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出 Word' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">.docx</span>
              </button>
            </div>
          </Teleport>
        </div>
        <button data-rte-own
          v-else-if="t.kind === 'attach'"
          type="button"
          class="rte-tool"
          :class="{ active: rte.attachDialogOpen }"
          :title="t.title || t.label"
          :aria-label="t.title || t.label"
          aria-haspopup="dialog"
          @click="t.run?.()"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own
              :is="t.iconComp || rte.toolIcon('attach')"
              class="rte-ep-icon"
            />
            <span data-rte-own class="rte-caret rte-caret-on-icon" aria-hidden="true"></span>
          </span>
          <span data-rte-own class="rte-tool-label">附件</span>
        </button>
        <div data-rte-own
          v-else-if="t.kind === 'code'"
          class="rte-tool-wrap rte-code-tool-wrap"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :class="{ active: t.active?.() }"
            :title="t.title || t.label"
            :aria-label="t.title || t.label"
            @click="t.run?.()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                v-if="t.iconComp"
                :is="t.iconComp"
                class="rte-ep-icon"
              />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label }}</span>
          </button>
          <div data-rte-own
            v-if="rte.isActive('codeBlock')"
            class="rte-code-lang-wrap"
            @mouseenter="rte.onToolMenuEnter('codeLang')"
            @mouseleave="rte.onToolMenuLeave($event, 'codeLang', () => (rte.codeLangOpen = false))"
          >
            <button data-rte-own
              type="button"
              class="rte-code-lang-btn"
              :ref="(el) => rte.setFloatAnchor('codeLang', el)"
              data-rte-anchor="codeLang"
              :class="{ active: rte.codeLangOpen }"
              :title="'代码语言：' + rte.codeLanguageLabel(rte.currentCodeLanguage())"
              :aria-label="'代码语言：' + rte.codeLanguageLabel(rte.currentCodeLanguage())"
              :aria-expanded="rte.codeLangOpen"
              aria-haspopup="listbox"
              @mousedown.prevent
              @click.stop="rte.markToolbarMenuOpening(); rte.codeLangOpen = !rte.codeLangOpen"
            >
              {{ rte.codeLanguageLabel(rte.currentCodeLanguage()) }}
              <span data-rte-own class="rte-caret" aria-hidden="true"></span>
            </button>
            <Teleport to="body">
              <div data-rte-own
                v-if="rte.codeLangOpen"
                class="rte-menu rte-code-lang-menu"
                role="listbox"
                aria-label="代码语言"
                v-rte-float="'codeLang'"
                @mousedown.prevent
                @mouseenter="rte.onToolMenuEnter('codeLang')"
                @mouseleave="rte.onToolMenuLeave($event, 'codeLang', () => (rte.codeLangOpen = false))"
              >
                <button data-rte-own
                  v-for="opt in rte.CODE_LANG_OPTIONS"
                  :key="'cl-' + opt.value"
                  type="button"
                  role="option"
                  :class="{ active: rte.currentCodeLanguage() === opt.value }"
                  :aria-selected="rte.currentCodeLanguage() === opt.value"
                  :title="codeLangTitle(opt.label) || undefined"
                  @click="rte.applyCodeLanguage(opt.value)"
                ><RteMenuGlyph :id="opt.value" :label="opt.label" fallback="code" />{{ opt.label }}</button>
              </div>
            </Teleport>
          </div>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-flag-btn"
            :class="{ 'is-on': rte.codeBlockFlag('lineNumbers') }"
            :aria-pressed="rte.codeBlockFlag('lineNumbers')"
            title="在代码块左侧显示行号"
            aria-label="在代码块左侧显示行号"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('lineNumbers')"
          >
            行号
          </button>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-flag-btn"
            :class="{ 'is-on': rte.codeBlockFlag('wordWrap') }"
            :aria-pressed="rte.codeBlockFlag('wordWrap')"
            title="长行在代码块里自动换行"
            aria-label="长行在代码块里自动换行"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('wordWrap')"
          >
            换行
          </button>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-copy-btn"
            title="把这段代码复制到剪贴板"
            aria-label="把这段代码复制到剪贴板"
            @mousedown.prevent
            @click="rte.copyActiveCodeBlock"
          >
            复制
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'emoji'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('emoji')"
          @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('emoji', el)"
            data-rte-anchor="emoji"
            :class="{ active: rte.emojiOpen }"
            :title="t.title || '表情'"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.specialCharsOpen = false; rte.emojiOpen = !rte.emojiOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('emoji')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label || '表情' }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.emojiOpen"
              class="rte-emoji-panel"
              v-rte-float="'emoji'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('emoji')"
              @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
            >
              <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="表情分类">
                <button data-rte-own
                  v-for="cat in rte.RTE_EMOJI_CATEGORIES"
                  :key="'em-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: rte.emojiTabId === cat.id }"
                  :aria-selected="rte.emojiTabId === cat.id"
                  :title="pickerTabTitle(cat.label) || undefined"
                  @click.stop="rte.emojiTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div data-rte-own
                class="rte-picker-grid rte-emoji-grid"
                :class="{ 'rte-emoji-grid--large': rte.isLargeEmojiTab, 'rte-emoji-grid--kaomoji': rte.isKaomojiTab }"
                role="tabpanel"
              >
                <button data-rte-own
                  v-for="em in rte.activeEmojiList"
                  :key="'em-' + rte.emojiTabId + '-' + em"
                  type="button"
                  class="rte-emoji-btn"
                  :class="{ 'rte-emoji-btn--kaomoji': rte.isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
                  :title="em"
                  @click="rte.insertEmoji(em)"
                >{{ em }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'specialChars'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('specialChars')"
          @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('specialChars', el)"
            data-rte-anchor="specialChars"
            :class="{ active: rte.specialCharsOpen }"
            :title="t.title || '符号'"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.emojiOpen = false; rte.specialCharsOpen = !rte.specialCharsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('specialChars')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label || '符号' }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.specialCharsOpen"
              class="rte-specialchars-panel"
              v-rte-float="'specialChars'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('specialChars')"
              @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
            >
              <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="字符分类">
                <button data-rte-own
                  v-for="cat in rte.RTE_SPECIAL_CHAR_CATEGORIES"
                  :key="'sc-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: rte.specialCharTabId === cat.id }"
                  :aria-selected="rte.specialCharTabId === cat.id"
                  :title="pickerTabTitle(cat.label) || undefined"
                  @click.stop="rte.specialCharTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div data-rte-own class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
                <button data-rte-own
                  v-for="ch in rte.activeSpecialCharList"
                  :key="'sc-' + rte.specialCharTabId + '-' + ch"
                  type="button"
                  class="rte-specialchars-btn"
                  :title="ch"
                  @click="rte.insertSpecialChar(ch)"
                >{{ ch }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'columns'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('columns')"
          @mouseleave="rte.onToolMenuLeave($event, 'columns', () => (rte.columnsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('columns', el)"
            data-rte-anchor="columns"
            :class="{ active: rte.columnsOpen || rte.isActive('columns') }"
            :title="t.title || '把内容分成多栏'"
            @click.stop="rte.markToolbarMenuOpening(); rte.columnsOpen = !rte.columnsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('columns')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">分栏<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.columnsOpen"
              class="rte-menu rte-columns-menu"
              v-rte-float="'columns'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('columns')"
              @mouseleave="rte.onToolMenuLeave($event, 'columns', () => (rte.columnsOpen = false))"
            >
              <template v-for="(it, idx) in rte.COLUMN_MENU_ITEMS" :key="idx">
                <div data-rte-own v-if="it.type === 'label'" class="rte-menu-section-label">{{ it.text }}</div>
                <div data-rte-own v-else-if="it.type === 'sep'" class="rte-menu-sep" aria-hidden="true" />
                <button data-rte-own
                  v-else
                  type="button"
                  :title="toolbarMenuItemTitle(it.label) || undefined"
                  @click="rte.insertColumns(it.cols, it.ratios)"
                ><RteMenuGlyph :label="it.label" fallback="columns" />{{ it.label }}</button>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'spacing'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('spacing')"
          @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('spacing', el)"
            data-rte-anchor="spacing"
            :class="{ active: rte.spacingOpen || !!(rte.currentLetterSpacing() || rte.currentMarginTop() || rte.currentMarginBottom()) }"
            :title="t.title || '段前、段后和字间距'"
            @click.stop="rte.markToolbarMenuOpening(); rte.spacingOpen = !rte.spacingOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('spacing')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">段距<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.spacingOpen"
              class="rte-spacing-panel"
              v-rte-float="'spacing'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('spacing')"
              @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
            >
              <RteSpacingFields
                :margin-top="rte.currentMarginTop()"
                :margin-bottom="rte.currentMarginBottom()"
                :letter-spacing="rte.currentLetterSpacing()"
                :text-indent="rte.currentTextIndent()"
                :text-dir="rte.currentTextDir()"
                @margin-top="rte.applyMarginTop"
                @margin-bottom="rte.applyMarginBottom"
                @letter-spacing="rte.applyLetterSpacing"
                @text-indent="rte.applyTextIndent"
                @text-dir="rte.applyTextDir"
              />
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'paraStyle'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('paraStyle')"
          @mouseleave="rte.onToolMenuLeave($event, 'paraStyle', () => (rte.paraStyleOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('paraStyle', el)"
            data-rte-anchor="paraStyle"
            :class="{ active: rte.paraStyleOpen }"
            :title="t.title || '段落样式'"
            @click.stop="rte.markToolbarMenuOpening(); rte.paraStyleOpen = !rte.paraStyleOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">段样式<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.paraStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'paraStyle'"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.PARA_STYLE_OPTIONS"
                :key="'ps-' + opt.id"
                type="button"
                :title="toolbarMenuItemTitle(opt.label) || opt.desc"
                @click="rte.applyParaStyleId(opt.id)"
              ><RteMenuGlyph :id="opt.id" :label="opt.label" /><span data-rte-own>{{ opt.label }}</span><span data-rte-own class="rte-menu-desc">{{ opt.desc }}</span></button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'listStyle'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('listStyle')"
          @mouseleave="rte.onToolMenuLeave($event, 'listStyle', () => (rte.listStyleOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('listStyle', el)"
            data-rte-anchor="listStyle"
            :class="{ active: rte.listStyleOpen }"
            :title="t.title || '编号样式'"
            @click.stop="rte.markToolbarMenuOpening(); rte.listStyleOpen = !rte.listStyleOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('list')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">编号样式<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.listStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'listStyle'"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.ORDERED_LIST_STYLE_OPTIONS"
                :key="'ls-' + opt.value"
                type="button"
                :class="{ active: rte.currentOrderedListStyle() === opt.value }"
                :aria-pressed="rte.currentOrderedListStyle() === opt.value"
                :title="toolbarMenuItemTitle(opt.label) || undefined"
                @click="rte.applyListStyle(opt.value)"
              ><RteMenuGlyph :id="opt.value" :label="opt.label" />{{ opt.label }}</button>
              <div data-rte-own class="rte-menu-sep" />
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('自定义起始…')" @click="rte.applyListStart()"><RteMenuGlyph label="自定义起始…" />自定义起始…</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'wordStats'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('wordStats')"
          @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('wordStats', el)"
            data-rte-anchor="wordStats"
            :class="{ active: rte.wordStatsOpen }"
            :title="t.title || '字数'"
            @click.stop="rte.markToolbarMenuOpening(); rte.wordStatsOpen = !rte.wordStatsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">字数<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.wordStatsOpen"
              class="rte-wordstats-panel"
              v-rte-float="'wordStats'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('wordStats')"
              @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
            >
              <div data-rte-own class="rte-wordstats-title">字数统计</div>
              <p data-rte-own class="rte-wordstats-note">全文含标题、表格和代码中的文字，不含评论。</p>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('chars')"><span data-rte-own>全文（去空白）</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('words')"><span data-rte-own>词数（估）</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('minutes')"><span data-rte-own>阅读约</span><strong data-rte-own>{{ rte.readingMinutes }} 分钟</strong></div>
              <div data-rte-own class="rte-wordstats-divider" />
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('paragraphs')"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('lines')"><span data-rte-own>行数</span><strong data-rte-own>{{ rte.docExtraStats.lines }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('headings')"><span data-rte-own>标题数</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('cjk')"><span data-rte-own>汉字</span><strong data-rte-own>{{ rte.docExtraStats.cjk }}</strong></div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('ascii')"><span data-rte-own>英文词</span><strong data-rte-own>{{ rte.docExtraStats.asciiWords }}</strong></div>
              <div data-rte-own class="rte-wordstats-divider" />
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('selectionChars')">
                <span data-rte-own>选区字符</span>
                <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
              </div>
              <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('selectionWords')">
                <span data-rte-own>选区词数</span>
                <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.words : '—' }}</strong>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'callout'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('callout')"
          @mouseleave="rte.onToolMenuLeave($event, 'callout', () => (rte.calloutOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('callout', el)"
            data-rte-anchor="callout"
            :class="{ active: rte.calloutOpen || rte.isActive('callout') }"
            :title="t.title || '告示'"
            aria-label="告示框"
            @click.stop="rte.markToolbarMenuOpening(); rte.calloutOpen = !rte.calloutOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('callout')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">告示<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.calloutOpen"
              class="rte-menu rte-callout-menu"
              v-rte-float="'callout'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('callout')"
              @mouseleave="rte.onToolMenuLeave($event, 'callout', () => (rte.calloutOpen = false))"
            >
              <div data-rte-own class="rte-menu-section-label">插入告示框</div>
              <button data-rte-own
                v-for="it in rte.CALLOUT_MENU_ITEMS"
                :key="'co-' + it.variant"
                type="button"
                :class="{ active: rte.isActive('callout', { variant: it.variant }) }"
                :aria-pressed="rte.isActive('callout', { variant: it.variant })"
                :title="blockMenuTitle('callout-' + it.variant) || undefined"
                @click="rte.insertCallout(it.variant)"
              >
                <span data-rte-own class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span data-rte-own>{{ it.label }}</span>
                <span data-rte-own class="rte-menu-hint">{{ it.hint }}</span>
              </button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own
                type="button"
                :disabled="!rte.isActive('callout')"
                :title="toolbarMenuItemTitle('取消告示框')"
                @click="rte.editor?.chain().focus().unsetCallout().run(); rte.calloutOpen = false"
              >
                取消告示框
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'shortcuts'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('shortcuts')"
          @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('shortcuts', el)"
            data-rte-anchor="shortcuts"
            :class="{ active: rte.shortcutsOpen }"
            :title="t.title || '查看全部快捷键'"
            :aria-label="t.title || '查看全部快捷键'"
            aria-haspopup="menu"
            :aria-expanded="rte.shortcutsOpen"
            @click.stop="rte.toggleShortcutsPanel()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('shortcuts')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">快捷键</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.shortcutsOpen && rte.expanded"
              class="rte-shortcuts-panel"
              v-rte-float="'shortcuts'"
              role="dialog"
              aria-label="快捷键说明"
              tabindex="-1"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('shortcuts')"
              @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
            >
              <div data-rte-own class="rte-shortcuts-title">快捷键速查</div>
              <input data-rte-own
                v-model="rte.shortcutQuery"
                class="rte-shortcuts-search"
                type="search"
            autocomplete="off"
            spellcheck="false"
                placeholder="搜索，例如 bold、引用、tab"
                title="搜快捷键，可以打 bold、引用或 tab"
                aria-label="搜索快捷键"
                @mousedown.stop
                @keydown.stop
              />
              <div data-rte-own v-if="!rte.filteredShortcutGroups.length" class="rte-shortcuts-empty">没有匹配的快捷键</div>
              <div data-rte-own
                v-for="g in rte.filteredShortcutGroups"
                :key="'scg-' + g.title"
                class="rte-shortcuts-group"
              >
                <div data-rte-own class="rte-shortcuts-group-title">{{ g.title }}</div>
                <div data-rte-own
                  v-for="(it, i) in g.items"
                  :key="'sci-' + g.title + '-' + i"
                  class="rte-shortcuts-row"
                >
                  <kbd data-rte-own class="rte-kbd">{{ it.keys }}</kbd>
                  <span data-rte-own>{{ it.desc }}</span>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'hr'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('hr')"
          @mouseleave="rte.onToolMenuLeave($event, 'hr', () => (rte.hrOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('hr', el)"
            data-rte-anchor="hr"
            :class="{ active: rte.hrOpen || rte.isActive('horizontalRule') }"
            :title="t.title || '分割线'"
            aria-label="分割线"
            aria-haspopup="menu"
            :aria-expanded="rte.hrOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.hrOpen = !rte.hrOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('hr')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">分割线<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'blockOps'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('blockOps')"
          @mouseleave="rte.onToolMenuLeave($event, 'blockOps', () => (rte.blockOpsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('blockOps', el)"
            data-rte-anchor="blockOps"
            :class="{ active: rte.blockOpsOpen }"
            :title="t.title || '块操作'"
            @click.stop="rte.markToolbarMenuOpening(); rte.blockOpsOpen = !rte.blockOpsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('more')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label || '块操作' }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'insertDate'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('insertDate')"
          @mouseleave="rte.onToolMenuLeave($event, 'insertDate', () => (rte.insertDateOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('insertDate', el)"
            data-rte-anchor="insertDate"
            :class="{ active: rte.insertDateOpen }"
            :title="t.title || '插入日期'"
            @click.stop="rte.markToolbarMenuOpening(); rte.insertDateOpen = !rte.insertDateOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('note')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">日期<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'echartsGroup'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter(t.key)"
          @mouseleave="rte.onToolMenuLeave($event, t.key, () => (rte.echartsGroupMenuKey = null))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor(t.key, el)"
            :data-rte-anchor="t.key"
            :class="{ active: rte.echartsGroupMenuKey === t.key }"
            :title="t.title || ('插入' + t.label + '图表')"
            aria-haspopup="menu"
            :aria-expanded="rte.echartsGroupMenuKey === t.key"
            @click.stop="rte.markToolbarMenuOpening(); toggleChartGroupMenu(t.key)"
          >
            <span data-rte-own class="rte-tool-icon">
              <component
                v-if="t.iconComp"
                data-rte-own
                :is="t.iconComp"
                class="rte-ep-icon"
              />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.echartsGroupMenuKey === t.key"
              class="rte-menu rte-menu-echarts"
              v-rte-float="t.key"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter(t.key)"
              @mouseleave="rte.onToolMenuLeave($event, t.key, () => (rte.echartsGroupMenuKey = null))"
            >
              <!-- 只列本分类下的具体图表类型 -->
              <div data-rte-own class="rte-menu-section">{{ t.title || t.label }}</div>
              <template v-for="cat in chartCategoriesOf(chartGroupIdOfTool(t.key))" :key="'cat-' + cat.id">
                <button
                  data-rte-own
                  type="button"
                  class="rte-menu-cat"
                  :class="{ 'is-open': rte.echartsOpenCategory === cat.id }"
                  @click="rte.toggleEchartsCategory(cat.id)"
                >
                  <RteMenuGlyph :label="cat.label" fallback="chart" /><strong data-rte-own>{{ cat.label }}</strong>
                  <span data-rte-own class="rte-menu-hint">{{ cat.templates.length }} 种</span>
                </button>
                <div
                  v-if="rte.echartsOpenCategory === cat.id"
                  data-rte-own
                  class="rte-menu-sub"
                >
                  <button
                    v-for="tpl in cat.templates"
                    :key="'tpl-' + tpl.id"
                    data-rte-own
                    type="button"
                    @click="rte.insertEchartsTemplateById(tpl.id)"
                  ><RteMenuGlyph :id="tpl.id" :label="tpl.label" fallback="chart" />{{ tpl.label }}<span data-rte-own class="rte-menu-hint">{{ tpl.hint }}</span></button>
                </div>
              </template>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('一键生成…')" @click="rte.openEchartsDialog()"><RteMenuGlyph label="一键生成…" />一键生成…</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'caseTransform'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('caseTransform')"
          @mouseleave="rte.onToolMenuLeave($event, 'caseTransform', () => (rte.caseMenuOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('caseTransform', el)"
            data-rte-anchor="caseTransform"
            :class="{ active: rte.caseMenuOpen }"
            :title="t.title || '文字'"
            @click.stop="rte.markToolbarMenuOpening(); rte.caseMenuOpen = !rte.caseMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label || '文字' }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.caseMenuOpen"
              class="rte-menu"
              v-rte-float="'caseTransform'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('caseTransform')"
              @mouseleave="rte.onToolMenuLeave($event, 'caseTransform', () => (rte.caseMenuOpen = false))"
            >
              <template v-for="item in rte.TEXT_MENU_ITEMS" :key="'case-' + item.id">
                <div v-if="item.sep" data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
                <button
                  v-else
                  data-rte-own
                  type="button"
                  :class="{ active: rte.textMenuActive(item.id) }"
                  :title="toolbarMenuItemTitle(item.label) || undefined"
                  @click="rte.runTextMenu(item.id)"
                ><RteMenuGlyph :id="item.id" :label="item.label" />{{ item.label }}</button>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'zoom'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('zoom')"
          @mouseleave="rte.onToolMenuLeave($event, 'zoom', () => (rte.zoomMenuOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('zoom', el)"
            data-rte-anchor="zoom"
            :class="{ active: rte.zoomMenuOpen || rte.editorZoom !== 1 }"
            :title="zoomToolTitle(rte.editorZoom)"
            @click.stop="rte.markToolbarMenuOpening(); rte.zoomMenuOpen = !rte.zoomMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ zoomToolLabel(rte.editorZoom) }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.zoomMenuOpen"
              class="rte-menu"
              v-rte-float="'zoom'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('zoom')"
              @mouseleave="rte.onToolMenuLeave($event, 'zoom', () => (rte.zoomMenuOpen = false))"
            >
              <button data-rte-own
                v-for="z in rte.RTE_ZOOM_PRESETS"
                :key="'z-' + z.value"
                type="button"
                :class="{ active: rte.editorZoom === z.value }"
                :aria-pressed="rte.editorZoom === z.value"
                :title="toolbarMenuItemTitle(z.label) || undefined"
                @click="rte.setEditorZoom(z.value)"
              ><RteMenuGlyph :label="z.label" fallback="zoom" />{{ z.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'viewExtras'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('viewExtras')"
          @mouseleave="rte.onToolMenuLeave($event, 'viewExtras', () => (rte.viewExtrasOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('viewExtras', el)"
            data-rte-anchor="viewExtras"
            :class="{ active: rte.viewExtrasOpen || rte.focusMode || rte.darkEditor || rte.paperGuide || rte.pageSize !== 'full' }"
            :title="(t.title || '视图') + '。当前纸张：' + rte.pageSizeMeta.label"
            aria-haspopup="menu"
            :aria-expanded="rte.viewExtrasOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.viewExtrasOpen = !rte.viewExtrasOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('outline')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">视图<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.viewExtrasOpen"
              class="rte-menu"
              v-rte-float="'viewExtras'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('viewExtras')"
              @mouseleave="rte.onToolMenuLeave($event, 'viewExtras', () => (rte.viewExtrasOpen = false))"
            >
              <button data-rte-own type="button" :class="{ active: rte.focusMode }" :aria-pressed="rte.focusMode" @click="rte.toggleFocusMode"><RteMenuGlyph label="专注模式" />专注模式</button>
              <button data-rte-own type="button" :class="{ active: rte.darkEditor }" :aria-pressed="rte.darkEditor" @click="rte.toggleDarkEditor"><RteMenuGlyph label="暗色编辑区" />暗色编辑区</button>
              <button data-rte-own type="button" :class="{ active: rte.paperGuide }" :aria-pressed="rte.paperGuide" @click="rte.togglePaperGuide"><RteMenuGlyph label="纸张参考线" />纸张参考线</button>
              <template data-rte-own v-if="rte.pageSheetEnabled">
                <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
                <div data-rte-own class="rte-page-size-label">页面大小</div>
                <button data-rte-own
                  v-for="opt in rte.RTE_PAGE_SIZES"
                  :key="'ps-' + opt.id"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="rte.pageSize === opt.id"
                  :class="{ active: rte.pageSize === opt.id }"
                  :title="pageSizeTitle(opt.id) || opt.hint"
                  @click="rte.setPageSize(opt.id)"
                ><RteMenuGlyph :id="opt.id" :label="opt.label" fallback="page" />{{ opt.label }}<span data-rte-own class="rte-menu-hint">{{ opt.hint }}</span></button>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'textTidy'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('textTidy')"
          @mouseleave="rte.onToolMenuLeave($event, 'textTidy', () => (rte.textTidyOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => rte.setFloatAnchor('textTidy', el)"
            data-rte-anchor="textTidy"
            :class="{ active: rte.textTidyOpen }"
            :title="t.title || '整理'"
            aria-label="整理文字"
            aria-haspopup="menu"
            :aria-expanded="rte.textTidyOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.textTidyOpen = !rte.textTidyOpen"
          >
            <span data-rte-own class="rte-tool-icon">理</span>
            <span data-rte-own class="rte-tool-label">整理<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.textTidyOpen"
              class="rte-menu"
              v-rte-float="'textTidy'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('textTidy')"
              @mouseleave="rte.onToolMenuLeave($event, 'textTidy', () => (rte.textTidyOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.TEXT_TIDY_ACTIONS"
                :key="'tidy-' + opt.id"
                type="button"
                :title="toolbarMenuItemTitle(opt.label) || undefined"
                @click="rte.runTextMenu(opt.id); rte.textTidyOpen = false"
              ><RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'imageLayout'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('imageLayout')"
          @mouseleave="rte.onToolMenuLeave($event, 'imageLayout', () => (rte.imageLayoutOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => rte.setFloatAnchor('imageLayout', el)"
            data-rte-anchor="imageLayout"
            :class="{ active: rte.imageLayoutOpen || rte.isImageNodeSelected() }"
            :title="disabledToolTitle('图片排法：居中、居左、居右、左右环绕', !rte.isImageNodeSelected())"
            aria-label="图片排法"
            aria-haspopup="menu"
            :aria-expanded="rte.imageLayoutOpen"
            :disabled="!rte.isImageNodeSelected()"
            @click.stop="rte.markToolbarMenuOpening(); rte.imageLayoutOpen = !rte.imageLayoutOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('image')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">排法<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.imageLayoutOpen"
              class="rte-menu"
              v-rte-float="'imageLayout'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('imageLayout')"
              @mouseleave="rte.onToolMenuLeave($event, 'imageLayout', () => (rte.imageLayoutOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.IMAGE_LAYOUT_OPTIONS"
                :key="'img-layout-' + opt.id"
                type="button"
                :class="{ active: imageLayoutSelected(opt) }"
                :aria-pressed="imageLayoutSelected(opt)"
                @click="rte.setImagePlacement(opt); rte.imageLayoutOpen = false"
              ><RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'presetMenu'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter(t.key)"
          @mouseleave="rte.onToolMenuLeave($event, t.key, () => { if (rte.presetMenuKey === t.key) rte.closePresetMenu() })"
        >
          <button data-rte-own
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => rte.setFloatAnchor(t.key, el)"
            :data-rte-anchor="t.key"
            :class="{ active: rte.presetMenuKey === t.key || !!t.active?.() }"
            :title="disabledToolTitle(t.title || t.label, !!t.disabled?.())"
            :aria-label="t.title || t.label"
            :aria-keyshortcuts="shortcutFromTitle(t.title || '') || undefined"
            aria-haspopup="menu"
            :aria-expanded="rte.presetMenuKey === t.key"
            :disabled="t.disabled?.() || undefined"
            @mousedown.prevent
            @click.stop="rte.markToolbarMenuOpening(); rte.togglePresetMenu(t.key)"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own v-if="t.iconComp" :is="t.iconComp" class="rte-ep-icon" />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.presetMenuKey === t.key"
              class="rte-menu"
              v-rte-float="t.key"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter(t.key)"
              @mouseleave="rte.onToolMenuLeave($event, t.key, () => { if (rte.presetMenuKey === t.key) rte.closePresetMenu() })"
            >
              <button data-rte-own
                v-for="opt in t.presetOptions"
                :key="t.key + '-' + opt.label"
                type="button"
                :class="{ active: (t.currentPreset?.() || '') === opt.id }"
                :aria-pressed="(t.currentPreset?.() || '') === opt.id"
                :title="toolbarMenuItemTitle(opt.label) || undefined"
                @click="t.applyPreset?.(opt.id); rte.closePresetMenu()"
              >
                <RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'paperGroup'"
          class="rte-paper-group"
          role="group"
          aria-label="纸样"
        >
          <button data-rte-own
            v-for="opt in t.presetOptions"
            :key="t.key + '-' + (opt.id || 'default')"
            type="button"
            class="rte-paper-chip"
            :class="{ active: (t.currentPreset?.() || '') === opt.id }"
            :aria-pressed="(t.currentPreset?.() || '') === opt.id"
            :title="toolbarMenuItemTitle(opt.label) || (opt.label + '纸样')"
            @mousedown.prevent
            @click="t.applyPreset?.(opt.id)"
          >
            <span data-rte-own class="rte-paper-swatch" :data-paper="opt.id || 'default'" aria-hidden="true" />
            <span data-rte-own class="rte-paper-chip-label">{{ opt.label }}</span>
          </button>
        </div>
        <button data-rte-own
          v-else
          type="button"
          class="rte-tool"
          :class="{ active: t.active?.(), 'is-disabled': t.disabled?.() }"
          :title="disabledToolTitle(t.title || t.label, !!t.disabled?.())"
          :aria-label="t.title || t.label"
          :aria-keyshortcuts="shortcutFromTitle(t.title || '') || undefined"
          :aria-pressed="t.active ? !!t.active() : undefined"
          :disabled="t.disabled?.() || undefined"
          @mousedown.prevent
          @click="t.run?.()"
          @dblclick.stop="t.key === 'formatPainter' && rte.onFormatPainterDblClick()"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own
              v-if="t.iconComp"
              :is="t.iconComp"
              class="rte-ep-icon"
            />
            <template v-else>{{ t.icon }}</template>
          </span>
          <span data-rte-own class="rte-tool-label">{{ t.label }}</span>
        </button>
      </template>
      </div>

      <!-- 未最大化：其余工具收进「更多」 -->
      <div data-rte-own
        v-if="!rte.expanded && rte.moreTools.length && !rte.toolbarQuery"
        class="rte-tool-wrap rte-more-wrap"
        @mouseenter="rte.onToolMenuEnter('more')"
        @mouseleave="rte.onToolMenuLeave($event, 'more', rte.closeMore)"
      >
        <button data-rte-own
          type="button"
          class="rte-tool is-labeled"
          :ref="(el) => rte.setFloatAnchor('more', el)" data-rte-anchor="more"
          :class="{ active: rte.moreOpen }"
          :title="moreToolsTitle(rte.moreTools.length)"
          :aria-label="moreToolsTitle(rte.moreTools.length)"
          aria-haspopup="menu"
          :aria-expanded="rte.moreOpen"
          @click.stop="rte.markToolbarMenuOpening(); rte.moreOpen = !rte.moreOpen"
          @keydown="onMoreButtonKeydown"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own :is="rte.toolIcon('more')" class="rte-ep-icon" />
          </span>
          <span data-rte-own class="rte-tool-label">{{ moreToolsCaption(rte.moreTools.length) }}</span>
        </button>
        <Teleport to="body">
          <div data-rte-own
            v-if="rte.moreOpen"
            class="rte-more-menu"
            v-rte-float="'more'"
            :class="{ 'has-flyout': rte.moreColorOpen || rte.moreHighlightOpen || rte.moreFormOpen || rte.moreTemplateOpen || rte.moreFontSizeOpen || rte.moreFontFamilyOpen || rte.moreLineHeightOpen || rte.moreCalloutOpen || !!rte.presetMenuKey }"
            @mousedown.prevent
            @keydown="onMoreMenuKeydown"
            @mouseenter="rte.onToolMenuEnter('more')"
            @mouseleave="rte.onToolMenuLeave($event, 'more', rte.closeMore)"
          >
          <div data-rte-own
            v-for="group in rte.moreGroups"
            :key="group.id"
            class="rte-more-group"
            :data-group-id="group.id"
            :class="{
              'is-dragging': rte.toolbarDragSource === group.id,
              'is-drop-target': rte.toolbarDropIndex === rte.toolbarOrder.indexOf(group.id),
            }"
          >
            <button data-rte-own
              v-if="rte.viewMode === 'edit'"
              type="button"
              class="rte-more-capsule"
              draggable="false"
              :aria-label="'拖动' + group.label + '分组'"
              :title="groupHandleTitle(group.label, group.tools.length)"
              @pointerdown="rte.onToolbarHandlePointerDown(group.id, $event)"
              @pointermove="rte.onToolbarHandlePointerMove"
              @pointerup="rte.onToolbarHandlePointerUp"
              @pointercancel="rte.onToolbarHandlePointerUp"
              @keydown="rte.onToolbarGroupKeydown(group.id, $event)"
            >
              ⠿ {{ group.label }}
            </button>
            <template v-for="mt in group.tools" :key="mt.key">
            <div data-rte-own
              v-if="mt.kind === 'paperGroup'"
              class="rte-paper-group rte-paper-group--menu"
              role="group"
              aria-label="纸样"
            >
              <button data-rte-own
                v-for="opt in mt.presetOptions"
                :key="'mpaper-' + (opt.id || 'default')"
                type="button"
                class="rte-paper-chip"
                :class="{ active: (mt.currentPreset?.() || '') === opt.id }"
                :aria-pressed="(mt.currentPreset?.() || '') === opt.id"
                :title="toolbarMenuItemTitle(opt.label) || (opt.label + '纸样')"
                @mousedown.prevent
                @click="mt.applyPreset?.(opt.id)"
              >
                <span data-rte-own class="rte-paper-swatch" :data-paper="opt.id || 'default'" aria-hidden="true" />
                <span data-rte-own class="rte-paper-chip-label">{{ opt.label }}</span>
              </button>
            </div>
            <button data-rte-own
              v-else
              type="button"
              class="rte-more-item"
              @mouseenter="rte.hoverMoreSubmenu(mt)"
              :class="{
                active:
                  mt.active?.() ||
                  (mt.kind === 'color' && rte.moreColorOpen) ||
                  (mt.key === 'highlight' && rte.moreHighlightOpen) ||
                  (mt.kind === 'form' && rte.moreFormOpen) ||
                  (mt.kind === 'callout' && rte.moreCalloutOpen) ||
                  (mt.kind === 'template' && rte.moreTemplateOpen) ||
                  (mt.kind === 'fontSize' && rte.moreFontSizeOpen) ||
                  (mt.kind === 'fontFamily' && rte.moreFontFamilyOpen) ||
                  (mt.kind === 'lineHeight' && rte.moreLineHeightOpen),
              }"
              :data-tool-key="mt.key"
              :title="disabledToolTitle(mt.title || mt.label, !!mt.disabled?.())"
              :aria-keyshortcuts="shortcutFromTitle(mt.title || '') || undefined"
              :aria-pressed="mt.active ? !!mt.active() : undefined"
              :disabled="mt.disabled?.() || undefined"
              @click="rte.onMoreToolClick(mt)"
            >
              <span data-rte-own class="rte-more-icon">
                <component data-rte-own
                  v-if="mt.iconComp"
                  :is="mt.iconComp"
                  class="rte-ep-icon"
                />
                <template v-else>{{ mt.icon }}</template>
              </span>
              <span data-rte-own>{{ mt.label }}</span>
              <span v-if="shortcutFromTitle(mt.title || '')" data-rte-own class="rte-more-kbd">{{ shortcutFromTitle(mt.title || '') }}</span>
              <span data-rte-own
                v-if="mt.kind === 'attach' || menuToolNeedsCaret(mt.kind)"
                class="rte-more-caret"
              >{{ mt.kind === 'attach' || mt.kind === 'form' || mt.kind === 'template' ? '▾' : '▸' }}</span>
            </button>
            <div data-rte-own
              v-if="mt.kind === 'echartsGroup' && rte.moreChartGroupKey === mt.key"
              class="rte-menu rte-chart-more-flyout"
              @mousedown.prevent
            >
              <!-- 紧凑态「更多」里的一级分类下拉：窄屏也能找到 9 个图表分类 -->
              <div data-rte-own class="rte-menu-section">{{ mt.title || mt.label }}</div>
              <template v-for="cat in chartCategoriesOf(chartGroupIdOfTool(mt.key))" :key="'mcat-' + cat.id">
                <button data-rte-own
                  type="button"
                  class="rte-menu-cat"
                  :class="{ 'is-open': rte.echartsOpenCategory === cat.id }"
                  @click="rte.toggleEchartsCategory(cat.id)"
                >
                  <RteMenuGlyph :label="cat.label" fallback="chart" /><strong data-rte-own>{{ cat.label }}</strong>
                  <span data-rte-own class="rte-menu-hint">{{ cat.templates.length }} 种</span>
                </button>
                <div data-rte-own
                  v-if="rte.echartsOpenCategory === cat.id"
                  class="rte-menu-sub"
                >
                  <button data-rte-own
                    v-for="tpl in cat.templates"
                    :key="'mtpl-' + tpl.id"
                    type="button"
                    @click="rte.insertEchartsTemplateById(tpl.id)"
                  ><RteMenuGlyph :id="tpl.id" :label="tpl.label" fallback="chart" />{{ tpl.label }}<span data-rte-own class="rte-menu-hint">{{ tpl.hint }}</span></button>
                </div>
              </template>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
              <button data-rte-own type="button" :title="toolbarMenuItemTitle('一键生成…')" @click="rte.openEchartsDialog()"><RteMenuGlyph label="一键生成…" />一键生成…</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'textTidy' && rte.textTidyOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.TEXT_TIDY_ACTIONS"
                :key="'mtidy-' + opt.id"
                type="button"
                :title="toolbarMenuItemTitle(opt.label) || undefined"
                @click="rte.runTextMenu(opt.id); rte.textTidyOpen = false"
              ><RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'presetMenu' && rte.presetMenuKey === mt.key"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in mt.presetOptions"
                :key="'mpreset-' + mt.key + '-' + opt.label"
                type="button"
                :class="{ active: (mt.currentPreset?.() || '') === opt.id }"
                :aria-pressed="(mt.currentPreset?.() || '') === opt.id"
                :title="toolbarMenuItemTitle(opt.label) || undefined"
                @click="mt.applyPreset?.(opt.id); rte.closePresetMenu()"
              >
                <RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'imageLayout' && rte.imageLayoutOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.IMAGE_LAYOUT_OPTIONS"
                :key="'mimg-' + opt.id"
                type="button"
                :class="{ active: imageLayoutSelected(opt) }"
                :aria-pressed="imageLayoutSelected(opt)"
                :disabled="!rte.isImageNodeSelected()"
                @click="rte.setImagePlacement(opt); rte.imageLayoutOpen = false"
              ><RteMenuGlyph :id="opt.id" :label="opt.label" />{{ opt.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'fontSize' && rte.moreFontSizeOpen"
              class="rte-menu rte-more-flyout rte-font-size-menu"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.recentFontSizeOptions"
                :key="'mfs-recent-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontSize() || '')"
                @click="rte.applyFontSize(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontSize" />{{ opt.label }}</button>
              <button data-rte-own
                v-for="opt in rte.FONT_SIZE_OPTIONS"
                :key="'mfs-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontSize() || '')"
                @click="rte.applyFontSize(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontSize" />{{ opt.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'fontFamily' && rte.moreFontFamilyOpen"
              class="rte-menu rte-more-flyout rte-font-family-menu"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.FONT_FAMILY_OPTIONS"
                :key="'mff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontFamily() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentFontFamily() || '')"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="rte.applyFontFamily(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="fontFamily" />{{ opt.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'lineHeight' && rte.moreLineHeightOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.LINE_HEIGHT_OPTIONS"
                :key="'mlh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentLineHeight() || '') }"
                :aria-pressed="(opt.value || '') === (rte.currentLineHeight() || '')"
                @click="rte.applyLineHeight(opt.value)"
              ><RteMenuGlyph :label="opt.label" fallback="lineHeight" />{{ opt.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'caseTransform' && rte.caseMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <template v-for="item in rte.TEXT_MENU_ITEMS" :key="'mcase-' + item.id">
                <div v-if="item.sep" data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
                <button
                  v-else
                  data-rte-own
                  type="button"
                  :class="{ active: rte.textMenuActive(item.id) }"
                  :title="toolbarMenuItemTitle(item.label) || undefined"
                  @click="rte.runTextMenu(item.id)"
                ><RteMenuGlyph :id="item.id" :label="item.label" />{{ item.label }}</button>
              </template>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'zoom' && rte.zoomMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="z in rte.RTE_ZOOM_PRESETS"
                :key="'mz-' + z.value"
                type="button"
                :class="{ active: rte.editorZoom === z.value }"
                :aria-pressed="rte.editorZoom === z.value"
                :title="toolbarMenuItemTitle(z.label) || undefined"
                @click="rte.setEditorZoom(z.value)"
              ><RteMenuGlyph :label="z.label" fallback="zoom" />{{ z.label }}</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'viewExtras' && rte.viewExtrasOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own type="button" :class="{ active: rte.focusMode }" :aria-pressed="rte.focusMode" @click="rte.toggleFocusMode"><RteMenuGlyph label="专注模式" />专注模式</button>
              <button data-rte-own type="button" :class="{ active: rte.darkEditor }" :aria-pressed="rte.darkEditor" @click="rte.toggleDarkEditor"><RteMenuGlyph label="暗色编辑区" />暗色编辑区</button>
              <button data-rte-own type="button" :class="{ active: rte.paperGuide }" :aria-pressed="rte.paperGuide" @click="rte.togglePaperGuide"><RteMenuGlyph label="纸张参考线" />纸张参考线</button>
              <template data-rte-own v-if="rte.pageSheetEnabled">
                <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
                <div data-rte-own class="rte-page-size-label">页面大小</div>
                <button data-rte-own
                  v-for="opt in rte.RTE_PAGE_SIZES"
                  :key="'mps-' + opt.id"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="rte.pageSize === opt.id"
                  :class="{ active: rte.pageSize === opt.id }"
                  :title="pageSizeTitle(opt.id) || opt.hint"
                  @click="rte.setPageSize(opt.id)"
                ><RteMenuGlyph :id="opt.id" :label="opt.label" fallback="page" />{{ opt.label }}<span data-rte-own class="rte-menu-hint">{{ opt.hint }}</span></button>
              </template>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'form' && rte.moreFormOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own type="button" title="插入一组只能选一个的选项" @click="rte.insertFormRadio()"><RteMenuGlyph label="单选组" />单选组</button>
              <button data-rte-own type="button" title="插入一组可以多选的选项" @click="rte.insertFormCheckbox()"><RteMenuGlyph label="多选组" />多选组</button>
              <button data-rte-own type="button" title="插入一行文字填写框" @click="rte.insertFormText()"><RteMenuGlyph label="文本输入" />文本输入</button>
              <button data-rte-own type="button" title="插入可以写多行的填写框" @click="rte.insertFormTextarea()"><RteMenuGlyph label="多行文本" />多行文本</button>
              <button data-rte-own type="button" title="插入只接受数字的填写框" @click="rte.insertFormNumber()"><RteMenuGlyph label="数字输入" />数字输入</button>
              <button data-rte-own type="button" title="插入从列表里选一项的框" @click="rte.insertFormSelect()"><RteMenuGlyph label="下拉选择" />下拉选择</button>
              <button data-rte-own type="button" title="插入选择日期的框" @click="rte.insertFormDate()"><RteMenuGlyph label="日期" />日期</button>
              <button data-rte-own type="button" title="插入选择日期和时间的框" @click="rte.insertFormDateTime()"><RteMenuGlyph label="日期时间" />日期时间</button>
              <button data-rte-own type="button" title="插入开或关的开关" @click="rte.insertFormSwitch()"><RteMenuGlyph label="开关" />开关</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" title="再复制一个选中的表单字段" @click="rte.duplicateSelectedForm()"><RteMenuGlyph label="复制当前字段" />复制当前字段</button>
              <button data-rte-own type="button" title="检查必填项有没有空着" @click="rte.checkFormFields()"><RteMenuGlyph label="检查填写" />检查填写</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" title="打开表格尺寸对话框，自己填行数和列数" @click="rte.moreFormOpen = false; rte.moreOpen = false; rte.openTableDialog()"><RteMenuGlyph label="表格" />表格</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'template' && rte.moreTemplateOpen"
              class="rte-menu rte-more-flyout rte-template-menu"
              @mousedown.prevent
            >
              <div data-rte-own class="rte-template-menu-body">
              <template v-for="g in rte.RTE_DOC_TEMPLATE_GROUPS" :key="'m-' + g.id">
                <div data-rte-own class="rte-menu-section-label">{{ g.label }}</div>
                <div data-rte-own class="rte-template-grid">
                  <button data-rte-own
                    v-for="tpl in rte.RTE_DOC_TEMPLATES.filter((x: any) => x.group === g.id)"
                    :key="tpl.id"
                    type="button"
                    class="rte-template-item"
                    :title="tpl.description || tpl.label"
                    @click.stop="rte.insertDocTemplate(tpl.id)"
                  >
                    <RteMenuGlyph :id="tpl.id" :label="tpl.label" fallback="template" />
                    <span data-rte-own class="rte-template-item-label">{{ tpl.label }}</span>
                    <span data-rte-own v-if="tpl.description" class="rte-template-item-desc">{{
                      tpl.description
                    }}</span>
                  </button>
                </div>
              </template>
              </div>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'color' && rte.moreColorOpen"
              class="rte-menu rte-color-menu rte-more-flyout"
              @mousedown.prevent
            >
              <RteColorBoard data-rte-own kind="text" />
            </div>
            <div data-rte-own
              v-if="mt.kind === 'callout' && rte.moreCalloutOpen"
              class="rte-menu rte-callout-menu rte-more-flyout"
              @mousedown.prevent
            >
              <div data-rte-own class="rte-menu-section-label">插入告示框</div>
              <button data-rte-own
                v-for="it in rte.CALLOUT_MENU_ITEMS"
                :key="'mco-' + it.variant"
                type="button"
                :class="{ active: rte.isActive('callout', { variant: it.variant }) }"
                :aria-pressed="rte.isActive('callout', { variant: it.variant })"
                :title="blockMenuTitle('callout-' + it.variant) || undefined"
                @click="rte.insertCallout(it.variant)"
              >
                <span data-rte-own class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span data-rte-own>{{ it.label }}</span>
                <span data-rte-own class="rte-menu-hint">{{ it.hint }}</span>
              </button>
            </div>
            <div data-rte-own
              v-if="mt.key === 'highlight' && rte.moreHighlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu rte-more-flyout"
              role="dialog"
              aria-label="高亮颜色"
              @mousedown.prevent
            >
              <RteColorBoard data-rte-own kind="highlight" />
            </div>
            </template>
          </div>
          </div>
        </Teleport>
      </div>

      <!-- 紧凑「更多」打开的浮层面板（顶栏无对应按钮时，锚到「更多」） -->
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.emojiOpen"
          class="rte-emoji-panel"
          v-rte-float="'emoji'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('emoji')"
          @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
        >
          <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="表情分类">
            <button data-rte-own
              v-for="cat in rte.RTE_EMOJI_CATEGORIES"
              :key="'c-em-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: rte.emojiTabId === cat.id }"
              :aria-selected="rte.emojiTabId === cat.id"
              :title="pickerTabTitle(cat.label) || undefined"
              @click.stop="rte.emojiTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div data-rte-own
            class="rte-picker-grid rte-emoji-grid"
            :class="{ 'rte-emoji-grid--large': rte.isLargeEmojiTab, 'rte-emoji-grid--kaomoji': rte.isKaomojiTab }"
            role="tabpanel"
          >
            <button data-rte-own
              v-for="em in rte.activeEmojiList"
              :key="'c-em-' + rte.emojiTabId + '-' + em"
              type="button"
              class="rte-emoji-btn"
              :class="{ 'rte-emoji-btn--kaomoji': rte.isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
              :title="em"
              @click="rte.insertEmoji(em)"
            >{{ em }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.specialCharsOpen"
          class="rte-specialchars-panel"
          v-rte-float="'specialChars'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('specialChars')"
          @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
        >
          <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="字符分类">
            <button data-rte-own
              v-for="cat in rte.RTE_SPECIAL_CHAR_CATEGORIES"
              :key="'c-sc-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: rte.specialCharTabId === cat.id }"
              :aria-selected="rte.specialCharTabId === cat.id"
              :title="pickerTabTitle(cat.label) || undefined"
              @click.stop="rte.specialCharTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div data-rte-own class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
            <button data-rte-own
              v-for="ch in rte.activeSpecialCharList"
              :key="'c-sc-' + rte.specialCharTabId + '-' + ch"
              type="button"
              class="rte-specialchars-btn"
              :title="ch"
              @click="rte.insertSpecialChar(ch)"
            >{{ ch }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.spacingOpen"
          class="rte-spacing-panel"
          v-rte-float="'spacing'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('spacing')"
          @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
        >
          <RteSpacingFields
            :margin-top="rte.currentMarginTop()"
            :margin-bottom="rte.currentMarginBottom()"
            :letter-spacing="rte.currentLetterSpacing()"
            :text-indent="rte.currentTextIndent()"
            :text-dir="rte.currentTextDir()"
            @margin-top="rte.applyMarginTop"
            @margin-bottom="rte.applyMarginBottom"
            @letter-spacing="rte.applyLetterSpacing"
            @text-indent="rte.applyTextIndent"
            @text-dir="rte.applyTextDir"
          />
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.wordStatsOpen"
          class="rte-wordstats-panel"
          v-rte-float="'wordStats'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('wordStats')"
          @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
        >
          <div data-rte-own class="rte-wordstats-title">字数统计</div>
          <p data-rte-own class="rte-wordstats-note">全文含标题、表格和代码中的文字，不含评论。</p>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('chars')"><span data-rte-own>全文（去空白）</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('words')"><span data-rte-own>词数（估）</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('minutes')"><span data-rte-own>阅读约</span><strong data-rte-own>{{ rte.readingMinutes }} 分钟</strong></div>
          <div data-rte-own class="rte-wordstats-divider" />
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('paragraphs')"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('lines')"><span data-rte-own>行数</span><strong data-rte-own>{{ rte.docExtraStats.lines }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('headings')"><span data-rte-own>标题数</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('cjk')"><span data-rte-own>汉字</span><strong data-rte-own>{{ rte.docExtraStats.cjk }}</strong></div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('ascii')"><span data-rte-own>英文词</span><strong data-rte-own>{{ rte.docExtraStats.asciiWords }}</strong></div>
          <div data-rte-own class="rte-wordstats-divider" />
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('selectionChars')">
            <span data-rte-own>选区字符</span>
            <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
          </div>
          <div data-rte-own class="rte-wordstats-row" :title="wordStatTitle('selectionWords')">
            <span data-rte-own>选区词数</span>
            <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.words : '—' }}</strong>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.shortcutsOpen"
          class="rte-shortcuts-panel"
          v-rte-float="'shortcuts'"
          role="dialog"
          aria-label="快捷键说明"
          tabindex="-1"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('shortcuts')"
          @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
        >
          <div data-rte-own class="rte-shortcuts-title">快捷键速查</div>
          <input data-rte-own
            v-model="rte.shortcutQuery"
            class="rte-shortcuts-search"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="搜索，例如 bold、引用、tab"
            title="搜快捷键，可以打 bold、引用或 tab"
            aria-label="搜索快捷键"
            @mousedown.stop
            @keydown.stop
          />
          <div data-rte-own v-if="!rte.filteredShortcutGroups.length" class="rte-shortcuts-empty">没有匹配的快捷键</div>
          <div data-rte-own
            v-for="g in rte.filteredShortcutGroups"
            :key="'c-scg-' + g.title"
            class="rte-shortcuts-group"
          >
            <div data-rte-own class="rte-shortcuts-group-title">{{ g.title }}</div>
            <div data-rte-own
              v-for="(it, i) in g.items"
              :key="'c-sci-' + g.title + '-' + i"
              class="rte-shortcuts-row"
            >
              <kbd data-rte-own class="rte-kbd">{{ it.keys }}</kbd>
              <span data-rte-own>{{ it.desc }}</span>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 分组内的按钮显隐与顺序（右键分组打开） -->
      <Teleport to="body">
        <div data-rte-own
          v-if="rte.toolbarGroupButtonsOpen"
          class="rte-menu rte-float-menu rte-group-buttons-menu"
          v-rte-float="'toolbarGroupButtons'"
          role="menu"
          aria-label="组内按钮"
          @mousedown.prevent
        >
          <div data-rte-own class="rte-menu-section-label">
            {{ (rte.visibleToolbarGroups.find((group) => group.id === rte.toolbarGroupButtonsGroupId) || {}).label || '本分组' }}
            · 个性化设置
          </div>
          <div data-rte-own
            v-for="entry in rte.toolbarGroupButtonEntries(rte.toolbarGroupButtonsGroupId)"
            :key="'gb-' + entry.key"
            class="rte-group-button-row"
          >
            <label data-rte-own class="rte-group-button-check">
              <input
                data-rte-own
                type="checkbox"
                :checked="!entry.hidden"
                :aria-label="'显示' + entry.label"
                @change="rte.toggleToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key)"
              />
              <span data-rte-own>{{ entry.label }}</span>
            </label>
            <button
              data-rte-own
              type="button"
              class="rte-group-button-move"
              :aria-label="'把' + entry.label + '上移一位'"
              :title="'把' + entry.label + '上移一位'"
              @click="rte.moveToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key, -1)"
            >
              ↑
            </button>
            <button
              data-rte-own
              type="button"
              class="rte-group-button-move"
              :aria-label="'把' + entry.label + '下移一位'"
              :title="'把' + entry.label + '下移一位'"
              @click="rte.moveToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key, 1)"
            >
              ↓
            </button>
          </div>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" title="把显隐和顺序恢复成最初的样子" @click="rte.restoreToolbarGroupButtons(rte.toolbarGroupButtonsGroupId)">恢复本组默认</button>
          <button data-rte-own type="button" title="关闭分组设置" @click="rte.closeToolbarGroupButtons()">完成</button>
        </div>
      </Teleport>

      </div>
    </div>
</template>
