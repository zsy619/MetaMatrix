<script setup lang="ts">
/**
 * 画布节点的最大化编辑（双击节点打开）。
 *
 * 弹窗里直接渲染这张画布的编辑界面（CanvasViewport），改完存回这份画布；
 * 节点与画布的绑定关系不变（refCanvasId），不再跳转到画布页面。
 * 节点绑的是 92 张模板之一时，第一次保存会在项目里落一份副本，
 * 并把节点绑到这份副本上，之后的修改都存回这份副本。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Connection } from '@element-plus/icons-vue'
import CanvasViewport from '../CanvasViewport.vue'
import {
  cloneTemplate,
  TEMPLATE_META,
  useDocumentStore,
  type TemplateId,
} from '../../../stores/document'
import { useNodeGraphStore } from '../../../stores/nodeGraph'
import {
  createDocument,
  getDocument,
  updateDocument,
  type AnyCanvasDocumentJSON,
} from '../../../api/documents'
import { friendlyApiMessage } from '../../../utils/apiMessage'
import type { GraphNode } from '../../../types/nodeGraph'

const props = defineProps<{
  node: GraphNode
  /** 画布归属的项目：模板画布落副本时用。 */
  projectId: string
}>()

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const docStore = useDocumentStore()
const nodeStore = useNodeGraphStore()

const loading = ref(true)
const saving = ref(false)
const error = ref('')

const templateId = computed(() =>
  props.node.refTemplateId ? (props.node.refTemplateId as TemplateId) : null,
)

/**
 * 弹窗自己持有的这份画布。
 *
 * docStore 是全应用单例（首页/项目详情都指着它渲染）：弹窗直接 load 进去
 * 会顶掉别的页面正打开的画布；两次双击不同节点时，第二次 load 之前
 * CanvasViewport 还拿着第一次的内容，看起来就像「缓存」。
 * 弹窗期间这份内容只存在于这里，挂载/摘除时整份拷进拷出 docStore。
 */
type OwnedDoc = {
  data: AnyCanvasDocumentJSON
  documentId: string | null
  title: string
  headRevisionId: string | null
  saveVersion: number
}
let owned: OwnedDoc | null = null
/** 挂载进 docStore 之前保存的原状态，关闭弹窗时整份恢复。 */
let snapshot: {
  data: AnyCanvasDocumentJSON | null
  documentId: string | null
  templateId: TemplateId | null
  title: string
  headRevisionId: string | null
  saveVersion: number
  editSeq: number
  dirty: boolean
} | null = null

/** 弹窗标题：优先用画布本身的名字，其次用节点名。 */
const canvasName = computed(() => {
  if (owned?.title) return owned.title
  if (templateId.value) return TEMPLATE_META[templateId.value]?.name || props.node.title
  return props.node.title || '画布'
})

/** 绑定状态：模板画布还没落副本，保存后会绑定到项目画布。 */
const bindState = computed(() => {
  if (props.node.refCanvasId) return '已绑定项目画布'
  if (templateId.value) return '模板画布（保存后与节点绑定）'
  return '未绑定画布'
})

