<script setup lang="ts">
/**
 * 分享页里的多维表格只读预览。
 *
 * 复用表格数据模型：第一个视图的字段与记录渲染成只读表格，
 * 看板 / 画廊 / 日历视图在分享页按表格视图呈现。
 */
import { computed } from 'vue'
import { cellText, migrateSheet, viewRows, type SheetData } from './sheetModel'

const props = defineProps<{ data: unknown }>()

const sheet = computed<SheetData>(() => migrateSheet(props.data))
const view = computed(() => sheet.value.views[0] ?? null)
const fields = computed(() => sheet.value.fields)
const rows = computed(() => (view.value ? viewRows(sheet.value, view.value) : sheet.value.rows))
</script>

<template>
  <div class="sheet-preview">
    <table v-if="fields.length" class="sheet-preview__table">
      <thead>
        <tr>
          <th v-for="field in fields" :key="field.id">{{ field.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td v-for="field in fields" :key="field.id">
            {{ cellText(row.cells[field.id]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="sheet-preview__empty">这张多维表格还没有字段。</p>
    <p v-if="fields.length && !rows.length" class="sheet-preview__empty">还没有记录。</p>
  </div>
</template>

<style scoped>
.sheet-preview {
  overflow-x: auto;
}
.sheet-preview__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.sheet-preview__table th,
.sheet-preview__table td {
  border: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
}
.sheet-preview__table th {
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  font-weight: 600;
  color: var(--mm-text-2, #4e5969);
}
.sheet-preview__table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.5);
}
.sheet-preview__empty {
  text-align: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
  padding: 24px 0;
}
</style>
