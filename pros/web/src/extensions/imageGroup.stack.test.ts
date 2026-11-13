// @vitest-environment happy-dom
/** 三张图拖到上沿或下沿，排成 12（左一右二）或 21（左二右一）。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup } from './imageGroup'
import { reorderInGroup, setGroupLayout, stackInGroup } from './imageGroupOps'
import { deepOptimizeDocument } from '../utils/rteDeepOptimize'
import { RteImage } from './rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

function makeEditor(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      RteImage.configure({ inline: false, allowBase64: true }),
      ImageGroup,
    ],
    content,
  })
  return editor
}

function groupHtml(layout?: '12' | '21') {
  const layoutAttr = layout ? ` data-layout="${layout}"` : ''
  return `<div data-type="image-group" data-align="center"${layoutAttr}><div class="rte-image-group-row"><img src="https://example.com/a.png"><img src="https://example.com/b.png"><img src="https://example.com/c.png"></div></div>`
}

function imagePositions(ed: Editor): number[] {
  const found: number[] = []
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') found.push(pos)
    return node.type.name !== 'image'
  })
  return found
}

function srcs(ed: Editor): string[] {
  const found: string[] = []
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'image') found.push(String(node.attrs.src))
  })
  return found
}

describe('图片组 12 / 21', () => {
  it('把右侧图拖到中间图下沿，排成 12', () => {
    const ed = makeEditor(groupHtml())
    const [left, middle, right] = imagePositions(ed)
    expect(stackInGroup(ed.view, right!, middle!, 'below')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('12')
    expect(srcs(ed)).toEqual(['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'])
    expect(ed.getHTML()).toContain('data-layout="12"')
    const dom = ed.view.dom.querySelector('[data-type="image-group"]') as HTMLElement
    const row = dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(dom.getAttribute('data-layout')).toBe('12')
    expect(row.style.display).toBe('grid')
    expect(row.children[0]?.getAttribute('style') || (row.children[0] as HTMLElement).style.gridArea).toContain('1 / 1')
    expect((row.children[2] as HTMLElement).style.gridArea).toContain('2 / 2')
  })

  it('把左侧图拖到中间图上沿，排成 21', () => {
    const ed = makeEditor(groupHtml())
    const [left, middle] = imagePositions(ed)
    expect(stackInGroup(ed.view, left!, middle!, 'above')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('21')
    expect(srcs(ed)).toEqual(['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'])
    const row = ed.view.dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(row.style.display).toBe('grid')
    expect((row.children[2] as HTMLElement).style.gridArea).toContain('1 / 2')
  })

  it('拖到下沿会交换上下顺序', () => {
    const ed = makeEditor(groupHtml())
    const [left, middle] = imagePositions(ed)
    expect(stackInGroup(ed.view, left!, middle!, 'below')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('21')
    expect(srcs(ed)).toEqual(['https://example.com/b.png', 'https://example.com/a.png', 'https://example.com/c.png'])
  })

  it('左右拖回横排', () => {
    const ed = makeEditor(groupHtml())
    const positions = imagePositions(ed)
    stackInGroup(ed.view, positions[2]!, positions[1]!, 'above')
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('12')
    expect(reorderInGroup(ed.view, 0, 2, 0, 'right')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('row')
    expect(ed.getHTML()).not.toContain('data-layout="12"')
    expect(ed.getHTML()).not.toContain('data-layout="21"')
    const row = ed.view.dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(row.style.display).toBe('flex')
  })

  it('data-layout 可以往返', () => {
    const ed = makeEditor(groupHtml('21'))
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('21')
    expect(ed.getHTML()).toContain('data-layout="21"')
    const again = makeEditor(ed.getHTML())
    expect(again.state.doc.firstChild?.attrs.layout).toBe('21')
  })

  it('一键优化给出 12 和 21，套用后写成布局', () => {
    const ed = makeEditor(groupHtml())
    const result = deepOptimizeDocument(ed)
    const line = result.lines.find((item) => item.actions?.length)
    expect(line?.actions?.map((action) => action.label)).toEqual(['套用 12', '套用 21'])
    expect(result.lines.some((item) => item.text.includes('缺少替代文本'))).toBe(true)
    const action = line?.actions?.[0]
    expect(action).toBeTruthy()
    expect(setGroupLayout(ed.view, action!.pos, '12')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('12')
    const row = ed.view.dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(row.style.display).toBe('grid')
    expect(ed.view.dom.querySelector('[data-type="image-group"]')?.getAttribute('data-layout')).toBe('12')
  })

  it('四张图拖到下沿会在目标那一列叠放', () => {
    const ed = makeEditor(
      `<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png" alt="A"><img src="https://example.com/b.png" alt="B"><img src="https://example.com/c.png" alt="C"><img src="https://example.com/d.png" alt="D"></div></div>`,
    )
    const positions = imagePositions(ed)
    expect(stackInGroup(ed.view, positions[3]!, positions[1]!, 'below')).toBe(true)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('mix')
    expect(ed.state.doc.firstChild?.attrs.stackAt).toBe(1)
    expect(srcs(ed)).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/d.png',
      'https://example.com/c.png',
    ])
  })

  it('从左一右二里删掉一张后改回横排', () => {
    const ed = makeEditor(groupHtml('12'))
    const positions = imagePositions(ed)
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, positions[2]!)))
    expect(ed.commands.deleteSelection()).toBe(true)
    expect(ed.state.doc.firstChild?.type.name).toBe('imageGroup')
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('row')
    expect(srcs(ed)).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
  })

  it('一组图全被藏起时重新显示', () => {
    const ed = makeEditor('<p></p>')
    ed.commands.setContent(
      `<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png" data-concealed="1"><img src="https://example.com/b.png" data-concealed="1"></div></div>`,
    )
    const hidden = srcs(ed).length
    expect(hidden).toBe(2)
    let concealed = 0
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image' && node.attrs.concealed) concealed += 1
    })
    expect(concealed).toBe(0)
  })

  it('不是三张图时不叠放', () => {
    const ed = makeEditor(
      `<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="https://example.com/a.png"><img src="https://example.com/b.png"></div></div>`,
    )
    const [left, right] = imagePositions(ed)
    expect(stackInGroup(ed.view, left!, right!, 'above')).toBe(false)
    expect(ed.state.doc.firstChild?.attrs.layout).toBe('row')
  })
})
