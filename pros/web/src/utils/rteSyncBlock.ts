/**
 * 跨文档同步块：状态机、刷新与失效态。
 *
 * 同步块是「快照 + 手动刷新」：正文里存来源与快照文本，刷新时重新抓取来源正文。
 * 抓取失败（源删除 / 无权限 / 网络失败）时块进入失效态，而不是静默空白或抛错。
 *
 * 本文件只放纯逻辑：状态归类、失败映射、刷新流程与 DOM 构建，
 * 网络请求由调用方（api 层）以 fetcher 注入，便于单测。
 */
import { ApiError } from '../api/http'
import { friendlyApiMessage } from './apiMessage'

/** 同步块状态。 */
export type SyncBlockStatus =
  /** 已同步，内容是上次抓取的快照 */
  | 'synced'
  /** 正在刷新 */
  | 'loading'
  /** 来源已被删除或不存在（404） */
  | 'missing'
  /** 没有访问来源的权限（403） */
  | 'forbidden'
  /** 网络失败 / 服务异常等其它错误 */
  | 'error'

export const SYNC_BLOCK_STATUSES: readonly SyncBlockStatus[] = [
  'synced',
  'loading',
  'missing',
  'forbidden',
  'error',
]

/** 归一化存盘的状态值；不认识的一律当作已同步，避免旧文档被误判成失效。 */
export function normalizeSyncBlockStatus(raw: unknown): SyncBlockStatus {
  if (typeof raw !== 'string') return 'synced'
  const value = raw.trim()
  return (SYNC_BLOCK_STATUSES as readonly string[]).includes(value)
    ? (value as SyncBlockStatus)
    : 'synced'
}

/** 失效态的文案口径。 */
export function syncBlockFailureState(error: unknown): {
  status: SyncBlockStatus
  message: string
} {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { status: 'missing', message: '来源文档已被删除或不存在。' }
    }
    if (error.status === 403) {
      return { status: 'forbidden', message: '没有权限访问来源文档。' }
    }
    if (error.status === 401) {
      return { status: 'error', message: '登录已失效，请重新登录后再刷新。' }
    }
    if (error.status >= 500) {
      return { status: 'error', message: '服务暂时不可用，请稍后重试。' }
    }
    return { status: 'error', message: friendlyApiMessage(error, '刷新来源失败，请重试。') }
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'TimeoutError') {
      return { status: 'error', message: '请求超时，请重试。' }
    }
  }
  if (error instanceof TypeError) {
    return { status: 'error', message: '网络中断，请检查连接后重试。' }
  }
  if (error instanceof Error && error.message && !/failed to fetch|request failed/i.test(error.message)) {
    return { status: 'error', message: error.message }
  }
  return { status: 'error', message: '刷新来源失败，请重试。' }
}

/** 状态对应的界面文案。 */
export type SyncBlockView = {
  /** 状态标题，例如「已同步」「来源文档已删除」 */
  title: string
  /** 状态说明 */
  hint: string
  /** 语气：正常 / 警告 / 错误 */
  tone: 'ok' | 'warn' | 'error'
  /** 是否处于加载中 */
  loading: boolean
  /** 是否展示「重试」按钮 */
  canRetry: boolean
  /** 是否展示「解除同步」按钮 */
  canUnlink: boolean
  /** 是否展示「移除」按钮 */
  canRemove: boolean
}

