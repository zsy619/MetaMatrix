<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GuideThumb from '../components/guide/GuideThumb.vue'
import {
  listDocuments,
  listRevisions,
  searchDocuments,
  type DocumentSummary,
  type RevisionSummary,
  type SearchHit,
} from '../api/documents'
import { useAuthStore } from '../stores/auth'
import {
  CATEGORY_LABELS,
  TEMPLATE_META,
  cloneTemplate,
  isTemplateId,
  useDocumentStore,
  type TemplateCategory,
  type TemplateId,
} from '../stores/document'

const STARTERS: TemplateId[] = [
  'time-matrix',
  'weekly-summary',
  'y-model',
  'five-step-basic',
  'incident-review',
  'roi-decision',
  'deliberate-practice',
  'scientific-meeting',
]

const CATEGORY_ACCENT: Record<TemplateCategory, string> = {
  method: '#1a73e8',
  growth: '#34a853',
  industry: '#f9a825',
  org: '#a142f4',
  review: '#ea4335',
}

type Activity = {
  id: string
  documentId: string
  title: string
  templateId: string | null
  canvasType: string
  label: string
  kind: string
  createdAt: string
}

type TodoRow = {
  key: string
  doc: DocumentSummary
  text: string
  done: boolean
}

type NoteRow = {
  key: string
  doc: DocumentSummary
  text: string
}

const router = useRouter()
const auth = useAuthStore()
const documentStore = useDocumentStore()

const docs = ref<DocumentSummary[]>([])
const loading = ref(false)
const loadError = ref('')
const activities = ref<Activity[]>([])
const revisionsLoading = ref(false)
const todoMentions = ref<SearchHit[]>([])

const searchQ = ref('')
const searchTemplate = ref('')
const searchHits = ref<SearchHit[]>([])
const searching = ref(false)
const searchErr = ref('')
const searched = ref(false)

const creatingId = ref<TemplateId | null>(null)
const createError = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchGen = 0
let alive = true

const nickname = computed(
  () => auth.user?.displayName || auth.user?.email || '已登录',
)

const weekCount = computed(() => {
  const start = Date.now() - 7 * 86_400_000
  return docs.value.filter((d) => new Date(d.updatedAt).getTime() >= start).length
})

const notedCount = computed(
  () => docs.value.filter((d) => (d.notes || '').trim()).length,
)

const templateCounts = computed(() => {
  const map = new Map<TemplateId, number>()
  for (const d of docs.value) {
    const id = d.templateId || d.canvasType
    if (id && isTemplateId(id)) map.set(id, (map.get(id) || 0) + 1)
  }
  return map
})

