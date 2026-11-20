import { describe, expect, it } from 'vitest'
import { buildNodeGraphSvg, contentBounds, contentPreview } from './exportImage'
import type { GraphEdge, GraphNode } from '../../../types/nodeGraph'

const nodes: GraphNode[] = [
  {
    id: 'n1',
    type: 'richtext',
    x: 0,
    y: 0,
    width: 240,
    height: 96,
    title: '需求梳理',
    description: '收集业务需求',
    content: '<p>需求</p>',
    progress: 40,
  },
  {
    id: 'n2',
    type: 'canvasRef',
    x: 340,
    y: 60,
    width: 240,
    height: 96,
    title: 'ABC模型',
    refTemplateId: 'abc-model',
  },
]
const edges: GraphEdge[] = [{ id: 'e1', source: 'n1', target: 'n2', label: '产出' }]

describe('节点画布导出图片', () => {
  it('包围盒按节点算并留出边距', () => {
    const bounds = contentBounds(nodes)
    expect(bounds).toEqual({ minX: 0, minY: 0, width: 580, height: 156 })
  })

  it('SVG 里带上节点标题、类型、进度与连线标签', () => {
    const svg = buildNodeGraphSvg(nodes, edges)
    expect(svg).toContain('需求梳理')
    expect(svg).toContain('收集业务需求')
    expect(svg).toContain('富文本')
    expect(svg).toContain('画布')
    expect(svg).toContain('产出')
    // 进度条宽度按百分比算：240 * 40% = 96
    expect(svg).toContain('width="96"')
    expect(svg).toContain('marker-end="url(#ng-arrow-0)"')
  })

  it('富文本正文会被带成一行纯文本预览', () => {
    expect(contentPreview('<p>球友提议把微信表情包推出去</p>')).toBe('球友提议把微信表情包推出去')
    expect(contentPreview('<p>很长的一段正文内容需要被截断处理掉才不会撑破卡片布局</p>')).toHaveLength(26)
    expect(contentPreview('')).toBe('')
  })

  it('没有节点时给出默认画布尺寸', () => {
    expect(contentBounds([]).width).toBeGreaterThan(0)
    expect(buildNodeGraphSvg([], [])).toContain('<svg')
  })
})
