<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { DocumentSummary } from '../../api/documents'
import { TEMPLATE_META, type TemplateCategory, type TemplateId } from '../../stores/document'
import GuideUserCard from './GuideUserCard.vue'
import GuideThumb from './GuideThumb.vue'

const ASIDE_COLLAPSE_KEY = 'metamatrix:guide:asideCollapsed'
const ASIDE_WIDTH_KEY = 'metamatrix:guide:asideWidth'
const NARROW_MQ = '(max-width: 900px)'
const DEFAULT_WIDTH = 300
const MIN_WIDTH = 220
const MAX_WIDTH_ABS = 480

const props = defineProps<{
  recent: DocumentSummary[]
  authenticated: boolean
}>()

const emit = defineEmits<{
  open: [doc: DocumentSummary]
  logout: []
  'update:collapsed': [value: boolean]
}>()

const collapsed = ref(false)
const isNarrow = ref(false)
const asideWidth = ref(DEFAULT_WIDTH)
const dragging = ref(false)
let mq: MediaQueryList | null = null
let dragCleanup: (() => void) | null = null

type DayGroupKey = 'today' | 'yesterday' | 'earlier'

const GROUP_LABELS: Record<DayGroupKey, string> = {
  today: '今天',
  yesterday: '昨天',
  earlier: '更早',
}

const CATEGORY_ACCENT: Record<TemplateCategory, string> = {
  method: '#1a73e8',
  growth: '#34a853',
  industry: '#f9a825',
  org: '#a142f4',
  review: '#ea4335',
}

function clampWidth(w: number): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const maxByViewport = Math.floor(vw * 0.4)
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH_ABS, maxByViewport))
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, w)))
}

