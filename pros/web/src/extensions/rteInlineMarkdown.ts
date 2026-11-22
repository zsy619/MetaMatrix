/**
 * 行内 Markdown 语法。
 *
 * 现状（实测）：粗体 `**x**`、斜体 `*x*`、删除线 `~~x~~`、行内代码 `` `x` ``
 * 由 TipTap 内置扩展的输入规则负责，已经能在输入时直接转成富文本；
 * 块级语法（标题、列表、待办、引用、代码块、分割线）由 RteMarkdownInputRules 负责。
 *
 * 这里补上仍然缺失、且最常用的一条：**行内链接** `[文字](地址)`，
 * 外加飞书风格的 `==高亮==`。
 *
 * 两条硬约束：
 * 1. 不自己 window.open，也不自己插 href —— 链接转换只负责"把文本变成链接标记"，
 *    打开动作仍走编辑器既有的 requestOpenHref（含外链确认与危险协议拦截）。
 * 2. 地址白名单：只允许 http/https/mailto/tel、站内相对路径与锚点，
 *    javascript: / data: / vbscript: 一律不转换，避免把危险协议写进文档。
 */
import { Extension, InputRule, markInputRule } from '@tiptap/core'
import { ref } from 'vue'

const STORAGE_KEY = 'rte-markdown-inline'

function readEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'off') return false
  } catch {
    /* 隐私模式 */
  }
  return true
}

/**
 * 行内 Markdown 语法开关。
 * 用模块级状态而不是重建编辑器：输入规则在触发时读这个值，
 * 开关即时生效，不需要重新挂载编辑器、也不丢选区。
 */
export const markdownInlineEnabled = ref(readEnabled())

export function setMarkdownInlineEnabled(enabled: boolean) {
  markdownInlineEnabled.value = enabled
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* 隐私模式 */
  }
}

/** 允许的地址形态：绝对 http(s)、邮件/电话、站内相对路径、锚点。 */
export function isSafeMarkdownLink(url: string): boolean {
  const value = url.trim()
  if (!value) return false
  if (/^(https?:|mailto:|tel:)/i.test(value)) return true
  if (value.startsWith('/') || value.startsWith('#')) return true
  return false
}

/**
 * `[文字](地址)` → 链接标记。
 *
 * 自己写 handler 而不是用 markInputRule：markInputRule 只能把"最后一个捕获组"
 * 标成目标文本，而这里最后出现的是地址，文字在前面，需要按位置精确改写。
 */
function linkInputRule(): InputRule {
  return new InputRule({
    // 结尾必须是 ")"，保证光标停在右括号后才转换
    find: /(?:^|\s)\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)$/,
    handler: ({ state, range, match }) => {
      if (!markdownInlineEnabled.value) return null
      const linkType = state.schema.marks.link
      if (!linkType) return null
      const label = match[1] ?? ''
      const url = match[2] ?? ''
      if (!label || !isSafeMarkdownLink(url)) return null

      // TipTap v3 的输入规则直接改写 state.tr，不返回事务
      const { tr } = state
      const from = range.from
      const startSpaces = match[0].search(/\S/)
      const labelStart = from + match[0].indexOf('[') + 1
      const labelEnd = labelStart + label.length
      // 从后往前删：先去掉 "](地址)"，再去掉 "["，位置才不会错位
      tr.delete(labelEnd, range.to)
      tr.delete(from + startSpaces, labelStart)
      // 删掉 "[" 之后文字整体左移一格，标记区间要从保留下来的前导空格之后算起
      tr.addMark(from + startSpaces, from + startSpaces + label.length, linkType.create({
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      }))
      tr.removeStoredMark(linkType)
    },
  })
}

/** `==文字==` → 高亮标记。 */
function highlightInputRule(markType?: any): InputRule | null {
  if (!markType) return null
  return markInputRule({
    find: /(?:^|\s)==([^=\n]{1,200})==$/,
    type: markType,
  })
}

export const RteInlineMarkdown = Extension.create({
  name: 'rteInlineMarkdown',

  addInputRules() {
    const rules: InputRule[] = [linkInputRule()]
    const highlight = highlightInputRule(this.editor.schema.marks.highlight)
    if (highlight) rules.push(highlight)
    return rules
  },
})
