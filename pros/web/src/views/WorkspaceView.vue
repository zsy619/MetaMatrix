<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { downloadText } from '../utils/canvasTransfer'
import { statsSeriesCsv } from '../components/workspace/statsNormalize'
import ActivityHeatmap from '../components/workspace/ActivityHeatmap.vue'
import CategoryDonut from '../components/workspace/CategoryDonut.vue'
import KpiGrid, { type Kpi } from '../components/workspace/KpiGrid.vue'
import RecentEdits from '../components/workspace/RecentEdits.vue'
import TrendChart from '../components/workspace/TrendChart.vue'
import TypeBreakdown from '../components/workspace/TypeBreakdown.vue'
import RecentOpens from '../components/workspace/RecentOpens.vue'
import WorkspaceSecondary from '../components/workspace/WorkspaceSecondary.vue'
import WorkspaceSkeleton from '../components/workspace/WorkspaceSkeleton.vue'
import { useWorkspaceStats } from '../components/workspace/useWorkspaceStats'
import StateMessage from '../components/ui/StateMessage.vue'
import {
  GRAINS,
  RANGES,
  bucketLabel,
  categorySegments,
  formatDelta,
  isFlatTrend,
  mainSeries,
  templateRows,
  templateTrend,
  typeSegments,
} from '../components/workspace/statsFormat'

const router = useRouter()
const {
  auth,
  range,
  granularity,
  chartMode,
  loading,
  refreshing,
  error,
  showingSample,
  view,
  load,
} = useWorkspaceStats()

const nickname = computed(() => auth.user?.displayName || auth.user?.email || '已登录')
const rangeLabel = computed(() => RANGES.find((r) => r.id === range.value)?.label || '区间')
const labels = computed(() => (view.value?.series || []).map((b) => bucketLabel(b.start, granularity.value)))
const series = computed(() => (view.value ? mainSeries(view.value) : []))
const categories = computed(() => (view.value ? categorySegments(view.value) : []))
const templates = computed(() => (view.value ? templateRows(view.value) : []))
const trends = computed(() => (view.value ? templateTrend(view.value) : []))
const types = computed(() => (view.value ? typeSegments(view.value) : []))
const flat = computed(() => (view.value ? isFlatTrend(view.value) : true))
const emptyAccount = computed(
  () => auth.isAuthenticated && view.value != null && view.value.documents.current === 0,
)

const primaryKpis = computed<Kpi[]>(() => {
  const data = view.value
  if (!data) return []
  const docs = formatDelta(data.documents.current, data.documents.previous)
  const created = formatDelta(data.weekCreated.current, data.weekCreated.previous)
  const edited = formatDelta(data.weekEdited.current, data.weekEdited.previous)
  const revs = formatDelta(data.revisions.current, data.revisions.previous)
  const monthCreated = formatDelta(data.monthCreated.current, data.monthCreated.previous)
  const monthEdited = formatDelta(data.monthEdited.current, data.monthEdited.previous)
  return [
    {
      key: 'docs',
      label: '文档总数',
      value: data.documents.current,
      delta: docs.text,
      tone: docs.tone,
      compare: '较上月末',
    },
    {
      key: 'created',
      label: '本周新建',
      value: data.weekCreated.current,
      delta: created.text,
      tone: created.tone,
      compare: '较上周同期',
      sub: `本月 ${data.monthCreated.current} · ${monthCreated.text}`,
    },
    {
      key: 'edited',
      label: '本周编辑',
      value: data.weekEdited.current,
      delta: edited.text,
      tone: edited.tone,
      compare: '较上周同期',
      sub: `本月 ${data.monthEdited.current} · ${monthEdited.text}`,
    },
    {
      key: 'revs',
      label: `修订 · ${rangeLabel.value}`,
      value: data.revisions.current,
      delta: revs.text,
      tone: revs.tone,
      compare: '较上一区间',
      sub: `累计 ${data.totals.revisions} 次存档`,
    },
  ]
})

