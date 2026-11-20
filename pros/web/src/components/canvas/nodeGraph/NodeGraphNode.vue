<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ChatDotRound, Lock, MoreFilled, Unlock, EditPen, Fold, Expand } from '@element-plus/icons-vue'
import type { DocumentSummary } from '../../../api/documents'
import type { GraphNode } from '../../../types/nodeGraph'
import { nodeTypeSpec } from './nodeTypes'

const props = defineProps<{
  node: GraphNode
  selected: boolean
  /** 搜索命中的当前节点：加一圈高亮。 */
  highlighted?: boolean
  /** 只读模式：隐藏所有编辑入口。 */
  readonly?: boolean
  /** 上下游追踪时，无关节点变暗。 */
  dimmed?: boolean
  /** 未解决的评论数。 */
  commentCount?: number
  canvases: DocumentSummary[]
}>()

const emit = defineEmits<{
  openPanel: [id: string]
  openEditor: [id: string]
  dragStart: [event: PointerEvent, node: GraphNode]
  connectStart: [event: PointerEvent, node: GraphNode]
  resizeStart: [event: PointerEvent, node: GraphNode]
  rename: [id: string, title: string]
  quickEdit: [id: string, html: string]
  toggleCollapse: [id: string]
  toggleLock: [id: string]
  contextMenu: [event: MouseEvent, node: GraphNode]
  openComments: [id: string]
}>()

const spec = computed(() => nodeTypeSpec(props.node.type))
const accent = computed(() => props.node.color || spec.value.accent)

const style = computed(() => ({
  transform: 'translate(' + props.node.x + 'px,' + props.node.y + 'px)',
  width: props.node.width + 'px',
  height: (props.node.collapsed ? 44 : props.node.height) + 'px',
  '--ng-accent': accent.value,
}))

const SIDES = ['top', 'right', 'bottom', 'left'] as const
/** 侧边的 hover 锚点：跟着指针停在边框任意像素，同 excalidraw。 */
const hoverAnchor = ref<{ side: string; x: number; y: number } | null>(null)

function onSideMove(event: PointerEvent, side: string) {
  const x = side === 'left' ? 0 : side === 'right' ? props.node.width : event.offsetX
  const y = side === 'top' ? 0 : side === 'bottom' ? props.node.height : event.offsetY
  hoverAnchor.value = { side, x, y }
}

function clearAnchor() {
  hoverAnchor.value = null
}

// ---------- 内联改标题 ----------
const renaming = ref(false)
const titleDraft = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

async function startRename() {
  if (props.readonly || props.node.locked) return
  renaming.value = true
  titleDraft.value = props.node.title
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  const next = titleDraft.value.trim()
  if (next !== props.node.title) emit('rename', props.node.id, next)
}

// ---------- 正文内联编辑 ----------
const editingBody = ref(false)
const bodyEl = ref<HTMLElement | null>(null)

async function startQuickEdit() {
  if (props.readonly || props.node.locked || props.node.type !== 'richtext') return
  editingBody.value = true
  await nextTick()
  bodyEl.value?.focus()
}

function commitQuickEdit() {
  if (!editingBody.value) return
  editingBody.value = false
  emit('quickEdit', props.node.id, bodyEl.value?.innerHTML || '')
}

function onNodeDrag(event: PointerEvent) {
  if (props.node.locked || props.readonly) return
  emit('dragStart', event, props.node)
}

/** 富文本正文区双击 = 内联改标题；画布节点保持「双击打开画布」。 */
function onBodyDblClick(event: MouseEvent) {
  if (props.node.type !== 'richtext') return
  event.stopPropagation()
  void startRename()
}
</script>

