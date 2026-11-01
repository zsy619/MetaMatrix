<script setup lang="ts">
defineProps<{
  lead: string
  reminders: string[]
}>()
</script>

<template>
  <footer v-if="lead || reminders.length" class="fsn">
    <p v-if="lead" class="fsn-lead">{{ lead }}</p>
    <ul v-if="reminders.length" class="fsn-list">
      <li v-for="(line, index) in reminders" :key="index">{{ line }}</li>
    </ul>
  </footer>
</template>

<style scoped>
.fsn {
  flex-shrink: 0;
  margin: 0;
  padding: 14px 4px 4px;
  color: #3c4043;
  font-size: 13px;
  line-height: 1.7;
}

.fsn-lead {
  margin: 0;
}

.fsn-list {
  margin: 2px 0 0;
  padding: 0 0 0 1.15em;
}

.fsn-list li {
  margin: 0;
  padding: 0;
}

.fsn-list li::marker {
  color: #3c4043;
}

@media (max-width: 840px) {
  .fsn {
    font-size: 12px;
    padding-top: 10px;
  }
}
</style>
