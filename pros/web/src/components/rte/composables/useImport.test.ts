// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { useImport } from './useImport'

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
    ],
    content: '<p>原有正文</p><p>第二段</p>',
  })
}

function setup() {
  const editor = shallowRef<Editor | undefined>(createEditor())
  const api = useImport({ editor, closeMore: () => {} })
  return { editor, api }
}

describe('导入 Markdown：所见即所得预览', () => {
  it('选文件后先出预览，不直接落库', () => {
    const { editor, api } = setup()
    api.openMarkdownImport(fixture, '参考指南.md')
    expect(api.markdownImportOpen.value).toBe(true)
    expect(api.markdownFileName.value).toBe('参考指南.md')
    expect(api.markdownHtml.value).toContain('<table>')
    expect(api.markdownStats.value).toMatch(/个标题/)
    // 预览阶段编辑器内容还没变
    expect(editor.value!.getText()).toContain('原有正文')
    expect(editor.value!.getText()).not.toContain('GitHub Telegram')
    api.closeMarkdownImport()
    expect(api.markdownImportOpen.value).toBe(false)
    editor.value!.destroy()
  })

  it('「替换全文」用预览结果覆盖正文', () => {
    const { editor, api } = setup()
    api.openMarkdownImport(fixture, '参考指南.md')
    api.confirmMarkdownImport('replace')
    const text = editor.value!.getText()
    expect(text).not.toContain('原有正文')
    expect(text).toContain('GitHub Telegram')
    expect(editor.value!.getJSON()).toMatchObject({
      content: expect.arrayContaining([expect.objectContaining({ type: 'table' })]),
    })
    expect(api.markdownImportOpen.value).toBe(false)
    editor.value!.destroy()
  })

  it('「插入到光标」把内容插到光标处并保留原正文', () => {
    const { editor, api } = setup()
    // 光标停在第一段末尾（段落起点 1 + 4 个字）
    editor.value!.commands.setTextSelection(5)
    api.openMarkdownImport('# 小标题\n\n正文一段', 'a.md')
    api.confirmMarkdownImport('cursor')
    const text = editor.value!.getText()
    expect(text).toContain('原有正文')
    expect(text).toContain('第二段')
    expect(text).toContain('小标题')
    expect(text.indexOf('原有正文')).toBeLessThan(text.indexOf('小标题'))
    expect(editor.value!.getJSON()).toMatchObject({
      content: expect.arrayContaining([expect.objectContaining({ type: 'heading' })]),
    })
    editor.value!.destroy()
  })

  it('「追加到文末」把内容接在正文之后', () => {
    const { editor, api } = setup()
    api.openMarkdownImport('## 附录标题', 'b.md')
    api.confirmMarkdownImport('append')
    const text = editor.value!.getText()
    expect(text.indexOf('原有正文')).toBeLessThan(text.indexOf('附录标题'))
    editor.value!.destroy()
  })
})
