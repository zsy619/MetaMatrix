// @vitest-environment happy-dom
/** 跨文档同步块：状态渲染 + 刷新行为（正常 / 加载中 / 404 / 403 / 网络失败）。 */
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import {
  buildSyncBlockElement,
  formatSyncTime,
  normalizeSyncBlockStatus,
  refreshSyncBlock,
  renderSyncBlockInto,
  syncBlockFailureState,
  syncBlockSourceHref,
  syncBlockView,
} from './rteSyncBlock'

function opts(overrides: Record<string, unknown> = {}) {
  return {
    status: 'synced' as const,
    documentId: 'doc-1',
    documentTitle: '方案文档',
    panelId: 'panel-1',
    text: '旧快照内容',
    syncedAt: '2026-11-04 09:00',
    ...overrides,
  } as Parameters<typeof buildSyncBlockElement>[1]
}

describe('同步块状态归类', () => {
  it('未知状态按已同步处理', () => {
    expect(normalizeSyncBlockStatus('synced')).toBe('synced')
    expect(normalizeSyncBlockStatus('missing')).toBe('missing')
    expect(normalizeSyncBlockStatus('随便写的')).toBe('synced')
    expect(normalizeSyncBlockStatus(undefined)).toBe('synced')
  })

  it('404 → 源删除，403 → 无权限，网络异常 → 失败', () => {
    expect(syncBlockFailureState(new ApiError(404, 'not found'))).toEqual({
      status: 'missing',
      message: '来源文档已被删除或不存在。',
    })
    expect(syncBlockFailureState(new ApiError(403, 'forbidden'))).toEqual({
      status: 'forbidden',
      message: '没有权限访问来源文档。',
    })
    expect(syncBlockFailureState(new TypeError('Failed to fetch')).status).toBe('error')
    expect(syncBlockFailureState(new ApiError(500, 'boom')).status).toBe('error')
  })

  it('不同状态的可用操作不同', () => {
    expect(syncBlockView('synced').canRetry).toBe(true)
    expect(syncBlockView('synced').canRemove).toBe(false)
    expect(syncBlockView('missing').canRetry).toBe(true)
    expect(syncBlockView('missing').canUnlink).toBe(true)
    expect(syncBlockView('missing').canRemove).toBe(true)
    expect(syncBlockView('loading').loading).toBe(true)
    expect(syncBlockView('loading').canRetry).toBe(false)
  })
})

