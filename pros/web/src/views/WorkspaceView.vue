<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getDocumentStats,
  type DocumentStats,
  type RecentCanvas,
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

function templateIdFromCanvasType(canvasType: string): string {
  if (canvasType === 'quadrant') return 'star-quadrant'
  if (isTemplateId(canvasType)) return canvasType
  const hyphenated = canvasType.replace(/_/g, '-')
  if (isTemplateId(hyphenated)) return hyphenated
  return hyphenated
}

function canvasTypeLabel(canvasType: string): string {
  const id = templateIdFromCanvasType(canvasType)
  if (isTemplateId(id)) return TEMPLATE_META[id].name
  if (!canvasType || canvasType === 'unknown' || canvasType === 'canvas') return '未归档'
  return canvasType
}

const TYPE_SHADE = [0, 0.34, -0.22, 0.52, -0.4]

function tint(hex: string, amount: number): string {
  if (!hex.startsWith('#') || hex.length !== 7 || amount === 0) return hex
  const n = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(n)) return hex
  const mix = (c: number) => {
    const target = amount > 0 ? 255 : 0
    return Math.round(c + (target - c) * Math.abs(amount))
  }
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const typeSegments = computed(() => {
  const rows = view.value?.canvasTypes || []
  const used = new Map<string, number>()
  const top = rows.slice(0, 8).map((t) => {
    const base = accentOf(templateIdFromCanvasType(t.canvasType))
    const i = used.get(base) || 0
    used.set(base, i + 1)
    return {
      key: t.canvasType,
      label: canvasTypeLabel(t.canvasType),
      count: t.total,
      color: tint(base, TYPE_SHADE[i % TYPE_SHADE.length] || 0),
    }
  })
  const extra = rows.slice(8).reduce((n, t) => n + t.total, 0)
  if (extra > 0) top.push({ key: 'rest', label: '其他类型', count: extra, color: '#5f6368' })
  return top.filter((s) => s.count > 0)
})

const favorite = computed(() => {
  const top = view.value?.templates?.[0]
  const totalDocs = view.value?.documents.current || 0
  if (!top || totalDocs === 0) return { name: '还没有', total: 0, pct: 0 }
  return {
    name: templateName(top.templateId),
    total: top.total,
    pct: Math.round((top.total / totalDocs) * 100),
  }
})

