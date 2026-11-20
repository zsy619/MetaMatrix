<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchSharedDoc } from '../api/knowledge'
import type { SharedDoc } from '../api/knowledge'

const route = useRoute()
const doc = ref<SharedDoc | null>(null)
const error = ref('')
const loading = ref(true)

const roleLabel: Record<string, string> = {
  view: '只读分享',
  comment: '可评论分享',
  edit: '可编辑分享',
}

onMounted(async () => {
  try {
    doc.value = await fetchSharedDoc(String(route.params.token ?? ''))
  } catch (err) {
    error.value = (err as Error).message || '分享链接无效或已过期'
  } finally {
    loading.value = false
  }
})

const role = computed(() => (doc.value ? roleLabel[doc.value.role] ?? '分享' : ''))
</script>

<template>
  <div class="share-view">
    <div v-if="loading" class="share-view__state">加载中…</div>
    <div v-else-if="error" class="share-view__state share-view__state--error">{{ error }}</div>
    <article v-else class="share-view__doc">
      <header class="share-view__head">
        <h1>{{ doc?.title || '未命名文档' }}</h1>
        <el-tag size="small" type="info">{{ role }}</el-tag>
      </header>
      <div class="share-view__content" v-html="doc?.html"></div>
    </article>
  </div>
</template>

<style scoped>
.share-view {
  min-height: 100vh;
  background: var(--mm-page, #f7f7f7);
  padding: 32px 16px;
}
.share-view__state {
  text-align: center;
  color: var(--mm-muted, #86909c);
  padding-top: 80px;
}
.share-view__state--error {
  color: #f53f3f;
}
.share-view__doc {
  max-width: 860px;
  margin: 0 auto;
  background: var(--mm-surface, #fff);
  border-radius: 10px;
  padding: 28px 36px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 6%);
}
.share-view__head {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.share-view__head h1 {
  font-size: 20px;
  margin: 0;
}
.share-view__content {
  font-size: 14px;
  line-height: 1.8;
}
</style>
