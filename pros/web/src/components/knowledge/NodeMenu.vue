<script setup lang="ts">
/**
 * 知识树节点菜单：右键与「⋯」共用一份，避免 el-dropdown 嵌在可拖拽树里点不动。
 */
import {
  CopyDocument,
  Delete,
  DeleteFilled,
  DocumentAdd,
  DocumentCopy,
  EditPen,
  FolderChecked,
  Share,
  Star,
  View,
} from '@element-plus/icons-vue'
import type { KnowledgeNode } from '../../api/knowledge'

defineProps<{
  node: KnowledgeNode
  x: number
  y: number
}>()

const emit = defineEmits<{ command: [cmd: string, node: KnowledgeNode] }>()
</script>

<template>
  <div class="node-menu" :style="{ left: `${x}px`, top: `${y}px` }" @click.stop>
    <button type="button" @click="emit('command', 'child', node)">
      <el-icon><DocumentAdd /></el-icon>新建子文档
    </button>
    <button type="button" @click="emit('command', 'sibling', node)">
      <el-icon><DocumentCopy /></el-icon>新建同级文档
    </button>
    <button type="button" @click="emit('command', 'rename', node)">
      <el-icon><EditPen /></el-icon>重命名
    </button>
    <button type="button" @click="emit('command', 'favorite', node)">
      <el-icon><Star /></el-icon>
      {{ node.favorite ? '取消收藏' : '收藏' }}
    </button>
    <button type="button" @click="emit('command', 'copy', node)">
      <el-icon><CopyDocument /></el-icon>复制节点
    </button>
    <button
      v-if="node.nodeType === 'doc' && node.documentId"
      type="button"
      @click="emit('command', 'mindmap', node)"
    >
      <el-icon><Share /></el-icon>转为思维导图
    </button>
    <button type="button" @click="emit('command', 'access', node)">
      <el-icon><View /></el-icon>可见范围
    </button>
    <button type="button" @click="emit('command', 'archive', node)">
      <el-icon><FolderChecked /></el-icon>归档
    </button>
    <button type="button" class="is-danger" @click="emit('command', 'trash', node)">
      <el-icon><Delete /></el-icon>移入回收站
    </button>
    <button type="button" class="is-danger" @click="emit('command', 'delete', node)">
      <el-icon><DeleteFilled /></el-icon>删除（含子节点）
    </button>
  </div>
</template>

<style scoped>
.node-menu {
  position: fixed;
  z-index: 3000;
  min-width: 168px;
  /* body 锁了 overflow:hidden，菜单过长时只能自己滚动，否则底部会被视口裁掉 */
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  background: var(--mm-surface, #fff);
  border: 1px solid var(--mm-line, #e5e6eb);
  box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
  display: flex;
  flex-direction: column;
}
.node-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--mm-text, #1d2129);
  cursor: pointer;
}
.node-menu .el-icon {
  font-size: 15px;
  color: var(--mm-muted, #86909c);
}
.node-menu button:hover {
  background: var(--el-fill-color-light, #f2f3f5);
}
.node-menu button.is-danger {
  color: var(--el-color-danger, #f5222d);
}
</style>
