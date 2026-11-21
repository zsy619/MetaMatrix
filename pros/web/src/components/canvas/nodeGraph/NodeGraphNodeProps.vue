<script setup lang="ts">
/**
 * 节点属性面板（单击节点打开）。
 *
 * 名称与描述可以改；类型是节点的隐含属性，创建时选定就不可更改。
 */
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import type { DocumentSummary } from '../../../api/documents'
import type { GraphNode } from '../../../types/nodeGraph'
import { TEMPLATE_META, type TemplateId } from '../../../stores/document'
import { useNodeGraphStore } from '../../../stores/nodeGraph'
import { nodeTypeSpec } from './nodeTypes'

const props = defineProps<{ node: GraphNode; canvases: DocumentSummary[] }>()
const store = useNodeGraphStore()

const spec = computed(() => nodeTypeSpec(props.node.type))
const comments = computed(() => store.commentsOf(props.node.id))
const history = computed(() => store.nodeHistory(props.node.id))
import { DEFAULT_NODE_COLOR, NODE_COLORS } from './colors'

function setTags(value: string) {
  const tags = value.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
  store.updateNode(props.node.id, { tags })
}

function onCommentEnter(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  store.addComment(props.node.id, input.value)
  input.value = ''
}

/** 画布节点的目标：92 个画布之一，或本项目里的画布。 */
/**
 * 删除节点。
 *
 * 富文本节点的正文存在节点里，删除节点等于连正文一起删掉；
 * 画布节点只是「引用」了一张画布，删节点不动被引用的画布内容。
 */
