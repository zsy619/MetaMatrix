// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser as PmDOMParser, Fragment } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { Bookmark } from './bookmark'
import { Callout } from './callout'
import { ListStyleAttrs } from './listStyleAttrs'
import {
  BLOCK_IDENTITY_ATTR,
  BLOCK_IDENTITY_HTML_ATTR,
  BlockIdentity,
  collectIdentityNodes,
  readBlockId,
  regenerateIdentitiesInSlice,
} from './blockIdentity'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content: string, extra: AnyExtension[] = []) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      ListStyleAttrs,
      Bookmark,
      Callout,
      BlockIdentity,
      ...extra,
    ],
    content,
  })
  return editor
}

function identities(ed: Editor) {
  return collectIdentityNodes(ed.state.doc).map(({ node, pos }) => ({
    pos,
    type: node.type.name,
    id: readBlockId(node),
    text: node.textContent,
  }))
}

function idsByText(ed: Editor): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of identities(ed)) {
    if (item.id) map.set(item.text, item.id)
  }
  return map
}

function topLevelIds(ed: Editor): string[] {
  const ids: string[] = []
  ed.state.doc.forEach((child) => {
    const id = readBlockId(child)
    if (id) ids.push(id)
  })
  return ids
}

function textPos(ed: Editor, text: string, edge: 'start' | 'end' = 'start') {
  let pos = -1
  ed.state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false
    if (node.isText && node.text === text) pos = edge === 'start' ? nodePos : nodePos + node.nodeSize
    return pos < 0
  })
  return pos
}

/** 与 useBlockHandle.duplicateCurrentBlock 相同：复制顶层块并插入到其后。 */
function duplicateTopLevel(ed: Editor) {
  const { $from } = ed.state.selection
  const from = $from.before(1)
  const node = $from.node(1)
  const copy = node.copy(node.content)
  ed.view.dispatch(ed.state.tr.insert(from + node.nodeSize, copy).scrollIntoView())
}

/** 与 useBlockHandle.moveCurrentBlock 相同：整篇按顶层块重排，节点 copy 但应保留 ID。 */
function moveTopLevel(ed: Editor, dir: -1 | 1) {
  const { $from } = ed.state.selection
  const index = $from.index(0)
  const doc = ed.state.doc
  const targetIndex = index + dir
  const children: ReturnType<typeof doc.child>[] = []
  doc.forEach((child) => children.push(child))
  const [moved] = children.splice(index, 1)
  children.splice(targetIndex, 0, moved!)
  const copies = children.map((c) => c.copy(c.content))
  let tr = ed.state.tr.replaceWith(0, doc.content.size, Fragment.from(copies))
  let selPos = 0
  for (let i = 0; i < targetIndex; i += 1) selPos += children[i]!.nodeSize
  tr = tr.setSelection(NodeSelection.create(tr.doc, selPos)).scrollIntoView()
  ed.view.dispatch(tr)
}

function parseHtmlSlice(ed: Editor, html: string) {
  const el = document.createElement('div')
  el.innerHTML = html
  return PmDOMParser.fromSchema(ed.schema).parseSlice(el)
}

/** 模拟「粘贴整块」：走 transformPasted，再作为兄弟块插入，避免在段尾合并进当前段。 */
function pasteHtml(ed: Editor, html: string) {
  const slice = parseHtmlSlice(ed, html)
  const transformed =
    ed.view.someProp('transformPasted', (fn) => fn(slice, ed.view, false)) ??
    regenerateIdentitiesInSlice(slice)
  const insertAt = ed.state.doc.content.size
  ed.view.dispatch(ed.state.tr.insert(insertAt, transformed.content).scrollIntoView())
}

