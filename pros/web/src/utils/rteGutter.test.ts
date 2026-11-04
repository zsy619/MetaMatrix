import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  blockHandleLeft,
  blockHandleRight,
  blockToolsWidth,
  gutterSize,
  RTE_BLOCK_TOOLS_WIDTH,
  RTE_BLOCK_TOOLS_WIDTH_SINGLE,
  RTE_GUTTER_SIZE,
  RTE_HANDLE_TEXT_GAP,
} from './rteGutter.ts'

// —— 尺寸常量：手柄列必须整体放得进正文左侧的留白里 ——
assert.equal(RTE_BLOCK_TOOLS_WIDTH, 46) // ⠿ 拖拽(22) + 2px 间距 + ⋮ 菜单(22)
assert.equal(RTE_BLOCK_TOOLS_WIDTH_SINGLE, 22) // 收起态只有 ⋮ 菜单
assert.equal(RTE_GUTTER_SIZE, RTE_BLOCK_TOOLS_WIDTH + RTE_HANDLE_TEXT_GAP)
assert.equal(blockToolsWidth(true), RTE_BLOCK_TOOLS_WIDTH)
assert.equal(blockToolsWidth(false), RTE_BLOCK_TOOLS_WIDTH_SINGLE)
assert.equal(gutterSize(true), RTE_GUTTER_SIZE)
assert.equal(gutterSize(false), RTE_BLOCK_TOOLS_WIDTH_SINGLE + RTE_HANDLE_TEXT_GAP)

/**
 * 三种版式下手柄都不与首字重叠：
 * 恒有 handle.right <= 正文内容左边界 - 手柄与正文间距。
 */
const cases = [
  {
    name: '展开态·纸卡片（画布左内边距 32 + 卡片左内边距 50）',
    canvasLeft: 0,
    contentLeft: 32 + 50,
    toolsWidth: RTE_BLOCK_TOOLS_WIDTH,
  },
  {
    name: '展开态·A4 纸张窄边距（纸内左内边距 50）',
    canvasLeft: 0,
    contentLeft: 50,
    toolsWidth: RTE_BLOCK_TOOLS_WIDTH,
  },
  {
    name: '收起态·普通面板（画布左内边距 14 + 正文左内边距 26）',
    canvasLeft: 0,
    contentLeft: 14 + 26,
    toolsWidth: RTE_BLOCK_TOOLS_WIDTH_SINGLE,
  },
  {
    name: '铺满版式（正文左内边距 50）',
    canvasLeft: 0,
    contentLeft: 50,
    toolsWidth: RTE_BLOCK_TOOLS_WIDTH,
  },
]

for (const item of cases) {
  const left = blockHandleLeft(item.contentLeft, item.canvasLeft, item.toolsWidth)
  const right = blockHandleRight(left, item.toolsWidth)
  const textLeft = item.contentLeft
  assert.ok(
    right <= textLeft - RTE_HANDLE_TEXT_GAP,
    `${item.name}：手柄右边界 ${right} 越过正文左边界 ${textLeft}`,
  )
  // 手柄也不能跑到画布左边界之外（会被 overflow 裁掉）。
  assert.ok(left >= item.canvasLeft, `${item.name}：手柄被裁到画布外`)
}

// 画布本身有偏移时（滚动条/嵌套容器），换算仍然成立。
{
  const canvasLeft = 120
  const contentLeft = canvasLeft + 32 + 50
  const left = blockHandleLeft(contentLeft, canvasLeft, RTE_BLOCK_TOOLS_WIDTH)
  const right = blockHandleRight(left, RTE_BLOCK_TOOLS_WIDTH)
  assert.equal(left, 32)
  assert.ok(right <= contentLeft - RTE_HANDLE_TEXT_GAP)
}

// —— CSS 必须真的留出这段空白，否则 JS 算对了也会压住首字 ——
const scopedCss = readFileSync(
  new URL('../components/rte/styles/editor.scoped.css', import.meta.url),
  'utf8',
)
const globalCss = readFileSync(
  new URL('../components/rte/styles/editor.global.css', import.meta.url),
  'utf8',
)

// 留白宽度：收起态 26px（单按钮），展开态 50px（双按钮 + 间距）。
assert.match(scopedCss, /\.rte-root \{[^}]*--rte-gutter-size:\s*26px;/)
assert.match(scopedCss, /\.rte-root\.expanded \{[^}]*--rte-gutter-size:\s*50px;/)
// 正文列左侧必须让出这段留白。
assert.match(scopedCss, /\.rte-root :deep\(\.ProseMirror\) \{\s*padding-left:\s*var\(--rte-gutter-size\);/)
assert.match(
  scopedCss,
  /\.rte-root\.expanded:not\(\[data-page-size='full'\]\):not\(\.is-page-sheet\) :deep\(\.ProseMirror\)[^}]*padding:\s*28px max\(40px, var\(--rte-gutter-size\)\) 72px;/,
)
assert.match(
  scopedCss,
  /\.rte-root\[data-page-size='full'\]\.expanded :deep\(\.ProseMirror\)[^}]*padding:\s*4px max\(2px, var\(--rte-gutter-size\)\) 16px;/,
)
assert.match(
  scopedCss,
  /\.rte-root\.expanded:not\(\.is-page-sheet\) :deep\(\.ProseMirror\) \{[^}]*padding:\s*16px max\(14px, var\(--rte-gutter-size\)\) 48px;/,
)
// A4 纸张：窄边距也要留出手柄列，虚线框与正文起点对齐。
assert.match(
  globalCss,
  /\.rte-root\.is-page-sheet \.rte-body \{[^}]*padding-left:\s*max\(var\(--rte-margin-left, 31\.8mm\), var\(--rte-gutter-size, 26px\)\);/,
)
assert.match(
  globalCss,
  /\.rte-root\.is-page-sheet \.rte-body::before \{[^}]*inset:[^;]*max\(var\(--rte-margin-left, 31\.8mm\), var\(--rte-gutter-size, 26px\)\);/,
)
// 手柄容器不得拦截正文点击，只有按钮本身可点。
assert.match(scopedCss, /\.rte-block-tools \{[^}]*pointer-events:\s*none;/)
assert.match(scopedCss, /\.rte-block-handle \{[^}]*pointer-events:\s*auto;/)

console.log('rte gutter ok')
