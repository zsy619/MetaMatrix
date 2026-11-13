<script setup lang="ts">
/**
 * 分栏属性面板。光标在分栏里时从右侧打开，改边框、间距和圆角。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { ColumnBorderStyle, ColumnFrameAttrs } from '../../extensions/columns'

const props = defineProps<{ editor?: Editor }>()

const open = ref(false)
const pos = ref(-1)
const dismissedPos = ref(-2)
const frame = ref<Required<ColumnFrameAttrs>>({
  gap: 16,
  margin: 12,
  radius: 8,
  padding: 10,
  borderWidth: 1,
  borderStyle: 'dashed',
  borderColor: '#c9cdd4',
})

function readFrame(attrs: Record<string, unknown>): Required<ColumnFrameAttrs> {
  const style = attrs.borderStyle
  return {
    gap: Number(attrs.gap ?? 16),
    margin: Number(attrs.margin ?? 12),
    radius: Number(attrs.radius ?? 8),
    padding: Number(attrs.padding ?? 10),
    borderWidth: Number(attrs.borderWidth ?? 1),
    borderStyle: style === 'none' || style === 'solid' || style === 'dashed' ? style : 'dashed',
    borderColor: String(attrs.borderColor || '#c9cdd4'),
  }
}

function locate() {
  const ed = props.editor
  if (!ed || ed.state.selection instanceof NodeSelection) {
    open.value = false
    return
  }
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'columns') continue
    const nextPos = $from.before(depth)
    if (dismissedPos.value === nextPos) return
    pos.value = nextPos
    frame.value = readFrame(node.attrs as Record<string, unknown>)
    open.value = true
    return
  }
  dismissedPos.value = -2
  open.value = false
}

function patch(partial: Partial<ColumnFrameAttrs>) {
  const ed = props.editor
  if (!ed || pos.value < 0) return
  const node = ed.state.doc.nodeAt(pos.value)
  if (!node || node.type.name !== 'columns') return
  frame.value = { ...frame.value, ...partial }
  const tr = ed.state.tr.setNodeMarkup(pos.value, undefined, { ...node.attrs, ...frame.value })
  tr.setMeta('addToHistory', true)
  ed.view.dispatch(tr)
}

function onNumber(key: 'gap' | 'margin' | 'radius' | 'padding' | 'borderWidth', event: Event) {
  patch({ [key]: Number((event.target as HTMLInputElement).value) })
}

function onStyle(event: Event) {
  patch({ borderStyle: (event.target as HTMLSelectElement).value as ColumnBorderStyle })
}

function onColor(event: Event) {
  patch({ borderColor: (event.target as HTMLInputElement).value })
}

let unbind: (() => void) | null = null
watch(() => props.editor, (ed) => {
  unbind?.()
  unbind = null
  if (!ed) return
  const sync = () => locate()
  ed.on('selectionUpdate', sync)
  ed.on('transaction', sync)
  unbind = () => {
    ed.off('selectionUpdate', sync)
    ed.off('transaction', sync)
  }
  sync()
}, { immediate: true })

onBeforeUnmount(() => {
  unbind?.()
  open.value = false
})
</script>

<template>
  <aside v-if="open" class="rte-chart-panel rte-columns-panel" data-rte-own aria-label="分栏属性">
    <header class="rte-cp-head">
      <div class="rte-cp-title">分栏属性</div>
      <div class="rte-cp-subtitle">边框、间距和圆角</div>
      <button type="button" class="rte-cp-close" title="收起分栏属性。光标还在这里时不再自动打开" @click="dismissedPos = pos; open = false">×</button>
    </header>
    <div class="rte-cp-body rte-columns-panel-body">
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">边框</span>
        <select class="rte-cp-type-select" :value="frame.borderStyle" aria-label="分栏边框" title="栏与栏之间的线：虚线、实线，或不要" @change="onStyle">
          <option value="dashed">虚线</option>
          <option value="solid">实线</option>
          <option value="none">无</option>
        </select>
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">粗细</span>
        <input class="rte-cp-type-select" type="number" min="0" max="8" :value="frame.borderWidth" aria-label="边框粗细" title="边框粗细，0 到 8 像素。0 等于不要边框" @change="onNumber('borderWidth', $event)" />
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">颜色</span>
        <input class="rte-cp-type-select" type="color" :value="frame.borderColor" aria-label="边框颜色" title="边框颜色" @input="onColor" />
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">栏间距</span>
        <input class="rte-cp-type-select" type="number" min="0" max="64" :value="frame.gap" aria-label="栏间距" title="栏与栏的间距，0 到 64 像素" @change="onNumber('gap', $event)" />
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">外边距</span>
        <input class="rte-cp-type-select" type="number" min="0" max="64" :value="frame.margin" aria-label="分栏外边距" title="整组分栏的外边距，0 到 64 像素" @change="onNumber('margin', $event)" />
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">圆角</span>
        <input class="rte-cp-type-select" type="number" min="0" max="32" :value="frame.radius" aria-label="分栏圆角" title="分栏圆角，0 到 32 像素" @change="onNumber('radius', $event)" />
      </label>
      <label class="rte-cp-type-row">
        <span class="rte-cp-type-label">内边距</span>
        <input class="rte-cp-type-select" type="number" min="0" max="48" :value="frame.padding" aria-label="分栏内边距" title="栏内文字到边框的距离，0 到 48 像素" @change="onNumber('padding', $event)" />
      </label>
    </div>
  </aside>
</template>
