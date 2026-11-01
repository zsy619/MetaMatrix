<script setup lang="ts">
import { computed } from 'vue'
import type {
  DualTriangleBlock,
  DualTriangleBlockId,
  DualTriangleDocumentJSON,
} from '../../types/canvas'
import DualTriangleBlockCard from './DualTriangleBlock.vue'

const props = defineProps<{
  doc: DualTriangleDocumentJSON
}>()

/**
 * 参考图（一堂 AI 双三角）3×2，从左到右、从上到下：
 * A. 场景（起点） · H. 审美（终点） · H. 体系（过程）
 * A. 数据（资产） · A. 基本功（能力） · H. 创造力（创新）
 */
const cells: DualTriangleBlockId[] = [
  'scenario',
  'aesthetics',
  'system',
  'data',
  'basics',
  'innovation',
]

const DEFAULT_LEAD =
  '这是一个一堂AI双三角的梳理和预判画布，用于AI场景落地的潜力梳理准备和预判。'
const DEFAULT_REMINDERS = [
  '提醒1：建议充分做加法/灵感闪现，多多填写。',
  '提醒2：排优先级，加法越多，越需要抓重点和主要矛盾。',
  '提醒3：初期执行从里面挑优先级最高的来执行和测试。',
]

const byId = computed(() => {
  const map = new Map<DualTriangleBlockId, DualTriangleBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: DualTriangleBlockId): DualTriangleBlock | undefined {
  return byId.value.get(id)
}

const footerLead = computed(
  () => props.doc.footer?.lead?.trim() || DEFAULT_LEAD,
)

const footerReminders = computed(() => {
  const lines = props.doc.footer?.reminders?.map((s) => s.trim()).filter(Boolean)
  return lines && lines.length > 0 ? lines : DEFAULT_REMINDERS
})
</script>

<template>
  <div class="hai-canvas">
    <div class="hai-table" role="table" aria-label="一堂 AI 双三角">
      <div v-for="id in cells" :key="id" class="hai-cell" role="cell">
        <DualTriangleBlockCard
          v-if="block(id)"
          variant="table"
          :block="block(id)!"
        />
      </div>
    </div>

    <footer class="hai-footer">
      <p class="hai-footer-lead">{{ footerLead }}</p>
      <ul class="hai-footer-list">
        <li v-for="(line, index) in footerReminders" :key="index">{{ line }}</li>
      </ul>
    </footer>
  </div>
</template>

<style scoped>
.hai-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 14px 16px 12px;
  background: #f7f7f7;
  overflow: auto;
}

.hai-table {
  flex: 1 1 auto;
  width: 100%;
  min-height: 460px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 0;
  background: #fff;
  border: 1px solid #ececec;
  box-sizing: border-box;
  overflow: hidden;
}

.hai-cell {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-sizing: border-box;
  box-shadow:
    inset -1px 0 0 rgba(60, 50, 20, 0.08),
    inset 0 -1px 0 rgba(60, 50, 20, 0.08);
}

.hai-cell:nth-child(3n) {
  box-shadow: inset 0 -1px 0 rgba(60, 50, 20, 0.08);
}

.hai-cell:nth-child(n + 4) {
  box-shadow: inset -1px 0 0 rgba(60, 50, 20, 0.08);
}

.hai-cell:nth-child(6) {
  box-shadow: none;
}

.hai-footer {
  flex-shrink: 0;
  margin: 0;
  padding: 14px 4px 4px;
  color: #3c4043;
  font-size: 13px;
  line-height: 1.7;
}

.hai-footer-lead {
  margin: 0;
}

.hai-footer-list {
  margin: 2px 0 0;
  padding: 0 0 0 1.15em;
}

.hai-footer-list li {
  margin: 0;
  padding: 0;
}

.hai-footer-list li::marker {
  color: #3c4043;
}

@media (max-width: 840px) {
  .hai-canvas {
    padding: 8px 8px 10px;
  }

  .hai-table {
    min-height: 640px;
  }

  .hai-footer {
    font-size: 12px;
    padding-top: 10px;
  }
}
</style>
