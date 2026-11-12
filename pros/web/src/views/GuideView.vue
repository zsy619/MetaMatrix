<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TemplateCategory, TemplateId } from '../stores/document'
import { CATEGORY_LABELS, TEMPLATE_META } from '../stores/document'
import { CATEGORY_ACCENT } from '../components/workspace/palette'
import { useAuthStore } from '../stores/auth'
import type { DocumentSummary, SearchHit } from '../api/documents'
import HighlightText from '../components/ui/HighlightText.vue'
import { listDocuments, searchDocuments } from '../api/documents'
import { friendlyApiMessage } from '../utils/apiMessage'
import GuideThumb from '../components/guide/GuideThumb.vue'
import GuideAside from '../components/guide/GuideAside.vue'
import LaunchSplash from '../components/guide/LaunchSplash.vue'
import { LAUNCH_SEEN_KEY, shouldShowLaunch } from '../components/guide/launchSplash'
import { guideLaneCount, lanesFor, splitMatch } from '../components/guide/guideLanes'
import { draftWhen, readLocalDrafts, type LocalDraft } from '../components/guide/guideDrafts'

interface GuideCard {
  id: TemplateId
  name: string
  badge: string
  description: string
  category: TemplateCategory
}

const router = useRouter()
const auth = useAuthStore()
const recent = ref<DocumentSummary[]>([])
const recentLoading = ref(false)
const recentError = ref('')
const searchQ = ref('')
const searchHits = ref<SearchHit[]>([])
const searching = ref(false)
const searchErr = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchAbort: AbortController | null = null

function readStoredCategory(): 'all' | TemplateCategory {
  try {
    const raw = sessionStorage.getItem('metamatrix:guide-category')
    if (raw === 'all' || (raw && raw in CATEGORY_LABELS)) return raw as 'all' | TemplateCategory
  } catch {
    /* ignore */
  }
  return 'all'
}

function readLaunchVisible(): boolean {
  if (typeof window === 'undefined') return false
  let seen: string | null = null
  try {
    seen = sessionStorage.getItem(LAUNCH_SEEN_KEY)
  } catch {
    seen = null
  }
  return shouldShowLaunch(window.location.search, seen)
}

const showLaunch = ref(readLaunchVisible())
const activeCategory = ref<'all' | TemplateCategory>(readStoredCategory())
const templateFilter = ref('')
const asideCollapsed = ref(false)

const CATEGORY_BLURBS: Record<TemplateCategory, string> = {
  method: '双三角、五步法、Y 模型',
  growth: '商业模式、精益画布、价值主张',
  industry: '行业分析、波特五力、OSCAR',
  org: '7S、RACI、每日看板',
  review: '周月季年、故障复盘',
  fde: '选场景、十格自检、试点',
}

const categoryChips: { id: 'all' | TemplateCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  ...(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
  })),
]

/** 五步法系列固定相邻顺序：基础 → 分工 → 提高 → 进阶 → 挑战 → 原版 */
const FIVE_STEP_SERIES: TemplateId[] = [
  'five-step-basic',
  'five-step-division',
  'five-step-advanced',
  'five-step-pro',
  'five-step-challenge',
  'five-step',
]

const allCards: GuideCard[] = (() => {
  const ids = Object.keys(TEMPLATE_META) as TemplateId[]
  const seriesSet = new Set(FIVE_STEP_SERIES)
  const ordered: TemplateId[] = []
  let seriesInserted = false
  for (const id of ids) {
    if (seriesSet.has(id)) {
      if (!seriesInserted) {
        ordered.push(...FIVE_STEP_SERIES)
        seriesInserted = true
      }
      continue
    }
    ordered.push(id)
  }
  if (!seriesInserted) ordered.push(...FIVE_STEP_SERIES)
  return ordered.map((id) => ({
    id,
    name: TEMPLATE_META[id].name,
    badge: TEMPLATE_META[id].badge,
    description: TEMPLATE_META[id].description,
    category: TEMPLATE_META[id].category,
  }))
})()