const rhythmKpis = computed<Kpi[]>(() => {
  const data = view.value
  if (!data) return []
  const active = formatDelta(data.activity.activeDays, data.activity.previousActiveDays)
  const templatesDelta = formatDelta(data.activeTemplates.current, data.activeTemplates.previous)
  const rangeCreated = formatDelta(data.rangeCreated.current, data.rangeCreated.previous)
  return [
    {
      key: 'active',
      label: `活跃天数 · ${rangeLabel.value}`,
      value: data.activity.activeDays,
      delta: active.text,
      tone: active.tone,
      compare: '较上一区间',
      sub: '当天有修订，或有一次实质编辑',
    },
    {
      key: 'streak',
      label: '当前连续',
      value: data.activity.streak,
      delta: data.activity.streak > 0 ? '含今天；今天还没动则从昨天起算' : '今天和昨天都没有活动',
      tone: data.activity.streak > 0 ? 'up' : 'flat',
      compare: '',
      sub: `历史最长 ${data.activity.longest} 天`,
    },
    {
      key: 'tpl',
      label: `活跃模板 · ${rangeLabel.value}`,
      value: data.activeTemplates.current,
      delta: templatesDelta.text,
      tone: templatesDelta.tone,
      compare: '较上一区间',
      sub: `累计 ${data.totals.templates} 种`,
    },
    {
      key: 'range',
      label: `区间新建`,
      value: data.rangeCreated.current,
      delta: rangeCreated.text,
      tone: rangeCreated.tone,
      compare: '较上一区间',
      sub: `同期编辑 ${data.rangeEdited.current} 份`,
    },
  ]
})

function goLogin() {
  router.push({ name: 'login', query: { redirect: '/workspace' } })
}

function goRegister() {
  router.push({ name: 'register', query: { redirect: '/workspace' } })
}

function exportCsv() {
  if (!view.value) return
  const name = showingSample.value ? 'workspace-sample.csv' : 'workspace-stats.csv'
  downloadText(name, statsSeriesCsv(view.value), 'text/csv')
}

onMounted(async () => {
  document.title = '工作面板 · 元矩阵 MetaMatrix'
  if (auth.token) await auth.fetchMe()
  if (auth.isAuthenticated) await load(false)
})

