<script setup lang="ts">
/**
 * 画布背景模板设置面板（同 excalidraw 的画布样式）。
 *
 * 图案、图案色、底色、间距四组，改完立刻生效并随画布一起保存。
 */
import { computed } from 'vue'
import type { NodeGraphBackground, NodeGraphBackgroundPattern } from '../../../types/nodeGraph'
import {
  BACKGROUND_BACKGROUNDS,
  BACKGROUND_COLORS,
  BACKGROUND_PRESETS,
  BACKGROUND_PATTERNS,
  backgroundStyle,
} from './background'

const props = defineProps<{ background: NodeGraphBackground }>()
const emit = defineEmits<{ change: [background: NodeGraphBackground] }>()

const preview = computed(() => backgroundStyle(props.background))
const patternLabel = computed(
  () => BACKGROUND_PATTERNS.find((item) => item.id === props.background.pattern)?.label || '',
)

function patch(next: Partial<NodeGraphBackground>) {
  emit('change', { ...props.background, ...next })
}

function setPattern(pattern: NodeGraphBackgroundPattern) {
  patch({ pattern })
}

function isPreset(preset: NodeGraphBackground) {
  return JSON.stringify(props.background) === JSON.stringify(preset)
}
</script>

<template>
  <div class="ng-bg-panel" role="dialog" aria-label="画布背景设置">
    <p class="ng-bg-panel__title">画布背景</p>

    <div class="ng-bg-panel__preview" :style="preview">
      <span>{{ patternLabel }}</span>
    </div>

    <p class="ng-bg-panel__label">图案</p>
    <div class="ng-bg-panel__patterns">
      <button
        v-for="item in BACKGROUND_PATTERNS"
        :key="item.id"
        type="button"
        class="ng-bg-chip"
        :class="{ 'is-on': background.pattern === item.id, 'is-wide': item.id === 'none' }"
        :title="item.label"
        @click="setPattern(item.id)"
      >
        {{ item.label }}
      </button>
    </div>

    <p class="ng-bg-panel__label">背景模板</p>
    <div class="ng-bg-panel__presets">
      <button
        v-for="preset in BACKGROUND_PRESETS"
        :key="preset.label"
        type="button"
        class="ng-bg-chip"
        :class="{ 'is-on': isPreset(preset.value) }"
        @click="emit('change', { ...preset.value })"
      >
        {{ preset.label }}
      </button>
    </div>

    <p class="ng-bg-panel__label">图案颜色</p>
    <div class="ng-bg-panel__scheme">
      <el-select
        :model-value="background.color"
        size="small"
        class="ng-bg-panel__select"
        aria-label="图案颜色"
        @update:model-value="(v: string) => patch({ color: v })"
      >
        <template #prefix>
          <span class="ng-bg-swatch ng-bg-swatch--trigger" :style="{ background: background.color }"></span>
        </template>
        <el-option
          v-for="item in BACKGROUND_COLORS"
          :key="item.color"
          :label="item.label"
          :value="item.color"
        >
          <span class="ng-bg-swatch" :style="{ background: item.color }"></span>
          <span>{{ item.label }}</span>
          <em class="ng-bg-swatch__hex">{{ item.color }}</em>
        </el-option>
      </el-select>
      <el-color-picker
        :model-value="background.color"
        size="small"
        aria-label="自定义图案颜色"
        @update:model-value="(v: string | null) => v && patch({ color: v })"
      />
    </div>

    <p class="ng-bg-panel__label">底色</p>
    <div class="ng-bg-panel__scheme">
      <el-select
        :model-value="background.background"
        size="small"
        class="ng-bg-panel__select"
        aria-label="底色"
        @update:model-value="(v: string) => patch({ background: v })"
      >
        <template #prefix>
          <span class="ng-bg-swatch ng-bg-swatch--trigger" :style="{ background: background.background }"></span>
        </template>
        <el-option
          v-for="item in BACKGROUND_BACKGROUNDS"
          :key="item.background"
          :label="item.label"
          :value="item.background"
        >
          <span class="ng-bg-swatch" :style="{ background: item.background }"></span>
          <span>{{ item.label }}</span>
          <em class="ng-bg-swatch__hex">{{ item.background }}</em>
        </el-option>
      </el-select>
      <el-color-picker
        :model-value="background.background"
        size="small"
        aria-label="自定义底色"
        @update:model-value="(v: string | null) => v && patch({ background: v })"
      />
    </div>

    <p class="ng-bg-panel__label">间距 {{ background.size }}px</p>
    <el-slider
      class="ng-bg-panel__slider"
      :model-value="background.size"
      :min="8"
      :max="64"
      :step="4"
      :show-tooltip="false"
      @update:model-value="(v: number) => patch({ size: v })"
    />
  </div>
</template>

<style scoped>
.ng-bg-panel {
  position: absolute;
  left: 12px;
  top: 56px;
  z-index: 30;
  width: 336px;
  max-height: calc(100vh - 76px);
  overflow-y: auto;
  padding: 12px 14px 14px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}

.ng-bg-panel__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--mm-text);
}

.ng-bg-panel__preview {
  height: 64px;
  border-radius: 10px;
  border: 1px solid var(--mm-line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--mm-muted);
  overflow: hidden;
  margin-bottom: 12px;
}

.ng-bg-panel__label {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mm-muted);
}

/* 图案 6 个一行；空白单独占满一整行。 */
.ng-bg-panel__patterns {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.ng-bg-panel__presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.ng-bg-panel__scheme {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ng-bg-panel__select {
  flex: 1;
  min-width: 0;
}

.ng-bg-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 4px;
  border: 1px solid var(--mm-line-strong);
  vertical-align: -2px;
}

.ng-bg-swatch__hex {
  float: right;
  margin-left: 8px;
  color: var(--mm-faint);
  font-size: 11px;
  font-style: normal;
}

/* 下拉框里选中值前面的色块 */
.ng-bg-swatch--trigger {
  margin-right: 6px;
  vertical-align: -3px;
}

.ng-bg-chip {
  padding: 5px 4px;
  border-radius: 8px;
  border: 1px solid var(--mm-line);
  background: #fff;
  color: var(--mm-text);
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.ng-bg-chip.is-wide {
  grid-column: 1 / -1;
}

.ng-bg-chip:hover {
  border-color: var(--mm-blue);
  color: var(--mm-blue);
}

.ng-bg-chip.is-on {
  border-color: transparent;
  background: var(--mm-blue-soft);
  color: var(--mm-blue);
  font-weight: 600;
}

.ng-bg-panel__slider {
  margin: 0 6px;
}
</style>