async function prepare() {
  loading.value = true
  error.value = ''
  try {
    if (props.node.refCanvasId) {
      // 直接读后端，不经过 docStore.load：后者会写本地草稿和最近打开列表，
      // 把首页正在编辑的画布顶掉。
      const doc = await getDocument(props.node.refCanvasId)
      if (doc.canvasType === 'doc') {
        // 历史数据里可能有 refCanvasId 指向知识库文档：它不是画布，
        // 不能在画布编辑器里渲染。提示用户换绑，而不是显示一张空画布。
        error.value = '这个节点绑定的目标不是画布（知识库文档），请在节点属性里重新选择画布。'
        return
      }
      owned = {
        data: doc.currentData as AnyCanvasDocumentJSON,
        documentId: doc.id,
        title: doc.title || props.node.title,
        headRevisionId: doc.headRevisionId,
        saveVersion: doc.saveVersion ?? 0,
      }
    } else if (templateId.value) {
      // 模板画布：深拷贝模板默认内容，不读写该模板的本地草稿。
      owned = {
        data: cloneTemplate(templateId.value) as AnyCanvasDocumentJSON,
        documentId: null,
        title: TEMPLATE_META[templateId.value]?.name || props.node.title,
        headRevisionId: null,
        saveVersion: 0,
      }
    } else {
      error.value = '这个节点还没有绑定画布。'
      return
    }
    if (!owned.data) {
      error.value = '这份画布的内容读不出来，可能已被删除。'
      return
    }
    snapshot = {
      data: docStore.current_data,
      documentId: docStore.document_id,
      templateId: docStore.activeTemplateId,
      title: docStore.title,
      headRevisionId: docStore.head_revision_id,
      saveVersion: docStore.save_version,
      editSeq: docStore.editSeq,
      dirty: docStore.dirty,
    }
    docStore.mountDocContext({
      data: owned.data,
      documentId: owned.documentId,
      templateId: templateId.value,
      title: owned.title,
      headRevisionId: owned.headRevisionId,
      saveVersion: owned.saveVersion,
    })
  } catch (e) {
    error.value = friendlyApiMessage(e, '打开画布失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!docStore.current_data) return
  saving.value = true
  try {
    if (!owned?.documentId) {
      // 模板画布：先在项目里落一份副本，再把节点绑到这份副本上。
      const created = await createDocument({
        title: props.node.title || canvasName.value,
        canvasType: templateId.value || 'canvas',
        templateId: templateId.value || undefined,
        projectId: props.projectId || undefined,
        data: docStore.current_data as AnyCanvasDocumentJSON,
      })
      owned = {
        data: docStore.current_data as AnyCanvasDocumentJSON,
        documentId: created.id,
        title: created.title || owned?.title || props.node.title,
        headRevisionId: created.headRevisionId,
        saveVersion: created.saveVersion ?? 0,
      }
      docStore.mountDocContext({
        data: owned.data,
        documentId: owned.documentId,
        templateId: templateId.value,
        title: owned.title,
        headRevisionId: owned.headRevisionId,
        saveVersion: owned.saveVersion,
      })
      nodeStore.updateNode(props.node.id, { refCanvasId: created.id })
      ElMessage.success('已保存并与节点绑定')
      return
    }
    // 直接按 owned 的版本号提交：docStore 的 save 会按首页的草稿语义
    // 写本地存储，弹窗的内容不该回写到首页的模板草稿里。
    const updated = await updateDocument(owned.documentId, {
      currentData: docStore.current_data as AnyCanvasDocumentJSON,
      expectedHeadRevisionId: owned.headRevisionId,
      expectedSaveVersion: owned.saveVersion || undefined,
    })
    owned = {
      data: docStore.current_data as AnyCanvasDocumentJSON,
      documentId: updated.id,
      title: updated.title || owned.title,
      headRevisionId: updated.headRevisionId,
      saveVersion: updated.saveVersion ?? 0,
    }
    if (!props.node.refCanvasId) {
      // 保存时如果原文档已不属于当前账号，落到副本后节点要绑到新副本上，
      // 否则下次打开还是拿不到这份画布。
      nodeStore.updateNode(props.node.id, { refCanvasId: updated.id })
      ElMessage.success('已保存并与节点绑定')
      return
    }
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(friendlyApiMessage(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

/** 仍然可以跳到画布页面做大幅编辑。 */
function openInPage() {
  const target = props.node.refCanvasId || templateId.value
  if (!target) return
  emit('close')
  if (props.node.refCanvasId) {
    void router.push({ name: 'canvas', params: { templateId: target }, query: { documentId: target } })
  } else {
    void router.push({ name: 'canvas', params: { templateId: target } })
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

/** 关闭弹窗：把挂载前 docStore 的状态整份恢复，不留痕迹。 */
function unmount() {
  const prev = snapshot
  snapshot = null
  owned = null
  if (!prev) return
  docStore.restoreDocContext(prev)
}

// 捕获阶段监听：画布里的编辑器会吞掉 Esc（冒泡阶段收不到）。
onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  void prepare()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  unmount()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="pm-overlay ng-ce-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="canvasName"
      @click.self="emit('close')"
    >
      <div class="pm-card ng-ce-card" @click.stop>
        <div class="pm-header ng-ce-header">
          <el-icon class="ng-ce-icon"><Connection /></el-icon>
          <h3 class="pm-title ng-ce-title">{{ canvasName }}</h3>
          <span class="ng-ce-bind">{{ bindState }}</span>
          <div class="pm-actions">
            <button
              type="button"
              class="ng-ce-btn"
              title="在画布页面打开"
              @click="openInPage"
            >
              画布页打开
            </button>
            <button
              type="button"
              class="ng-ce-btn ng-ce-btn--primary"
              :disabled="saving || !!error"
              @click="save"
            >
              <el-icon><Check /></el-icon>
              <span>{{ saving ? '保存中…' : '保存' }}</span>
            </button>
            <button
              type="button"
              class="pm-icon-btn pm-close"
              title="关闭"
              aria-label="关闭"
              @click="emit('close')"
            >
              ×
            </button>
          </div>
        </div>

        <div class="pm-body ng-ce-body">
          <p v-if="loading" class="ng-ce-hint">正在打开画布…</p>
          <p v-else-if="error" class="ng-ce-hint ng-ce-hint--error">{{ error }}</p>
          <CanvasViewport v-else />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ng-ce-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0;
}

.ng-ce-body > * {
  flex: 1;
  min-width: 0;
}

.ng-ce-icon {
  color: #7c3aed;
  font-size: 18px;
}

.ng-ce-title {
  flex: 0 1 auto;
}

.ng-ce-bind {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--mm-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-ce-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--mm-line-strong);
  background: #fff;
  color: var(--mm-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ng-ce-btn:hover:not(:disabled) {
  border-color: var(--mm-blue);
  color: var(--mm-blue);
}

.ng-ce-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.ng-ce-btn--primary {
  border-color: transparent;
  background: var(--mm-blue);
  color: #fff;
}

.ng-ce-btn--primary:hover:not(:disabled) {
  color: #fff;
  background: var(--mm-blue-deep);
}

.ng-ce-hint {
  align-self: center;
  margin: 0 auto;
  font-size: 14px;
  color: var(--mm-muted);
}

.ng-ce-hint--error {
  color: var(--mm-red);
}
</style>
