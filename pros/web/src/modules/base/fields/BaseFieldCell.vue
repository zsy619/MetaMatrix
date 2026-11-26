<script setup lang="ts">
/**
 * 字段单元格：按类型渲染与编辑。
 *
 * 渲染与编辑分离：Grid 里展示用 renderer，编辑时用 editor；
 * 公式字段只读，值由服务端计算。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Paperclip, Picture } from '@element-plus/icons-vue'
import { uploadMediaFile } from '../../../api/mediaUpload'
import { fieldPlugin } from './registry'
import type { FieldMeta } from '../types'

const props = defineProps<{
  field: FieldMeta
  modelValue: unknown
  editable?: boolean
  /** 所在行 ID（键盘导航用）。 */
  rowId?: string
  /** 是否是当前聚焦单元格。 */
  focused?: boolean
  /** 编辑信号：序号变化且命中本单元格时进入编辑。 */
  editSignal?: { key: string; seq: number }
  /** 关联文档字段的标题映射（节点 ID → 标题）。 */
  docTitles?: Record<string, string>
  /** 关联文档字段的可选文档。 */
  docOptions?: Array<{ id: string; title: string }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void
  (e: 'request-detail'): void
  (e: 'open-doc', nodeId: string): void
}>()

const plugin = computed(() => fieldPlugin(props.field.type))
const editing = ref(false)
const draft = ref<unknown>(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    if (!editing.value) draft.value = value
  },
)

const options = computed<string[]>(() => {
  const raw = props.field.config?.options
  return Array.isArray(raw) ? raw.map((item) => String(item)) : []
})

// —— 附件 ——

/** 附件值格式：`url#文件名`（文件名可缺省，缺省时回退到 URL 末段）。 */
const attachmentItems = computed(() =>
  (Array.isArray(props.modelValue) ? props.modelValue.map((item) => String(item)) : []).map((raw) => {
    const [url, namePart] = raw.split('#')
    const fallback = url.split('?')[0].split('#')[0].split('/').pop() || '附件'
    let name = fallback
    if (namePart) {
      try {
        name = decodeURIComponent(namePart)
      } catch {
        name = namePart
      }
    }
    return { raw, url, name }
  }),
)

const attachmentUrls = computed<string[]>(() => attachmentItems.value.map((item) => item.raw))

const attachmentMax = computed(() => {
  const raw = Number(props.field.config?.maxCount ?? 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 10
})

const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url.split('#')[0])

const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function onPickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (attachmentUrls.value.length >= attachmentMax.value) {
    ElMessage.warning(`最多上传 ${attachmentMax.value} 个附件`)
    return
  }
  uploading.value = true
  try {
    const stored = await uploadMediaFile(file, { mediaType: 'file' })
    const url = stored.previewUrl || stored.insertedPath
    draft.value = [...attachmentUrls.value, `${url}#${encodeURIComponent(file.name || '附件')}`]
    commit()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '附件上传失败')
  } finally {
    uploading.value = false
  }
}

function removeAttachment(index: number) {
  draft.value = attachmentUrls.value.filter((_, i) => i !== index)
  commit()
}

const docIds = computed<string[]>(() =>
  Array.isArray(props.modelValue) ? props.modelValue.map((item) => String(item)) : [],
)

const docTitle = (id: string) => props.docTitles?.[id] ?? '未命名文档'

const display = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined || value === '') return ''
  switch (props.field.type) {
    case 'checkbox':
      return value ? '是' : '否'
    case 'multi_select':
    case 'user':
    case 'link':
      return Array.isArray(value) ? value.join('、') : String(value)
    case 'currency':
      return `¥${Number(value).toLocaleString('zh-CN')}`
    case 'percent':
      return `${Number(value)}%`
    case 'rating':
      return '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(value)))))
    case 'formula':
      return String(value)
    default:
      return String(value)
  }
})

const isEmpty = computed(() => display.value === '')

function startEdit() {
  if (!props.editable || props.field.type === 'formula') return
  editing.value = true
  draft.value = props.modelValue
}

/** 双击：可编辑字段直接进入编辑；只读字段（公式）交由上层打开详情。 */
function onDoubleClick() {
  if (!props.editable || props.field.type === 'formula') {
    emit('request-detail')
    return
  }
  startEdit()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const normalized = plugin.value?.normalize(draft.value, props.field.config ?? {}) ?? draft.value
  emit('update:modelValue', normalized)
}

/** 键盘导航：编辑信号命中本单元格时进入编辑态。 */
watch(
  () => props.editSignal?.seq,
  (seq) => {
    if (!seq) return
    const key = `${props.rowId ?? ''}:${props.field.id}`
    if (props.editSignal?.key === key) startEdit()
  },
)

</script>

