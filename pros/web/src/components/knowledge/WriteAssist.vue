<script setup lang="ts">
/**
 * 写作智能补全（清单 103）。
 *
 * 有外部模型时由模型续写；没有模型时后端从本人其它文档里找参考句，
 * 两种模式都走同一个接口，前端只负责展示与插入。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { suggestWriting, type WritingSuggestion } from '../../api/knowledge_v6'
import { friendlyApiMessage } from '../../utils/apiMessage'

const props = defineProps<{
  documentId: string
  /** 当前段落文本，作为续写上下文。 */
  paragraph?: string
}>()
const emit = defineEmits<{ insert: [text: string] }>()

const visible = ref(false)
const loading = ref(false)
const suggestion = ref<WritingSuggestion | null>(null)

async function request() {
  if (!props.documentId) return
  loading.value = true
  try {
    const data = await suggestWriting(props.documentId, props.paragraph ?? '')
    suggestion.value = data
    visible.value = true
    if (!data.text) {
      ElMessage.info('暂时没有可用的续写建议')
    }
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '生成建议失败'))
  } finally {
    loading.value = false
  }
}

function insert() {
  if (!suggestion.value?.text) return
  emit('insert', suggestion.value.text)
  visible.value = false
}
</script>

<template>
  <div class="write-assist">
    <el-button text :loading="loading" @click="request">AI 续写</el-button>
    <transition name="write-assist__fade">
      <div v-if="visible && suggestion?.text" class="write-assist__card">
        <div class="write-assist__meta">
          <span class="write-assist__badge">{{ suggestion.mode === 'ai' ? '模型建议' : '知识库参考' }}</span>
          <span v-if="suggestion.source" class="write-assist__source">来自《{{ suggestion.source }}》</span>
          <el-button link size="small" @click="visible = false">关闭</el-button>
        </div>
        <p class="write-assist__text">{{ suggestion.text }}</p>
        <el-button size="small" type="primary" @click="insert">插入正文</el-button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.write-assist {
  position: relative;
  display: inline-flex;
}
.write-assist__card {
  position: absolute;
  top: 32px;
  right: 0;
  z-index: 20;
  width: 320px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: 0 10px 28px rgb(15 23 42 / 12%);
}
.write-assist__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.write-assist__badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
}
.write-assist__source {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.write-assist__text {
  margin: 0 0 10px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  line-height: 1.6;
}
.write-assist__fade-enter-active,
.write-assist__fade-leave-active {
  transition: opacity 0.15s ease;
}
.write-assist__fade-enter-from,
.write-assist__fade-leave-to {
  opacity: 0;
}
</style>
