import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import * as documentsApi from '../api/documents'
import { ApiError } from '../api/http'
import {
  alignNodes,
  distributeNodes,
  type AlignMode,
  type DistributeMode,
} from '../components/canvas/nodeGraph/align'
import { computeLayout, type LayoutMode } from '../components/canvas/nodeGraph/layout'
import {
  DEFAULT_NODE_GRAPH_BACKGROUND,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_GRAPH_TYPE,
  isNodeGraphDoc,
  normalizeNodeGraphDoc,
  type GraphEdge,
  type GraphEdgeStyle,
  type GraphNode,
  type NodeGraphBackground,
  type NodeGraphDocumentJSON,
  type NodeGraphSettings,
  type NodeGraphNodeType,
  type NodeGraphViewport,
  type ActivityEntry,
  type DeletedNode,
  type NodeComment,
} from '../types/nodeGraph'

/** 撤销栈深度。与 stores/history.ts 保持一致。 */
const MAX_STACK = 50
/** 自动保存防抖。画布改动频繁，800ms 足够短也不会打爆接口。 */
const SAVE_DEBOUNCE_MS = 800

type Snapshot = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport: NodeGraphViewport
}

/** 剪贴板里存的节点子图：复制/剪切时整体序列化，粘贴时重新发 id。 */
export type NodeClipboard = {
  version: 1
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(toRaw(snapshot))) as Snapshot
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return prefix + '_' + rand
}

/**
 * 节点画布的文档状态。
 *
 * 画布内容存在服务端 kb_documents.current_data（JSONB），
 * 这里只负责：加载 / 编辑 / 自动保存 / 撤销重做 / 选中态。
 */
