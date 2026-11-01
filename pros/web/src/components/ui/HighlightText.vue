<script setup lang="ts">
import { computed } from 'vue'
import { highlightParts } from '../../utils/highlight'

const props = defineProps<{ text?: string }>()
const parts = computed(() => highlightParts(props.text || ''))
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <mark v-if="part.hit">{{ part.text }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>

<style scoped>
mark {
  background: #fef7e0;
  color: inherit;
  padding: 0 2px;
  border-radius: 3px;
}
</style>
