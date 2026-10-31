<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getDocumentStats,
  type DocumentStats,
  type StatsGranularity,
  type StatsRange,
} from '../api/documents'
import ActivityHeatmap from '../components/workspace/ActivityHeatmap.vue'
import CategoryDonut from '../components/workspace/CategoryDonut.vue'
import { buildSampleStats } from '../components/workspace/sampleStats'
import TrendChart from '../components/workspace/TrendChart.vue'
import WorkspaceSecondary from '../components/workspace/WorkspaceSecondary.vue'
import { useAuthStore } from '../stores/auth'
import {
  CATEGORY_LABELS,
  TEMPLATE_META,
  isTemplateId,
  type TemplateCategory,
} from '../stores/document'

const RANGES: { id: StatsRange; label: string }[] = [
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: '90d', label: '近 90 天' },
  { id: 'year', label: '今年' },
]

const GRAINS: { id: StatsGranularity; label: string }[] = [
  { id: 'day', label: '按日' },
  { id: 'week', label: '按周' },
  { id: 'month', label: '按月' },
]

const CATEGORY_ACCENT: Record<TemplateCategory, string> = {
  method: '#1a73e8',
  growth: '#34a853',
  industry: '#f9a825',
  org: '#a142f4',
  review: '#ea4335',
}

const TREND_COLORS = ['#1a73e8', '#34a853', '#a142f4', '#f9a825', '#ea4335', '#00897b']

const router = useRouter()
const auth = useAuthStore()

const range = ref<StatsRange>('30d')
const granularity = ref<StatsGranularity>('day')
const chartMode = ref<'line' | 'bar'>('line')
const stats = ref<DocumentStats | null>(null)
const statsLoading = ref(false)
const statsError = ref('')
let statsGen = 0
let alive = true

const nickname = computed(() => auth.user?.displayName || auth.user?.email || '已登录')
const sample = computed(() => buildSampleStats(range.value, granularity.value))
const view = computed(() => (auth.isAuthenticated ? stats.value : sample.value))
const showingSample = computed(() => !auth.isAuthenticated)

const rangeLabel = computed(() => RANGES.find((r) => r.id === range.value)?.label || '区间')

function templateName(id: string): string {
  if (isTemplateId(id)) return TEMPLATE_META[id].name
  return id || '未归档'
}

function accentOf(id: string): string {
  if (isTemplateId(id)) return CATEGORY_ACCENT[TEMPLATE_META[id].category]
  return '#5f6368'
}

function bucketLabel(start: string): string {
  const month = Number(start.slice(5, 7))
  const day = Number(start.slice(8, 10))
  if (granularity.value === 'month') return `${month}月`
  return `${month}/${day}`
}

function formatDelta(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  const diff = current - previous
  if (diff === 0) return { text: '持平', tone: 'flat' }
  if (previous === 0) return { text: `+${diff} 新增`, tone: 'up' }
  const pct = Math.round((diff / previous) * 100)
  const sign = diff > 0 ? '+' : ''
  const pctSign = pct > 0 ? '+' : ''
  return { text: `${sign}${diff}（${pctSign}${pct}%）`, tone: diff > 0 ? 'up' : 'down' }
}

const labels = computed(() => (view.value?.series || []).map((b) => bucketLabel(b.start)))

const mainSeries = computed(() => {
  const rows = view.value?.series || []
  return [
    { name: '新建', color: '#1a73e8', values: rows.map((b) => b.created) },
    { name: '编辑', color: '#34a853', values: rows.map((b) => b.edited) },
    { name: '修订', color: '#a142f4', values: rows.map((b) => b.revisions) },
  ]
})

const categorySegments = computed(() => {
  const counts: Record<string, { key: string; label: string; count: number; color: string }> = {}
  for (const id of Object.keys(CATEGORY_LABELS) as TemplateCategory[]) {
    counts[id] = { key: id, label: CATEGORY_LABELS[id], count: 0, color: CATEGORY_ACCENT[id] }
  }
  counts.other = { key: 'other', label: '未归档', count: 0, color: '#5f6368' }
  for (const t of view.value?.templates || []) {
    const key = isTemplateId(t.templateId) ? TEMPLATE_META[t.templateId].category : 'other'
    const row = counts[key]
    if (row) row.count += t.total
  }
  return Object.values(counts).filter((s) => s.count > 0)
})

const templateRows = computed(() => {
  const rows = view.value?.templates || []
  const max = Math.max(1, ...rows.map((t) => t.total))
  return rows.slice(0, 8).map((t) => ({
    ...t,
    name: templateName(t.templateId),
    color: accentOf(t.templateId),
    width: `${Math.max(6, Math.round((t.total / max) * 100))}%`,
    spark: sparkPoints(t.series),
  }))
})

