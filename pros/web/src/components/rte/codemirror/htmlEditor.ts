/**
 * CodeMirror 6 的 HTML 代码编辑器（懒加载模块）。
 *
 * 只在这里引入 CodeMirror，组件侧通过 `import('./codemirror/htmlEditor')` 动态加载，
 * 因此整包 CodeMirror 不会进入主 chunk，只有进入「源码」模式时才会下载。
 *
 * 依赖最小化：只用 @codemirror/state、@codemirror/view、@codemirror/language、
 * @codemirror/lang-html（不装 codemirror 全家桶、不用 basicSetup）。
 */
import { EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { htmlLanguage } from '@codemirror/lang-html'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

export type TokenKind = 'tag' | 'attr' | 'string' | 'comment' | 'doctype' | 'entity' | 'punct'

/** 着色表：编辑器内联样式与导出图片共用同一份，保证观感一致。 */
export const TOKEN_COLORS: Record<TokenKind, string> = {
  tag: '#569cd6',
  attr: '#9cdcfe',
  string: '#ce9178',
  comment: '#6a9955',
  doctype: '#c586c0',
  entity: '#dcdcaa',
  punct: '#9a9a9a',
}

const KIND_BY_NODE: Record<string, TokenKind> = {
  TagName: 'tag',
  AttributeName: 'attr',
  AttributeValue: 'string',
  Comment: 'comment',
  DoctypeDecl: 'doctype',
  EntityReference: 'entity',
  Is: 'punct',
}

/** 只有叶子节点才着色，避免装饰区间重叠。 */
function kindOfNode(name: string, isLeaf: boolean): TokenKind | null {
  if (!isLeaf) return null
  return KIND_BY_NODE[name] ?? null
}

type Range = { from: number; to: number; kind: TokenKind }

/** 取出树中与范围相交的着色区间。 */
function collectRanges(tree: ReturnType<typeof syntaxTree>, from: number, to: number): Range[] {
  const out: Range[] = []
  tree.iterate({
    from,
    to,
    enter(node) {
      const kind = kindOfNode(node.name, !node.node.firstChild)
      if (!kind) return
      if (node.to <= node.from) return
      out.push({ from: node.from, to: node.to, kind })
    },
  })
  out.sort((a, b) => a.from - b.from || a.to - b.to)
  return out
}

/** 编辑器着色：按可视区计算行内 mark 装饰。 */
function buildDecorations(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state)
  const from = Math.max(0, view.viewport.from - 1)
  const to = Math.min(view.state.doc.length, view.viewport.to + 1)
  const ranges = collectRanges(tree, from, to)
  const decos = ranges.map((r) =>
    Decoration.mark({
      attributes: { style: `color: ${TOKEN_COLORS[r.kind]}` },
    }).range(r.from, r.to),
  )
  return Decoration.set(decos, true)
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/** 深色主题：与原源码面板（#1e1e1e）保持一致。 */
const theme = EditorView.theme(
  {
    '&': {
      color: '#d4d4d4',
      backgroundColor: '#1e1e1e',
      height: '100%',
      fontSize: '12px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: '1.55',
      caretColor: '#d4d4d4',
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#6a737d',
      border: 'none',
      borderRight: '1px solid #3c3c3c',
    },
    '.cm-activeLineGutter': { backgroundColor: '#282c34', color: '#c8c8c8' },
    '.cm-activeLine': { backgroundColor: '#282c34' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#264f78',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#d4d4d4' },
  },
  { dark: true },
)

export type CreateHtmlEditorOptions = {
  doc: string
  parent: HTMLElement
  onChange?: (value: string) => void
}

/** 创建 CodeMirror HTML 编辑器实例。 */
export function createHtmlEditor(opts: CreateHtmlEditorOptions): EditorView {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      htmlLanguage,
      EditorView.lineWrapping,
      theme,
      highlightPlugin,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) opts.onChange?.(update.state.doc.toString())
      }),
    ],
  })
  return new EditorView({ state, parent: opts.parent })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 渲染一段区间的着色 HTML。 */
function renderSegment(code: string, from: number, to: number, ranges: Range[]): string {
  let out = ''
  let cursor = from
  for (const r of ranges) {
    const start = Math.max(r.from, from)
    const end = Math.min(r.to, to)
    if (end <= start) continue
    if (start > cursor) {
      out += escapeHtml(code.slice(cursor, start))
      cursor = start
    }
    out += `<span style="color:${TOKEN_COLORS[r.kind]}">${escapeHtml(code.slice(start, end))}</span>`
    cursor = end
  }
  out += escapeHtml(code.slice(cursor, to))
  return out
}

/**
 * 把整段代码渲染成「逐行」的着色 HTML（导出图片用）。
 * 走的是同一棵语法树，因此长代码也能完整着色，不会被视口裁掉；
 * 逐行返回是为了让行号与代码行一一对应（超长行换行时行号仍对齐）。
 */
export function renderHighlightedLines(code: string): string[] {
  if (!code) return ['']
  const state = EditorState.create({ doc: code, extensions: [htmlLanguage] })
  const tree = ensureSyntaxTree(state, code.length, 3000) ?? syntaxTree(state)
  const ranges = collectRanges(tree, 0, code.length)
  const lines: string[] = []
  let lineStart = 0
  let idx = 0
  while (idx <= code.length) {
    const nl = code.indexOf('\n', idx)
    const lineEnd = nl === -1 ? code.length : nl
    lines.push(renderSegment(code, lineStart, lineEnd, ranges))
    if (nl === -1) break
    idx = nl + 1
    lineStart = idx
  }
  return lines
}
