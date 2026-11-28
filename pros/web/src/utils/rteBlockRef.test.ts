import { describe, expect, it } from 'vitest'
import { findCrossRef, findCrossRefPos, type CrossRefDoc } from './rteBlockRef'

function docOf(
  nodes: Array<{
    type: string
    attrs?: Record<string, unknown>
    text?: string
    pos: number
    marks?: Array<{ type: { name: string }; attrs: Record<string, unknown> }>
  }>,
): CrossRefDoc {
  return {
    descendants(visit) {
      for (const node of nodes) {
        const stop = visit(
          {
            type: { name: node.type },
            attrs: node.attrs ?? {},
            textContent: node.text ?? '',
            marks: node.marks,
          },
          node.pos,
        )
        if (stop === false) break
      }
    },
  }
}

describe('findCrossRef', () => {
  it('优先按 dataBlockId 定位', () => {
    const doc = docOf([
      {
        type: 'heading',
        pos: 4,
        text: '季度目标',
        attrs: { id: 'h-old', dataBlockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      },
    ])
    const hit = findCrossRef(doc, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '§ 别的标题')
    expect(hit).toEqual({ pos: 4, lost: false, via: 'blockId' })
    expect(findCrossRefPos(doc, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(4)
  })

  it('旧锚点（heading.id / xrefId / bookmark）仍能定位且不打 lost', () => {
    const heading = docOf([{ type: 'heading', pos: 8, text: '引言', attrs: { id: 'h-intro' } }])
    expect(findCrossRef(heading, 'h-intro', '')).toEqual({ pos: 8, lost: false, via: 'anchor' })

    const image = docOf([{ type: 'image', pos: 20, attrs: { xrefId: 'fig-2' } }])
    expect(findCrossRef(image, 'fig-2', '')).toEqual({ pos: 20, lost: false, via: 'anchor' })

    const bookmark = docOf([
      {
        type: 'text',
        pos: 30,
        text: '书签处',
        marks: [{ type: { name: 'bookmark' }, attrs: { id: 'bm-1' } }],
      },
    ])
    expect(findCrossRef(bookmark, 'bm-1', '')).toEqual({ pos: 30, lost: false, via: 'anchor' })
  })

  it('仅标题文本命中时降级并打 lost', () => {
    const doc = docOf([
      { type: 'heading', pos: 12, text: '季度目标', attrs: { id: 'h-other' } },
    ])
    expect(findCrossRef(doc, 'missing-id', '§ 季度目标')).toEqual({
      pos: 12,
      lost: true,
      via: 'label',
    })
  })

  it('blockId 优先于同节点上的旧锚点与标题', () => {
    const doc = docOf([
      {
        type: 'heading',
        pos: 1,
        text: '季度目标',
        attrs: { id: 'h-old', dataBlockId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      },
    ])
    expect(findCrossRef(doc, 'h-old', '§ 季度目标')?.via).toBe('anchor')
    expect(findCrossRef(doc, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '§ 季度目标')?.via).toBe(
      'blockId',
    )
  })

  it('都对不上时返回 null', () => {
    expect(findCrossRef({ descendants(visit) { void visit } }, 'missing', '没有')).toBeNull()
  })
})
