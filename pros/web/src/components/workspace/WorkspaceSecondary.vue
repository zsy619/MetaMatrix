<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import GuideThumb from '../guide/GuideThumb.vue'
import {
  listDocuments,
  searchDocuments,
  type DocumentSummary,
  type SearchHit,
} from '../../api/documents'
import { useAuthStore } from '../../stores/auth'
import {
  TEMPLATE_META,
  cloneTemplate,
  isTemplateId,
  useDocumentStore,
  type TemplateId,
} from '../../stores/document'
import { accentOf } from './palette'
import { friendlyApiMessage } from '../../utils/apiMessage'
import LineSkeleton from '../ui/LineSkeleton.vue'

const STARTERS: TemplateId[] = [
  'time-matrix',
  'weekly-summary',
  'y-model',
  'five-step-basic',
]

const router = useRouter()
const auth = useAuthStore()
const documentStore = useDocumentStore()

const open = ref(false)
const loaded = ref(false)
const loading = ref(false)
const docs = ref<DocumentSummary[]>([])
const mentions = ref<SearchHit[]>([])
const searchQ = ref('')
const searchHits = ref<SearchHit[]>([])
const searching = ref(false)
const searchErr = ref('')
const searched = ref(false)
const creatingId = ref<TemplateId | null>(null)
const createError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchAbort: AbortController | null = null

function templateName(id: string | null | undefined): string {
  if (id && isTemplateId(id)) return TEMPLATE_META[id].name
  return id || '画布'
}

function knownTemplate(id: string | null | undefined): TemplateId | null {
  return id && isTemplateId(id) ? id : null
}

function thumbId(d: { templateId: string | null; canvasType?: string }): TemplateId {
  return knownTemplate(d.templateId || d.canvasType) ?? 'dual-triangle'
}