const identityMismatch = computed(() => {
  const uid = view.value?.userId
  const me = auth.user?.id
  return Boolean(uid && me && uid !== me)
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

function recentTitle(item: RecentCanvas): string {
  const name = templateName(item.templateId || templateIdFromCanvasType(item.canvasType))
  return item.title.trim() || name
}

function recentSubtitle(item: RecentCanvas): string {
  const name = templateName(item.templateId || templateIdFromCanvasType(item.canvasType))
  const typeLabel = canvasTypeLabel(item.canvasType)
  const title = item.title.trim()
  if (title && title !== name) return name
  if (typeLabel && typeLabel !== (title || name)) return typeLabel
  return ''
}

function resolveTemplateId(item: RecentCanvas): string {
  if (item.templateId && isTemplateId(item.templateId)) return item.templateId
  const fromType = templateIdFromCanvasType(item.canvasType)
  if (isTemplateId(fromType)) return fromType
  return 'dual-triangle'
}

function openRecent(item: RecentCanvas) {
  if (showingSample.value || item.id.startsWith('sample-')) {
    goLogin()
    return
  }
  router.push({
    name: 'canvas',
    params: { templateId: resolveTemplateId(item) },
    query: { documentId: item.id },
  })
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
          <p class="eyebrow">MetaMatrix · 个人</p>
          <h1>{{ auth.isAuthenticated ? `${nickname} 的工作面板` : '工作面板' }}</h1>
          <p class="lead">
            以当前登录账号为统计单位：我的画布、画布类型、创建和编辑趋势、活跃天数和连续天数。
          </p>
          <p class="scope-line">
            <span class="scope-pill">仅本人</span>
            <span v-if="auth.isAuthenticated">只汇总 {{ nickname }} 名下仍在的画布与本人修订，北京时间。</span>
            <span v-else>未登录时下面是示例。登录后按 JWT 身份只看你自己的数据。</span>
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
          <h2>下面是示例，不是你的画布</h2>
          <p>登录后改为当前账号。其他用户的文档不会进入这份统计。</p>
        </div>
        <div class="top-actions">
          <button type="button" class="btn-primary" @click="goLogin">登录后看我的统计</button>
          <button type="button" class="btn-ghost" @click="goRegister">注册账号</button>
        </div>
      </section>

      <p v-if="identityMismatch" class="banner-error" role="alert">
        统计身份和当前登录用户不一致，已停止展示。请刷新后再看。
      </p>

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

      <template v-if="view && !identityMismatch">
        <section class="metrics" aria-label="我的指标">
          <article class="metric">
            <span class="metric-k">我的画布</span>
            <strong>{{ view.documents.current }}</strong>
            <span class="delta" :class="formatDelta(view.documents.current, view.documents.previous).tone">
              {{ formatDelta(view.documents.current, view.documents.previous).text }} 较本月初
            </span>
          </article>
          <article class="metric">
            <span class="metric-k">活跃天数 · {{ rangeLabel }}</span>
            <strong>{{ view.activity.activeDays }}</strong>
            <span class="delta" :class="formatDelta(view.activity.activeDays, view.activity.activeDaysPrev).tone">
              {{ formatDelta(view.activity.activeDays, view.activity.activeDaysPrev).text }} 较上一区间
            </span>
          </article>
          <article class="metric">
            <span class="metric-k">连续天数</span>
            <strong>{{ view.activity.streak }}</strong>
            <span class="metric-sub">最长 {{ view.activity.longestStreak }} 天</span>
          </article>
          <article class="metric">
            <span class="metric-k">最常用模板</span>
            <strong class="metric-name">{{ favorite.name }}</strong>
            <span class="metric-sub">{{ favorite.total }} 份 · 占 {{ favorite.pct }}%</span>
          </article>
          <article class="metric">
            <span class="metric-k">新建 · {{ rangeLabel }}</span>
            <strong>{{ view.rangeCreated.current }}</strong>
            <span class="delta" :class="formatDelta(view.rangeCreated.current, view.rangeCreated.previous).tone">
              {{ formatDelta(view.rangeCreated.current, view.rangeCreated.previous).text }} 较上一区间
            </span>
            <span class="metric-sub">
              编辑 {{ view.rangeEdited.current }}
              · {{ formatDelta(view.rangeEdited.current, view.rangeEdited.previous).text }}
            </span>
          </article>
        </section>

        <p v-if="auth.isAuthenticated && view.documents.current === 0" class="muted pad">
          还没有云端画布。从模板库新建一份之后，这里只累计你自己的保存和修订。
        </p>

        <div class="split">
          <section class="panel" aria-labelledby="mix-h">
            <header class="panel-head">
              <div>
                <h2 id="mix-h">画布类型</h2>
                <p>按你名下画布的 canvas 类型计数。颜色沿用模板类别：方法蓝、增长绿、行业黄、组织紫、复盘红。</p>
              </div>
            </header>
            <CategoryDonut :segments="typeSegments" label="画布类型占比" />
            <p v-if="!typeSegments.length" class="muted">还没有可分组的画布。</p>
          </section>

          <section class="panel" aria-labelledby="fav-h">
            <header class="panel-head">
              <div>
                <h2 id="fav-h">最常用模板</h2>
                <p>按仍在的画布份数排序。区间数字是这段时间里新建或最近一次实质编辑的份数。</p>
              </div>
            </header>
            <p v-if="!templateRows.length" class="muted">还没有模板记录。</p>
            <ul v-else class="tpl-list">
              <li v-for="t in templateRows" :key="t.templateId">
                <div class="tpl-top">
                  <span class="tpl-name">{{ t.name }}</span>
                  <span class="tpl-num">{{ t.total }} 份 · 区间 {{ t.created + t.edited }}</span>
                </div>
                <div class="tpl-top">
                  <div class="meter"><span :style="{ width: t.width, background: t.color }" /></div>
                  <svg viewBox="0 0 72 22" class="spark" aria-hidden="true">
                    <polyline fill="none" :stroke="t.color" stroke-width="1.6" :points="t.spark" />
                  </svg>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <section class="panel" aria-labelledby="trend-h">
          <header class="panel-head">
            <div>
              <h2 id="trend-h">我的创建 / 编辑趋势</h2>
              <p>
                {{ rangeLabel }}新建 {{ view.rangeCreated.current }}、编辑 {{ view.rangeEdited.current }}、修订 {{ view.revisions.current }}。
                本周新建 {{ view.weekCreated.current }}、编辑 {{ view.weekEdited.current }}；本月新建 {{ view.monthCreated.current }}、编辑 {{ view.monthEdited.current }}。
                可按日、按周、按月切换。编辑只计每份画布最近一次更新。
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

        <section class="panel" aria-labelledby="recent-h">
          <header class="panel-head">
            <div>
              <h2 id="recent-h">最近编辑</h2>
              <p>按最近一次保存时间，最多 8 份，只含当前账号的画布。</p>
            </div>
          </header>
          <p v-if="!view.recent.length" class="muted">还没有可打开的画布。</p>
          <ul v-else class="recent">
            <li v-for="item in view.recent" :key="item.id">
              <button type="button" class="recent-btn" @click="openRecent(item)">
                <span class="rail" :style="{ '--accent': accentOf(item.templateId || templateIdFromCanvasType(item.canvasType)) }" />
                <span class="recent-copy">
                  <strong>{{ recentTitle(item) }}</strong>
                  <em v-if="recentSubtitle(item)">{{ recentSubtitle(item) }}</em>
                </span>
                <time>{{ formatWhen(item.updatedAt) }}</time>
              </button>
            </li>
          </ul>
        </section>

        <section class="panel" aria-labelledby="heat-h">
          <header class="panel-head">
            <div>
              <h2 id="heat-h">我的活跃日历</h2>
              <p>
                近 53 周，周一为起点。当天有你的修订，或一次实质编辑，就记为活跃。
                连续天数从今天往回数；今天还没有活动时从昨天接着数，中间断开即停止。当前 {{ view.activity.streak }} 天，最长 {{ view.activity.longestStreak }} 天。
              </p>
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

.tpl-top .meter {
  flex: 1;
  margin-top: 0;
}

.scope-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 10px 0 0;
  color: #5f6368;
  font-size: 13px;
}

.scope-pill {
  font-size: 12px;
  font-weight: 700;
  color: #174ea6;
  background: #e8f0fe;
  border-radius: 999px;
  padding: 3px 8px;
}

.metric strong.metric-name {
  font-size: 16px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 8px;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.recent-btn:hover {
  background: #f8f9fa;
}

.rail {
  width: 4px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--accent, #1a73e8);
  min-height: 28px;
  flex-shrink: 0;
}

.recent-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.recent-copy strong,
.recent-copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-copy strong {
  font-size: 14px;
  font-weight: 650;
}

.recent-copy em,
.recent time {
  font-size: 12px;
  color: #5f6368;
  font-style: normal;
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
