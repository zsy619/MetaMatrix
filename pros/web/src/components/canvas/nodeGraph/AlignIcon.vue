<script setup lang="ts">
/** 对齐/分布图标（选择工具条与右键菜单共用一份图形）。 */
defineProps<{ icon: string }>()
</script>

<template>
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <template v-if="icon === 'left'">
      <path d="M3.5 2v12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="6" y="4" width="7" height="3" rx="1" fill="currentColor" />
      <rect x="6" y="9" width="4" height="3" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'center'">
      <path d="M8 2v12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="4" y="4" width="8" height="3" rx="1" fill="currentColor" />
      <rect x="5.5" y="9" width="5" height="3" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'right'">
      <path d="M12.5 2v12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="3" y="4" width="7" height="3" rx="1" fill="currentColor" />
      <rect x="6" y="9" width="4" height="3" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'top'">
      <path d="M2 3.5h12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="4" y="6" width="3" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="6" width="5" height="4" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'middle'">
      <path d="M2 8h12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="4" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="9" y="5.5" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'bottom'">
      <path d="M2 12.5h12" fill="none" stroke="currentColor" stroke-width="1.3" />
      <rect x="4" y="3" width="3" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="6" width="5" height="4" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'distribute-h'">
      <rect x="2" y="4" width="3" height="8" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="6.5" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="11" y="4" width="3" height="8" rx="1" fill="currentColor" opacity="0.6" />
    </template>
    <template v-else>
      <rect x="4" y="2" width="8" height="3" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="4" y="6.5" width="8" height="3" rx="1" fill="currentColor" />
      <rect x="4" y="11" width="8" height="3" rx="1" fill="currentColor" opacity="0.6" />
    </template>
  </svg>
</template>