function formatWhen(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const min = Math.round((Date.now() - t.getTime()) / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} 天前`
  return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function parseTodoLine(line: string): { text: string; done: boolean } | null {
  const checkbox = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/)
  if (checkbox?.[2]) return { done: checkbox[1]?.toLowerCase() === 'x', text: checkbox[2].trim() }
  const mark = line.match(/^\s*([□☐☑✓✔])\s*(.+)$/)
  if (mark?.[2]) {
    const done = mark[1] === '☑' || mark[1] === '✓' || mark[1] === '✔'
    return { done, text: mark[2].trim() }
  }
  const labeled = line.match(/^\s*(?:待办|TODO)\s*[:：]\s*(.+)$/i)
  if (labeled?.[1]) return { done: false, text: labeled[1].trim() }
  return null
}

const recentDocs = computed(() => docs.value.slice(0, 6))

const noteDigest = computed(() => {
  const todos: { key: string; doc: DocumentSummary; text: string; done: boolean }[] = []
  const notes: { key: string; doc: DocumentSummary; text: string }[] = []
  for (const d of docs.value) {
    const raw = (d.notes || '').trim()
    if (!raw) continue
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    const rest: string[] = []
    lines.forEach((line, index) => {
      const todo = parseTodoLine(line)
      if (todo) todos.push({ key: `${d.id}:${index}`, doc: d, text: todo.text, done: todo.done })
      else rest.push(line)
    })
    if (rest.length) {
      notes.push({
        key: d.id,
        doc: d,
        text: rest.join(' ').replace(/\s+/g, ' ').slice(0, 140),
      })
    }
  }
  todos.sort((a, b) => Number(a.done) - Number(b.done))
  return { todos: todos.slice(0, 6), notes: notes.slice(0, 4) }
})

function openDoc(d: { id: string; templateId: string | null; canvasType?: string }) {
  const tid = knownTemplate(d.templateId) || knownTemplate(d.canvasType) || 'dual-triangle'
  router.push({ name: 'canvas', params: { templateId: tid }, query: { documentId: d.id } })
}

function freshTitle(id: TemplateId): string {
  const now = new Date()
  return `${TEMPLATE_META[id].name} · ${now.getMonth() + 1}月${now.getDate()}日`
}

async function quickCreate(id: TemplateId) {
  createError.value = ''
  if (!auth.isAuthenticated) {
    router.push({ name: 'canvas', params: { templateId: id } })
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
    router.push({ name: 'canvas', params: { templateId: id }, query: { documentId: docId } })
  } catch (e) {
    createError.value = friendlyApiMessage(e, '新建失败')
  } finally {
    creatingId.value = null
  }
}

async function ensureLoaded() {
  if (!auth.isAuthenticated || loaded.value || loading.value) return
  loading.value = true
  try {
    const [rows, hits] = await Promise.all([
      listDocuments({ limit: 40 }),
      searchDocuments({ q: '待办', limit: 5 }).catch(() => [] as SearchHit[]),
    ])
    const list = Array.isArray(rows) ? rows : []
    list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    docs.value = list
    mentions.value = Array.isArray(hits) ? hits : []
    loaded.value = true
  } catch {
    docs.value = []
  } finally {
    loading.value = false
  }
}

function onToggle(e: Event) {
  const el = e.target as HTMLDetailsElement
  open.value = el.open
  if (el.open) void ensureLoaded()
}

async function runSearch() {
  searchErr.value = ''
  searchAbort?.abort()
  if (!auth.isAuthenticated) {
    searchErr.value = '登录后只能搜索你自己的画布。'
    return
  }
  const q = searchQ.value.trim()
  if (!q) {
    searchHits.value = []
    searched.value = false
    return
  }
  const ctrl = new AbortController()
  searchAbort = ctrl
  searching.value = true
  searched.value = true
  try {
    searchHits.value = await searchDocuments({ q, limit: 8 }, { signal: ctrl.signal })
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
  searchTimer = setTimeout(() => void runSearch(), 280)
}
</script>

<template>
  <details class="secondary" @toggle="onToggle">
    <summary>
      <span>搜索、备注与快速新建</span>
      <span class="hint">次要入口，需要时再展开</span>
    </summary>
    <div v-if="open" class="body">
      <p v-if="!auth.isAuthenticated" class="muted">登录后可以接着写、搜索正文，并查看备注里的待办。</p>
      <template v-else>
        <div class="quick">
          <button
            v-for="id in STARTERS"
            :key="id"
            type="button"
            class="quick-btn"
            :disabled="creatingId !== null"
            @click="quickCreate(id)"
          >
            <span class="mark" :style="{ '--accent': accentOf(id) }">
              <GuideThumb :template-id="id" size="sm" />
            </span>
            {{ creatingId === id ? '新建中…' : TEMPLATE_META[id].name }}
          </button>
        </div>
        <p v-if="createError" class="err">{{ createError }}</p>

        <div class="cols">
          <section>
            <h3>最近编辑</h3>
            <LineSkeleton v-if="loading" />
            <p v-else-if="!recentDocs.length" class="muted">还没有云端画布。</p>
            <ul v-else class="rows">
              <li v-for="d in recentDocs" :key="d.id">
                <button type="button" class="row" @click="openDoc(d)">
                  <span class="mark" :style="{ '--accent': accentOf(d.templateId || d.canvasType) }">
                    <GuideThumb v-if="knownTemplate(d.templateId || d.canvasType)" :template-id="thumbId(d)" size="sm" />
                  </span>
                  <span class="copy">
                    <strong>{{ d.title || '未命名文档' }}</strong>
                    <em>{{ templateName(d.templateId || d.canvasType) }}</em>
                  </span>
                  <time>{{ formatWhen(d.updatedAt) }}</time>
                </button>
              </li>
            </ul>
          </section>
          <section>
            <h3>全文搜索</h3>
            <div class="search">
              <input
                v-model="searchQ"
                type="search"
                aria-label="搜索标题或正文"
                placeholder="标题或正文关键词"
                @input="onSearchInput"
                @keydown.enter.prevent="runSearch"
              />
              <button type="button" class="go" :disabled="searching" @click="runSearch">搜索</button>
            </div>
            <p v-if="searchErr" class="err" role="alert">
              {{ searchErr }}
              <button type="button" class="mm-btn mm-btn--ghost" @click="runSearch">重试</button>
            </p>
            <p v-else-if="searched && !searching && !searchHits.length" class="muted" role="status">
              没有匹配。只搜索当前账号的画布。
            </p>
            <ul v-if="searchHits.length" class="rows">
              <li v-for="h in searchHits" :key="h.id">
                <button type="button" class="row stack" @click="openDoc(h)">
                  <span class="copy">
                    <strong>{{ h.title || '未命名文档' }}</strong>
                    <em>{{ h.snippet }}</em>
                  </span>
                </button>
              </li>
            </ul>
          </section>
          <section>
            <h3>备注与待办</h3>
            <LineSkeleton v-if="loading" />
            <p v-else-if="!noteDigest.todos.length && !noteDigest.notes.length && !mentions.length" class="muted">
              在页面设置里写备注，或以「待办：」开头。
            </p>
            <ul v-if="noteDigest.todos.length" class="rows">
              <li v-for="item in noteDigest.todos" :key="item.key">
                <button type="button" class="row" @click="openDoc(item.doc)">
                  <span class="box" :class="{ done: item.done }" />
                  <span class="copy">
                    <strong :class="{ strike: item.done }">{{ item.text }}</strong>
                    <em>{{ item.doc.title || '未命名文档' }}</em>
                  </span>
                </button>
              </li>
            </ul>
            <ul v-if="noteDigest.notes.length" class="rows">
              <li v-for="item in noteDigest.notes" :key="item.key">
                <button type="button" class="row stack" @click="openDoc(item.doc)">
                  <span class="copy">
                    <strong>{{ item.doc.title || '未命名文档' }}</strong>
                    <em>{{ item.text }}</em>
                  </span>
                </button>
              </li>
            </ul>
            <ul v-if="mentions.length" class="rows">
              <li v-for="h in mentions" :key="`m-${h.id}`">
                <button type="button" class="row stack" @click="openDoc(h)">
                  <span class="copy">
                    <strong>{{ h.title || '未命名文档' }}</strong>
                    <em>正文提到待办</em>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>
  </details>
</template>

<style scoped>
.secondary {
  background: transparent;
  border: 1px dashed var(--mm-line-strong);
  border-radius: 16px;
  padding: 2px 16px 8px;
}

summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  padding: 12px 0;
  font-weight: 650;
  color: var(--mm-muted);
}

summary::-webkit-details-marker {
  display: none;
}

.hint {
  font-size: 12px;
  font-weight: 450;
  color: #9aa0a6;
}

.body {
  padding-bottom: 12px;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.quick-btn,
.row,
.go {
  font: inherit;
  cursor: pointer;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e8eaed;
  background: #fafafa;
  border-radius: 999px;
  padding: 6px 12px 6px 6px;
  font-size: 13px;
}

.cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #5f6368;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 6px;
  color: inherit;
}

.row:hover,
.quick-btn:hover {
  background: #f1f3f4;
}

.copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.copy strong,
.copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy strong {
  font-size: 13px;
  font-weight: 650;
}

.copy em,
time,
.muted {
  font-size: 12px;
  color: #5f6368;
  font-style: normal;
}

.stack {
  align-items: flex-start;
}

.mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent, #7c4dff) 14%, #fff);
  flex-shrink: 0;
}

.mark :deep(.thumb--sm) {
  width: 16px;
  height: 16px;
}

.search {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.search input {
  flex: 1;
  min-width: 0;
  border: 1px solid #dadce0;
  border-radius: 999px;
  padding: 7px 12px;
  font: inherit;
}

.go {
  border: 0;
  background: #1a73e8;
  color: #fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 650;
}

.box {
  width: 12px;
  height: 12px;
  border: 1.5px solid #5f6368;
  border-radius: 2px;
  flex-shrink: 0;
}

.box.done {
  background: #34a853;
  border-color: #34a853;
}

.strike {
  text-decoration: line-through;
  color: #80868b;
}

.err {
  color: #d93025;
  font-size: 12px;
}

@media (max-width: 900px) {
  .cols {
    grid-template-columns: 1fr;
  }
  summary {
    flex-direction: column;
  }
}
</style>
