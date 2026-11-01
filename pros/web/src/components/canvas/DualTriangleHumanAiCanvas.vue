<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
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
 * 左侧分组竖栏 + 3×2。
 * 上排人类三角：审美 · 体系 · 创造力
 * 下排 AI 三角：场景 · 数据 · 基本功
 * 六格配色互不相同；主题词（起点 / 终点等）在格子正文里可编辑。
 */
const humanCols: DualTriangleBlockId[] = ['aesthetics', 'system', 'innovation']
const aiCols: DualTriangleBlockId[] = ['scenario', 'data', 'basics']

function groupLabel(
  value: string | undefined,
  canonical: string,
  aliases: string[],
): string {
  const text = (value || '').trim()
  if (!text || aliases.includes(text)) return canonical
  return text
}

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

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const humanRail = computed(() =>
  groupLabel(props.doc.center.humanTitle, '人类三角', ['人类侧', '人类三角']),
)
const aiRail = computed(() =>
  groupLabel(props.doc.center.aiTitle, 'AI三角', ['AI 侧', 'AI侧', 'AI三角', 'AI 三角']),
)
</script>

<template>
  <div class="hai-canvas" :style="chrome">
    <div class="hai-table" role="table" aria-label="人类三角与 AI 三角">
      <div class="hai-rail hai-rail--human" role="rowheader">
        <span class="hai-rail-label">{{ humanRail }}</span>
      </div>
      <div v-for="id in humanCols" :key="id" class="hai-cell" role="cell">
        <DualTriangleBlockCard
          v-if="block(id)"
          variant="table"
          :block="block(id)!"
        />
      </div>

      <div class="hai-rail hai-rail--ai" role="rowheader">
        <span class="hai-rail-label">{{ aiRail }}</span>
      </div>
      <div v-for="id in aiCols" :key="id" class="hai-cell" role="cell">
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
  background: var(--cv-page, #f7f7f7);
  overflow: auto;
  overscroll-behavior: contain;
}

.hai-table {
  flex: 1 1 auto;
  width: 100%;
  min-height: 460px;
  display: grid;
  grid-template-columns: 68px repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 0;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  box-sizing: border-box;
  overflow: hidden;
}

.hai-rail,
.hai-cell {
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  box-shadow:
    inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08)),
    inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.hai-table > :nth-child(4) {
  box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.hai-table > :nth-child(n + 5) {
  box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.hai-table > :nth-child(8) {
  box-shadow: none;
}

.hai-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}

.hai-rail--human {
  background: #f6ebd4;
}

.hai-rail--ai {
  background: #e5eef3;
}

.hai-rail-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.28em;
  color: #3c3424;
  line-height: 1;
}

.hai-cell {
  display: flex;
  flex-direction: column;
  background: #fff;
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
    grid-template-columns: 44px repeat(3, minmax(0, 1fr));
    min-height: 640px;
  }

  .hai-rail-label {
    font-size: 13px;
    letter-spacing: 0.16em;
  }

  .hai-footer {
    font-size: 12px;
    padding-top: 10px;
  }
}
</style>