const templateTrend = computed(() => {
  const rows = (view.value?.templates || [])
    .map((t) => ({ t, sum: t.series.reduce((n, v) => n + v, 0) }))
    .filter((x) => x.sum > 0)
    .slice(0, 5)
  return rows.map((x, i) => ({
    name: templateName(x.t.templateId),
    color: TREND_COLORS[i % TREND_COLORS.length] || '#1a73e8',
    values: x.t.series,
  }))
})

const flatTrend = computed(() => {
  const rows = view.value?.series || []
  return rows.every((b) => b.created === 0 && b.edited === 0 && b.revisions === 0)
})

function sparkPoints(values: number[]): string {
  if (!values.length) return ''
  const max = Math.max(1, ...values)
  const w = 72
  const h = 22
  return values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
      const y = h - (v / max) * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function goLogin() {
  router.push({ name: 'login', query: { redirect: '/workspace' } })
}

function goRegister() {
  router.push({ name: 'register', query: { redirect: '/workspace' } })
}

async function loadStats() {
  if (!auth.isAuthenticated) {
    stats.value = null
    return
  }
  const gen = ++statsGen
  statsLoading.value = true
  statsError.value = ''
  try {
    const res = await getDocumentStats({ range: range.value, granularity: granularity.value })
    if (!alive || gen !== statsGen) return
    stats.value = res
  } catch (e) {
    if (!alive || gen !== statsGen) return
    statsError.value = e instanceof Error ? e.message : '统计失败'
  } finally {
    if (alive && gen === statsGen) statsLoading.value = false
  }
}

watch([range, granularity], () => {
  if (auth.isAuthenticated) void loadStats()
})

onMounted(async () => {
  document.title = '工作面板 · 元矩阵 MetaMatrix'
  if (auth.token) await auth.fetchMe()
  if (auth.isAuthenticated) await loadStats()
})

onUnmounted(() => {
  alive = false
  document.title = '元矩阵 MetaMatrix'
})
</script>

<template>
  <div class="workspace">
    <div class="inner">
      <header class="top">
        <div>
          <router-link class="back" :to="{ name: 'guide' }">← 模板库</router-link>
          <p class="eyebrow">MetaMatrix</p>
          <h1>工作面板</h1>
          <p class="lead">
            看画布怎么被反复使用：新建、编辑和修订的时间趋势，模板占比，以及一整年的活跃度。
          </p>
        </div>
        <div class="top-actions">
          <template v-if="auth.isAuthenticated">
            <span class="who">{{ nickname }}</span>
            <button type="button" class="btn-ghost" :disabled="statsLoading" @click="loadStats">
              {{ statsLoading ? '统计中…' : '刷新' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn-primary" @click="goLogin">登录</button>
            <button type="button" class="btn-ghost" @click="goRegister">注册</button>
          </template>
        </div>
      </header>

      <section v-if="showingSample" class="guest" aria-label="登录引导">
        <div>
          <h2>下面是示例统计，不是你的画布</h2>
          <p>登录后改为你账号下的文档与修订。时间按北京时间切日、切周、切月。</p>
        </div>
        <div class="top-actions">
          <button type="button" class="btn-primary" @click="goLogin">登录后看我的统计</button>
          <button type="button" class="btn-ghost" @click="goRegister">注册账号</button>
        </div>
      </section>

      <p v-if="statsError" class="banner-error" role="alert">
        {{ statsError }}
        <button type="button" class="text-btn" @click="loadStats">重试</button>
      </p>

      <div class="controls" role="toolbar" aria-label="统计范围">
        <div class="seg" role="group" aria-label="时间范围">
          <button
            v-for="item in RANGES"
            :key="item.id"
            type="button"
            :class="{ on: range === item.id }"
            :aria-pressed="range === item.id"
            @click="range = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="seg" role="group" aria-label="聚合粒度">
          <button
            v-for="item in GRAINS"
            :key="item.id"
            type="button"
            :class="{ on: granularity === item.id }"
            :aria-pressed="granularity === item.id"
            @click="granularity = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="seg" role="group" aria-label="图表样式">
          <button type="button" :class="{ on: chartMode === 'line' }" :aria-pressed="chartMode === 'line'" @click="chartMode = 'line'">
            折线
          </button>
          <button type="button" :class="{ on: chartMode === 'bar' }" :aria-pressed="chartMode === 'bar'" @click="chartMode = 'bar'">
            柱状
          </button>
        </div>
        <span v-if="showingSample" class="sample-pill">示例</span>
        <span v-else-if="statsLoading && stats" class="sample-pill">更新中</span>
      </div>

      <p v-if="auth.isAuthenticated && statsLoading && !view" class="muted pad">正在汇总文档与修订…</p>

      <template v-if="view">
        <section class="metrics" aria-label="核心指标">
          <article class="metric">
            <span class="metric-k">文档总数</span>
            <strong>{{ view.documents.current }}</strong>
            <span class="delta" :class="formatDelta(view.documents.current, view.documents.previous).tone">
              {{ formatDelta(view.documents.current, view.documents.previous).text }} 较上月末
            </span>
          </article>
          <article class="metric">
            <span class="metric-k">新建</span>
            <strong>{{ view.weekCreated.current }} <small>本周</small></strong>
            <span class="delta" :class="formatDelta(view.weekCreated.current, view.weekCreated.previous).tone">
              {{ formatDelta(view.weekCreated.current, view.weekCreated.previous).text }} 较上周同期
            </span>
            <span class="metric-sub">
              本月 {{ view.monthCreated.current }}
              · {{ formatDelta(view.monthCreated.current, view.monthCreated.previous).text }}
            </span>
          </article>
          <article class="metric">
            <span class="metric-k">编辑</span>
            <strong>{{ view.weekEdited.current }} <small>本周</small></strong>
            <span class="delta" :class="formatDelta(view.weekEdited.current, view.weekEdited.previous).tone">
              {{ formatDelta(view.weekEdited.current, view.weekEdited.previous).text }} 较上周同期
            </span>
            <span class="metric-sub">
              本月 {{ view.monthEdited.current }}
              · {{ formatDelta(view.monthEdited.current, view.monthEdited.previous).text }}
            </span>
          </article>
          <article class="metric">
            <span class="metric-k">修订 · {{ rangeLabel }}</span>
            <strong>{{ view.revisions.current }}</strong>
            <span class="delta" :class="formatDelta(view.revisions.current, view.revisions.previous).tone">
              {{ formatDelta(view.revisions.current, view.revisions.previous).text }} 较上一区间
            </span>
            <span class="metric-sub">累计 {{ view.totals.revisions }} 次存档</span>
          </article>
          <article class="metric">
            <span class="metric-k">活跃模板 · {{ rangeLabel }}</span>
            <strong>{{ view.activeTemplates.current }}</strong>
            <span class="delta" :class="formatDelta(view.activeTemplates.current, view.activeTemplates.previous).tone">
              {{ formatDelta(view.activeTemplates.current, view.activeTemplates.previous).text }} 较上一区间
            </span>
            <span class="metric-sub">累计 {{ view.totals.templates }} 种</span>
          </article>
        </section>

        <p v-if="auth.isAuthenticated && view.documents.current === 0" class="muted pad">
          还没有云端画布。从模板库新建一份之后，趋势和热力图会按保存与修订累积。
        </p>

        <section class="panel" aria-labelledby="trend-h">
          <header class="panel-head">
            <div>
              <h2 id="trend-h">时间趋势</h2>
              <p>
                {{ rangeLabel }}新建 {{ view.rangeCreated.current }}、编辑 {{ view.rangeEdited.current }}、修订 {{ view.revisions.current }}。
                编辑按每份画布最近一次更新计入；修订按每次存档计数。
              </p>
            </div>
          </header>
          <div class="legend-row">
            <span><i class="dot" style="background:#1a73e8" />新建</span>
            <span><i class="dot" style="background:#34a853" />编辑</span>
            <span><i class="dot" style="background:#a142f4" />修订</span>
            <span class="range-note">{{ view.from }} – {{ view.to }} · 对比 {{ view.previousFrom }} – {{ view.previousTo }}</span>
          </div>
          <p v-if="flatTrend" class="muted">这个区间还没有新建、编辑或修订。</p>
          <TrendChart :labels="labels" :series="mainSeries" :mode="chartMode" />
        </section>

        <div class="split">
          <section class="panel" aria-labelledby="mix-h">
            <header class="panel-head">
              <div>
                <h2 id="mix-h">模板分布</h2>
                <p>按全部画布的模板类别占比。类别在前端映射，接口只返回模板 id。</p>
              </div>
            </header>
            <CategoryDonut :segments="categorySegments" />
            <ul class="tpl-list">
              <li v-for="t in templateRows" :key="t.templateId">
                <div class="tpl-top">
                  <span class="tpl-name">{{ t.name }}</span>
                  <span class="tpl-num">{{ t.total }} 份 · 区间 {{ t.created + t.edited }}</span>
                </div>
                <div class="meter"><span :style="{ width: t.width, background: t.color }" /></div>
              </li>
            </ul>
          </section>

          <section class="panel" aria-labelledby="tpl-trend-h">
            <header class="panel-head">
              <div>
                <h2 id="tpl-trend-h">模板使用变化</h2>
                <p>本区间里被新建或最近更新过的模板，最多五条。每条只在对应时间桶计一次。</p>
              </div>
            </header>
            <div v-if="templateTrend.length" class="legend-row">
              <span v-for="s in templateTrend" :key="s.name"><i class="dot" :style="{ background: s.color }" />{{ s.name }}</span>
            </div>
            <p v-if="!templateTrend.length" class="muted">这个区间没有模板被新建或更新。</p>
            <TrendChart v-else :labels="labels" :series="templateTrend" :mode="chartMode" />
            <ul v-if="templateRows.length" class="sparks">
              <li v-for="t in templateRows.slice(0, 5)" :key="`s-${t.templateId}`">
                <span>{{ t.name }}</span>
                <svg viewBox="0 0 72 22" class="spark" aria-hidden="true">
                  <polyline fill="none" :stroke="t.color" stroke-width="1.6" :points="t.spark" />
                </svg>
              </li>
            </ul>
          </section>
        </div>

        <section class="panel" aria-labelledby="heat-h">
          <header class="panel-head">
            <div>
              <h2 id="heat-h">活跃度</h2>
              <p>近 53 周，周一为一列的起点。当天有修订就计入；没有修订、但有一次实质更新的编辑，记在最近更新那天。</p>
            </div>
          </header>
          <ActivityHeatmap :cells="view.heatmap" />
        </section>
      </template>

      <WorkspaceSecondary />
    </div>
  </div>
</template>

<style scoped>
.workspace {
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(ellipse 70% 36% at 50% -12%, #e8f0fe 0%, transparent 60%),
    #fafafa;
  color: #202124;
}

.inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 24px 64px;
}

.top,
.guest {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.guest {
  align-items: center;
  margin-bottom: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #d2e3fc;
}

.guest h2,
.panel-head h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.guest p,
.panel-head p,
.lead {
  margin: 0;
  color: #5f6368;
  font-size: 13px;
  line-height: 1.55;
}

.lead {
  font-size: 15px;
  max-width: 680px;
}

.back {
  display: inline-block;
  margin-bottom: 8px;
  color: #1a73e8;
  text-decoration: none;
  font-size: 13px;
  font-weight: 650;
}

.eyebrow {
  margin: 0 0 4px;
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

.top {
  margin-bottom: 16px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.who {
  font-size: 13px;
  color: #5f6368;
  max-width: 160px;
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

.btn-ghost {
  border: 1px solid #dadce0;
  background: #fff;
  color: #202124;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: default;
}

.text-btn {
  border: 0;
  background: transparent;
  color: #1a73e8;
  font-weight: 650;
}

.banner-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fce8e6;
  color: #d93025;
  font-size: 13px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}

.seg {
  display: inline-flex;
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}

.seg button {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12.5px;
  color: #5f6368;
  cursor: pointer;
}

.seg button.on {
  background: #e8f0fe;
  color: #174ea6;
  font-weight: 700;
}

.sample-pill {
  font-size: 12px;
  font-weight: 700;
  color: #b06000;
  background: #fef7e0;
  border-radius: 999px;
  padding: 4px 8px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-k {
  font-size: 12px;
  color: #5f6368;
}

.metric strong {
  font-size: 26px;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.metric strong small {
  font-size: 12px;
  font-weight: 650;
  color: #5f6368;
  margin-left: 4px;
}

.delta,
.metric-sub {
  font-size: 12px;
  line-height: 1.4;
}

.delta.up { color: #188038; }
.delta.down { color: #d93025; }
.delta.flat { color: #5f6368; }

.metric-sub { color: #5f6368; }

.panel {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 14px;
}

.panel-head { margin-bottom: 10px; }

.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: #5f6368;
}

.legend-row span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.range-note {
  margin-left: auto;
  color: #9aa0a6;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 14px;
}

.tpl-list,
.sparks {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tpl-top,
.sparks li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.tpl-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-num {
  flex-shrink: 0;
  color: #5f6368;
  font-size: 12px;
}

.meter {
  height: 6px;
  border-radius: 999px;
  background: #f1f3f4;
  overflow: hidden;
  margin-top: 4px;
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.spark {
  width: 72px;
  height: 22px;
  flex-shrink: 0;
}

.muted { color: #5f6368; font-size: 13px; }
.pad { margin: 0 0 12px; }

@media (max-width: 980px) {
  .metrics,
  .split,
  .top,
  .guest {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }
  .metrics { grid-template-columns: 1fr 1fr; }
  .range-note { margin-left: 0; }
  .inner { padding: 20px 14px 48px; }
}
</style>
