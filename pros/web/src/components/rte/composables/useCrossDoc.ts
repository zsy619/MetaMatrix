import { ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import { getAIContext, searchDocuments } from '../../../api/documents'
import {
  crossDocJumpHref,
  normalizeCrossDocHits,
  syncBlockSummary,
  type CrossDocHit,
} from '../../../utils/rteCrossDoc'

/**
 * 跨文档：搜索跳转 + 同步块。
 *
 * - 搜索走服务端 /documents/search（已有接口）。
 * - 同步块把来源文档的正文快照存进节点，点来源可以跳到原文。
 *   同步是快照 + 手动刷新，不是后台实时同步。
 */
export function useCrossDoc(deps: {
  editor: () => ShallowRef<Editor | undefined>
  announce: (message: string) => void
}) {
  const crossDocOpen = ref(false)
  const crossDocQuery = ref('')
  const crossDocHits = ref<CrossDocHit[]>([])
  const crossDocBusy = ref(false)
  const crossDocError = ref('')
  const crossDocSyncing = ref(false)

  function openCrossDoc() {
    crossDocOpen.value = true
    crossDocError.value = ''
    if (!crossDocHits.value.length) void searchCrossDoc()
  }

  function closeCrossDoc() {
    crossDocOpen.value = false
  }

  /** 搜索其它文档。 */
  async function searchCrossDoc() {
    const q = crossDocQuery.value.trim()
    if (!q) {
      crossDocHits.value = []
      crossDocError.value = '输入关键词再搜'
      return
    }
    crossDocBusy.value = true
    crossDocError.value = ''
    try {
      const res = await searchDocuments({ q, limit: 20 })
      const list = Array.isArray(res) ? res : []
      crossDocHits.value = normalizeCrossDocHits(
        list.map((hit) => ({
          documentId: hit.id,
          title: hit.title || '未命名文档',
          panelId: hit.panelId || undefined,
          panelTitle: hit.panelTitle || undefined,
          snippet: hit.snippet || undefined,
        })),
        20,
      )
      if (!crossDocHits.value.length) crossDocError.value = '没有搜到相关文档'
    } catch (err) {
      crossDocError.value = err instanceof Error ? err.message : '跨文档搜索失败'
      crossDocHits.value = []
    } finally {
      crossDocBusy.value = false
    }
  }

  /** 跳到来源文档。 */
  function jumpToCrossDoc(hit: CrossDocHit) {
    const href = crossDocJumpHref(hit)
    window.location.hash = href.replace(/^#/, '')
    deps.announce('跳转到：' + (hit.title || '文档'))
  }

  /** 取来源文档的面板正文快照。 */
  async function fetchSyncSnapshot(documentId: string): Promise<{ text: string; panelId?: string }> {
    const ctx = await getAIContext(documentId)
    const panels = Array.isArray(ctx?.panels) ? ctx.panels : []
    const first = panels.find((p) => p && p.text && p.text.trim())
    if (!first) return { text: '' }
    return { text: first.text.slice(0, 4000), panelId: first.panelId }
  }

  /** 插入一个同步块：存来源与快照。 */
  async function insertSyncBlock(hit: CrossDocHit) {
    const ed = deps.editor().value
    if (!ed) return
    crossDocSyncing.value = true
    try {
      const snapshot = await fetchSyncSnapshot(hit.documentId)
      const syncedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
      ed.chain()
        .focus()
        .insertContent({
          type: 'syncBlock',
          attrs: {
            documentId: hit.documentId,
            documentTitle: hit.title || '',
            panelId: hit.panelId || snapshot.panelId || '',
            text: snapshot.text || hit.snippet || '',
            syncedAt,
          },
        })
        .run()
      crossDocOpen.value = false
      deps.announce('已插入同步块')
      ElMessage.success('已插入同步块')
    } catch (err) {
      crossDocError.value = err instanceof Error ? err.message : '同步块插入失败'
    } finally {
      crossDocSyncing.value = false
    }
  }

  /** 同步块摘要，用于列表展示。 */
  function syncBlockPreview(text: string) {
    return syncBlockSummary(text, 80)
  }

  return {
    crossDocOpen,
    crossDocQuery,
    crossDocHits,
    crossDocBusy,
    crossDocError,
    crossDocSyncing,
    openCrossDoc,
    closeCrossDoc,
    searchCrossDoc,
    jumpToCrossDoc,
    insertSyncBlock,
    syncBlockPreview,
  }
}
