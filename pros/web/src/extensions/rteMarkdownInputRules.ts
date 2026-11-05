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
import type { NodeType, ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { Slice } from '@tiptap/pm/model'

export const MD_RULE_PATTERNS = {
  heading: /^(#{1,6})\s$/,
  bulletList: /^([-+*])\s$/,
  orderedList: /^(\d+)\.\s$/,
  taskItem: /^\[([ xX])?\]\s$/,
  blockquote: /^>\s$/,
  codeBlock: /^```([\w+#-]*)[\s\n]$/,
  horizontalRule: /^(?:---|\*\*\*\s)$/,
} as const

export type MdRuleKind =
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskItem'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'

export type MdRuleContext = 'top' | 'list' | 'blockquote' | 'tableCell' | 'other' | 'none'

/**
 * 各容器内允许的规则（参照飞书）：
 * - 顶层段落：全部；
 * - 列表项/待办项内：首段不转换（文字保留）；后续段落只允许嵌套列表与待办；
 * - 引用内：标题、列表、待办；
 * - 表格单元格内：列表、待办（不转标题/引用/代码块/分割线，避免撑破单元格）；
 * - 其他容器（分栏、提示块、折叠块等）：标题、列表、待办、引用；
 * - 标题等非段落文本块（none）：一律不转换。
 */
export const MD_RULE_POLICY: Record<MdRuleContext, ReadonlySet<MdRuleKind>> = {
  top: new Set<MdRuleKind>(['heading', 'bulletList', 'orderedList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule']),
  list: new Set<MdRuleKind>(['bulletList', 'orderedList', 'taskItem']),
  blockquote: new Set<MdRuleKind>(['heading', 'bulletList', 'orderedList', 'taskItem']),
  tableCell: new Set<MdRuleKind>(['bulletList', 'orderedList', 'taskItem']),
  other: new Set<MdRuleKind>(['heading', 'bulletList', 'orderedList', 'taskItem', 'blockquote']),
  none: new Set<MdRuleKind>(),
}

const LIST_ITEM = new Set(['listItem', 'taskItem'])
const TABLE_CELL = new Set(['tableCell', 'tableHeader'])

/** 由标记所在位置判断容器语境（取最近的有意义祖先）。 */
export function mdRuleContext($pos: ResolvedPos): MdRuleContext {
  if ($pos.parent.type.name !== 'paragraph') return 'none'
  for (let d = $pos.depth - 1; d > 0; d -= 1) {
    const name = $pos.node(d).type.name
    // 列表项首段本身就是列表行，不再嵌套/改型；后续段落才允许嵌套列表
    if (LIST_ITEM.has(name)) return $pos.index(d) === 0 ? 'none' : 'list'
    if (TABLE_CELL.has(name)) return 'tableCell'
    if (name === 'blockquote') return 'blockquote'
    return 'other'
  }
  return 'top'
}

function ruleAllowed(kind: MdRuleKind, from: number, doc: import('@tiptap/pm/model').Node) {
  const $start = doc.resolve(from)
  const ctx = $start.parentOffset === 0 ? mdRuleContext($start) : 'none'
  return MD_RULE_POLICY[ctx].has(kind)
}

/** 允许时执行原 handler，否则让出（返回 null）。 */
function allowedRule(kind: MdRuleKind, rule: InputRule): InputRule {
  return new InputRule({
    find: rule.find,
    undoable: true,
    handler: (props) => (ruleAllowed(kind, props.range.from, props.state.doc) ? rule.handler(props) : null),
  })
}

/**
 * 不允许时以一个空步骤「吃掉」这次匹配，防止各扩展自带的同类规则接着转换。
 * 文字照常输入，不产生任何结构变化。
 */
function blockerRule(kind: MdRuleKind, rule: InputRule): InputRule {
  return new InputRule({
    find: rule.find,
    undoable: false,
    handler: (props) => {
      if (ruleAllowed(kind, props.range.from, props.state.doc)) return null
      const tr = props.state.tr
      tr.step(new ReplaceStep(props.range.to, props.range.to, Slice.empty))
      tr.setMeta(BLOCKED_META, true)
    },
  })
}

const BLOCKED_META = 'rteMdRuleBlocked'

/**
 * 记录「刚刚发生过输入规则转换」。紧随其后的追加事务（如 TrailingNode 在文末补空段落）
 * 不清除该记录，让退格仍能撤回转换。
 */
export const mdRuleUndoKey = new PluginKey<boolean>('rteMdRuleUndo')

function mdRuleUndoPlugin() {
  return new Plugin<boolean>({
    key: mdRuleUndoKey,
    state: {
      init: () => false,
      apply(tr, prev) {
        if (tr.getMeta(BLOCKED_META)) return false
        if (tr.getMeta('inputRule')) return true
        if (tr.getMeta('appendedTransaction')) return prev
        return tr.docChanged || tr.selectionSet ? false : prev
      },
    },
  })
}

export const RteMarkdownInputRules = Extension.create({
  name: 'rteMarkdownInputRules',
  // 高于各节点扩展默认的 100，先于内置同类规则匹配
  priority: 1000,

  addProseMirrorPlugins() {
    return [mdRuleUndoPlugin()]
  },

  addKeyboardShortcuts() {
    return {
      // 退格优先撤回刚发生的输入规则；文末补空段落后 TipTap 自带记录已失效，改用历史撤回
      Backspace: ({ editor }) => {
        if (!mdRuleUndoKey.getState(editor.state)) return false
        if (editor.commands.undoInputRule()) return true
        return editor.commands.undo()
      },
    }
  },

  addInputRules() {
    const nodes = this.editor.schema.nodes
    const t = (name: string): NodeType | undefined => nodes[name]
    const rules: Array<[MdRuleKind, InputRule]> = []
    const add = (kind: MdRuleKind, make: (type: NodeType) => InputRule) => {
      const type = t(kind)
      if (type) rules.push([kind, make(type)])
    }

    add('heading', (type) =>
      textblockTypeInputRule({
        find: MD_RULE_PATTERNS.heading,
        type,
        getAttributes: (m) => ({ level: m[1].length }),
      }),
    )
    add('codeBlock', (type) =>
      textblockTypeInputRule({
        find: MD_RULE_PATTERNS.codeBlock,
        type,
        getAttributes: (m) => ({ language: m[1] || null }),
      }),
    )
    add('horizontalRule', (type) => nodeInputRule({ find: MD_RULE_PATTERNS.horizontalRule, type }))
    add('taskItem', (type) =>
      wrappingInputRule({
        find: MD_RULE_PATTERNS.taskItem,
        type,
        getAttributes: (m) => ({ checked: (m[1] || '').toLowerCase() === 'x' }),
      }),
    )
    add('bulletList', (type) => wrappingInputRule({ find: MD_RULE_PATTERNS.bulletList, type }))
    add('orderedList', (type) =>
      wrappingInputRule({
        find: MD_RULE_PATTERNS.orderedList,
        type,
        getAttributes: (m) => ({ start: Number(m[1]) }),
        joinPredicate: (m, node) => node.childCount + node.attrs.start === Number(m[1]),
      }),
    )
    add('blockquote', (type) => wrappingInputRule({ find: MD_RULE_PATTERNS.blockquote, type }))

    // 先全部「允许则转换」，再全部「拒绝则吞掉」：拦截规则 undoable=false，不影响退格
    return [
      ...rules.map(([kind, rule]) => allowedRule(kind, rule)),
      ...rules.map(([kind, rule]) => blockerRule(kind, rule)),
    ]
  },
})