/** 根据状态与错误文案算出界面呈现。 */
export function syncBlockView(status: SyncBlockStatus, message?: string): SyncBlockView {
  const hint = (message || '').trim()
  switch (status) {
    case 'loading':
      return {
        title: '正在刷新…',
        hint: '正在从来源文档拉取最新内容。',
        tone: 'warn',
        loading: true,
        canRetry: false,
        canUnlink: false,
        canRemove: false,
      }
    case 'missing':
      return {
        title: '来源文档已删除',
        hint: hint || '来源文档已被删除或不存在。',
        tone: 'error',
        loading: false,
        canRetry: true,
        canUnlink: true,
        canRemove: true,
      }
    case 'forbidden':
      return {
        title: '没有访问权限',
        hint: hint || '没有权限访问来源文档。',
        tone: 'error',
        loading: false,
        canRetry: true,
        canUnlink: true,
        canRemove: true,
      }
    case 'error':
      return {
        title: '同步失败',
        hint: hint || '刷新来源失败，请重试。',
        tone: 'error',
        loading: false,
        canRetry: true,
        canUnlink: true,
        canRemove: true,
      }
    case 'synced':
    default:
      return {
        title: '已同步',
        hint: '内容是上次同步时的快照，点「刷新」可拉取最新内容。',
        tone: 'ok',
        loading: false,
        canRetry: true,
        canUnlink: true,
        canRemove: false,
      }
  }
}

/** 抓取来源正文的函数（由 api 层注入）。 */
export type SyncBlockFetcher = (
  documentId: string,
  panelId?: string,
) => Promise<{ text: string; panelId?: string }>

/** 刷新结果。 */
export type SyncBlockRefreshResult =
  | { ok: true; status: 'synced'; text: string; panelId?: string; syncedAt: string }
  | { ok: false; status: SyncBlockStatus; message: string }

/** 同步时间戳（本地时区，分钟精度）。 */
export function formatSyncTime(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  )
}

/**
 * 刷新同步块：重新抓取来源正文。
 * 成功返回新的快照与同步时间；失败返回失效态与可展示的原因。
 */
export async function refreshSyncBlock(params: {
  documentId: string
  panelId?: string
  fetcher: SyncBlockFetcher
  now?: Date
}): Promise<SyncBlockRefreshResult> {
  const { documentId, panelId, fetcher } = params
  const id = (documentId || '').trim()
  if (!id) {
    return { ok: false, status: 'error', message: '同步块缺少来源文档，无法刷新。' }
  }
  try {
    const snapshot = await fetcher(id, panelId)
    const text = String(snapshot?.text ?? '').trim()
    if (!text) {
      return { ok: false, status: 'error', message: '来源文档没有可同步的正文内容。' }
    }
    return {
      ok: true,
      status: 'synced',
      text,
      panelId: snapshot?.panelId || panelId || undefined,
      syncedAt: formatSyncTime(params.now),
    }
  } catch (error) {
    const failure = syncBlockFailureState(error)
    return { ok: false, status: failure.status, message: failure.message }
  }
}

/** 来源文档的站内跳转链接（hash 路由）。 */
export function syncBlockSourceHref(source: {
  documentId: string
  panelId?: string
}): string {
  const id = encodeURIComponent(source.documentId || '')
  if (source.panelId) {
    return `#/canvas/${id}?panel=${encodeURIComponent(source.panelId)}`
  }
  return `#/canvas/${id}`
}

/** 构建同步块界面时需要的入参。 */
export type SyncBlockRenderOptions = {
  status: SyncBlockStatus
  documentId: string
  documentTitle?: string
  panelId?: string
  text?: string
  syncedAt?: string
  /** 失效原因文案 */
  message?: string
  /** 点「刷新 / 重试」 */
  onRefresh?: () => void
  /** 点「解除同步」：把块换成普通段落，保留快照文本 */
  onUnlink?: () => void
  /** 点「移除」：删掉整个块 */
  onRemove?: () => void
}

/**
 * 把同步块界面渲染进给定元素。
 * 正常态有「刷新」，失效态有「重试 / 解除同步 / 移除」，加载中禁用操作。
 */