function readPersistedCollapsed(): boolean | null {
  try {
    const raw = localStorage.getItem(ASIDE_COLLAPSE_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    /* ignore */
  }
  return null
}

function persistCollapsed(value: boolean) {
  try {
    localStorage.setItem(ASIDE_COLLAPSE_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readPersistedWidth(): number | null {
  try {
    const raw = localStorage.getItem(ASIDE_WIDTH_KEY)
    if (raw == null) return null
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return clampWidth(n)
  } catch {
    /* ignore */
  }
  return null
}

function persistWidth(value: number) {
  try {
    localStorage.setItem(ASIDE_WIDTH_KEY, String(value))
  } catch {
    /* ignore */
  }
}

function setCollapsed(value: boolean, persist = true) {
  collapsed.value = value
  emit('update:collapsed', value)
  if (persist && !isNarrow.value) persistCollapsed(value)
}

function toggle() {
  setCollapsed(!collapsed.value, true)
}

function expandFromRail() {
  setCollapsed(false, true)
}

function onMqChange() {
  const narrow = Boolean(mq?.matches)
  isNarrow.value = narrow
  if (narrow) {
    // Overlay pattern: start collapsed on narrow; do not overwrite desktop preference.
    collapsed.value = true
    emit('update:collapsed', true)
  } else {
    const saved = readPersistedCollapsed()
    collapsed.value = saved ?? false
    emit('update:collapsed', collapsed.value)
    asideWidth.value = readPersistedWidth() ?? DEFAULT_WIDTH
  }
}

function onResizePointerDown(e: PointerEvent) {
  if (collapsed.value || isNarrow.value) return
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()

  dragCleanup?.()
  dragging.value = true
  const startX = e.clientX
  const startW = asideWidth.value

  const onMove = (ev: PointerEvent) => {
    // Left-edge handle: drag left → wider, drag right → narrower
    const delta = startX - ev.clientX
    asideWidth.value = clampWidth(startW + delta)
  }

  const onUp = () => {
    dragging.value = false
    persistWidth(asideWidth.value)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    dragCleanup = null
  }

  dragCleanup = onUp
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

const asideStyle = computed(() => {
  if (collapsed.value || isNarrow.value) return undefined
  const w = `${asideWidth.value}px`
  return {
    width: w,
    flex: `0 0 ${w}`,
  }
})

onMounted(() => {
  mq = window.matchMedia(NARROW_MQ)
  isNarrow.value = mq.matches
  asideWidth.value = readPersistedWidth() ?? DEFAULT_WIDTH
  if (isNarrow.value) {
    collapsed.value = true
  } else {
    collapsed.value = readPersistedCollapsed() ?? false
  }
  emit('update:collapsed', collapsed.value)
  mq.addEventListener('change', onMqChange)
})

onUnmounted(() => {
  mq?.removeEventListener('change', onMqChange)
  dragCleanup?.()
})

function resolveTemplateId(d: DocumentSummary): TemplateId | null {
  const tid = (d.templateId || d.canvasType || '') as TemplateId
  return TEMPLATE_META[tid] ? tid : null
}

/** Non-null TemplateId for GuideThumb; only call when resolveTemplateId(d) is truthy. */
function thumbTemplateId(d: DocumentSummary): TemplateId {
  return resolveTemplateId(d) ?? 'dual-triangle'
}

function templateAccent(d: DocumentSummary): string {
  const tid = resolveTemplateId(d)
  if (!tid) return '#7c4dff'
  const cat = TEMPLATE_META[tid].category
  return CATEGORY_ACCENT[cat] || '#7c4dff'
}

function templateTitleAttr(d: DocumentSummary): string {
  const tid = resolveTemplateId(d)
  if (!tid) return d.templateId || d.canvasType || '画布'
  return TEMPLATE_META[tid].name || TEMPLATE_META[tid].badge
}

/** Local calendar day start (Asia/Shanghai when the machine is in that zone). */
function dayStartMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function groupKeyFor(iso: string, todayStart: number, yesterdayStart: number): DayGroupKey {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return 'earlier'
  const start = dayStartMs(t)
  if (start >= todayStart) return 'today'
  if (start >= yesterdayStart) return 'yesterday'
  return 'earlier'
}

const groupedRecent = computed(() => {
  const now = new Date()
  const todayStart = dayStartMs(now)
  const yesterdayStart = todayStart - 86_400_000
  const buckets: Record<DayGroupKey, DocumentSummary[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  }
  for (const d of props.recent) {
    buckets[groupKeyFor(d.updatedAt, todayStart, yesterdayStart)].push(d)
  }
  const order: DayGroupKey[] = ['today', 'yesterday', 'earlier']
  return order
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({
      key: k,
      label: GROUP_LABELS[k],
      items: buckets[k],
    }))
})

const panelTitle = computed(() => '最近文档')
</script>

<template>
  <!-- Expanded overlay backdrop on narrow -->
  <div
    v-if="isNarrow && !collapsed"
    class="aside-backdrop"
    aria-hidden="true"
    @click="setCollapsed(true, false)"
  />

  <aside
    class="guide-aside"
    :class="{
      'guide-aside--collapsed': collapsed,
      'guide-aside--narrow': isNarrow,
      'guide-aside--overlay': isNarrow && !collapsed,
      'guide-aside--dragging': dragging,
    }"
    :style="asideStyle"
    :aria-label="panelTitle"
  >
    <div
      v-if="!collapsed && !isNarrow"
      class="aside-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧栏宽度"
      :aria-valuenow="asideWidth"
      :aria-valuemin="220"
      :aria-valuemax="480"
      @pointerdown="onResizePointerDown"
    />

    <button
      v-if="collapsed"
      type="button"
      class="rail-toggle"
      :aria-expanded="false"
      :aria-label="`展开${panelTitle}`"
      :title="panelTitle"
      @click="expandFromRail"
    >
      <span class="chev" aria-hidden="true">‹</span>
      <span class="rail-label">最近</span>
    </button>

    <div v-show="!collapsed" class="aside-inner">
      <div class="aside-toolbar">
        <span class="toolbar-label">最近</span>
        <div class="toolbar-actions">
          <button
            type="button"
            class="icon-btn"
            aria-label="筛选（即将推出）"
            title="筛选"
            disabled
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 .4.8L9.5 9.2V13a.5.5 0 0 1-.8.4l-2-1.5A.5.5 0 0 1 6.5 11.5V9.2L2.1 3.8A.5.5 0 0 1 2 3.5z"
              />
            </svg>
          </button>
          <button
            type="button"
            class="icon-btn collapse-btn"
            :aria-expanded="true"
            :aria-label="`收起${panelTitle}`"
            title="收起侧栏"
            @click="toggle"
          >
            ›
          </button>
        </div>
      </div>

      <div class="aside-body">
        <p v-if="!authenticated" class="empty">登录后查看最近文档</p>
        <p v-else-if="!recent.length" class="empty">暂无文档，从左侧选模板开始</p>
        <template v-else>
          <section
            v-for="group in groupedRecent"
            :key="group.key"
            class="day-group"
          >
            <div class="section-title-row">
              <h2 class="section-title">{{ group.label }}</h2>
            </div>
            <ul class="doc-list">
              <li v-for="d in group.items" :key="d.id">
                <button
                  type="button"
                  class="doc-item"
                  :title="templateTitleAttr(d)"
                  @click="emit('open', d)"
                >
                  <span
                    class="doc-icon"
                    :style="{ '--accent': templateAccent(d) }"
                    aria-hidden="true"
                  >
                    <GuideThumb
                      v-if="resolveTemplateId(d)"
                      :template-id="thumbTemplateId(d)"
                      size="sm"
                    />
                    <!-- Fallback when templateId unknown: fine accent-tinted mark -->
                    <svg
                      v-else
                      class="doc-icon-fallback"
                      viewBox="0 0 20 20"
                      width="14"
                      height="14"
                    >
                      <rect
                        x="3.5"
                        y="2.5"
                        width="13"
                        height="15"
                        rx="2.25"
                        fill="none"
                        stroke="var(--accent)"
                        stroke-width="1.25"
                        opacity="0.9"
                      />
                      <rect
                        x="6"
                        y="6"
                        width="8"
                        height="1.5"
                        rx="0.75"
                        fill="var(--accent)"
                      />
                      <rect
                        x="6"
                        y="9.25"
                        width="8"
                        height="1.25"
                        rx="0.625"
                        fill="var(--accent)"
                        opacity="0.65"
                      />
                      <rect
                        x="6"
                        y="12.25"
                        width="5"
                        height="1.25"
                        rx="0.625"
                        fill="var(--accent)"
                        opacity="0.45"
                      />
                    </svg>
                  </span>
                  <span class="doc-title">{{ d.title || '未命名文档' }}</span>
                </button>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <div class="aside-foot">
        <GuideUserCard @logout="emit('logout')" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.aside-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(32, 33, 36, 0.28);
}

.guide-aside {
  position: relative;
  z-index: 41;
  flex: 0 0 300px;
  width: 300px;
  max-width: 100%;
  height: 100%;
  border-left: 1px solid #e8eaed;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  transition: width 0.18s ease, flex-basis 0.18s ease;
}

.guide-aside--dragging {
  transition: none;
}

.guide-aside--collapsed {
  flex-basis: 44px !important;
  width: 44px !important;
}

.guide-aside--overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  flex-basis: min(320px, 88vw) !important;
  width: min(320px, 88vw) !important;
  box-shadow: -8px 0 28px rgba(32, 33, 36, 0.12);
  background: #f8f9fa;
}

.aside-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-50%);
  z-index: 5;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
}

