<script setup lang="ts">
import { computed } from 'vue'
import type {
  YModelBlock,
  YModelBlockId,
  YModelDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: YModelDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<YModelBlockId, YModelBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  // 旧文档未迁移时兜底
  if (!map.has('scope') && map.has('problem')) {
    map.set('scope', map.get('problem')!)
  }
  return map
})

function block(id: YModelBlockId): YModelBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const centerTitle = computed(
  () => props.doc.center.title || '我的认知',
)

const centerSubtitle = computed(
  () => props.doc.center.subtitle || '知行合一的因果规律',
)

const labels = computed(() => {
  const l = props.doc.labels
  return {
    theory: l.theory || '理论',
    facts: l.facts || '事实',
    anchor: l.anchor || l.problem || '解决真正问题',
    toolsPrefix: l.toolsPrefix || '∴ 配套的组织和管理工具：',
    step1: l.step1 && l.step1.includes('范围') ? l.step1 : 'Step 1 范围',
    step2: l.step2 || 'Step 2 目标',
    step3: l.step3 || 'Step 3 框架',
    step4: l.step4 && l.step4.includes('预判') ? l.step4 : 'Step4 预判',
    step5: l.step5 || 'Step 5 配套',
  }
})
</script>

<template>
  <div class="y-model-canvas" :style="{ backgroundColor: bgColor }">
    <div class="ym-layout">
      <div class="ym-main">
        <!-- 上左：理论 -->
        <section class="ym-theory">
          <h2 class="zone-title">{{ labels.theory }}</h2>
          <div class="theory-blocks">
            <YModelBlockCard
              v-if="block('theory_existing')"
              :block="block('theory_existing')!"
            />
            <YModelBlockCard
              v-if="block('theory_build')"
              :block="block('theory_build')!"
            />
          </div>
        </section>

        <!-- 中柱：完整 Y + 标题 + 锚点（跨上下两行） -->
        <div class="ym-y-col" aria-hidden="false">
          <svg
            class="ym-y-svg"
            viewBox="0 0 240 520"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="ymArrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,1 L7,4 L0,7 Z" fill="#9aa0a6" />
              </marker>
              <marker
                id="ymArrowRev"
                markerWidth="8"
                markerHeight="8"
                refX="1"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M7,1 L0,4 L7,7 Z" fill="#9aa0a6" />
              </marker>
            </defs>
            <!-- 左上臂 -->
            <line
              x1="28"
              y1="48"
              x2="120"
              y2="200"
              stroke="#9aa0a6"
              stroke-width="3"
              stroke-linecap="round"
              marker-start="url(#ymArrowRev)"
              marker-end="url(#ymArrow)"
            />
            <!-- 右上臂 -->
            <line
              x1="212"
              y1="48"
              x2="120"
              y2="200"
              stroke="#9aa0a6"
              stroke-width="3"
              stroke-linecap="round"
              marker-start="url(#ymArrowRev)"
              marker-end="url(#ymArrow)"
            />
            <!-- 竖脊 -->
            <line
              x1="120"
              y1="200"
              x2="120"
              y2="470"
              stroke="#9aa0a6"
              stroke-width="3"
              stroke-linecap="round"
              marker-end="url(#ymArrow)"
            />
          </svg>

          <span class="step-tag step-tag-red step4-tag">{{
            labels.step4
          }}</span>

          <div class="ym-y-hub">
            <h2 class="hub-title">{{ centerTitle }}</h2>
            <p class="hub-subtitle">{{ centerSubtitle }}</p>
          </div>

          <p class="ym-anchor">{{ labels.anchor }}</p>
        </div>

        <!-- 上右：事实 -->
        <section class="ym-facts">
          <h2 class="zone-title zone-title-right">{{ labels.facts }}</h2>
          <div class="facts-blocks">
            <YModelBlockCard
              v-if="block('facts_hypothesis')"
              :block="block('facts_hypothesis')!"
            />
            <YModelBlockCard
              v-if="block('facts_analysis')"
              :block="block('facts_analysis')!"
            />
          </div>
        </section>

        <!-- 中左：Step1 范围 -->
        <section class="ym-scope">
          <span class="step-tag step-tag-red">{{ labels.step1 }}</span>
          <div class="scope-body">
            <YModelBlockCard
              v-if="block('scope')"
              :block="block('scope')!"
            />
          </div>
        </section>

        <!-- 中右：Step3 框架 + Step2 目标 -->
        <section class="ym-right-stack">
          <div class="stack-item">
            <span class="step-tag step-tag-red">{{ labels.step3 }}</span>
            <YModelBlockCard
              v-if="block('cognition_cause')"
              :block="block('cognition_cause')!"
            />
          </div>
          <div class="stack-item">
            <span class="step-tag step-tag-red">{{ labels.step2 }}</span>
            <YModelBlockCard
              v-if="block('cognition_effect')"
              :block="block('cognition_effect')!"
            />
          </div>
        </section>
      </div>

      <!-- 底栏 Step5 配套 -->
      <section class="ym-tools">
        <span class="step-tag step-tag-red tools-step">{{
          labels.step5
        }}</span>
        <div class="tools-bar">
          <span class="tools-prefix">{{ labels.toolsPrefix }}</span>
          <div class="tools-block-wrap">
            <YModelBlockCard
              v-if="block('tools')"
              :block="block('tools')!"
              compact
              hide-title
            />
          </div>
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
  padding: clamp(10px, 1.4vw, 18px) clamp(12px, 1.8vw, 22px)
    clamp(10px, 1.2vw, 16px);
}