<template>
  <div
    class="ng-node"
    :class="{
      'ng-node--selected': selected,
      'ng-node--highlighted': highlighted,
      'ng-node--locked': node.locked,
      'ng-node--collapsed': node.collapsed,
      'ng-node--dimmed': dimmed,
      'ng-node--readonly': readonly,
    }"
    :style="style"
    :data-node-id="node.id"
    tabindex="0"
    role="button"
    :aria-label="(node.title || '未命名节点') + '，' + spec.label + '节点'"
    @pointerdown.stop="onNodeDrag"
    @click.stop="emit('openPanel', node.id)"
    @dblclick.stop="emit('openEditor', node.id)"
    @contextmenu.prevent.stop="emit('contextMenu', $event, node)"
    @keydown.enter.prevent="emit('openPanel', node.id)"
    @pointerleave="clearAnchor"
  >
    <button
      type="button"
      class="ng-node__icon"
      :title="spec.label + '：单击查看属性，双击编辑内容'"
      @pointerdown.stop
      @click.stop="emit('openPanel', node.id)"
    >
      <el-icon><component :is="spec.icon" /></el-icon>
    </button>

    <div class="ng-node__main" :class="{ 'is-editing': editingBody }">
      <input
        v-if="renaming"
        ref="titleInput"
        v-model="titleDraft"
        class="ng-node__title-input"
        maxlength="120"
        @pointerdown.stop
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="renaming = false"
        @blur="commitRename"
      />
      <component
        :is="spec.body"
        v-else-if="!node.collapsed && !editingBody"
        :node="node"
        :canvases="canvases"
        @dblclick="onBodyDblClick"
      />
      <div
        v-else-if="editingBody"
        ref="bodyEl"
        class="ng-node__inline-editor"
        contenteditable="true"
        spellcheck="false"
        @pointerdown.stop
        @click.stop
        @dblclick.stop
        @blur="commitQuickEdit"
        v-html="node.content || '<p></p>'"
      ></div>
    </div>

    <!-- 悬停时的节点操作：锁定 / 折叠 / 内联编辑 / 评论 -->
    <div v-if="!readonly" class="ng-node__tools" @pointerdown.stop @click.stop>
      <button type="button" :title="node.locked ? '解锁' : '锁定'" @click="emit('toggleLock', node.id)">
        <el-icon><Lock v-if="node.locked" /><Unlock v-else /></el-icon>
      </button>
      <button type="button" :title="node.collapsed ? '展开' : '折叠'" @click="emit('toggleCollapse', node.id)">
        <el-icon><Expand v-if="node.collapsed" /><Fold v-else /></el-icon>
      </button>
      <button v-if="node.type === 'richtext'" type="button" title="内联编辑正文" @click="startQuickEdit">
        <el-icon><EditPen /></el-icon>
      </button>
      <button type="button" title="节点菜单" @click="emit('contextMenu', $event as unknown as MouseEvent, node)">
        <el-icon><MoreFilled /></el-icon>
      </button>
    </div>

    <button
      v-if="commentCount"
      type="button"
      class="ng-node__comments"
      :title="commentCount + ' 条评论'"
      @pointerdown.stop
      @click.stop="emit('openComments', node.id)"
    >
      <el-icon><ChatDotRound /></el-icon>{{ commentCount }}
    </button>

    <!-- 进度条：只在设置过进度且未折叠时出现 -->
    <template v-if="typeof node.progress === 'number' && !node.collapsed">
      <div class="ng-node__progress">
        <i :style="{ width: Math.max(0, Math.min(100, node.progress)) + '%' }"></i>
      </div>
      <span class="ng-node__progress-pct">{{ node.progress }}%</span>
    </template>

    <template v-if="!node.collapsed && !readonly">
      <span
        v-for="side in SIDES"
        :key="side"
        class="ng-node__side"
        :class="'ng-node__side--' + side"
        :data-anchor="side"
        @pointerdown.stop="emit('connectStart', $event, node)"
        @pointermove.stop="onSideMove($event, side)"
        @pointerleave="clearAnchor"
      ></span>

      <span
        v-if="hoverAnchor"
        class="ng-node__anchor-dot"
        :style="{ left: hoverAnchor.x + 'px', top: hoverAnchor.y + 'px' }"
      ></span>

      <span
        class="ng-node__resize"
        title="拖拽调整节点大小"
        @pointerdown.stop="emit('resizeStart', $event, node)"
      ></span>
    </template>

    <span class="ng-node__type">{{ node.collapsed ? '已折叠' : spec.label }}</span>
  </div>
</template>

<style scoped>
.ng-node {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  cursor: grab;
  user-select: none;
  transform-origin: 0 0;
  outline: none;
}

.ng-node:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ng-accent) 35%, transparent);
}

.ng-node--selected {
  border-color: var(--ng-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ng-accent) 22%, transparent);
}

.ng-node--highlighted {
  border-color: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35), 0 6px 20px rgba(245, 158, 11, 0.25);
}

.ng-node--locked {
  cursor: default;
  background-image: repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.08) 0 6px, transparent 6px 12px);
}

