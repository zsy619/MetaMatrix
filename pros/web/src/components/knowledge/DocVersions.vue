<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ChatDotRound,
  Files,
  Refresh,
  RefreshLeft,
  Sort,
  Stamp,
} from '@element-plus/icons-vue'
import { diffDocVersions, labelDocVersion, listDocVersions, listVersionAuthors } from '../../api/knowledge'
import { listVersionComments } from '../../api/knowledge_v5'
import type { DocComment } from '../../api/knowledge'
import type { DocVersion } from '../../api/knowledge'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [html: string] }>()

const versions = ref<DocVersion[]>([])
const loading = ref(false)
const comparing = ref(false)
const fromId = ref('')
const toId = ref('')
/** 后端返回的 unified diff 原文（每行以 "+ " / "- " / "  " 开头）。 */
const diffRaw = ref('')
/** 版本作者显示名。 */
const authors = ref<Record<string, string>>({})
/** 并排对比视图。 */
const sideBySide = ref(false)
/** 并排对比时两侧的正文。 */
const fromHtml = ref('')
const toHtml = ref('')
/** 是否已经执行过一次对比。 */
const compared = ref(false)
/** 是否显示未改动的上下文行（默认只看变化）。 */
const showContext = ref(false)
/** 某个版本当时的评论。 */
const versionComments = ref<DocComment[]>([])
const commentsOpen = ref(false)
const commentsVersion = ref('')

type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }

const diffLines = computed<DiffLine[]>(() =>
  diffRaw.value
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => {
      if (l.startsWith('+ ')) return { kind: 'add' as const, text: l.slice(2) }
      if (l.startsWith('- ')) return { kind: 'del' as const, text: l.slice(2) }
      return { kind: 'ctx' as const, text: l.slice(2) }
    }),
)

const changedLines = computed(() => diffLines.value.filter((l) => l.kind !== 'ctx'))

const diffStat = computed(() => {
  let added = 0
  let removed = 0
  for (const l of changedLines.value) {
    const n = l.text.trim().length
    if (l.kind === 'add') added += n
    else removed += n
  }
  return { added, removed }
})

/** 展示用的差异行：默认只显示变化行，最多 120 条。 */
const visibleDiff = computed(() => {
  const src = showContext.value ? diffLines.value : changedLines.value
  return src.slice(0, 120)
})

const diffOverflow = computed(() => {
  const src = showContext.value ? diffLines.value : changedLines.value
  return Math.max(0, src.length - 120)
})

async function load() {
  loading.value = true
  diffRaw.value = ''
  compared.value = false
  try {
    versions.value = await listDocVersions(props.documentId, 30)
    authors.value = await listVersionAuthors(props.documentId).catch(() => ({}))
    if (versions.value.length >= 2) {
      toId.value = versions.value[0].id
      fromId.value = versions.value[1].id
    } else if (versions.value.length === 1) {
      toId.value = versions.value[0].id
      fromId.value = versions.value[0].id
    }
  } catch {
    ElMessage.error('加载历史版本失败')
  } finally {
    loading.value = false
  }
}

async function compare() {
  if (!fromId.value || !toId.value) return
  comparing.value = true
  try {
    const res = await diffDocVersions(props.documentId, fromId.value, toId.value)
    diffRaw.value = res.diff || ''
    compared.value = true
    const from = versions.value.find((v) => v.id === fromId.value)
    const to = versions.value.find((v) => v.id === toId.value)
    fromHtml.value = from?.html ?? ''
    toHtml.value = to?.html ?? ''
  } catch {
    ElMessage.error('对比失败')
  } finally {
    comparing.value = false
  }
}

/** 给版本加备注：如「发布版」「终稿」。 */
async function label(version: DocVersion) {
  const { value } = await ElMessageBox.prompt('版本备注', '标记版本', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: version.label || '',
  })
  try {
    const updated = await labelDocVersion(props.documentId, version.id, value.trim())
    version.label = updated.label
    ElMessage.success('已标记')
  } catch {
    ElMessage.error('标记失败')
  }
}