.ym-layout {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1.2vw, 14px);
  box-sizing: border-box;
}

/* ===== 主体：三列 × 两行，中柱跨行画完整 Y ===== */
.ym-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns:
    minmax(0, 1.05fr)
    minmax(200px, 0.72fr)
    minmax(0, 1.05fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1.25fr);
  grid-template-areas:
    'theory ycol facts'
    'scope  ycol right';
  gap: clamp(10px, 1.3vw, 16px) clamp(8px, 1.1vw, 14px);
  align-items: stretch;
}

.ym-theory {
  grid-area: theory;
}

.ym-facts {
  grid-area: facts;
}

.ym-y-col {
  grid-area: ycol;
}

.ym-scope {
  grid-area: scope;
}

.ym-right-stack {
  grid-area: right;
}

.ym-theory,
.ym-facts {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 8px;
  z-index: 2;
}

.zone-title {
  margin: 0;
  font-size: clamp(18px, 2.2vw, 26px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.06em;
  line-height: 1.2;
  flex-shrink: 0;
}

.zone-title-right {
  text-align: right;
}

.theory-blocks,
.facts-blocks {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.theory-blocks :deep(.ym-block),
.facts-blocks :deep(.ym-block) {
  min-height: 120px;
  background: rgba(255, 255, 255, 0.9);
}

/* ===== 中柱 Y ===== */
.ym-y-col {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 4px;
  z-index: 1;
  pointer-events: none;
}

.ym-y-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.85;
}

.step4-tag {
  position: relative;
  z-index: 2;
  margin-top: 2%;
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
  padding: 8px 6px;
  /* 白底衬在 Y 交叉点上，避免字被线割开 */
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.92) 18%,
    rgba(255, 255, 255, 0.92) 82%,
    rgba(255, 255, 255, 0) 100%
  );
}

.hub-title {
  margin: 0;
  font-size: clamp(26px, 3.4vw, 40px);
  font-weight: 900;
  color: #202124;
  letter-spacing: 0.08em;
  line-height: 1.15;
}

.hub-subtitle {
  margin: 0;
  font-size: clamp(12px, 1.35vw, 15px);
  font-weight: 700;
  color: #e53935;
  letter-spacing: 0.04em;
  line-height: 1.35;
}

