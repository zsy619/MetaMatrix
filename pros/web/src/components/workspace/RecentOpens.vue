<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { readRecentOpens, type RecentOpen } from '../../utils/canvasTransfer'

const items = ref<RecentOpen[]>([])

function reload() {
  items.value = readRecentOpens()
}

onMounted(reload)
</script>

<template>
  <section v-if="items.length" class="recent" aria-label="最近打开">
    <h2>最近打开</h2>
    <ul>
      <li v-for="item in items" :key="item.id">
        <router-link
          :to="{ name: 'canvas', params: { templateId: item.templateId || 'dual-triangle' }, query: { documentId: item.id } }"
        >
          {{ item.title || '未命名文档' }}
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.recent {
  background: #fff;
  border: 1px solid var(--mm-line);
  border-radius: 16px;
  padding: 12px 14px;
}
h2 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--mm-muted);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
a {
  display: block;
  padding: 8px 6px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  font-size: 14px;
}
a:hover,
a:focus-visible {
  background: #f1f3f4;
}
@media (max-width: 720px) {
  a { padding: 12px 8px; }
}
</style>
