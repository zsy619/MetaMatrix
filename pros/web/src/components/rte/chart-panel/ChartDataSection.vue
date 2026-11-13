<script setup lang="ts">
/**
 * 数据区块：表格 ⇄ JSON 双向同步。
 *
 * - 表格视图：行 = 类目，列 = 系列；可增删行、增删列、改单元格；
 * - JSON 视图：同一个数据模型的 JSON，改完「应用」回写模型；
 * 两侧共用 useChartPanel 里的 ChartDataModel，所以天然同步。
 */
import { computed } from 'vue'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const columns = computed(() => props.panel.seriesNames)
</script>

<template>
  <div class="rte-cp-section">
    <h4 class="rte-cp-section-title">数据</h4>
    <div class="rte-cp-tabs">
      <button
        type="button"
        class="rte-cp-tab"
        :class="{ active: props.panel.dataView === 'table' }"
        title="用表格改类目和系列"
        @click="props.panel.dataView = 'table'"
      >
        表格
      </button>
      <button
        type="button"
        class="rte-cp-tab"
        :class="{ active: props.panel.dataView === 'json' }"
        title="用 JSON 改同一份数据"
        @click="props.panel.dataView = 'json'"
      >
        JSON
      </button>
    </div>

    <div v-if="props.panel.dataView === 'table'" class="rte-cp-table-wrap">
      <table class="rte-cp-table">
        <thead>
          <tr>
            <th class="rte-cp-th">类目</th>
            <th v-for="name in columns" :key="name" class="rte-cp-th">{{ name }}</th>
            <th class="rte-cp-th rte-cp-th-act"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in props.panel.dataRows" :key="rowIndex">
            <td class="rte-cp-td">
              <input
                class="rte-cp-input rte-cp-input-sm"
                type="text"
                :value="row.category"
                title="这一行的类目名称"
                @change="(e) => props.panel.setDataCategory(rowIndex, (e.target as HTMLInputElement).value)"
              />
            </td>
            <td v-for="(value, colIndex) in row.values" :key="colIndex" class="rte-cp-td">
              <input
                class="rte-cp-input rte-cp-input-sm"
                type="text"
                :value="String(value)"
                title="这一格的数值"
                @change="(e) => props.panel.setDataCell(rowIndex, colIndex, (e.target as HTMLInputElement).value)"
              />
            </td>
            <td class="rte-cp-td rte-cp-td-act">
              <button
                type="button"
                class="rte-cp-mini"
                title="删掉这一行类目"
                @click="props.panel.removeDataRow(rowIndex)"
              >
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="rte-cp-row-actions">
        <button type="button" class="rte-cp-mini" title="在表格末尾加一行" @click="props.panel.addDataRow()">+ 行</button>
        <button type="button" class="rte-cp-mini" title="加一列系列，数值先填 0" @click="props.panel.addDataSeries()">+ 系列</button>
        <button
          type="button"
          class="rte-cp-mini rte-cp-mini-danger"
          title="删掉当前这一列系列"
          @click="props.panel.removeDataSeries(props.panel.seriesIndex)"
        >
          − 系列
        </button>
      </div>
    </div>

    <div v-else class="rte-cp-json-wrap">
      <textarea
        class="rte-cp-textarea rte-cp-textarea-code"
        rows="12"
        spellcheck="false"
        :value="props.panel.dataJson"
        @change="(e) => props.panel.applyDataJson((e.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="rte-cp-field-hint">表格与 JSON 共用同一份数据模型，改任意一侧另一侧同步。</p>
    </div>
  </div>
</template>
