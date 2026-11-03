<script setup lang="ts">
/**
 * 图表属性面板（侧栏）。
 *
 * 选中任一图表块即弹出；面板内容按 schema 分区块：
 * 通用 / 坐标轴 / 系列 / 数据 / 数据接口 / 样式 / 高级 JSON。
 *
 * 面板只是「编辑区」，真正的写回由宿主（useChartPanelHost）完成。
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ChartGeneralSection from './ChartGeneralSection.vue'
import ChartAxisSection from './ChartAxisSection.vue'
import ChartSeriesSection from './ChartSeriesSection.vue'
import ChartDataSection from './ChartDataSection.vue'
import ChartDataSourceSection from './ChartDataSourceSection.vue'
import ChartStyleSection from './ChartStyleSection.vue'
import ChartAdvancedJsonSection from './ChartAdvancedJsonSection.vue'
import { useChartPanel } from './useChartPanel'
import type { useChartPanelHost } from './useChartPanelHost'
import { isSameEchartsOption } from '../../../utils/echarts/chartOptionPath'
import { writeChartSecret } from '../../../utils/echarts/chartSecret'
import type { ChartDataSourceConfig } from '../../../utils/echarts/chartDataSource'

const props = defineProps<{ host: ReturnType<typeof useChartPanelHost> }>()

const panel = useChartPanel()

const visible = computed(() => props.host.open && !!props.host.target)

/** 把宿主里的目标转成面板需要的形状。 */
function toPanelTarget() {
  const next = props.host.target
  if (!next) return null
  return {
    chartId: next.chartId,
    chartType: next.chartType,
    option: next.option,
    dataSource: next.dataSource,
  }
}

// 切换图表块才重新载入（同一块内部改动不重载，避免把面板里的输入焦点/分页重置）
watch(
  () => props.host.target?.chartId,
  () => {
    const next = toPanelTarget()
    if (!next) {
      panel.close()
      return
    }
    panel.load(next)
  },
  { immediate: true },
)

// 文档里的 option 被外部改动（且面板里没有本地改动）时同步过来
watch(
  () => props.host.target?.option,
  (option) => {
    if (!option || panel.isDirty) return
    const next = toPanelTarget()
    if (next) panel.load(next)
  },
)

/** 面板里任何改动都写回文档（保持实时预览）。 */
function persist() {
  const option = panel.serializeDraft()
  if (!option) return
  const chartId = props.host.target?.chartId || ''
  if (!chartId) return
  previousOption = props.host.readOptionById(chartId)
  lastWritten = option
  lastChartId = chartId
  props.host.applyOptionById(chartId, JSON.parse(option))
  armGuard()
}

/**
 * 回声守护。
 *
 * 面板写回后，父组件可能把旧 HTML 回写进来（整篇 setContent），
 * 图表的 option 会被悄悄改回去 —— 表现就是「面板里改了不落盘」。
 * 这里在写回后的短时间内盯住文档：只有当 option 恰好退回到写回前的值时，
 * 才用面板里的值再写一次（说明是被回声覆盖了）；外部的真实改动不碰。
 */
let previousOption = ''
let lastWritten = ''
let lastChartId = ''
let guardTimer: ReturnType<typeof setTimeout> | null = null

function armGuard() {
  if (guardTimer) clearTimeout(guardTimer)
  guardTimer = setTimeout(() => {
    guardTimer = null
  }, 2000)
}

function onEditorTransaction() {
  if (!guardTimer || !lastWritten || !lastChartId) return
  const live = props.host.readOptionById(lastChartId)
  if (!live) return
  if (isSameEchartsOption(live, lastWritten)) return
  // 只有「退回到写回前的值」才当成被回声覆盖；外部的真实改动不碰
  if (!isSameEchartsOption(live, previousOption)) return
  props.host.applyOptionById(lastChartId, JSON.parse(lastWritten))
}

let stopEditorUpdate: (() => void) | null = null

onMounted(() => {
  stopEditorUpdate = props.host.onTransaction(onEditorTransaction)
})

onBeforeUnmount(() => {
  stopEditorUpdate?.()
  stopEditorUpdate = null
  if (guardTimer) clearTimeout(guardTimer)
  guardTimer = null
})

// 草稿每次改动（revision 自增）都写回文档
watch(
  () => panel.revision,
  () => persist(),
)

function onUpdateConfig(config: ChartDataSourceConfig) {
  props.host.applyDataSource(config)
}

function onUpdateSecret(secret: { bearerToken: string; headers: Record<string, string> }) {
  const chartId = props.host.target?.chartId
  if (!chartId) return
  writeChartSecret(chartId, secret)
  ElMessage.success('密钥已保存到本机浏览器（不会写入文档）')
}

/** 删除图表块（需二次确认）。 */
async function onDelete() {
  try {
    await ElMessageBox.confirm('删除后该图表块及其数据将无法恢复，确认删除？', '删除图表', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  if (props.host.remove()) {
    ElMessage.success('已删除图表块')
  }
}
</script>

<template>
  <aside v-if="visible" class="rte-chart-panel" data-rte-own aria-label="图表属性">
    <header class="rte-cp-head">
      <div class="rte-cp-title">图表属性</div>
      <div class="rte-cp-subtitle">
        {{ panel.schema.label }}
        <span class="rte-cp-type">{{ props.host.chartType }}</span>
      </div>
      <button type="button" class="rte-cp-close" title="关闭面板" @click="props.host.hide()">
        ×
      </button>
    </header>

    <div class="rte-cp-body">
      <p v-if="panel.error" class="rte-cp-error">{{ panel.error }}</p>
      <ChartGeneralSection :panel="panel" />
      <ChartAxisSection :panel="panel" />
      <ChartSeriesSection :panel="panel" />
      <ChartDataSection :panel="panel" />
      <ChartDataSourceSection
        :panel="panel"
        @update-config="onUpdateConfig"
        @update-secret="onUpdateSecret"
      />
      <ChartStyleSection :panel="panel" />
      <ChartAdvancedJsonSection :panel="panel" />
    </div>

    <footer class="rte-cp-foot">
      <button type="button" class="rte-cp-btn rte-cp-btn-danger" @click="onDelete">删除图表</button>
      <button type="button" class="rte-cp-btn" @click="props.host.hide()">关闭</button>
    </footer>
  </aside>
</template>