const categoryCounts = computed(() => {
  const counts: Record<string, number> = { all: allCards.length }
  for (const card of allCards) counts[card.category] = (counts[card.category] || 0) + 1
  return counts
})

const templatesEl = ref<HTMLElement | null>(null)
const guideMainEl = ref<HTMLElement | null>(null)
const LAYOUT_KEY = 'metamatrix:guide-layout'
const layout = ref<'cards' | 'list'>(readLayout())
const drafts = ref<LocalDraft[]>([])
const activeLane = ref('')

function readLayout(): 'cards' | 'list' {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

const filteredCards = computed(() => {
  const q = templateFilter.value.trim().toLowerCase()
  return allCards.filter((card) => {
    if (activeCategory.value !== 'all' && card.category !== activeCategory.value) {
      return false
    }
    if (!q) return true
    return (
      card.name.toLowerCase().includes(q) ||
      card.description.toLowerCase().includes(q) ||
      card.badge.toLowerCase().includes(q) ||
      (q.includes('五步') && FIVE_STEP_SERIES.includes(card.id))
    )
  })
})

const visibleGroups = computed(() => {
  const order = Object.keys(CATEGORY_LABELS) as TemplateCategory[]
  return order
    .filter((id) => activeCategory.value === 'all' || activeCategory.value === id)
    .map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      blurb: CATEGORY_BLURBS[id],
      cards: filteredCards.value.filter((card) => card.category === id),
    }))
    .filter((group) => group.cards.length > 0)
})

const currentLaneBlocks = computed(() => {
  if (activeCategory.value === 'all') return []
  const group = visibleGroups.value.find((item) => item.id === activeCategory.value)
  if (!group) return []
  return lanesFor(group.id, group.cards)
})

function categoryAccent(id: 'all' | TemplateCategory): string {
  if (id === 'all') return '#1a73e8'
  return CATEGORY_ACCENT[id]
}

function categoryBlurb(id: 'all' | TemplateCategory): string {
  if (id === 'all') return ''
  return CATEGORY_BLURBS[id]
}

function laneDomId(category: TemplateCategory, laneId: string): string {
  return `lane-${category}-${laneId}`
}

function currentLaneDomId(laneId: string): string {
  if (activeCategory.value === 'all') return ''
  return laneDomId(activeCategory.value, laneId)
}

function draftMeta(draft: LocalDraft): string {
  const meta = TEMPLATE_META[draft.templateId]
  const label = draft.title === meta.name ? CATEGORY_LABELS[meta.category] : meta.name
  return `${label} · ${draftWhen(draft.updatedAt)}`
}

function refreshDrafts() {
  if (typeof localStorage === 'undefined') return
  const entries: { key: string; value: string }[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('metamatrix:doc-meta:')) continue
    entries.push({ key, value: localStorage.getItem(key) || '' })
  }
  drafts.value = readLocalDrafts(entries)
}

function setLayout(next: 'cards' | 'list') {
  layout.value = next
  try {
    localStorage.setItem(LAYOUT_KEY, next)
  } catch {
    /* ignore */
  }
}

