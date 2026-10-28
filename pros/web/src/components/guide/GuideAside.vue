<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { DocumentSummary } from '../../api/documents'
import { TEMPLATE_META, type TemplateId } from '../../stores/document'
import GuideUserCard from './GuideUserCard.vue'

const ASIDE_COLLAPSE_KEY = 'metamatrix:guide:asideCollapsed'
const NARROW_MQ = '(max-width: 900px)'

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
let mq: MediaQueryList | null = null

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
  }
}

onMounted(() => {
  mq = window.matchMedia(NARROW_MQ)
  isNarrow.value = mq.matches
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
})

function templateLabel(d: DocumentSummary): string {
  const tid = (d.templateId || d.canvasType || '') as TemplateId
  const meta = TEMPLATE_META[tid]
  if (meta?.badge) return meta.badge
  if (meta?.name) return meta.name
  return tid || '画布'
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const sec = Math.round(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} 天前`
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

const panelTitle = computed(() => '我的最近文档')
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
    }"
    :aria-label="panelTitle"
  >
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
      <div class="aside-head">
        <GuideUserCard @logout="emit('logout')" />
        <button
          type="button"
          class="collapse-btn"
          :aria-expanded="true"
          :aria-label="`收起${panelTitle}`"
          title="收起侧栏"
          @click="toggle"
        >
          ›
        </button>
      </div>

      <div class="aside-body">
        <div class="section-title-row">
          <h2 class="section-title">{{ panelTitle }}</h2>
        </div>

        <p v-if="!authenticated" class="empty">登录后查看最近文档</p>
        <p v-else-if="!recent.length" class="empty">暂无文档，从左侧选模板开始</p>
        <ul v-else class="doc-list">
          <li v-for="d in recent" :key="d.id">
            <button type="button" class="doc-item" @click="emit('open', d)">
              <strong class="doc-title">{{ d.title || '未命名文档' }}</strong>
              <span class="doc-meta">
                <span class="doc-badge">{{ templateLabel(d) }}</span>
                <span class="doc-time">{{ relativeTime(d.updatedAt) }}</span>
              </span>
            </button>
          </li>
        </ul>
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

.guide-aside--collapsed {
  flex-basis: 44px;
  width: 44px;
}

.guide-aside--overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  flex-basis: min(320px, 88vw);
  width: min(320px, 88vw);
  box-shadow: -8px 0 28px rgba(32, 33, 36, 0.12);
  background: #f8f9fa;
}

.aside-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.aside-head {
  position: relative;
  flex-shrink: 0;
  padding-right: 36px;
  background: #ffffff;
  border-bottom: 1px solid #e8eaed;
}

.collapse-btn {
  position: absolute;
  top: 10px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #ffffff;
  color: #5f6368;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.collapse-btn:hover {
  background: #f1f3f4;
  color: #202124;
}

.aside-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 12px 20px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 2px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: #202124;
  letter-spacing: 0.01em;
}

.empty {
  margin: 8px 2px 0;
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
  gap: 6px;
}

.doc-item {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px 11px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #202124;
  box-shadow: 0 1px 2px rgba(32, 33, 36, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.doc-item:hover,
.doc-item:focus-visible {
  border-color: #dadce0;
  box-shadow: 0 2px 8px rgba(32, 33, 36, 0.08);
  outline: none;
}

.doc-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.doc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.doc-badge {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  background: #e8eaed;
  color: #3c4043;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-time {
  font-size: 11.5px;
  color: #9aa0a6;
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
