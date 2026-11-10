<script setup lang="ts">
/**
 * 表格公式栏（类飞书 / Excel）。
 *
 * 选中表格单元格时出现：显示单元格地址 + 单元格原始公式/值，可直接编辑；
 * 回车后回写到单元格并重算整张表；公式非法或循环引用时显示 #VALUE! / #REF! 等错误码。
 */
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import {
  applyCellInput,
  cellDisplayText,
  cellFormulaText,
  findSelectedCell,
  tableGrid,
} from '../../utils/rteTableFormulaOps'
import { evaluateFormula, isFormulaCell } from '../../utils/rteTableFormula'
import {
  BAR_FALLBACK_HEIGHT,
  placeFormulaBar,
  resolveTableElement,
} from '../../utils/rteFormulaBarPosition'

const props = defineProps<{ editor?: Editor; readonly?: boolean }>()

/**
 * 原始编辑器实例。
 *
 * props 可能是 Vue 的 reactive 代理；一旦代理了 ProseMirror 的 doc / schema，
 * 新建的事务与真实 state 的 doc 就不一致，dispatch 会抛
 * "Applying a mismatched transaction"。这里统一取 raw 实例。
 */
const rawEditor = computed<Editor | undefined>(() => {
  const ed = props.editor
  return ed ? (toRaw(ed) as Editor) : undefined
})

/** 选区/内容变化时自增，触发重新计算。 */
const version = ref(0)

function bump() {
  version.value += 1
}

watch(
  rawEditor,
  (ed, old) => {
    if (old) {
      old.off('selectionUpdate', bump)
      old.off('update', bump)
    }
    if (ed) {
      ed.on('selectionUpdate', bump)
      ed.on('update', bump)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  const ed = rawEditor.value
  if (!ed) return
  ed.off('selectionUpdate', bump)
  ed.off('update', bump)
})

/** 当前选中的单元格。 */
const active = computed(() => {
  version.value
  const ed = rawEditor.value
  if (!ed) return null
  return findSelectedCell(ed.state)
})

const visible = computed(() => !!active.value && !props.readonly)

/** 单元格地址，如 B3。 */
const address = computed(() => active.value?.address ?? '')

/** 公式栏里的原始内容：公式原文优先，否则是显示文本。 */
const source = computed(() => {
  const cell = active.value?.cell
  if (!cell) return ''
  return cellFormulaText(cell) || cellDisplayText(cell)
})

/** 公式栏里的计算结果（错误时是错误码）。 */
const result = computed(() => {
  const loc = active.value
  if (!loc) return { value: '', error: null as string | null }
  const formula = cellFormulaText(loc.cell)
  if (!isFormulaCell(formula)) return { value: cellDisplayText(loc.cell), error: null }
  const grid = tableGrid(loc.table)
  const evaluated = evaluateFormula(formula, grid, loc.rowIndex, loc.colIndex)
  return evaluated.ok
    ? { value: evaluated.value, error: null }
    : { value: '', error: evaluated.error }
})

/** 输入框里的草稿。 */
const draft = ref('')
const editing = ref(false)

watch(
  () => [address.value, source.value] as const,
  () => {
    if (!editing.value) draft.value = source.value
  },
  { immediate: true },
)

let autoApplyTimer: ReturnType<typeof setTimeout> | null = null

/** 公式已经能算出结果时写入单元格，不必再点一次「应用」。 */
watch(draft, (value) => {
  if (autoApplyTimer) {
    clearTimeout(autoApplyTimer)
    autoApplyTimer = null
  }
  if (!editing.value) return
  const loc = active.value
  if (!loc || !isFormulaCell(value) || value.trim() === source.value.trim()) return
  const grid = tableGrid(loc.table)
  if (!grid[loc.rowIndex]) return
  const trial = grid.map((row) => [...row])
  trial[loc.rowIndex]![loc.colIndex] = value.trim()
  const evaluated = evaluateFormula(value, trial, loc.rowIndex, loc.colIndex)
  if (!evaluated.ok) return
  autoApplyTimer = setTimeout(() => {
    autoApplyTimer = null
    if (editing.value && draft.value.trim() === value.trim()) apply()
  }, 280)
})

onBeforeUnmount(() => {
  if (autoApplyTimer) clearTimeout(autoApplyTimer)
})

/** 回写公式并重算。 */
function apply() {
  const ed = rawEditor.value
  const loc = active.value
  if (!ed || !loc) return
  applyCellInput(ed, loc, draft.value)
  editing.value = false
  bump()
}

function onEnter() {
  apply()
}

function onEscape() {
  editing.value = false
  draft.value = source.value
}

/** 公式栏根元素，用来量真实宽高。 */
const barEl = ref<HTMLElement | null>(null)

/** 公式栏浮在表格上方（或下方）；拿不到位置时退化为画布左上角。 */
const barStyle = computed(() => {
  version.value
  const ed = rawEditor.value
  const loc = active.value
  if (!ed || !loc) return {}
  const canvas = ed.view.dom.closest?.('.rte-canvas') as HTMLElement | null
  if (!canvas) return {}
  const tableEl = resolveTableElement(ed, loc.tablePos)
  if (!tableEl) return {}
  const canvasRect = canvas.getBoundingClientRect()
  const tableRect = tableEl.getBoundingClientRect()
  if (!tableRect.width && !tableRect.height) return { top: '0px', left: '0px' }
  const toolbar = canvas.closest('.rte-root')?.querySelector('.rte-toolbar') as HTMLElement | null
  const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 0
  const safeTop = Math.max(0, toolbarBottom)
  const bar = {
    width: barEl.value?.offsetWidth || 0,
    height: barEl.value?.offsetHeight || BAR_FALLBACK_HEIGHT,
  }
  const pos = placeFormulaBar(
    tableRect,
    bar,
    { width: window.innerWidth, height: window.innerHeight },
    safeTop,
  )
  const top = pos.top - canvasRect.top - canvas.clientTop + canvas.scrollTop
  const left = pos.left - canvasRect.left - canvas.clientLeft + canvas.scrollLeft
  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  }
})

