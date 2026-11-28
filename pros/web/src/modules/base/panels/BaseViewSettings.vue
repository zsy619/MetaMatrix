<script setup lang="ts">
/**
 * 视图配置：名称、字段显隐、列宽。
 *
 * 配置写回视图记录（base_views.config），
 * 切换视图时自动生效，换设备也保持一致。
 */
import { ref, watch } from 'vue'
import type { BaseView, FieldMeta, PersonalViewConfig } from '../types'

const props = defineProps<{
  view: BaseView
  fields: FieldMeta[]
  /** 当前用户 ID：个人偏好按它分桶。 */
  userId?: string
}>()

export type ViewSettingsPayload = {
  name: string
  /** 是否只保存为个人偏好。 */
  personal: boolean
  /** 本次编辑出来的「显隐 / 列宽 / 布局」。 */
  edited: PersonalViewConfig
  /** 视图当前的共享部分原值（个人模式下要原样保留）。 */
  shared: PersonalViewConfig
}

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: ViewSettingsPayload): void
}>()

const name = ref(props.view.name)
const visibility = ref<Record<string, boolean>>({})
const widths = ref<Record<string, number>>({})
/** 画廊卡片要展示的字段（按勾选顺序）。 */
const galleryFields = ref<string[]>([])
/** 冻结列（字段 ID 列表，从左起连续）。 */
const frozenFields = ref<string[]>([])
/**
 * 只保存为「我的偏好」。
 *
 * 共享视图里，字段显隐 / 列宽默认是所有人共用的 —— 一个人改了别人也跟着变。
 * 打开这个开关后，配置写进 config.personal[userId]，只影响自己。
 */
const personalOnly = ref(false)

watch(
  () => props.view,
  (view) => {
    name.value = view.name
    const mine = props.userId ? view.config?.personal?.[props.userId] : undefined
    const vis = { ...(view.config?.fieldVisibility ?? {}), ...(mine?.fieldVisibility ?? {}) }
    const w = { ...(view.config?.fieldWidths ?? {}), ...(mine?.fieldWidths ?? {}) }
    visibility.value = {}
    widths.value = {}
    for (const field of props.fields) {
      visibility.value[field.id] = vis[field.id] !== false
      widths.value[field.id] = w[field.id] ?? (field.isPrimary ? 200 : 140)
    }
    const layout = {
      ...((view.config?.layout ?? {}) as Record<string, unknown>),
      ...(mine?.layout ?? {}),
    } as { galleryFields?: string[] }
    galleryFields.value = Array.isArray(layout.galleryFields) ? [...layout.galleryFields] : []
    const frozenMine = mine?.frozenFields
    const frozenShared = view.config?.frozenFields
    frozenFields.value = Array.isArray(frozenMine)
      ? [...frozenMine]
      : Array.isArray(frozenShared)
        ? [...frozenShared]
        : []
    // 已经有个人偏好的，默认停在「仅我的偏好」上。
    personalOnly.value = Boolean(mine)
  },
  { immediate: true, deep: true },
)

function save() {
  const layout = {
    ...((props.view.config?.layout ?? {}) as Record<string, unknown>),
    galleryFields: galleryFields.value,
  }
  emit('save', {
    name: name.value.trim() || props.view.name,
    personal: personalOnly.value,
    edited: {
      fieldVisibility: visibility.value,
      fieldWidths: widths.value,
      frozenFields: frozenFields.value,
      layout,
    },
    shared: {
      fieldVisibility: props.view.config?.fieldVisibility ?? {},
      fieldWidths: props.view.config?.fieldWidths ?? {},
      frozenFields: props.view.config?.frozenFields ?? [],
      layout: (props.view.config?.layout ?? {}) as Record<string, unknown>,
    },
  })
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="视图配置"
    width="620px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <el-input v-model="name" placeholder="视图名称" maxlength="40" show-word-limit />

      <div class="be-panel__hint">字段显隐与列宽会保存到当前视图，切换视图时自动生效。</div>

      <div class="be-vs__scope">
        <el-checkbox v-model="personalOnly" class="be-vs__scope-check">
          仅保存为我的偏好
        </el-checkbox>
        <div class="be-panel__hint">
          {{
            personalOnly
              ? '字段显隐与列宽只写入你的个人偏好，不影响其他成员的视图。'
              : '字段显隐与列宽是视图的共享配置，任何成员修改后其他成员也会看到。'
          }}
        </div>
      </div>

      <template v-if="view.type === 'gallery'">
        <div class="be-panel__hint">画廊卡片展示的字段（按勾选顺序，最多 4 个）。</div>
        <el-select
          v-model="galleryFields"
          multiple
          :multiple-limit="4"
          placeholder="选择卡片字段"
          style="width: 100%"
        >
          <el-option
            v-for="field in fields.filter((item) => !item.isPrimary)"
            :key="field.id"
            :label="field.name"
            :value="field.id"
          />
        </el-select>
      </template>

      <div class="be-vs__frozen">
        <div class="be-panel__hint">
          冻结列：选中的列会固定在左侧，横向滚动时保持可见（需从左起连续选择）。
        </div>
        <el-select
          v-model="frozenFields"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="不冻结"
          style="width: 100%"
        >
          <el-option
            v-for="field in fields.filter((item) => visibility[item.id] !== false)"
            :key="field.id"
            :label="field.name"
            :value="field.id"
          />
        </el-select>
      </div>

      <div class="be-view-settings__list">
        <div v-for="field in fields" :key="field.id" class="be-view-settings__row">
          <el-checkbox v-model="visibility[field.id]">{{ field.name }}</el-checkbox>
          <el-input-number
            v-model="widths[field.id]"
            :min="80"
            :max="600"
            :step="20"
            size="small"
            controls-position="right"
            :disabled="visibility[field.id] === false"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-vs__scope {
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--tg-border, #e2e8f0);
  border-radius: 12px;
  background: var(--tg-surface-2, #f8fafc);
}

.be-vs__scope-check {
  height: auto;
  margin-bottom: 4px;
}

.be-view-settings__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.be-view-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-sm);
}
</style>
