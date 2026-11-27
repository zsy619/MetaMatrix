<script setup lang="ts">
/**
 * 运行监控面板（可观测性 + 事件死信 + 导入任务 + 通讯录分组）。
 *
 * 为什么要有这个面板：
 *   批次 M 补齐的 18 项里，有四组能力此前只有后端接口、没有界面入口：
 *     - 可观测性指标（GET /base/metrics）
 *     - 事件死信治理（/outbox/dead-letters + retry）
 *     - 异步导入任务（/tables/:id/import-jobs）
 *     - 通讯录分组（/user-groups）
 *   接口存在但用户点不到，等于没做。这里把四条链路一次接完。
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Connection,
  DataLine,
  Refresh,
  RefreshRight,
  UserFilled,
} from '@element-plus/icons-vue'
import {
  cancelImportJob,
  createUserGroup,
  deleteUserGroup,
  fetchBaseMetrics,
  fetchImportJob,
  listDeadLetters,
  listImportJobs,
  listUserGroups,
  retryDeadLetter,
  updateUserGroup,
  type BaseMetricsSnapshot,
  type DeadLetter,
  type ImportJobInfo,
  type UserGroupInfo,
} from '../api'
import { listSpaceMembers, type SpaceMember } from '../../../api/knowledge_v6'

const props = defineProps<{
  projectId: string
  tableId?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

type TabKey = 'metrics' | 'dead' | 'imports' | 'groups'
const tab = ref<TabKey>('metrics')

/* —— 指标 —— */
const metrics = ref<BaseMetricsSnapshot | null>(null)
const metricsLoading = ref(false)

/* —— 死信 —— */
const deadLetters = ref<DeadLetter[]>([])
const deadLoading = ref(false)

/* —— 导入任务 —— */
const jobs = ref<ImportJobInfo[]>([])
const jobsLoading = ref(false)
/** 正在轮询的任务 ID（运行中的任务每 1.5s 刷一次）。 */
const polling = ref<Record<string, boolean>>({})
let pollTimer: number | undefined

/* —— 通讯录分组 —— */
const groups = ref<UserGroupInfo[]>([])
const groupsLoading = ref(false)
const members = ref<SpaceMember[]>([])
/** 新建 / 编辑分组弹窗。 */
const groupDialog = ref(false)
const groupEditing = ref<UserGroupInfo | null>(null)
const groupForm = ref({ name: '', description: '', members: [] as string[] })
const groupSaving = ref(false)

const IMPORT_STATUS_TEXT: Record<string, { label: string; type: 'success' | 'warning' | 'danger' | 'info' }> = {
  pending: { label: '排队中', type: 'info' },
  running: { label: '执行中', type: 'warning' },
  succeeded: { label: '已完成', type: 'success' },
  partial: { label: '部分失败', type: 'warning' },
  failed: { label: '失败', type: 'danger' },
  cancelled: { label: '已取消', type: 'info' },
}

/** 指标卡片：把快照拍平成可读的展示项。 */
const metricCards = computed(() => {
  const m = metrics.value
  if (!m) return []
  return [
    { key: 'p50', label: 'P50 延迟', value: `${m.p50Millis.toFixed(1)} ms`, tone: 'normal' },
    { key: 'p95', label: 'P95 延迟', value: `${m.p95Millis.toFixed(1)} ms`, tone: m.p95Millis > 200 ? 'warn' : 'normal' },
    { key: 'p99', label: 'P99 延迟', value: `${m.p99Millis.toFixed(1)} ms`, tone: m.p99Millis > 500 ? 'warn' : 'normal' },
    { key: 'slow', label: '慢查询', value: `${m.slowQueries}`, tone: m.slowQueries > 0 ? 'warn' : 'normal' },
    { key: 'outboxOk', label: '事件已投递', value: `${m.outboxPublished}`, tone: 'normal' },
    { key: 'outboxFail', label: '投递失败', value: `${m.outboxFailed}`, tone: m.outboxFailed > 0 ? 'warn' : 'normal' },
    { key: 'dead', label: '死信', value: `${m.outboxDead}`, tone: m.outboxDead > 0 ? 'danger' : 'normal' },
    { key: 'idem', label: '幂等冲突', value: `${m.idempotencyConflicts}`, tone: 'normal' },
    { key: 'subs', label: '实时订阅', value: `${m.activeSubscribers}`, tone: 'normal' },
    { key: 'errors', label: '错误数', value: `${m.errors}`, tone: m.errors > 0 ? 'warn' : 'normal' },
  ]
})

