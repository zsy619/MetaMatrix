<script setup lang="ts">
/**
 * 业务公式十大经典范式画布。
 *
 * 图形按参考图重排：三个大圆分别是收入提升、竞争提升、运营提升，圆心连成
 * 三角形；十条范式按方向排在三角四周；正中是「你下一步最渴望提升什么」。
 * 点范式条目打开计算器（改参数、实时试算），点圆圈聚焦某一个方向。
 *
 * 收入提升（全局商业模式）：流量变现型、线索转化型、门店收入型、用户周期型
 * 竞争提升（稀缺竞争力）：脱离成本型、工业生产型
 * 运营提升（运营数据提升）：连续留存型、留存节点型、连续动作型、动作节点型
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BusinessFormulaPatternsDocumentJSON, BusinessFormulaPattern } from '../../types/canvas'
import { isBusinessFormulaPatternsDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  BFP_VIEW,
  BFP_CATEGORIES,
  BFP_COLORS,
  BFP_BADGE_COLORS,
  BFP_LINKS,
  BFP_CENTER,
  BFP_CIRCLE_TEXT,
  BFP_ENTRY_TEXT,
  bfpCircledNumber,
  bfpEstimateWidth,
  type BfpCategoryKey,
} from './businessFormulaPatternsLayout'

const props = defineProps<{ doc: BusinessFormulaPatternsDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const focusedCategory = ref<BfpCategoryKey | null>(null)
const selectedPattern = ref<BusinessFormulaPattern | null>(null)
const paramValues = ref<Record<string, number>>({})

const categoryByKey = computed(() => {
  const map = new Map(BFP_CATEGORIES.map((c) => [c.key, c]))
  return map
})

/** 每条范式在图上的落点：编号、标题起点、标签起点、所属方向 */
interface MapEntry {
  pattern: BusinessFormulaPattern
  category: BfpCategoryKey
  x: number
  y: number
  num: string
  badgeX: number
}

const mapEntries = computed<MapEntry[]>(() => {
  const out: MapEntry[] = []
  for (const cat of BFP_CATEGORIES) {
    const list = props.doc.patterns
      .filter((p) => p.category === cat.key)
      .sort((a, b) => a.id - b.id)
    list.forEach((pattern, i) => {
      const x = cat.listX
      const num = bfpCircledNumber(pattern.id)
      out.push({
        pattern,
        category: cat.key,
        x,
        y: cat.listY + i * cat.listStep,
        num,
        // 标签跟在「编号 + 名称」后面
        badgeX:
          x +
          bfpEstimateWidth(num, BFP_ENTRY_TEXT.nameSize) +
          bfpEstimateWidth(pattern.name, BFP_ENTRY_TEXT.nameSize) +
          6,
      })
    })
  }
  return out
})

function isDimmed(category: BfpCategoryKey): boolean {
  return !!focusedCategory.value && focusedCategory.value !== category
}

function toggleFocus(category: BfpCategoryKey) {
  focusedCategory.value = focusedCategory.value === category ? null : category
}

/* ------------------------------------------------------------------ *
 * 计算器
 * ------------------------------------------------------------------ */

function openPattern(pattern: BusinessFormulaPattern) {
  selectedPattern.value = pattern
  // 恢复保存的参数值
  const saved = props.doc.savedParams?.[pattern.id] || {}
  const values: Record<string, number> = {}
  pattern.params.forEach((p) => {
    values[p.name] = saved[p.name] !== undefined ? saved[p.name] : p.defaultValue
  })
  paramValues.value = values
}

function closePattern() {
  selectedPattern.value = null
  paramValues.value = {}
}

function updateParam(name: string, value: number) {
  paramValues.value[name] = value
}

// 参数名直接出现在公式里，先按出现顺序从长到短替换，避免「转化率」抢在
// 「转化率×复购」前面把公式改坏（名字互为前缀时按短名替换会算错）。
const calculatedResult = computed(() => {
  if (!selectedPattern.value) return null
  const pattern = selectedPattern.value
  const params = [...pattern.params].sort(
    (a, b) => b.name.length - a.name.length,
  )
  let expression = pattern.formula
  for (const p of params) {
    let val = paramValues.value[p.name] ?? 0
    if (p.unit === '%') val = val / 100
    expression = expression.split(p.name).join(`(${val})`)
  }

  try {
    // 安全数学表达式求值
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) return null
    const result = new Function('return ' + expression)()
    return typeof result === 'number' && !isNaN(result) ? result : null
  } catch {
    return null
  }
})

