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
import { ECHARTS_CHART_TYPES } from '../../../utils/rteEchartsOption'
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
  // 类型与 option 一起写回：换类型后类型字段不能还留在旧值。
  lastWrittenAttrs = {
    option,
    chartType: panel.target?.chartType || props.host.chartType,
  }
  props.host.applyAttrsById(chartId, lastWrittenAttrs)
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
let lastWrittenAttrs: Record<string, unknown> = {}
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
  props.host.applyAttrsById(lastChartId, lastWrittenAttrs)
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

/**
 * 删除图表块（需二次确认）。
 *
 * 确认弹窗期间宿主可能回写内容、选区可能丢失，面板目标会被清空。
 * 所以先把 chartId 记下来，确认后按 id 删除 —— 目标丢了也照样删得掉。
 */
async function onDelete() {
  const chartId = props.host.target?.chartId || ''
  if (!chartId) {
    ElMessage.warning('图表块已不在文档中')
    return
  }
  try {
    await ElMessageBox.confirm('删除后该图表块及其数据将无法恢复，确认删除？', '删除图表', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
      // 确认弹窗默认挂在 body 上，但 Element Plus 的遮罩 z-index 只有 2000 段，
      // 会被编辑器自身的层级盖住（沉浸全屏 4000 / 属性面板 5300 / 浮层 6000 /
      // 图片拖拽 10060 / 打印遮罩 11000）—— 表现就是「确认提示被编辑器遮挡」，
      // 点了删除看不见弹窗。这里给遮罩挂一个专属 class，由样式抬到编辑器之上
      // （见 editor.global.css 的 .rte-chart-delete-confirm）。
      appendTo: 'body',
      modalClass: 'rte-chart-delete-confirm',
    })
  } catch {
    return
  }
  if (props.host.removeById(chartId)) {
    props.host.hide()
    ElMessage.success('已删除图表块')
  } else {
    ElMessage.error('删除失败：图表块已不在文档中')
  }
}

/** 换图表类型（写回 chartType + option）。 */
function onChangeChartType(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!panel.setChartType(value)) {
    ElMessage.warning('该图表类型不可用')
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
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">图表类型</span>
        <select
          class="rte-cp-type-select"
          :value="panel.target?.chartType || ''"
          @change="onChangeChartType"
        >
          <option v-for="item in ECHARTS_CHART_TYPES" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <button type="button" class="rte-cp-close" title="关闭面板" @click="props.host.hide()">
        ×
      </button>
    </header>

    <div class="rte-cp-body">
      <p v-if="panel.error" class="rte-cp-error">{{ panel.error }}</p>
      <div class="rte-cp-preview-slot">正文里的图形与左侧数据同步。导出 HTML 和 PDF 时嵌成当前画面的静态图。</div>
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
