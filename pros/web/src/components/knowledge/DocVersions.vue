<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { diffDocVersions, labelDocVersion, listDocVersions, listVersionAuthors } from '../../api/knowledge'
import type { DocVersion } from '../../api/knowledge'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [html: string] }>()

const versions = ref<DocVersion[]>([])
const loading = ref(false)
const fromId = ref('')
const toId = ref('')
const diff = ref('')
/** 版本作者显示名。 */
const authors = ref<Record<string, string>>({})
/** 并排对比视图（080）。 */
const sideBySide = ref(false)
const fromHtml = ref('')
const toHtml = ref('')

async function load() {
  loading.value = true
  try {
    versions.value = await listDocVersions(props.documentId, 30)
    authors.value = await listVersionAuthors(props.documentId).catch(() => ({}))
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
    const from = versions.value.find((v) => v.id === fromId.value)
    const to = versions.value.find((v) => v.id === toId.value)
    fromHtml.value = from?.html ?? ''
    toHtml.value = to?.html ?? ''
  } catch {
    ElMessage.error('对比失败')
  }
}

/** 给版本加备注：如「发布版」「终稿」（082）。 */
async function label(version: DocVersion) {
  const { value } = await ElMessageBox.prompt('版本备注', '标记版本', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: version.label || '',
  })
  try {
    const updated = await labelDocVersion(props.documentId, version.id, value.trim())
    version.label = updated.label
    ElMessage.success('已标记')
  } catch {
    ElMessage.error('标记失败')
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
      <el-button size="small" text @click="sideBySide = !sideBySide">
        {{ sideBySide ? '文本对比' : '并排对比' }}
      </el-button>
    </div>
    <div v-if="loading" class="versions__empty">加载中…</div>
    <div v-else-if="!versions.length" class="versions__empty">还没有历史版本，编辑并保存后自动生成。</div>
    <template v-else>
      <ul class="versions__list">
        <li v-for="v in versions" :key="v.id">
          <span class="versions__time">{{ new Date(v.createdAt).toLocaleString() }}</span>
          <span class="versions__ver">v{{ v.saveVersion }}</span>
          <span v-if="authors[v.authorUserId]" class="versions__author">
            {{ authors[v.authorUserId] }}
          </span>
          <el-tag v-if="v.label" size="small" type="info">{{ v.label }}</el-tag>
          <el-button link size="small" @click="label(v)">标记</el-button>
          <el-button link size="small" @click="restore(v)">恢复</el-button>
        </li>
      </ul>
      <div v-if="sideBySide && diff" class="versions__side">
        <div class="versions__side-col">
          <div class="versions__side-title">旧版本</div>
          <div class="versions__side-body" v-html="fromHtml" />
        </div>
        <div class="versions__side-col">
          <div class="versions__side-title">新版本</div>
          <div class="versions__side-body" v-html="toHtml" />
        </div>
      </div>
      <pre v-else-if="diff" class="versions__diff">{{ diff }}</pre>
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
.versions__author { font-size: 11px; color: var(--mm-blue, #1677ff); }
.versions__side { display: flex; gap: 8px; margin-top: 10px; }
.versions__side-col { flex: 1; min-width: 0; }
.versions__side-title { font-size: 11px; color: var(--mm-muted, #86909c); margin-bottom: 4px; }
.versions__side-body {
  padding: 8px; background: var(--mm-page, #f7f7f7); border-radius: 6px;
  font-size: 12px; line-height: 1.6; max-height: 260px; overflow: auto;
}
.versions__empty {
  color: var(--mm-muted, #86909c);
  font-size: 13px;
  padding: 10px 0;
}
</style>
