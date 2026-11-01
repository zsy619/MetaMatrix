<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TemplateCategory, TemplateId } from '../stores/document'
import { CATEGORY_LABELS, TEMPLATE_META } from '../stores/document'
import { useAuthStore } from '../stores/auth'
import type { DocumentSummary, SearchHit } from '../api/documents'
import HighlightText from '../components/ui/HighlightText.vue'
import { listDocuments, searchDocuments } from '../api/documents'
import { friendlyApiMessage } from '../utils/apiMessage'
import GuideThumb from '../components/guide/GuideThumb.vue'
import RecentOpens from '../components/workspace/RecentOpens.vue'
import GuideAside from '../components/guide/GuideAside.vue'

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

const activeCategory = ref<'all' | TemplateCategory>(readStoredCategory())
const templateFilter = ref('')
const asideCollapsed = ref(false)

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

function chooseCategory(id: 'all' | TemplateCategory) {
  activeCategory.value = id
  try {
    sessionStorage.setItem('metamatrix:guide-category', id)
  } catch {
    /* ignore */
  }
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

onMounted(async () => {
  if (auth.token) await auth.fetchMe()
  await refreshRecent()
})
</script>

<template>
  <div class="guide-shell" :class="{ 'guide-shell--aside-collapsed': asideCollapsed }">
    <div class="guide-main">
      <header class="hero">
        <p class="eyebrow">MetaMatrix</p>
        <h1>元矩阵 MetaMatrix</h1>
        <p class="lead">
          选择一张画布模板，开始结构化梳理与可视化表达。登录后可同步到服务端（多用户）。
        </p>
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

      <RecentOpens class="recent-opens" />
      <section class="templates" aria-label="画布模板">
        <div class="templates-toolbar">
          <div class="chips" role="tablist" aria-label="模板分类">
            <button
              v-for="chip in categoryChips"
              :key="chip.id"
              type="button"
              role="tab"
              class="chip"
              :class="{ 'chip--active': activeCategory === chip.id }"
              :aria-selected="activeCategory === chip.id"
              @click="chooseCategory(chip.id)"
            >
              {{ chip.label }}
              <span class="chip-count">{{ categoryCounts[chip.id] || 0 }}</span>
            </button>
          </div>
          <div class="tpl-search">
            <label class="visually-hidden" for="guide-tpl-search">搜索模板</label>
            <input
              id="guide-tpl-search"
              v-model="templateFilter"
              type="search"
              placeholder="搜索模板名称或简介…"
              autocomplete="off"
            />
          </div>
        </div>

        <p class="tpl-count" role="status">{{ filteredCards.length }} 个模板</p>
        <p v-if="!filteredCards.length" class="tpl-empty">
          没有匹配的模板。
          <button type="button" class="mm-btn mm-btn--ghost" @click="resetTemplateFilter">清除筛选</button>
        </p>

        <div class="grid">
          <button
            v-for="card in filteredCards"
            :key="card.id"
            type="button"
            class="card"
            :class="`card--${card.id}`"
            @click="openCanvas(card.id)"
          >
            <GuideThumb :template-id="card.id" />
            <div class="body">
              <div class="body-top">
                <h2>{{ card.name }}</h2>
                <span class="badge">{{ card.badge }}</span>
              </div>
              <p>{{ card.description }}</p>
              <span class="cta">进入画布 →</span>
            </div>
          </button>
        </div>
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
  background: var(--cv-page, #f7f7f7);
}

.guide-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 40px 28px 56px;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, var(--cv-hover-wash, #e8f1fa) 0%, transparent 55%),
    var(--cv-page, #f7f7f7);
}

.hero {
  max-width: 720px;
  margin: 0 auto 36px;
  text-align: center;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cv-focus, #163044);
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
  color: var(--cv-muted, #5f6368);
  line-height: 1.6;
}

.templates {
  max-width: 1100px;
  margin: 0 auto;
}

.templates-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 18px;
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
  margin: 0 0 12px;
  color: #5f6368;
  font-size: 13px;
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
  background: var(--cv-hover-wash, #e8f1fa);
  border-color: var(--cv-focus, #163044);
  color: var(--cv-focus, #163044);
  box-shadow: 0 0 0 1px rgba(22, 48, 68, 0.16);
}

.tpl-search input {
  width: min(280px, 100%);
  border: 1px solid #dadce0;
  border-radius: 999px;
  padding: 9px 14px;
  font-size: 13.5px;
  background: #ffffff;
  color: #202124;
}

.tpl-search input:focus {
  border-color: var(--cv-focus, #163044);
  box-shadow: 0 0 0 3px rgba(22, 48, 68, 0.18);
}

.tpl-search input::placeholder {
  color: var(--cv-muted, #5f6368);
}

.tpl-empty {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--cv-muted, #5f6368);
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.card {
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
  border: 1px solid #dadce0;
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

.card:hover {
  transform: translateY(-3px);
  border-color: #bdc1c6;
  box-shadow: 0 10px 28px rgba(32, 33, 36, 0.1);
}

.card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--cv-focus, #163044);
  box-shadow: 0 10px 28px rgba(32, 33, 36, 0.1);
  outline: 2px solid var(--cv-focus, #163044);
  outline-offset: 2px;
}

.card--dual-triangle:hover,
.card--dual-triangle:focus-visible {
  border-color: #c4a574;
}

.card--dual-triangle-human-ai:hover,
.card--dual-triangle-human-ai:focus-visible {
  border-color: #3aada3;
}

.card--star-quadrant:hover,
.card--star-quadrant:focus-visible {
  border-color: #e57373;
}

.card--y-model:hover,
.card--y-model:focus-visible {
  border-color: #e53935;
}

.card--deliberate-practice:hover,
.card--deliberate-practice:focus-visible {
  border-color: #f99d1c;
}

.card--demand-triangle:hover,
.card--demand-triangle:focus-visible {
  border-color: #26a69a;
}

.card--five-step-basic:hover,
.card--five-step-basic:focus-visible,
.card--five-step-division:hover,
.card--five-step-division:focus-visible,
.card--five-step-advanced:hover,
.card--five-step-advanced:focus-visible,
.card--five-step-pro:hover,
.card--five-step-pro:focus-visible,
.card--five-step-challenge:hover,
.card--five-step-challenge:focus-visible,
.card--five-step:hover,
.card--five-step:focus-visible {
  border-color: #f9a825;
}

.card--ai-tradeoff:hover,
.card--ai-tradeoff:focus-visible {
  border-color: #d93025;
}

.card--product-content:hover,
.card--product-content:focus-visible {
  border-color: #f9a825;
}

.card--product-features-5d:hover,
.card--product-features-5d:focus-visible {
  border-color: #2a649f;
}


.card--oscar:hover,
.card--oscar:focus-visible {
  border-color: #6495ed;
}

.card--industry-analysis:hover,
.card--industry-analysis:focus-visible {
  border-color: #202124;
}

.card--key-resistance:hover,
.card--key-resistance:focus-visible {
  border-color: #f9a825;
}

.card--conversion-tradeoff:hover,
.card--conversion-tradeoff:focus-visible {
  border-color: #fbc02d;
}

.card--industry-forecast:hover,
.card--industry-forecast:focus-visible {
  border-color: #c4a574;
}

.card--scientific-meeting:hover,
.card--scientific-meeting:focus-visible {
  border-color: #1a1a1a;
}


.card--scientific-meeting-10p:hover,
.card--scientific-meeting-10p:focus-visible {
  border-color: #43A047;
}


.card--ipo:hover,
.card--ipo:focus-visible {
  border-color: #d32f2f;
}

.card--incident-review:hover,
.card--incident-review:focus-visible {
  border-color: #d93025;
}

.card--annual-summary:hover,
.card--annual-summary:focus-visible,
.card--weekly-summary:hover,
.card--weekly-summary:focus-visible,
.card--monthly-summary:hover,
.card--monthly-summary:focus-visible,
.card--quarterly-summary:hover,
.card--quarterly-summary:focus-visible {
  border-color: #5f6368;
}

.card--deep-review:hover,
.card--deep-review:focus-visible {
  border-color: #c9a227;
}

.card--pm-retro-value:hover,
.card--pm-retro-value:focus-visible {
  border-color: #d65a46;
}

.card--roi-tradeoff:hover,
.card--roi-tradeoff:focus-visible {
  border-color: #FFEB3B;
}

.card--roi-decision:hover,
.card--roi-decision:focus-visible {
  border-color: #2a649f;
}

.card--time-matrix:hover,
.card--time-matrix:focus-visible {
  border-color: #fbe297;
}

.card--work-state-zones:hover,
.card--work-state-zones:focus-visible {
  border-color: #9ad751;
}


.card--unit-model-quadrant:hover,
.card--unit-model-quadrant:focus-visible {
  border-color: #2d9b8a;
}

.card--growth-assumptions:hover,
.card--growth-assumptions:focus-visible {
  border-color: #90949c;
}

.card--business-formula:hover,
.card--business-formula:focus-visible {
  border-color: #2a649f;
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

.body h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: #202124;
}

.badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: #e8eaed;
  color: #202124;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.body p {
  margin: 0;
  flex: 1;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--cv-muted, #5f6368);
}

.cta {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cv-focus, #163044);
}

.primaryish {
  border: 1px solid var(--cv-focus, #163044);
  background: var(--cv-focus, #163044);
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
  background: #ffffff;
  color: #202124;
}

.search-row input:focus {
  border-color: var(--cv-focus, #163044);
  box-shadow: 0 0 0 3px rgba(22, 48, 68, 0.18);
}

.search-err {
  color: #d93025;
  font-size: 13px;
  margin: 8px 0 0;
}

.search-empty {
  color: var(--cv-muted, #5f6368);
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
  color: var(--cv-muted, #5f6368);
}

.search-hits em {
  font-style: normal;
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
  line-height: 1.4;
  max-height: 3.2em;
  overflow: hidden;
}

@media (max-width: 900px) {
  .guide-main {
    padding: 28px 16px 48px;
  }
}
</style>
