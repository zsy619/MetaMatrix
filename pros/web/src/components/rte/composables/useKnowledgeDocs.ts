import { ref } from 'vue'
import { getKnowledgeTree } from '../../../api/knowledge'
import { listDocuments } from '../../../api/documents'
import type { RteDocCandidate } from '../../rteMentionItems'

/**
 * 知识库 @ 候选：当前项目下所有文档。
 *
 * - 数据来源：api/knowledge.getKnowledgeTree（知识树 doc 节点，带标题/图标）
 *   + api/documents.listDocuments（项目下全部文档，补画布类）。
 * - 合并去重：知识树优先（标题更准），其余文档补齐。
 * - projectId 为空时返回空（非知识库场景）。
 * - canvasType 透传给 mention command，非 doc 走 canvasEmbed 块。
 */
export function useKnowledgeDocs(projectId: () => string) {
  const docs = ref<RteDocCandidate[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  let pending: Promise<RteDocCandidate[]> | null = null

  async function loadDocs(force = false): Promise<RteDocCandidate[]> {
    const pid = projectId()
    if (!pid) {
      docs.value = []
      loaded.value = false
      return []
    }
    if (loaded.value && !force) return docs.value
    if (pending) return pending
    loading.value = true
    pending = Promise.all([
      getKnowledgeTree(pid).catch(() => []),
      listDocuments({ projectId: pid, limit: 100 }).catch(() => []),
    ])
      .then(([nodes, allDocs]) => {
        const byId = new Map<string, RteDocCandidate>()
        for (const d of allDocs) {
          byId.set(d.id, {
            documentId: d.id,
            title: d.title,
            icon: d.canvasType === 'doc' ? '📄' : '🎨',
            canvasType: d.canvasType,
          })
        }
        // 知识树节点标题优先（可能被用户重命名过）。
        for (const n of nodes) {
          if (n.nodeType === 'doc' && n.documentId) {
            byId.set(n.documentId, {
              documentId: n.documentId,
              title: n.title,
              icon: n.icon || '📄',
              canvasType: 'doc',
            })
          }
        }
        // 多维表格节点：作为「内嵌表格视图块」候选（canvasType='base'）。
        for (const n of nodes) {
          if (n.nodeType !== 'sheet') continue
          byId.set(`base:${n.id}`, {
            documentId: n.id,
            title: n.title,
            icon: n.icon || '📊',
            canvasType: 'base',
            nodeId: n.id,
          })
        }
        docs.value = [...byId.values()]
        loaded.value = true
        return docs.value
      })
      .catch(() => {
        docs.value = []
        return docs.value
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }

  async function mentionDocuments(): Promise<RteDocCandidate[]> {
    return loadDocs()
  }

  return {
    docs,
    docsLoading: loading,
    docsLoaded: loaded,
    loadDocs,
    mentionDocuments,
  }
}
