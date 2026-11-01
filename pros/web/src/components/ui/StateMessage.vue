<script setup lang="ts">
defineProps<{
  title: string
  message?: string
  tone?: 'info' | 'error' | 'empty'
}>()
</script>

<template>
  <section class="state" :class="tone || 'info'" :role="tone === 'error' ? 'alert' : 'status'">
    <h2>{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.state {
  background: var(--mm-surface);
  border: 1px solid var(--mm-line);
  border-radius: var(--mm-radius);
  padding: 16px 18px;
}

.state.error {
  background: var(--mm-red-soft);
  border-color: transparent;
}

h2 {
  margin: 0 0 4px;
  font-size: 15px;
}

p {
  margin: 0;
  color: var(--mm-muted);
  font-size: 13px;
  line-height: 1.55;
}

.state.error p,
.state.error h2 {
  color: var(--mm-red);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