/** 查看版本当时的评论。 */
async function showComments(version: DocVersion) {
  try {
    versionComments.value = await listVersionComments(props.documentId, version.id)
    commentsVersion.value = new Date(version.createdAt).toLocaleString()
    commentsOpen.value = true
  } catch {
    ElMessage.error('读取历史评论失败')
  }
}

function restore(version: DocVersion) {
  emit('restored', version.html)
  ElMessage.success('已载入该版本，保存后生效')
}

/* ---------------- 展示辅助 ---------------- */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function shortTime(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relativeLabel(s: string): string {
  if (!s) return ''
  const t = new Date(s).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return shortTime(s)
}

/** 下拉里的选项文案：v15 · 16:24（今天的只给时分，其余带日期；作者在下方列表里单独显示） */
function optionLabel(v: DocVersion): string {
  const d = new Date(v.createdAt)
  const now = new Date()
  const sameDay =
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  return sameDay
    ? `v${v.saveVersion} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `v${v.saveVersion} · ${shortTime(v.createdAt)}`
}

function authorName(v: DocVersion): string {
  return authors.value[v.authorUserId] || '未知作者'
}

function isSameVersion(): boolean {
  return !!fromId.value && fromId.value === toId.value
}

watch(() => props.documentId, load)
onMounted(load)
</script>

<template>
  <section class="versions">
    <header class="versions__head">
      <span class="versions__title">
        <el-icon class="versions__title-icon"><Files /></el-icon>版本记录
      </span>
      <span v-if="versions.length" class="versions__count">{{ versions.length }} 个版本</span>
      <el-button
        class="versions__refresh"
        size="small"
        text
        :loading="loading"
        title="刷新版本列表"
        aria-label="刷新版本列表"
        @click="load"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </header>

    <!-- 对比条：上下两行，避免窄侧栏里下拉框被挤成「V...」 -->
    <div class="versions__compare-bar">
      <div class="versions__picks">
        <el-select v-model="fromId" size="small" class="versions__select" placeholder="旧版本">
          <el-option v-for="v in versions" :key="v.id" :label="optionLabel(v)" :value="v.id" />
        </el-select>
        <span class="versions__arrow">→</span>
        <el-select v-model="toId" size="small" class="versions__select" placeholder="新版本">
          <el-option v-for="v in versions" :key="v.id" :label="optionLabel(v)" :value="v.id" />
        </el-select>
      </div>
      <div class="versions__actions">
        <el-button
          class="versions__compare-btn"
          size="small"
          type="primary"
          :loading="comparing"
          :disabled="!fromId || !toId"
          @click="compare"
        >
          对比
        </el-button>
        <div class="versions__mode">
          <button
            type="button"
            :class="['versions__mode-btn', { 'is-on': !sideBySide }]"
            @click="sideBySide = false"
          >文本</button>
          <button
            type="button"
            :class="['versions__mode-btn', { 'is-on': sideBySide }]"
            @click="sideBySide = true"
          >并排</button>
        </div>
      </div>
    </div>

    <p v-if="loading" class="versions__empty">加载中…</p>
    <p v-else-if="!versions.length" class="versions__empty">
      <el-icon class="versions__empty-icon"><Files /></el-icon>
      还没有历史版本，编辑并保存后自动生成
    </p>

    <template v-else>
      <ul class="versions__list">
        <li v-for="v in versions" :key="v.id" class="versions__item">
          <span class="versions__ver">v{{ v.saveVersion }}</span>
          <div class="versions__info">
            <span class="versions__title-line">
              <span class="versions__name">{{ v.label || `版本 ${v.saveVersion}` }}</span>
              <span class="versions__author">{{ authorName(v) }}</span>
            </span>
            <span class="versions__meta">
              <span class="versions__time" :title="new Date(v.createdAt).toLocaleString()">
                {{ relativeLabel(v.createdAt) }}
              </span>
              <span class="versions__time-abs">{{ shortTime(v.createdAt) }}</span>
            </span>
          </div>
          <div class="versions__ops">
            <button
              type="button"
              class="versions__op"
              title="给这个版本加备注"
              @click="label(v)"
            >
              <el-icon><Stamp /></el-icon>
            </button>
            <button
              type="button"
              class="versions__op"
              title="查看当时的评论"
              @click="showComments(v)"
            >
              <el-icon><ChatDotRound /></el-icon>
            </button>
            <button
              type="button"
              class="versions__op is-primary"
              title="载入这个版本"
              @click="restore(v)"
            >
              <el-icon><RefreshLeft /></el-icon>
            </button>
          </div>
        </li>
      </ul>

      <!-- 对比结果 -->
      <div v-if="compared" class="versions__result">
        <div class="versions__result-head">
          <span class="versions__result-title">
            <el-icon class="versions__result-icon"><Sort /></el-icon>差异对比
          </span>
          <span v-if="diffStat.added" class="versions__stat is-add">+{{ diffStat.added }}</span>
          <span v-if="diffStat.removed" class="versions__stat is-del">-{{ diffStat.removed }}</span>
          <el-checkbox v-model="showContext" size="small" class="versions__ctx-toggle">
            显示未改动内容
          </el-checkbox>
        </div>

        <p v-if="isSameVersion()" class="versions__empty">请选择两个不同的版本进行对比。</p>
        <p v-else-if="!changedLines.length" class="versions__empty">两个版本内容一致</p>
        <template v-else>
          <div v-if="sideBySide" class="versions__side">
            <div class="versions__side-col">
              <div class="versions__side-title">旧版本</div>
              <div class="versions__side-body" v-html="fromHtml" />
            </div>
            <div class="versions__side-col">
              <div class="versions__side-title">新版本</div>
              <div class="versions__side-body" v-html="toHtml" />
            </div>
          </div>
          <ul v-else class="versions__diff">
            <li
              v-for="(line, i) in visibleDiff"
              :key="i"
              class="versions__diff-line"
              :class="`is-${line.kind}`"
            >
              <span class="versions__diff-sign">
                {{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : '' }}
              </span>{{ line.text }}
            </li>
          </ul>
          <p v-if="diffOverflow" class="versions__overflow">还有 {{ diffOverflow }} 行未显示</p>
        </template>
      </div>
    </template>

    <el-dialog v-model="commentsOpen" title="该版本当时的评论" width="480px" append-to-body>
      <p class="versions__empty">版本时间：{{ commentsVersion }}</p>
      <p v-if="!versionComments.length" class="versions__empty">该版本之前还没有评论。</p>
      <ul v-else class="versions__comments">
        <li v-for="comment in versionComments" :key="comment.id">
          <span class="versions__time">{{ new Date(comment.createdAt).toLocaleString() }}</span>
          <span>{{ comment.content }}</span>
        </li>
      </ul>
    </el-dialog>
  </section>
</template>

<style scoped>
.versions {
  padding: 12px 10px 16px;
  font-size: 13px;
}

/* 头部 */
.versions__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.versions__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
}
.versions__title-icon {
  font-size: 14px;
  color: var(--tg-blue, #3390ec);
}
.versions__count {
  font-size: 11px;
  color: var(--tg-text-2, #707579);
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.versions__refresh {
  margin-left: auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 999px;
  color: var(--tg-text-2, #707579);
}
.versions__refresh:hover {
  background: rgba(255, 255, 255, 0.8);
  color: var(--tg-blue, #3390ec);
}

/* 对比条 */
.versions__compare-bar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 10px;
  padding: 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.46);
  border: 1px solid rgba(255, 255, 255, 0.66);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}
.versions__picks {
  display: flex;
  align-items: center;
  gap: 6px;
}
.versions__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.versions__actions .versions__mode {
  margin-left: auto;
}
.versions__select {
  flex: 1;
  min-width: 0;
}
.versions__select :deep(.el-select__wrapper) {
  font-size: 11.5px;
  padding: 0 8px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}
.versions__select :deep(.el-select__selected-item) {
  font-size: 11.5px;
  line-height: 22px;
}
.versions__arrow {
  flex: none;
  color: var(--tg-text-2, #707579);
  font-size: 12px;
}
.versions__compare-btn {
  flex: none;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
}
/* 文本 / 并排 分段开关 */
.versions__mode {
  flex: none;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.07);
}
.versions__mode-btn {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 0 8px;
  height: 22px;
  font-size: 11.5px;
  color: var(--tg-text-2, #707579);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.versions__mode-btn.is-on {
  background: #fff;
  color: var(--tg-blue, #3390ec);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.14);
}

/* 版本列表：卡片 */
.versions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
}
.versions__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.66);
  background: rgba(255, 255, 255, 0.46);
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  transition: background 0.16s ease, box-shadow 0.16s ease;
}
.versions__item:hover {
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.versions__ver {
  flex: none;
  min-width: 34px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--tg-blue, #3390ec);
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(51, 144, 236, 0.1);
}
.versions__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.versions__title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.versions__name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.versions__author {
  flex: none;
  font-size: 11px;
  color: var(--tg-text-2, #707579);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.versions__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--tg-text-2, #707579);
}
.versions__time-abs {
  font-size: 10.5px;
  color: var(--tg-text-3, #8e8e8e);
}
.versions__ops {
  flex: none;
  display: flex;
  gap: 2px;
}
.versions__op {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tg-text-2, #707579);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.versions__op:hover {
  background: rgba(255, 255, 255, 0.9);
  color: var(--tg-blue, #3390ec);
}
.versions__op.is-primary:hover {
  color: #1a9c5b;
}

/* 空状态 */
.versions__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 14px 0;
  font-size: 12px;
  color: var(--tg-text-2, #707579);
  text-align: center;
}
.versions__empty-icon {
  font-size: 26px;
  color: var(--tg-text-3, #8e8e8e);
  opacity: 0.6;
}

/* 对比结果 */
.versions__result {
  margin-top: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.66);
  background: rgba(255, 255, 255, 0.5);
}
.versions__result-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.versions__result-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--tg-text, #0f0f0f);
}
.versions__result-icon {
  font-size: 13px;
  color: var(--tg-blue, #3390ec);
}
.versions__stat {
  font-size: 11px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 4px;
}
.versions__stat.is-add {
  color: #1a9c5b;
  background: rgba(26, 156, 91, 0.1);
}
.versions__stat.is-del {
  color: #d4403b;
  background: rgba(212, 64, 59, 0.1);
}
.versions__ctx-toggle {
  margin-left: auto;
  font-size: 11px;
  color: var(--tg-text-2, #707579);
}
.versions__diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow: auto;
}
.versions__diff-line {
  font-size: 11px;
  line-height: 1.5;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--tg-text, #0f0f0f);
  word-break: break-word;
  white-space: pre-wrap;
}
.versions__diff-line.is-add {
  background: rgba(26, 156, 91, 0.12);
  color: #127a46;
}
.versions__diff-line.is-del {
  background: rgba(212, 64, 59, 0.1);
  color: #b1342f;
  text-decoration: line-through;
  text-decoration-color: rgba(212, 64, 59, 0.4);
}
.versions__diff-line.is-ctx {
  color: var(--tg-text-2, #707579);
  background: rgba(15, 23, 42, 0.03);
}
.versions__diff-sign {
  font-weight: 700;
  margin-right: 4px;
  opacity: 0.7;
}
.versions__overflow {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--tg-text-3, #8e8e8e);
  text-align: center;
}
.versions__side {
  display: flex;
  gap: 8px;
}
.versions__side-col {
  flex: 1;
  min-width: 0;
}
.versions__side-title {
  font-size: 11px;
  color: var(--tg-text-2, #707579);
  margin-bottom: 4px;
}
.versions__side-body {
  padding: 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 280px;
  overflow: auto;
}
.versions__comments {
  list-style: none;
  margin: 0;
  padding: 0;
}
.versions__comments li {
  display: flex;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}
</style>
