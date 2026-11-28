<script setup lang="ts">
/**
 * 业务公式ABC模型画布。
 *
 * 图形按参考图重排：外层黑框三角是「业务公式空间」，三个顶点分别是
 * A. 目标（上）、B. 参数（左下）、C. 逻辑关系（右下）；内部绿色三角是
 * 创新公式、橙色三角是借鉴公式；重心向三顶点引虚线，公式落在三角形
 * 底部的白色公式块里。
 *
 * 交互对齐 pm-solution-triangle：顶点标题块是可点击图层，点击（或键盘
 * Enter/Space）通过全局 panelMaximizeKey 打开该层的全屏富文本编辑，
 * 与下方卡片的 CanvasRegionEditor 共用同一套最大化机制（key = block:<id>）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  AbcModelDocumentJSON,
  AbcModelBlockId,
  BusinessFormulaPattern,
  BusinessFormulaPatternsDocumentJSON,
} from '../../types/canvas'
import { isAbcModelDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { panelMaximizeKey, usePanelMaximize } from '../../composables/usePanelMaximize'
import CanvasRegionEditor from './CanvasRegionEditor.vue'
import { BFP_CATEGORIES } from './businessFormulaPatternsLayout'
import bfpTemplate from '../../templates/business-formula-patterns-v1.json'
import {
  ABC_VIEW,
  ABC_COLORS,
  ABC_FRAME_POINTS,
  ABC_INNOVATION_POINTS,
  ABC_BORROWED_POINTS,
  ABC_RAYS,
  ABC_CENTER,
  ABC_FORMULA,
  ABC_VERTEX_GROUPS,
  ABC_LEGEND,
  ABC_LEGEND_POS,
  abcEstimateTextWidth,
} from './abcModelLayout'

const props = defineProps<{ doc: AbcModelDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

/* ------------------------------------------------------------------ *
 * 借鉴公式：十大经典范式
 *
 * 橙色三角一直只是块装饰，图例却写着「学习掌握十大业务公式」。
 * 这里把「业务公式·十大经典范式」画布里的十条范式接进来：
 * 点一条就写进 C. 逻辑关系层，不必回那张画布再抄一遍。
 * ------------------------------------------------------------------ */

const CLASSIC_PATTERNS = (
  bfpTemplate as unknown as BusinessFormulaPatternsDocumentJSON
).patterns

const classicGroups = computed(() =>
  BFP_CATEGORIES.map((cat) => ({
    key: cat.key,
    label: cat.label,
    patterns: CLASSIC_PATTERNS.filter((p) => p.category === cat.key),
  })).filter((group) => group.patterns.length > 0),
)

/** 刚写入的范式 id：给个短暂反馈，让用户知道点进去了。 */
const insertedId = ref<number | null>(null)

