/**
 * 富文本里"双击链接 = 打开链接"的交互逻辑。
 *
 * 抽成独立模块的原因：这个行为要被单元测试覆盖，
 * 而它只需要一个 DOM 事件和一个链接地址，不该依赖整套编辑器实例。
 *
 * 安全约定：这里不做任何 window.open，
 * 只把地址交回宿主（onOpen），由宿主走既有的外链确认 / 危险协议拦截 / 审计，
 * 避免在交互层另起一套打开逻辑而绕开安全策略。
 */
import { isAttachmentAnchor } from '../../../utils/rteAttachment'

export interface LinkDoubleClickDeps {
  /** 普通链接：在新标签页打开。 */
  onOpen?: (href: string) => void
  /** 附件芯片：打开附件预览，而不是把 data:/blob: 地址丢给浏览器。 */
  onAttachmentOpen?: (href: string, name: string) => void
}

/** 打开时给链接的短促高亮类名。 */
const FLASH_CLASS = 'rte-link--opening'

/** 高亮持续时间（毫秒），与 CSS 动画时长保持一致。 */
const FLASH_MS = 700

export function flashLinkElement(anchor: HTMLElement) {
  anchor.classList.add(FLASH_CLASS)
  window.setTimeout(() => anchor.classList.remove(FLASH_CLASS), FLASH_MS)
}

/**
 * 处理一次双击。
 * 返回 true 表示"这次双击被链接接管了"，调用方应停止后续处理。
 */
export function handleLinkDoubleClick(event: MouseEvent, deps: LinkDoubleClickDeps): boolean {
  const target = event.target as HTMLElement | null
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor) return false
  const href = anchor.getAttribute('href')?.trim()
  if (!href) return false

  event.preventDefault()
  event.stopPropagation()

  if (isAttachmentAnchor(href, anchor.textContent || '', anchor.className || '')) {
    const name = (anchor.getAttribute('title') || anchor.textContent || '').replace(/^📎\s*/, '').trim()
    deps.onAttachmentOpen?.(href, name)
    return true
  }

  flashLinkElement(anchor)
  deps.onOpen?.(href)
  return true
}

/**
 * 取选区所在链接的地址。
 * 选区为空（只有光标）时看光标位置的 link 标记；
 * 选中了文字时看范围内任意一个 link 标记。
 */
export function linkHrefAtSelection(ed: any): string {
  const selection = ed?.state?.selection
  if (!selection) return ''
  const { from, to } = selection
  let href = ''
  ed.state.doc.nodesBetween(from, to, (node: any) => {
    if (href) return false
    const mark = (node?.marks || []).find((item: any) => item?.type?.name === 'link')
    if (mark?.attrs?.href) href = String(mark.attrs.href)
    return true
  })
  if (href) return href
  if (selection.empty) {
    const mark = (ed.state.selection.$from?.marks?.() || []).find((item: any) => item?.type?.name === 'link')
    if (mark?.attrs?.href) return String(mark.attrs.href)
  }
  return ''
}