async function removeNode() {
  const isRichText = props.node.type === 'richtext'
  try {
    await ElMessageBox.confirm(
      isRichText
        ? '删除这个富文本节点？节点与正文会一起删除，无法恢复。'
        : '删除这个画布节点？只移除节点，被引用的画布内容会保留。',
      '确认删除节点？',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    throw err
  }
  store.removeNodes([props.node.id])
  store.closePanel()
  ElMessage.success('节点已删除')
}

/** 进度：0–100 的整数。 */
function setProgress(value: number) {
  const progress = Math.max(0, Math.min(100, Math.round(value)))
  store.updateNode(props.node.id, { progress })
}

const target = computed(() => {
  if (props.node.type !== 'canvasRef') return null
  const template = props.node.refTemplateId
    ? TEMPLATE_META[props.node.refTemplateId as TemplateId]
    : null
  // 绑了项目画布就以它为准（模板画布保存后会落一份副本并绑定）；
  // 没绑的才显示模板本身。
  if (props.node.refCanvasId) {
    const doc = props.canvases.find((item) => item.id === props.node.refCanvasId)
    return {
      name: doc?.title || template?.name || '（画布已被删除）',
      desc: template?.description || '',
      missing: !doc,
    }
  }
  if (template) {
    return {
      name: template.name || props.node.refTemplateId || '',
      desc: template.description || '',
      missing: false,
    }
  }
  return { name: '未选择画布', desc: '', missing: true }
})
</script>

<template>
  <div class="ng-props">
    <label class="ng-field">
      <span class="ng-field__label">名称</span>
      <el-input
        :model-value="node.title"
        placeholder="节点名称"
        maxlength="120"
        @update:model-value="(v: string) => store.updateNode(node.id, { title: v })"
      />
    </label>

    <label class="ng-field">
      <span class="ng-field__label">描述</span>
      <el-input
        :model-value="node.description || ''"
        type="textarea"
        :rows="3"
        placeholder="这个节点为什么存在、要说明什么"
        maxlength="500"
        @update:model-value="(v: string) => store.updateNode(node.id, { description: v })"
      />
    </label>

    <div class="ng-field">
      <span class="ng-field__label">进度</span>
      <div class="ng-progress">
        <el-slider
          class="ng-progress__slider"
          :model-value="node.progress ?? 0"
          :min="0"
          :max="100"
          :step="1"
          :show-tooltip="false"
          @update:model-value="(v: number) => setProgress(v)"
        />
        <span class="ng-progress__pct">{{ node.progress ?? 0 }}%</span>
      </div>
    </div>

    <div class="ng-field">
      <span class="ng-field__label">类型</span>
      <div class="ng-type" :style="{ '--accent': spec.accent }">
        <el-icon><component :is="spec.icon" /></el-icon>
        <span>{{ spec.label }}</span>
        <em class="ng-type__lock">创建时选定，不可更改</em>
      </div>
    </div>

    <div class="ng-field">
      <span class="ng-field__label">状态</span>
      <div class="ng-state">
        <el-switch
          :model-value="!!node.locked"
          inline-prompt
          active-text="锁定"
          inactive-text="可编辑"
          @update:model-value="(v: boolean) => store.setLocked([node.id], v)"
        />
        <el-switch
          :model-value="!!node.collapsed"
          inline-prompt
          active-text="折叠"
          inactive-text="展开"
          @update:model-value="(v: boolean) => store.setCollapsed([node.id], v)"
        />
      </div>
    </div>

    <div class="ng-field">
      <span class="ng-field__label">配色</span>
      <div class="ng-colors">
        <button
          v-for="color in NODE_COLORS"
          :key="color"
          type="button"
          class="ng-colors__dot"
          :class="{ 'is-on': node.color === color }"
          :style="{ background: color, color }"
          :aria-label="'节点颜色 ' + color"
          @click="store.setNodeColor([node.id], color)"
        ></button>
        <el-color-picker
          :model-value="node.color || DEFAULT_NODE_COLOR"
          size="small"
          title="自定义颜色"
          @change="(color: string) => store.setNodeColor([node.id], color || undefined)"
        />
        <button
          type="button"
          class="ng-colors__dot ng-colors__dot--reset"
          title="恢复默认"
          @click="store.setNodeColor([node.id], undefined)"
        >×</button>
      </div>
    </div>

    <label class="ng-field">
      <span class="ng-field__label">标签</span>
      <el-input
        :model-value="(node.tags || []).join('，')"
        placeholder="用逗号分隔，例如：核心，待验证"
        maxlength="120"
        @update:model-value="setTags"
      />
    </label>

    <div v-if="target" class="ng-field">
      <span class="ng-field__label">目标画布</span>
      <div class="ng-target" :class="{ 'is-missing': target.missing }">
        <strong>{{ target.name }}</strong>
        <p v-if="target.desc">{{ target.desc }}</p>
      </div>
    </div>

    <div class="ng-field">
      <span class="ng-field__label">评论（{{ comments.length }}）</span>
      <div v-if="comments.length" class="ng-comments">
        <p v-for="item in comments" :key="item.id" :class="{ 'is-resolved': item.resolved }">
          <b>{{ item.author }}</b>{{ item.text }}
        </p>
      </div>
      <el-input
        :model-value="''"
        size="small"
        placeholder="写一条评论，回车提交"
        @keydown.enter.prevent="onCommentEnter"
      />
    </div>

    <div v-if="history.length" class="ng-field">
      <span class="ng-field__label">本次会话修改</span>
      <div class="ng-history-list">
        <span v-for="(item, index) in history.slice(-6)" :key="index">{{ item.label }}</span>
      </div>
    </div>

    <p class="ng-hint">双击节点可以直接编辑内容。</p>

    <el-button class="ng-delete" type="danger" plain :icon="Delete" @click="removeNode">
      删除节点
    </el-button>
  </div>
</template>

<style scoped>
.ng-props {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ng-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ng-field__label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.ng-type {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #2563eb) 10%, #fff);
  color: var(--accent, #2563eb);
  font-size: 13px;
  font-weight: 600;
}

.ng-type__lock {
  margin-left: auto;
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
  color: #8f959e;
}

.ng-target {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7f8fa;
  font-size: 13px;
  color: #1f2937;
}

.ng-target.is-missing {
  background: #fffbeb;
  color: #b45309;
}

.ng-target p {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: #6b7280;
  line-height: 1.5;
}

/* 进度：滑杆 + 百分比，百分比占固定宽度，滑杆不会因为数字变长而抖动。 */
.ng-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ng-progress__slider {
  flex: 1;
  min-width: 0;
}

.ng-progress__pct {
  flex: 0 0 42px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--mm-text);
}

.ng-hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
}

.ng-state {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ng-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.ng-colors__dot {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  cursor: pointer;
}

.ng-colors__dot:hover {
  transform: scale(1.12);
}

.ng-colors__dot.is-on {
  color: inherit;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;
}

.ng-colors__dot--reset {
  background: #fff;
  color: #94a3b8;
  border-style: dashed;
  font-size: 12px;
  line-height: 1;
}

/* 自定义取色器：与色块同尺寸，视觉对齐 */
.ng-colors :deep(.el-color-picker__trigger) {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 6px;
}

.ng-comments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ng-comments p {
  margin: 0;
  padding: 6px 8px;
  border-radius: 7px;
  background: #f7f8fa;
  font-size: 12px;
  line-height: 1.5;
  color: #4b5563;
}

.ng-comments p.is-resolved {
  opacity: 0.55;
  text-decoration: line-through;
}

.ng-comments b {
  margin-right: 6px;
  color: #1f2937;
}

.ng-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ng-history-list span {
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 11px;
  color: #64748b;
}

.ng-delete {
  align-self: flex-start;
}
</style>
