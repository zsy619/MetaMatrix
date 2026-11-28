<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listBackrefs, type PageReference } from '../../api/knowledge'
import { listDocBackrefs, type DocBackref } from '../../modules/base/api'

const props = defineProps<{ documentId: string; projectId: string; /** 知识库节点 ID（用于反查多维表格引用）。 */
  nodeId?: string }>()
const emit = defineEmits<{ back: []; 'open-node': [nodeId: string] }>()

const refs = ref<PageReference[]>([])
/** 多维表格引用：哪些表格记录通过「关联文档」字段指向本文档。 */
const baseRefs = ref<DocBackref[]>([])
const loading = ref(false)
const router = useRouter()

async function load() {
  loading.value = true
  try {
    refs.value = await listBackrefs(props.documentId)
  } catch (err) {
    // 静默失败：反向引用是辅助信息，不打扰用户。
    refs.value = []
    baseRefs.value = []
  } finally {
    loading.value = false
  }
}

/** 加载多维表格反向引用：文档节点 ID 才是关联文档字段的存储值。 */
async function loadBaseRefs(nodeId: string) {
  if (!nodeId) {
    baseRefs.value = []
    return
  }
  try {
    baseRefs.value = await listDocBackrefs(props.projectId, nodeId)
  } catch {
    baseRefs.value = []
  }
}

watch(
  () => props.documentId,
  () => {
    void load()
    void loadBaseRefs(props.nodeId ?? '')
  },
  { immediate: true },
)

/** 节点 ID 变化时重新反查（页签懒加载后组件才挂载，这里再兜一次）。 */
watch(
  () => props.nodeId,
  (nodeId) => {
    void loadBaseRefs(nodeId ?? '')
  },
)

/** 外部（DocView）拿到知识库节点 ID 后补一次查询。 */
defineExpose({ loadBaseRefs })

onMounted(() => {
  void loadBaseRefs(props.nodeId ?? '')
})

function open(ref: PageReference) {
  emit('back')
  void router.push({
    name: 'knowledge-doc',
    params: { projectId: props.projectId, documentId: ref.sourceDocId },
  })
}

/** 打开引用本文档的多维表格节点。 */
function openBaseRef(ref: DocBackref) {
  if (!ref.nodeId) return
  emit('open-node', ref.nodeId)
}
</script>

<template>
  <div class="doc-backrefs">
    <section v-if="refs.length">
      <div class="doc-backrefs__title">被引用（{{ refs.length }}）</div>
      <ul class="doc-backrefs__list">
        <li
          v-for="r in refs"
          :key="r.id"
          class="doc-backrefs__item"
          @click="open(r)"
        >
          <span class="doc-backrefs__icon">{{ r.refType === 'embed' ? '🧩' : '@' }}</span>
          <span class="doc-backrefs__label">{{ r.targetLabel || '未命名文档' }}</span>
        </li>
      </ul>
    </section>
    <section v-if="baseRefs.length">
      <div class="doc-backrefs__title">多维表格引用（{{ baseRefs.length }}）</div>
      <ul class="doc-backrefs__list">
        <li
          v-for="r in baseRefs"
          :key="`${r.tableId}:${r.recordId}:${r.fieldId}`"
          class="doc-backrefs__item"
          @click="openBaseRef(r)"
        >
          <span class="doc-backrefs__icon">📊</span>
          <span class="doc-backrefs__label">
            {{ r.tableName }} · {{ r.recordTitle || '未命名记录' }}
            <em class="doc-backrefs__field">{{ r.fieldName }}</em>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.doc-backrefs {
  border-top: 1px solid var(--mm-line, #e5e6eb);
  padding: 12px 8px 12px 14px;
  font-size: 13px;
}
.doc-backrefs__field {
  margin-left: 6px;
  font-style: normal;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
  background: rgba(15, 23, 42, 0.05);
  border-radius: 4px;
  padding: 0 4px;
}
.doc-backrefs__title {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  margin-bottom: 8px;
  font-weight: 600;
}
.doc-backrefs__list { list-style: none; margin: 0; padding: 0; }
.doc-backrefs__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.doc-backrefs__item:hover { background: var(--mm-hover, #f2f3f5); }
.doc-backrefs__icon { flex: none; font-size: 12px; }
.doc-backrefs__label { color: var(--mm-text, #1d2129); overflow: hidden; text-overflow: ellipsis; }
</style>