/** 滚动 / 缩放时跟随表格。 */
function onViewportChange() {
  if (active.value) bump()
}
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
}
onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

/** 首次出现时量到真实尺寸后再算一次。 */
watch(barEl, (el) => {
  if (el) bump()
})
</script>

<template>
  <div
    v-if="visible"
    ref="barEl"
    class="rte-formula-bar"
    :style="barStyle"
    role="group"
    aria-label="表格公式栏"
    @mousedown.stop
    @click.stop
  >
    <span class="rte-formula-address" aria-label="单元格地址">{{ address }}</span>
    <span class="rte-formula-sign" aria-hidden="true">=</span>
    <input
      class="rte-formula-input"
      type="text"
      :value="draft"
      placeholder="输入公式，如 =SUM(A1:B3)"
      aria-label="单元格公式"
      @input="editing = true; draft = ($event.target as HTMLInputElement).value"
      @keydown.enter.prevent="onEnter"
      @keydown.esc.prevent="onEscape"
    />
    <span v-if="result.error" class="rte-formula-error" role="status">{{ result.error }}</span>
    <span v-else class="rte-formula-value" role="status">{{ result.value }}</span>
    <button
      class="rte-formula-apply"
      type="button"
      title="回车写入并重算"
      aria-label="写入公式并重算"
      @mousedown.prevent
      @click="apply"
    >
      应用
    </button>
  </div>
</template>

<style scoped>
.rte-formula-bar {
  position: absolute;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 6px;
  background: var(--mm-surface, #fff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  font-size: 12px;
  max-width: min(640px, 90%);
}

.rte-formula-address {
  min-width: 44px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f4f6f8;
  color: var(--mm-text, #1d2129);
  font-weight: 600;
  text-align: center;
}

.rte-formula-sign {
  color: var(--mm-text-2, #646a73);
}

.rte-formula-input {
  flex: 1 1 auto;
  min-width: 120px;
  padding: 3px 6px;
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 4px;
  font: inherit;
  color: inherit;
  background: transparent;
}

.rte-formula-value {
  color: var(--mm-text-2, #646a73);
  white-space: nowrap;
}

.rte-formula-error {
  color: #d83931;
  font-weight: 600;
  white-space: nowrap;
}

.rte-formula-apply {
  padding: 3px 8px;
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 4px;
  background: #f4f6f8;
  cursor: pointer;
  font: inherit;
}
</style>
