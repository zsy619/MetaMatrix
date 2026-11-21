<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import type { DocProperties } from '../../api/knowledge'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ changed: [props: DocProperties] }>()

const props_ = ref<DocProperties | null>(null)
const saving = ref(false)
const status = ref<'draft' | 'published' | 'archived'>('draft')
const tags = ref('')
const summary = ref('')
const coverColor = ref('')
const dueAt = ref('')
const members = ref('')
const priority = ref('normal')
const milestone = ref('')
const sprint = ref('')
const number = ref(0)

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

async function load() {
  try {
    const data = await knowledgeApi.getDocProperties(props.documentId)
    props_.value = data
    status.value = data.status
    tags.value = data.tags
    summary.value = data.summary
    coverColor.value = data.coverColor
    dueAt.value = data.dueAt ? new Date(data.dueAt).toISOString().slice(0, 10) : ''
    members.value = data.members ?? ''
    priority.value = data.priority ?? 'normal'
    milestone.value = data.milestone ?? ''
    sprint.value = data.sprint ?? ''
    number.value = data.number ?? 0
  } catch {
    props_.value = null
  }
}

async function save() {
  saving.value = true
  try {
    const updated = await knowledgeApi.updateDocProperties(props.documentId, {
      status: status.value,
      tags: tags.value,
      summary: summary.value,
      coverColor: coverColor.value,
      dueAt: dueAt.value ? new Date(dueAt.value).toISOString() : null,
      clearDueAt: !dueAt.value,
      members: members.value,
      priority: priority.value,
      milestone: milestone.value,
      sprint: sprint.value,
      number: number.value,
    })
    props_.value = updated
    emit('changed', updated)
    ElMessage.success('属性已保存')
  } catch {
    ElMessage.error('属性保存失败')
  } finally {
    saving.value = false
  }
}

watch(() => props.documentId, () => void load())
onMounted(load)
</script>

<template>
  <section class="doc-props">
    <div class="doc-props__title">页面属性</div>
    <label class="doc-props__field">
      <span>状态</span>
      <el-select v-model="status" size="small">
        <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
    </label>
    <label class="doc-props__field">
      <span>负责人</span>
      <el-input :model-value="props_?.reviewerUserId || ''" size="small" disabled placeholder="暂未指定" />
    </label>
    <label class="doc-props__field">
      <span>截止日期</span>
      <el-input v-model="dueAt" size="small" type="date" />
    </label>
    <label class="doc-props__field">
      <span>标签</span>
      <el-input v-model="tags" size="small" placeholder="用逗号分隔，如：会议,纪要" />
    </label>
    <label class="doc-props__field">
      <span>摘要</span>
      <el-input v-model="summary" size="small" type="textarea" :rows="3" maxlength="255" show-word-limit />
    </label>
    <label class="doc-props__field">
      <span>参与人</span>
      <el-input v-model="members" size="small" placeholder="用户 ID，逗号分隔" />
    </label>
    <label class="doc-props__field">
      <span>优先级</span>
      <el-select v-model="priority" size="small">
        <el-option label="低" value="low" />
        <el-option label="普通" value="normal" />
        <el-option label="高" value="high" />
        <el-option label="紧急" value="urgent" />
      </el-select>
    </label>
    <label class="doc-props__field">
      <span>里程碑</span>
      <el-input v-model="milestone" size="small" placeholder="如：V1 上线" />
    </label>
    <label class="doc-props__field">
      <span>迭代周期</span>
      <el-input v-model="sprint" size="small" placeholder="如：Sprint 7" />
    </label>
    <label class="doc-props__field">
      <span>数值</span>
      <el-input-number v-model="number" size="small" :controls="false" />
    </label>
    <label class="doc-props__field">
      <span>封面色</span>
      <el-color-picker v-model="coverColor" size="small" />
    </label>
    <el-button size="small" type="primary" :loading="saving" @click="save">保存属性</el-button>
  </section>
</template>

<style scoped>
.doc-props { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.doc-props__title { font-size: 12px; font-weight: 600; color: var(--mm-muted, #86909c); }
.doc-props__field { display: flex; flex-direction: column; gap: 4px; }
.doc-props__field > span { font-size: 12px; color: var(--mm-muted, #86909c); }
</style>
