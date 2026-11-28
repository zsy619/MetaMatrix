import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  blockHandleLeft,
  blockHandleRight,
  RTE_BLOCK_TOOLS_WIDTH,
  RTE_HANDLE_TEXT_GAP,
} from './rteGutter.ts'

// —— 尺寸常量：左侧只留一个「+」按钮 ——
assert.equal(RTE_BLOCK_TOOLS_WIDTH, 22) // 只有一个「+」按钮(22)

/**
 * 三种版式下手柄都不与首字重叠：
 * 恒有 handle.right <= 正文内容左边界 - 手柄与正文间距。
 */
const cases = [
  {
    name: '展开态·纸卡片（画布左内边距 32 + 卡片左内边距 74）',
    canvasLeft: 0,
    contentLeft: 32 + 74,
  },
  {
    name: '展开态·A4 纸张窄边距（纸内左内边距 74）',
    canvasLeft: 0,
    contentLeft: 74,
  },
  {
    name: '紧凑态·普通面板（画布左内边距 14 + 正文左内边距 50）',
    canvasLeft: 0,
    contentLeft: 14 + 50,
  },
  {
    name: '铺满版式（正文左内边距 74）',
    canvasLeft: 0,
    contentLeft: 74,
  },
]

for (const item of cases) {
  const left = blockHandleLeft(item.contentLeft, item.canvasLeft)
  const right = blockHandleRight(left)
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
  const contentLeft = canvasLeft + 32 + 74
  const left = blockHandleLeft(contentLeft, canvasLeft)
  const right = blockHandleRight(left)
  assert.equal(left, 80) // 106 - 按钮 22 - 正文间距 4
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

// 留白宽度：紧凑态 50px（两个按钮），展开态 74px（三个按钮 + 间距）。
assert.match(scopedCss, /\.rte-root \{[^}]*--rte-gutter-size:\s*50px;/)
assert.match(scopedCss, /\.rte-root\.expanded \{[^}]*--rte-gutter-size:\s*74px;/)
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
// A4 纸张：左右留白只按页边距走，不再被「块手柄列」撑宽（手柄列落在左侧页边距里），
// 保证左右留白与底边距一致、纸张四边对称。
assert.match(
  globalCss,
  /\.rte-root\.is-page-sheet \.rte-body \{[^}]*padding-left:\s*max\(var\(--rte-margin-left, 25\.4mm\), 26px\);/,
)
assert.match(
  globalCss,
  /\.rte-root\.is-page-sheet \.rte-body \{[^}]*padding-right:\s*var\(--rte-margin-right, 25\.4mm\);/,
)
assert.match(
  globalCss,
  /\.rte-root\.is-page-sheet \.rte-body::before \{[^}]*inset:[^;]*max\(var\(--rte-margin-left, 25\.4mm\), 26px\);/,
)
assert.doesNotMatch(globalCss, /\.rte-root\.is-page-sheet \.rte-body \{[^}]*padding-left:[^;]*--rte-gutter-size/)
// 手柄容器不得拦截正文点击，只有按钮本身可点。
assert.match(scopedCss, /\.rte-block-tools \{[^}]*pointer-events:\s*none;/)
assert.match(scopedCss, /\.rte-block-handle \{[^}]*pointer-events:\s*auto;/)

// —— 左侧只保留「+」一个按钮：DOM 里不能再出现第二个手柄按钮 ——
const bodyVue = readFileSync(
  new URL('../components/rte/RteDocumentBody.vue', import.meta.url),
  'utf8',
)
assert.equal(
  bodyVue.split('class="rte-block-handle').length - 1,
  1,
  '左侧手柄只能有一个「+」按钮',
)
assert.ok(!bodyVue.includes('rte-block-actions'), '「⋮」按钮应当并入「+」的下拉面板')
// 「+」的美化：悬停背景、图标浮起、焦点环。
assert.match(scopedCss, /\.rte-block-add:hover \{[^}]*background:\s*#eef0f3;/)
assert.match(scopedCss, /\.rte-block-add:focus-visible \{[^}]*box-shadow:/)
assert.match(scopedCss, /\.rte-block-add:hover svg \{[^}]*transform:\s*scale\(/)

console.log('rte gutter ok')