<template>
  <div
    class="base-cell"
    @dblclick.stop="onDoubleClick"
    :class="{
      'is-empty': isEmpty,
      'is-computed': field.type === 'formula',
      'is-focused': focused,
    }"
  >
    <template v-if="editing">
      <el-checkbox v-if="field.type === 'checkbox'" v-model="draft" @change="commit" />
      <el-select
        v-else-if="field.type === 'single_select'"
        v-model="draft"
        size="small"
        filterable
        @change="commit"
      >
        <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
      </el-select>
      <el-select
        v-else-if="field.type === 'multi_select'"
        v-model="draft"
        size="small"
        multiple
        filterable
        @change="commit"
      >
        <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
      </el-select>
      <el-input-number
        v-else-if="['number', 'currency', 'percent', 'rating'].includes(field.type)"
        v-model="draft"
        size="small"
        controls-position="right"
        :min="field.type === 'rating' ? 0 : undefined"
        :max="field.type === 'rating' ? 5 : undefined"
        @change="commit"
      />
      <el-date-picker
        v-else-if="field.type === 'date'"
        v-model="draft"
        type="date"
        size="small"
        value-format="YYYY-MM-DD"
        @change="commit"
      />
      <el-date-picker
        v-else-if="field.type === 'datetime'"
        v-model="draft"
        type="datetime"
        size="small"
        value-format="YYYY-MM-DD HH:mm:ss"
        @change="commit"
      />
      <el-select
        v-else-if="field.type === 'doc'"
        v-model="draft"
        size="small"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        placeholder="选择文档"
        @change="commit"
      >
        <el-option
          v-for="doc in docOptions ?? []"
          :key="doc.id"
          :label="doc.title"
          :value="doc.id"
        />
      </el-select>
      <div v-else-if="field.type === 'attachment'" class="base-cell__upload">
        <div v-if="attachmentItems.length" class="base-cell__files">
          <span v-for="(item, index) in attachmentItems" :key="item.raw" class="base-cell__file">
            <el-icon class="base-cell__file-icon"><Paperclip /></el-icon>
            <a :href="item.url" target="_blank" rel="noreferrer" class="base-cell__file-name">
              {{ item.name }}
            </a>
            <button
              type="button"
              class="base-cell__file-remove"
              title="移除附件"
              @click.stop="removeAttachment(index)"
            >
              ×
            </button>
          </span>
        </div>
        <el-button
          size="small"
          text
          :icon="Picture"
          :loading="uploading"
          @click="fileInput?.click()"
        >
          上传附件
        </el-button>
        <input ref="fileInput" type="file" class="base-cell__file-input" @change="onPickFile" />
      </div>
      <el-input
        v-else
        v-model="draft"
        size="small"
        type="textarea"
        :rows="field.type === 'long_text' ? 3 : 1"
        :autosize="field.type !== 'long_text'"
        @blur="commit"
        @keyup.enter="commit"
      />
    </template>
    <span v-else-if="field.type === 'doc'" class="base-cell__doc">
      <template v-if="docIds.length">
        <a
          v-for="id in docIds"
          :key="id"
          class="base-cell__doc-link"
          role="link"
          @click.stop.prevent="emit('open-doc', id)"
          @dblclick.stop
        >
          {{ docTitle(id) }}
        </a>
      </template>
      <span v-else class="base-cell__text is-empty">—</span>
    </span>
    <div v-else-if="field.type === 'attachment'" class="base-cell__attach">
      <template v-if="attachmentItems.length">
        <span
          v-for="item in attachmentItems"
          :key="item.raw"
          class="base-cell__attach-item"
          :title="item.name"
        >
          <img v-if="isImageUrl(item.url)" :src="item.url" class="base-cell__attach-img" alt="" />
          <span v-else class="base-cell__attach-chip">
            <el-icon><Paperclip /></el-icon>{{ item.name }}
          </span>
        </span>
      </template>
      <span v-else class="base-cell__text is-empty">—</span>
    </div>
    <span v-else class="base-cell__text">{{ display }}</span>
  </div>
</template>

<style scoped>
.base-cell {
  min-height: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.base-cell__text {
  cursor: default;
  word-break: break-word;
}

.base-cell.is-empty .base-cell__text::before {
  content: '';
  display: inline-block;
  min-width: 12px;
}

.base-cell.is-computed .base-cell__text {
  color: var(--tg-text-2, #64748b);
  font-variant-numeric: tabular-nums;
}

.base-cell__doc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.base-cell__doc-link {
  color: var(--tg-blue);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.base-cell__doc-link:hover {
  border-bottom-color: currentColor;
}

.base-cell.is-focused {
  outline: 2px solid var(--tg-blue, #3390ec);
  outline-offset: -2px;
  border-radius: 6px;
}

.base-cell__upload {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.base-cell__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.base-cell__file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--tg-surface-2, #f1f5f9);
  font-size: 12px;
}

.base-cell__file-icon {
  font-size: 12px;
  color: var(--tg-text-2, #64748b);
}

.base-cell__file-name {
  color: var(--tg-blue, #3390ec);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.base-cell__file-remove {
  border: none;
  background: transparent;
  color: var(--tg-text-2, #64748b);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.base-cell__file-remove:hover {
  color: var(--tg-danger, #ef4444);
}

.base-cell__file-input {
  display: none;
}

.base-cell__attach {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.base-cell__attach-img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--tg-border, #e6e9ef);
}

.base-cell__attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--tg-surface-2, #f1f5f9);
  font-size: 12px;
}
</style>
