<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  YModelBlock,
  YModelBlockId,
  YModelDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: YModelDocumentJSON
}>()

const documentStore = useDocumentStore()

const byId = computed(() => {
  const map = new Map<YModelBlockId, YModelBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  if (!map.has('scope') && map.has('problem')) {
    map.set('scope', map.get('problem')!)
  }
  return map
})

function block(id: YModelBlockId): YModelBlock | undefined {
  return byId.value.get(id)
}

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

/** Step2：我的 ____ 认知 */
const centerPrefix = computed(() => props.doc.center.prefix || '我的')
const centerSuffix = computed(() => props.doc.center.suffix || '认知')
const centerBlank = computed({
  get: () => props.doc.center.blank ?? '',
  set: (v: string) => {
    if (!props.doc.center) return
    props.doc.center.blank = v
    documentStore.markDirty()
  },
})

const labels = computed(() => {
  const l = props.doc.labels
  return {
    theory: l.theory || '理论',
    facts: l.facts || '事实',
    anchor: l.anchor || l.problem || '解决真正问题',
    step1: l.step1 || 'Step1',
    step2: l.step2 || 'Step2',
    step3: l.step3 || 'Step3',
    step4: l.step4 || 'Step4',
  }
})
</script>

<template>
  <div class="y-model-canvas" :style="chrome">
    <div class="ym-layout">
      <div class="ym-main">
        <!-- 左外：使用现成模型/规律（近理论臂） -->
        <aside class="ym-left-outer">
          <span class="step-tag step-tag-float">{{ labels.step3 }}</span>
          <YModelBlockCard
            v-if="block('theory_existing')"
            :block="block('theory_existing')!"
          />
        </aside>

        <!-- 中区：Y + 顶中双框 + 理论/事实 + Step2/Step1 -->
        <div class="ym-y-stage">
          <svg
            class="ym-y-svg"
            viewBox="0 0 320 520"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="ymArrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0.8 L6.5,3.5 L0,6.2 Z" fill="#6b645c" />
              </marker>
              <marker
                id="ymArrowRev"
                markerWidth="7"
                markerHeight="7"
                refX="0.5"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M6.5,0.8 L0,3.5 L6.5,6.2 Z" fill="#6b645c" />
              </marker>
            </defs>
            <!-- 左臂 -->
            <line
              x1="48"
              y1="72"
              x2="160"
              y2="220"
              stroke="#6b645c"
              stroke-width="2.4"
              stroke-linecap="round"
              marker-start="url(#ymArrowRev)"
              marker-end="url(#ymArrow)"
            />
            <!-- 右臂 -->
            <line
              x1="272"
              y1="72"
              x2="160"
              y2="220"
              stroke="#6b645c"
              stroke-width="2.4"
              stroke-linecap="round"
              marker-start="url(#ymArrowRev)"
              marker-end="url(#ymArrow)"
            />
            <!-- 竖脊 -->
            <line
              x1="160"
              y1="220"
              x2="160"
              y2="470"
              stroke="#6b645c"
              stroke-width="2.4"
              stroke-linecap="round"
              marker-start="url(#ymArrowRev)"
              marker-end="url(#ymArrow)"
            />
          </svg>

          <!-- 理论 / 事实 节点字 -->
          <h2 class="zone-title zone-theory">{{ labels.theory }}</h2>
          <h2 class="zone-title zone-facts">{{ labels.facts }}</h2>

          <!-- 顶中：自己建模型 | 提出新假设（Y 叉口上方） -->
          <div class="ym-top-mid">
            <YModelBlockCard
              v-if="block('theory_build')"
              :block="block('theory_build')!"
            />
            <YModelBlockCard
              v-if="block('facts_hypothesis')"
              :block="block('facts_hypothesis')!"
            />
          </div>

          <!-- Step2 枢纽 -->
          <div class="ym-y-hub">
            <span class="step-tag">{{ labels.step2 }}</span>
            <div class="hub-title-row" aria-label="我的认知">
              <span class="hub-prefix">{{ centerPrefix }}</span>
              <input
                v-model="centerBlank"
                class="hub-blank"
                type="text"
                maxlength="24"
                placeholder="____"
                aria-label="填写认知领域"
              />
              <span class="hub-suffix">{{ centerSuffix }}</span>
            </div>
          </div>

          <!-- Step1 底端锚点 -->
          <div class="ym-anchor-wrap">
            <span class="step-tag">{{ labels.step1 }}</span>
            <p class="ym-anchor">{{ labels.anchor }}</p>
          </div>
        </div>

        <!-- 右列：定性定量（近事实）+ 理解因/果（认知右侧） -->
        <aside class="ym-right-col">
          <div class="ym-right-top">
            <YModelBlockCard
              v-if="block('facts_analysis')"
              :block="block('facts_analysis')!"
            />
          </div>
          <div class="ym-right-stack">
            <YModelBlockCard
              v-if="block('cognition_cause')"
              :block="block('cognition_cause')!"
            />
            <YModelBlockCard
              v-if="block('cognition_effect')"
              :block="block('cognition_effect')!"
            />
          </div>
        </aside>
      </div>

      <!-- Step4 底栏：整条虚线框即 tools 富文本块 -->
      <section class="ym-tools">
        <span class="step-tag tools-step">{{ labels.step4 }}</span>
        <div class="tools-block-wrap">
          <YModelBlockCard
            v-if="block('tools')"
            :block="block('tools')!"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.y-model-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: clamp(10px, 1.3vw, 16px) clamp(12px, 1.6vw, 20px)
    clamp(8px, 1vw, 12px);
  display: flex;
  flex-direction: column;
}

