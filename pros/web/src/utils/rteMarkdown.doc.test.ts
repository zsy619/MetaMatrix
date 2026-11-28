// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Link from '@tiptap/extension-link'
import { markdownToHtml } from './rteMarkdown'

const fixture = readFileSync(resolve(process.cwd(), 'src/utils/__fixtures__/markdown-sample.md'), 'utf8')

function createEditor() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem,
      Link.configure({ HTMLAttributes: { class: 'rte-link' } }),
    ],
    content: '<p></p>',
  })
}

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }

function collect(doc: Node, type: string): Node[] {
  const out: Node[] = []
  const walk = (node: Node) => {
    if (node.type === type) out.push(node)
    node.content?.forEach(walk)
  }
  walk(doc)
  return out
}

describe('Markdown 导入编辑器（文档结构级）', () => {
  it('表格落成 table / tableRow / tableCell 节点', () => {
    const editor = createEditor()
    editor.chain().focus().insertContent(markdownToHtml(fixture)).run()
    const doc = editor.getJSON() as unknown as Node
    const tables = collect(doc, 'table')
    expect(tables.length).toBe(2)
    const rows = collect(doc, 'tableRow')
    const cells = collect(doc, 'tableCell')
    // 表一：2 列 × (1 表头 + 3 行)；表二：5 列 × (1 表头 + 2 行)
    expect(rows.length).toBe(4 + 3)
    expect(cells.length).toBe(6 + 10)
    const headers = collect(doc, 'tableHeader')
    expect(headers.length).toBe(2 + 5)
    editor.destroy()
  })

  it('标题层级保留', () => {
    const editor = createEditor()
    editor.chain().focus().insertContent(markdownToHtml(fixture)).run()
    const doc = editor.getJSON() as unknown as Node
    expect(collect(doc, 'heading').filter((n) => n.attrs?.level === 1).length).toBeGreaterThan(2)
    expect(collect(doc, 'heading').filter((n) => n.attrs?.level === 3).length).toBe(1)
    editor.destroy()
  })

  it('任务列表落成 taskList / taskItem，并保留勾选状态', () => {
    const editor = createEditor()
    editor.chain().focus().insertContent(markdownToHtml(fixture)).run()
    const doc = editor.getJSON() as unknown as Node
    expect(collect(doc, 'taskList').length).toBe(1)
    const items = collect(doc, 'taskItem')
    expect(items.length).toBe(2)
    expect(items.filter((n) => n.attrs?.checked === true).length).toBe(1)
    expect(items.filter((n) => n.attrs?.checked === false).length).toBe(1)
    editor.destroy()
  })

  it('链接是真正的 link mark，地址不带转义反斜杠', () => {
    const editor = createEditor()
    editor.chain().focus().insertContent(markdownToHtml(fixture)).run()
    const doc = editor.getJSON() as unknown as Node
    const links: { type: string; attrs?: Record<string, unknown> }[] = []
    const walk = (node: Node) => {
      node.marks?.forEach((mark) => {
        if (mark.type === 'link') links.push(mark)
      })
      node.content?.forEach(walk)
    }
    walk(doc)
    expect(links.length).toBeGreaterThan(3)
    expect(links.some((mark) => mark.attrs?.href === 'https://github.com/telegramdesktop/tdesktop')).toBe(true)
    expect(links.every((mark) => !String(mark.attrs?.href ?? '').includes('\\'))).toBe(true)
    editor.destroy()
  })

  it('正文里不残留 Markdown 转义反斜杠', () => {
    const editor = createEditor()
    editor.chain().focus().insertContent(markdownToHtml(fixture)).run()
    const doc = editor.getJSON() as unknown as Node
    const texts: string[] = []
    const walk = (node: Node) => {
      if (node.text) texts.push(node.text)
      node.content?.forEach(walk)
    }
    walk(doc)
    const all = texts.join('')
    expect(all).not.toMatch(/\\[#[\]_+.\-]/)
    expect(all).toContain('#0088cc')
    expect(all).toContain('--tg-theme-bg-color')
    editor.destroy()
  })
})
