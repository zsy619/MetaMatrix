<script setup lang="ts">
import { inject, ref } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { useParentScopeStamp } from './inheritScope'
import { themeColorLabel } from './rteColorPalette'

/**
 * 文字颜色 / 高亮颜色板。
 * 选区条、工具栏和「更多」共用：自动或清除、最近使用、主题色或底色、自定义。
 */
const props = defineProps<{
  kind: 'text' | 'highlight'
}>()

const emit = defineEmits<{
  picked: []
}>()

const injected = inject(RTE_BINDINGS)
if (!injected) throw new Error('RteColorBoard 必须放在 RichTextEditor 里')
const rte = injected
useParentScopeStamp()

const hint = ref('')
const customOpen = ref(false)
const customHex = ref(props.kind === 'text' ? '#245bdb' : '#fff3bf')

function currentValue(): string {
  return props.kind === 'text' ? rte.currentTextColor() || '' : rte.currentHighlightColor() || ''
}

function currentCaption(): string {
  if (props.kind === 'text') {
    const value = rte.currentTextColor() || ''
    return value ? rte.textColorLabel(value) : '自动'
  }
  return rte.currentHighlightLabel()
}

function recentList(): string[] {
  return props.kind === 'text' ? rte.recentTextColors || [] : rte.recentHighlightColors || []
}

function showHint(label: string) {
  hint.value = label
}

function pick(color: string) {
  if (props.kind === 'text') rte.applyTextColor(color)
  else rte.applyHighlightColor(color)
  emit('picked')
}

function onNative(event: Event) {
  const el = event.target as HTMLInputElement | null
  if (el?.value) customHex.value = el.value
}

function applyCustom() {
  let hex = customHex.value.trim()
  if (!hex) return
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) && !/^#[0-9a-fA-F]{3}$/.test(hex)) return
  customHex.value = hex
  pick(hex)
}
</script>

<template>
  <div data-rte-own class="rte-color-board" :class="'is-' + kind" @mousedown.prevent>
    <div data-rte-own class="rte-color-current">
      当前：{{ currentCaption() }}
    </div>
    <button
      data-rte-own
      type="button"
      class="rte-color-action"
      :class="{ selected: kind === 'text' ? !rte.currentTextColor() : !rte.isActive('highlight') }"
      @click="pick('')"
    >
      {{ kind === 'text' ? '自动' : '清除高亮' }}
    </button>

    <template v-if="recentList().length">
      <div data-rte-own class="rte-color-section-label">最近使用</div>
      <div data-rte-own class="rte-standard-row" role="listbox" aria-label="最近使用">
        <button
          v-for="color in recentList()"
          :key="'recent-' + color"
          data-rte-own
          type="button"
          role="option"
          class="rte-swatch"
          :class="{
            selected: rte.colorsEqual(currentValue(), color),
            'is-light': rte.isLightHighlight(color),
          }"
          :style="{ background: color }"
          :title="kind === 'text' ? rte.textColorLabel(color) : rte.highlightColorLabel(color)"
          :aria-label="kind === 'text' ? rte.textColorLabel(color) : rte.highlightColorLabel(color)"
          @mouseenter="showHint(kind === 'text' ? rte.textColorLabel(color) : rte.highlightColorLabel(color))"
          @mouseleave="showHint('')"
          @click="pick(color)"
        />
      </div>
    </template>

    <template v-if="kind === 'text'">
      <div data-rte-own class="rte-color-section-label">主题颜色</div>
      <div data-rte-own class="rte-theme-grid" role="listbox" aria-label="主题颜色">
        <button
          v-for="(color, index) in rte.WORD_THEME_FLAT"
          :key="'theme-' + index + '-' + color"
          data-rte-own
          type="button"
          role="option"
          class="rte-swatch"
          :class="{
            selected: rte.colorsEqual(currentValue(), color),
            'is-light': rte.isLightHighlight(color),
          }"
          :style="{ background: color }"
          :title="themeColorLabel(Number(index))"
          :aria-label="themeColorLabel(Number(index))"
          @mouseenter="showHint(themeColorLabel(Number(index)))"
          @mouseleave="showHint('')"
          @click="pick(color)"
        />
      </div>
      <div data-rte-own class="rte-color-section-label">标准颜色</div>
      <div data-rte-own class="rte-standard-row" role="listbox" aria-label="标准颜色">
        <button
          v-for="item in rte.WORD_STANDARD_COLOR_ITEMS"
          :key="'std-' + item.color"
          data-rte-own
          type="button"
          role="option"
          class="rte-swatch"
          :class="{
            selected: rte.colorsEqual(currentValue(), item.color),
            'is-light': rte.isLightHighlight(item.color),
          }"
          :style="{ background: item.color }"
          :title="item.label"
          :aria-label="item.label"
          @mouseenter="showHint(item.label)"
          @mouseleave="showHint('')"
          @click="pick(item.color)"
        />
      </div>
    </template>

    <template v-else>
      <div data-rte-own class="rte-color-section-label">常用底色</div>
      <div data-rte-own class="rte-highlight-swatches" role="listbox" aria-label="常用底色">
        <button
          v-for="item in rte.WORD_HIGHLIGHT_SOFT"
          :key="'soft-' + item.color"
          data-rte-own
          type="button"
          role="option"
          class="rte-swatch"
          :class="{
            selected: rte.colorsEqual(currentValue(), item.color),
            'is-light': true,
          }"
          :style="{ background: item.color }"
          :title="item.label"
          :aria-label="item.label"
          @mouseenter="showHint(item.label)"
          @mouseleave="showHint('')"
          @click="pick(item.color)"
        />
      </div>
      <div data-rte-own class="rte-color-section-label">荧光笔</div>
      <div data-rte-own class="rte-highlight-swatches" role="listbox" aria-label="荧光笔">
        <button
          v-for="item in rte.WORD_HIGHLIGHT_VIVID"
          :key="'vivid-' + item.color"
          data-rte-own
          type="button"
          role="option"
          class="rte-swatch"
          :class="{
            selected: rte.colorsEqual(currentValue(), item.color),
            'is-light': rte.isLightHighlight(item.color),
          }"
          :style="{ background: item.color }"
          :title="item.label"
          :aria-label="item.label"
          @mouseenter="showHint(item.label)"
          @mouseleave="showHint('')"
          @click="pick(item.color)"
        />
      </div>
    </template>

    <div data-rte-own class="rte-color-hint">{{ hint || '悬停色块可看名称' }}</div>
    <button data-rte-own type="button" class="rte-color-action" :aria-expanded="customOpen" @click.stop="customOpen = !customOpen">
      其他颜色…
    </button>
    <div v-if="customOpen" data-rte-own class="rte-custom-color" @mousedown.stop @click.stop>
      <input
        data-rte-own
        v-model="customHex"
        type="color"
        class="rte-custom-color-native"
        :aria-label="kind === 'text' ? '选取文字颜色' : '选取高亮颜色'"
        @input="onNative"
      />
      <input
        data-rte-own
        v-model="customHex"
        type="text"
        class="rte-custom-color-hex"
        maxlength="7"
        :placeholder="kind === 'text' ? '#245bdb' : '#fff3bf'"
        :aria-label="kind === 'text' ? '文字颜色十六进制' : '高亮颜色十六进制'"
        @keydown.enter.prevent="applyCustom"
      />
      <button data-rte-own type="button" class="rte-custom-color-ok" @click="applyCustom">确定</button>
    </div>
  </div>
</template>
