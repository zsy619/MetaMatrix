<script setup lang="ts">
import { inject, ref } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { RTE_BINDINGS } from './bindings'
import { useParentScopeStamp } from './inheritScope'

/**
 * 选区浮动工具条（气泡）。
 *
 * - 选中文字后浮在选区上方，不遮挡选区；贴近视口边缘时由 floating-ui 自动翻转；
 * - 空选区、代码块、图表块内不出现（判定见 composables/useSelectionBubble.ts）；
 * - 命令全部复用工具栏已有的 applyFontSize / applyFontFamily / toggleBold /
 *   applyTextColor / applyHighlightColor / clearFormat / insertLink / setAlign 等，
 *   跨段落选区时命令作用于选区覆盖的全部段落。
 */
const injected = inject(RTE_BINDINGS)
if (!injected) throw new Error('RteSelectionBubble 必须放在 RichTextEditor 里')
// 单独取一个非空别名：inject 的可空类型在闭包里会被重新判空（TS18048）。
const rte = injected
useParentScopeStamp()

type PanelKind = 'block' | 'font' | 'size' | 'align' | null

/** 工具条里展开的下拉面板（字体 / 字号 / 对齐）。 */
const panel = ref<PanelKind>(null)
/** 面板朝上展开（工具条贴近视口底部时避免溢出）。 */
const panelUp = ref(false)
/** 工具条根元素：用来判断面板朝上还是朝下。 */
const barEl = ref<HTMLElement | null>(null)

/** 面板展开方向：下方空间不够就朝上。 */
function resolvePanelUp(): boolean {
  const el = barEl.value
  if (!el || typeof window === 'undefined') return false
  const rect = el.getBoundingClientRect()
  return window.innerHeight - rect.bottom < 260
}

function togglePanel(kind: PanelKind) {
  if (panel.value === kind) {
    panel.value = null
    return
  }
  panelUp.value = resolvePanelUp()
  panel.value = kind
  rte.bubbleSwatch = null
  rte.bubbleRewrite = null
}

const BLOCK_STYLES = [
  { level: 0, label: '正文' },
  { level: 1, label: '标题 1' },
  { level: 2, label: '标题 2' },
  { level: 3, label: '标题 3' },
  { level: 4, label: '标题 4' },
] as const

/** 飞书选区条左侧的段落样式：正文或标题。 */
function currentBlockLabel(): string {
  for (const level of [1, 2, 3, 4] as const) {
    if (rte.isActive?.('heading', { level })) return '标题 ' + level
  }
  return '正文'
}

function blockActive(level: 0 | 1 | 2 | 3 | 4): boolean {
  if (level === 0) return !rte.isActive?.('heading')
  return !!rte.isActive?.('heading', { level })
}

function closePanel() {
  panel.value = null
}

/** 颜色面板和段落菜单同时只开一个。 */
function toggleSwatch(kind: 'text' | 'highlight') {
  panel.value = null
  rte.bubbleRewrite = null
  rte.bubbleSwatch = rte.bubbleSwatch === kind ? null : kind
}

/** 选中项的字体名（用于按钮上的回显）。 */
function currentFontLabel(): string {
  const value = rte.currentFontFamily?.() || ''
  if (!value) return '字体'
  const hit = (rte.FONT_FAMILY_OPTIONS || []).find(
    (opt: { value: string }) => opt.value === value,
  )
  return hit?.label || '字体'
}

/** 选中项的字号（用于按钮上的回显）。 */
function currentSizeLabel(): string {
  const value = rte.currentFontSize?.() || ''
  if (!value) return '字号'
  const hit = (rte.FONT_SIZE_OPTIONS || []).find(
    (opt: { value: string }) => opt.value === value,
  )
  return hit?.label || value
}

/** 对齐按钮上的回显。 */
function currentAlignLabel(): string {
  if (rte.isActive?.({ textAlign: 'center' })) return '居中'
  if (rte.isActive?.({ textAlign: 'right' })) return '右对齐'
  if (rte.isActive?.({ textAlign: 'justify' })) return '两端对齐'
  return '对齐'
}

/** 选一段之后应用命令（保持选区，不丢焦点）。 */
function run(action: () => void) {
  closePanel()
  action()
}
</script>

