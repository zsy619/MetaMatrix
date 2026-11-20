<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { diffDocVersions, listDocVersions } from '../../api/knowledge'
import type { DocVersion } from '../../api/knowledge'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [html: string] }>()

const versions = ref<DocVersion[]>([])
const loading = ref(false)
const fromId = ref('')
const toId = ref('')
const diff = ref('')

async function load() {
  loading.value = true
  try {
    versions.value = await listDocVersions(props.documentId, 30)
    if (versions.value.length >= 2) {
      toId.value = versions.value[0].id
      fromId.value = versions.value[1].id
    } else if (versions.value.length === 1) {
      toId.value = versions.value[0].id
      fromId.value = versions.value[0].id
    }
  } catch {
    ElMessage.error('加载历史版本失败')
  } finally {
    loading.value = false
  }
}

async function compare() {
  if (!fromId.value || !toId.value) return
  try {
    const res = await diffDocVersions(props.documentId, fromId.value, toId.value)
    diff.value = res.diff || '（两个版本内容一致）'
  } catch {
    ElMessage.error('对比失败')
  }
}

function restore(version: DocVersion) {
  emit('restored', version.html)
  ElMessage.success('已载入该版本，保存后生效')
}

watch(() => props.documentId, load)
onMounted(load)
</script>

<template>
  <div class="versions">
    <div class="versions__head">
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      <el-select v-model="fromId" size="small" placeholder="旧版本" style="width: 110px">
        <el-option
          v-for="v in versions"
          :key="v.id"
          :label="new Date(v.createdAt).toLocaleString()"
          :value="v.id"
        />
      </el-select>
      <span>→</span>
      <el-select v-model="toId" size="small" placeholder="新版本" style="width: 110px">
        <el-option
          v-for="v in versions"
          :key="v.id"
          :label="new Date(v.createdAt).toLocaleString()"
          :value="v.id"
        />
      </el-select>
      <el-button size="small" type="primary" @click="compare">对比</el-button>
    </div>
    <div v-if="loading" class="versions__empty">加载中…</div>
    <div v-else-if="!versions.length" class="versions__empty">还没有历史版本，编辑并保存后自动生成。</div>
    <template v-else>
      <ul class="versions__list">
        <li v-for="v in versions" :key="v.id">
          <span class="versions__time">{{ new Date(v.createdAt).toLocaleString() }}</span>
          <span class="versions__ver">v{{ v.saveVersion }}</span>
          <el-button link size="small" @click="restore(v)">恢复</el-button>
        </li>
      </ul>
      <pre v-if="diff" class="versions__diff">{{ diff }}</pre>
    </template>
  </div>
</template>

<style scoped>
.versions__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.versions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
}
.versions__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  padding: 3px 0;
}
.versions__ver {
  font-weight: 600;
  color: var(--mm-text, #1d2129);
}
.versions__diff {
  margin-top: 10px;
  padding: 8px;
  background: var(--mm-page, #f7f7f7);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
}
.versions__empty {
  color: var(--mm-muted, #86909c);
  font-size: 13px;
  padding: 10px 0;
}
</style>
