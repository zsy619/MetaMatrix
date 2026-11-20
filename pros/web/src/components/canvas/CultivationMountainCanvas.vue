<script setup lang="ts">
/**
 * 业务公式修炼爬山画布。
 *
 * 图形按参考图重排成六列矩阵：顶排 L1–L6 段位，中间一条由蓝到紫的
 * 「能力段位」箭头，箭头下是段位名与一句话说明；再下面是「常见问题」一行，
 * 每列一个问题标题加若干问题盒（L6 是「最佳实践」大盒）；最底下一条是
 * 「提升路径」的四段箭头条。
 *
 * 交互：点任意一列打开该级详情（说明 / 常见问题 / 提升路径 / 标记我的等级），
 * 工具栏可做六题能力自评，结果直接写到当前等级。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { CultivationMountainDocumentJSON, CultivationLevel } from '../../types/canvas'
import { isCultivationMountainDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  CM_VIEW,
  CM_GUTTER,
  CM_COL_WIDTH,
  CM_ROWS,
  CM_COLORS,
  CM_PATH_STAGES,
  CM_STAGE_META,
  cmColumnLeft,
  cmColumnCenter,
} from './cultivationMountainLayout'

const props = defineProps<{ doc: CultivationMountainDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const selectedLevel = ref<CultivationLevel | null>(null)
const showAssessment = ref(false)
const currentQuestionIndex = ref(0)
const assessmentAnswers = ref<number[]>([])
const showResult = ref(false)
const resultLevel = ref(0)

const assessmentQuestions = [
  {
    question: '你在工作中是否经常思考"为什么要这样做"？',
    options: [
      { text: '很少，主要是执行任务', score: 1 },
      { text: '偶尔会想，但没有系统思考', score: 2 },
      { text: '经常思考，并尝试总结规律', score: 3 },
    ],
  },
  {
    question: '你是否能够用公式来描述你的业务流程？',
    options: [
      { text: '不能，没有想过这个问题', score: 1 },
      { text: '有简单的想法，但不完整', score: 2 },
      { text: '有基本的公式框架', score: 3 },
      { text: '有多层细致的完备公式', score: 4 },
    ],
  },
  {
    question: '你的业务公式覆盖了多少维度？',
    options: [
      { text: '还没有公式', score: 1 },
      { text: '单一维度', score: 2 },
      { text: '2-3个维度', score: 3 },
      { text: '多维度全面覆盖', score: 4 },
    ],
  },
  {
    question: '你是否能基于公式持续产生新的业务假设？',
    options: [
      { text: '不能，没有公式基础', score: 1 },
      { text: '偶尔有零散想法', score: 2 },
      { text: '可以产生一些假设', score: 3 },
      { text: '能持续产生大量高质量假设', score: 5 },
    ],
  },
  {
    question: '你的假设是否经过验证并持续迭代？',
    options: [
      { text: '没有假设', score: 1 },
      { text: '有假设但未验证', score: 2 },
      { text: '部分验证，偶尔迭代', score: 3 },
      { text: '持续验证和快速迭代', score: 5 },
    ],
  },
  {
    question: '你在行业中的创新地位如何？',
    options: [
      { text: '跟随者', score: 1 },
      { text: '有一些创新尝试', score: 3 },
      { text: '经常创新，有一定影响力', score: 4 },
      { text: '行业创新领导者', score: 6 },
    ],
  },
]

/* ------------------------------------------------------------------ *
 * 矩阵数据
 * ------------------------------------------------------------------ */

const levels = computed(() =>
  [...props.doc.levels].sort((a, b) => a.level - b.level),
)

/** 阶段分组：入门(L1-L2) / 进阶(L3-L4) / 高阶(L5-L6)，范围由数据的 stage 决定 */
const stageGroups = computed(() => {
  const out: { key: string; label: string; color: string; from: number; to: number; cx: number }[] = []
  for (const s of CM_STAGE_META) {
    const inStage = levels.value.filter((l) => l.stage === s.key)
    if (!inStage.length) continue
    const from = inStage[0]!.level
    const to = inStage[inStage.length - 1]!.level
    out.push({
      key: s.key,
      label: s.label,
      color: s.color,
      from,
      to,
      cx: (cmColumnLeft(from) + cmColumnLeft(to + 1)) / 2,
    })
  }
  return out
})

