/** 文内改写。只用选区和紧挨着的上文，不调用外部模型，也不编造选区里没有的事实。 */

import { escapeHtml } from './itemsHtml'

export const INLINE_AI_MODES = [
  { id: 'polish', label: '润色', title: '整理空格、标点和中英文间距' },
  { id: 'shorten', label: '缩写', title: '留第一句；很长的一句收到一句里' },
  { id: 'expand', label: '扩写', title: '按选区补一句说明' },
  { id: 'formal', label: '正式', title: '把口语换成书面说法' },
  { id: 'bullets', label: '要点', title: '按句子拆成列表' },
  { id: 'continue', label: '续写', title: '按上文接一句' },
] as const

export type InlineAiMode = (typeof INLINE_AI_MODES)[number]['id']

export type InlineAiResult = {
  text: string
  html?: string
}

const FORMAL_WORDS: Array<[RegExp, string]> = [
  [/咱们/g, '我们'],
  [/啥/g, '什么'],
  [/挺好/g, '较好'],
  [/搞定/g, '完成'],
  [/哈哈/g, ''],
]

function sentencesOf(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？!?])|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function polishText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\.{3}|。{2,}/g, '…')
}

function shortenText(text: string): string {
  const list = sentencesOf(text)
  if (list.length > 1) return list[0]
  const one = list[0] || text.trim()
  if (one.length <= 42) return one
  return `${one.slice(0, 42)}…`
}

function expandText(text: string, context: string): string {
  const core = text.trim()
  const hint = context.trim().replace(/\s+/g, ' ').slice(-24)
  const plain = core.replace(/[。！？!?]+$/g, '')
  const extra = hint && !core.includes(hint)
    ? `结合上文「${hint}」，这里是在说明：${plain}`
    : `换言之，${plain}`
  const end = /[。！？!?]$/.test(core) ? '' : '。'
  return `${core}${end}${extra}。`
}

function formalText(text: string): string {
  let next = text
  for (const [pattern, to] of FORMAL_WORDS) next = next.replace(pattern, to)
  return next.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
}

function bulletResult(text: string): InlineAiResult {
  const list = sentencesOf(text)
  const items = list.length ? list : [text.trim()]
  return {
    text: items.map((item) => `• ${item}`).join('\n'),
    html: `<ul>${items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join('')}</ul>`,
  }
}

function continueText(text: string, context: string): string {
  const list = sentencesOf(text)
  const last = (list[list.length - 1] || text.trim()).replace(/[。！？!?]+$/g, '')
  const seed = last.slice(0, 24) || context.trim().replace(/\s+/g, ' ').slice(-24)
  if (!seed) return text
  const glue = text.endsWith('\n') ? '' : '\n'
  return `${text}${glue}因此，接下来应把「${seed}」说清楚。`
}

export function rewriteWithContext(mode: InlineAiMode, selection: string, context = ''): InlineAiResult | null {
  const raw = selection ?? ''
  if (!raw.trim()) return null
  const result = mode === 'polish'
    ? { text: polishText(raw) }
    : mode === 'shorten'
      ? { text: shortenText(raw) }
      : mode === 'expand'
        ? { text: expandText(raw, context) }
        : mode === 'formal'
          ? { text: formalText(raw) }
          : mode === 'bullets'
            ? bulletResult(raw)
            : { text: continueText(raw, context) }
  if (!result.html && result.text === raw) return null
  return result
}

export function inlineAiLabel(mode: InlineAiMode): string {
  return INLINE_AI_MODES.find((item) => item.id === mode)?.label || mode
}