describe('同步块刷新', () => {
  it('刷新成功：拿到新快照与同步时间', async () => {
    const fetcher = vi.fn(async () => ({ text: '最新内容', panelId: 'panel-1' }))
    const result = await refreshSyncBlock({
      documentId: 'doc-1',
      panelId: 'panel-1',
      fetcher,
      now: new Date('2026-11-04T01:02:00'),
    })
    expect(fetcher).toHaveBeenCalledWith('doc-1', 'panel-1')
    expect(result).toEqual({
      ok: true,
      status: 'synced',
      text: '最新内容',
      panelId: 'panel-1',
      syncedAt: formatSyncTime(new Date('2026-11-04T01:02:00')),
    })
  })

  it('刷新失败：源删除 / 无权限 / 网络失败都给出可展示原因', async () => {
    const deleted = await refreshSyncBlock({
      documentId: 'doc-1',
      fetcher: async () => {
        throw new ApiError(404, 'not found')
      },
    })
    expect(deleted.ok).toBe(false)
    expect(deleted).toMatchObject({ status: 'missing' })

    const forbidden = await refreshSyncBlock({
      documentId: 'doc-1',
      fetcher: async () => {
        throw new ApiError(403, 'forbidden')
      },
    })
    expect(forbidden).toMatchObject({ status: 'forbidden' })

    const offline = await refreshSyncBlock({
      documentId: 'doc-1',
      fetcher: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    expect(offline).toMatchObject({ status: 'error' })
    expect((offline as { message: string }).message).toContain('网络')
  })

  it('缺少来源或来源没有正文时不当成成功', async () => {
    const noSource = await refreshSyncBlock({
      documentId: '',
      fetcher: async () => ({ text: 'x' }),
    })
    expect(noSource.ok).toBe(false)

    const empty = await refreshSyncBlock({
      documentId: 'doc-1',
      fetcher: async () => ({ text: '   ' }),
    })
    expect(empty.ok).toBe(false)
  })
})

describe('同步块渲染', () => {
  it('正常态：显示来源、快照、同步时间与刷新按钮', () => {
    const el = buildSyncBlockElement(document, opts())
    expect(el.getAttribute('data-sync-status')).toBe('synced')
    expect(el.textContent).toContain('方案文档')
    expect(el.textContent).toContain('旧快照内容')
    expect(el.textContent).toContain('同步于 2026-11-04 09:00')
    expect(el.querySelector('.rte-sync-block-btn.is-refresh')?.textContent).toBe('刷新')
    expect(el.querySelector('.rte-sync-block-notice')).toBeNull()
  })

  it('加载中：显示加载文案且不提供操作按钮', () => {
    const el = buildSyncBlockElement(document, opts({ status: 'loading' }))
    expect(el.className).toContain('is-loading')
    expect(el.querySelector('.rte-sync-block-loading')?.textContent).toContain('正在刷新')
    expect(el.querySelector('.rte-sync-block-btn')).toBeNull()
  })

  it('源删除：明确提示并可重试 / 解除同步 / 移除', () => {
    const el = buildSyncBlockElement(
      document,
      opts({ status: 'missing', message: '来源文档已被删除或不存在。' }),
    )
    const notice = el.querySelector('.rte-sync-block-notice')
    expect(notice?.textContent).toContain('来源文档已删除')
    expect(notice?.textContent).toContain('来源文档已被删除或不存在。')
    expect(el.querySelector('.rte-sync-block-btn.is-refresh')?.textContent).toBe('重试')
    expect(el.querySelector('.rte-sync-block-btn.is-unlink')).toBeTruthy()
    expect(el.querySelector('.rte-sync-block-btn.is-remove')).toBeTruthy()
    // 失效态仍保留旧快照，不静默空白
    expect(el.textContent).toContain('旧快照内容')
  })

  it('无权限与网络失败：提示文案不同但都可操作', () => {
    const forbidden = buildSyncBlockElement(
      document,
      opts({ status: 'forbidden', message: '没有权限访问来源文档。' }),
    )
    expect(forbidden.querySelector('.rte-sync-block-notice')?.textContent).toContain(
      '没有访问权限',
    )
    expect(forbidden.querySelector('.rte-sync-block-btn.is-refresh')?.textContent).toBe('重试')

    const failed = buildSyncBlockElement(
      document,
      opts({ status: 'error', message: '网络中断，请检查连接后重试。' }),
    )
    expect(failed.querySelector('.rte-sync-block-notice')?.textContent).toContain('同步失败')
    expect(failed.querySelector('.rte-sync-block-notice')?.textContent).toContain('网络中断')
    expect(failed.querySelector('.rte-sync-block-btn.is-unlink')).toBeTruthy()
  })

  it('按钮会触发对应回调', () => {
    const onRefresh = vi.fn()
    const onUnlink = vi.fn()
    const onRemove = vi.fn()
    const el = buildSyncBlockElement(
      document,
      opts({ status: 'missing', onRefresh, onUnlink, onRemove }),
    )
    el.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    el.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-unlink')?.click()
    el.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-remove')?.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onUnlink).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('重新渲染会替换旧内容，不残留上一帧按钮', () => {
    const el = document.createElement('div')
    renderSyncBlockInto(el, opts({ status: 'missing' }))
    expect(el.querySelector('.rte-sync-block-btn.is-remove')).toBeTruthy()
    renderSyncBlockInto(el, opts({ status: 'synced' }))
    expect(el.querySelector('.rte-sync-block-btn.is-remove')).toBeNull()
    expect(el.getAttribute('data-sync-status')).toBe('synced')
  })

  it('来源链接带面板参数', () => {
    expect(syncBlockSourceHref({ documentId: 'doc 1', panelId: 'panel 1' })).toBe(
      '#/canvas/doc%201?panel=panel%201',
    )
    expect(syncBlockSourceHref({ documentId: 'doc-1' })).toBe('#/canvas/doc-1')
  })
})
