<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { BusinessFormulaDocumentJSON } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  DEFAULT_FORMULA_TEXT,
  FORMULA_TEMPLATES,
  FORMULA_TYPE_OPTIONS,
  INDUSTRY_OPTIONS,
  PALETTE_OPTIONS,
  PALETTES,
  filterTemplateButtons,
  buildDiagramModel,
  formatFormulaText,
  nodeRectAttrs,
  nodeTextAttrs,
  opCircleClass,
  type LayoutDirection,
  type PaletteName,
  type SavedFormula,
} from '../../utils/businessFormula'

const props = defineProps<{
  doc: BusinessFormulaDocumentJSON
}>()

const documentStore = useDocumentStore()

const formulaText = ref(props.doc.formulaText || DEFAULT_FORMULA_TEXT)
const layout = ref<LayoutDirection>(props.doc.layout || 'horizontal')
const palette = ref<PaletteName>(props.doc.palette || 'rainbow')
const savedFormulas = ref<SavedFormula[]>([...(props.doc.savedFormulas || [])])
const templateQuery = ref('')
const industryFilter = ref('all')
const formulaTypeFilter = ref('all')
const activeTemplateKey = ref('')
const savedQuery = ref('')
const isMaximized = ref(false)
const scale = ref(0.8)
const translate = ref({ x: 50, y: 100 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const svgRef = ref<SVGSVGElement | null>(null)
const diagramHost = ref<HTMLElement | null>(null)
const crossCenter = ref(400)
const renderTick = ref(0)

const paletteColors = computed(() => PALETTES[palette.value] || PALETTES.rainbow)

const filteredTemplates = computed(() =>
  filterTemplateButtons(industryFilter.value, formulaTypeFilter.value, templateQuery.value),
)

const filteredSavedFormulas = computed(() => {
  const q = savedQuery.value.trim().toLowerCase()
  if (!q) return savedFormulas.value.map((item, index) => ({ item, index }))
  return savedFormulas.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.name.toLowerCase().includes(q) || item.content.toLowerCase().includes(q))
})

const showSavedSearch = computed(() => savedFormulas.value.length > 3)

const diagram = computed(() => {
  renderTick.value
  return buildDiagramModel(formulaText.value, layout.value, crossCenter.value)
})

const viewportTransform = computed(
  () => `translate(${translate.value.x}, ${translate.value.y}) scale(${scale.value})`,
)

function persist() {
  const doc = props.doc
  doc.formulaText = formulaText.value
  doc.layout = layout.value
  doc.palette = palette.value
  doc.savedFormulas = savedFormulas.value.map((s) => ({ ...s }))
  documentStore.markDirty()
}

watch(
  () => props.doc,
  (doc) => {
    formulaText.value = doc.formulaText || DEFAULT_FORMULA_TEXT
    layout.value = doc.layout || 'horizontal'
    palette.value = doc.palette || 'rainbow'
    savedFormulas.value = [...(doc.savedFormulas || [])]
  },
)

function loadTemplate(key: string) {
  const text = FORMULA_TEMPLATES[key]
  if (!text) return
  activeTemplateKey.value = key
  formulaText.value = formatFormulaText(text)
  persist()
  nextTick(() => resetView())
}

function clearTemplateFilters() {
  templateQuery.value = ''
  industryFilter.value = 'all'
  formulaTypeFilter.value = 'all'
}

function onFormat() {
  formulaText.value = formatFormulaText(formulaText.value)
  persist()
}

function onGenerate() {
  persist()
  renderTick.value++
  nextTick(() => resetView())
}

function onFormulaInput() {
  persist()
}

function setLayout(dir: LayoutDirection) {
  layout.value = dir
  persist()
  nextTick(() => resetView())
}

function setPalette(name: PaletteName) {
  palette.value = name
  persist()
}

function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isMaximized.value) {
    isMaximized.value = false
  }
}

