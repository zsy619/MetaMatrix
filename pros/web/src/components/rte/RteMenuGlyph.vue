<script setup lang="ts">
import { computed } from 'vue'
import { menuGlyph } from './menuGlyphs'

const props = defineProps<{
  id?: string
  label?: string
  fallback?: string
}>()

const icon = computed(() => menuGlyph(props.id || '', props.label || '', props.fallback || ''))
</script>

<template>
  <span v-if="icon" data-rte-own class="rte-table-ctx-ico rte-menu-glyph"><component :is="icon" /></span>
</template>
