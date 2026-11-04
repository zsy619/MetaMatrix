// @vitest-environment happy-dom
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { vi } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: () => {},
    info: () => {},
    success: () => {},
    error: () => {},
  },
}))

import { useBlockHandle } from './useBlockHandle.ts'
import { RTE_BLOCK_TOOLS_WIDTH, RTE_BLOCK_TOOLS_WIDTH_SINGLE } from '../../../utils/rteGutter.ts'

function fakeRect(left: number, top: number, width = 600, height = 20): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/** 搭一个「画布 + 正文 + 段落」的最小结构，返回几何量。 */
function setup(opts: { expanded: boolean; proseLeft: number; prosePaddingLeft: number; canvasLeft: number }) {
  const root = document.createElement('div')
  const canvas = document.createElement('div')
  canvas.className = 'rte-canvas'
  const prose = document.createElement('div')
  prose.className = 'ProseMirror'
  prose.style.paddingLeft = `${opts.prosePaddingLeft}px`
  const block = document.createElement('p')
  block.textContent = '航海案主'
  prose.appendChild(block)
  canvas.appendChild(prose)
  root.appendChild(canvas)
  document.body.appendChild(root)

  const contentLeft = opts.proseLeft + opts.prosePaddingLeft
  canvas.getBoundingClientRect = () => fakeRect(opts.canvasLeft, 0, 900, 600)
  prose.getBoundingClientRect = () => fakeRect(opts.proseLeft, 0, 700, 600)
  block.getBoundingClientRect = () => fakeRect(contentLeft, 10, 600, 20)

  const api = useBlockHandle({
    editor: ref(undefined),
    viewMode: () => ({ value: 'edit' }),
    rteRootEl: ref(root),
    expanded: () => opts.expanded,
  })

  api.onCanvasBlockHover({
    clientY: 15,
    clientX: contentLeft + 3,
    target: block,
    currentTarget: canvas,
  } as unknown as MouseEvent)

  return { api, contentLeft, canvasLeft: opts.canvasLeft }
}

// 展开态：手柄整体落在正文左侧留白里，右边缘不越过正文左边界。
{
  const { api, contentLeft, canvasLeft } = setup({
    expanded: true,
    proseLeft: 132,
    prosePaddingLeft: 50,
    canvasLeft: 100,
  })
  assert.equal(api.blockHandle.value.visible, true)
  const left = api.blockHandle.value.left
  assert.equal(left, contentLeft - canvasLeft - RTE_BLOCK_TOOLS_WIDTH - 4)
  assert.ok(
    left + RTE_BLOCK_TOOLS_WIDTH <= contentLeft - 4,
    '展开态手柄压住了首字',
  )
  assert.ok(left >= 0, '展开态手柄跑到画布外')
}

// 收起态：只有 ⋮ 菜单一个按钮，同样不压首字。
{
  const { api, contentLeft, canvasLeft } = setup({
    expanded: false,
    proseLeft: 120,
    prosePaddingLeft: 26,
    canvasLeft: 100,
  })
  const left = api.blockHandle.value.left
  assert.equal(left, contentLeft - canvasLeft - RTE_BLOCK_TOOLS_WIDTH_SINGLE - 4)
  assert.ok(left + RTE_BLOCK_TOOLS_WIDTH_SINGLE <= contentLeft - 4, '收起态手柄压住了首字')
}

// A4 纸张窄边距：正文左边就是纸内留白起点，手柄要落在纸内而不是纸上。
{
  const { api, contentLeft } = setup({
    expanded: true,
    proseLeft: 50,
    prosePaddingLeft: 0,
    canvasLeft: 0,
  })
  const left = api.blockHandle.value.left
  assert.equal(left, 0)
  assert.ok(left + RTE_BLOCK_TOOLS_WIDTH <= contentLeft - 4, 'A4 窄边距下手柄压住了首字')
}

console.log('rte block handle gutter ok')
