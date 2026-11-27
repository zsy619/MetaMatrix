<script setup lang="ts">
/**
 * 记录详情抽屉：逐字段查看与编辑。
 *
 * 编辑结果通过事件抛给上层统一处理（乐观更新 + 乐观锁），
 * 组件本身不直接调接口，保证写入路径只有一条。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Document, Link, Lock, Plus, Refresh, Share, Unlock, User } from '@element-plus/icons-vue'
import BaseFieldCell from '../fields/BaseFieldCell.vue'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import {
  fetchRecord,
  listRecordDocReferences,
  listRecordGrants,
  listRecordRelations,
  listSpaceDepartments,
  type RecordDocReference,
  type RecordRelationSet,
} from '../api'
import { listSpaceMembers, type SpaceMember } from '../../../api/knowledge_v6'
import type { FieldMeta, GrantSubject, RecordGrant, RecordRow, RecordVisibility } from '../types'
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
  (e: 'update-visibility', payload: {
    visibility: RecordVisibility;
    grants?: string[];
    grantSubjects?: GrantSubject[];
  }): void
  (e: 'delete', recordId: string): void
  (e: 'open-node', nodeId: string): void
  (e: 'open-record-ref', payload: { tableId: string; recordId: string; title: string }): void
  (e: 'refreshed', row: RecordRow): void
}>()

/**
 * 重新读取服务端最新值。
 *
 * 抽屉里的数据来自列表查询的结果快照，别人改了同一条记录时这里会滞后。
 * 这里走只读 GET（GET /base/records/:recordId）拉最新的一份，
 * 同时也是「按 ID 直读单条记录」这条只读接口的真实用例。
 */
const refreshing = ref(false)
async function refreshFromServer() {
  if (!props.row?.id || !props.projectId) return
  refreshing.value = true
  try {
    const fresh = await fetchRecord(props.projectId, props.row.id)
    emit('refreshed', fresh)
  } catch (err) {
    ElMessage.error((err as Error).message || '刷新失败')
  } finally {
    refreshing.value = false
  }
}

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
  if (visibility.value === 'custom') return `指定成员（${grantSubjects.value.length} 项）`
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
/** 空间里出现过的部门（用于「按部门授权」）。 */
const departments = ref<string[]>([])
/** 待添加成员的临时选择。 */
const pendingUserId = ref('')
/** 待添加部门的临时选择。 */
const pendingDepartment = ref('')
/** 当前授权名单（用户 + 部门），带显示名与有效期。 */
const grantSubjects = ref<
  Array<{ type: 'user' | 'department'; id: string; name: string; expiresAt?: string | null }>
>([])

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

async function loadDepartments() {
  if (!props.projectId || departments.value.length) return
  try {
    departments.value = await listSpaceDepartments(props.projectId)
  } catch {
    departments.value = []
  }
}

async function loadGrants(recordId: string) {
  if (!props.projectId) {
    grants.value = []
    grantUserIds.value = []
    grantSubjects.value = []
    return
  }
  try {
    grants.value = await listRecordGrants(props.projectId, recordId)
    grantUserIds.value = grants.value.map((item) => item.userId)
    grantSubjects.value = grants.value.map((item) => {
      const type = item.subjectType === 'department' ? 'department' : 'user'
      return {
        type,
        id: type === 'department' ? item.subjectId || item.name.replace(/^部门：/, '') : item.userId,
        name: item.name || (type === 'department' ? item.subjectId || '' : item.userId.slice(0, 8)),
        expiresAt: item.expiresAt ?? null,
      }
    })
  } catch {
    grants.value = []
    grantUserIds.value = []
    grantSubjects.value = []
  }
}