function saveCurrentFormula() {
  const name = window.prompt(
    '请输入公式名称：',
    '我的业务公式 ' + new Date().toLocaleDateString('zh-CN'),
  )
  if (!name) return
  savedFormulas.value = [
    ...savedFormulas.value,
    { name, content: formulaText.value },
  ]
  persist()
}

function loadSaved(index: number) {
  const item = savedFormulas.value[index]
  if (!item) return
  formulaText.value = formatFormulaText(item.content)
  persist()
  nextTick(() => resetView())
}

function deleteSaved(index: number, e: Event) {
  e.stopPropagation()
  if (!window.confirm('确定删除?')) return
  savedFormulas.value = savedFormulas.value.filter((_, i) => i !== index)
  persist()
}

function resetView() {
  scale.value = 0.8
  translate.value = {
    x: layout.value === 'horizontal' ? 50 : 0,
    y: 100,
  }
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.2, 3)
}
function zoomOut() {
  scale.value = Math.max(scale.value * 0.8, 0.2)
}

function onSvgMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - translate.value.x,
    y: e.clientY - translate.value.y,
  }
}
function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  translate.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y,
  }
}
function onMouseUp() {
  isDragging.value = false
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const svg = svgRef.value
  if (!svg) return
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.min(Math.max(scale.value * delta, 0.2), 3)
  const rect = svg.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  translate.value = {
    x: mouseX - (mouseX - translate.value.x) * (newScale / scale.value),
    y: mouseY - (mouseY - translate.value.y) * (newScale / scale.value),
  }
  scale.value = newScale
}

function measureCenter() {
  const el = diagramHost.value
  if (!el) return
  const h = el.clientHeight || 800
  const w = el.clientWidth || 800
  crossCenter.value = layout.value === 'horizontal' ? h / 2 : w / 2
}