onUnmounted(() => {
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
            只看当前账号的画布：新建、编辑和修订的趋势，模板与类型占比，以及近一年的活跃节奏。
          </p>
        </div>
        <div class="top-actions">
          <template v-if="auth.isAuthenticated">
            <span class="who">{{ nickname }}</span>
            <button type="button" class="btn-ghost" :disabled="loading || refreshing" @click="load(true)">
              {{ refreshing || loading ? '统计中…' : '刷新' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn-primary" @click="goLogin">登录</button>
            <button type="button" class="btn-ghost" @click="goRegister">注册</button>
          </template>
        </div>
      </header>

      <StateMessage
        v-if="showingSample"
        title="下面是示例，不是你的画布"
        message="登录后改为你账号下的文档与修订。时间按北京时间切日、切周、切月。搜索、备注和快速新建也不会使用别人的数据。"
      >
        <button type="button" class="btn-primary" @click="goLogin">登录后看我的统计</button>
        <button type="button" class="btn-ghost" @click="goRegister">注册账号</button>
      </StateMessage>

      <StateMessage
        v-if="error"
        tone="error"
        :title="error.title"
        :message="error.message"
      >
        <button v-if="error.kind === 'auth'" type="button" class="btn-primary" @click="goLogin">重新登录</button>
        <button v-else type="button" class="btn-ghost" @click="load(true)">重试</button>
      </StateMessage>

      <div class="controls" role="toolbar" aria-label="统计范围">
        <div class="seg" role="radiogroup" aria-label="时间范围">
          <button
            v-for="item in RANGES"
            :key="item.id"
            type="button"
            role="radio"
            :class="{ on: range === item.id }"
            :aria-checked="range === item.id"
            @click="range = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="seg" role="radiogroup" aria-label="聚合粒度">
          <button
            v-for="item in GRAINS"
            :key="item.id"
            type="button"
            role="radio"
            :class="{ on: granularity === item.id }"
            :aria-checked="granularity === item.id"
            @click="granularity = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="seg" role="radiogroup" aria-label="图表样式">
          <button type="button" role="radio" :class="{ on: chartMode === 'line' }" :aria-checked="chartMode === 'line'" @click="chartMode = 'line'">
            折线
          </button>
          <button type="button" role="radio" :class="{ on: chartMode === 'bar' }" :aria-checked="chartMode === 'bar'" @click="chartMode = 'bar'">
            柱状
          </button>
        </div>
        <span v-if="showingSample" class="sample-pill">示例</span>
        <span v-else-if="refreshing" class="sample-pill quiet">更新中</span>
      </div>

      <p class="live" aria-live="polite">
        <template v-if="loading">正在汇总你的文档与修订。</template>
        <template v-else-if="refreshing">正在更新{{ rangeLabel }}统计。</template>
      </p>

      <WorkspaceSkeleton v-if="loading && !view" />

      <template v-else-if="view">
        <div class="stage" :class="{ dim: refreshing }" :aria-busy="refreshing">
          <KpiGrid label="核心指标" :items="primaryKpis" />
          <KpiGrid label="活跃节奏" :items="rhythmKpis" />

          <StateMessage
            v-if="emptyAccount"
            tone="empty"
            title="还没有云端画布"
            message="从模板库新建一份并保存之后，趋势、分布和活跃天数会按你的修订累积。下面的数字会先保持为零。"
          >
            <router-link class="btn-primary link" :to="{ name: 'guide' }">去模板库</router-link>
          </StateMessage>

          <section class="panel" aria-labelledby="trend-h">
            <header class="panel-head panel-head-row">
              <div>
                <h2 id="trend-h">时间趋势</h2>
                <p>
                  {{ rangeLabel }}新建 {{ view.rangeCreated.current }}、编辑 {{ view.rangeEdited.current }}、修订 {{ view.revisions.current }}。
                  编辑按每份画布最近一次实质更新计入；修订按每次存档计数。
                </p>
              </div>
              <button type="button" class="btn-ghost" @click="exportCsv">导出 CSV</button>
            </header>
            <div class="legend-row">
              <span><i class="dot" style="background:#1a73e8" />新建</span>
              <span><i class="dot" style="background:#34a853" />编辑</span>
              <span><i class="dot" style="background:#a142f4" />修订</span>
              <span class="range-note">{{ view.from }} – {{ view.to }} · 对比 {{ view.previousFrom }} – {{ view.previousTo }}</span>
            </div>
            <p v-if="flat" class="muted">这个区间还没有新建、编辑或修订。可以换到近 90 天或今年。</p>
            <TrendChart :labels="labels" :series="series" :mode="chartMode" />
          </section>

          <div class="split">
            <section class="panel" aria-labelledby="mix-h">
              <header class="panel-head">
                <div>
                  <h2 id="mix-h">模板分布</h2>
                  <p>按全部画布的模板类别占比，颜色与模板库分类一致。</p>
                </div>
              </header>
              <CategoryDonut :segments="categories" />
              <ul v-if="templates.length" class="tpl-list">
                <li v-for="t in templates" :key="t.templateId">
                  <div class="tpl-top">
                    <span class="tpl-name">{{ t.name }}</span>
                    <span class="tpl-num">{{ t.total }} 份 · 区间 {{ t.created + t.edited }}</span>
                  </div>
                  <div class="meter"><span :style="{ width: t.width, background: t.color }" /></div>
                </li>
              </ul>
              <p v-else class="muted">保存画布后，这里会按模板列出数量。</p>
            </section>

            <section class="panel" aria-labelledby="type-h">
              <header class="panel-head">
                <div>
                  <h2 id="type-h">类型分布</h2>
                  <p>按画布类型汇总。类型存在文档上，不另建业务表。</p>
                </div>
              </header>
              <TypeBreakdown :segments="types" />
            </section>
          </div>

          <div class="split split-recent">
            <section class="panel" aria-labelledby="tpl-trend-h">
              <header class="panel-head">
                <div>
                  <h2 id="tpl-trend-h">模板使用变化</h2>
                  <p>本区间里被新建或最近更新过的模板，最多五条。每条在对应时间桶只计一次。</p>
                </div>
              </header>
              <div v-if="trends.length" class="legend-row">
                <span v-for="s in trends" :key="s.name"><i class="dot" :style="{ background: s.color }" />{{ s.name }}</span>
              </div>
              <p v-if="!trends.length" class="muted">这个区间没有模板被新建或更新。</p>
              <TrendChart v-else :labels="labels" :series="trends" :mode="chartMode" />
            </section>

            <section class="panel" aria-labelledby="recent-h">
              <header class="panel-head">
                <div>
                  <h2 id="recent-h">最近编辑</h2>
                  <p>{{ showingSample ? '示例列表，登录后可以点进自己的画布。' : '按最近更新排序，点一行进入画布。' }}</p>
                </div>
              </header>
              <RecentEdits :items="view.recent || []" :interactive="!showingSample" />
            </section>
          </div>

          <section class="panel" aria-labelledby="heat-h">
            <header class="panel-head">
              <div>
                <h2 id="heat-h">活跃度</h2>
                <p>
                  近 53 周，周一为一列的起点。当前连续 {{ view.activity.streak }} 天，历史最长 {{ view.activity.longest }} 天。
                  当天有修订就计入；没有修订、但有一次实质更新的编辑，记在最近更新那天。
                </p>
              </div>
            </header>
            <ActivityHeatmap :cells="view.heatmap" />
          </section>
        </div>
      </template>

      <RecentOpens />
      <WorkspaceSecondary />
    </div>
  </div>
</template>

<style scoped>
.workspace {
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(ellipse 70% 36% at 50% -12%, var(--mm-blue-soft) 0%, transparent 60%),
    var(--mm-bg);
  color: var(--mm-text);
}

.inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.lead {
  margin: 0;
  color: var(--mm-muted);
  font-size: 15px;
  line-height: 1.55;
  max-width: 680px;
}

.back {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--mm-blue);
  text-decoration: none;
  font-size: 13px;
  font-weight: 650;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mm-blue);
  font-weight: 700;
}

h1 {
  margin: 0 0 8px;
  font-size: clamp(28px, 4vw, 36px);
  letter-spacing: -0.03em;
}

.top-actions,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.who {
  font-size: 13px;
  color: var(--mm-muted);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-primary,
.btn-ghost {
  font: inherit;
  cursor: pointer;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.btn-primary {
  border: 0;
  background: var(--mm-blue);
  color: #fff;
}

.btn-ghost {
  border: 1px solid var(--mm-line-strong);
  background: #fff;
  color: var(--mm-text);
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: default;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 0;
  background: color-mix(in srgb, var(--mm-bg) 88%, transparent);
  backdrop-filter: blur(8px);
}

.seg {
  display: inline-flex;
  background: #fff;
  border: 1px solid var(--mm-line);
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
  color: var(--mm-muted);
  cursor: pointer;
}

.seg button.on {
  background: var(--mm-blue-soft);
  color: var(--mm-blue-deep);
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

.sample-pill.quiet {
  color: var(--mm-blue-deep);
  background: var(--mm-blue-soft);
}

.live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stage.dim {
  opacity: 0.72;
}

.panel {
  background: #fff;
  border: 1px solid var(--mm-line);
  border-radius: var(--mm-radius);
  padding: 16px 18px 18px;
}

.panel-head h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.panel-head p,
.muted {
  margin: 0;
  color: var(--mm-muted);
  font-size: 13px;
  line-height: 1.55;
}

.panel-head { margin-bottom: 12px; }
.panel-head-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--mm-muted);
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
  color: var(--mm-faint);
}

.split {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 14px;
}

.split-recent {
  grid-template-columns: 1.25fr 0.75fr;
}

.tpl-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tpl-top {
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
  color: var(--mm-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
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

@media (max-width: 980px) {
  .split,
  .split-recent,
  .top {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }
  .range-note { margin-left: 0; }
  .inner { padding: 20px 14px 48px; }
}
</style>