async function loadMetrics() {
  metricsLoading.value = true
  try {
    metrics.value = await fetchBaseMetrics(props.projectId)
  } catch (err) {
    ElMessage.error((err as Error).message || '指标读取失败')
  } finally {
    metricsLoading.value = false
  }
}

async function loadDeadLetters() {
  deadLoading.value = true
  try {
    deadLetters.value = await listDeadLetters(props.projectId)
  } catch (err) {
    ElMessage.error((err as Error).message || '死信列表读取失败')
  } finally {
    deadLoading.value = false
  }
}

async function loadJobs() {
  if (!props.tableId) {
    jobs.value = []
    return
  }
  jobsLoading.value = true
  try {
    jobs.value = await listImportJobs(props.projectId, props.tableId)
    // 有任务在跑就继续轮询
    for (const job of jobs.value) {
      if (job.status === 'pending' || job.status === 'running') {
        polling.value[job.id] = true
      }
    }
  } catch (err) {
    ElMessage.error((err as Error).message || '导入任务读取失败')
  } finally {
    jobsLoading.value = false
  }
}

async function loadGroups() {
  groupsLoading.value = true
  try {
    groups.value = await listUserGroups(props.projectId)
  } catch (err) {
    ElMessage.error((err as Error).message || '通讯录分组读取失败')
  } finally {
    groupsLoading.value = false
  }
}

async function refreshCurrent() {
  if (tab.value === 'metrics') await loadMetrics()
  else if (tab.value === 'dead') await loadDeadLetters()
  else if (tab.value === 'imports') await loadJobs()
  else await loadGroups()
}

async function onRetryDead(row: DeadLetter) {
  try {
    await retryDeadLetter(props.projectId, row.id)
    ElMessage.success('已重新投递，正在等待发布器处理')
    await loadDeadLetters()
    await loadMetrics()
  } catch (err) {
    ElMessage.error((err as Error).message || '重投失败')
  }
}

async function onCancelJob(row: ImportJobInfo) {
  try {
    await cancelImportJob(props.projectId, row.id)
    ElMessage.success('已取消该导入任务')
    await loadJobs()
  } catch (err) {
    ElMessage.error((err as Error).message || '取消失败')
  }
}

/** 轮询：只刷新「排队中 / 执行中」的任务。 */
async function pollJobs() {
  const running = jobs.value.filter((j) => j.status === 'pending' || j.status === 'running')
  if (!running.length) return
  for (const job of running) {
    try {
      const fresh = await fetchImportJob(props.projectId, job.id)
      const idx = jobs.value.findIndex((j) => j.id === job.id)
      if (idx >= 0) jobs.value[idx] = fresh
      if (fresh.status !== 'pending' && fresh.status !== 'running') {
        delete polling.value[job.id]
        if (fresh.status === 'succeeded') {
          ElMessage.success(`导入完成：成功 ${fresh.succeeded} 条`)
        } else if (fresh.status === 'partial') {
          ElMessage.warning(`导入完成：成功 ${fresh.succeeded} 条，失败 ${fresh.failed} 条`)
        }
        await loadMetrics()
      }
    } catch {
      // 单个任务查询失败不影响其它任务，下一轮继续。
    }
  }
}

function openGroupDialog(row?: UserGroupInfo) {
  groupEditing.value = row ?? null
  groupForm.value = row
    ? { name: row.name, description: row.description, members: [...row.members] }
    : { name: '', description: '', members: [] }
  groupDialog.value = true
}

