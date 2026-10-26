<script setup lang="ts">
import { computed } from 'vue'
import type { MarkerNode as MarkerNodeType } from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'

const props = defineProps<{
  marker: MarkerNodeType
}>()

const selection = useSelectionStore()

const selected = computed(
  () => selection.kind === 'marker' && selection.markerId === props.marker.id,
)

const style = computed(() => ({
  left: props.marker.x,
  top: props.marker.y,
  color: props.marker.color,
}))

const iconGlyph = computed(() => {
  switch (props.marker.iconName) {
    case 'star-outline':
      return '★'
    case 'hourglass':
      return '⌛'
    case 'money-bag':
      return '💰'
    default:
      return props.marker.type === 'dot' ? '' : '●'
  }
})

function onSelect() {
  selection.selectMarker(props.marker.id)
}
</script>

<template>
  <div
    class="marker-node"
    :class="[`label-${marker.labelPosition}`, { selected }]"
    :style="style"
    :title="marker.label"
    @click.stop="onSelect"
  >
    <div class="marker-body" :style="{ backgroundColor: marker.color }">
      <span v-if="marker.type !== 'dot'" class="marker-icon">{{ iconGlyph }}</span>
    </div>
    <span class="marker-label">{{ marker.label }}</span>
  </div>
</template>

<style scoped>
.marker-node {
  position: absolute;
  z-index: 30;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: grab;
  user-select: none;
  pointer-events: auto;
}

.marker-node.selected .marker-body {
  outline: 2px solid #1a73e8;
  outline-offset: 2px;
}

.marker-body {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  display: grid;
  place-items: center;
  border: 2px solid #fff;
}

.marker-icon {
  font-size: 10px;
  line-height: 1;
  filter: grayscale(1) brightness(10);
}

.marker-label {
  font-size: 12px;
  font-weight: 600;
  color: #202124;
  white-space: nowrap;
  text-shadow: 0 0 4px #fff, 0 0 4px #fff;
  background: rgba(255, 255, 255, 0.72);
  padding: 1px 6px;
  border-radius: 4px;
}

.label-top {
  flex-direction: column-reverse;
}

.label-bottom {
  flex-direction: column;
}

.label-left {
  flex-direction: row-reverse;
}

.label-right {
  flex-direction: row;
}
</style>