.ym-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1vw, 12px);
  box-sizing: border-box;
}

.ym-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns:
    minmax(140px, 0.85fr)
    minmax(280px, 1.5fr)
    minmax(160px, 0.95fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(8px, 1.1vw, 14px);
  align-items: stretch;
}

.ym-left-outer,
.ym-right-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2;
  pointer-events: auto;
}

.ym-left-outer {
  padding-top: clamp(8px, 1.5vh, 20px);
}

.step-tag-float {
  align-self: flex-start;
}

.ym-left-outer :deep(.ym-block) {
  flex: 1;
  min-height: 160px;
  background: rgba(255, 255, 255, 0.92);
}

.ym-right-col {
  padding-top: clamp(4px, 1vh, 12px);
}

.ym-right-top {
  flex: 0 1 32%;
  min-height: 110px;
  display: flex;
  flex-direction: column;
}

.ym-right-top :deep(.ym-block) {
  flex: 1;
}

.ym-right-stack {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  margin-top: auto;
  padding-top: 8%;
}

.ym-right-col :deep(.ym-block) {
  min-height: 0;
  background: rgba(255, 255, 255, 0.92);
}

/* ===== 中区 Y ===== */
.ym-y-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

.ym-y-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.9;
}

.zone-title {
  position: absolute;
  z-index: 2;
  margin: 0;
  font-size: clamp(20px, 2.5vw, 30px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.1em;
  line-height: 1.2;
  pointer-events: none;
}

.zone-theory {
  top: 2%;
  left: 4%;
}

.zone-facts {
  top: 2%;
  right: 4%;
}

.ym-top-mid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: min(100%, 420px);
  margin-top: 8%;
  min-height: 120px;
  max-height: 34%;
  flex: 0 1 auto;
  pointer-events: auto;
}

.ym-top-mid :deep(.ym-block) {
  min-height: 110px;
  background: rgba(255, 255, 255, 0.94);
}

.ym-y-hub {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  margin-top: auto;
  margin-bottom: auto;
  padding: 8px 10px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.95) 18%,
    rgba(255, 255, 255, 0.95) 82%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: auto;
}

.hub-title-row {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.hub-prefix,
.hub-suffix {
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 900;
  color: #202124;
  letter-spacing: 0.08em;
  line-height: 1.15;
}

.hub-blank {
  width: clamp(64px, 9vw, 110px);
  min-width: 56px;
  border: none;
  border-bottom: 1px solid #8a8175;
  background: transparent;
  text-align: center;
  font-size: clamp(18px, 2.4vw, 28px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.2;
  padding: 0 4px 2px;
  outline: none;
}

.hub-blank:focus {
  border-bottom-color: #1a73e8;
}

.hub-blank::placeholder {
  color: #202124;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.55;
}

.ym-anchor-wrap {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0 0 1%;
  pointer-events: none;
}

.ym-anchor {
  margin: 0;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-align: center;
}

.step-tag {
  display: inline-flex;
  align-items: center;
  font-size: clamp(11px, 1.15vw, 13px);
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  line-height: 1.35;
  flex-shrink: 0;
  color: #80868b;
  background: transparent;
  border: none;
  padding: 0;
}

/* Step4 */
.ym-tools {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 12px;
  min-height: 0;
  z-index: 2;
  pointer-events: auto;
  padding: 8px 4px 4px;
  margin: 0 -4px -4px;
  background: #eceff1;
  border-radius: 2px;
}

.tools-step {
  flex-shrink: 0;
  align-self: center;
  padding-left: 8px;
  color: #5f6368;
}

.tools-block-wrap {
  flex: 1;
  min-width: 0;
  min-height: 72px;
  display: flex;
  flex-direction: column;
  margin: 6px 8px 6px 0;
}

.tools-block-wrap :deep(.ym-block) {
  flex: 1;
  min-height: 72px;
  background: rgba(255, 255, 255, 0.72);
}

@media (min-width: 1100px) {
  .ym-main {
    grid-template-columns:
      minmax(160px, 0.9fr)
      minmax(320px, 1.55fr)
      minmax(180px, 1fr);
  }

  .ym-top-mid {
    min-height: 140px;
  }

  .tools-block-wrap {
    min-height: 80px;
  }
}

@media (max-width: 960px) {
  .y-model-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ym-layout {
    height: auto;
    min-height: 0;
    flex: none;
  }

  .ym-main {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      'left right'
      'stage stage'
      'stage stage';
    flex: none;
  }

  .ym-left-outer {
    grid-area: left;
  }

  .ym-right-col {
    grid-area: right;
  }

  .ym-y-stage {
    grid-area: stage;
    min-height: 360px;
  }

  .ym-right-stack {
    padding-top: 0;
  }
}

@media (max-width: 640px) {
  .ym-main {
    grid-template-columns: 1fr;
    grid-template-areas:
      'left'
      'stage'
      'right';
  }

  .ym-top-mid {
    width: 100%;
    max-height: none;
  }

  .tools-block-wrap {
    min-height: 64px;
  }
}
</style>