/** 级间虚线（每两列之间一条） */
const separators = computed(() =>
  levels.value.slice(0, -1).map((l) => ({ x: cmColumnLeft(l.level + 1), color: CM_COLORS.sep })),
)

/** 能力段位箭头的渐变停靠点：直接用六级的颜色 */
const levelGradientStops = computed(() =>
  levels.value.map((l, i) => ({
    offset: `${(i / Math.max(levels.value.length - 1, 1)) * 100}%`,
    color: l.color,
  })),
)

/** 提升路径四段 */
const pathStages = computed(() =>
  CM_PATH_STAGES.map((s) => ({
    ...s,
    x: cmColumnLeft(s.from),
    w: cmColumnLeft(s.to + 1) - cmColumnLeft(s.from),
  })),
)

const currentLevelData = computed(() =>
  props.doc.currentLevel
    ? levels.value.find((l) => l.level === props.doc.currentLevel) || null
    : null,
)

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

function selectLevel(level: CultivationLevel) {
  selectedLevel.value = level
}

function setMyLevel() {
  if (!selectedLevel.value) return
  documentStore.mutateCanvas((doc) => {
    if (!isCultivationMountainDoc(doc)) return
    doc.currentLevel = selectedLevel.value!.level
  })
  selectedLevel.value = null
}

function startAssessment() {
  showAssessment.value = true
  currentQuestionIndex.value = 0
  assessmentAnswers.value = []
  showResult.value = false
}

function selectOption(score: number) {
  assessmentAnswers.value.push(score)
  if (currentQuestionIndex.value < assessmentQuestions.length - 1) {
    currentQuestionIndex.value++
  } else {
    calculateResult()
  }
}

function calculateResult() {
  const total = assessmentAnswers.value.reduce((a, b) => a + b, 0)
  const avg = total / assessmentAnswers.value.length

  if (avg < 1.5) resultLevel.value = 1
  else if (avg < 2.2) resultLevel.value = 2
  else if (avg < 3.0) resultLevel.value = 3
  else if (avg < 3.8) resultLevel.value = 4
  else if (avg < 4.5) resultLevel.value = 5
  else resultLevel.value = 6

  showResult.value = true
}

function confirmResult() {
  documentStore.mutateCanvas((doc) => {
    if (!isCultivationMountainDoc(doc)) return
    doc.currentLevel = resultLevel.value
    doc.assessmentAnswers = [...assessmentAnswers.value]
  })
  showAssessment.value = false
}

