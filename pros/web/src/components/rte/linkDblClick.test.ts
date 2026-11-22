// @vitest-environment happy-dom
/**
 * "双击链接打开链接"的行为契约：
 * - 双击普通链接 → 交回宿主打开（宿主负责外链确认与审计）；
 * - 双击附件芯片 → 走附件预览，不把 data:/blob: 丢给浏览器；
 * - 双击非链接 → 不拦截，让浏览器/编辑器按原逻辑处理；
 * - 选区在链接内时能取到地址（⌘/Ctrl + Enter 的前提）。
 */
import { describe, expect, it, vi } from 'vitest'
import { handleLinkDoubleClick, linkHrefAtSelection } from './composables/linkDblClick'

function dblclickOn(el: Element) {
  const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

describe('双击链接打开链接', () => {
  it('双击普通链接时把地址交回宿主，并阻止默认跳转', () => {
    const onOpen = vi.fn()
    const anchor = document.createElement('a')
    anchor.href = 'https://example.com/doc'
    anchor.textContent = '示例文档'
    document.body.appendChild(anchor)

    const event = dblclickOn(anchor)

    const handled = handleLinkDoubleClick(event, { onOpen })
    expect(handled).toBe(true)
    expect(onOpen).toHaveBeenCalledWith('https://example.com/doc')
    expect(event.defaultPrevented).toBe(true)
    // 打开瞬间给链接一个高亮，让用户确认"确实被打开了"
    expect(anchor.classList.contains('rte-link--opening')).toBe(true)
  })

  it('双击普通文字不拦截', () => {
    const onOpen = vi.fn()
    const para = document.createElement('p')
    para.textContent = '没有链接的段落'
    document.body.appendChild(para)

    const event = dblclickOn(para)
    const handled = handleLinkDoubleClick(event, { onOpen })

    expect(handled).toBe(false)
    expect(onOpen).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('双击附件芯片走附件预览，不当作外链打开', () => {
    const onOpen = vi.fn()
    const onAttachmentOpen = vi.fn()
    const anchor = document.createElement('a')
    anchor.setAttribute('href', 'https://cdn.example.com/report.pdf')
    anchor.className = 'rte-attachment-link rte-link'
    anchor.textContent = '📎 方案.pdf'
    document.body.appendChild(anchor)

    const event = dblclickOn(anchor)
    const handled = handleLinkDoubleClick(event, { onOpen, onAttachmentOpen })

    expect(handled).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
    expect(onAttachmentOpen).toHaveBeenCalledTimes(1)
    expect(onAttachmentOpen.mock.calls[0]![1]).toBe('方案.pdf')
  })

  it('选区在链接内时能取到地址', () => {
    const linkMark = { type: { name: 'link' }, attrs: { href: 'https://example.com/a' } }
    const ed = {
      state: {
        selection: { from: 3, to: 5, empty: false },
        doc: {
          nodesBetween(_from: number, _to: number, fn: (node: any) => boolean) {
            fn({ marks: [linkMark] })
          },
        },
      },
    }
    expect(linkHrefAtSelection(ed)).toBe('https://example.com/a')
  })

  it('没有链接标记时返回空串', () => {
    const ed = {
      state: {
        selection: { from: 0, to: 0, empty: true, $from: { marks: () => [] } },
        doc: {
          nodesBetween(_f: number, _t: number, fn: (node: any) => boolean) {
            fn({ marks: [] })
          },
        },
      },
    }
    expect(linkHrefAtSelection(ed)).toBe('')
  })
})