const quickTemplates = computed(() => {
  const used = [...templateCounts.value.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
  const merged: TemplateId[] = []
  for (const id of [...used, ...STARTERS]) {
    if (!merged.includes(id)) merged.push(id)
    if (merged.length >= 8) break
  }
  return merged
})

const categoryBuckets = computed(() => {
  const counts: Record<TemplateCategory | 'other', number> = {
    method: 0,
    growth: 0,
    industry: 0,
    org: 0,
    review: 0,
    other: 0,
  }
  for (const d of docs.value) {
    const id = d.templateId || d.canvasType || ''
    if (isTemplateId(id)) counts[TEMPLATE_META[id].category] += 1
    else counts.other += 1
  }
  const rows: { key: string; label: string; count: number; accent: string }[] = (
    Object.keys(CATEGORY_LABELS) as TemplateCategory[]
  ).map((id) => ({
    key: id,
    label: CATEGORY_LABELS[id],
    count: counts[id],
    accent: CATEGORY_ACCENT[id],
  }))
  if (counts.other > 0) {
    rows.push({
      key: 'other',
      label: '未归档',
      count: counts.other,
      accent: '#5f6368',
    })
  }
  return rows
})

const maxCategory = computed(() =>
  Math.max(1, ...categoryBuckets.value.map((b) => b.count)),
)

const templateBuckets = computed(() => {
  const map = new Map<string, number>()
  for (const d of docs.value) {
    const id = d.templateId || d.canvasType || 'unknown'
    map.set(id, (map.get(id) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, 8)
    .map(([id, count]) => ({
      id,
      name: templateName(id),
      count,
      accent: accentOf(id),
    }))
})

const templateOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { id: string; name: string }[] = []
  for (const d of docs.value) {
    const id = d.templateId || ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    opts.push({ id, name: templateName(id) })
  }
  opts.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return opts
})

const recentDocs = computed(() => docs.value.slice(0, 8))

const matrixDocs = computed(() =>
  docs.value
    .filter((d) => (d.templateId || d.canvasType) === 'time-matrix')
    .slice(0, 4),
)

const noteDigest = computed(() => {
  const todos: TodoRow[] = []
  const notes: NoteRow[] = []
  for (const d of docs.value) {
    const raw = (d.notes || '').trim()
    if (!raw) continue
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const rest: string[] = []
    lines.forEach((line, index) => {
      const todo = parseTodoLine(line)
      if (todo) {
        todos.push({
          key: `${d.id}:todo:${index}`,
          doc: d,
          text: todo.text,
          done: todo.done,
        })
      } else {
        rest.push(line)
      }
    })
    if (rest.length) {
      notes.push({
        key: `${d.id}:note`,
        doc: d,
        text: rest.join(' ').replace(/\s+/g, ' ').slice(0, 160),
      })
    }
  }
  todos.sort((a, b) => Number(a.done) - Number(b.done))
  return { todos: todos.slice(0, 8), notes: notes.slice(0, 6) }
})

const digestEmpty = computed(
  () =>
    !noteDigest.value.todos.length &&
    !noteDigest.value.notes.length &&
    !matrixDocs.value.length &&
    !todoMentions.value.length,
)

function templateName(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return TEMPLATE_META[id].name
  return id || '画布'
}

function accentOf(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return CATEGORY_ACCENT[TEMPLATE_META[id].category]
  return '#7c4dff'
}

function knownTemplate(id: string | null | undefined): TemplateId | null {
  return id && isTemplateId(id) ? id : null
}

function thumbTemplateId(d: {
  templateId: string | null
  canvasType?: string
}): TemplateId {
  return knownTemplate(d.templateId || d.canvasType) ?? 'dual-triangle'
}

function barWidth(count: number): string {
  if (count <= 0) return '0%'
  const pct = Math.round((count / maxCategory.value) * 100)
  return `${Math.max(8, pct)}%`
}

function formatWhen(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const diff = Date.now() - t.getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} 天前`
  return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function revisionLabel(r: RevisionSummary): string {
  const raw = (r.label || '').trim()
  if (raw === 'manual-snapshot') return '手动存档'
  if (raw === 'auto-checkpoint') return '自动存档'
  if (raw === 'initial') return '初始版本'
  if (raw) return raw
  if (r.revisionType === 'patch') return '增量修订'
  if (r.revisionType === 'snapshot') return '快照'
  return '修订'
}

function revisionKind(type: string): string {
  if (type === 'snapshot') return '快照'
  if (type === 'patch') return '增量'
  return '修订'
}

function parseTodoLine(line: string): { text: string; done: boolean } | null {
  const checkbox = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/)
  if (checkbox?.[2]) {
    return { done: checkbox[1].toLowerCase() === 'x', text: checkbox[2].trim() }
  }
  const mark = line.match(/^\s*([□☐☑✓✔])\s*(.+)$/)
  if (mark?.[2]) {
    const done = mark[1] === '☑' || mark[1] === '✓' || mark[1] === '✔'
    return { done, text: mark[2].trim() }
  }
  const labeled = line.match(/^\s*(?:待办|TODO)\s*[:：]\s*(.+)$/i)
  if (labeled?.[1]) return { done: false, text: labeled[1].trim() }
  return null
}

function snippetParts(raw: string): { text: string; mark: boolean }[] {
  const src = raw.replace(/\s+/g, ' ').trim()
  const parts: { text: string; mark: boolean }[] = []
  const re = /«([^»]*)»/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(src))) {
    if (match.index > last) {
      parts.push({ text: src.slice(last, match.index), mark: false })
    }
    parts.push({ text: match[1] || '', mark: true })
    last = match.index + match[0].length
  }
  if (last < src.length) parts.push({ text: src.slice(last), mark: false })
  if (!parts.length && src) parts.push({ text: src, mark: false })
  return parts
}

function freshTitle(id: TemplateId): string {
  const now = new Date()
  return `${TEMPLATE_META[id].name} · ${now.getMonth() + 1}月${now.getDate()}日`
}

function openDoc(d: {
  id: string
  templateId: string | null
  canvasType?: string
}) {
  const tid = knownTemplate(d.templateId) || knownTemplate(d.canvasType) || 'dual-triangle'
  router.push({
    name: 'canvas',
    params: { templateId: tid },
    query: { documentId: d.id },
  })
}

function openLocalTemplate(id: TemplateId) {
  router.push({ name: 'canvas', params: { templateId: id } })
}

async function quickCreate(id: TemplateId) {
  createError.value = ''
  if (!auth.isAuthenticated) {
    openLocalTemplate(id)
    return
  }
  if (creatingId.value) return
  creatingId.value = id
  try {
    const docId = await documentStore.createOnServer({
      templateId: id,
      title: freshTitle(id),
      notes: '',
      data: cloneTemplate(id),
    })
    router.push({
      name: 'canvas',
      params: { templateId: id },
      query: { documentId: docId },
    })
  } catch (e) {
    createError.value = e instanceof Error ? e.message : '新建失败'
  } finally {
    creatingId.value = null
  }
}

async function loadRevisions(list: DocumentSummary[]) {
  revisionsLoading.value = true
  const slice = list.slice(0, 8)
  try {
    const batches = await Promise.all(
      slice.map(async (d) => {
        try {
          const revs = await listRevisions(d.id)
          return revs.slice(0, 3).map((r) => ({
            id: r.id,
            documentId: d.id,
            title: d.title || '未命名文档',
            templateId: d.templateId,
            canvasType: d.canvasType,
            label: revisionLabel(r),
            kind: revisionKind(r.revisionType),
            createdAt: r.createdAt,
          }))
        } catch {
          return [] as Activity[]
        }
      }),
    )
    if (!alive) return
    activities.value = batches
      .flat()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 8)
  } finally {
    if (alive) revisionsLoading.value = false
  }
}

async function load() {
  if (!auth.isAuthenticated) {
    docs.value = []
    activities.value = []
    todoMentions.value = []
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const [rows, mentions] = await Promise.all([
      listDocuments(),
      searchDocuments({ q: '待办', limit: 6 }).catch(() => [] as SearchHit[]),
    ])
    if (!alive) return
    const list = Array.isArray(rows) ? rows : []
    list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    docs.value = list
    todoMentions.value = Array.isArray(mentions) ? mentions : []
    void loadRevisions(list)
  } catch (e) {
    if (!alive) return
    docs.value = []
    todoMentions.value = []
    activities.value = []
    if (!auth.isAuthenticated) {
      loadError.value = ''
    } else {
      loadError.value = e instanceof Error ? e.message : '读取画布失败'
    }
  } finally {
    if (alive) loading.value = false
  }
}

async function runSearch() {
  searchErr.value = ''
  if (!auth.isAuthenticated) {
    searchHits.value = []
    return
  }
  const q = searchQ.value.trim()
  if (!q) {
    searchHits.value = []
    searched.value = false
    return
  }
  const gen = ++searchGen
  searching.value = true
  searched.value = true
  try {
    const rows = await searchDocuments({
      q,
      templateId: searchTemplate.value || undefined,
      limit: 12,
    })
    if (!alive || gen !== searchGen) return
    searchHits.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    if (!alive || gen !== searchGen) return
    searchErr.value = e instanceof Error ? e.message : '搜索失败'
    searchHits.value = []
  } finally {
    if (alive && gen === searchGen) searching.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void runSearch()
  }, 280)
}

function onFilterChange() {
  if (searchQ.value.trim()) void runSearch()
}

function clearSearch() {
  searchQ.value = ''
  searchHits.value = []
  searchErr.value = ''
  searched.value = false
}

function goLogin() {
  router.push({ name: 'login', query: { redirect: '/workspace' } })
}

function goRegister() {
  router.push({ name: 'register', query: { redirect: '/workspace' } })
}

onMounted(async () => {
  document.title = '工作面板 · 元矩阵 MetaMatrix'
  if (auth.token) await auth.fetchMe()
  if (auth.isAuthenticated) await load()
})

onUnmounted(() => {
  alive = false
  if (searchTimer) clearTimeout(searchTimer)
  document.title = '元矩阵 MetaMatrix'
})
</script>

<template>
  <div class="workspace">
    <div class="workspace-inner">
      <header class="top">
        <div class="top-copy">
          <router-link class="back" :to="{ name: 'guide' }">← 模板库</router-link>
          <p class="eyebrow">MetaMatrix</p>
          <h1>工作面板</h1>
          <p class="lead">
            把反复使用的画布收成一张工作台：接着写、看哪类模板用得多、搜正文、回看修订、扫一眼备注和待办。
          </p>
        </div>
        <div class="top-actions">
          <template v-if="auth.isAuthenticated">
            <span class="who">{{ nickname }}</span>
            <button type="button" class="btn-ghost" :disabled="loading" @click="load">
              {{ loading ? '刷新中…' : '刷新' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn-primary" @click="goLogin">登录</button>
            <button type="button" class="btn-ghost" @click="goRegister">注册</button>
          </template>
        </div>
      </header>

      <section v-if="!auth.isAuthenticated" class="guest" aria-label="登录引导">
        <div>
          <h2>登录后，这里汇总你的云端画布</h2>
          <p>
            最近编辑、模板用量、全文搜索、修订和备注都按当前账号隔离。未登录时，下面的常用模板仍可在这台浏览器里打开。
          </p>
        </div>
        <div class="guest-actions">
          <button type="button" class="btn-primary" @click="goLogin">登录后查看</button>
          <button type="button" class="btn-ghost" @click="goRegister">注册账号</button>
        </div>
      </section>

      <p v-if="loadError" class="banner-error" role="alert">
        {{ loadError }}
        <button type="button" class="text-btn" @click="load">重试</button>
      </p>

      <section v-if="auth.isAuthenticated" class="metrics" aria-label="概览">
        <article class="metric">
          <span class="metric-value">{{ loading ? '…' : docs.length }}</span>
          <span class="metric-label">云端画布</span>
        </article>
        <article class="metric">
          <span class="metric-value">{{ loading ? '…' : weekCount }}</span>
          <span class="metric-label">近 7 天编辑</span>
        </article>
        <article class="metric">
          <span class="metric-value">{{ loading ? '…' : notedCount }}</span>
          <span class="metric-label">写了备注</span>
        </article>
        <article class="metric">
          <span class="metric-value">{{ loading ? '…' : templateBuckets.length }}</span>
          <span class="metric-label">在用模板</span>
        </article>
      </section>

      <section class="panel" aria-labelledby="quick-h">
        <header class="panel-head">
          <div>
            <h2 id="quick-h">常用起点</h2>
            <p>
              {{
                auth.isAuthenticated
                  ? '按你用过的模板靠前排列。新建会在云端建一份空白画布，标题带上今天的日期。'
                  : '未登录时打开的是该模板在本机的画布，不会上传。'
              }}
            </p>
          </div>
        </header>
        <div class="quick-grid">
          <button
            v-for="id in quickTemplates"
            :key="id"
            type="button"
            class="quick-card"
            :disabled="creatingId !== null"
            :title="auth.isAuthenticated ? '在云端新建一份空白画布' : '打开此模板的本机画布'"
            @click="quickCreate(id)"
          >
            <span class="mark" :style="{ '--accent': accentOf(id) }" aria-hidden="true">
              <GuideThumb :template-id="id" size="sm" />
            </span>
            <span class="quick-copy">
              <span class="quick-name">{{ TEMPLATE_META[id].name }}</span>
              <span class="quick-meta">{{ TEMPLATE_META[id].badge }}</span>
            </span>
            <span class="quick-action">
              <template v-if="creatingId === id">新建中…</template>
              <template v-else-if="templateCounts.get(id)">
                已有 {{ templateCounts.get(id) }} 份 · 再开一张
              </template>
              <template v-else-if="auth.isAuthenticated">新建</template>
              <template v-else>本机打开</template>
            </span>
          </button>
        </div>
        <p v-if="createError" class="inline-error" role="alert">{{ createError }}</p>
      </section>

      <div class="columns">
        <div class="col">
          <section class="panel" aria-labelledby="recent-h">
            <header class="panel-head">
              <div>
                <h2 id="recent-h">最近编辑</h2>
                <p>按更新时间排列。点一行回到那张画布接着写。</p>
              </div>
              <span v-if="auth.isAuthenticated && docs.length" class="count-pill">
                {{ docs.length }} 份
              </span>
            </header>
            <p v-if="!auth.isAuthenticated" class="muted">登录后显示你最近改过的画布。</p>
            <p v-else-if="loading" class="muted">正在读取画布…</p>
            <p v-else-if="!recentDocs.length" class="muted">
              云端还没有画布。从上面的常用起点新建一份，保存后会出现在这里。
            </p>
            <ul v-else class="rows">
              <li v-for="d in recentDocs" :key="d.id">
                <button type="button" class="row" @click="openDoc(d)">
                  <span
                    class="mark"
                    :style="{ '--accent': accentOf(d.templateId || d.canvasType) }"
                    aria-hidden="true"
                  >
                    <GuideThumb
                      v-if="knownTemplate(d.templateId || d.canvasType)"
                      :template-id="thumbTemplateId(d)"
                      size="sm"
                    />
                    <span v-else class="mark-fallback" />
                  </span>
                  <span class="row-copy">
                    <span class="row-title">{{ d.title || '未命名文档' }}</span>
                    <span class="row-meta">
                      {{ templateName(d.templateId || d.canvasType) }}
                      <template v-if="(d.notes || '').trim()"> · 有备注</template>
                    </span>
                  </span>
                  <time class="when" :datetime="d.updatedAt">{{ formatWhen(d.updatedAt) }}</time>
                </button>
              </li>
            </ul>
          </section>

          <section class="panel" aria-labelledby="search-h">
            <header class="panel-head">
              <div>
                <h2 id="search-h">全文搜索</h2>
                <p>搜索标题和画布正文（保存时从 JSON 抽出的文本）。备注在下方单独汇总。</p>
              </div>
            </header>
            <div class="search-row">
              <label class="visually-hidden" for="ws-search">搜索画布</label>
              <input
                id="ws-search"
                v-model="searchQ"
                type="search"
                placeholder="输入关键词，例如一个判断、人名或指标…"
                autocomplete="off"
                :disabled="!auth.isAuthenticated"
                @input="onSearchInput"
                @keydown.enter.prevent="runSearch"
              />
              <label class="visually-hidden" for="ws-search-tpl">限定模板</label>
              <select
                id="ws-search-tpl"
                v-model="searchTemplate"
                :disabled="!auth.isAuthenticated"
                @change="onFilterChange"
              >
                <option value="">全部模板</option>
                <option v-for="opt in templateOptions" :key="opt.id" :value="opt.id">
                  {{ opt.name }}
                </option>
              </select>
              <button
                type="button"
                class="btn-primary"
                :disabled="!auth.isAuthenticated || searching"
                @click="runSearch"
              >
                {{ searching ? '搜索中…' : '搜索' }}
              </button>
            </div>
            <p v-if="!auth.isAuthenticated" class="muted">登录后可搜索自己的画布。</p>
            <p v-else-if="searchErr" class="inline-error" role="alert">{{ searchErr }}</p>
            <p v-else-if="searched && !searching && !searchHits.length" class="muted">
              没有匹配的画布。换个词，或去掉模板限定再试。
            </p>
            <ul v-if="searchHits.length" class="rows">
              <li v-for="h in searchHits" :key="h.id">
                <button type="button" class="row row--stack" @click="openDoc(h)">
                  <span class="row-copy">
                    <span class="row-title">{{ h.title || '未命名文档' }}</span>
                    <span class="row-meta">
                      {{ templateName(h.templateId || h.canvasType) }} · {{ formatWhen(h.updatedAt) }}
                    </span>
                    <span v-if="snippetParts(h.snippet || '').length" class="snippet">
                      <template v-for="(part, i) in snippetParts(h.snippet || '')" :key="i">
                        <mark v-if="part.mark">{{ part.text }}</mark>
                        <template v-else>{{ part.text }}</template>
                      </template>
                    </span>
                  </span>
                </button>
              </li>
            </ul>
            <button
              v-if="searchQ"
              type="button"
              class="text-btn"
              @click="clearSearch"
            >
              清除搜索
            </button>
          </section>
        </div>

        <div class="col">
          <section class="panel" aria-labelledby="stats-h">
            <header class="panel-head">
              <div>
                <h2 id="stats-h">模板用量</h2>
                <p>按模板类别计数，看思维工具实际用在哪一类问题上。</p>
              </div>
            </header>
            <p v-if="!auth.isAuthenticated" class="muted">登录后按你的画布统计。</p>
            <p v-else-if="loading" class="muted">正在统计…</p>
            <template v-else>
              <ul class="bars">
                <li v-for="b in categoryBuckets" :key="b.key">
                  <div class="bar-label">
                    <span>{{ b.label }}</span>
                    <span>{{ b.count }}</span>
                  </div>
                  <div
                    class="meter"
                    role="meter"
                    :aria-valuenow="b.count"
                    aria-valuemin="0"
                    :aria-valuemax="maxCategory"
                    :aria-label="`${b.label} ${b.count} 份`"
                  >
                    <span
                      class="meter-fill"
                      :style="{ width: barWidth(b.count), background: b.accent }"
                    />
                  </div>
                </li>
              </ul>
              <ul v-if="templateBuckets.length" class="tpl-counts">
                <li v-for="t in templateBuckets" :key="t.id">
                  <span class="dot" :style="{ background: t.accent }" aria-hidden="true" />
                  <span class="tpl-name">{{ t.name }}</span>
                  <span class="tpl-num">{{ t.count }}</span>
                </li>
              </ul>
              <p v-else class="muted">还没有云端画布，用量会在新建并保存后累加。</p>
            </template>
          </section>

          <section class="panel" aria-labelledby="rev-h">
            <header class="panel-head">
              <div>
                <h2 id="rev-h">最近修订</h2>
                <p>取最近更新的画布，汇总它们的修订记录。</p>
              </div>
            </header>
            <p v-if="!auth.isAuthenticated" class="muted">登录后查看存档与自动快照。</p>
            <p v-else-if="loading || revisionsLoading" class="muted">正在读取修订…</p>
            <p v-else-if="!activities.length" class="muted">
              还没有修订。新建或在画布里存档后，会出现在这里。
            </p>
            <ul v-else class="rows">
              <li v-for="a in activities" :key="a.id">
                <button
                  type="button"
                  class="row"
                  @click="openDoc({ id: a.documentId, templateId: a.templateId, canvasType: a.canvasType })"
                >
                  <span class="rev-kind">{{ a.kind }}</span>
                  <span class="row-copy">
                    <span class="row-title">{{ a.label }}</span>
                    <span class="row-meta">{{ a.title }} · {{ templateName(a.templateId || a.canvasType) }}</span>
                  </span>
                  <time class="when" :datetime="a.createdAt">{{ formatWhen(a.createdAt) }}</time>
                </button>
              </li>
            </ul>
          </section>

          <section class="panel" aria-labelledby="notes-h">
            <header class="panel-head">
              <div>
                <h2 id="notes-h">备注与待办</h2>
                <p>
                  备注来自每份画布的「页面设置」。以待办、TODO 或方框开头的行会单独列出来。时间矩阵是专门用来排待办的画布。
                </p>
              </div>
            </header>
            <p v-if="!auth.isAuthenticated" class="muted">登录后汇总备注、待办行，以及正文里的「待办」。</p>
            <p v-else-if="loading" class="muted">正在整理备注…</p>
            <p v-else-if="digestEmpty" class="muted">
              还没有备注。在画布的页面设置里写下备注，或用「待办：」开头的一行；也可以新建一张时间矩阵。
            </p>
            <template v-else>
              <div v-if="noteDigest.todos.length" class="digest-block">
                <h3>待办</h3>
                <ul class="todo-list">
                  <li v-for="item in noteDigest.todos" :key="item.key">
                    <button type="button" class="todo" @click="openDoc(item.doc)">
                      <span
                        class="todo-box"
                        :class="{ 'todo-box--done': item.done }"
                        aria-hidden="true"
                      />
                      <span class="todo-copy">
                        <span class="todo-text" :class="{ done: item.done }">{{ item.text }}</span>
                        <span class="row-meta">{{ item.doc.title || '未命名文档' }}</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
              <div v-if="noteDigest.notes.length" class="digest-block">
                <h3>备注</h3>
                <ul class="rows">
                  <li v-for="item in noteDigest.notes" :key="item.key">
                    <button type="button" class="row row--stack" @click="openDoc(item.doc)">
                      <span class="row-copy">
                        <span class="row-title">{{ item.doc.title || '未命名文档' }}</span>
                        <span class="snippet">{{ item.text }}</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
              <div v-if="matrixDocs.length" class="digest-block">
                <h3>时间矩阵</h3>
                <ul class="rows">
                  <li v-for="d in matrixDocs" :key="d.id">
                    <button type="button" class="row" @click="openDoc(d)">
                      <span class="row-copy">
                        <span class="row-title">{{ d.title || '未命名文档' }}</span>
                        <span class="row-meta">按重要 / 紧急继续排待办</span>
                      </span>
                      <time class="when" :datetime="d.updatedAt">{{ formatWhen(d.updatedAt) }}</time>
                    </button>
                  </li>
                </ul>
              </div>
              <div v-if="todoMentions.length" class="digest-block">
                <h3>正文里的「待办」</h3>
                <ul class="rows">
                  <li v-for="h in todoMentions" :key="h.id">
                    <button type="button" class="row row--stack" @click="openDoc(h)">
                      <span class="row-copy">
                        <span class="row-title">{{ h.title || '未命名文档' }}</span>
                        <span v-if="h.snippet" class="snippet">{{ h.snippet.replace(/\s+/g, ' ') }}</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
            </template>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(ellipse 80% 42% at 50% -12%, #e8f0fe 0%, transparent 58%),
    #fafafa;
  color: #202124;
}

.workspace-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 24px 64px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 20px;
}

.top-copy {
  min-width: 0;
  max-width: 720px;
}

.back {
  display: inline-block;
  margin-bottom: 10px;
  color: #1a73e8;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.back:hover,
.back:focus-visible {
  text-decoration: underline;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1a73e8;
  font-weight: 700;
}

h1 {
  margin: 0 0 8px;
  font-size: clamp(28px, 4vw, 36px);
  letter-spacing: -0.03em;
}

.lead {
  margin: 0;
  color: #5f6368;
  font-size: 15px;
  line-height: 1.6;
}

.top-actions,
.guest-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.who {
  font-size: 13px;
  color: #5f6368;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-primary,
.btn-ghost,
.text-btn {
  font: inherit;
  cursor: pointer;
}

.btn-primary,
.btn-ghost {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 650;
}

.btn-primary {
  border: 0;
  background: #1a73e8;
  color: #fff;
}

.btn-primary:hover:not(:disabled),
.btn-primary:focus-visible {
  background: #1765cc;
  outline: none;
}

.btn-primary:disabled,
.btn-ghost:disabled,
.quick-card:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-ghost {
  border: 1px solid #dadce0;
  background: #fff;
  color: #202124;
}

.btn-ghost:hover:not(:disabled),
.btn-ghost:focus-visible {
  background: #f1f3f4;
  outline: none;
}

.text-btn {
  border: 0;
  background: transparent;
  color: #1a73e8;
  font-size: 13px;
  font-weight: 600;
  padding: 0;
}

.guest {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px 18px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #d2e3fc;
}

.guest h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.guest p,
.panel-head p {
  margin: 0;
  color: #5f6368;
  font-size: 13px;
  line-height: 1.55;
}

.banner-error,
.inline-error {
  color: #d93025;
  font-size: 13px;
}

.banner-error {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fce8e6;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.metric {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-value {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.metric-label {
  font-size: 12px;
  color: #5f6368;
}

.panel {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 16px;
  padding: 16px 16px 14px;
  margin-bottom: 16px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-head h2,
.digest-block h3 {
  margin: 0 0 4px;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.digest-block h3 {
  font-size: 13px;
  color: #5f6368;
  font-weight: 650;
}

.count-pill {
  flex-shrink: 0;
  font-size: 12px;
  color: #174ea6;
  background: #e8f0fe;
  border-radius: 999px;
  padding: 4px 8px;
  font-weight: 650;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.quick-card,
.row,
.todo {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #e8eaed;
  background: #fafafa;
}

.quick-card:hover:not(:disabled),
.quick-card:focus-visible,
.row:hover,
.row:focus-visible,
.todo:hover,
.todo:focus-visible {
  background: #f1f3f4;
  outline: none;
}

.quick-copy,
.row-copy,
.todo-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quick-name,
.row-title {
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-meta,
.row-meta,
.when,
.muted,
.snippet {
  font-size: 12px;
  color: #5f6368;
  line-height: 1.45;
}

.quick-action {
  flex-shrink: 0;
  max-width: 42%;
  font-size: 11.5px;
  font-weight: 650;
  color: #1a73e8;
  text-align: right;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
  gap: 16px;
  align-items: start;
}

.col {
  min-width: 0;
}

.rows,
.bars,
.tpl-counts,
.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row,
.todo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 10px;
}

.row--stack {
  align-items: flex-start;
}

.when {
  flex-shrink: 0;
}

.mark {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent, #7c4dff) 14%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #7c4dff) 22%, transparent);
}

.mark :deep(.thumb--sm) {
  width: 20px;
  height: 20px;
}

.mark-fallback {
  width: 12px;
  height: 14px;
  border-radius: 2px;
  border: 1.5px solid var(--accent, #7c4dff);
}

.snippet {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.snippet mark {
  background: #fef7e0;
  color: inherit;
  padding: 0 2px;
  border-radius: 3px;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.search-row input,
.search-row select {
  font: inherit;
  border: 1px solid #dadce0;
  border-radius: 999px;
  background: #fff;
  color: #202124;
  padding: 8px 12px;
  outline: none;
}

.search-row input {
  flex: 1 1 200px;
  min-width: 0;
}

.search-row select {
  flex: 0 1 160px;
  max-width: 100%;
}

.search-row input:focus,
.search-row select:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.search-row input:disabled,
.search-row select:disabled {
  background: #f1f3f4;
  color: #80868b;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  margin-bottom: 4px;
}

.meter {
  height: 8px;
  border-radius: 999px;
  background: #f1f3f4;
  overflow: hidden;
}

.meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.tpl-counts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid #f1f3f4;
  padding-top: 10px;
}

.tpl-counts li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tpl-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-num {
  color: #5f6368;
  font-variant-numeric: tabular-nums;
}

.rev-kind {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #174ea6;
  background: #e8f0fe;
  border-radius: 6px;
  padding: 3px 6px;
}

.digest-block + .digest-block {
  margin-top: 14px;
}

.todo-box {
  width: 14px;
  height: 14px;
  border: 1.5px solid #5f6368;
  border-radius: 3px;
  flex-shrink: 0;
}

.todo-box--done {
  background: #34a853;
  border-color: #34a853;
  box-shadow: inset 0 0 0 2px #fff;
}

.todo-text.done {
  text-decoration: line-through;
  color: #80868b;
}

.muted {
  margin: 4px 0 0;
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

@media (max-width: 900px) {
  .top,
  .guest {
    flex-direction: column;
    align-items: stretch;
  }

  .metrics,
  .columns {
    grid-template-columns: 1fr;
  }

  .workspace-inner {
    padding: 20px 14px 48px;
  }
}
</style>
