/**
 * 自动链接：输入网址后自动变成可点击的链接。
 *
 * 为什么不用 TipTap 内置的 autolink（linkify）：
 * 内置实现在中文写作里有三个硬伤，本扩展逐条解决：
 * 1. 中文句号/逗号会被吞进 href —— "https://example.com/page。" 生成的链接
 *    地址末尾带着全角句号，点开必然 404；
 * 2. 撤销一次会把整条网址删掉，而不是回到"纯文本网址"；
 * 3. 粘贴 markdown 文本时，链接语法 "[文字](地址)" 里的地址会被单独识别成链接，
 *    结构被拆成 "[文字](<a>地址</a>)"。
 *
 * 实现方式：走 TipTap 的输入规则（InputRule），而不是自己挂 DOM 事件。
 * 输入规则与内置的粗体/斜体/Markdown 规则共用同一条通路，
 * 因此撤销一次能回到原文、也不会和 "[文字](地址)" 打架。
 *
 * 规则：
 * - 必须出现终止符（空白 / 中文标点 / 收尾括号）才成链，网址中途不会被截断；
 * - 网址尾部的中英文标点留在链接之外；
 * - 右括号默认留在链接外，只有网址自身括号配平时才归入链接；
 * - 域名没写完整（"https://example"）不链接，等用户继续输入；
 * - 裸域名（example.com）只在 TLD 命中白名单时才链接，避免把文件名当网址；
 * - 代码块、行内代码、已有链接内部不触发（TipTap 框架已挡代码块/行内代码）。
 */
import { Extension, InputRule } from '@tiptap/core'

/** 常见顶级域名白名单：只有命中才把裸域名当网址，避免把 "index.ts"、"a.md" 误判成链接。 */
export const AUTO_LINK_TLDS = [
  'com', 'cn', 'net', 'org', 'edu', 'gov', 'io', 'dev', 'app', 'ai', 'me',
  'info', 'biz', 'xyz', 'top', 'site', 'online', 'tech', 'cloud', 'store', 'so', 'tv',
]

/**
 * 终止符：网址到此结束。
 * 刻意不含英文问号与冒号 —— 它们经常出现在网址内部
 * （a.com?x=1、host:8080），当终止符会把网址拦腰截断。
 * 英文句点也只在确定是句末点时才成链（见 isSentenceDot）。
 */
const AUTO_LINK_TERMINATOR = `[ \\t\\n\\u3000\\uff0c\\u3002\\u3001\\uff1b\\uff1a\\uff01\\uff1f\\uff09\\u3011\\u300b\\u300d\\u300f\\u201c\\u201d\\u2018\\u2019"'）】》」』)\\]}]|[,;!.]`

/** 网址本体：带协议 / 带 www / 裸域名（裸域名限 TLD 白名单）。 */
const AUTO_LINK_URL = [
  '(?:https?:\\/\\/|www\\.)[^\\s]*',
  `(?:[a-z0-9-]+\\.)+(?:${AUTO_LINK_TLDS.join('|')})[^\\s]*`,
].join('|')

/**
 * 整体匹配：网址 + 终止符，且必须结束在光标处（$）。
 * 终止符不参与网址本体，所以网址里的路径、查询串、端口都不会被吃掉。
 */
const AUTO_LINK_PATTERN = new RegExp(`(${AUTO_LINK_URL})(${AUTO_LINK_TERMINATOR})$`, 'i')

/** 没有终止符时的兜底匹配：整段文本末尾就是网址。 */
const AUTO_LINK_PATTERN_BARE = new RegExp(`(${AUTO_LINK_URL})$`, 'i')

/** 网址尾部需要剥离的软标点（不参与括号配平判断）。 */
const SOFT_PUNCTUATION = new Set([
  '.', ',', ';', ':', '!', '?', '"', "'", '，', '。', '、', '；', '：', '！', '？', '”', '’', '…', '～',
])

/** 右括号与左括号的配对关系。 */
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

export interface AutoLinkTarget {
  /** 网址文本（已剥离尾部标点），也是写入链接标记的原文。 */
  text: string
  /** 写入 href 的地址。 */
  href: string
  /** 被剥离到链接外的标点（已在原文里，无需再写回）。 */
  tail: string
  /** 网址在传入文本中的起始下标。 */
  start: number
}

function countChar(text: string, ch: string): number {
  return text.split(ch).length - 1
}

/**
 * 剥离网址尾部的标点。
 * 软标点直接剥；右括号只在"括号不配平"时剥（网址自身带的括号要保留）。
 */