.ym-anchor {
  position: relative;
  z-index: 2;
  margin: 0 0 2%;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-align: center;
}

/* 中柱内可点区域：无（装饰层）；侧栏卡片自行接收点击 */
.ym-scope,
.ym-right-stack,
.ym-theory,
.ym-facts,
.ym-tools {
  pointer-events: auto;
}

/* ===== Step 红标签 ===== */
.step-tag {
  display: inline-flex;
  align-items: center;
  font-size: clamp(11px, 1.2vw, 13px);
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  line-height: 1.35;
  flex-shrink: 0;
}

.step-tag-red {
  color: #e53935;
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

/* ===== Step1 范围 ===== */
.ym-scope {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  z-index: 2;
}

.scope-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.scope-body :deep(.ym-block) {
  flex: 1;
  min-height: 160px;
  background: rgba(255, 255, 255, 0.92);
}

/* ===== 右栏：框架 / 目标 ===== */
.ym-right-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  z-index: 2;
}

.stack-item {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stack-item :deep(.ym-block) {
  flex: 1;
  min-height: 100px;
  background: rgba(255, 255, 255, 0.92);
}

/* ===== Step5 底栏 ===== */
.ym-tools {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 12px;
  min-height: 0;
  z-index: 2;
}

.tools-step {
  flex-shrink: 0;
  align-self: center;
}

.tools-bar {
  flex: 1;
  min-width: 0;
  min-height: 72px;
  display: flex;
  align-items: stretch;
  gap: 14px;
  padding: 10px 16px;
  background: #eceff1;
  border-radius: 4px;
  border: 1.5px dashed #9aa0a6;
  box-sizing: border-box;
}

.tools-prefix {
  flex-shrink: 0;
  align-self: center;
  font-size: clamp(12px, 1.35vw, 14px);
  font-weight: 700;
  color: #3c4043;
  white-space: nowrap;
}

.tools-block-wrap {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  display: flex;
  flex-direction: column;
}

.tools-block-wrap :deep(.ym-block) {
  flex: 1;
  min-height: 52px;
  background: rgba(255, 255, 255, 0.55);
  border-color: #b0b4b8;
}

/* ===== 宽屏加强 ===== */
@media (min-width: 1100px) {
  .ym-main {
    grid-template-columns:
      minmax(0, 1.08fr)
      minmax(220px, 0.68fr)
      minmax(0, 1.08fr);
  }

  .theory-blocks :deep(.ym-block),
  .facts-blocks :deep(.ym-block) {
    min-height: 140px;
  }

  .scope-body :deep(.ym-block) {
    min-height: 200px;
  }

  .stack-item :deep(.ym-block) {
    min-height: 110px;
  }

  .tools-bar {
    min-height: 80px;
  }
}

/* ===== 窄屏：简化 Y，结构保留 ===== */
@media (max-width: 960px) {
  .y-model-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ym-layout {
    height: auto;
    min-height: 100%;
  }

  .ym-main {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto auto;
    grid-template-areas:
      'theory facts'
      'ycol ycol'
      'scope right'
      'scope right';
    flex: none;
  }

  .ym-y-col {
    min-height: 160px;
    padding: 12px 8px;
  }

  .ym-y-svg {
    opacity: 0.35;
  }

  .hub-title {
    font-size: clamp(22px, 5vw, 28px);
  }

  .scope-body :deep(.ym-block) {
    min-height: 140px;
  }
}

@media (max-width: 640px) {
  .ym-main {
    grid-template-columns: 1fr;
    grid-template-areas:
      'theory'
      'facts'
      'ycol'
      'scope'
      'right';
  }

  .theory-blocks,
  .facts-blocks {
    grid-template-columns: 1fr;
  }

  .zone-title-right {
    text-align: left;
  }

  .tools-bar {
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  .tools-prefix {
    white-space: normal;
  }
}
</style>
