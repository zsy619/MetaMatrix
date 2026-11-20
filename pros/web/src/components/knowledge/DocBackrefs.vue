<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listBackrefs, type PageReference } from '../../api/knowledge'

const props = defineProps<{ documentId: string; projectId: string }>()
const emit = defineEmits<{ back: [] }>()

const refs = ref<PageReference[]>([])
const loading = ref(false)
const router = useRouter()

async function load() {
  loading.value = true
  try {
    refs.value = await listBackrefs(props.documentId)
  } catch (err) {
    // 静默失败：反向引用是辅助信息，不打扰用户。
    refs.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.documentId, load, { immediate: true })

function open(ref: PageReference) {
  emit('back')
  void router.push({
    name: 'knowledge-doc',
    params: { projectId: props.projectId, documentId: ref.sourceDocId },
  })
}
</script>

<template>
  <section class="doc-backrefs" v-if="refs.length">
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
</template>

<style scoped>
.doc-backrefs {
  border-top: 1px solid var(--mm-line, #e5e6eb);
  padding: 12px 8px 12px 14px;
  font-size: 13px;
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
