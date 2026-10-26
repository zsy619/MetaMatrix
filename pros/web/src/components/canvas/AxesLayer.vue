<script setup lang="ts">
import type { CanvasAxes } from '../../types/canvas'

defineProps<{
  axes: CanvasAxes
}>()
</script>

<template>
  <svg
    class="axes-layer"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <!-- X axis -->
    <line x1="2" y1="50" x2="98" y2="50" class="axis-line" />
    <polygon points="98,50 95.5,48.2 95.5,51.8" class="axis-arrow" />
    <polygon points="2,50 4.5,48.2 4.5,51.8" class="axis-arrow" />

    <!-- Y axis -->
    <line x1="50" y1="2" x2="50" y2="98" class="axis-line" />
    <polygon points="50,2 48.2,4.5 51.8,4.5" class="axis-arrow" />
    <polygon points="50,98 48.2,95.5 51.8,95.5" class="axis-arrow" />

    <text x="6" y="48.5" class="axis-label" text-anchor="start">
      {{ axes.x.leftLabel }}
    </text>
    <text x="94" y="48.5" class="axis-label" text-anchor="end">
      {{ axes.x.rightLabel }}
    </text>
    <text x="51.5" y="6" class="axis-label" text-anchor="start">
      {{ axes.y.topLabel }}
    </text>
    <text x="51.5" y="96" class="axis-label" text-anchor="start">
      {{ axes.y.bottomLabel }}
    </text>
  </svg>
</template>

<style scoped>
.axes-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.axis-line {
  stroke: #5f6368;
  stroke-width: 0.35;
  vector-effect: non-scaling-stroke;
}

.axis-arrow {
  fill: #5f6368;
}

.axis-label {
  fill: #3c4043;
  font-size: 2.6px;
  font-weight: 600;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
</style>