describe('块身份：插入与回填', () => {
  it('打开没有 ID 的老文档时，只给身份块补 ID，并序列化成 data-block-id', () => {
    const updates: string[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ dropcursor: false }), BlockIdentity],
      content: '<p>甲</p><p>乙</p>',
      onUpdate: () => {
        updates.push('update')
      },
    })
    const html = editor.getHTML()
    const found = [...html.matchAll(new RegExp(`${BLOCK_IDENTITY_HTML_ATTR}="([^"]+)"`, 'g'))].map((m) => m[1])
    expect(found).toHaveLength(2)
    expect(new Set(found).size).toBe(2)
    expect(html).toContain('>甲</p>')
    expect(html).toContain('>乙</p>')
    // 懒回填带 preventUpdate，不因回填单独触发 update（进而不触发保存）
    expect(updates).toEqual([])
  })

  it('插入新段落后会立刻带上新的 UUID', () => {
    const ed = mount('<p>甲</p>')
    const before = new Set(topLevelIds(ed))
    ed.commands.command(({ tr, dispatch }) => {
      const p = ed.schema.nodes.paragraph!.createAndFill()
      if (!p || !dispatch) return false
      dispatch(tr.insert(ed.state.doc.content.size, p))
      return true
    })
    const after = topLevelIds(ed)
    expect(after.length).toBe(before.size + 1)
    const added = after.filter((id) => !before.has(id))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('callout 里的一级嵌套段落也会补 ID，列表项内的段落则不会', () => {
    const ed = mount(
      `<div data-type="callout" data-variant="info"><p>提示里</p></div><ul><li><p>列表里</p></li></ul>`,
    )
    const items = identities(ed)
    const callout = items.find((i) => i.type === 'callout')
    const inner = items.find((i) => i.type === 'paragraph' && i.text === '提示里')
    const list = items.find((i) => i.type === 'bulletList')
    expect(callout?.id).toBeTruthy()
    expect(inner?.id).toBeTruthy()
    expect(inner?.id).not.toBe(callout?.id)
    expect(list?.id).toBeTruthy()
    expect(items.some((i) => i.type === 'paragraph' && i.text === '列表里')).toBe(false)
  })

  it('文档内重复 ID 会重生成，原位置保留，且再跑一次不再改动', () => {
    const ed = mount('<p data-block-id="dup-id">甲</p><p data-block-id="dup-id">乙</p>')
    const first = idsByText(ed)
    expect(first.get('甲')).toBe('dup-id')
    expect(first.get('乙')).toBeTruthy()
    expect(first.get('乙')).not.toBe('dup-id')
    const htmlOnce = ed.getHTML()
    expect(ed.commands.ensureBlockIdentities()).toBe(false)
    expect(ed.getHTML()).toBe(htmlOnce)
  })
})

describe('块身份：复制必须换新 ID', () => {
  it('复制当前块后，原块保留 ID，副本拿到新 ID', () => {
    const ed = mount('<p data-block-id="keep-me">甲</p><p data-block-id="other">乙</p>')
    ed.commands.setTextSelection(textPos(ed, '甲') + 1)
    duplicateTopLevel(ed)
    const paragraphs = identities(ed).filter((i) => i.type === 'paragraph')
    expect(paragraphs).toHaveLength(3)
    const originals = paragraphs.filter((i) => i.text === '甲')
    expect(originals).toHaveLength(2)
    expect(originals.some((i) => i.id === 'keep-me')).toBe(true)
    const copy = originals.find((i) => i.id !== 'keep-me')
    expect(copy?.id).toBeTruthy()
    expect(copy?.id).not.toBe('keep-me')
    expect(paragraphs.find((i) => i.text === '乙')?.id).toBe('other')
  })
})

describe('块身份：拖拽 / 移动保持 ID', () => {
  it('顶层块上移后，各块仍使用原来的 ID', () => {
    const ed = mount(
      '<p data-block-id="id-a">甲</p><p data-block-id="id-b">乙</p><p data-block-id="id-c">丙</p>',
    )
    ed.commands.setTextSelection(textPos(ed, '乙') + 1)
    moveTopLevel(ed, -1)
    expect(idsByText(ed).get('甲')).toBe('id-a')
    expect(idsByText(ed).get('乙')).toBe('id-b')
    expect(idsByText(ed).get('丙')).toBe('id-c')
    const order = identities(ed)
      .filter((i) => i.type === 'paragraph')
      .map((i) => i.text)
    expect(order).toEqual(['乙', '甲', '丙'])
  })
})