.aside-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 1px;
  background: transparent;
  transition: background 0.15s ease;
}

.aside-resize-handle:hover::after,
.aside-resize-handle:focus-visible::after,
.guide-aside--dragging .aside-resize-handle::after {
  background: #1a73e8;
}

.aside-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.aside-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 8px 14px;
  background: #f8f9fa;
}

.toolbar-label {
  font-size: 12px;
  font-weight: 650;
  color: #5f6368;
  letter-spacing: 0.02em;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #5f6368;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(32, 33, 36, 0.06);
  color: #202124;
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.collapse-btn {
  font-size: 16px;
  border: 1px solid #dadce0;
  background: #ffffff;
}

.collapse-btn:hover:not(:disabled) {
  background: #f1f3f4;
  color: #202124;
}

.aside-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 16px;
  min-height: 0;
}

.day-group + .day-group {
  margin-top: 18px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 4px 4px;
  padding: 2px 6px 6px;
}

.section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: #9aa0a6;
  letter-spacing: 0.02em;
}

.empty {
  margin: 12px 8px 0;
  font-size: 12.5px;
  color: #9aa0a6;
  line-height: 1.5;
}

.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-item {
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 10px;
  background: transparent;
  padding: 9px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  color: #202124;
  transition: background 0.12s ease;
}

.doc-item:hover,
.doc-item:focus-visible {
  background: rgba(32, 33, 36, 0.06);
  outline: none;
}

.doc-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Category / TEMPLATE_META accent tint — matches left-card category language */
  background: color-mix(in srgb, var(--accent, #7c4dff) 14%, #ffffff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #7c4dff) 20%, transparent);
}

.doc-icon :deep(.thumb--sm) {
  width: 20px;
  height: 20px;
}

.doc-icon-fallback {
  display: block;
}

.doc-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aside-foot {
  flex-shrink: 0;
  margin-top: auto;
  border-top: 1px solid rgba(232, 234, 237, 0.9);
  background: transparent;
  padding: 2px 0 4px;
}

.rail-toggle {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  color: #5f6368;
}

.rail-toggle:hover {
  background: #f1f3f4;
  color: #1a73e8;
}

.chev {
  font-size: 18px;
  line-height: 1;
}

.rail-label {
  writing-mode: vertical-rl;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
}
</style>
