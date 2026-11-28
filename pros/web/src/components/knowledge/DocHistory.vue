<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Files, Refresh, RefreshLeft, Timer } from '@element-plus/icons-vue'
import { diffRevisions, listRevisions, materializeRevision } from '../../api/documents'
import type { RevisionSummary, TextDiffOp } from '../../api/documents'
import { friendlyApiMessage } from '../../utils/apiMessage'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [html: string] }>()

const revisions = ref<RevisionSummary[]>([])
const loading = ref(false)
const restoring = ref<string | null>(null)
/** 展开查看差异的版本 id */
const expandedId = ref<string>('')
/** 每个版本的差异摘要（懒加载，只在展开时请求） */
const diffCache = ref<Record<string, DiffSummary>>({})

type DiffSummary = {
  loading: boolean
  error: string
  added: number
  removed: number
  /** 差异预览行（最多 8 条） */
  lines: Array<{ op: 'equal' | 'insert' | 'delete'; text: string }>
  /** 对比对象说明 */
  againstLabel: string
}

const EMPTY_DIFF: DiffSummary = {
  loading: false,
  error: '',
  added: 0,
  removed: 0,
  lines: [],
  againstLabel: '',
}

const revisionsSorted = computed(() =>
  [...revisions.value].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
)

async function load() {
  loading.value = true
  expandedId.value = ''
  diffCache.value = {}
  try {
    const res = await listRevisions(props.documentId, { limit: 30 })
    revisions.value = Array.isArray(res) ? res : res.items
  } catch {
    revisions.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.documentId, load, { immediate: true })

async function restore(rev: RevisionSummary) {
  try {
    await ElMessageBox.confirm(
      `恢复到「${versionName(rev)}」？当前未保存内容会被覆盖。`,
      '恢复历史版本',
      { type: 'warning' },
    )
  } catch {
    return
  }
  restoring.value = rev.id
  try {
    const res = await materializeRevision(props.documentId, rev.id)
    const data = res.data as { html?: string } | undefined
    emit('restored', data?.html ?? '')
    ElMessage.success('已恢复到历史版本')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '恢复失败'))
  } finally {
    restoring.value = null
  }
}