function resetProgress() {
  documentStore.mutateCanvas((doc) => {
    if (!isCultivationMountainDoc(doc)) return
    doc.currentLevel = 0
    doc.assessmentAnswers = []
  })
  selectedLevel.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (selectedLevel.value) selectedLevel.value = null
  else if (showAssessment.value) showAssessment.value = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="cm-canvas" :style="chrome" aria-label="业务公式修炼爬山画布">
    <div class="cm-inner">
      <header class="cm-title-bar">
        <h1>{{ doc.title }}</h1>
        <div class="cm-toolbar">
          <button type="button" class="cm-btn cm-btn--primary" @click="startAssessment">能力自评</button>
          <button
            type="button"
            class="cm-btn cm-btn--secondary"
            :disabled="!doc.currentLevel"
            @click="resetProgress"
          >
            重置进度
          </button>
          <span v-if="currentLevelData" class="cm-current">
            当前修炼进度 · <strong>L{{ doc.currentLevel }} {{ currentLevelData.name }}</strong>
          </span>
        </div>
      </header>

      <div class="cm-stage">
        <svg
          class="cm-svg"
          :viewBox="`0 0 ${CM_VIEW.w} ${CM_VIEW.h}`"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="六级能力段位矩阵图"
        >
          <defs>
            <linearGradient id="cm-level-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop
                v-for="(stop, i) in levelGradientStops"
                :key="`stop-${i}`"
                :offset="stop.offset"
                :stop-color="stop.color"
              />
            </linearGradient>
          </defs>

          <!-- 当前等级高亮带 -->
          <rect
            v-if="currentLevelData"
            class="cm-current-band"
            :x="cmColumnLeft(currentLevelData.level)"
            y="16"
            :width="CM_COL_WIDTH"
            :height="CM_ROWS.pathTop - 24"
            :fill="currentLevelData.color"
            opacity="0.07"
          />

          <!-- 级间虚线 -->
          <line
            v-for="(sep, i) in separators"
            :key="`sep-${i}`"
            class="cm-sep"
            :x1="sep.x"
            y1="18"
            :x2="sep.x"
            :y2="CM_ROWS.pathTop - 18"
            :stroke="sep.color"
            stroke-width="1.2"
            stroke-dasharray="4 5"
          />

          <!-- 阶段标签：入门 / 进阶 / 高阶 -->
          <g v-for="stage in stageGroups" :key="`stage-${stage.key}`" class="cm-stage-label">
            <text
              :x="stage.cx"
              :y="CM_ROWS.stage"
              text-anchor="middle"
              :fill="stage.color"
            >
              {{ stage.label }}
            </text>
          </g>

          <!-- 能力段位箭头 -->
          <g class="cm-arrow">
            <rect
              :x="CM_GUTTER"
              :y="CM_ROWS.arrowY"
              :width="CM_VIEW.w - CM_GUTTER - 26"
              :height="CM_ROWS.arrowH"
              fill="url(#cm-level-grad)"
            />
            <polygon
              :points="`${CM_VIEW.w - 26},${CM_ROWS.arrowY - 4} ${CM_VIEW.w},${CM_ROWS.arrowY + CM_ROWS.arrowH / 2} ${CM_VIEW.w - 26},${CM_ROWS.arrowY + CM_ROWS.arrowH + 4}`"
              :fill="levels[levels.length - 1]!.color"
            />
          </g>

          <!-- 六级能力列 -->
          <g
            v-for="level in levels"
            :key="`col-${level.level}`"
            class="cm-column"
            role="button"
            tabindex="0"
            :aria-label="`查看 L${level.level} ${level.name}`"
            @click="selectLevel(level)"
            @keydown.enter.prevent="selectLevel(level)"
            @keydown.space.prevent="selectLevel(level)"
          >
            <title>L{{ level.level }} {{ level.name }}——点击查看详情</title>

            <!-- L 标签 -->
            <text
              class="cm-level-label"
              :x="cmColumnCenter(level.level)"
              :y="CM_ROWS.level"
              text-anchor="middle"
              :fill="level.color"
            >
              L{{ level.level }}
            </text>

            <!-- 「你在这里」标记 -->
            <g v-if="doc.currentLevel === level.level" class="cm-here">
              <rect
                :x="cmColumnCenter(level.level) - 46"
                :y="CM_ROWS.hereTop"
                width="92"
                :height="CM_ROWS.hereH"
                rx="12"
                :fill="level.color"
              />
              <text
                :x="cmColumnCenter(level.level)"
                :y="CM_ROWS.hereTop + CM_ROWS.hereH / 2 + 5"
                text-anchor="middle"
                fill="#fff"
                font-size="13"
                font-weight="700"
              >
                你在这里
              </text>
            </g>

            <!-- 段位名 + 副标题 -->
            <text
              class="cm-level-name"
              :x="cmColumnCenter(level.level)"
              :y="CM_ROWS.name"
              text-anchor="middle"
              :fill="level.color"
            >
              {{ level.name }}
            </text>
            <text
              class="cm-level-subtitle"
              :x="cmColumnCenter(level.level)"
              :y="CM_ROWS.subtitle"
              text-anchor="middle"
              :fill="CM_COLORS.desc"
            >
              {{ level.subtitle }}
            </text>

            <!-- 常见问题 -->
            <text
              class="cm-problem-title"
              :x="cmColumnCenter(level.level)"
              :y="CM_ROWS.problem"
              text-anchor="middle"
              :fill="level.color"
            >
              {{ level.problem }}
            </text>
            <g v-if="level.problems.length">
              <g
                v-for="(p, i) in level.problems"
                :key="`p-${level.level}-${i}`"
              >
                <rect
                  class="cm-problem-box"
                  :x="cmColumnLeft(level.level) + 22"
                  :y="CM_ROWS.boxTop + i * CM_ROWS.boxStep"
                  :width="CM_COL_WIDTH - 44"
                  :height="CM_ROWS.boxH"
                  rx="6"
                  fill="#fff"
                  :stroke="level.color"
                  stroke-opacity="0.35"
                  stroke-width="1.2"
                />
                <text
                  class="cm-problem-text"
                  :x="cmColumnCenter(level.level)"
                  :y="CM_ROWS.boxTop + i * CM_ROWS.boxStep + CM_ROWS.boxH / 2 + 5"
                  text-anchor="middle"
                  :fill="CM_COLORS.problem"
                >
                  {{ p }}
                </text>
              </g>
            </g>
            <!-- L6：最佳实践大盒 -->
            <g v-else>
              <rect
                class="cm-problem-box"
                :x="cmColumnLeft(level.level) + 22"
                :y="CM_ROWS.boxTop"
                :width="CM_COL_WIDTH - 44"
                :height="CM_ROWS.boxH * 2 + CM_ROWS.boxStep"
                rx="8"
                fill="#fff"
                :stroke="level.color"
                stroke-opacity="0.35"
                stroke-width="1.2"
              />
              <text
                class="cm-best-text"
                :x="cmColumnCenter(level.level)"
                :y="CM_ROWS.boxTop + CM_ROWS.boxH + CM_ROWS.boxStep / 2"
                text-anchor="middle"
                :fill="CM_COLORS.ink"
              >
                {{ level.problem }}
              </text>
            </g>
          </g>

          <!-- 提升路径 -->
          <g class="cm-path-bar">
            <g v-for="(seg, i) in pathStages" :key="`seg-${i}`">
              <path
                :d="`M ${seg.x} ${CM_ROWS.pathTop} L ${seg.x + seg.w - 18} ${CM_ROWS.pathTop} L ${seg.x + seg.w} ${CM_ROWS.pathTop + CM_ROWS.pathH / 2} L ${seg.x + seg.w - 18} ${CM_ROWS.pathTop + CM_ROWS.pathH} L ${seg.x} ${CM_ROWS.pathTop + CM_ROWS.pathH} Z`"
                :fill="seg.color"
                fill-opacity="0.16"
              />
              <text
                class="cm-path-text"
                :x="seg.x + seg.w / 2"
                :y="CM_ROWS.pathTop + CM_ROWS.pathH / 2 + 6"
                text-anchor="middle"
                :fill="seg.color"
              >
                {{ seg.label }}
              </text>
            </g>
          </g>

          <!-- 左侧竖排行标题 -->
          <g class="cm-row-title">
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.arrowY + CM_ROWS.arrowH / 2 - 27" text-anchor="middle">能</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.arrowY + CM_ROWS.arrowH / 2 - 9" text-anchor="middle">力</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.arrowY + CM_ROWS.arrowH / 2 + 9" text-anchor="middle">段</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.arrowY + CM_ROWS.arrowH / 2 + 27" text-anchor="middle">位</text>

            <text :x="CM_GUTTER / 2" :y="CM_ROWS.boxTop + 30" text-anchor="middle">常</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.boxTop + 48" text-anchor="middle">见</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.boxTop + 66" text-anchor="middle">问</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.boxTop + 84" text-anchor="middle">题</text>

            <text :x="CM_GUTTER / 2" :y="CM_ROWS.pathTop + 0" text-anchor="middle">提</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.pathTop + 18" text-anchor="middle">升</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.pathTop + 36" text-anchor="middle">路</text>
            <text :x="CM_GUTTER / 2" :y="CM_ROWS.pathTop + 54" text-anchor="middle">径</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- 等级详情弹窗 -->
    <div
      v-if="selectedLevel"
      class="cm-modal-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="`L${selectedLevel.level} ${selectedLevel.name}`"
      @click.self="selectedLevel = null"
    >
      <div class="cm-modal">
        <div class="cm-modal-header">
          <div class="cm-modal-heading">
            <span class="cm-detail-badge" :style="{ background: selectedLevel.color }">
              L{{ selectedLevel.level }}
            </span>
            <div>
              <h3>{{ selectedLevel.name }}</h3>
              <p>{{ selectedLevel.subtitle }}</p>
            </div>
          </div>
          <button
            type="button"
            class="cm-modal-close"
            aria-label="关闭"
            @click="selectedLevel = null"
          >
            ×
          </button>
        </div>

        <div class="cm-modal-body">
          <p class="cm-detail-desc">{{ selectedLevel.description }}</p>
          <div class="cm-detail-content">
            <div class="cm-detail-section">
              <h4>常见问题</h4>
              <ul v-if="selectedLevel.problems.length" class="cm-chip-list">
                <li v-for="p in selectedLevel.problems" :key="p" class="cm-chip">
                  {{ p }}
                </li>
              </ul>
              <p v-else class="cm-best-text-inline">✓ 已达成最佳实践</p>
            </div>
            <div class="cm-detail-section">
              <h4>提升路径</h4>
              <ul class="cm-chip-list">
                <li v-for="p in selectedLevel.paths" :key="p" class="cm-chip cm-chip--path">
                  {{ p }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="cm-modal-footer">
          <button type="button" class="cm-btn cm-btn--secondary" @click="selectedLevel = null">
            关闭
          </button>
          <button type="button" class="cm-btn cm-btn--primary" @click="setMyLevel">
            标记我的等级
          </button>
        </div>
      </div>
    </div>

    <!-- 自评弹窗 -->
    <div
      v-if="showAssessment"
      class="cm-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="能力自评"
      @click.self="showAssessment = false"
    >
      <div class="cm-modal">
        <div class="cm-modal-header">
          <h3>
            {{ showResult ? '自评结果' : `问题 ${currentQuestionIndex + 1} / ${assessmentQuestions.length}` }}
          </h3>
          <button
            type="button"
            class="cm-modal-close"
            aria-label="关闭"
            @click="showAssessment = false"
          >
            ×
          </button>
        </div>

        <div v-if="!showResult" class="cm-modal-body">
          <p class="cm-question">{{ assessmentQuestions[currentQuestionIndex].question }}</p>
          <div class="cm-options">
            <button
              v-for="(opt, i) in assessmentQuestions[currentQuestionIndex].options"
              :key="i"
              type="button"
              class="cm-option"
              @click="selectOption(opt.score)"
            >
              {{ opt.text }}
            </button>
          </div>
        </div>

        <div v-else class="cm-modal-body cm-result">
          <div class="cm-result-badge" :style="{ background: levels[resultLevel - 1]!.color }">
            L{{ resultLevel }}
          </div>
          <h4>{{ levels[resultLevel - 1]!.name }}</h4>
          <p>{{ levels[resultLevel - 1]!.description }}</p>
          <div class="cm-result-advice">
            <h5>提升建议</h5>
            <ul>
              <li v-for="p in levels[resultLevel - 1]!.paths" :key="p">{{ p }}</li>
            </ul>
          </div>
        </div>

        <div v-if="showResult" class="cm-modal-footer">
          <button type="button" class="cm-btn cm-btn--secondary" @click="startAssessment">
            重新测评
          </button>
          <button type="button" class="cm-btn cm-btn--primary" @click="confirmResult">
            确认我的等级
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cm-canvas {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  min-height: 0;
  padding: 12px 14px 16px;
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
.cm-inner {
  margin: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.cm-title-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 0 4px 8px;
}

.cm-title-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.cm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cm-current {
  font-size: 13px;
  color: var(--cv-muted, #5f6368);
}

.cm-current strong {
  color: var(--cv-ink-strong, #202124);
}

.cm-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.cm-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cm-btn--primary {
  background: #202124;
  color: #fff;
}

.cm-btn--primary:hover:not(:disabled) {
  background: #3c4043;
}

.cm-btn--secondary {
  background: #f0f0f0;
  color: #666;
}

.cm-btn--secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

/* ---------------- 矩阵 ---------------- */
.cm-stage {
  flex: none;
  width: min(100%, 1400px);
  margin: 0 auto;
  aspect-ratio: 1560 / 580;
}

.cm-svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  overflow: visible;
}

.cm-column {
  cursor: pointer;
  outline: none;
}

.cm-level-label {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: 0.02em;
  transition: fill 0.15s ease;
}

.cm-column:hover .cm-level-label,
.cm-column:focus-visible .cm-level-label {
  fill: #e8823c;
}

.cm-level-name {
  font-size: 24px;
  font-weight: 800;
}

.cm-level-subtitle {
  font-size: 15px;
  font-weight: 500;
}

.cm-problem-title {
  font-size: 21px;
  font-weight: 800;
}

.cm-problem-text {
  font-size: 15px;
  font-weight: 500;
}

.cm-best-text {
  font-size: 20px;
  font-weight: 800;
}

.cm-stage-label text {
  font-size: 19px;
  font-weight: 800;
}

.cm-row-title text {
  font-size: 18px;
  font-weight: 800;
  fill: #1f1f1f;
}

.cm-path-text {
  font-size: 17px;
  font-weight: 800;
}

/* ---------------- 弹窗 ---------------- */
.cm-modal-overlay {
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

.cm-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 620px;
  max-height: 86vh;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.cm-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.cm-modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.cm-modal-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cm-modal-heading p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--cv-muted, #5f6368);
}

.cm-detail-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
}

.cm-modal-close {
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

.cm-modal-close:hover {
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
}

.cm-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
}

.cm-detail-desc {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--cv-muted, #5f6368);
}

.cm-detail-section {
  margin-bottom: 16px;
}

.cm-detail-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--cv-muted, #5f6368);
}

.cm-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cm-chip {
  padding: 6px 12px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 8px;
  background: #f8f8f8;
  font-size: 13px;
  color: #3c4043;
}

.cm-chip--path {
  border-color: #fdeee0;
  background: #fdf6ee;
  color: #b35c12;
}

.cm-best-text-inline {
  margin: 0;
  font-size: 14px;
  color: #2e9e5b;
}

.cm-modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--cv-frame, #ececec);
}

/* 自评 */
.cm-question {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}

.cm-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cm-option {
  padding: 11px 14px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 10px;
  background: #fff;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.cm-option:hover {
  background: var(--cv-hover-wash, #e8f1fa);
  border-color: var(--cv-focus, #1c4c7c);
}

.cm-result {
  text-align: center;
}

.cm-result-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
}

.cm-result h4 {
  margin: 10px 0 4px;
  font-size: 20px;
}

.cm-result p {
  margin: 0 0 14px;
  font-size: 14px;
  color: var(--cv-muted, #5f6368);
}

.cm-result-advice {
  padding: 14px;
  border-radius: 10px;
  background: #f8f8f8;
  text-align: left;
}

.cm-result-advice h5 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--cv-muted, #5f6368);
}

.cm-result-advice ul {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.8;
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 900px) {
  .cm-title-bar {
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  /* 窄屏：矩阵缩到手机宽度后字只有几像素，改成固定最小宽度 + 横向滚动 */
  .cm-stage {
    width: 100%;
    aspect-ratio: auto;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .cm-svg {
    width: 1100px;
    height: auto;
    aspect-ratio: 1560 / 580;
  }
}
</style>
