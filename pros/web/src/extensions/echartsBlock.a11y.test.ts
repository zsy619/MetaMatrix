// @vitest-environment happy-dom
/**
 * 图表节点视图的无障碍 DOM 行为测试：
 * - 图表容器上有 role="img" + aria-label（数据摘要）；
 * - 视觉隐藏的数据表在节点视图 DOM 里（role="img" 的兄弟节点）。
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EchartsBlock } from './echartsBlock'

const LINE_OPTION = JSON.stringify({
  title: { text: '月度趋势' },
  xAxis: { type: 'category', data: ['一月', '二月', '三月'] },
  series: [{ type: 'line', name: '新增用户', data: [820, 932, 901] }],
})

async function mountChart(option: string) {
  const editor = new Editor({
    extensions: [StarterKit, EchartsBlock],
    content: '<p>正文</p>',
  })
  editor.commands.insertEchartsBlock({ chartType: 'line', option })
  // NodeView 的首轮渲染是异步的，等微任务跑完
  await new Promise((resolve) => setTimeout(resolve, 0))
  return editor
}

describe('图表节点视图的无障碍 DOM', () => {
  it('图表容器带 role="img" 与 aria-label 摘要', async () => {
    const editor = await mountChart(LINE_OPTION)
    const chartEl = editor.view.dom.querySelector('.rte-echarts-preview') as HTMLElement | null
    expect(chartEl).toBeTruthy()
    expect(chartEl!.getAttribute('role')).toBe('img')
    const label = chartEl!.getAttribute('aria-label') || ''
    expect(label).toContain('折线图')
    expect(label).toContain('月度趋势')
    expect(label).toContain('新增用户')
    expect(label).toContain('一月 820')
    editor.destroy()
  })

  it('节点视图里有视觉隐藏的数据表', async () => {
    const editor = await mountChart(LINE_OPTION)
    const hidden = editor.view.dom.querySelector('.rte-chart-a11y') as HTMLElement | null
    expect(hidden).toBeTruthy()
    const table = hidden!.querySelector('table')
    expect(table).toBeTruthy()
    expect(table!.querySelector('caption')?.textContent).toContain('月度趋势')
    const headers = Array.from(table!.querySelectorAll('thead th')).map((el) => el.textContent)
    expect(headers).toEqual(['类目', '新增用户'])
    const rows = table!.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('一月')
    expect(rows[0].textContent).toContain('820')
    // 隐藏表不能放在 role="img" 元素内部（会被读屏当成纯装饰）
    const chartEl = editor.view.dom.querySelector('.rte-echarts-preview') as HTMLElement
    expect(chartEl.querySelector('table')).toBeNull()
    editor.destroy()
  })

  it('导出的 HTML 也带无障碍摘要', async () => {
    const editor = await mountChart(LINE_OPTION)
    const html = editor.getHTML()
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label=')
    expect(html).toContain('新增用户')
    editor.destroy()
  })

  it('option 变了之后摘要会跟着更新', async () => {
    const editor = await mountChart(LINE_OPTION)
    let pos = -1
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === 'echartsBlock' && pos < 0) pos = at
      return true
    })
    expect(pos).toBeGreaterThanOrEqual(0)
    editor.commands.updateEchartsBlock(pos, {
      option: JSON.stringify({
        title: { text: '新的标题' },
        xAxis: { type: 'category', data: ['四月'] },
        series: [{ type: 'bar', name: '另一个系列', data: [5] }],
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const chartEl = editor.view.dom.querySelector('.rte-echarts-preview') as HTMLElement
    const label = chartEl.getAttribute('aria-label') || ''
    expect(label).toContain('新的标题')
    expect(label).toContain('另一个系列')
    expect(label).not.toContain('新增用户')
    editor.destroy()
  })
})