/* ---------------- 展示辅助 ---------------- */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timeLabel(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortLabel(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 5 天前 / 更早 */
function relativeLabel(s: string): string {
  if (!s) return ''
  const t = new Date(s).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  if (day < 30) return `${Math.floor(day / 7)} 周前`
  return shortLabel(s)
}

/** 版本名：有自定义标题就用标题，否则按序号生成「版本 N」。 */
function versionName(rev: RevisionSummary): string {
  const label = (rev.label || '').trim()
  if (label && label.toLowerCase() !== 'initial') return label
  const idx = revisionsSorted.value.findIndex((r) => r.id === rev.id)
  return `版本 ${revisionsSorted.value.length - (idx < 0 ? 0 : idx)}`
}

/** 序号徽标：最新版本标「当前」之前的用倒序号。 */
function seqBadge(rev: RevisionSummary): string {
  const idx = revisionsSorted.value.findIndex((r) => r.id === rev.id)
  if (idx === 0) return '最新'
  return `#${revisionsSorted.value.length - idx}`
}

function isSnapshot(rev: RevisionSummary): boolean {
  return rev.revisionType === 'snapshot'
}

/* ---------------- 差异对比（懒加载） ---------------- */

/** 去掉 HTML 标签，纯文本更好读（部分文档的快照是 HTML 源码）。 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function summarizeOps(ops: TextDiffOp[]) {
  let added = 0
  let removed = 0
  const lines: DiffSummary['lines'] = []
  for (const op of ops) {
    const kind = op.op === 'insert' ? 'insert' : op.op === 'delete' ? 'delete' : 'equal'
    const raw = (op.text || '').replace(/\s+$/, '')
    const text = stripHtml(raw)
    if (kind === 'insert') added += text.length
    else if (kind === 'delete') removed += text.length
    if (kind !== 'equal' && text) {
      if (lines.length < 8) lines.push({ op: kind, text: text.slice(0, 120) })
    }
  }
  return { added, removed, lines }
}

async function toggleDiff(rev: RevisionSummary) {
  if (expandedId.value === rev.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = rev.id
  if (diffCache.value[rev.id]) return
  diffCache.value = { ...diffCache.value, [rev.id]: { ...EMPTY_DIFF, loading: true } }
  // 有父版本就与父版本比；根版本没有父版本，改与当前内容比。
  const parentId = rev.parentId
  try {
    const res = parentId
      ? await diffRevisions(props.documentId, parentId, rev.id)
      : await diffRevisions(props.documentId, rev.id)
    const summary = summarizeOps(res.textDiff || [])
    diffCache.value = {
      ...diffCache.value,
      [rev.id]: {
        ...EMPTY_DIFF,
        ...summary,
        againstLabel: parentId ? '与上一版本的差异' : '与当前内容的差异',
      },
    }
  } catch (err) {
    diffCache.value = {
      ...diffCache.value,
      [rev.id]: {
        ...EMPTY_DIFF,
        error: friendlyApiMessage(err, '差异读取失败'),
        againstLabel: parentId ? '与上一版本的差异' : '与当前内容的差异',
      },
    }
  }
}
</script>

<template>
  <section class="doc-history">
    <header class="doc-history__head">
      <span class="doc-history__title">
        <el-icon class="doc-history__title-icon"><Timer /></el-icon>历史版本
      </span>
      <span v-if="revisionsSorted.length" class="doc-history__count">
        {{ revisionsSorted.length }} 个版本
      </span>
      <el-button
        class="doc-history__refresh"
        size="small"
        text
        :loading="loading"
        title="刷新历史版本"
        aria-label="刷新历史版本"
        @click="load"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </header>

    <p v-if="loading" class="doc-history__empty">加载中…</p>
    <p v-else-if="!revisionsSorted.length" class="doc-history__empty">
      <el-icon class="doc-history__empty-icon"><Files /></el-icon>
      暂无历史版本，文档保存后会生成快照
    </p>

    <ul v-else class="doc-history__list">
      <li
        v-for="rev in revisionsSorted"
        :key="rev.id"
        class="doc-history__item"
        :class="{ 'is-open': expandedId === rev.id }"
      >
        <div class="doc-history__row">
          <span
            class="doc-history__badge"
            :class="{ 'is-latest': seqBadge(rev) === '最新' }"
          >{{ seqBadge(rev) }}</span>
          <button
            type="button"
            class="doc-history__main"
            :title="`展开 ${versionName(rev)} 的差异`"
            @click="toggleDiff(rev)"
          >
            <span class="doc-history__name">{{ versionName(rev) }}</span>
            <span class="doc-history__meta">
              <span class="doc-history__time" :title="timeLabel(rev.createdAt)">
                <el-icon class="doc-history__meta-icon"><Clock /></el-icon>
                {{ relativeLabel(rev.createdAt) }}
              </span>
              <span v-if="isSnapshot(rev)" class="doc-history__tag">快照</span>
              <span class="doc-history__id">{{ rev.id.slice(0, 8) }}</span>
            </span>
          </button>
          <el-button
            class="doc-history__restore"
            size="small"
            text
            :loading="restoring === rev.id"
            title="恢复到这个版本"
            @click="restore(rev)"
          >
            <el-icon><RefreshLeft /></el-icon><span>恢复</span>
          </el-button>
        </div>

        <div v-if="expandedId === rev.id" class="doc-history__diff">
          <div v-if="diffCache[rev.id]?.loading" class="doc-history__diff-state">正在计算差异…</div>
          <div v-else-if="diffCache[rev.id]?.error" class="doc-history__diff-state is-error">
            {{ diffCache[rev.id]?.error }}
          </div>
          <template v-else-if="diffCache[rev.id]">
            <div class="doc-history__diff-head">
              <span class="doc-history__diff-title">{{ diffCache[rev.id].againstLabel }}</span>
              <span v-if="diffCache[rev.id].added" class="doc-history__stat is-add">
                +{{ diffCache[rev.id].added }}
              </span>
              <span v-if="diffCache[rev.id].removed" class="doc-history__stat is-del">
                -{{ diffCache[rev.id].removed }}
              </span>
            </div>
            <p v-if="!diffCache[rev.id].lines.length" class="doc-history__diff-state">
              与对比版本内容一致
            </p>
            <ul v-else class="doc-history__diff-list">
              <li
                v-for="(line, i) in diffCache[rev.id].lines"
                :key="i"
                class="doc-history__diff-line"
                :class="`is-${line.op}`"
              >
                <span class="doc-history__diff-sign">{{ line.op === 'insert' ? '+' : '−' }}</span>{{ line.text }}
              </li>
            </ul>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.doc-history {
  padding: 12px 10px 16px;
  font-size: 13px;
}

/* 头部：标题 + 数量徽标 + 刷新 */
.doc-history__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.doc-history__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
  letter-spacing: 0.2px;
}
.doc-history__title-icon {
  font-size: 14px;
  color: var(--tg-blue, #3390ec);
}
.doc-history__count {
  font-size: 11px;
  color: var(--tg-text-2, #707579);
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.doc-history__refresh {
  margin-left: auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 999px;
  color: var(--tg-text-2, #707579);
}
.doc-history__refresh:hover {
  background: rgba(255, 255, 255, 0.8);
  color: var(--tg-blue, #3390ec);
}

.doc-history__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 18px 0;
  font-size: 12px;
  color: var(--tg-text-2, #707579);
  text-align: center;
}
.doc-history__empty-icon {
  font-size: 26px;
  color: var(--tg-text-3, #8e8e8e);
  opacity: 0.6;
}

/* 卡片列表 */
.doc-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.doc-history__item {
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.66);
  background: rgba(255, 255, 255, 0.46);
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  transition: box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}
.doc-history__item:hover {
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.doc-history__item.is-open {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(51, 144, 236, 0.28);
}

.doc-history__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 9px;
}
.doc-history__badge {
  flex: none;
  min-width: 30px;
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--tg-text-2, #707579);
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.doc-history__badge.is-latest,
.doc-history__item.is-open .doc-history__badge {
  color: #fff;
  background: var(--tg-blue, #3390ec);
}

.doc-history__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.doc-history__name {
  max-width: 100%;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-history__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--tg-text-2, #707579);
}
.doc-history__time {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.doc-history__meta-icon {
  font-size: 11px;
}
.doc-history__tag {
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--tg-blue, #3390ec);
  background: rgba(51, 144, 236, 0.1);
}
.doc-history__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--tg-text-3, #8e8e8e);
}

.doc-history__restore {
  flex: none;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--tg-blue, #3390ec);
}
.doc-history__restore:hover {
  background: rgba(51, 144, 236, 0.1);
}

/* 差异区 */
.doc-history__diff {
  border-top: 1px dashed rgba(15, 23, 42, 0.1);
  padding: 7px 9px 9px;
}
.doc-history__diff-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.doc-history__diff-title {
  font-size: 11px;
  color: var(--tg-text-2, #707579);
}
.doc-history__stat {
  font-size: 11px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 4px;
}
.doc-history__stat.is-add {
  color: #1a9c5b;
  background: rgba(26, 156, 91, 0.1);
}
.doc-history__stat.is-del {
  color: #d4403b;
  background: rgba(212, 64, 59, 0.1);
}
.doc-history__diff-state {
  margin: 0;
  font-size: 11.5px;
  color: var(--tg-text-2, #707579);
}
.doc-history__diff-state.is-error {
  color: #d4403b;
}
.doc-history__diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.doc-history__diff-line {
  font-size: 11px;
  line-height: 1.5;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--tg-text, #0f0f0f);
  word-break: break-word;
  white-space: pre-wrap;
}
.doc-history__diff-line.is-insert {
  background: rgba(26, 156, 91, 0.12);
  color: #127a46;
}
.doc-history__diff-line.is-delete {
  background: rgba(212, 64, 59, 0.1);
  color: #b1342f;
  text-decoration: line-through;
  text-decoration-color: rgba(212, 64, 59, 0.4);
}
.doc-history__diff-sign {
  font-weight: 700;
  margin-right: 4px;
  opacity: 0.7;
}
</style>
