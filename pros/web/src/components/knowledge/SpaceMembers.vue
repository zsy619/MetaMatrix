<script setup lang="ts">
/**
 * 空间成员与角色（清单 069）。
 *
 * 角色：管理员（可再授权）、编辑者（可改节点）、浏览者（只看空间）。
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listSpaceMembers,
  removeSpaceMember,
  setSpaceMemberRole,
  type SpaceMember,
} from '../../api/knowledge_v6'
import { listDirectoryUsers, type DirectoryUser } from '../../api/directory'
import { friendlyApiMessage } from '../../utils/apiMessage'

const props = defineProps<{ projectId: string }>()
const visible = defineModel<boolean>({ default: false })

const members = ref<SpaceMember[]>([])
const candidates = ref<DirectoryUser[]>([])
const pickedUser = ref('')
const pickedRole = ref('viewer')
const loading = ref(false)

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  editor: '编辑者',
  viewer: '浏览者',
}

async function load() {
  if (!props.projectId) return
  loading.value = true
  try {
    members.value = await listSpaceMembers(props.projectId)
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '加载成员失败'))
  } finally {
    loading.value = false
  }
}

async function searchUsers(q: string) {
  try {
    candidates.value = await listDirectoryUsers({ q, limit: 20 })
  } catch {
    candidates.value = []
  }
}

async function addMember() {
  if (!pickedUser.value) {
    ElMessage.warning('请先选择成员')
    return
  }
  try {
    await setSpaceMemberRole(props.projectId, pickedUser.value, pickedRole.value)
    ElMessage.success('成员已添加')
    pickedUser.value = ''
    await load()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '添加成员失败'))
  }
}

async function changeRole(member: SpaceMember, role: string) {
  try {
    await setSpaceMemberRole(props.projectId, member.userId, role)
    ElMessage.success('角色已更新')
    await load()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '更新角色失败'))
  }
}

async function removeMember(member: SpaceMember) {
  try {
    await ElMessageBox.confirm(`确定把「${member.name}」移出空间吗？`, '移除成员', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await removeSpaceMember(props.projectId, member.userId)
    ElMessage.success('成员已移除')
    await load()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '移除成员失败'))
  }
}

watch(visible, (open) => {
  if (open) {
    void load()
    void searchUsers('')
  }
})

onMounted(() => {
  if (visible.value) void load()
})
</script>

<template>
  <el-dialog v-model="visible" title="空间成员与角色" width="620px" append-to-body>
    <div class="space-members">
      <div class="space-members__add">
        <el-select
          v-model="pickedUser"
          filterable
          remote
          clearable
          placeholder="搜索并选择成员"
          :remote-method="searchUsers"
          class="space-members__picker"
        >
          <el-option v-for="u in candidates" :key="u.id" :label="`${u.name}（${u.email}）`" :value="u.id" />
        </el-select>
        <el-select v-model="pickedRole" class="space-members__role">
          <el-option label="浏览者" value="viewer" />
          <el-option label="编辑者" value="editor" />
          <el-option label="管理员" value="admin" />
        </el-select>
        <el-button type="primary" @click="addMember">添加</el-button>
      </div>

      <el-table v-loading="loading" :data="members" size="small" border>
        <el-table-column label="成员" min-width="220">
          <template #default="{ row }">
            <div class="space-members__user">
              <el-avatar :size="24" :src="row.avatar || undefined">{{ row.name.slice(0, 1) }}</el-avatar>
              <div>
                <div class="space-members__name">{{ row.name }}</div>
                <div class="space-members__mail">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.isOwner" size="small" type="info">项目所有者</el-tag>
            <el-select
              v-else
              :model-value="row.role"
              size="small"
              @change="(role: string) => changeRole(row, role)"
            >
              <el-option v-for="(label, value) in ROLE_LABEL" :key="value" :label="label" :value="value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="right">
          <template #default="{ row }">
            <el-button v-if="!row.isOwner" link type="danger" @click="removeMember(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p class="space-members__hint">
        浏览者只能查看空间目录、搜索与图谱；编辑者可以改节点与结构化数据；管理员可以管理成员与团队模板。
      </p>
    </div>
  </el-dialog>
</template>

<style scoped>
.space-members__add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.space-members__picker {
  flex: 1;
}
.space-members__role {
  width: 110px;
}
.space-members__user {
  display: flex;
  align-items: center;
  gap: 8px;
}
.space-members__name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.space-members__mail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.space-members__hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