watch(
  () => props.row?.id,
  (id) => {
    if (id) {
      void loadGrants(id)
      void loadMembers()
      void loadDepartments()
    } else {
      grants.value = []
      grantUserIds.value = []
      grantSubjects.value = []
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
    emit('update-visibility', {
      visibility: 'custom',
      grants: grantUserIds.value,
      grantSubjects: subjectsPayload(),
    })
    return
  }
  emit('update-visibility', { visibility: value })
}

/** ISO 时间 → 本地时间输入框文本（datetime-picker 的 value-format）。 */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 当前授权名单 → 后端结构。 */
function subjectsPayload(): GrantSubject[] {
  return grantSubjects.value.map((item) => ({
    type: item.type,
    id: item.id,
    expiresAt: item.expiresAt ?? null,
  }))
}

/** 授权名单变化：立刻提交（与范围切换分开，避免误改范围）。 */
function commitSubjects(next: typeof grantSubjects.value) {
  grantSubjects.value = next
  grantUserIds.value = next.filter((item) => item.type === 'user').map((item) => item.id)
  if (visibility.value === 'custom') {
    emit('update-visibility', {
      visibility: 'custom',
      grants: grantUserIds.value,
      grantSubjects: subjectsPayload(),
    })
  }
}

/** 添加一个成员到授权名单。 */
function addUserGrant() {
  const id = pendingUserId.value
  if (!id) return
  if (grantSubjects.value.some((item) => item.type === 'user' && item.id === id)) {
    pendingUserId.value = ''
    return
  }
  const member = spaceMembers.value.find((item) => item.userId === id)
  commitSubjects([
    ...grantSubjects.value,
    { type: 'user', id, name: member?.name || member?.email || id.slice(0, 8), expiresAt: null },
  ])
  pendingUserId.value = ''
}

/** 添加一个部门到授权名单。 */
function addDepartmentGrant() {
  const dept = pendingDepartment.value
  if (!dept) return
  if (grantSubjects.value.some((item) => item.type === 'department' && item.id === dept)) {
    pendingDepartment.value = ''
    return
  }
  commitSubjects([
    ...grantSubjects.value,
    { type: 'department', id: dept, name: `部门：${dept}`, expiresAt: null },
  ])
  pendingDepartment.value = ''
}

/** 移除一个授权对象。 */
function removeGrant(index: number) {
  const next = grantSubjects.value.filter((_, i) => i !== index)
  commitSubjects(next)
}

/** 设置授权对象的有效期（清空表示永久）。 */
function onGrantExpiryChange(index: number, value: string | null) {
  const next = grantSubjects.value.map((item, i) =>
    i === index ? { ...item, expiresAt: value ? new Date(value).toISOString() : null } : item,
  )
  commitSubjects(next)
}

/** 按空间角色批量授权（把该角色的成员全部加入可见名单）。 */
function grantByRole(role: SpaceMember['role']) {
  const next = [...grantSubjects.value]
  const ids = new Set(next.filter((item) => item.type === 'user').map((item) => item.id))
  for (const item of spaceMembers.value) {
    if (item.role !== role || ids.has(item.userId)) continue
    ids.add(item.userId)
    next.push({
      type: 'user',
      id: item.userId,
      name: item.name || item.email,
      expiresAt: null,
    })
  }
  commitSubjects(next)
}

/** 清空可见名单。 */
function clearGrants() {
  commitSubjects([])
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
    <template #header>
      <div class="be-record__head">
        <span>{{ row ? '记录详情' : '记录' }}</span>
        <el-button
          v-if="row && projectId"
          size="small"
          text
          :icon="Refresh"
          :loading="refreshing"
          @click="refreshFromServer"
        >
          刷新最新值
        </el-button>
      </div>
    </template>
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
            <span>可见范围</span>
            <el-tag size="small" effect="plain" type="info">{{ grantSubjects.length }} 项</el-tag>
          </div>
          <!-- 已授权列表：每个对象可单独设置有效期 -->
          <ul v-if="grantSubjects.length" class="be-record__scope-grants-list">
            <li
              v-for="(item, index) in grantSubjects"
              :key="`${item.type}-${item.id}`"
              class="be-record__scope-grants-item"
            >
              <el-tag size="small" effect="plain" :type="item.type === 'department' ? 'success' : 'info'">
                {{ item.type === 'department' ? '部门' : '成员' }}
              </el-tag>
              <span class="be-record__scope-grants-item-name">{{ item.name }}</span>
              <el-date-picker
                :model-value="toLocalInput(item.expiresAt)"
                type="datetime"
                size="small"
                value-format="YYYY-MM-DD HH:mm:ss"
                placeholder="有效期（永久）"
                class="be-record__scope-grants-item-date"
                @update:model-value="(value: string | null) => onGrantExpiryChange(index, value)"
              />
              <el-button
                size="small"
                text
                type="danger"
                :icon="Delete"
                @click="removeGrant(index)"
              />
            </li>
          </ul>
          <div v-else class="be-panel__hint">还没有授权对象，添加后对方才能看到这条记录。</div>
          <!-- 添加成员 -->
          <div class="be-record__scope-grants-add">
            <el-select
              v-model="pendingUserId"
              class="be-record__scope-grants-select"
              filterable
              clearable
              :loading="membersLoading"
              placeholder="选择成员"
              popper-class="be-scope-popper"
            >
              <el-option
                v-for="opt in grantOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-button size="small" :icon="Plus" :disabled="!pendingUserId" @click="addUserGrant">
              添加成员
            </el-button>
          </div>
          <!-- 添加部门 -->
          <div v-if="departments.length" class="be-record__scope-grants-add">
            <el-select
              v-model="pendingDepartment"
              class="be-record__scope-grants-select"
              clearable
              placeholder="选择部门"
              popper-class="be-scope-popper"
            >
              <el-option v-for="dept in departments" :key="dept" :label="dept" :value="dept" />
            </el-select>
            <el-button
              size="small"
              :icon="Plus"
              :disabled="!pendingDepartment"
              @click="addDepartmentGrant"
            >
              添加部门
            </el-button>
          </div>
          <div class="be-panel__hint">
            只有名单里的成员 / 部门能看到这条记录；未授权的成员在表格、关联候选、
            文档反向引用里都看不到它。设置有效期后，授权到期自动失效。
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

.be-record__scope-grants-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.be-record__scope-grants-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--tg-border, #e2e8f0);
  border-radius: var(--tg-radius-sm, 8px);
  background: var(--tg-surface-1, #fff);
}

.be-record__scope-grants-item-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--tg-text-1, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.be-record__scope-grants-item-date {
  width: 176px;
  flex-shrink: 0;
}

.be-record__scope-grants-add {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
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
