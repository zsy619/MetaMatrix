<script setup lang="ts">
/**
 * 记录详情抽屉：逐字段查看与编辑。
 *
 * 编辑结果通过事件抛给上层统一处理（乐观更新 + 乐观锁），
 * 组件本身不直接调接口，保证写入路径只有一条。
 */
import { computed, ref, watch } from 'vue'
import { Delete, Document, Link, Lock, Share, Unlock, User } from '@element-plus/icons-vue'
import BaseFieldCell from '../fields/BaseFieldCell.vue'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import {
  listRecordDocReferences,
  listRecordGrants,
  listRecordRelations,
  type RecordDocReference,
  type RecordRelationSet,
} from '../api'
import { listSpaceMembers, type SpaceMember } from '../../../api/knowledge_v6'
import type { FieldMeta, RecordGrant, RecordRow, RecordVisibility } from '../types'
import { isComputedField } from '../fields/registry'

const props = defineProps<{
  row?: RecordRow
  fields: FieldMeta[]
  editable?: boolean
  /** 空间 ID：用于反查「引用本记录的文档」。 */
  projectId?: string
  /** 关联记录字段：记录 ID → 标题。 */
  linkTitles?: Record<string, string>
  /** 关联记录字段：按目标表分组的候选记录。 */
  linkOptions?: Record<string, Array<{ id: string; title: string }>>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', payload: { fieldId: string; value: unknown }): void
  (e: 'update-visibility', payload: { visibility: RecordVisibility; grants?: string[] }): void
  (e: 'delete', recordId: string): void
  (e: 'open-node', nodeId: string): void
  (e: 'open-record-ref', payload: { tableId: string; recordId: string; title: string }): void
}>()

/** 引用本记录的文档。 */
const docRefs = ref<RecordDocReference[]>([])
const docRefsLoading = ref(false)
/** 关联记录（正向 / 反向）。 */
const relations = ref<RecordRelationSet | null>(null)
const relationsLoading = ref(false)

async function loadRelations(recordId: string) {
  if (!props.projectId) {
    relations.value = null
    return
  }
  relationsLoading.value = true
  try {
    relations.value = await listRecordRelations(props.projectId, recordId)
  } catch {
    relations.value = null
  } finally {
    relationsLoading.value = false
  }
}

async function loadDocRefs(recordId: string) {
  if (!props.projectId) {
    docRefs.value = []
    return
  }
  docRefsLoading.value = true
  try {
    docRefs.value = await listRecordDocReferences(props.projectId, recordId)
  } catch {
    docRefs.value = []
  } finally {
    docRefsLoading.value = false
  }
}

watch(
  () => props.row?.id,
  (id) => {
    if (id) {
      void loadDocRefs(id)
      void loadRelations(id)
    } else {
      docRefs.value = []
      relations.value = null
    }
  },
  { immediate: true },
)

const orderedFields = computed(() => {
  const primary = props.fields.filter((item) => item.isPrimary)
  const rest = props.fields.filter((item) => !item.isPrimary)
  return [...primary, ...rest]
})

/** 关联记录字段的目标表 ID（未配置时用当前表兜底）。 */
function linkTargetTableOf(fieldId: string): string {
  const field = props.fields.find((item) => item.id === fieldId)
  if (!field || field.type !== 'link') return ''
  const target = field.config?.targetTableId
  return typeof target === 'string' ? target : ''
}

/** 当前记录的可见范围（默认空间可见）。 */
const visibility = computed<RecordVisibility>(() => props.row?.visibility ?? 'space')

/** 受限记录：仅创建者与空间管理者可见。 */
const isRestricted = computed(() => visibility.value === 'restricted')

/** 指定成员可见：需要挑人。 */
const isCustom = computed(() => visibility.value === 'custom')

/** 可见范围标签文案。 */
const scopeLabel = computed(() => {
  if (visibility.value === 'restricted') return '仅自己可见'
  if (visibility.value === 'custom') return `指定成员（${grantUserIds.value.length} 人）`
  return '空间可见'
})