.ng-node--dimmed {
  opacity: 0.35;
}

.ng-node--collapsed {
  align-items: center;
  padding-top: 6px;
  padding-bottom: 6px;
}

.ng-node--readonly {
  cursor: default;
}

/* 进度：卡片底边一条细进度条 + 左下角百分比。 */
.ng-node__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  border-radius: 0 0 9px 9px;
  background: #eef0f3;
  overflow: hidden;
}

.ng-node__progress i {
  display: block;
  height: 100%;
  background: var(--ng-accent);
  transition: width 0.15s ease;
}

.ng-node__progress-pct {
  position: absolute;
  left: 8px;
  bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #8b929b;
}

.ng-node__icon {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ng-accent) 12%, #fff);
  color: var(--ng-accent);
  cursor: pointer;
  font-size: 15px;
}

.ng-node__icon:hover {
  background: color-mix(in srgb, var(--ng-accent) 22%, #fff);
}

.ng-node__main {
  flex: 1;
  min-width: 0;
}

.ng-node__title-input {
  width: 100%;
  border: 1px solid var(--ng-accent);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  outline: none;
}

/* 内联编辑：限制高度 + 滚动，保持节点卡片尺寸不变 */
.ng-node__inline-editor {
  max-height: 74px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
  outline: 1px dashed var(--ng-accent);
  border-radius: 6px;
  padding: 4px 6px;
  cursor: text;
}

.ng-node__inline-editor :deep(p) {
  margin: 0 0 4px;
}

.ng-node__type {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 10px;
  color: #9ca3af;
  pointer-events: none;
}

/* 悬停工具条 */
.ng-node__tools {
  position: absolute;
  top: -30px;
  right: 0;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  z-index: 6;
}

.ng-node:hover .ng-node__tools,
.ng-node:focus-within .ng-node__tools {
  opacity: 1;
  pointer-events: auto;
}

.ng-node__tools button {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5f6368;
  font-size: 12px;
  cursor: pointer;
}

.ng-node__tools button:hover {
  background: #eef2ff;
  color: #2563eb;
}

/* 评论角标 */
.ng-node__comments {
  position: absolute;
  right: -8px;
  top: -8px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid #fbbf24;
  background: #fffbeb;
  color: #b45309;
  font-size: 11px;
  cursor: pointer;
  z-index: 5;
}

/* 四条可吸附的边框：整条边都能起连线，不是只有中点一个点 */
.ng-node__side {
  position: absolute;
  cursor: crosshair;
  z-index: 2;
}

.ng-node__side::after {
  content: '';
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--ng-accent);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.ng-node:hover .ng-node__side::after,
.ng-node--selected .ng-node__side::after {
  opacity: 1;
}

.ng-node__side:hover::after {
  opacity: 0;
}

.ng-node__side--top {
  top: -6px;
  left: 0;
  right: 0;
  height: 12px;
}

.ng-node__side--top::after,
.ng-node__side--bottom::after {
  left: 50%;
  margin-left: -5px;
}

.ng-node__side--top::after {
  top: 1px;
}

.ng-node__side--bottom {
  bottom: -6px;
  left: 0;
  right: 0;
  height: 12px;
}

.ng-node__side--bottom::after {
  bottom: 1px;
}

.ng-node__side--left {
  left: -6px;
  top: 0;
  bottom: 0;
  width: 12px;
}

.ng-node__side--left::after,
.ng-node__side--right::after {
  top: 50%;
  margin-top: -5px;
}

.ng-node__side--left::after {
  left: 1px;
}

.ng-node__side--right {
  right: -6px;
  top: 0;
  bottom: 0;
  width: 12px;
}

.ng-node__side--right::after {
  right: 1px;
}

/* 指针位置的吸附点 */
.ng-node__anchor-dot {
  position: absolute;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  border-radius: 50%;
  background: var(--ng-accent);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--ng-accent);
  pointer-events: none;
  z-index: 3;
}

/* 右下角缩放手柄 */
.ng-node__resize {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 14px;
  height: 14px;
  border-right: 2px solid var(--ng-accent);
  border-bottom: 2px solid var(--ng-accent);
  border-radius: 0 0 4px 0;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 4;
}

.ng-node:hover .ng-node__resize,
.ng-node--selected .ng-node__resize {
  opacity: 1;
}
</style>