async function saveGroup() {
  if (!groupForm.value.name.trim()) {
    ElMessage.warning('请填写分组名称')
    return
  }
  groupSaving.value = true
  try {
    if (groupEditing.value) {
      await updateUserGroup(props.projectId, groupEditing.value.id, { ...groupForm.value })
      ElMessage.success('分组已更新')
    } else {
      await createUserGroup(props.projectId, { ...groupForm.value })
      ElMessage.success('分组已创建')
    }
    groupDialog.value = false
    await loadGroups()
  } catch (err) {
    ElMessage.error((err as Error).message || '保存失败')
  } finally {
    groupSaving.value = false
  }
}

async function removeGroup(row: UserGroupInfo) {
  try {
    await ElMessageBox.confirm(`确定删除分组「${row.name}」？引用该分组的字段将无法再选到成员。`, '删除分组', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteUserGroup(props.projectId, row.id)
    ElMessage.success('分组已删除')
    await loadGroups()
  } catch (err) {
    ElMessage.error((err as Error).message || '删除失败')
  }
}

function memberName(userId: string) {
  return members.value.find((m) => m.userId === userId)?.name || userId
}

onMounted(async () => {
  await refreshCurrent()
  try {
    members.value = await listSpaceMembers(props.projectId)
  } catch {
    // 成员列表拉不到不影响分组本身的管理。
  }
  pollTimer = window.setInterval(() => {
    void pollJobs()
  }, 1500)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <el-drawer
    :model-value="true"
    title="运行监控"
    size="880px"
    append-to-body
    modal-class="be-modal"
    @close="emit('close')"
  >
    <div class="be-ops">
      <el-radio-group v-model="tab" size="small" class="be-ops__tabs" @change="refreshCurrent">
        <el-radio-button value="metrics">
          <el-icon><DataLine /></el-icon>
          <span>运行指标</span>
        </el-radio-button>
        <el-radio-button value="dead">
          <el-icon><Bell /></el-icon>
          <span>事件死信</span>
        </el-radio-button>
        <el-radio-button value="imports">
          <el-icon><Connection /></el-icon>
          <span>导入任务</span>
        </el-radio-button>
        <el-radio-button value="groups">
          <el-icon><UserFilled /></el-icon>
          <span>通讯录分组</span>
        </el-radio-button>
      </el-radio-group>

      <el-button size="small" :icon="Refresh" :loading="metricsLoading || deadLoading || jobsLoading || groupsLoading" @click="refreshCurrent">
        刷新
      </el-button>

      <!-- 运行指标 -->
      <section v-if="tab === 'metrics'" class="be-ops__section">
        <div v-if="!metrics" class="be-ops__empty">暂无指标数据</div>
        <div v-else class="be-ops__cards">
          <div
            v-for="card in metricCards"
            :key="card.key"
            class="be-ops__card"
            :class="`is-${card.tone}`"
          >
            <div class="be-ops__card-label">{{ card.label }}</div>
            <div class="be-ops__card-value">{{ card.value }}</div>
          </div>
        </div>
        <el-alert
          v-if="metrics && metrics.outboxDead > 0"
          type="error"
          :closable="false"
          show-icon
          class="be-ops__alert"
          :title="`有 ${metrics.outboxDead} 条事件进入死信队列，请到「事件死信」页签处理`"
        />
      </section>

      <!-- 事件死信 -->
      <section v-else-if="tab === 'dead'" class="be-ops__section">
        <el-empty v-if="!deadLetters.length" description="没有死信事件" :image-size="72" />
        <el-table v-else :data="deadLetters" size="small" border>
          <el-table-column prop="eventType" label="事件类型" min-width="160" />
          <el-table-column prop="retryCount" label="重试次数" width="100" />
          <el-table-column label="产生时间" min-width="170">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link :icon="RefreshRight" @click="onRetryDead(row)">
                重投
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 导入任务 -->
      <section v-else-if="tab === 'imports'" class="be-ops__section">
        <el-empty v-if="!tableId" description="当前没有数据表，无法查看导入任务" :image-size="72" />
        <el-empty v-else-if="!jobs.length" description="暂无导入任务" :image-size="72" />
        <el-table v-else :data="jobs" size="small" border>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="IMPORT_STATUS_TEXT[row.status]?.type || 'info'">
                {{ IMPORT_STATUS_TEXT[row.status]?.label || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" min-width="200">
            <template #default="{ row }">
              <el-progress
                :percentage="row.total ? Math.round((row.processed / row.total) * 100) : 0"
                :status="row.status === 'failed' ? 'exception' : row.status === 'succeeded' ? 'success' : undefined"
                :stroke-width="8"
              />
              <span class="be-ops__hint">
                成功 {{ row.succeeded }} / 共 {{ row.total }}<template v-if="row.failed"> · 失败 {{ row.failed }}</template>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'pending' || row.status === 'running'"
                size="small"
                type="danger"
                link
                @click="onCancelJob(row)"
              >
                取消
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 通讯录分组 -->
      <section v-else class="be-ops__section">
        <div class="be-ops__bar">
          <span class="be-ops__hint">分组可被「通讯录分组」类型的字段引用（人员字段按组选人）。</span>
          <el-button size="small" type="primary" :icon="UserFilled" @click="openGroupDialog()">新建分组</el-button>
        </div>
        <el-empty v-if="!groups.length" description="还没有通讯录分组" :image-size="72" />
        <el-table v-else :data="groups" size="small" border>
          <el-table-column prop="name" label="分组名称" min-width="140" />
          <el-table-column prop="description" label="说明" min-width="160" />
          <el-table-column label="成员" min-width="200">
            <template #default="{ row }">
              <template v-if="row.members?.length">
                <el-tag v-for="uid in row.members" :key="uid" size="small" class="be-ops__tag">
                  {{ memberName(uid) }}
                </el-tag>
              </template>
              <span v-else class="be-ops__hint">未添加成员</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="right">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="openGroupDialog(row)">编辑</el-button>
              <el-button size="small" link type="danger" @click="removeGroup(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog
      v-model="groupDialog"
      :title="groupEditing ? '编辑分组' : '新建分组'"
      width="480px"
      append-to-body
      modal-class="be-modal"
    >
      <el-form label-width="72px">
        <el-form-item label="名称" required>
          <el-input v-model="groupForm.name" placeholder="例如：销售一部" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="groupForm.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
        <el-form-item label="成员">
          <el-select v-model="groupForm.members" multiple filterable placeholder="选择成员" style="width: 100%">
            <el-option v-for="m in members" :key="m.userId" :label="m.name || m.email" :value="m.userId" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialog = false">取消</el-button>
        <el-button type="primary" :loading="groupSaving" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.be-ops {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}

.be-ops__section {
  width: 100%;
}

.be-ops__tabs {
  align-self: flex-start;
}

.be-ops__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.be-ops__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.be-ops__card {
  border: 1px solid var(--fs-border, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--fs-surface, #fff);
}

.be-ops__card.is-warn {
  border-color: #f5b545;
  background: rgba(245, 181, 69, 0.08);
}

.be-ops__card.is-danger {
  border-color: #e5646e;
  background: rgba(229, 100, 110, 0.08);
}

.be-ops__card-label {
  font-size: 12px;
  color: var(--fs-text-3, #6b7280);
}

.be-ops__card-value {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--fs-text-1, #111827);
}

.be-ops__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.be-ops__hint {
  font-size: 12px;
  color: var(--fs-text-3, #6b7280);
}

.be-ops__tag {
  margin: 0 4px 4px 0;
}

.be-ops__empty {
  padding: 32px 0;
  text-align: center;
  color: var(--fs-text-3, #6b7280);
}
</style>