function exportSvgImage() {
  const model = diagram.value
  if (!model || model.nodes.length === 0) {
    window.alert('请先生成图表')
    return
  }
  const colors = paletteColors.value
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of model.nodes) {
    const r = nodeRectAttrs(n, layout.value)
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  for (const link of model.links) {
    const coords = link.d.match(/[\d.]+/g)
    if (!coords) continue
    for (let i = 0; i + 1 < coords.length; i += 2) {
      const px = parseFloat(coords[i])
      const py = parseFloat(coords[i + 1])
      if (!Number.isNaN(px) && !Number.isNaN(py)) {
        minX = Math.min(minX, px)
        minY = Math.min(minY, py)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
      }
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 1000
    maxY = 500
  }
  const padding = 80
  const chartWidth = maxX - minX + padding * 2
  const chartHeight = maxY - minY + padding * 2
  const formulaLines = formulaText.value.split('\n').filter((l) => l.trim())
  const lineHeight = 26
  const formulaBlockHeight = formulaLines.length * lineHeight + 80
  const finalWidth = Math.max(chartWidth, 1000)
  const finalHeight = chartHeight + formulaBlockHeight + 30

  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const linkSvg = model.links
    .map((link) => {
      const stroke = colors[link.colorIndex % 7]
      let badge = ''
      if (link.op) {
        badge = `<g><circle cx="${link.badgeX}" cy="${link.badgeY}" r="14" fill="#ffffff" stroke="#dadce0" stroke-width="2"/><text x="${link.badgeX}" y="${link.badgeY + 5}" text-anchor="middle" fill="#202124" font-size="14" font-weight="800">${esc(link.op)}</text></g>`
      }
      return `<path d="${link.d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-opacity="0.55"/>${badge}`
    })
    .join('')

  const nodeSvg = model.nodes
    .map((n) => {
      const r = nodeRectAttrs(n, layout.value)
      const t = nodeTextAttrs(n, layout.value)
      const stroke = colors[n.depth % 7]
      return `<g><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="12" ry="12" fill="#fafafa" stroke="${stroke}" stroke-width="${n.depth === 0 ? 2 : 1}"/><text x="${t.x}" y="${t.y}" text-anchor="middle" fill="#202124" font-size="14" font-weight="500">${esc(n.displayName)}</text></g>`
    })
    .join('')

  const formulaSvg = formulaLines
    .map(
      (line, i) =>
        `<text x="0" y="${i * lineHeight}" fill="#5f6368" font-size="14" font-family="ui-monospace, monospace" xml:space="preserve">${esc(line)}</text>`,
    )
    .join('')

  const source = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${finalWidth}" height="${finalHeight}" viewBox="0 0 ${finalWidth} ${finalHeight}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g transform="translate(${padding - minX}, ${padding - minY})">${linkSvg}${nodeSvg}</g>
  <rect x="0" y="${chartHeight}" width="${finalWidth}" height="${formulaBlockHeight + 30}" fill="#f8f9fa"/>
  <text x="30" y="${chartHeight + 40}" fill="#202124" font-size="20" font-weight="700">业务公式</text>
  <g transform="translate(30, ${chartHeight + 70})">${formulaSvg}</g>
</svg>`

  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'business-formula.svg'
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeydown)
  measureCenter()
  if (!formulaText.value.trim()) {
    formulaText.value = formatFormulaText(DEFAULT_FORMULA_TEXT)
  } else {
    formulaText.value = formatFormulaText(formulaText.value)
  }
  persist()
  nextTick(() => {
    measureCenter()
    resetView()
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="bf-canvas" aria-label="业务公式">
    <aside class="bf-sidebar">
      <div class="bf-sidebar-header">
        <div class="bf-logo">
          <span class="bf-logo-mark">∑</span>
          <h1>业务公式</h1>
        </div>
        <p class="bf-sub">深度解构业务逻辑，发现增长杠杆</p>
      </div>

      <div class="bf-sidebar-content">
        <div class="bf-group bf-templates-group">
          <div class="bf-label-row">
            <span>示例模板</span>
            <span class="bf-count">{{ filteredTemplates.length }}</span>
          </div>

          <div class="bf-filter-sticky">
            <div class="bf-search-wrap">
              <input
                v-model="templateQuery"
                type="search"
                class="bf-search"
                placeholder="搜索模板名称 / key / emoji"
                autocomplete="off"
              />
              <button
                v-if="templateQuery || industryFilter !== 'all' || formulaTypeFilter !== 'all'"
                type="button"
                class="bf-search-clear"
                title="清除筛选"
                @click="clearTemplateFilters"
              >清除</button>
            </div>

            <div class="bf-chip-row" aria-label="行业分类">
              <button
                v-for="opt in INDUSTRY_OPTIONS"
                :key="'ind-' + opt.id"
                type="button"
                class="bf-chip"
                :class="{ active: industryFilter === opt.id }"
                @click="industryFilter = opt.id"
              >{{ opt.label }}</button>
            </div>

            <div class="bf-chip-row" aria-label="公式类型">
              <button
                v-for="opt in FORMULA_TYPE_OPTIONS"
                :key="'type-' + opt.id"
                type="button"
                class="bf-chip bf-chip-type"
                :class="{ active: formulaTypeFilter === opt.id }"
                @click="formulaTypeFilter = opt.id"
              >{{ opt.label }}</button>
            </div>
          </div>

          <div class="bf-template-grid">
            <button
              v-for="btn in filteredTemplates"
              :key="btn.key"
              type="button"
              class="bf-template-btn"
              :class="{ active: activeTemplateKey === btn.key }"
              :title="btn.label"
              @click="loadTemplate(btn.key)"
            >
              <span class="bf-emoji" aria-hidden="true">{{ btn.emoji }}</span>
              <span class="bf-template-label">{{ btn.label }}</span>
            </button>
            <p v-if="!filteredTemplates.length" class="bf-empty bf-empty-block">
              没有匹配的模板，试试调整筛选或清除搜索
            </p>
          </div>
        </div>

        <div class="bf-group">
          <div class="bf-label-row">
            <span>公式定义</span>
            <div class="bf-label-actions">
              <button type="button" class="bf-mini-btn" title="格式化" @click="onFormat">
                格式化
              </button>
              <button
                type="button"
                class="bf-mini-btn"
                :title="isMaximized ? '还原编辑框' : '最大化编辑框'"
                @click="toggleMaximize"
              >
                {{ isMaximized ? '还原' : '最大化' }}
              </button>
            </div>
          </div>
          <textarea
            v-model="formulaText"
            class="bf-textarea"
            :class="{ maximized: isMaximized }"
            spellcheck="false"
            placeholder="输入业务公式，例如：收入 = 流量 * 转化 * 客单价"
            @input="onFormulaInput"
          />
        </div>

        <div class="bf-group">
          <div class="bf-label-row">
            <span>我的公式</span>
            <button type="button" class="bf-mini-btn" @click="saveCurrentFormula">
              保存
            </button>
          </div>
          <div v-if="showSavedSearch" class="bf-search-wrap bf-saved-search">
            <input
              v-model="savedQuery"
              type="search"
              class="bf-search"
              placeholder="搜索已保存公式"
              autocomplete="off"
            />
          </div>
          <div class="bf-saved-list">
            <button
              v-for="{ item, index } in filteredSavedFormulas"
              :key="index"
              type="button"
              class="bf-template-btn bf-saved-btn"
              @click="loadSaved(index)"
            >
              <span class="bf-saved-name">📄 {{ item.name }}</span>
              <span
                class="bf-saved-del"
                title="删除"
                @click="deleteSaved(index, $event)"
              >✕</span>
            </button>
            <p v-if="!savedFormulas.length" class="bf-empty bf-empty-block">
              还没有保存的公式<br />编辑后点「保存」即可收藏到这里
            </p>
            <p v-else-if="!filteredSavedFormulas.length" class="bf-empty">
              没有匹配的已保存公式
            </p>
          </div>
        </div>
      </div>

      <div class="bf-sidebar-footer">
        <button type="button" class="bf-primary" @click="onGenerate">
          立即生成
        </button>
        <button type="button" class="bf-secondary" @click="exportSvgImage">
          导出图片
        </button>
      </div>
    </aside>

    <section class="bf-main">
      <div class="bf-toolbar">
        <div class="bf-tool-group">
          <button
            type="button"
            class="bf-tool-btn"
            :class="{ active: layout === 'horizontal' }"
            title="横向布局"
            @click="setLayout('horizontal')"
          >
            横排
          </button>
          <button
            type="button"
            class="bf-tool-btn"
            :class="{ active: layout === 'vertical' }"
            title="纵向布局"
            @click="setLayout('vertical')"
          >
            竖排
          </button>
        </div>
        <div class="bf-tool-group">
          <select
            class="bf-select"
            :value="palette"
            @change="setPalette(($event.target as HTMLSelectElement).value as any)"
          >
            <option v-for="opt in PALETTE_OPTIONS" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="bf-tool-group">
          <button type="button" class="bf-tool-btn" title="居中" @click="resetView">
            居中
          </button>
          <button type="button" class="bf-tool-btn" title="放大" @click="zoomIn">
            ＋
          </button>
          <button type="button" class="bf-tool-btn" title="缩小" @click="zoomOut">
            －
          </button>
        </div>
      </div>

      <div ref="diagramHost" class="bf-diagram">
        <svg
          ref="svgRef"
          class="bf-svg"
          xmlns="http://www.w3.org/2000/svg"
          :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
          @mousedown="onSvgMouseDown"
          @wheel.prevent="onWheel"
        >
          <defs>
            <pattern id="bf-dots" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="15" cy="15" r="1" fill="rgba(32,33,36,0.06)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bf-dots)" />
          <g :transform="viewportTransform">
            <g v-if="diagram">
              <g class="bf-links">
                <template v-for="(link, i) in diagram.links" :key="'l' + i">
                  <path
                    :d="link.d"
                    class="bf-link"
                    :stroke="paletteColors[link.colorIndex % 7]"
                  />
                  <g v-if="link.op" class="bf-op-badge">
                    <circle
                      :cx="link.badgeX"
                      :cy="link.badgeY"
                      r="14"
                      class="bf-op-circle"
                      :class="opCircleClass(link.op)"
                    />
                    <text
                      :x="link.badgeX"
                      :y="link.badgeY + 5"
                      text-anchor="middle"
                      class="bf-op-text"
                    >{{ link.op }}</text>
                  </g>
                </template>
              </g>
              <g class="bf-nodes">
                <g
                  v-for="(node, i) in diagram.nodes"
                  :key="'n' + i"
                  class="bf-node"
                >
                  <rect
                    v-bind="nodeRectAttrs(node, layout)"
                    class="bf-node-rect"
                    :stroke="paletteColors[node.depth % 7]"
                    :stroke-width="node.depth === 0 ? 2 : 1"
                  />
                  <text
                    v-bind="nodeTextAttrs(node, layout)"
                    text-anchor="middle"
                    class="bf-node-text"
                  >{{ node.displayName }}</text>
                </g>
              </g>
            </g>
          </g>
        </svg>
        <div v-if="!diagram" class="bf-diagram-empty">输入公式后点击「立即生成」</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bf-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  min-height: 0;
  background: #ffffff;
  color: #202124;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
  border: 1px solid #dadce0;
  box-sizing: border-box;
}

.bf-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border-right: 1px solid #dadce0;
}

.bf-sidebar-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid #e8eaed;
}

.bf-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bf-logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: #f1f3f4;
  color: #202124;
  font-weight: 800;
  font-size: 14px;
}

.bf-logo h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.01em;
}

.bf-sub {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9aa0a6;
  line-height: 1.4;
}

.bf-sidebar-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
  box-sizing: border-box;
}

.bf-group + .bf-group {
  margin-top: 16px;
}

.bf-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #5f6368;
}

.bf-count {
  font-size: 11px;
  font-weight: 600;
  color: #9aa0a6;
  background: #f1f3f4;
  border-radius: 999px;
  padding: 1px 7px;
}

.bf-label-actions {
  display: flex;
  gap: 6px;
}

.bf-mini-btn {
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #202124;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}

.bf-mini-btn:hover {
  background: #f1f3f4;
  border-color: #bdc1c6;
}

.bf-filter-sticky {
  position: sticky;
  top: -14px;
  z-index: 2;
  margin: 0 -2px 8px;
  padding: 0 2px 8px;
  background: linear-gradient(#ffffff 70%, rgba(255, 255, 255, 0.92));
}

.bf-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.bf-saved-search {
  margin-bottom: 8px;
}

.bf-search {
  flex: 1;
  min-width: 0;
  height: 30px;
  box-sizing: border-box;
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: #fafafa;
  color: #202124;
  padding: 0 10px;
  font-size: 12px;
}

.bf-search:focus {
  outline: none;
  border-color: #1a73e8;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.15);
}

.bf-search-clear {
  flex-shrink: 0;
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #5f6368;
  border-radius: 4px;
  height: 30px;
  padding: 0 8px;
  font-size: 11px;
  cursor: pointer;
}

.bf-search-clear:hover {
  background: #f1f3f4;
}

.bf-chip-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.bf-chip-row + .bf-chip-row {
  padding-bottom: 2px;
}

.bf-chip {
  flex-shrink: 0;
  border: 1px solid #e8eaed;
  background: #fafafa;
  color: #5f6368;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
}

.bf-chip:hover {
  background: #f1f3f4;
  border-color: #dadce0;
  color: #202124;
}

.bf-chip.active {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #174ea6;
  font-weight: 600;
}

.bf-chip-type.active {
  background: #fef7e0;
  border-color: #f9ab00;
  color: #b06000;
}

.bf-template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
  padding-right: 2px;
}

.bf-template-btn {
  border: 1px solid #e8eaed;
  background: #fafafa;
  color: #202124;
  border-radius: 4px;
  padding: 6px 4px;
  font-size: 11px;
  line-height: 1.25;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.bf-template-btn:hover {
  background: #f1f3f4;
  border-color: #dadce0;
}

.bf-template-btn.active {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #174ea6;
  box-shadow: inset 0 0 0 1px rgba(26, 115, 232, 0.25);
}

.bf-emoji {
  font-size: 14px;
  line-height: 1;
}

.bf-template-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.bf-textarea {
  width: 100%;
  min-height: 140px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: #fafafa;
  color: #202124;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.bf-textarea:focus {
  outline: none;
  border-color: #1a73e8;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.15);
}

.bf-textarea.maximized {
  position: fixed;
  inset: 48px 24px 24px 24px;
  z-index: 80;
  min-height: unset;
  height: auto;
  background: #ffffff;
  box-shadow: 0 8px 28px rgba(32, 33, 36, 0.18);
}

.bf-saved-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bf-saved-btn {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 7px 8px;
  text-align: left;
  gap: 4px;
}

.bf-saved-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.bf-saved-del {
  color: #d93025;
  margin-left: 6px;
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.75;
}

.bf-saved-btn:hover .bf-saved-del {
  opacity: 1;
}

.bf-empty {
  margin: 0;
  font-size: 12px;
  color: #9aa0a6;
  line-height: 1.5;
}

.bf-empty-block {
  grid-column: 1 / -1;
  padding: 16px 8px;
  text-align: center;
  background: #fafafa;
  border: 1px dashed #e8eaed;
  border-radius: 4px;
}

.bf-sidebar-footer {
  padding: 10px 14px 14px;
  border-top: 1px solid #e8eaed;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
}

.bf-primary {
  border: none;
  border-radius: 4px;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: #1a73e8;
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(26, 115, 232, 0.28);
}

.bf-primary:hover {
  background: #1765cc;
}

.bf-secondary {
  border: 1px solid #dadce0;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: #ffffff;
  color: #5f6368;
}

.bf-secondary:hover {
  background: #f1f3f4;
  color: #202124;
}

.bf-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.bf-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.bf-tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bf-tool-btn {
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #5f6368;
  border-radius: 4px;
  min-width: 40px;
  height: 32px;
  padding: 0 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 12px;
}

.bf-tool-btn:hover,
.bf-tool-btn.active {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #174ea6;
}

.bf-select {
  border: 1px solid #dadce0;
  background: #ffffff;
  color: #202124;
  border-radius: 4px;
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
}

.bf-diagram {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #ffffff;
}

.bf-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.bf-link {
  fill: none;
  stroke-width: 2.5;
  stroke-opacity: 0.7;
}

.bf-node-rect {
  fill: #fafafa;
}

.bf-node-text {
  fill: #202124;
  font-size: 14px;
  font-weight: 500;
}

.bf-op-circle {
  fill: #ffffff;
  stroke: #dadce0;
  stroke-width: 2;
}

.bf-op-circle.op-multiply {
  fill: #fce8e6;
  stroke: #ea4335;
}

.bf-op-circle.op-plus {
  fill: #e6f4ea;
  stroke: #34a853;
}

.bf-op-circle.op-minus {
  fill: #fef7e0;
  stroke: #f9ab00;
}

.bf-op-circle.op-divide {
  fill: #e8f0fe;
  stroke: #1a73e8;
}

.bf-op-circle.op-default {
  fill: #ffffff;
  stroke: #dadce0;
}

.bf-op-text {
  fill: #202124;
  font-size: 14px;
  font-weight: 800;
}

.bf-diagram-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #9aa0a6;
  font-size: 14px;
  pointer-events: none;
}

@media (max-width: 900px) {
  .bf-canvas {
    flex-direction: column;
  }
  .bf-sidebar {
    width: 100%;
    max-height: 42vh;
    border-right: none;
    border-bottom: 1px solid #dadce0;
  }
}
</style>

