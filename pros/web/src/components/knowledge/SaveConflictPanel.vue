<script setup lang="ts">
import { computed } from 'vue'
import {
  htmlPreviewText,
  type SaveConflictChoice,
  type SaveConflictVersions,
} from './saveConflict'

const props = defineProps<{
  versions: SaveConflictVersions
  remoteVersion?: number | string
}>()

const emit = defineEmits<{
  choose: [choice: SaveConflictChoice]
}>()

const minePreview = computed(() => htmlPreviewText(props.versions.mineHtml))
const theirsPreview = computed(() => htmlPreviewText(props.versions.theirsHtml))
const theirsHeading = computed(() => props.versions.theirsLabel || '对方的版本')
const mineHeading = computed(() => props.versions.mineLabel || '你的版本')
</script>

<template>
  <div class="save-conflict-panel" role="dialog" aria-modal="true" aria-labelledby="save-conflict-title">
    <h2 id="save-conflict-title">保存冲突</h2>
    <p class="save-conflict-panel__hint">
      远端已有更新{{ remoteVersion != null && remoteVersion !== '' ? `（版本 ${remoteVersion}）` : '' }}。
      请选择保留谁的版本，或把两边合在一起。合并不会丢掉审阅标记。
    </p>
    <div class="save-conflict-panel__cols">
      <section class="save-conflict-panel__col" data-side="mine">
        <h3>{{ mineHeading }}</h3>
        <pre class="save-conflict-panel__preview">{{ minePreview || '（空）' }}</pre>
      </section>
      <section class="save-conflict-panel__col" data-side="theirs">
        <h3>{{ theirsHeading }}</h3>
        <pre class="save-conflict-panel__preview">{{ theirsPreview || '（空）' }}</pre>
      </section>
    </div>
    <footer class="save-conflict-panel__actions">
      <button type="button" data-action="theirs" @click="emit('choose', 'theirs')">用对方的版本</button>
      <button type="button" data-action="merge" @click="emit('choose', 'merge')">合并两边</button>
      <button type="button" class="is-primary" data-action="mine" @click="emit('choose', 'mine')">用我的版本</button>
    </footer>
  </div>
</template>

<style scoped>
.save-conflict-panel {
  position: relative;
  z-index: 20;
  margin: 12px 16px 0;
  padding: 16px 18px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  background: var(--mm-bg, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.save-conflict-panel h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.save-conflict-panel__hint {
  margin: 0 0 12px;
  color: var(--mm-text-2, #4e5969);
  font-size: 13px;
  line-height: 1.5;
}
.save-conflict-panel__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.save-conflict-panel__col {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px;
  background: var(--mm-fill, #f7f8fa);
}
.save-conflict-panel__col h3 {
  margin: 0 0 6px;
  font-size: 13px;
}
.save-conflict-panel__preview {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--mm-text, #1d2129);
}
.save-conflict-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.save-conflict-panel__actions button {
  padding: 6px 12px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.save-conflict-panel__actions .is-primary {
  border-color: var(--mm-blue, #1677ff);
  background: var(--mm-blue, #1677ff);
  color: #fff;
}
</style>