/** 可见范围选项。 */
const VISIBILITY_OPTIONS: Array<{ value: RecordVisibility; label: string; hint: string }> = [
  { value: 'space', label: '空间可见', hint: '空间内所有成员都能看到这条记录' },
  { value: 'restricted', label: '仅自己可见', hint: '只有创建者与空间管理者能看到这条记录' },
  { value: 'custom', label: '指定成员可见', hint: '只有你选中的成员能看到这条记录' },
]

/** 空间成员（用于挑选可见成员）。 */
const spaceMembers = ref<SpaceMember[]>([])
const membersLoading = ref(false)
/** 已授权的可见成员。 */
const grants = ref<RecordGrant[]>([])
/** 正在编辑的可见成员（多选）。 */
const grantUserIds = ref<string[]>([])

async function loadMembers() {
  if (!props.projectId || spaceMembers.value.length) return
  membersLoading.value = true
  try {
    spaceMembers.value = await listSpaceMembers(props.projectId)
  } catch {
    spaceMembers.value = []
  } finally {
    membersLoading.value = false
  }
}

async function loadGrants(recordId: string) {
  if (!props.projectId) {
    grants.value = []
    grantUserIds.value = []
    return
  }
  try {
    grants.value = await listRecordGrants(props.projectId, recordId)
    grantUserIds.value = grants.value.map((item) => item.userId)
  } catch {
    grants.value = []
    grantUserIds.value = []
  }
}

watch(
  () => props.row?.id,
  (id) => {
    if (id) {
      void loadGrants(id)
      void loadMembers()
    } else {
      grants.value = []
      grantUserIds.value = []
    }
  },
  { immediate: true },
)

/** 该字段是否因「条件可见」策略而对本记录隐藏（第十五轮）。 */
function isCondHidden(fieldId: string): boolean {
  return !!props.row?.conditionalHidden?.includes(fieldId)
}

/** 可见成员下拉的可选项（已授权的 + 空间成员）。 */
const grantOptions = computed(() => {
  const map = new Map<string, { value: string; label: string }>()
  for (const item of spaceMembers.value) {
    map.set(item.userId, { value: item.userId, label: item.name || item.email })
  }
  for (const item of grants.value) {
    if (!map.has(item.userId)) {
      map.set(item.userId, { value: item.userId, label: item.name || item.userId.slice(0, 8) })
    }
  }
  return Array.from(map.values())
})

/** 切换可见范围。 */
function onVisibilityChange(value: RecordVisibility) {
  if (value === 'custom') {
    // 选人时先不给名单，等用户挑完再提交。
    emit('update-visibility', { visibility: 'custom', grants: grantUserIds.value })
    return
  }
  emit('update-visibility', { visibility: value })
}

/** 可见成员变化：立刻提交（与范围切换分开，避免误改范围）。 */
function onGrantsChange(value: string[]) {
  grantUserIds.value = value
  if (visibility.value === 'custom') {
    emit('update-visibility', { visibility: 'custom', grants: value })
  }
}

/** 按空间角色批量授权（把该角色的成员全部加入可见名单）。 */
function grantByRole(role: SpaceMember['role']) {
  const ids = new Set(grantUserIds.value)
  for (const item of spaceMembers.value) {
    if (item.role === role) ids.add(item.userId)
  }
  const next = Array.from(ids)
  onGrantsChange(next)
}

/** 清空可见名单。 */
function clearGrants() {
  onGrantsChange([])
}
</script>

