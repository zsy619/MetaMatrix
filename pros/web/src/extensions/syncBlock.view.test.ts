// @vitest-environment happy-dom
/** 同步块节点视图：刷新按钮 → 加载态 → 成功更新 / 失效态。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ApiError } from '../api/http'

const fetchMock = vi.fn()

vi.mock('../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/documents')>()
  return {
    ...actual,
    fetchDocumentTextSnapshot: (id: string, panelId?: string) =>
      fetchMock(id, panelId),
  }
})

const { SyncBlock } = await import('./syncBlock')

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  fetchMock.mockReset()
})

function makeEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit, SyncBlock],
    content: '<p>正文</p>',
  })
  return editor
}

async function flush() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('同步块节点视图', () => {
  it('刷新成功：快照更新并显示新的同步时间', async () => {
    const ed = makeEditor()
    fetchMock.mockResolvedValue({ text: '最新内容', panelId: 'panel-1' })
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: {
        documentId: 'doc-1',
        documentTitle: '方案文档',
        panelId: 'panel-1',
        text: '旧快照',
        syncedAt: '2026-11-04 09:00',
        status: 'synced',
      },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(block).toBeTruthy()
    expect(block.getAttribute('data-sync-status')).toBe('synced')

    const refresh = block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')
    expect(refresh?.textContent).toBe('刷新')
    refresh?.click()
    await flush()

    const after = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(after.textContent).toContain('最新内容')
    expect(after.getAttribute('data-sync-status')).toBe('synced')
    expect(fetchMock).toHaveBeenCalledWith('doc-1', 'panel-1')
  })

  it('源被删除：进入失效态并可重试 / 解除同步', async () => {
    const ed = makeEditor()
    fetchMock.mockRejectedValue(new ApiError(404, 'not found'))
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: {
        documentId: 'doc-2',
        documentTitle: '被删文档',
        text: '旧快照',
        status: 'synced',
      },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    await flush()

    const after = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(after.getAttribute('data-sync-status')).toBe('missing')
    expect(after.querySelector('.rte-sync-block-notice')?.textContent).toContain(
      '来源文档已删除',
    )
    expect(after.querySelector('.rte-sync-block-btn.is-refresh')?.textContent).toBe('重试')
    expect(after.querySelector('.rte-sync-block-btn.is-unlink')).toBeTruthy()
    expect(after.querySelector('.rte-sync-block-btn.is-remove')).toBeTruthy()
    // 旧快照仍在，不静默空白
    expect(after.textContent).toContain('旧快照')
  })

  it('无权限：进入失效态并提示原因', async () => {
    const ed = makeEditor()
    fetchMock.mockRejectedValue(new ApiError(403, 'forbidden'))
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: { documentId: 'doc-3', documentTitle: '无权限文档', text: '旧快照' },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    await flush()
    const after = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(after.getAttribute('data-sync-status')).toBe('forbidden')
    expect(after.querySelector('.rte-sync-block-notice')?.textContent).toContain(
      '没有访问权限',
    )
  })

  it('网络失败：进入失败态并可重试', async () => {
    const ed = makeEditor()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: { documentId: 'doc-4', documentTitle: '离线文档', text: '旧快照' },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    await flush()
    const after = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(after.getAttribute('data-sync-status')).toBe('error')
    expect(after.querySelector('.rte-sync-block-notice')?.textContent).toContain('同步失败')
    expect(after.querySelector('.rte-sync-block-btn.is-refresh')?.textContent).toBe('重试')
  })

  it('刷新过程中显示加载态且不提供操作按钮', async () => {
    const ed = makeEditor()
    let release: (value: { text: string }) => void = () => {}
    fetchMock.mockImplementation(
      () =>
        new Promise<{ text: string }>((resolve) => {
          release = resolve
        }),
    )
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: { documentId: 'doc-6', documentTitle: '慢文档', text: '旧快照' },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    await new Promise((resolve) => setTimeout(resolve, 20))

    const loading = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(loading.getAttribute('data-sync-status')).toBe('loading')
    expect(loading.querySelector('.rte-sync-block-loading')?.textContent).toContain('正在刷新')
    expect(loading.querySelector('.rte-sync-block-btn')).toBeNull()

    release({ text: '慢速内容' })
    await flush()
    const done = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    expect(done.getAttribute('data-sync-status')).toBe('synced')
    expect(done.textContent).toContain('慢速内容')
  })

  it('移除：删掉整个同步块', async () => {
    const ed = makeEditor()
    fetchMock.mockRejectedValue(new ApiError(403, 'forbidden'))
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: { documentId: 'doc-7', documentTitle: '待移除文档', text: '旧快照' },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-refresh')?.click()
    await flush()
    const invalid = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    invalid.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-remove')?.click()
    await flush()
    expect(ed.view.dom.querySelector('.rte-sync-block')).toBeNull()
    expect(ed.getHTML()).not.toContain('旧快照')
  })

  it('解除同步：把块换成普通段落，保留快照文本', async () => {
    const ed = makeEditor()
    ed.commands.insertContent({
      type: 'syncBlock',
      attrs: { documentId: 'doc-5', documentTitle: '解除文档', text: '保留这段文字' },
    })
    await flush()
    const block = ed.view.dom.querySelector('.rte-sync-block') as HTMLElement
    block.querySelector<HTMLButtonElement>('.rte-sync-block-btn.is-unlink')?.click()
    await flush()
    expect(ed.view.dom.querySelector('.rte-sync-block')).toBeNull()
    expect(ed.getHTML()).toContain('保留这段文字')
  })
})