export function stripTrailingPunctuation(url: string): { url: string; tail: string } {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]!
    if (SOFT_PUNCTUATION.has(ch)) {
      end -= 1
      continue
    }
    const open = CLOSERS[ch]
    if (open && countChar(url.slice(0, end), ch) > countChar(url.slice(0, end), open)) {
      end -= 1
      continue
    }
    break
  }
  return { url: url.slice(0, end), tail: url.slice(end) }
}

/** 取网址里的主机部分（去掉协议、www、路径与查询串）。 */
export function urlHost(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0] ?? ''
}

/** 完整网址判断：域名要有 TLD，或本机/端口/内网地址。 */
export function looksLikeCompleteUrl(url: string): boolean {
  const host = urlHost(url)
  if (!host) return false
  if (host === 'localhost') return true
  if (host.includes(':')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  return /\.[a-z]{2,}$/i.test(host)
}

/**
 * 英文句号能否作为终止符。
 *
 * "见 https://a.com." 里句号是句末点，应该成链；
 * 但 "https://a.io." 后面很可能还要写 ".cn"，此时成链会把后半截甩在链接外。
 * 折中规则：主域名最后一段是 3 个字母以上的常见 TLD 时才认这个句号。
 */
function isSentenceDot(url: string, terminator: string): boolean {
  if (terminator !== '.') return true
  const host = urlHost(url)
  const last = host.split('.').pop() ?? ''
  return last.length >= 3 && AUTO_LINK_TLDS.includes(last.toLowerCase())
}

/**
 * 解析一段"网址 + 终止符"。
 * 返回 null 表示"这段文字不是可以自动链接的网址"。
 */
export function parseAutoLink(
  raw: string,
  terminator: string,
  options: { stripSoft?: boolean } = {},
): AutoLinkTarget | null {
  if (!raw) return null
  const stripSoft = options.stripSoft !== false

  let url = raw
  let tail = ''
  const open = CLOSERS[terminator]
  if (open && countChar(url, open) > countChar(url, terminator)) {
    // 网址内部的左括号还没配平，这个右括号属于网址本身
    url += terminator
  } else {
    tail = terminator
  }

  if (stripSoft) {
    const stripped = stripTrailingPunctuation(url)
    url = stripped.url
    tail = stripped.tail + tail
  }

  if (!url) return null
  if (url === 'https://' || url === 'http://' || url === 'www.') return null
  // 域名还没写完（例如刚敲下 "https://example"）就先不自动链接
  if (!looksLikeCompleteUrl(url)) return null
  if (!isSentenceDot(url, terminator)) return null

  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  return { text: url, href, tail, start: 0 }
}

/**
 * 从一段文本尾部解析出网址（纯文本入口，测试与外部调用用）。
 * 语义：整段文本的末尾是"网址（可带终止符）"。
 */
export function parseTrailingUrl(text: string): AutoLinkTarget | null {
  const match = AUTO_LINK_PATTERN.exec(text)
  if (match) {
    const target = parseAutoLink(match[1] ?? '', match[2] ?? '')
    if (target) return { ...target, start: match.index }
    return null
  }
  // 没有终止符时，只认"整段文本末尾就是网址"的情况，且不剥离尾部标点
  const bare = AUTO_LINK_PATTERN_BARE.exec(text)
  if (!bare) return null
  const target = parseAutoLink(bare[1] ?? '', '', { stripSoft: false })
  if (!target) return null
  return { ...target, start: bare.index }
}

/** 自动链接输入规则：把"网址"部分标成链接，终止符留在链接外。 */
function autoLinkInputRule(): InputRule {
  return new InputRule({
    find: AUTO_LINK_PATTERN,
    handler: ({ state, range, match }) => {
      const linkType = state.schema.marks.link
      if (!linkType) return null
      const raw = match[1] ?? ''
      const terminator = match[2] ?? ''
      const target = parseAutoLink(raw, terminator)
      if (!target) return null

      const doc = state.doc
      const urlEnd = range.from + target.text.length
      if (urlEnd > range.to) return null
      // 已经在链接里就不再套一层
      if (doc.rangeHasMark(range.from, urlEnd, linkType)) return null
      // markdown 链接语法（"文字](地址)"）交给行内 Markdown 规则
      if (range.from >= 2) {
        const before = doc.textBetween(range.from - 2, range.from, undefined, '\ufffc')
        if (before === '](') return null
      }

      const { tr } = state
      tr.addMark(range.from, urlEnd, linkType.create({
        href: target.href,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      }))
      // 链接只覆盖网址本身，继续输入时不要再往里扩
      tr.removeStoredMark(linkType)
    },
  })
}

export const RteAutoLink = Extension.create({
  name: 'rteAutoLink',

  addInputRules() {
    return [autoLinkInputRule()]
  },
})
