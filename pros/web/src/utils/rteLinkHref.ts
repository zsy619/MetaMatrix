/**
 * 链接地址规范化。
 *
 * 用户在链接弹窗里常常是"整句粘贴"进来的，例如
 * "见 https://example.com/page。" —— 直接写进 href 就会带一个全角句号，
 * 点开必然 404；写 "example.com" 又会被校验拦下。
 *
 * 这里做三件事：
 * 1. 去掉地址末尾的中英文标点（括号要配平才保留）；
 * 2. 裸域名 / www. 开头补 https://；
 * 3. 站内相对路径、锚点、mailto、tel 原样保留。
 */

/** 末尾直接可以剥掉的软标点。 */
const SOFT_TAIL = '。，、；：！？"\'’…～'

/** 右括号与左括号的配对关系。 */
const CLOSERS: Record<string, string> = { ')': '(', '）': '（', ']': '[', '］': '［', '}': '{', '】': '【', '》': '《', '」': '「', '』': '『' }

/** 可以直接补协议的裸域名后缀。 */
const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+(?:com|cn|net|org|edu|gov|io|dev|app|ai|me|info|biz|xyz|top|site|online|tech|cloud|store|so|tv)(?:[/:?#]|$)/i

function countChar(text: string, ch: string): number {
  return text.split(ch).length - 1
}

/** 去掉地址末尾粘连的标点；右括号只在括号不配平时才剥。 */
export function stripLinkTailPunctuation(value: string): string {
  let out = value
  while (out) {
    const last = out[out.length - 1]!
    const open = CLOSERS[last]
    if (open) {
      // 括号配平说明这个右括号属于网址本身（例如 wiki 的 Foo_(bar)）
      if (countChar(out, open) >= countChar(out, last)) break
      out = out.slice(0, -1)
      continue
    }
    if (SOFT_TAIL.includes(last) || ',;!.:'.includes(last)) {
      out = out.slice(0, -1)
      continue
    }
    break
  }
  return out
}

/** 规范化链接地址：去尾部标点 + 补协议。 */
export function normalizeLinkHref(raw: string): string {
  let value = (raw || '').trim()
  if (!value) return ''
  value = stripLinkTailPunctuation(value).trim()
  if (!value) return ''
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  if (value.startsWith('/') || value.startsWith('#')) return value
  if (/^www\./i.test(value)) return `https://${value}`
  if (BARE_DOMAIN.test(value)) return `https://${value}`
  return value
}