export function renderSyncBlockInto(el: HTMLElement, opts: SyncBlockRenderOptions): HTMLElement {
  const view = syncBlockView(opts.status, opts.message)
  const title = (opts.documentTitle || '').trim() || '来源文档'
  const snapshot = String(opts.text || '')
  const href = syncBlockSourceHref({ documentId: opts.documentId, panelId: opts.panelId })

  el.className = `rte-sync-block is-${opts.status}`
  el.setAttribute('data-sync-status', opts.status)
  if (opts.documentId) el.setAttribute('data-sync-document', opts.documentId)
  if (opts.panelId) el.setAttribute('data-sync-panel', opts.panelId)
  if (opts.documentTitle) el.setAttribute('data-sync-title', opts.documentTitle)
  if (opts.syncedAt) el.setAttribute('data-sync-at', opts.syncedAt)
  el.setAttribute('data-sync-text', snapshot)
  el.replaceChildren()

  const head = el.ownerDocument.createElement('div')
  head.className = 'rte-sync-block-head'

  const link = el.ownerDocument.createElement('a')
  link.className = 'rte-sync-block-link'
  link.setAttribute('href', href)
  link.textContent = title
  head.appendChild(link)

  const state = el.ownerDocument.createElement('span')
  state.className = 'rte-sync-block-state-label'
  state.textContent = view.title
  head.appendChild(state)

  const actions = el.ownerDocument.createElement('span')
  actions.className = 'rte-sync-block-actions'

  const addButton = (
    text: string,
    className: string,
    title: string,
    onClick?: () => void,
    disabled = false,
  ): HTMLButtonElement => {
    const btn = el.ownerDocument.createElement('button')
    btn.type = 'button'
    btn.className = `rte-sync-block-btn ${className}`.trim()
    btn.textContent = text
    btn.title = title
    btn.disabled = disabled
    if (disabled) btn.setAttribute('aria-disabled', 'true')
    if (onClick) btn.addEventListener('click', onClick)
    actions.appendChild(btn)
    return btn
  }

  if (!view.loading) {
    const retry = view.canRetry && opts.status !== 'synced'
    addButton(retry ? '重试' : '刷新', 'is-refresh', retry ? '再从来源文档拉一次' : '从来源文档再拉一次内容', opts.onRefresh)
  }
  if (view.canUnlink) {
    addButton('解除同步', 'is-unlink', '留下现在的文字，不再跟着来源变', opts.onUnlink)
  }
  if (view.canRemove) {
    addButton('移除', 'is-remove', '从本文删掉这块', opts.onRemove)
  }
  head.appendChild(actions)
  el.appendChild(head)

  const body = el.ownerDocument.createElement('div')
  body.className = snapshot ? 'rte-sync-block-text' : 'rte-sync-block-text is-empty'
  body.textContent = snapshot || '还没有同步内容'
  el.appendChild(body)

  if (view.loading) {
    const loading = el.ownerDocument.createElement('div')
    loading.className = 'rte-sync-block-loading'
    loading.setAttribute('role', 'status')
    loading.setAttribute('aria-live', 'polite')
    loading.textContent = '正在刷新同步内容…'
    el.appendChild(loading)
  } else if (opts.status !== 'synced') {
    const notice = el.ownerDocument.createElement('div')
    notice.className = `rte-sync-block-notice is-${view.tone}`
    notice.setAttribute('role', 'alert')
    const noticeTitle = el.ownerDocument.createElement('strong')
    noticeTitle.className = 'rte-sync-block-notice-title'
    noticeTitle.textContent = view.title
    const noticeHint = el.ownerDocument.createElement('span')
    noticeHint.className = 'rte-sync-block-notice-hint'
    noticeHint.textContent = view.hint
    notice.appendChild(noticeTitle)
    notice.appendChild(noticeHint)
    el.appendChild(notice)
  }

  if (opts.syncedAt) {
    const time = el.ownerDocument.createElement('div')
    time.className = 'rte-sync-block-time'
    time.textContent = `同步于 ${opts.syncedAt}`
    el.appendChild(time)
  }

  return el
}

/** 新建一个同步块元素（便于单测与静态渲染）。 */
export function buildSyncBlockElement(doc: Document, opts: SyncBlockRenderOptions): HTMLElement {
  const el = doc.createElement('div')
  return renderSyncBlockInto(el, opts)
}
