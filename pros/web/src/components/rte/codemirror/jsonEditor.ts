/**
 * CodeMirror 6 的 JSON 编辑器（懒加载模块）。
 *
 * 与 codemirror/htmlEditor.ts 同思路：只依赖 @codemirror/state、@codemirror/view，
 * 不引入 codemirror 全家桶，动态 import 后不进主 chunk。
 *
 * JSON 没有官方 lang 包（@codemirror/lang-json 未安装），
 * 这里用正则做一层轻量着色（字符串键 / 字符串值 / 数字 / 标点），
 * 校验由调用方（safeParseEchartsOption）负责。
 */
import { EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/** JSON 词法种类。 */
export type JsonTokenKind = 'key' | 'string' | 'number' | 'punct'

/** 着色表（与 HTML 编辑器同一套暗色风格）。 */
export const JSON_TOKEN_COLORS: Record<JsonTokenKind, string> = {
  key: '#9cdcfe',
  string: '#ce9178',
  number: '#b5cea8',
  punct: '#a9a9a9',
}

const TOKEN_RE = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Array<{ from: number; to: number; kind: JsonTokenKind }> = []
  const fullText = view.state.doc.toString()
  let offset = 0
  for (const lineText of fullText.split('\n')) {
    TOKEN_RE.lastIndex = 0
    let match = TOKEN_RE.exec(lineText)
    while (match) {
      const at = offset + match.index
      if (match[1] !== undefined) {
        ranges.push({ from: at, to: at + match[1]!.length, kind: 'key' })
        ranges.push({ from: at + match[1]!.length, to: at + match[1]!.length + 1, kind: 'punct' })
      } else if (match[3] !== undefined) {
        ranges.push({ from: at, to: at + match[3]!.length, kind: 'string' })
      } else if (match[4] !== undefined) {
        ranges.push({ from: at, to: at + match[4]!.length, kind: 'number' })
      } else if (match[5] !== undefined) {
        ranges.push({ from: at, to: at + match[5]!.length, kind: 'punct' })
      }
      match = TOKEN_RE.exec(lineText)
    }
    offset += lineText.length + 1
  }
  const decorations = ranges
    .sort((a, b) => a.from - b.from)
    .map((range) =>
      Decoration.mark({
        attributes: { style: `color: ${JSON_TOKEN_COLORS[range.kind]}` },
      }).range(range.from, range.to),
    )
  return Decoration.set(decorations, true)
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
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#264f78',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '1px solid #d4d4d4' },
  },
  { dark: true },
)

export type CreateJsonEditorOptions = {
  doc: string
  parent: HTMLElement
  readOnly?: boolean
  onChange?: (value: string) => void
}

/** 创建 CodeMirror JSON 编辑器实例。 */
export function createJsonEditor(opts: CreateJsonEditorOptions): EditorView {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      EditorState.readOnly.of(!!opts.readOnly),
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