// 范式里的 * 和 / 换成画布统一的 × 和 ÷。
function normalizeFormula(text: string): string {
  return text.replace(/\*/g, '×').replace(/\//g, '÷')
}

function insertClassicFormula(pattern: BusinessFormulaPattern) {
  documentStore.mutateCanvas((doc) => {
    if (!isAbcModelDoc(doc)) return
    const conn = doc.blocks.find((b) => b.id === 'connection')
    if (!conn) return
    conn.items = conn.items || []
    conn.items.push({
      id: `classic-${pattern.id}-${Date.now()}`,
      text: `公式: ${pattern.name} = ${normalizeFormula(pattern.formula)}`,
    })
  })
  insertedId.value = pattern.id
  window.setTimeout(() => {
    if (insertedId.value === pattern.id) insertedId.value = null
  }, 1200)
}

const order: AbcModelBlockId[] = ['ambition', 'basis', 'connection']

const blocksById = computed(() => {
  const map = new Map<AbcModelBlockId, (typeof props.doc.blocks)[number]>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: AbcModelBlockId) {
  return blocksById.value.get(id)
}

interface EditableRegion {
  id: AbcModelBlockId
  title: string
  en: string
  count: number
  hints: string[]
  items: (typeof props.doc.blocks)[number]['items']
}

// hint 用「·」分隔要点清单（梳理业务 · 挑战目标 · 拆子目标）。
function hintList(hint: string | undefined): string[] {
  return (hint || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
}

// 编辑区只保留业务数据，不再计算绝对定位坐标；三张卡片由 CSS Grid 排列在 SVG 下方。
const editableRegions = computed<EditableRegion[]>(() =>
  order.map((id) => {
    const b = block(id)
    return {
      id,
      title: b?.title || id,
      en: ABC_VERTEX_GROUPS[id].en,
      count: b?.items.length ?? 0,
      hints: hintList(b?.hint),
      items: b?.items ?? [],
    }
  }),
)

/* ------------------------------------------------------------------ *
 * 顶点图层：标题 + 英文副标题 + 条目数 + 要点清单
 * ------------------------------------------------------------------ */

const vertices = computed(() =>
  order.map((id) => {
    const b = block(id)
    const g = ABC_VERTEX_GROUPS[id]
    const list = hintList(b?.hint)
    return {
      id,
      title: b?.title || id,
      group: g,
      list,
      count: b?.items.length ?? 0,
    }
  }),
)

/* ------------------------------------------------------------------ *
 * 图形点击 → 全局最大化编辑（与 CanvasRegionEditor 共用 block:<id> key）
 * ------------------------------------------------------------------ */

const activeEditorId = ref<AbcModelBlockId | null>(null)
// 与 CanvasRegionEditor 内部相同的 key 规则，父组件写入全局 key 后，
// 对应卡片的 CanvasRegionEditor 会自动弹出全屏富文本编辑。
const activeMaximizeKey = computed(() =>
  activeEditorId.value ? panelMaximizeKey('block', activeEditorId.value) : '',
)
// 只借用全局 maximizedPanelKey 引用用于双向同步，本组件不渲染遮罩。
const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(id: AbcModelBlockId) {
  activeEditorId.value = id
  nextTick(() => {
    maximizedPanelKey.value = panelMaximizeKey('block', id)
  })
}

// 全屏编辑被关闭（点关闭按钮 / Esc / 打开其它面板）时，同步清理本组件的选中态。
watch(maximizedPanelKey, (key) => {
  if (!key && activeEditorId.value) {
    activeEditorId.value = null
  }
})

/* ------------------------------------------------------------------ *
 * 公式构建
 * ------------------------------------------------------------------ */

const formulaTokens = ref<string[]>(props.doc.formula ? props.doc.formula.split(' ').filter(Boolean) : [])

const formulaText = computed(() => formulaTokens.value.join(' '))

// 文档里的公式被外部改动（重新载入、协同更新）时，同步回公式条。
watch(
  () => props.doc.formula,
  (value) => {
    const next = (value || '').split(' ').filter(Boolean)
    if (next.join(' ') !== formulaText.value) {
      formulaTokens.value = next
    }
  },
)

function addToFormula(token: string) {
  formulaTokens.value.push(token)
  persistFormula()
}

function removeToken(index: number) {
  formulaTokens.value.splice(index, 1)
  persistFormula()
}

function clearFormula() {
  formulaTokens.value = []
  persistFormula()
}

function persistFormula() {
  documentStore.mutateCanvas((doc) => {
    if (!isAbcModelDoc(doc)) return
    doc.formula = formulaTokens.value.join(' ')
  })
}

function saveFormulaAsConnection() {
  if (formulaTokens.value.length === 0) return
  const formulaText = formulaTokens.value.join(' ')
  documentStore.mutateCanvas((doc) => {
    if (!isAbcModelDoc(doc)) return
    const connBlock = doc.blocks.find((b) => b.id === 'connection')
    if (connBlock) {
      connBlock.items = connBlock.items || []
      connBlock.items.push({
        id: `formula-${Date.now()}`,
        text: `公式: ${formulaText}`,
      })
    }
  })
  clearFormula()
}

// 运算符 token 高亮判断
const OP_TOKENS = ['+', '-', '×', '÷', '(', ')']
function isOpToken(token: string) {
  return OP_TOKENS.includes(token)
}

// 括号不配平时公式没有意义，直接提示，别让用户把坏公式存进 C 层。
const parenBalanced = computed(() => {
  let depth = 0
  for (const ch of formulaText.value) {
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return depth === 0
})

/* ------------------------------------------------------------------ *
 * 图形里的公式块
 * ------------------------------------------------------------------ */

const formulaChip = computed(() => {
  const text = formulaText.value
  if (!text) return null
  const width = Math.min(
    ABC_FORMULA.maxWidth,
    abcEstimateTextWidth(text, ABC_FORMULA.fontSize) + 28,
  )
  return {
    x: ABC_FORMULA.x - width / 2,
    y: ABC_FORMULA.y - ABC_FORMULA.height / 2,
    width,
    height: ABC_FORMULA.height,
    text,
  }
})

// 公式块点击 → 滚到公式构建器
const builderEl = ref<HTMLElement | null>(null)
// 借鉴公式区 → 滚到十大经典范式清单
const classicEl = ref<HTMLElement | null>(null)

function focusBuilder() {
  builderEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

function focusClassic() {
  classicEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <div class="abc-canvas" :style="chrome" aria-label="业务公式ABC模型画布">
    <header class="abc-title-bar">
      <h1>{{ doc.title }}</h1>
    </header>

    <div class="abc-stage">
      <svg
        class="abc-svg"
        :viewBox="`0 0 ${ABC_VIEW.w} ${ABC_VIEW.h}`"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="业务公式ABC模型三角形示意图，点击 A 目标 / B 参数 / C 逻辑关系可编辑对应内容"
      >
        <defs>
          <!-- 创新公式区的斜纹（参考图里绿色三角是排线填充） -->
          <pattern
            id="abc-hatch"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="9"
              :stroke="ABC_COLORS.innovation"
              stroke-width="1.4"
              opacity="0.3"
            />
          </pattern>
        </defs>

        <!-- 创新公式（绿）：外层是排线，内层是淡色底。点击定位到公式构建器 -->
        <g
          class="abc-zone abc-zone--innovation"
          role="button"
          tabindex="0"
          aria-label="创新公式区，点击打开公式构建器"
          @click="focusBuilder"
          @keydown.enter.prevent="focusBuilder"
          @keydown.space.prevent="focusBuilder"
        >
          <title>创新公式(解放思想)：自己创建、探索业务公式 —— 点击打开公式构建器</title>
          <polygon :points="ABC_INNOVATION_POINTS" :fill="ABC_COLORS.innovationFill" />
          <polygon :points="ABC_INNOVATION_POINTS" fill="url(#abc-hatch)" />
          <polygon
            :points="ABC_INNOVATION_POINTS"
            fill="none"
            :stroke="ABC_COLORS.innovation"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>

        <!-- 借鉴公式（橙）：点击定位到十大经典范式 -->
        <g
          class="abc-zone abc-zone--borrowed"
          role="button"
          tabindex="0"
          aria-label="借鉴公式区，点击打开十大经典范式"
          @click="focusClassic"
          @keydown.enter.prevent="focusClassic"
          @keydown.space.prevent="focusClassic"
        >
          <title>借鉴公式(实事求是)：学习掌握十大业务公式 —— 点击打开经典范式清单</title>
          <polygon
            :points="ABC_BORROWED_POINTS"
            :fill="ABC_COLORS.borrowedFill"
            :stroke="ABC_COLORS.borrowed"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>

        <!-- 重心到三顶点的虚线 -->
        <line
          v-for="(ray, i) in ABC_RAYS"
          :key="`ray-${i}`"
          class="abc-ray"
          :x1="ray.x1"
          :y1="ray.y1"
          :x2="ray.x2"
          :y2="ray.y2"
        />

        <!-- 外层黑框：业务公式空间 -->
        <polygon
          class="abc-frame"
          :points="ABC_FRAME_POINTS"
          fill="none"
          :stroke="ABC_COLORS.frame"
          stroke-width="5"
          stroke-linejoin="round"
        />

        <!-- 重心灰点 -->
        <circle
          class="abc-center-dot"
          :cx="ABC_CENTER.x"
          :cy="ABC_CENTER.y"
          r="4.5"
          :fill="ABC_COLORS.ray"
        />

        <!-- 三个顶点图层：标题块 + 要点清单，点击打开该层的全屏编辑 -->
        <g
          v-for="v in vertices"
          :key="`vertex-${v.id}`"
          class="abc-vertex"
          :class="[
            `abc-vertex--${v.id}`,
            { 'is-active': activeEditorId === v.id },
          ]"
          role="button"
          tabindex="0"
          :aria-label="`编辑${v.title}`"
          @click="openEditor(v.id)"
          @keydown.enter.prevent="openEditor(v.id)"
          @keydown.space.prevent="openEditor(v.id)"
        >
          <title>{{ v.title }} · {{ v.group.en }} —— 点击全屏编辑</title>
          <text
            class="abc-vertex-title"
            :x="v.group.titleX"
            :y="v.group.titleY"
            text-anchor="middle"
            :fill="ABC_COLORS.ink"
          >
            {{ v.title }}
          </text>
          <text
            class="abc-vertex-en"
            :x="v.group.titleX"
            :y="v.group.enY"
            text-anchor="middle"
            :fill="ABC_COLORS.sub"
          >
            {{ v.group.en }}
          </text>
          <text
            class="abc-vertex-count"
            :x="v.group.titleX"
            :y="v.group.countY"
            text-anchor="middle"
            :fill="ABC_COLORS.muted"
          >
            {{ v.count }} 条
          </text>
          <line
            class="abc-vertex-rule"
            :x1="v.group.ruleX"
            :y1="v.group.ruleTop"
            :x2="v.group.ruleX"
            :y2="v.group.ruleBottom"
            :stroke="ABC_COLORS.rule"
            stroke-width="1.2"
          />
          <text
            v-for="(item, i) in v.list"
            :key="`hint-${v.id}-${i}`"
            class="abc-vertex-hint"
            :x="v.group.listX"
            :y="v.group.listY + i * v.group.listLineHeight"
            :fill="ABC_COLORS.muted"
          >
            {{ item }}
          </text>
        </g>

        <!-- 公式块：图形与业务数据联动 -->
        <g
          v-if="formulaChip"
          class="abc-formula"
          role="button"
          tabindex="0"
          aria-label="当前业务公式，点击定位到公式构建器"
          @click="focusBuilder"
          @keydown.enter.prevent="focusBuilder"
          @keydown.space.prevent="focusBuilder"
        >
          <rect
            class="abc-formula-box"
            :x="formulaChip.x"
            :y="formulaChip.y"
            :width="formulaChip.width"
            :height="formulaChip.height"
            rx="18"
            :fill="ABC_COLORS.chip"
            :stroke="ABC_COLORS.frame"
            stroke-width="1.4"
          />
          <text
            class="abc-formula-text"
            :x="ABC_FORMULA.x"
            :y="ABC_FORMULA.y"
            text-anchor="middle"
            dominant-baseline="middle"
            :font-size="ABC_FORMULA.fontSize"
            :fill="ABC_COLORS.ink"
          >
            {{ formulaChip.text }}
          </text>
        </g>

        <!-- 图例：借鉴公式 / 创新公式 -->
        <g class="abc-legend">
          <g
            v-for="(entry, i) in ABC_LEGEND"
            :key="entry.key"
            :transform="`translate(${ABC_LEGEND_POS.x} ${ABC_LEGEND_POS.y + i * 62})`"
          >
            <rect
              x="0"
              y="0"
              :width="ABC_LEGEND_POS.barWidth"
              :height="ABC_LEGEND_POS.barHeight"
              rx="2.5"
              :fill="entry.color"
            />
            <text
              class="abc-legend-title"
              :x="ABC_LEGEND_POS.barWidth + 12"
              y="18"
              :fill="entry.color"
            >
              {{ entry.title }}
            </text>
            <text
              class="abc-legend-desc"
              :x="ABC_LEGEND_POS.barWidth + 12"
              y="38"
              :fill="ABC_COLORS.muted"
            >
              {{ entry.desc }}
            </text>
          </g>
        </g>
      </svg>
    </div>

    <!-- 编辑卡片位于正常文档流中，始终排在三角形之后，不覆盖 SVG。 -->
    <div class="abc-regions">
      <section
        v-for="r in editableRegions"
        :key="`ed-${r.id}`"
        class="abc-region"
        :class="{ 'is-active': activeEditorId === r.id }"
      >
        <h3 class="abc-card-title">
          <span class="abc-card-name">{{ r.title }}</span>
          <span class="abc-card-en">{{ r.en }}</span>
          <span class="abc-card-count">{{ r.count }} 条</span>
        </h3>
        <p v-if="r.hints.length" class="abc-card-hints">{{ r.hints.join(' · ') }}</p>
        <CanvasRegionEditor
          :block-id="r.id"
          :title="r.title"
          :items="r.items"
          :placeholder="`填写${r.title}内容`"
        />
      </section>
    </div>

    <!-- 公式构建器 -->
    <div ref="builderEl" class="abc-formula-builder">
      <div class="abc-builder-head">
        <h4>业务公式构建器</h4>
        <span class="abc-builder-hint">从 B. 参数 里挑要素，配上 + - × ÷ 组装公式</span>
      </div>
      <div class="abc-formula-display">
        <span v-if="formulaTokens.length === 0" class="abc-formula-empty">
          点击下方参数或运算符构建公式...
        </span>
        <span
          v-for="(token, i) in formulaTokens"
          :key="i"
          :class="['abc-formula-token', { 'is-op': isOpToken(token) }]"
          :title="`点击移除「${token}」`"
          @click="removeToken(i)"
        >
          {{ token }}
        </span>
      </div>
      <p v-if="!parenBalanced" class="abc-formula-warn" role="alert">
        括号没有配平，公式暂时存不进 C 层。
      </p>
      <div class="abc-formula-tools">
        <button class="abc-formula-btn" aria-label="添加加号" @click="addToFormula('+')">+</button>
        <button class="abc-formula-btn" aria-label="添加减号" @click="addToFormula('-')">-</button>
        <button class="abc-formula-btn" aria-label="添加乘号" @click="addToFormula('×')">×</button>
        <button class="abc-formula-btn" aria-label="添加除号" @click="addToFormula('÷')">÷</button>
        <button class="abc-formula-btn" aria-label="添加左括号" @click="addToFormula('(')">(</button>
        <button class="abc-formula-btn" aria-label="添加右括号" @click="addToFormula(')')">)</button>
        <button
          class="abc-formula-btn abc-formula-btn--clear"
          :disabled="formulaTokens.length === 0"
          @click="clearFormula"
        >
          清空
        </button>
        <button
          class="abc-formula-btn abc-formula-btn--save"
          :disabled="formulaTokens.length === 0 || !parenBalanced"
          title="保存为 C 层的一条公式条目"
          @click="saveFormulaAsConnection"
        >
          保存到C
        </button>
      </div>
      <div class="abc-formula-params">
        <span
          v-for="item in (block('basis')?.items || [])"
          :key="item.id"
          class="abc-param-tag"
          :title="`把「${item.text}」加入公式`"
          @click="addToFormula(item.text)"
        >
          {{ item.text }}
        </span>
      </div>
    </div>

    <!-- 借鉴公式：十大经典范式。点一条直接写进 C 层 -->
    <section ref="classicEl" class="abc-classic" aria-label="借鉴公式 十大经典范式">
      <div class="abc-classic-head">
        <h4>借鉴公式 · 十大经典范式</h4>
        <span class="abc-classic-hint">
          点一条直接写进 C. 逻辑关系层（取自「业务公式 · 十大经典范式」画布）
        </span>
      </div>
      <div v-for="group in classicGroups" :key="group.key" class="abc-classic-group">
        <p class="abc-classic-group-title">{{ group.label }}</p>
        <div class="abc-classic-list">
          <button
            v-for="pattern in group.patterns"
            :key="pattern.id"
            type="button"
            class="abc-classic-chip"
            :class="{ 'is-added': insertedId === pattern.id }"
            :aria-label="`把「${pattern.name}」写进 C 层`"
            @click="insertClassicFormula(pattern)"
          >
            <span class="abc-classic-name">{{ pattern.name }}</span>
            <span class="abc-classic-desc">{{ pattern.desc }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.abc-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 12px 14px 18px;
  color: #202124;
  background: var(--cv-page, #f4f0e8);
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
}

.abc-title-bar {
  flex: none;
  display: flex;
  justify-content: center;
  padding: 0 4px 8px;
}

.abc-title-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: center;
}

/* ---------------- 图形区 ---------------- */
.abc-stage {
  flex: none;
  width: min(100%, 1180px);
  margin: 0 auto;
  aspect-ratio: 1280 / 740;
}

.abc-svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  overflow: visible;
}

.abc-ray {
  stroke: #b7bdc6;
  stroke-width: 1.4;
  stroke-dasharray: 5 5;
  /* 虚线画在三角区上面，不加这句会把点击全吃掉 */
  pointer-events: none;
}

.abc-center-dot {
  pointer-events: none;
}

.abc-vertex {
  cursor: pointer;
  outline: none;
}

.abc-vertex-title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.abc-vertex-en {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.abc-vertex-count {
  font-size: 11px;
  font-weight: 600;
}

.abc-vertex-hint {
  font-size: 12.5px;
  font-weight: 500;
}

/* 悬停/选中：标题变珊瑚橙，与英文副标题同一色系 */
.abc-vertex .abc-vertex-title {
  transition: fill 0.15s ease;
}

.abc-vertex:hover .abc-vertex-title,
.abc-vertex:focus-visible .abc-vertex-title,
.abc-vertex.is-active .abc-vertex-title {
  fill: #e8823c;
}

.abc-vertex:focus-visible .abc-vertex-rule {
  stroke: #e8823c;
  stroke-width: 2;
}

.abc-vertex:hover .abc-vertex-rule,
.abc-vertex.is-active .abc-vertex-rule {
  stroke: #e8823c;
}

/* ---------------- 公式块 ---------------- */
.abc-formula {
  cursor: pointer;
  outline: none;
}

.abc-formula-box {
  filter: drop-shadow(0 2px 6px rgba(31, 31, 31, 0.16));
  transition: stroke 0.15s ease;
}

.abc-formula:hover .abc-formula-box,
.abc-formula:focus-visible .abc-formula-box {
  stroke: #e8823c;
  stroke-width: 2;
}

.abc-formula-text {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, "PingFang SC", monospace;
  font-weight: 700;
}

/* ---------------- 图例 ---------------- */
.abc-legend-title {
  font-size: 16px;
  font-weight: 800;
}

/* 图例只是说明文字，不该抢走点击 */
.abc-legend {
  pointer-events: none;
}

.abc-legend-desc {
  font-size: 12.5px;
  font-weight: 500;
}

/* ---------------- 编辑区 ---------------- */
.abc-regions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  width: min(100%, 1180px);
  margin: 6px auto 0;
}

.abc-region {
  min-width: 0;
  box-sizing: border-box;
  padding: 12px 12px 10px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 16px rgba(62, 48, 28, 0.05);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.abc-region.is-active {
  border-color: #e8823c;
  box-shadow: 0 6px 18px rgba(232, 130, 60, 0.16);
}

.abc-card-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.35;
}

.abc-card-name {
  color: var(--cv-ink-strong, #202124);
}

.abc-card-en {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #f0a05c;
}

.abc-card-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--cv-muted, #5f6368);
}

/* 卡片里也写一遍该层的要点，手机上图形缩太小时至少还看得到写什么 */
.abc-card-hints {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cv-muted, #5f6368);
}

/* 四条要点一行都不能被裁掉 */
.abc-region :deep(.region-input) {
  max-height: 168px;
}

.abc-region :deep(.region-input.is-blank) {
  max-height: 32px;
}

/* ---------------- 公式构建器 ---------------- */
.abc-formula-builder {
  flex: none;
  width: min(100%, 1180px);
  margin: 16px auto 0;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 12px;
  padding: 16px;
}

.abc-builder-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.abc-builder-head h4 {
  margin: 0;
  font-size: 14px;
  color: #666;
  letter-spacing: 0.04em;
}

.abc-builder-hint {
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
}

.abc-formula-display {
  min-height: 48px;
  padding: 12px;
  background: #f8f8f8;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.abc-formula-empty {
  color: #999;
  font-size: 14px;
}

.abc-formula-token {
  padding: 4px 12px;
  background: #f3f3f4;
  color: #3c4043;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.abc-formula-token:hover {
  background: #e4e5e7;
}

.abc-formula-token.is-op {
  background: #3c4043;
  color: #fff;
}

.abc-formula-warn {
  margin: -4px 0 12px;
  font-size: 13px;
  color: #c0392b;
}

.abc-formula-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.abc-formula-btn {
  padding: 6px 14px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.abc-formula-btn:hover:not(:disabled) {
  background: #f0f0f0;
}

.abc-formula-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.abc-formula-btn--clear {
  color: #c4534a;
  border-color: #c4534a;
}

.abc-formula-btn--clear:disabled {
  color: #c4534a;
  border-color: #c4534a;
  background: #fff;
}

.abc-formula-btn--save {
  background: #202124;
  color: #fff;
  border-color: #202124;
}

.abc-formula-btn--save:disabled {
  background: #202124;
  color: #fff;
}

.abc-formula-params {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.abc-formula-params:empty::after {
  content: "先在 B. 参数里添加条目，即可点击生成公式";
  color: #bbb;
  font-size: 13px;
}

.abc-param-tag {
  padding: 6px 12px;
  background: #fdeee0;
  color: #b35c12;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.abc-param-tag:hover {
  background: #b35c12;
  color: #fff;
}

/* ---------------- 借鉴公式：十大经典范式 ---------------- */
.abc-classic {
  flex: none;
  width: min(100%, 1180px);
  margin: 16px auto 0;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 12px;
  padding: 16px;
}

.abc-classic-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.abc-classic-head h4 {
  margin: 0;
  font-size: 14px;
  color: #666;
  letter-spacing: 0.04em;
}

.abc-classic-hint {
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
}

.abc-classic-group + .abc-classic-group {
  margin-top: 12px;
}

.abc-classic-group-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #b35c12;
}

.abc-classic-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 8px;
}

.abc-classic-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;
  border: 1px solid #f0d9bf;
  border-radius: 8px;
  background: #fdf7ef;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.abc-classic-chip:hover {
  border-color: #e07b22;
  background: #fdf1e3;
}

.abc-classic-chip:focus-visible {
  outline: 2px solid #e8823c;
  outline-offset: 1px;
}

.abc-classic-chip.is-added {
  border-color: #2e9e5b;
  background: #eaf6ef;
}

.abc-classic-name {
  font-size: 13px;
  font-weight: 700;
  color: #7a4a12;
}

.abc-classic-desc {
  font-size: 11.5px;
  color: var(--cv-muted, #5f6368);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 两个三角区都是可点的入口 */
.abc-zone {
  cursor: pointer;
  outline: none;
}

.abc-zone--innovation polygon,
.abc-zone--borrowed polygon {
  transition: stroke-width 0.15s ease;
}

.abc-zone:hover polygon,
.abc-zone:focus-visible polygon {
  stroke-width: 3;
}

.abc-zone:focus-visible polygon {
  stroke: #e8823c;
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 900px) {
  .abc-stage {
    width: 100%;
    aspect-ratio: auto;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .abc-svg {
    width: 900px;
    height: auto;
    aspect-ratio: 1280 / 740;
  }
}

@media (max-width: 800px) {
  .abc-canvas {
    padding: 12px 12px 96px;
  }

  .abc-regions {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .abc-region :deep(.region-input) {
    max-height: none;
    overflow: visible;
  }

  .abc-region :deep(.region-input.is-blank) {
    max-height: none;
  }
}
</style>