<template>
  <BubbleMenu
    v-if="rte.editor"
    :editor="rte.editor"
    :should-show="rte.selectionBubbleShouldShow"
    :update-delay="80"
    :options="{ placement: 'top', offset: 8, flip: {}, shift: {} }"
    class="rte-bubble rte-selection-bubble"
    role="toolbar"
    aria-label="选区格式"
  >
    <div ref="barEl" class="rte-bubble-bar" data-rte-own @mousedown.prevent>
      <!-- 正文 / 标题（飞书选区条第一项） -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn rte-bubble-btn-wide rte-bubble-btn-menu"
          :class="{ active: panel === 'block' }"
          :title="'段落样式：' + currentBlockLabel()"
          aria-label="段落样式"
          :aria-expanded="panel === 'block'"
          @click.stop="togglePanel('block')"
        >
          <span data-rte-own class="rte-bubble-label">{{ currentBlockLabel() }}</span>
        </button>
        <div
          v-if="panel === 'block'"
          class="rte-bubble-panel rte-bubble-panel-block"
          :class="{ 'is-up': panelUp }"
          role="listbox"
          aria-label="段落样式"
          data-rte-own
        >
          <button
            v-for="item in BLOCK_STYLES"
            :key="'bb-' + item.level"
            data-rte-own
            type="button"
            role="option"
            class="rte-bubble-panel-item"
            :class="{ active: blockActive(item.level) }"
            :aria-selected="blockActive(item.level)"
            @click.stop="run(() => rte.setHeading(item.level))"
          >
            {{ item.label }}
          </button>
        </div>
      </span>

      <span data-rte-own class="rte-bubble-sep" aria-hidden="true"></span>

      <!-- 字体 -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn rte-bubble-btn-wide rte-bubble-btn-menu"
          :class="{ active: panel === 'font' }"
          :title="'字体：' + currentFontLabel()"
          aria-label="字体"
          :aria-expanded="panel === 'font'"
          @click.stop="togglePanel('font')"
        >
          <span data-rte-own class="rte-bubble-label">{{ currentFontLabel() }}</span>
        </button>
        <div
          v-if="panel === 'font'"
          class="rte-bubble-panel rte-bubble-panel-font"
          :class="{ 'is-up': panelUp }"
          role="listbox"
          aria-label="字体"
          data-rte-own
        >
          <button
            v-for="opt in rte.FONT_FAMILY_OPTIONS"
            :key="'bff-' + (opt.value || 'default')"
            data-rte-own
            type="button"
            role="option"
            class="rte-bubble-panel-item"
            :class="{ active: (opt.value || '') === (rte.currentFontFamily() || '') }"
            :style="opt.value ? { fontFamily: opt.value } : undefined"
            :aria-selected="(opt.value || '') === (rte.currentFontFamily() || '')"
            @click.stop="run(() => rte.applyFontFamily(opt.value))"
          >
            {{ opt.label }}
          </button>
        </div>
      </span>

      <!-- 字号 -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn rte-bubble-btn-wide rte-bubble-btn-menu"
          :class="{ active: panel === 'size' }"
          :title="'字号：' + currentSizeLabel()"
          aria-label="字号"
          :aria-expanded="panel === 'size'"
          @click.stop="togglePanel('size')"
        >
          <span data-rte-own class="rte-bubble-label">{{ currentSizeLabel() }}</span>
        </button>
        <div
          v-if="panel === 'size'"
          class="rte-bubble-panel rte-bubble-panel-size"
          :class="{ 'is-up': panelUp }"
          role="listbox"
          aria-label="字号"
          data-rte-own
        >
          <button
            v-for="opt in rte.FONT_SIZE_OPTIONS"
            :key="'bfs-' + opt.label"
            data-rte-own
            type="button"
            role="option"
            class="rte-bubble-panel-item"
            :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
            :aria-selected="(opt.value || '') === (rte.currentFontSize() || '')"
            @click.stop="run(() => rte.applyFontSize(opt.value))"
          >
            {{ opt.label }}
          </button>
        </div>
      </span>

      <span data-rte-own class="rte-bubble-sep" aria-hidden="true"></span>

      <!-- 加粗 / 斜体 / 下划线 / 删除线 -->
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('bold') }"
        title="加粗 (Ctrl/⌘+B)"
        aria-label="加粗"
        :aria-pressed="rte.isActive('bold')"
        @click="rte.toggleBold"
      >
        <component data-rte-own :is="rte.toolIcon('bold')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('italic') }"
        title="斜体 (Ctrl/⌘+I)"
        aria-label="斜体"
        :aria-pressed="rte.isActive('italic')"
        @mousedown.prevent
        @click="rte.toggleItalic"
      >
        <component data-rte-own :is="rte.toolIcon('italic')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('underline') }"
        title="下划线 (Ctrl/⌘+U)"
        aria-label="下划线"
        :aria-pressed="rte.isActive('underline')"
        @click="rte.toggleUnderline"
      >
        <component data-rte-own :is="rte.toolIcon('underline')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('strike') }"
        title="删除线 (Ctrl/⌘+Shift+X)"
        aria-label="删除线"
        :aria-pressed="rte.isActive('strike')"
        @click="rte.toggleStrike"
      >
        <component data-rte-own :is="rte.toolIcon('strike')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('code') }"
        title="行内代码"
        aria-label="行内代码"
        :aria-pressed="rte.isActive('code')"
        @mousedown.prevent
        @click="rte.toggleCode"
      >
        <component data-rte-own :is="rte.toolIcon('codeInline')" class="rte-ep-icon" />
      </button>

      <span data-rte-own class="rte-bubble-sep" aria-hidden="true"></span>

      <!-- 文字颜色 -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.bubbleSwatch === 'text' || !!rte.currentTextColor() }"
          title="文字颜色"
          aria-label="文字颜色"
          :aria-expanded="rte.bubbleSwatch === 'text'"
          @click.stop="toggleSwatch('text')"
        >
          <span
            data-rte-own
            class="rte-bubble-a"
            :style="{ borderBottomColor: rte.currentTextColor() || 'currentColor' }"
            >A</span
          >
        </button>
        <div
          v-if="rte.bubbleSwatch === 'text'"
          class="rte-bubble-swatches"
          role="listbox"
          aria-label="文字颜色"
          data-rte-own
        >
          <button
            data-rte-own
            type="button"
            class="rte-bubble-swatch is-clear"
            title="默认"
            aria-label="默认文字颜色"
            @click="rte.applyTextColor(''); rte.bubbleSwatch = null"
          >
            A
          </button>
          <button
            v-for="color in rte.FEISHU_TEXT_COLORS"
            :key="'bt-' + color"
            data-rte-own
            type="button"
            class="rte-bubble-swatch"
            :style="{ background: color }"
            :aria-label="color"
            :class="{ 'is-on': rte.currentTextColor() === color }"
            @click="rte.applyTextColor(color); rte.bubbleSwatch = null"
          />
        </div>
      </span>

      <!-- 背景高亮 -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.bubbleSwatch === 'highlight' || rte.isActive('highlight') }"
          title="高亮颜色"
          aria-label="高亮颜色"
          :aria-pressed="rte.isActive('highlight')"
          :aria-expanded="rte.bubbleSwatch === 'highlight'"
          @click.stop="toggleSwatch('highlight')"
        >
          <component data-rte-own :is="rte.toolIcon('highlight')" class="rte-ep-icon" />
        </button>
        <div
          v-if="rte.bubbleSwatch === 'highlight'"
          class="rte-bubble-swatches"
          role="listbox"
          aria-label="高亮颜色"
          data-rte-own
        >
          <button
            data-rte-own
            type="button"
            class="rte-bubble-swatch is-clear"
            title="清除高亮"
            aria-label="清除高亮"
            @click="rte.applyHighlightColor(''); rte.bubbleSwatch = null"
          >
            ×
          </button>
          <button
            v-for="color in rte.FEISHU_HIGHLIGHT_COLORS"
            :key="'bh-' + color"
            data-rte-own
            type="button"
            class="rte-bubble-swatch"
            :style="{ background: color }"
            :aria-label="color"
            :class="{ 'is-on': rte.currentHighlightColor() === color }"
            @click="rte.applyHighlightColor(color); rte.bubbleSwatch = null"
          />
        </div>
      </span>

      <!-- 清除格式 -->
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        title="清除格式"
        aria-label="清除格式"
        @click="rte.clearFormat"
      >
        <span data-rte-own class="rte-bubble-text">清</span>
      </button>

      <!-- 链接 -->
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('link') }"
        :title="rte.isActive('link') ? '编辑链接 (Ctrl/⌘+K)' : '插入链接 (Ctrl/⌘+K)'"
        :aria-label="rte.isActive('link') ? '编辑链接' : '插入链接'"
        :aria-pressed="rte.isActive('link')"
        @click="rte.insertLink"
      >
        <component data-rte-own :is="rte.toolIcon('link')" class="rte-ep-icon" />
      </button>

      <!-- 对齐 -->
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn rte-bubble-btn-wide rte-bubble-btn-menu"
          :class="{
            active:
              panel === 'align' ||
              rte.isActive({ textAlign: 'center' }) ||
              rte.isActive({ textAlign: 'right' }) ||
              rte.isActive({ textAlign: 'justify' }),
          }"
          :title="'对齐：' + currentAlignLabel()"
          aria-label="对齐"
          :aria-expanded="panel === 'align'"
          @click.stop="togglePanel('align')"
        >
          <component data-rte-own :is="rte.toolIcon('align')" class="rte-ep-icon" />
        </button>
        <div
          v-if="panel === 'align'"
          class="rte-bubble-panel rte-bubble-panel-align"
          :class="{ 'is-up': panelUp }"
          role="menu"
          aria-label="对齐"
          data-rte-own
        >
          <button
            data-rte-own
            type="button"
            role="menuitem"
            class="rte-bubble-panel-item"
            :class="{ active: rte.isActive({ textAlign: 'left' }) }"
            @click.stop="run(() => rte.setAlign('left'))"
          >
            左对齐
          </button>
          <button
            data-rte-own
            type="button"
            role="menuitem"
            class="rte-bubble-panel-item"
            :class="{ active: rte.isActive({ textAlign: 'center' }) }"
            @click.stop="run(() => rte.setAlign('center'))"
          >
            居中
          </button>
          <button
            data-rte-own
            type="button"
            role="menuitem"
            class="rte-bubble-panel-item"
            :class="{ active: rte.isActive({ textAlign: 'right' }) }"
            @click.stop="run(() => rte.setAlign('right'))"
          >
            右对齐
          </button>
          <button
            data-rte-own
            type="button"
            role="menuitem"
            class="rte-bubble-panel-item"
            :class="{ active: rte.isActive({ textAlign: 'justify' }) }"
            @click.stop="run(() => rte.setAlign('justify'))"
          >
            两端对齐
          </button>
        </div>
      </span>

      <span data-rte-own class="rte-bubble-sep" aria-hidden="true"></span>

      <!-- 列表 / 引用 -->
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('bulletList') }"
        title="无序列表"
        aria-label="无序列表"
        :aria-pressed="rte.isActive('bulletList')"
        @click="rte.toggleBulletList"
      >
        <component data-rte-own :is="rte.toolIcon('list')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('orderedList') }"
        title="有序列表"
        aria-label="有序列表"
        :aria-pressed="rte.isActive('orderedList')"
        @click="rte.toggleOrderedList"
      >
        <component data-rte-own :is="rte.toolIcon('listOrdered')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('taskList') }"
        title="任务列表"
        aria-label="任务列表"
        :aria-pressed="rte.isActive('taskList')"
        @click="rte.toggleTaskList"
      >
        <component data-rte-own :is="rte.toolIcon('listTask')" class="rte-ep-icon" />
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('blockquote') }"
        title="引用 (Ctrl/⌘+Shift+9)"
        aria-label="引用"
        :aria-pressed="rte.isActive('blockquote')"
        @click="rte.toggleBlockquote"
      >
        <component data-rte-own :is="rte.toolIcon('quote')" class="rte-ep-icon" />
      </button>

      <span data-rte-own class="rte-bubble-sep" aria-hidden="true"></span>

      <!-- 评论 / 复制 / 转链接 / 转表格 / 改写 -->
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        title="评论"
        aria-label="评论"
        @click="rte.beginComment"
      >
        评
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        title="复制选中文字"
        aria-label="复制选中文字"
        @click="rte.copySelectedText"
      >
        复
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        title="把选中文字变成链接"
        aria-label="转链接"
        @click="rte.selectionToLink"
      >
        链
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-bubble-btn"
        title="把选中文字转成表格"
        aria-label="转表格"
        @click="rte.selectionToTable"
      >
        表
      </button>
      <span class="rte-bubble-slot" data-rte-own>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.bubbleRewrite === 'rewrite' }"
          title="改写选区（本地规则，AI 服务未接入）"
          aria-label="改写选区"
          :aria-expanded="rte.bubbleRewrite === 'rewrite'"
          @click.stop="rte.bubbleRewrite = rte.bubbleRewrite === 'rewrite' ? null : 'rewrite'"
        >
          改
        </button>
        <div
          v-if="rte.bubbleRewrite === 'rewrite'"
          class="rte-bubble-swatches rte-bubble-rewrite"
          role="menu"
          aria-label="改写选区"
          data-rte-own
        >
          <button
            data-rte-own
            type="button"
            role="menuitem"
            title="清理多余空格与空行"
            @click="rte.rewriteSelection('trim')"
          >
            清理空格
          </button>
          <button
            data-rte-own
            type="button"
            role="menuitem"
            title="中英文之间补空格"
            @click="rte.rewriteSelection('space')"
          >
            中英文空格
          </button>
          <button
            data-rte-own
            type="button"
            role="menuitem"
            title="把连续短行合并成一段"
            @click="rte.rewriteSelection('merge')"
          >
            合并短行
          </button>
        </div>
      </span>

      <!-- 链接已存在时的附加操作 -->
      <template v-if="rte.isActive('link')">
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn"
          title="打开链接"
          aria-label="打开链接"
          @click="rte.openCurrentLink"
        >
          ↗
        </button>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn"
          title="复制链接地址"
          aria-label="复制链接地址"
          @click="rte.copyCurrentLinkUrl"
        >
          ⧉
        </button>
        <button
          data-rte-own
          type="button"
          class="rte-bubble-btn rte-bubble-btn-danger"
          title="取消链接"
          aria-label="取消链接"
          @click="rte.unlinkSelection"
        >
          ✕
        </button>
      </template>
    </div>
  </BubbleMenu>
</template>