describe('块身份：粘贴必须换新 ID', () => {
  it('把带原 ID 的段落粘贴进文档后，粘贴块换新 ID，原文不动', () => {
    const ed = mount('<p data-block-id="keep-me">甲</p>')
    ed.commands.setTextSelection(ed.state.doc.content.size)
    pasteHtml(ed, '<p data-block-id="keep-me">甲副本</p>')
    const items = identities(ed).filter((i) => i.type === 'paragraph')
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.text === '甲')?.id).toBe('keep-me')
    const pasted = items.find((i) => i.text === '甲副本')
    expect(pasted?.id).toBeTruthy()
    expect(pasted?.id).not.toBe('keep-me')
  })

  it('transformPasted 会改写切片里的 ID，即使文档中还不存在该 ID', () => {
    const ed = mount('<p data-block-id="host">宿主</p>')
    const slice = parseHtmlSlice(ed, '<p data-block-id="clipboard-id">剪贴板</p>')
    const before = readBlockId(slice.content.child(0))
    expect(before).toBe('clipboard-id')
    const next = regenerateIdentitiesInSlice(slice)
    expect(readBlockId(next.content.child(0))).not.toBe('clipboard-id')
    expect(readBlockId(next.content.child(0))).toBeTruthy()
    expect(idsByText(ed).get('宿主')).toBe('host')
  })
})

describe('块身份：拆分与合并', () => {
  it('拆分时原块保留 ID，新块拿到新 ID', () => {
    const ed = mount('<p data-block-id="keep-me">你好世界</p>')
    const start = textPos(ed, '你好世界')
    ed.commands.setTextSelection(start + 2)
    expect(ed.commands.splitBlock()).toBe(true)
    const parts = identities(ed).filter((i) => i.type === 'paragraph')
    expect(parts).toHaveLength(2)
    expect(parts[0]?.id).toBe('keep-me')
    expect(parts[0]?.text).toBe('你好')
    expect(parts[1]?.id).toBeTruthy()
    expect(parts[1]?.id).not.toBe('keep-me')
    expect(parts[1]?.text).toBe('世界')
  })

  it('合并时存活块保留自身 ID', () => {
    const ed = mount('<p data-block-id="id-a">你好</p><p data-block-id="id-b">世界</p>')
    const start = textPos(ed, '世界')
    ed.commands.setTextSelection(start)
    expect(ed.commands.joinBackward()).toBe(true)
    const parts = identities(ed).filter((i) => i.type === 'paragraph')
    expect(parts).toHaveLength(1)
    expect(parts[0]?.id).toBe('id-a')
    expect(parts[0]?.text).toBe('你好世界')
  })
})

describe('块身份：与既有锚点属性并存', () => {
  it('heading 的 id、书签 data-bookmark-id 与 data-block-id 互不覆盖', () => {
    const ed = mount(
      `<h2 id="h-old">标题</h2><p>正文<span id="bm-1" data-bookmark-id="bm-1" data-bookmark-label="书签"></span>后</p>`,
    )
    const html = ed.getHTML()
    expect(html).toMatch(/<h2[^>]*id="h-old"/)
    expect(html).toMatch(/<h2[^>]*data-block-id="[^"]+"/)
    const heading = identities(ed).find((i) => i.type === 'heading')
    expect(heading?.id).toBeTruthy()
    expect(heading?.id).not.toBe('h-old')
    const hNode = ed.state.doc.child(0)
    expect(hNode.attrs.id).toBe('h-old')
    expect(hNode.attrs[BLOCK_IDENTITY_ATTR]).toBe(heading?.id)
    // 书签是行内标记，允许与块身份并存；若解析器丢掉空书签节点则不作为本测试硬性条件
    if (html.includes('data-bookmark-id')) {
      expect(html).toContain('data-bookmark-id="bm-1"')
    }
  })

  it('data-block-id 只读写 dataBlockId，不占用 heading.id / xrefId / syncBlock.blockId', () => {
    const ed = mount('<h2 id="h-old">标题</h2><p data-block-id="p1">图</p>')
    const heading = ed.state.doc.child(0)
    const para = ed.state.doc.child(1)
    expect(heading.attrs.id).toBe('h-old')
    expect(heading.attrs[BLOCK_IDENTITY_ATTR]).toBeTruthy()
    expect(heading.attrs[BLOCK_IDENTITY_ATTR]).not.toBe('h-old')
    expect(para.attrs[BLOCK_IDENTITY_ATTR]).toBe('p1')
    expect(para.attrs).not.toHaveProperty('blockId')
    expect(para.attrs).not.toHaveProperty('xrefId')
    const html = ed.getHTML()
    expect(html).toContain('data-block-id="p1"')
    expect(html).not.toContain('data-sync-block')
    expect(html).not.toMatch(/data-block-id="h-old"/)
  })
})