<template>
  <el-drawer
    :model-value="true"
    :title="row ? '记录详情' : '记录'"
    size="440px"
    append-to-body
    modal-class="be-modal be-drawer"
    destroy-on-close
    @close="emit('close')"
  >
    <div v-if="row" class="be-record">
      <div v-for="field in orderedFields" :key="field.id" class="be-record__field">
        <div class="be-record__label">
          <el-icon
            class="be-record__type-icon"
            :style="{ color: fieldTypeColor(field.type) }"
          >
            <component :is="fieldTypeIcon(field.type)" />
          </el-icon>
          <span>{{ field.name }}</span>
          <el-tag v-if="field.type === 'formula'" size="small" effect="plain">公式</el-tag>
        </div>
        <BaseFieldCell
          :field="field"
          :model-value="row.fields?.[field.id]"
          :editable="editable && !isComputedField(field.type) && !field.readOnly && !isCondHidden(field.id)"
          :hidden-by-condition="isCondHidden(field.id)"
          :link-titles="linkTitles"
          :link-options="linkOptions?.[linkTargetTableOf(field.id)] ?? []"
          :link-target-table-id="linkTargetTableOf(field.id)"
          :project-id="projectId"
          @update:model-value="(value) => emit('update', { fieldId: field.id, value })"
          @open-record-ref="(payload) => emit('open-record-ref', payload)"
        />
      </div>
      <div v-if="docRefs.length" class="be-record__docs">
        <div class="be-record__docs-title">
          <el-icon><Document /></el-icon>
          <span>引用本记录的文档（{{ docRefs.length }}）</span>
        </div>
        <ul class="be-record__docs-list">
          <li
            v-for="item in docRefs"
            :key="item.nodeId"
            class="be-record__docs-item"
            @click="emit('open-node', item.nodeId)"
          >
            <el-icon class="be-record__docs-icon"><Link /></el-icon>
            <span class="be-record__docs-name">{{ item.title }}</span>
            <el-tag size="small" effect="plain" type="info">
              {{ item.kind === 'embed' ? '内嵌本表' : '正文提及' }}
            </el-tag>
          </li>
        </ul>
      </div>
      <div v-else-if="docRefsLoading" class="be-panel__hint">正在查找引用本记录的文档…</div>
      <div
        v-if="relations && (relations.outbound.length || relations.inbound.length)"
        class="be-record__docs"
      >
        <div class="be-record__docs-title">
          <el-icon><Share /></el-icon>
          <span>
            关联记录（正向 {{ relations.outbound.length }} · 反向
            {{ relations.inbound.length }}）
          </span>
        </div>
        <div v-if="relations.outbound.length" class="be-record__rel-group">
          <div class="be-record__rel-label">我关联的记录</div>
          <ul class="be-record__docs-list">
            <li
              v-for="item in relations.outbound"
              :key="`out-${item.fieldId}-${item.recordId}`"
              class="be-record__docs-item"
              @click="emit('open-record-ref', { tableId: item.targetTableId, recordId: item.recordId, title: item.recordTitle })"
            >
              <el-icon class="be-record__docs-icon"><Link /></el-icon>
              <span class="be-record__docs-name">{{ item.recordTitle }}</span>
              <el-tag size="small" effect="plain" type="info">{{ item.fieldName }}</el-tag>
            </li>
          </ul>
        </div>
        <div v-if="relations.inbound.length" class="be-record__rel-group">
          <div class="be-record__rel-label">关联到本记录的记录</div>
          <ul class="be-record__docs-list">
            <li
              v-for="item in relations.inbound"
              :key="`in-${item.fieldId}-${item.recordId}`"
              class="be-record__docs-item"
              @click="emit('open-record-ref', { tableId: item.tableId, recordId: item.recordId, title: item.recordTitle })"
            >
              <el-icon class="be-record__docs-icon"><Link /></el-icon>
              <span class="be-record__docs-name">{{ item.recordTitle }}</span>
              <el-tag size="small" effect="plain" type="warning">
                {{ item.tableName }} · {{ item.fieldName }}
              </el-tag>
            </li>
          </ul>
        </div>
      </div>
      <div v-else-if="relationsLoading" class="be-panel__hint">正在查找关联记录…</div>
      <div class="be-record__scope">
        <div class="be-record__scope-head">
          <el-icon class="be-record__scope-icon">
            <component :is="isRestricted || isCustom ? Lock : Unlock" />
          </el-icon>
          <span class="be-record__scope-title">可见范围</span>
          <el-tag size="small" effect="plain" :type="isRestricted || isCustom ? 'warning' : 'info'">
            {{ scopeLabel }}
          </el-tag>
        </div>
        <el-select
          :model-value="visibility"
          class="be-record__scope-select"
          size="small"
          popper-class="be-scope-popper"
          @update:model-value="(value: RecordVisibility) => onVisibilityChange(value)"
        >
          <el-option
            v-for="opt in VISIBILITY_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          >
            <div class="be-record__scope-option">
              <span class="be-record__scope-option-label">{{ opt.label }}</span>
              <span class="be-record__scope-option-hint">{{ opt.hint }}</span>
            </div>
          </el-option>
        </el-select>
        <!-- 指定成员可见：多选空间成员 -->
        <div v-if="isCustom" class="be-record__scope-grants">
          <div class="be-record__scope-grants-label">
            <el-icon><User /></el-icon>
            <span>可见成员</span>
            <el-tag size="small" effect="plain" type="info">{{ grantUserIds.length }} 人</el-tag>
          </div>
          <el-select
            :model-value="grantUserIds"
            class="be-record__scope-grants-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            :loading="membersLoading"
            placeholder="选择能看到这条记录的成员"
            popper-class="be-scope-popper"
            @update:model-value="(value: string[]) => onGrantsChange(value)"
          >
            <el-option
              v-for="opt in grantOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <div class="be-panel__hint">
            只有选中的成员能看到这条记录；未选中的成员在表格、关联候选、
            文档反向引用里都看不到它。
          </div>
          <div class="be-record__scope-grants-quick">
            <span class="be-record__scope-grants-label-text">按角色批量授权</span>
            <el-button size="small" text @click="grantByRole('admin')">管理员</el-button>
            <el-button size="small" text @click="grantByRole('editor')">编辑者</el-button>
            <el-button size="small" text @click="grantByRole('viewer')">访客</el-button>
            <el-button
              size="small"
              text
              type="danger"
              :disabled="!grantUserIds.length"
              @click="clearGrants"
            >
              清空
            </el-button>
          </div>
        </div>
        <div v-else class="be-panel__hint">
          可见范围由空间管理者控制：受限记录不会出现在其他成员的表格里，
          也不会出现在关联记录的候选与文档反向引用中。
        </div>
      </div>
      <div class="be-panel__hint">版本 {{ row.version }} · 更新于 {{ row.updatedAt }}</div>
    </div>
    <el-empty v-else description="记录不存在" />

    <template #footer>
      <el-button
        v-if="row"
        :icon="Delete"
        type="danger"
        plain
        @click="emit('delete', row.id)"
      >
        删除记录
      </el-button>
      <el-button @click="emit('close')">关闭</el-button>
    </template>

  </el-drawer>