export const useNodeGraphStore = defineStore('nodeGraph', () => {
  const docId = ref<string | null>(null)
  const projectId = ref<string | null>(null)
  const title = ref('')
  const nodes = ref<GraphNode[]>([])
  const edges = ref<GraphEdge[]>([])
  const viewport = ref<NodeGraphViewport>({ x: 0, y: 0, zoom: 1 })
  /** 画布背景模板（图案/颜色/间距）。 */
  const background = ref<NodeGraphBackground>({ ...DEFAULT_NODE_GRAPH_BACKGROUND })
  const comments = ref<NodeComment[]>([])
  const deleted = ref<DeletedNode[]>([])
  const activity = ref<ActivityEntry[]>([])
  const settings = ref<NodeGraphSettings>({ snap: false, gridSize: 8 })

  const dirty = ref(false)
  const saving = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const lastSavedAt = ref('')
  const retryCount = ref(0)
  const conflict = ref<{ remoteVersion: number; remote: NodeGraphDocumentJSON } | null>(null)
  const saveVersion = ref(0)
  const headRevisionId = ref<string | null>(null)
  const updatedAt = ref('')

  const selectedNodeIds = ref<string[]>([])
  const selectedEdgeIds = ref<string[]>([])
  /** 正在右侧面板展示的节点。 */
  const activeNodeId = ref<string | null>(null)

  const past = ref<Snapshot[]>([])
  const future = ref<Snapshot[]>([])
  /** 与 past 一一对应的操作标签，撤销历史面板用它。 */
  const pastLabels = ref<string[]>([])
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  /** 撤销历史（最新在前），面板直接展示。 */
  const historyEntries = computed(() =>
    pastLabels.value
      .map((label, index) => ({ label, index }))
      .reverse(),
  )

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  /** 打开面板那一刻的快照：面板关闭时若内容变了，就把它压进撤销栈。 */
  let panelBaseline: Snapshot | null = null

  function userScope(): string {
    try {
      const raw = localStorage.getItem('metamatrix:user')
      const parsed = raw ? (JSON.parse(raw) as { id?: string }) : null
      return parsed?.id || 'anon'
    } catch {
      return 'anon'
    }
  }

  function draftKey(id: string): string {
    return 'metamatrix:nodegraph:' + userScope() + ':' + id
  }

  function snapshot(): Snapshot {
    return {
      nodes: JSON.parse(JSON.stringify(toRaw(nodes.value))) as GraphNode[],
      edges: JSON.parse(JSON.stringify(toRaw(edges.value))) as GraphEdge[],
      viewport: { ...viewport.value },
    }
  }

  function pushHistory(label = '编辑'): void {
    past.value.push(snapshot())
    pastLabels.value.push(label)
    if (past.value.length > MAX_STACK) {
      past.value.shift()
      pastLabels.value.shift()
    }
    future.value = []
  }

  function applySnapshot(next: Snapshot): void {
    nodes.value = next.nodes
    edges.value = next.edges
    viewport.value = { ...next.viewport }
    markDirty()
  }

  function undo(): void {
    const prev = past.value.pop()
    if (!prev) return
    pastLabels.value.pop()
    future.value.push(snapshot())
    applySnapshot(cloneSnapshot(prev))
  }

  function redo(): void {
    const next = future.value.pop()
    if (!next) return
    past.value.push(snapshot())
    pastLabels.value.push('重做')
    if (past.value.length > MAX_STACK) {
      past.value.shift()
      pastLabels.value.shift()
    }
    applySnapshot(cloneSnapshot(next))
  }

  /** 直接跳到历史上某一步：把它之后的步骤逐个回退。 */
  function undoTo(index: number): void {
    if (index < 0 || index >= past.value.length) return
    while (past.value.length > index) {
      const prev = past.value.pop()
      if (!prev) break
      pastLabels.value.pop()
      future.value.push(snapshot())
      applySnapshot(cloneSnapshot(prev))
    }
  }

  function markDirty(persist = true): void {
    dirty.value = true
    saveError.value = ''
    if (persist) persistDraft()
    scheduleSave()
  }

  // ---------- 本地草稿 ----------

  function persistDraft(): void {
    if (!docId.value) return
    try {
      localStorage.setItem(
        draftKey(docId.value),
        JSON.stringify({ savedAt: new Date().toISOString(), doc: currentDoc() }),
      )
    } catch {
      /* 隐私模式写不进时，本次会话的修改仍在，服务端保存照常进行 */
    }
  }

  function readDraft(id: string): { savedAt: string; doc: unknown } | null {
    try {
      const raw = localStorage.getItem(draftKey(id))
      return raw ? (JSON.parse(raw) as { savedAt: string; doc: unknown }) : null
    } catch {
      return null
    }
  }

  function currentDoc(): NodeGraphDocumentJSON {
    return {
      id: docId.value || '',
      type: NODE_GRAPH_TYPE,
      schemaVersion: 1,
      viewport: { ...viewport.value },
      background: { ...background.value },
      nodes: nodes.value,
      edges: edges.value,
      comments: comments.value,
      deleted: deleted.value,
      activity: activity.value,
      settings: { ...settings.value },
    }
  }

  // ---------- 加载与保存 ----------

  async function load(id: string): Promise<void> {
    loadError.value = ''
    saveError.value = ''
    try {
      const doc = await documentsApi.getDocument(id)
      const normalized = isNodeGraphDoc(doc.currentData)
        ? normalizeNodeGraphDoc(doc.currentData)
        : null
      if (!normalized) {
        loadError.value = '这不是节点画布'
        return
      }
      docId.value = doc.id
      projectId.value = doc.projectId ?? null
      title.value = doc.title
      saveVersion.value = doc.saveVersion ?? 0
      headRevisionId.value = doc.headRevisionId ?? null
      updatedAt.value = doc.updatedAt

      // 本地草稿比服务端新时用草稿：断网期间的修改不能丢。
      const draft = readDraft(id)
      const draftDoc = draft ? normalizeNodeGraphDoc(draft.doc) : null
      if (draftDoc && draft && draft.savedAt > doc.updatedAt) {
        nodes.value = draftDoc.nodes
        edges.value = draftDoc.edges
        viewport.value = draftDoc.viewport
        background.value = draftDoc.background || { ...DEFAULT_NODE_GRAPH_BACKGROUND }
        applyExtras(draftDoc)
        dirty.value = true
      } else {
        nodes.value = normalized.nodes
        edges.value = normalized.edges
        viewport.value = normalized.viewport
        background.value = normalized.background || { ...DEFAULT_NODE_GRAPH_BACKGROUND }
        applyExtras(normalized)
        dirty.value = false
        lastSavedAt.value = doc.updatedAt
      }
      past.value = []
      future.value = []
      pastLabels.value = []
      retryCount.value = 0
      conflict.value = null
      selectedNodeIds.value = []
      selectedEdgeIds.value = []
      activeNodeId.value = null
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '加载失败'
    }
  }

  /** 画布的附加数据：评论 / 回收站 / 操作记录 / 吸附设置。 */
  function applyExtras(next: NodeGraphDocumentJSON): void {
    comments.value = next.comments || []
    deleted.value = next.deleted || []
    activity.value = next.activity || []
    settings.value = { snap: next.settings?.snap === true, gridSize: next.settings?.gridSize || 8 }
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void save()
    }, SAVE_DEBOUNCE_MS)
  }

  async function save(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!docId.value || saving.value) return
    saving.value = true
    try {
      const doc = await documentsApi.updateDocument(docId.value, {
        currentData: currentDoc(),
        expectedSaveVersion: saveVersion.value || undefined,
      })
      saveVersion.value = doc.saveVersion ?? saveVersion.value
      headRevisionId.value = doc.headRevisionId ?? headRevisionId.value
      updatedAt.value = doc.updatedAt
      lastSavedAt.value = doc.updatedAt
      dirty.value = false
      saveError.value = ''
      retryCount.value = 0
    } catch (error) {
      // 版本冲突：把远端最新内容拉下来，交给顶栏弹窗让用户选。
      if (error instanceof ApiError && error.status === 409 && docId.value) {
        try {
          const latest = await documentsApi.getDocument(docId.value)
          const remote = normalizeNodeGraphDoc(latest.currentData)
          if (remote) {
            conflict.value = { remoteVersion: latest.saveVersion, remote }
            saveError.value = '保存冲突：远端已有更新'
            return
          }
        } catch {
          /* 拉不到远端就退回普通错误提示 */
        }
      }
      saveError.value = error instanceof Error ? error.message : '保存失败'
      retryCount.value += 1
      scheduleRetry()
    } finally {
      saving.value = false
    }
  }

  /** 保存失败后按 2s、4s、8s…最多 15s 重试，离线时等 online 事件。 */
  function scheduleRetry(): void {
    const delay = Math.min(15000, 1000 * 2 ** Math.min(retryCount.value, 4))
    setTimeout(() => {
      if (dirty.value && !saving.value && !conflict.value && navigator.onLine !== false) void save()
    }, delay)
  }

  // 网络恢复后自动补一次保存，离线期间的修改不用用户手动点。
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (dirty.value && !saving.value && !conflict.value) void save()
    })
  }

  /** 冲突解决：用我的 / 用远端 / 另存副本。 */
  async function resolveConflict(choice: 'mine' | 'remote' | 'copy'): Promise<void> {
    const state = conflict.value
    if (!state || !docId.value) return
    if (choice === 'remote') {
      nodes.value = state.remote.nodes
      edges.value = state.remote.edges
      viewport.value = state.remote.viewport
      background.value = state.remote.background || { ...DEFAULT_NODE_GRAPH_BACKGROUND }
      applyExtras(state.remote)
      saveVersion.value = state.remoteVersion
      dirty.value = false
      conflict.value = null
      saveError.value = ''
      past.value = []
      pastLabels.value = []
      future.value = []
      return
    }
    if (choice === 'copy') {
      const copy = await documentsApi.createDocument({
        title: (title.value || '节点画布') + '（副本）',
        projectId: projectId.value || undefined,
        canvasType: NODE_GRAPH_TYPE,
        data: currentDoc(),
      })
      void copy
      conflict.value = null
      saveError.value = ''
      return
    }
    // 用我的：接受远端版本号后覆盖保存。
    saveVersion.value = state.remoteVersion
    conflict.value = null
    saveError.value = ''
    dirty.value = true
    await save()
  }

  // ---------- 版本快照 ----------

  /** 存一个版本：先把未保存的改动落盘，再打一个带标签的 revision。 */
  async function createCheckpoint(label?: string): Promise<void> {
    if (!docId.value) throw new Error('画布还没加载')
    if (dirty.value || saving.value) await save()
    const res = await documentsApi.createRevision(docId.value, {
      expectedSaveVersion: saveVersion.value || undefined,
      expectedHeadRevisionId: headRevisionId.value,
      label: label || undefined,
    })
    saveVersion.value = res.document.saveVersion ?? saveVersion.value
    headRevisionId.value = res.revision.id
    updatedAt.value = res.document.updatedAt ?? updatedAt.value
  }

  /** 恢复到某个版本：服务端已经生成新 revision，本地整体换掉内容。 */
  async function restoreRevision(revisionId: string): Promise<void> {
    if (!docId.value) throw new Error('画布还没加载')
    const doc = await documentsApi.restoreDocument(docId.value, {
      revisionId,
      expectedSaveVersion: saveVersion.value || undefined,
      expectedHeadRevisionId: headRevisionId.value,
    })
    const normalized = normalizeNodeGraphDoc(doc.currentData)
    if (!normalized) throw new Error('这个版本不是节点画布')
    nodes.value = normalized.nodes
    edges.value = normalized.edges
    viewport.value = normalized.viewport
    background.value = normalized.background || { ...DEFAULT_NODE_GRAPH_BACKGROUND }
    saveVersion.value = doc.saveVersion ?? saveVersion.value
    headRevisionId.value = doc.headRevisionId ?? headRevisionId.value
    updatedAt.value = doc.updatedAt
    dirty.value = false
    past.value = []
    future.value = []
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    activeNodeId.value = null
  }

  // ---------- 节点操作 ----------

  /**
   * 新建节点。
   *
   * target 是画布节点的目标，创建时选定后不可更改（类型即隐含属性）：
   * refTemplateId 指向 92 个画布之一，refCanvasId 指向本项目里的画布。
   */
  function addNode(
    type: NodeGraphNodeType,
    x: number,
    y: number,
    target?: { refTemplateId?: string; refCanvasId?: string },
  ): GraphNode {
    pushHistory('新建节点')
    const node: GraphNode = {
      id: newId('n'),
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      title: type === 'richtext' ? '富文本节点' : '画布引用',
      ...(type === 'richtext'
        ? { content: '' }
        : {
            ...(target?.refTemplateId ? { refTemplateId: target.refTemplateId } : {}),
            ...(target?.refCanvasId ? { refCanvasId: target.refCanvasId } : {}),
          }),
    }
    nodes.value = [...nodes.value, node]
    logActivity(type === 'richtext' ? '新建富文本节点' : '新建画布节点', node.id)
    markDirty()
    return node
  }

  /**
   * 更新节点。默认不进撤销栈：正文是逐字输入的，
   * 每敲一个字压一次栈会让撤销变得没法用。
   */
  function updateNode(id: string, patch: Partial<GraphNode>, options?: { history?: boolean }): void {
    const index = nodes.value.findIndex((node) => node.id === id)
    if (index < 0) return
    if (options?.history) pushHistory()
    const next = [...nodes.value]
    next[index] = { ...next[index], ...patch }
    nodes.value = next
    markDirty()
  }

  function removeNodes(ids: string[]): void {
    if (!ids.length) return
    pushHistory('删除节点')
    const set = new Set(ids)
    softDelete(set)
    nodes.value = nodes.value.filter((node) => !set.has(node.id))
    // 删节点时连线一并删除，否则会留下指向空气的箭头。
    edges.value = edges.value.filter((edge) => !set.has(edge.source) && !set.has(edge.target))
    selectedNodeIds.value = selectedNodeIds.value.filter((id) => !set.has(id))
    selectedEdgeIds.value = []
    if (activeNodeId.value && set.has(activeNodeId.value)) activeNodeId.value = null
    logActivity('删除节点 ' + ids.length + ' 个')
    markDirty()
  }

  /** 软删除：节点进回收站，7 天内可恢复（只留最近 50 个）。 */
  function softDelete(ids: Set<string>): void {
    const removed = nodes.value.filter((node) => ids.has(node.id))
    if (!removed.length) return
    const at = new Date().toISOString()
    deleted.value = [...removed.map((node) => ({ node, deletedAt: at })), ...deleted.value].slice(0, 50)
  }

  /** 拖动开始：压一次历史。整个拖动过程只压这一条。 */
  function beginDrag(label = '移动节点'): void {
    pushHistory(label)
  }

  /**
   * 复制节点（连带它们之间的连线），整体偏移一格。
   *
   * 同 excalidraw 的复制：副本成为新的选中项，可以直接接着拖。
   */
  function duplicateNodes(ids: string[], offset = 24): void {
    const picked = ids.length ? ids : [...selectedNodeIds.value]
    if (!picked.length) return
    pushHistory('复制节点')
    const idMap = new Map<string, string>()
    const copies: GraphNode[] = []
    for (const node of nodes.value) {
      if (!picked.includes(node.id)) continue
      const copy: GraphNode = { ...node, id: newId('n'), x: node.x + offset, y: node.y + offset }
      idMap.set(node.id, copy.id)
      copies.push(copy)
    }
    const edgeCopies: GraphEdge[] = edges.value
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: newId('e'),
        source: idMap.get(edge.source) as string,
        target: idMap.get(edge.target) as string,
      }))
    nodes.value = [...nodes.value, ...copies]
    edges.value = [...edges.value, ...edgeCopies]
    selectedNodeIds.value = copies.map((node) => node.id)
    selectedEdgeIds.value = []
    markDirty()
  }

  /** 方向键微调选中的节点（同 excalidraw：默认 1px，Shift 加大步长）。 */
  function nudgeNodes(dx: number, dy: number): void {
    const ids = [...selectedNodeIds.value]
    if (!ids.length) return
    pushHistory('微调位置')
    const set = new Set(ids)
    nodes.value = nodes.value.map((node) =>
      set.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node,
    )
    markDirty()
  }

  /** 全选节点（同 excalidraw 的 Cmd/Ctrl+A）。 */
  function selectAll(): void {
    selectedNodeIds.value = nodes.value.map((node) => node.id)
    selectedEdgeIds.value = []
  }

  /** 按拖动增量移动节点。历史已由 beginDrag 压过，这里不再压。 */
  function moveNodes(origins: Record<string, { x: number; y: number }>, dx: number, dy: number): void {
    nodes.value = nodes.value.map((node) => {
      const origin = origins[node.id]
      if (!origin) return node
      return { ...node, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) }
    })
    markDirty()
  }

  /** 拖拽改节点宽高。历史同样由 beginDrag 压一次。 */
  function resizeNode(id: string, width: number, height: number): void {
    const next = nodes.value.map((node) =>
      node.id === id
        ? {
            ...node,
            width: Math.max(120, Math.min(2000, Math.round(width))),
            height: Math.max(72, Math.min(2000, Math.round(height))),
          }
        : node,
    )
    nodes.value = next
    markDirty()
  }

  /**
   * 对齐/分布选中的节点。
   *
   * 只挪位置不改内容，和一次拖动一样只留一条撤销记录。
   */
  function alignSelection(mode: AlignMode | DistributeMode): void {
    const ids = [...selectedNodeIds.value]
    if (ids.length < 2) return
    const picked = nodes.value.filter((node) => ids.includes(node.id))
    const moves =
      mode === 'horizontal' || mode === 'vertical'
        ? distributeNodes(picked, mode)
        : alignNodes(picked, mode)
    if (!Object.keys(moves).length) return
    pushHistory('对齐节点')
    nodes.value = nodes.value.map((node) => {
      const move = moves[node.id]
      return move ? { ...node, x: move.x, y: move.y } : node
    })
    logActivity('对齐节点')
    markDirty()
  }

  /** 删除选中的节点与连线。一次操作只留一条撤销记录。 */
  function deleteSelection(): void {
    const nodeIds = selectedNodeIds.value.filter(
      (id) => !nodes.value.find((node) => node.id === id)?.locked,
    )
    const edgeIds = [...selectedEdgeIds.value]
    if (!nodeIds.length && !edgeIds.length) return
    pushHistory('删除节点')
    const nodeSet = new Set(nodeIds)
    const edgeSet = new Set(edgeIds)
    softDelete(nodeSet)
    nodes.value = nodes.value.filter((node) => !nodeSet.has(node.id))
    edges.value = edges.value.filter(
      (edge) => !edgeSet.has(edge.id) && !nodeSet.has(edge.source) && !nodeSet.has(edge.target),
    )
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    if (activeNodeId.value && nodeSet.has(activeNodeId.value)) activeNodeId.value = null
    if (nodeSet.size) logActivity('删除节点 ' + nodeSet.size + ' 个')
    markDirty()
  }

  // ---------- 复制 / 剪切 / 粘贴 ----------

  /** 把选中节点（含它们之间的连线）导出成可放进系统剪贴板的 JSON。 */
  function copySelection(ids: string[] = []): NodeClipboard | null {
    const picked = ids.length ? ids : [...selectedNodeIds.value]
    if (!picked.length) return null
    const set = new Set(picked)
    const pickedNodes = nodes.value.filter((node) => set.has(node.id))
    const pickedEdges = edges.value.filter(
      (edge) => set.has(edge.source) && set.has(edge.target),
    )
    return {
      version: 1,
      nodes: JSON.parse(JSON.stringify(pickedNodes)) as GraphNode[],
      edges: JSON.parse(JSON.stringify(pickedEdges)) as GraphEdge[],
    }
  }

  /**
   * 粘贴子图。
   *
   * origin 是副本左上角落点（世界坐标）；不给就整体偏移一格，
   * 和「复制节点」的手感一致。返回新节点 id，方便调用方选中。
   */
  function pasteSubgraph(payload: NodeClipboard, origin?: { x: number; y: number }): string[] {
    if (!payload?.nodes?.length) return []
    pushHistory('粘贴节点')
    const idMap = new Map<string, string>()
    let minX = Infinity
    let minY = Infinity
    for (const node of payload.nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
    }
    const dx = origin ? origin.x - minX : 24
    const dy = origin ? origin.y - minY : 24
    const copies = payload.nodes.map((node) => {
      const id = newId('n')
      idMap.set(node.id, id)
      return { ...node, id, x: Math.round(node.x + dx), y: Math.round(node.y + dy) }
    })
    const edgeCopies = payload.edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: newId('e'),
        source: idMap.get(edge.source) as string,
        target: idMap.get(edge.target) as string,
      }))
    nodes.value = [...nodes.value, ...copies]
    edges.value = [...edges.value, ...edgeCopies]
    selectedNodeIds.value = copies.map((node) => node.id)
    selectedEdgeIds.value = []
    logActivity('粘贴节点 ' + copies.length + ' 个')
    markDirty()
    return selectedNodeIds.value
  }

  /** 一键自动布局（同 excalidraw 的整理画布）。只留一条撤销记录。 */
  function autoLayout(mode: LayoutMode, ids: string[] = []): void {
    const picked = ids.length ? ids : [...selectedNodeIds.value]
    // 锁定的节点不能拖，自动排列也不该挪它。
    const targets = nodes.value.filter((node) => !node.locked && (picked.length < 2 || picked.includes(node.id)))
    if (targets.length < 2) return
    const moves = computeLayout(targets, edges.value, mode)
    if (!Object.keys(moves).length) return
    pushHistory('自动排列')
    const movedIds = new Set(Object.keys(moves))
    nodes.value = nodes.value.map((node) => {
      const move = moves[node.id]
      return move ? { ...node, x: move.x, y: move.y } : node
    })
    // 手动拖过的锚点钉在旧位置上，排完线会绕路；排列后让两端回到朝向自动换边。
    edges.value = edges.value.map((edge) => {
      if (!movedIds.has(edge.source) && !movedIds.has(edge.target)) return edge
      const { sourceAnchor: _source, targetAnchor: _target, ...rest } = edge
      return rest as GraphEdge
    })
    logActivity('自动排列')
    markDirty()
    // 视图层收尾（适应画布）不该塞进 store；发个窗口事件让画布自己处理。
    window.dispatchEvent(new Event('ng-autolayout'))
  }

  // ---------- 节点样式 / 锁定 / 编组 ----------

  /** 批量改节点属性（锁定、折叠、颜色、标签、编组），只留一条撤销记录。 */
  function patchNodes(ids: string[], patch: Partial<GraphNode>, label = '修改节点'): void {
    if (!ids.length) return
    pushHistory(label)
    const set = new Set(ids)
    nodes.value = nodes.value.map((node) => (set.has(node.id) ? { ...node, ...patch } : node))
    logActivity(label, ids[0])
    markDirty()
  }

  function setLocked(ids: string[], locked: boolean): void {
    patchNodes(ids, { locked }, locked ? '锁定节点' : '解锁节点')
    if (locked) selectedNodeIds.value = selectedNodeIds.value.filter((id) => !ids.includes(id))
  }

  function setCollapsed(ids: string[], collapsed: boolean): void {
    patchNodes(ids, { collapsed }, collapsed ? '折叠节点' : '展开节点')
  }

  function setNodeColor(ids: string[], color?: string): void {
    patchNodes(ids, { color }, '修改节点颜色')
  }

  /** 置顶 / 置底：数组顺序就是渲染顺序。 */
  function reorderNodes(ids: string[], where: 'front' | 'back'): void {
    if (!ids.length) return
    pushHistory(where === 'front' ? '置于顶层' : '置于底层')
    const set = new Set(ids)
    const picked = nodes.value.filter((node) => set.has(node.id))
    const rest = nodes.value.filter((node) => !set.has(node.id))
    nodes.value = where === 'front' ? [...rest, ...picked] : [...picked, ...rest]
    markDirty()
  }

  /** 编组：选中节点共用一个 groupId。 */
  function groupSelection(): void {
    const ids = [...selectedNodeIds.value]
    if (ids.length < 2) return
    patchNodes(ids, { groupId: newId('g') }, '编组')
  }

  function ungroupSelection(): void {
    const ids = [...selectedNodeIds.value]
    if (!ids.length) return
    pushHistory('取消编组')
    const set = new Set(ids)
    nodes.value = nodes.value.map((node) => {
      if (!set.has(node.id)) return node
      const next = { ...node }
      delete next.groupId
      return next
    })
    markDirty()
  }

  /** 点组内任意节点，选中整组。 */
  function groupMembers(id: string): string[] {
    const node = nodes.value.find((item) => item.id === id)
    if (!node?.groupId) return [id]
    return nodes.value.filter((item) => item.groupId === node.groupId).map((item) => item.id)
  }

  /** 节点样式模板：复制当前节点的颜色与尺寸，套到别的节点。 */
  let styleClipboard: { color?: string; width: number; height: number } | null = null
  const hasStyleClipboard = ref(false)

  function copyNodeStyle(id: string): void {
    const node = nodes.value.find((item) => item.id === id)
    if (!node) return
    styleClipboard = { color: node.color, width: node.width, height: node.height }
    hasStyleClipboard.value = true
  }

  function pasteNodeStyle(ids: string[]): void {
    if (!styleClipboard || !ids.length) return
    const { color, width, height } = styleClipboard
    pushHistory('套用节点样式')
    const set = new Set(ids)
    nodes.value = nodes.value.map((node) =>
      set.has(node.id) ? { ...node, ...(color ? { color } : { color: undefined }), width, height } : node,
    )
    markDirty()
  }

  // ---------- 评论 ----------

  function currentAuthor(): string {
    try {
      const raw = localStorage.getItem('metamatrix:user')
      const parsed = raw ? (JSON.parse(raw) as { displayName?: string; email?: string }) : null
      return parsed?.displayName || parsed?.email || '我'
    } catch {
      return '我'
    }
  }

  function addComment(nodeId: string, text: string): void {
    const clean = text.trim()
    if (!clean) return
    comments.value = [
      ...comments.value,
      {
        id: newId('c'),
        nodeId,
        text: clean.slice(0, 1000),
        author: currentAuthor(),
        createdAt: new Date().toISOString(),
      },
    ]
    logActivity('评论节点', nodeId)
    markDirty()
  }

  function toggleCommentResolved(id: string): void {
    comments.value = comments.value.map((item) =>
      item.id === id ? { ...item, resolved: !item.resolved } : item,
    )
    markDirty()
  }

  function removeComment(id: string): void {
    comments.value = comments.value.filter((item) => item.id !== id)
    markDirty()
  }

  function commentsOf(nodeId: string): NodeComment[] {
    return comments.value.filter((item) => item.nodeId === nodeId)
  }

  // ---------- 回收站 ----------

  function restoreDeleted(nodeId: string): void {
    const entry = deleted.value.find((item) => item.node.id === nodeId)
    if (!entry) return
    pushHistory('恢复节点')
    nodes.value = [...nodes.value, entry.node]
    deleted.value = deleted.value.filter((item) => item.node.id !== nodeId)
    selectedNodeIds.value = [entry.node.id]
    markDirty()
  }

  function clearDeleted(): void {
    deleted.value = []
    markDirty()
  }

  // ---------- 画布设置与操作记录 ----------

  function setSettings(patch: Partial<NodeGraphSettings>): void {
    settings.value = { ...settings.value, ...patch }
    markDirty()
  }

  function logActivity(action: string, nodeId?: string): void {
    activity.value = [
      ...activity.value,
      { id: newId('a'), action, nodeId, at: new Date().toISOString() },
    ].slice(-200)
  }

  /** 由撤销快照反推某个节点的修改历史（本次会话内）。 */
  function nodeHistory(nodeId: string): { label: string }[] {
    const entries: { label: string }[] = []
    for (let index = 0; index < past.value.length; index += 1) {
      const before = past.value[index].nodes.find((node) => node.id === nodeId)
      const later = index + 1 < past.value.length ? past.value[index + 1].nodes : nodes.value
      const after = later.find((node) => node.id === nodeId)
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        entries.push({ label: pastLabels.value[index] || '编辑' })
      }
    }
    return entries.reverse()
  }

  // ---------- 画布模板 ----------

  type CanvasTemplate = { id: string; name: string; createdAt: string; doc: NodeGraphDocumentJSON }

  function templateKey(): string {
    return 'metamatrix:nodegraph:templates:' + userScope()
  }

  function listTemplates(): CanvasTemplate[] {
    try {
      const raw = localStorage.getItem(templateKey())
      const list = raw ? (JSON.parse(raw) as CanvasTemplate[]) : []
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  function saveTemplate(name: string): void {
    const list = listTemplates()
    const entry: CanvasTemplate = {
      id: newId('t'),
      name: name.trim().slice(0, 40) || '未命名模板',
      createdAt: new Date().toISOString(),
      doc: JSON.parse(JSON.stringify(currentDoc())) as NodeGraphDocumentJSON,
    }
    localStorage.setItem(templateKey(), JSON.stringify([entry, ...list].slice(0, 30)))
  }

  function applyTemplate(id: string): boolean {
    const entry = listTemplates().find((item) => item.id === id)
    if (!entry) return false
    const doc = normalizeNodeGraphDoc(entry.doc)
    if (!doc) return false
    pushHistory('套用画布模板')
    nodes.value = doc.nodes
    edges.value = doc.edges
    viewport.value = doc.viewport
    background.value = doc.background || { ...DEFAULT_NODE_GRAPH_BACKGROUND }
    applyExtras(doc)
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    markDirty()
    return true
  }

  function deleteTemplate(id: string): void {
    localStorage.setItem(
      templateKey(),
      JSON.stringify(listTemplates().filter((item) => item.id !== id)),
    )
  }

  // ---------- 连线操作 ----------

  /**
   * 建立连线。规则：不能连自己；同一方向只保留一条。
   * 返回 false 表示这条连线被规则挡下了。
   */
  function addEdge(
    source: string,
    target: string,
    label = '',
    sourceAnchor?: GraphEdge['sourceAnchor'],
    targetAnchor?: GraphEdge['targetAnchor'],
    points?: { sourcePoint?: { x: number; y: number }; targetPoint?: { x: number; y: number } },
  ): boolean {
    const hasSource = !!source
    const hasTarget = !!target
    if (!hasSource && !points?.sourcePoint) return false
    if (!hasTarget && !points?.targetPoint) return false
    if (hasSource && hasTarget && source === target) return false
    if (hasSource && !nodes.value.some((node) => node.id === source)) return false
    if (hasTarget && !nodes.value.some((node) => node.id === target)) return false
    if (
      hasSource &&
      hasTarget &&
      edges.value.some((edge) => edge.source === source && edge.target === target)
    ) {
      return false
    }
    pushHistory('新增连线')
    edges.value = [
      ...edges.value,
      {
        id: newId('e'),
        source,
        target,
        label,
        ...(sourceAnchor ? { sourceAnchor } : {}),
        ...(targetAnchor ? { targetAnchor } : {}),
        ...(points?.sourcePoint ? { sourcePoint: points.sourcePoint } : {}),
        ...(points?.targetPoint ? { targetPoint: points.targetPoint } : {}),
      },
    ]
    logActivity('新增连线')
    markDirty()
    return true
  }

  function updateEdgeLabel(id: string, label: string): void {
    const index = edges.value.findIndex((edge) => edge.id === id)
    if (index < 0) return
    pushHistory('修改连线标签')
    const next = [...edges.value]
    next[index] = { ...next[index], label }
    edges.value = next
    markDirty()
  }

  /** 连线样式：线型 / 箭头 / 粗细 / 颜色，一次改一项也只留一条撤销记录。 */
  function updateEdgeStyle(id: string, style: Partial<GraphEdgeStyle>): void {
    const index = edges.value.findIndex((edge) => edge.id === id)
    if (index < 0) return
    pushHistory('修改连线样式')
    const next = [...edges.value]
    next[index] = { ...next[index], style: { ...(next[index].style || {}), ...style } }
    edges.value = next
    markDirty()
  }

  /**
   * 把已有连线的某一端改接到另一个节点（或同一节点的别的位置）。
   *
   * 落点在节点内部时，anchor 已经由 anchorForPoint 投影到最近边框，
   * 所以端点听起来是「拖到节点里」，实际仍然钉在可重复计算的边框上。
   */
  function reconnectEdge(
    id: string,
    which: 'source' | 'target',
    nodeId: string,
    anchor?: GraphEdge['sourceAnchor'],
    point?: { x: number; y: number },
  ): boolean {
    const edge = edges.value.find((item) => item.id === id)
    if (!edge) return false
    const source = which === 'source' ? nodeId : edge.source
    const target = which === 'target' ? nodeId : edge.target
    if (!nodeId && !point) return false
    if (source && target && source === target) return false
    if (nodeId && !nodes.value.some((node) => node.id === nodeId)) return false
    if (
      source &&
      target &&
      edges.value.some((item) => item.id !== id && item.source === source && item.target === target)
    ) {
      return false
    }
    pushHistory('改接连线')
    edges.value = edges.value.map((item) =>
      item.id === id ? moveEdgeEnd(item, which, source, target, anchor, point) : item,
    )
    logActivity('改接连线')
    markDirty()
    return true
  }

  /** 改接后同步清掉悬空点/节点 id，避免两个来源同时存在。 */
  function moveEdgeEnd(
    edge: GraphEdge,
    which: 'source' | 'target',
    source: string,
    target: string,
    anchor: GraphEdge['sourceAnchor'],
    point?: { x: number; y: number },
  ): GraphEdge {
    const next: GraphEdge = { ...edge, source, target }
    if (which === 'source') {
      next.sourceAnchor = anchor
      if (point) next.sourcePoint = point
      else delete next.sourcePoint
    } else {
      next.targetAnchor = anchor
      if (point) next.targetPoint = point
      else delete next.targetPoint
    }
    return next
  }

  function removeEdges(ids: string[]): void {
    if (!ids.length) return
    pushHistory()
    const set = new Set(ids)
    edges.value = edges.value.filter((edge) => !set.has(edge.id))
    selectedEdgeIds.value = selectedEdgeIds.value.filter((id) => !set.has(id))
    markDirty()
  }

  // ---------- 视口与选中 ----------

  function setViewport(next: NodeGraphViewport): void {
    viewport.value = { ...next }
    // 视口变化也要持久化，但不值得为平移压一次撤销栈；
    // 也不写本地草稿：一次缩放能触发几十次，写草稿太浪费。
    markDirty(false)
  }

  /** 换画布背景模板。 */
  function setBackground(next: NodeGraphBackground): void {
    background.value = { ...next }
    markDirty()
  }

  function selectNodes(ids: string[], additive = false): void {
    if (!additive) {
      selectedNodeIds.value = [...ids]
      return
    }
    const set = new Set(selectedNodeIds.value)
    for (const id of ids) {
      if (set.has(id)) set.delete(id)
      else set.add(id)
    }
    selectedNodeIds.value = [...set]
  }

  function selectEdges(ids: string[]): void {
    selectedEdgeIds.value = [...ids]
  }

  function clearSelection(): void {
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
  }

  // ---------- 侧栏 ----------

  function openPanel(id: string): void {
    if (activeNodeId.value === id) return
    closePanel()
    activeNodeId.value = id
    panelBaseline = snapshot()
  }

  function closePanel(): void {
    if (!activeNodeId.value) {
      panelBaseline = null
      return
    }
    // 面板里改过东西才进撤销栈：否则「打开又关闭」会留下一个空操作。
    if (panelBaseline && JSON.stringify(panelBaseline) !== JSON.stringify(snapshot())) {
      past.value.push(panelBaseline)
      if (past.value.length > MAX_STACK) past.value.shift()
      future.value = []
    }
    activeNodeId.value = null
    panelBaseline = null
  }

  function reset(): void {
    docId.value = null
    projectId.value = null
    title.value = ''
    nodes.value = []
    edges.value = []
    viewport.value = { x: 0, y: 0, zoom: 1 }
    background.value = { ...DEFAULT_NODE_GRAPH_BACKGROUND }
    comments.value = []
    deleted.value = []
    activity.value = []
    settings.value = { snap: false, gridSize: 8 }
    dirty.value = false
    saving.value = false
    lastSavedAt.value = ''
    retryCount.value = 0
    conflict.value = null
    loadError.value = ''
    saveError.value = ''
    saveVersion.value = 0
    headRevisionId.value = null
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    activeNodeId.value = null
    past.value = []
    pastLabels.value = []
    future.value = []
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  return {
    docId,
    projectId,
    title,
    nodes,
    edges,
    viewport,
    background,
    comments,
    deleted,
    activity,
    settings,
    dirty,
    saving,
    loadError,
    saveError,
    lastSavedAt,
    retryCount,
    conflict,
    saveVersion,
    updatedAt,
    selectedNodeIds,
    selectedEdgeIds,
    activeNodeId,
    canUndo,
    canRedo,
    historyEntries,
    load,
    save,
    resolveConflict,
    createCheckpoint,
    restoreRevision,
    addNode,
    updateNode,
    removeNodes,
    beginDrag,
    moveNodes,
    resizeNode,
    copySelection,
    pasteSubgraph,
    autoLayout,
    patchNodes,
    setLocked,
    setCollapsed,
    setNodeColor,
    reorderNodes,
    groupSelection,
    ungroupSelection,
    groupMembers,
    copyNodeStyle,
    pasteNodeStyle,
    hasStyleClipboard,
    addComment,
    toggleCommentResolved,
    removeComment,
    commentsOf,
    restoreDeleted,
    clearDeleted,
    setSettings,
    logActivity,
    nodeHistory,
    listTemplates,
    saveTemplate,
    applyTemplate,
    deleteTemplate,
    deleteSelection,
    alignSelection,
    addEdge,
    reconnectEdge,
    updateEdgeLabel,
    updateEdgeStyle,
    removeEdges,
    setViewport,
    setBackground,
    selectNodes,
    selectAll,
    duplicateNodes,
    nudgeNodes,
    selectEdges,
    clearSelection,
    openPanel,
    closePanel,
    undo,
    redo,
    undoTo,
    reset,
  }
})
