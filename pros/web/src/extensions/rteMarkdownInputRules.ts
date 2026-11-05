/**
 * Markdown 输入规则：段首键入 Markdown 标记即转为对应块。
 *
 *   # ~ ###### + 空格  → 标题 H1–H6
 *   - / * / + 空格     → 无序列表
 *   1. 空格            → 有序列表（起始序号取输入数字）
 *   [] / [ ] / [x] 空格 → 待办（[x] 为已勾选）
 *   > 空格             → 引用
 *   ```lang + 空格/回车 → 代码块（可带语言）
 *   ---  / *** 空格     → 分割线
 *
 * 说明：
 * - StarterKit 及各节点扩展本身也带同类规则（未被禁用）。本扩展 priority 更高，
 *   TipTap 按优先级合并规则、首个命中即停，所以同一输入只会转换一次，不会重复。
 * - 代码块内、行内代码中不触发：TipTap 的 inputRules 插件对 code 节点/code mark 直接跳过；
 *   这里的 handler 再按「父节点必须是段落且标记在段首」兜底。
 * - 转换前先提交原文字，再提交转换（TipTap 3 行为），所以 Ctrl+Z（undoInputRule）
 *   一次即回到键入的原文字。
 */
import {
  Extension,
  InputRule,
  nodeInputRule,
  textblockTypeInputRule,
  wrappingInputRule,
} from '@tiptap/core'
import type { NodeType } from '@tiptap/pm/model'

export const MD_RULE_PATTERNS = {
  heading: /^(#{1,6})\s$/,
  bulletList: /^([-+*])\s$/,
  orderedList: /^(\d+)\.\s$/,
  taskItem: /^\[([ xX])?\]\s$/,
  blockquote: /^>\s$/,
  codeBlock: /^```([\w+#-]*)[\s\n]$/,
  horizontalRule: /^(?:---|\*\*\*\s)$/,
} as const

/** 仅当标记位于普通段落开头时才执行原 handler。 */
function atParagraphStart(rule: InputRule): InputRule {
  return new InputRule({
    find: rule.find,
    undoable: rule.undoable,
    handler: (props) => {
      const $start = props.state.doc.resolve(props.range.from)
      const parent = $start.parent
      if (parent.type.name !== 'paragraph' || parent.type.spec.code) return null
      if ($start.parentOffset !== 0) return null
      return rule.handler(props)
    },
  })
}

export const RteMarkdownInputRules = Extension.create({
  name: 'rteMarkdownInputRules',
  // 高于各节点扩展默认的 100，先于内置同类规则匹配
  priority: 1000,

  addInputRules() {
    const nodes = this.editor.schema.nodes
    const t = (name: string): NodeType | undefined => nodes[name]
    const rules: InputRule[] = []

    const heading = t('heading')
    if (heading) {
      rules.push(
        textblockTypeInputRule({
          find: MD_RULE_PATTERNS.heading,
          type: heading,
          getAttributes: (m) => ({ level: m[1].length }),
        }),
      )
    }
    const codeBlock = t('codeBlock')
    if (codeBlock) {
      rules.push(
        textblockTypeInputRule({
          find: MD_RULE_PATTERNS.codeBlock,
          type: codeBlock,
          getAttributes: (m) => ({ language: m[1] || null }),
        }),
      )
    }
    const hr = t('horizontalRule')
    if (hr) {
      rules.push(nodeInputRule({ find: MD_RULE_PATTERNS.horizontalRule, type: hr }))
    }
    const taskItem = t('taskItem')
    if (taskItem) {
      rules.push(
        wrappingInputRule({
          find: MD_RULE_PATTERNS.taskItem,
          type: taskItem,
          getAttributes: (m) => ({ checked: (m[1] || '').toLowerCase() === 'x' }),
        }),
      )
    }
    const bulletList = t('bulletList')
    if (bulletList) {
      rules.push(wrappingInputRule({ find: MD_RULE_PATTERNS.bulletList, type: bulletList }))
    }
    const orderedList = t('orderedList')
    if (orderedList) {
      rules.push(
        wrappingInputRule({
          find: MD_RULE_PATTERNS.orderedList,
          type: orderedList,
          getAttributes: (m) => ({ start: Number(m[1]) }),
          joinPredicate: (m, node) => node.childCount + node.attrs.start === Number(m[1]),
        }),
      )
    }
    const blockquote = t('blockquote')
    if (blockquote) {
      rules.push(wrappingInputRule({ find: MD_RULE_PATTERNS.blockquote, type: blockquote }))
    }
    return rules.map(atParagraphStart)
  },
})
