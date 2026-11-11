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
    step1: l.step1 || 'Step1',
    step2: l.step2 || 'Step2',
    step3: l.step3 || 'Step3',
    step4: l.step4 || 'Step4',
  }
})
</script>

<template>
  <div class="y-model-canvas" :style="chrome" aria-label="一堂Y模型">
    <div class="ym-stage">
      <div class="y-mark" aria-hidden="true">
        <span class="y-arm y-arm-left"></span>
        <span class="y-arm y-arm-right"></span>
        <span class="y-stem-line"></span>
      </div>

      <span class="step step-3">{{ labels.step3 }}</span>
      <h2 class="arm arm-theory">{{ labels.theory }}</h2>
      <h2 class="arm arm-facts">{{ labels.facts }}</h2>

      <div class="slot slot-existing">
        <YModelBlockCard v-if="block('theory_existing')" editor="card" :block="block('theory_existing')!" />
      </div>
      <div class="slot slot-build">
        <YModelBlockCard v-if="block('theory_build')" editor="card" :block="block('theory_build')!" />
      </div>
      <div class="slot slot-hypothesis">
        <YModelBlockCard v-if="block('facts_hypothesis')" editor="card" :block="block('facts_hypothesis')!" />
      </div>
      <div class="slot slot-analysis">
        <YModelBlockCard v-if="block('facts_analysis')" editor="card" :block="block('facts_analysis')!" />
      </div>

      <div class="hub">
        <span class="hub-prefix">{{ centerPrefix }}</span>
        <input
          v-model="centerBlank"
          class="hub-blank"
          type="text"
          maxlength="12"
          placeholder="____"
          aria-label="填写认知领域"
        />
        <span class="hub-suffix">{{ centerSuffix }}</span>
      </div>
      <span class="step step-2">{{ labels.step2 }}</span>
      <span class="step step-1">{{ labels.step1 }}</span>

      <div class="slot slot-cause">
        <YModelBlockCard v-if="block('cognition_cause')" editor="card" :block="block('cognition_cause')!" />
      </div>
      <div class="slot slot-effect">
        <YModelBlockCard v-if="block('cognition_effect')" editor="card" :block="block('cognition_effect')!" />
      </div>

      <div class="slot slot-problem">
        <YModelBlockCard v-if="block('scope') || block('problem')" editor="card" :block="(block('scope') || block('problem'))!" />
      </div>
    </div>

    <section class="ym-tools" :aria-label="labels.step4">
      <span class="step">{{ labels.step4 }}</span>
      <div class="slot slot-tools">
        <YModelBlockCard v-if="block('tools')" editor="card" :block="block('tools')!" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.y-model-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 16px 14px;
  color: #202124;
  overflow: auto;
}

.ym-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 720px;
  min-width: 960px;
}

.step {
  position: absolute;
  z-index: 2;
  color: #5f6368;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 650;
  letter-spacing: 0.02em;
}

.step-3 { left: 0.5%; top: 30%; }
.step-2 { left: 14%; top: 46%; }
.step-1 { left: 18%; top: 78%; }

.arm {
  position: absolute;
  z-index: 2;
  margin: 0;
  font-size: clamp(22px, 2.4vw, 32px);
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
}

.arm-theory { left: 24%; top: 12%; }
.arm-facts { left: 64%; top: 12%; }

.y-mark { position: absolute; inset: 0; pointer-events: none; }
.y-arm,
.y-stem-line {
  position: absolute;
  background: transparent;
  border-left: 2px solid #6b645c;
  box-shadow: 7px 0 0 #6b645c;
}
.y-arm { width: 0; height: 26%; top: 13%; left: calc(50% - 4px); transform-origin: bottom center; }
.y-arm-left { transform: rotate(-34deg); }
.y-arm-right { transform: rotate(34deg); }
.y-stem-line { left: calc(50% - 4px); top: 54%; height: 20%; }

.slot {
  position: absolute;
  z-index: 2;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.slot :deep(.ym-block) {
  width: 100%;
  height: 100%;
}

.slot :deep(.ym-block-body) {
  overflow: auto;
}

.slot :deep(.ym-block--card) {
  border-radius: 2px;
  border: 1.5px dashed #b7b1a8;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: none;
}

.slot :deep(.ym-block--card .ym-block-header) {
  min-height: 28px;
  padding: 4px 8px;
  background: transparent;
  color: #8b9096;
}

.slot :deep(.ym-block--card .ym-block-title) {
  color: #8b9096;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
}

.slot :deep(.ym-block--card .pm-max-btn) {
  color: #5f6368;
  background: transparent;
}

.slot :deep(.pa-root:has(.pa-empty)) { display: none; }

.slot-existing { left: 5%; top: 20%; width: 20%; height: 28%; }
.slot-build { left: 36%; top: 0; width: 13%; height: 14%; }
.slot-hypothesis { left: 49.5%; top: 0; width: 13%; height: 14%; }
.slot-analysis { left: 75%; top: 20%; width: 20%; height: 28%; }
.slot-cause { left: 63%; top: 46%; width: 22%; height: 16%; }
.slot-effect { left: 67%; top: 66%; width: 22%; height: 16%; }
.slot-problem { left: 30%; top: 76%; width: 26%; height: 16%; }

.hub {
  position: absolute;
  z-index: 3;
  left: 22%;
  top: 40%;
  width: 42%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}

.hub-prefix,
.hub-suffix {
  font-size: clamp(26px, 3vw, 40px);
  font-weight: 900;
  letter-spacing: 0.04em;
  line-height: 1;
}

.hub-blank {
  pointer-events: auto;
  width: 4.2em;
  border: none;
  border-bottom: 3px solid #c5221f;
  background: transparent;
  text-align: center;
  font-size: clamp(24px, 2.6vw, 36px);
  font-weight: 900;
  color: #202124;
  outline: none;
}

.ym-tools {
  flex: none;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
  min-height: 120px;
  height: auto;
  margin-top: 8px;
  padding: 10px 12px;
  background: #eceae6;
}

.ym-tools .step { position: static; align-self: center; }
.slot-tools { position: relative; inset: auto; width: auto; height: auto; min-height: 0; }
</style>