function scrollToLane(id: string) {
  activeLane.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onGuideScroll() {
  if (activeCategory.value === 'all') return
  const bar = templatesEl.value?.querySelector('.templates-toolbar')
  const edge = (bar?.getBoundingClientRect().bottom ?? 0) + 12
  let current = ''
  for (const lane of document.querySelectorAll<HTMLElement>('.lane[id]')) {
    if (lane.getBoundingClientRect().top <= edge) current = lane.id
  }
  if (current) activeLane.value = current
}

function finishLaunch() {
  showLaunch.value = false
  try {
    sessionStorage.setItem(LAUNCH_SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

function chooseCategory(id: 'all' | TemplateCategory, scroll = false) {
  activeCategory.value = id
  try {
    sessionStorage.setItem('metamatrix:guide-category', id)
  } catch {
    /* ignore */
  }
  if (!scroll) return
  void nextTick(() => {
    templatesEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function resetTemplateFilter() {
  templateFilter.value = ''
  chooseCategory('all')
}

function openCanvas(id: TemplateId) {
  router.push({ name: 'canvas', params: { templateId: id } })
}

function onLogout() {
  recent.value = []
  recentError.value = ''
  searchHits.value = []
  searchQ.value = ''
  searchErr.value = ''
}

async function refreshRecent() {
  if (!auth.isAuthenticated) {
    recent.value = []
    recentError.value = ''
    return
  }
  recentLoading.value = true
  recentError.value = ''
  try {
    recent.value = await listDocuments({ limit: 12 })
  } catch (e) {
    recent.value = []
    recentError.value = friendlyApiMessage(e, '最近文档暂时不可用')
  } finally {
    recentLoading.value = false
  }
}

function openDoc(d: DocumentSummary) {
  const tid = d.templateId || 'dual-triangle'
  router.push({
    name: 'canvas',
    params: { templateId: tid },
    query: { documentId: d.id },
  })
}

async function runSearch() {
  searchErr.value = ''
  searchAbort?.abort()
  if (!auth.isAuthenticated) {
    searchHits.value = []
    searchErr.value = '登录后只能搜索你自己的画布。'
    return
  }
  const q = searchQ.value.trim()
  if (!q) {
    searchHits.value = []
    return
  }
  const ctrl = new AbortController()
  searchAbort = ctrl
  searching.value = true
  try {
    searchHits.value = await searchDocuments({ q, limit: 12 }, { signal: ctrl.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    searchErr.value = friendlyApiMessage(e, '搜索失败')
    searchHits.value = []
  } finally {
    if (searchAbort === ctrl) searching.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void runSearch()
  }, 280)
}

function openHit(d: SearchHit) {
  const tid = d.templateId || 'dual-triangle'
  router.push({
    name: 'canvas',
    params: { templateId: tid },
    query: {
      documentId: d.id,
      ...(d.panelId ? { panel: d.panelId } : {}),
      ...(searchQ.value.trim() ? { q: searchQ.value.trim() } : {}),
    },
  })
}

function onGuideKey(event: KeyboardEvent) {
  if (showLaunch.value || event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }
  event.preventDefault()
  document.getElementById('guide-tpl-search')?.focus()
}

onMounted(async () => {
  refreshDrafts()
  window.addEventListener('keydown', onGuideKey)
  if (auth.token) await auth.fetchMe()
  await refreshRecent()
})

onUnmounted(() => window.removeEventListener('keydown', onGuideKey))
</script>

<template>
  <LaunchSplash v-if="showLaunch" @done="finishLaunch" />
  <div class="guide-shell" :class="{ 'guide-shell--aside-collapsed': asideCollapsed }" :inert="showLaunch">
    <div ref="guideMainEl" class="guide-main" @scroll.passive="onGuideScroll">
      <header class="hero">
        <p class="eyebrow">MetaMatrix</p>
        <h1>元矩阵 MetaMatrix</h1>
        <p class="lead">{{ allCards.length }} 张画布，分成六类。先选一类，再打开一张开始写。</p>
        <p class="lead-note">登录后可以同步到服务端，多台设备用同一份。</p>
        <div class="paths">
          <button
            v-for="chip in categoryChips.filter((item) => item.id !== 'all')"
            :key="chip.id"
            type="button"
            class="path"
            :class="{ 'path--on': activeCategory === chip.id }"
            :style="{ '--accent': categoryAccent(chip.id) }"
            @click="chooseCategory(chip.id, true)"
          >
            <strong>{{ chip.label }}</strong>
            <span>{{ categoryBlurb(chip.id) }}</span>
            <em>{{ categoryCounts[chip.id] || 0 }} 张</em>
          </button>
        </div>
        <section v-if="drafts.length" class="drafts" aria-label="继续写">
          <h2>继续写</h2>
          <div class="draft-row">
            <button
              v-for="draft in drafts"
              :key="draft.templateId"
              type="button"
              class="draft"
              :style="{ '--accent': categoryAccent(TEMPLATE_META[draft.templateId].category) }"
              @click="openCanvas(draft.templateId)"
            >
              <strong>{{ draft.title }}</strong>
              <span>{{ draftMeta(draft) }}</span>
            </button>
          </div>
        </section>
        <section v-if="auth.isAuthenticated" class="search-box" aria-label="搜索我的画布">
          <label class="search-label" for="guide-doc-search">搜索我的画布</label>
          <div class="search-row">
            <input
              id="guide-doc-search"
              v-model="searchQ"
              type="search"
              placeholder="输入关键词（标题或正文）…"
              autocomplete="off"
              @input="onSearchInput"
              @keydown.enter.prevent="runSearch"
            />
            <button type="button" class="primaryish" :disabled="searching" :aria-busy="searching" @click="runSearch">
              {{ searching ? '搜索中…' : '搜索' }}
            </button>
          </div>
          <p v-if="searchErr" class="search-err" role="alert">
            {{ searchErr }}
            <button type="button" class="mm-btn mm-btn--ghost" @click="runSearch">重试</button>
          </p>
          <ul v-if="searchHits.length" class="search-hits">
            <li v-for="h in searchHits" :key="h.id">
              <button type="button" @click="openHit(h)">
                <strong>{{ h.title }}</strong>
                <span>{{ h.templateId || h.canvasType }} · {{ new Date(h.updatedAt).toLocaleString() }}</span>
                <em v-if="h.snippet"><HighlightText :text="h.snippet" /></em>
                <span v-if="h.panelTitle">匹配：{{ h.panelTitle }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="searchQ.trim() && !searching" class="search-empty" role="status">
            没有找到包含「{{ searchQ.trim() }}」的画布。结果只来自当前账号。
          </p>
        </section>
      </header>

      <section ref="templatesEl" class="templates" aria-label="画布模板">
        <div class="templates-toolbar">
          <div class="chips" role="tablist" aria-label="模板分类">
            <button
              v-for="chip in categoryChips"
              :key="chip.id"
              type="button"
              role="tab"
              class="chip"
              :class="{ 'chip--active': activeCategory === chip.id }"
              :style="{ '--accent': categoryAccent(chip.id) }"
              :aria-selected="activeCategory === chip.id"
              @click="chooseCategory(chip.id)"
            >
              {{ chip.label }}
              <span class="chip-count">{{ categoryCounts[chip.id] || 0 }}</span>
            </button>
          </div>
          <div class="toolbar-side">
            <p class="tpl-count" role="status">{{ filteredCards.length }} 个模板</p>
            <div class="layout-toggle" role="group" aria-label="排列方式">
              <button type="button" :aria-pressed="layout === 'cards'" @click="setLayout('cards')">卡片</button>
              <button type="button" :aria-pressed="layout === 'list'" @click="setLayout('list')">列表</button>
            </div>
            <div class="tpl-search">
              <label class="visually-hidden" for="guide-tpl-search">搜索模板</label>
              <input
                id="guide-tpl-search"
                v-model="templateFilter"
                type="search"
                placeholder="搜索模板名称或简介…"
                title="按 / 聚焦"
                autocomplete="off"
              />
            </div>
          </div>
          <nav
            v-if="currentLaneBlocks.length > 1"
            class="lane-jump"
            :style="{ '--accent': categoryAccent(activeCategory) }"
            aria-label="这一类的用途"
          >
            <button
              v-for="(block, index) in currentLaneBlocks"
              :key="block.lane.id"
              type="button"
              :class="{ 'is-on': activeLane === currentLaneDomId(block.lane.id) || (!activeLane && index === 0) }"
              @click="scrollToLane(currentLaneDomId(block.lane.id))"
            >
              {{ block.lane.title }}
              <span>{{ block.cards.length }}</span>
            </button>
          </nav>
        </div>

        <p
          v-if="activeCategory !== 'all'"
          class="category-line"
          :style="{ '--accent': categoryAccent(activeCategory) }"
        >
          {{ categoryBlurb(activeCategory) }}
        </p>

        <p v-if="!filteredCards.length" class="tpl-empty">
          没有匹配的模板。
          <button type="button" class="mm-btn mm-btn--ghost" @click="resetTemplateFilter">清除筛选</button>
        </p>

        <section
          v-for="group in visibleGroups"
          :key="group.id"
          class="family"
          :style="{ '--accent': categoryAccent(group.id) }"
          :aria-label="group.label"
        >
          <header v-if="activeCategory === 'all'" class="family-head">
            <div>
              <h2>{{ group.label }}</h2>
              <p>{{ group.blurb }}</p>
            </div>
            <button type="button" class="family-more" @click="chooseCategory(group.id, true)">
              只看这一类 · {{ group.cards.length }}
            </button>
          </header>
          <nav v-if="activeCategory === 'all' && guideLaneCount(group.id) > 1" class="lane-jump" aria-label="这一类的用途">
            <button
              v-for="block in lanesFor(group.id, group.cards)"
              :key="block.lane.id"
              type="button"
              @click="scrollToLane(laneDomId(group.id, block.lane.id))"
            >
              {{ block.lane.title }}
              <span>{{ block.cards.length }}</span>
            </button>
          </nav>
          <div
            v-for="block in lanesFor(group.id, group.cards)"
            :id="laneDomId(group.id, block.lane.id)"
            :key="block.lane.id"
            class="lane"
          >
            <p v-if="guideLaneCount(group.id) > 1" class="lane-title">
              {{ block.lane.title }}
              <span v-if="block.lane.hint">{{ block.lane.hint }}</span>
            </p>
            <div class="grid" :class="{ 'is-list': layout === 'list' }">
              <button
                v-for="card in block.cards"
                :key="card.id"
                type="button"
                class="card"
                :class="`card--${card.id}`"
                :style="{ '--accent': categoryAccent(card.category) }"
                @click="openCanvas(card.id)"
              >
                <span v-if="block.lane.series" class="series-no">{{ block.lane.ids.indexOf(card.id) + 1 }}</span>
                <GuideThumb :template-id="card.id" />
                <div class="body">
                  <div class="body-top">
                    <h3>
                      <template v-for="(part, partIndex) in splitMatch(card.name, templateFilter)" :key="partIndex">
                        <mark v-if="part.hit">{{ part.text }}</mark>
                        <template v-else>{{ part.text }}</template>
                      </template>
                    </h3>
                    <span class="badge">{{ card.badge }}</span>
                  </div>
                  <p>
                    <template v-for="(part, partIndex) in splitMatch(card.description, templateFilter)" :key="partIndex">
                      <mark v-if="part.hit">{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </p>
                  <span class="cta">进入画布 →</span>
                </div>
              </button>
            </div>
          </div>
        </section>
      </section>
    </div>

    <GuideAside
      :recent="recent"
      :authenticated="auth.isAuthenticated"
      :loading="recentLoading"
      :error="recentError"
      @open="openDoc"
      @logout="onLogout"
      @retry="refreshRecent"
      @update:collapsed="asideCollapsed = $event"
    />
  </div>
</template>

<style scoped>
.guide-shell {
  display: flex;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: #fafafa;
}

.guide-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 28px 56px;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, #e8f0fe 0%, transparent 55%),
    #fafafa;
}

.hero {
  max-width: 1100px;
  margin: 0 auto 28px;
  padding-top: 32px;
  text-align: center;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1a73e8;
  font-weight: 600;
}

.hero h1 {
  margin: 0 0 12px;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #202124;
}

.lead {
  margin: 0;
  font-size: 16px;
  color: #5f6368;
  line-height: 1.6;
}

.lead-note {
  margin: 6px 0 0;
  color: #9aa0a6;
  font-size: 13px;
}

.paths {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 22px;
  text-align: left;
}

.path {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-height: 86px;
  padding: 12px 12px 10px;
  border: 1px solid #e8eaed;
  border-left: 3px solid var(--accent, #1a73e8);
  border-radius: 14px;
  background: #fff;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.path strong {
  font-size: 14px;
  font-weight: 700;
}

.path span {
  color: #5f6368;
  font-size: 12px;
  line-height: 1.4;
}

.path em {
  margin-top: auto;
  color: var(--accent, #1a73e8);
  font-style: normal;
  font-size: 12px;
  font-weight: 700;
}

.path:hover,
.path--on {
  background: color-mix(in srgb, var(--accent, #1a73e8) 10%, #fff);
  border-color: var(--accent, #1a73e8);
}

.templates {
  max-width: 1100px;
  margin: 0 auto;
  scroll-margin-top: 8px;
}

.templates-toolbar {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 8px;
  padding: 10px 0 14px;
  background: #fafafa;
  box-shadow: 0 1px 0 #e8eaed;
}

.toolbar-side {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-count {
  margin-left: 6px;
  color: #5f6368;
  font-weight: 500;
}

.tpl-count {
  margin: 0;
  color: #5f6368;
  font-size: 13px;
  white-space: nowrap;
}

.chip {
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #202124;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.chip:hover {
  border-color: #bdc1c6;
  background: #fafafa;
}

.chip--active {
  background: color-mix(in srgb, var(--accent, #1a73e8) 14%, #fff);
  border-color: var(--accent, #1a73e8);
  color: var(--accent, #1a73e8);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, #1a73e8) 20%, transparent);
}

.chip--active .chip-count {
  color: var(--accent, #1a73e8);
}

.tpl-search input {
  width: min(280px, 100%);
  border: 1px solid #dadce0;
  border-radius: 999px;
  padding: 9px 14px;
  font-size: 13.5px;
  background: #ffffff;
  color: #202124;
  outline: none;
}

.tpl-search input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.tpl-search input::placeholder {
  color: #9aa0a6;
}

.tpl-empty {
  margin: 0 0 16px;
  font-size: 14px;
  color: #9aa0a6;
  text-align: center;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.category-line {
  margin: 0 0 14px;
  padding-left: 10px;
  border-left: 3px solid var(--accent, #1a73e8);
  color: #5f6368;
  font-size: 13px;
}

.family {
  margin: 0 0 28px;
}

.family-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--accent, #1a73e8);
}

.family-head h2,
.family-head p {
  margin: 0;
}

.family-head h2 {
  font-size: 20px;
  letter-spacing: -0.01em;
}

.family-head p {
  margin-top: 4px;
  color: #5f6368;
  font-size: 13px;
}

.family-more {
  flex: none;
  border: 1px solid var(--accent, #1a73e8);
  border-radius: 999px;
  background: #fff;
  color: var(--accent, #1a73e8);
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.family-more:hover {
  background: color-mix(in srgb, var(--accent, #1a73e8) 10%, #fff);
}

.lane {
  scroll-margin-top: 180px;
}

.lane + .lane {
  margin-top: 8px;
}

.lane-jump {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

.templates-toolbar .lane-jump {
  flex: 1 0 100%;
  margin-top: 2px;
}

.family .lane-jump {
  margin: 0 0 12px;
}

.lane-jump button {
  border: 1px solid #dadce0;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  color: #202124;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.lane-jump button span {
  margin-left: 6px;
  color: #5f6368;
  font-weight: 600;
}

.lane-jump button.is-on,
.lane-jump button:hover {
  border-color: var(--accent, #1a73e8);
  background: color-mix(in srgb, var(--accent, #1a73e8) 12%, #fff);
  color: var(--accent, #1a73e8);
}

.lane-jump button.is-on span,
.lane-jump button:hover span {
  color: var(--accent, #1a73e8);
}

.drafts {
  max-width: 1100px;
  margin: 0 auto 8px;
  text-align: left;
}

.drafts h2 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
}

.draft-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.draft {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid #e8eaed;
  border-left: 3px solid var(--accent, #1a73e8);
  border-radius: 12px;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.draft strong {
  font-size: 14px;
}

.draft span {
  color: #5f6368;
  font-size: 12px;
  line-height: 1.4;
}

.layout-toggle {
  display: inline-flex;
  border: 1px solid #dadce0;
  border-radius: 999px;
  overflow: hidden;
  background: #fff;
}

.layout-toggle button {
  border: 0;
  background: transparent;
  padding: 6px 10px;
  color: #5f6368;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.layout-toggle button[aria-pressed='true'] {
  background: #e8f0fe;
  color: #1a73e8;
}

.grid.is-list {
  grid-template-columns: 1fr;
  gap: 8px;
}

.grid.is-list .card {
  flex-direction: row;
  align-items: stretch;
  border-top-width: 1px;
  border-left: 3px solid var(--accent);
}

.grid.is-list :deep(.thumb) {
  width: 148px;
  height: 104px;
  flex: none;
  aspect-ratio: auto;
  border-bottom: 0;
  border-right: 1px solid #ececec;
}

.grid.is-list .body {
  padding: 10px 14px;
}

.grid.is-list .body p {
  -webkit-line-clamp: 1;
}

.lane-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 2px 0 8px;
  color: #202124;
  font-size: 13px;
  font-weight: 750;
}

.lane-title::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--accent, #1a73e8);
}

.lane-title span {
  color: #5f6368;
  font-weight: 500;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.card {
  --accent: #1a73e8;
  position: relative;
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
  border: 1px solid #dadce0;
  border-top: 3px solid var(--accent);
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
  font: inherit;
  color: inherit;
}

.series-no {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: #fff;
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.card mark {
  background: #fde293;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

.card:hover,
.card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--accent);
  box-shadow: 0 10px 28px rgba(32, 33, 36, 0.1);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}


.body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 20px;
  background: #ffffff;
}

.body-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.body h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
  color: #202124;
}

.badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  max-width: 46%;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #1a73e8) 14%, #fff);
  color: var(--accent, #1a73e8);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
}

.body p {
  margin: 0;
  flex: 1;
  font-size: 13.5px;
  line-height: 1.55;
  color: #5f6368;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cta {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent, #1a73e8);
}

.primaryish {
  border: 1px solid #1a73e8;
  background: #1a73e8;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  color: #ffffff;
}

.primaryish:disabled {
  opacity: 0.65;
  cursor: default;
}

.search-box {
  width: min(1100px, 100%);
  margin: 18px auto 0;
  text-align: left;
}

.search-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #202124;
  margin-bottom: 8px;
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-row input {
  flex: 1;
  border: 1px solid #dadce0;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  outline: none;
  background: #ffffff;
  color: #202124;
}

.search-row input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.search-err {
  color: #d93025;
  font-size: 13px;
  margin: 8px 0 0;
}

.search-empty {
  color: #9aa0a6;
  font-size: 13px;
  margin: 8px 0 0;
}

.search-hits {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}

.search-hits button {
  width: 100%;
  text-align: left;
  border: 1px solid #dadce0;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #202124;
}

.search-hits span {
  font-size: 12px;
  color: #9aa0a6;
}

.search-hits em {
  font-style: normal;
  font-size: 12px;
  color: #9aa0a6;
  line-height: 1.4;
  max-height: 3.2em;
  overflow: hidden;
}

@media (max-width: 900px) {
  .templates-toolbar {
    position: static;
    box-shadow: none;
  }
  .guide-main {
    padding: 0 16px 48px;
  }
  .hero {
    padding-top: 24px;
  }
  .paths,
  .family-head,
  .toolbar-side {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    margin-left: 0;
  }
  .paths {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .tpl-search input {
    width: 100%;
  }
}

.guide-main .card:hover,
.guide-main .card:focus-visible {
  border-color: var(--accent, #1a73e8);
}
</style>