</template>

<style scoped>
.be-record__scope {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--tg-border, #e2e8f0);
}

.be-record__scope-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.be-record__scope-icon {
  color: var(--tg-text-3, #94a3b8);
}

.be-record__scope-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-text-1, #0f172a);
}

.be-record__scope-select {
  width: 100%;
  margin-bottom: 6px;
}

.be-record__scope-grants {
  margin: 8px 0 6px;
  padding: 10px 12px;
  border: 1px solid var(--tg-border, #e2e8f0);
  border-radius: var(--tg-radius-md, 12px);
  background: var(--tg-surface-2, #f8fafc);
}

.be-record__scope-grants-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-text-1, #0f172a);
}

.be-record__scope-grants-select {
  width: 100%;
}

.be-record__scope-grants-quick {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.be-record__scope-grants-label-text {
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
  margin-right: 2px;
}

.be-record__scope-option {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.be-record__scope-option-label {
  font-size: 13px;
  font-weight: 500;
}

.be-record__scope-option-hint {
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}

.be-record__docs {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface-2);
}
.be-record__docs-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-text);
  margin-bottom: 8px;
}
.be-record__docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.be-record__docs-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--tg-radius-sm);
  cursor: pointer;
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}
.be-record__docs-item:hover {
  border-color: var(--tg-blue);
  background: var(--tg-blue-soft);
}
.be-record__docs-icon { color: var(--tg-text-2); flex: none; }
.be-record__docs-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tg-text);
}

.be-record__rel-group {
  margin-top: 8px;
}

.be-record__rel-label {
  font-size: 12px;
  color: var(--tg-text-2);
  margin-bottom: 4px;
}
</style>