const resultFormulaText = computed(() => {
  if (!selectedPattern.value) return ''
  let text = selectedPattern.value.formula
  for (const p of selectedPattern.value.params) {
    text = text.split(p.name).join(String(paramValues.value[p.name] ?? 0))
  }
  return text
})

function saveParams() {
  if (!selectedPattern.value) return
  documentStore.mutateCanvas((doc) => {
    if (!isBusinessFormulaPatternsDoc(doc)) return
    if (!doc.savedParams) doc.savedParams = {}
    doc.savedParams[selectedPattern.value!.id] = { ...paramValues.value }
  })
}

function resetParams() {
  if (!selectedPattern.value) return
  const values: Record<string, number> = {}
  selectedPattern.value.params.forEach((p) => {
    values[p.name] = p.defaultValue
  })
  paramValues.value = values
}

function formatNumber(num: number | null): string {
  if (num === null) return '—'
  if (Number.isInteger(num)) return num.toLocaleString('zh-CN')
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function formatFormulaDisplay(formula: string): string {
  return formula
    .replace(/\*/g, ' × ')
    .replace(/\+/g, ' + ')
    .replace(/\//g, ' ÷ ')
}

function badgeColor(badge: string): string {
  return BFP_BADGE_COLORS[badge] || BFP_COLORS.accent
}

/* ------------------------------------------------------------------ *
 * 弹窗键盘交互
 * ------------------------------------------------------------------ */

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedPattern.value) {
    event.preventDefault()
    closePattern()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="bfp-canvas" :style="chrome" aria-label="业务公式十大经典范式画布">
    <div class="bfp-inner">
      <header class="bfp-title-bar">
        <h1>{{ doc.title }}</h1>
        <p class="bfp-title-hint">点圆圈聚焦一个方向，点范式条目打开计算器</p>
      </header>

      <div class="bfp-stage">
        <svg
          class="bfp-svg"
          :viewBox="`0 0 ${BFP_VIEW.w} ${BFP_VIEW.h}`"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="十大经典范式分布图：收入提升、竞争提升、运营提升三个方向"
        >
          <!-- 三个方向的连线（画在圆下面，圆是不透明的，线端自然被盖住） -->
          <line
            v-for="(link, i) in BFP_LINKS"
            :key="`link-${i}`"
            class="bfp-link"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
          />

          <!-- 方向圆 -->
          <g
            v-for="cat in BFP_CATEGORIES"
            :key="`cat-${cat.key}`"
            class="bfp-circle"
            :class="{ 'is-dimmed': isDimmed(cat.key), 'is-focused': focusedCategory === cat.key }"
            role="button"
            tabindex="0"
            :aria-label="`聚焦${cat.label}`"
            @click="toggleFocus(cat.key)"
            @keydown.enter.prevent="toggleFocus(cat.key)"
            @keydown.space.prevent="toggleFocus(cat.key)"
          >
            <title>{{ cat.label }} · {{ cat.sub }}——点击聚焦</title>
            <circle
              :cx="cat.cx"
              :cy="cat.cy"
              :r="cat.r"
              :fill="cat.fill"
              :stroke="cat.ring"
              stroke-width="2"
            />
            <text
              class="bfp-circle-title"
              :x="cat.cx"
              :y="cat.cy + BFP_CIRCLE_TEXT.titleDy"
              text-anchor="middle"
              :font-size="BFP_CIRCLE_TEXT.titleSize"
              :fill="BFP_COLORS.ink"
            >
              {{ cat.label }}
            </text>
            <text
              class="bfp-circle-sub"
              :x="cat.cx"
              :y="cat.cy + BFP_CIRCLE_TEXT.subDy"
              text-anchor="middle"
              :font-size="BFP_CIRCLE_TEXT.subSize"
              :fill="BFP_COLORS.accent"
            >
              {{ cat.sub }}
            </text>
          </g>

          <!-- 正中提问 -->
          <g class="bfp-center">
            <path
              class="bfp-chevron"
              :d="`M ${BFP_CENTER.x - 16} ${BFP_CENTER.y - 26} L ${BFP_CENTER.x} ${BFP_CENTER.y - 42} L ${BFP_CENTER.x + 16} ${BFP_CENTER.y - 26}`"
              fill="none"
              :stroke="BFP_COLORS.chevron"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <text
              class="bfp-center-line"
              :x="BFP_CENTER.x"
              :y="BFP_CENTER.y"
              text-anchor="middle"
              :fill="BFP_COLORS.center"
            >
              你下一步
            </text>
            <text
              class="bfp-center-line"
              :x="BFP_CENTER.x"
              :y="BFP_CENTER.y + 30"
              text-anchor="middle"
              :fill="BFP_COLORS.center"
            >
              最渴望提升什么？
            </text>
          </g>

          <!-- 十条范式 -->
          <g
            v-for="entry in mapEntries"
            :key="`entry-${entry.pattern.id}`"
            class="bfp-entry"
            :class="{ 'is-dimmed': isDimmed(entry.category) }"
            role="button"
            tabindex="0"
            :aria-label="`${entry.pattern.name} 打开计算器`"
            @click="openPattern(entry.pattern)"
            @keydown.enter.prevent="openPattern(entry.pattern)"
            @keydown.space.prevent="openPattern(entry.pattern)"
          >
            <title>{{ entry.pattern.name }}——点击打开计算器</title>
            <text
              class="bfp-entry-name"
              :x="entry.x"
              :y="entry.y"
              :font-size="BFP_ENTRY_TEXT.nameSize"
              :fill="BFP_COLORS.ink"
            >
              {{ entry.num }}{{ entry.pattern.name }}
            </text>
            <text
              class="bfp-entry-badge"
              :x="entry.badgeX"
              :y="entry.y"
              :font-size="BFP_ENTRY_TEXT.badgeSize"
              :fill="badgeColor(entry.pattern.badge)"
            >
              {{ entry.pattern.badgeText }}
            </text>
            <text
              class="bfp-entry-desc"
              :x="entry.x"
              :y="entry.y + BFP_ENTRY_TEXT.descDy"
              :font-size="BFP_ENTRY_TEXT.descSize"
              :fill="BFP_COLORS.desc"
            >
              {{ entry.pattern.desc }}
            </text>
          </g>
        </svg>
      </div>
    </div>

    <!-- 计算器弹窗 -->
    <div
      v-if="selectedPattern"
      class="bfp-modal-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="selectedPattern.name"
      @click.self="closePattern"
    >
      <div class="bfp-modal">
        <div class="bfp-modal-header">
          <div class="bfp-modal-heading">
            <h2>{{ selectedPattern.name }}</h2>
            <span
              class="bfp-modal-badge"
              :style="{ color: badgeColor(selectedPattern.badge) }"
            >
              {{ selectedPattern.badgeText }}
            </span>
            <span class="bfp-modal-category">
              {{ categoryByKey.get(selectedPattern.category)?.label }}
            </span>
          </div>
          <button
            type="button"
            class="bfp-modal-close"
            aria-label="关闭"
            @click="closePattern"
          >
            ×
          </button>
        </div>

        <div class="bfp-modal-body">
          <section class="bfp-modal-section">
            <h3>公式表达式</h3>
            <div class="bfp-modal-formula">
              {{ formatFormulaDisplay(selectedPattern.formula) }}
            </div>
          </section>

          <section class="bfp-modal-section">
            <h3>参数编辑</h3>
            <div class="bfp-params-editor">
              <div v-for="p in selectedPattern.params" :key="p.name" class="bfp-param-row">
                <div class="bfp-param-info">
                  <div class="bfp-param-name">{{ p.name }}</div>
                  <div class="bfp-param-desc">{{ p.desc }}</div>
                </div>
                <input
                  type="number"
                  class="bfp-param-input"
                  :value="paramValues[p.name]"
                  step="any"
                  :aria-label="`${p.name}数值`"
                  @input="updateParam(p.name, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                />
                <span class="bfp-param-unit">{{ p.unit }}</span>
              </div>
            </div>
          </section>

          <section class="bfp-modal-section">
            <h3>计算结果</h3>
            <div class="bfp-result">
              <div class="bfp-result-value">{{ formatNumber(calculatedResult) }}</div>
              <div class="bfp-result-formula">
                {{ resultFormulaText }} = {{ formatNumber(calculatedResult) }}
              </div>
            </div>
          </section>
        </div>

        <div class="bfp-modal-footer">
          <button type="button" class="bfp-btn bfp-btn--secondary" @click="resetParams">
            重置参数
          </button>
          <button type="button" class="bfp-btn bfp-btn--primary" @click="saveParams">
            保存参数
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bfp-canvas {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  min-height: 0;
  padding: 12px 14px 14px;
  overflow: auto;
  color: #202124;
  background: var(--cv-page, #f4f0e8);
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
}

/*
 * 上下左右居中：用 margin:auto 而不是 justify-content/align-items——
 * 内容比视口高时 auto 外边距会退化成 0，顶部不会被裁掉
 * （flex 居中把溢出内容切掉的经典坑）。
 */
.bfp-inner {
  margin: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.bfp-title-bar {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 4px 8px;
}

.bfp-title-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.bfp-title-hint {
  margin: 0;
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
}

/* ---------------- 图形区 ---------------- */
.bfp-stage {
  flex: none;
  width: min(100%, 1320px);
  margin: 0 auto;
  aspect-ratio: 1340 / 700;
}

.bfp-svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  overflow: visible;
}

.bfp-link {
  stroke: #1f1f1f;
  stroke-width: 2;
  stroke-linecap: round;
}

.bfp-circle,
.bfp-entry {
  cursor: pointer;
  outline: none;
  transition: opacity 0.18s ease;
}

.bfp-circle circle {
  transition: stroke-width 0.15s ease, filter 0.15s ease;
}

.bfp-circle:hover circle,
.bfp-circle:focus-visible circle {
  stroke-width: 3.4;
  filter: saturate(1.08);
}

.bfp-circle.is-focused circle {
  stroke-width: 4;
}

.bfp-circle-title {
  font-weight: 800;
}

.bfp-circle-sub {
  font-weight: 700;
}

.bfp-center-line {
  font-size: 22px;
  font-weight: 700;
  pointer-events: none;
}

.bfp-entry-name {
  font-weight: 800;
  transition: fill 0.15s ease;
}

.bfp-entry-badge {
  font-weight: 700;
}

.bfp-entry:hover .bfp-entry-name,
.bfp-entry:focus-visible .bfp-entry-name {
  fill: #e8543f;
}

.bfp-circle.is-dimmed,
.bfp-entry.is-dimmed {
  opacity: 0.26;
}

/* ---------------- 计算器弹窗 ---------------- */
.bfp-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(32, 28, 22, 0.46);
  backdrop-filter: blur(2px);
}

.bfp-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.bfp-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.bfp-modal-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.bfp-modal-heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.bfp-modal-badge {
  font-size: 13px;
  font-weight: 700;
}

.bfp-modal-category {
  font-size: 13px;
  color: var(--cv-muted, #5f6368);
}

.bfp-modal-close {
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 8px;
  background: #fff;
  color: #666;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.bfp-modal-close:hover {
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
}

.bfp-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 4px;
}

.bfp-modal-section {
  margin-bottom: 20px;
}

.bfp-modal-section h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--cv-muted, #5f6368);
}

.bfp-modal-formula {
  padding: 14px;
  border-radius: 10px;
  background: #f8f8f8;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px;
  color: #3c4043;
  line-height: 1.8;
}

.bfp-params-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bfp-param-row {
  display: grid;
  grid-template-columns: 1fr 110px 44px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8f8f8;
}

.bfp-param-name {
  font-size: 15px;
  font-weight: 600;
}

.bfp-param-desc {
  margin-top: 2px;
  font-size: 12px;
  color: #888;
}

.bfp-param-input {
  padding: 8px 10px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 6px;
  background: #fff;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 15px;
  text-align: right;
}

.bfp-param-input:focus {
  outline: none;
  border-color: var(--cv-focus, #1c4c7c);
  box-shadow: 0 0 0 2px var(--cv-hover-wash, #e8f1fa);
}

.bfp-param-unit {
  font-size: 13px;
  color: #888;
  text-align: center;
}

.bfp-result {
  padding: 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fdf3e2 0%, #e9e7f7 100%);
  text-align: center;
}

.bfp-result-value {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 34px;
  font-weight: 800;
  color: #1f1f1f;
}

.bfp-result-formula {
  margin-top: 10px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  color: #666;
  word-break: break-all;
}

.bfp-modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--cv-frame, #ececec);
}

.bfp-btn {
  padding: 9px 22px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.bfp-btn--primary {
  background: #202124;
  color: #fff;
}

.bfp-btn--primary:hover {
  background: #3c4043;
}

.bfp-btn--secondary {
  background: #f0f0f0;
  color: #666;
}

.bfp-btn--secondary:hover {
  background: #e0e0e0;
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 768px) {
  .bfp-title-bar {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .bfp-param-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .bfp-param-input {
    text-align: left;
  }
}

/* 窄屏：图缩到手机宽度后字只有 4px，改成固定最小宽度 + 横向滚动 */
@media (max-width: 900px) {
  .bfp-stage {
    width: 100%;
    aspect-ratio: auto;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .bfp-svg {
    width: 860px;
    height: auto;
    aspect-ratio: 1340 / 700;
  }
}
</style>
