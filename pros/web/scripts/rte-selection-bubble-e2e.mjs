/**
 * 选区浮动工具条（跨段落选区 + 气泡工具条）e2e。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5175）。
 * 输出：RTE_BASELINE_DIR（默认 /workspace/outputs/metamatrix/shots/rte-selection-bubble）。
 *
 * 截图内容：
 * 1. 跨两段拖选后选区气泡工具条可见（1440×900）；
 * 2. 在气泡里改字号后，两段的字号都变了；
 * 3. 代码块 / 图表块 / 空选区内气泡不出现；
 * 4. 选区贴近视口上边缘时气泡自动翻转到下方。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.RTE_BASELINE_DIR || '/workspace/outputs/metamatrix/shots/rte-selection-bubble'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5175'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`)
}

await page.goto(`${web}/selection-bubble-preview.html`, {
  waitUntil: 'commit',
  timeout: 120000,
})
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 90000 })
await page.waitForTimeout(1500)

/** 气泡工具条是否可见（元素存在且可见）。 */
const bubbleVisible = async () => {
  const el = page.locator('.rte-selection-bubble')
  if ((await el.count()) === 0) return false
  return await el.first().isVisible()
}

/** 拖选：从第 from 段开头拖到第 to 段结尾。 */
const dragSelectParagraphs = async (from, to) => {
  const boxes = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.rte-body .ProseMirror > p')]
    return ps.map((p) => {
      const r = p.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
  })
  const a = boxes[from]
  const b = boxes[to]
  await page.mouse.move(a.left + 2, a.top + 8)
  await page.mouse.down()
  await page.mouse.move(a.left + 40, a.top + 10, { steps: 6 })
  await page.mouse.move(b.right - 4, b.bottom - 6, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}

/** 编辑器里的选区文本。 */
const selectionText = async () =>
  await page.evaluate(() => {
    const ed = window.__rte?.editor
    if (!ed) return ''
    return ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, ' ')
  })

/** 选区覆盖的顶层块数量。 */
const selectedBlockCount = async () =>
  await page.evaluate(() => {
    const ed = window.__rte?.editor
    if (!ed) return 0
    const { from, to } = ed.state.selection
    const names = new Set()
    ed.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
      if (parent && parent.type.name === 'doc') names.add(node.type.name)
      return true
    })
    return names.size
  })

// —— 1. 跨两段拖选：气泡可见 ——
await dragSelectParagraphs(0, 1)
const text = await selectionText()
log('跨两段拖选能选中两段文字', text.includes('第一段落') && text.includes('第二段落'), text.slice(0, 60))
const blockCount = await selectedBlockCount()
log('选区覆盖 2 个顶层块', blockCount === 2, `${blockCount} 个`)
log('选区气泡工具条可见', await bubbleVisible())

const required = [
  ['字体', 'aria-label="字体"'],
  ['字号', 'aria-label="字号"'],
  ['加粗', 'aria-label="加粗"'],
  ['斜体', 'aria-label="斜体"'],
  ['下划线', 'aria-label="下划线"'],
  ['删除线', 'aria-label="删除线"'],
  ['文字颜色', 'aria-label="文字颜色"'],
  ['高亮颜色', 'aria-label="高亮颜色"'],
  ['清除格式', 'aria-label="清除格式"'],
  ['链接', 'aria-label="插入链接"'], // 已有链接时是「编辑链接」
  ['对齐', 'aria-label="对齐"'],
]
for (const [name, selector] of required) {
  const count = await page.locator(`.rte-selection-bubble ${selector}`).count()
  log(`气泡含「${name}」`, count > 0, `${count} 个`)
}

await page.screenshot({ path: `${out}/01-cross-paragraph-selection-bubble.png` })

// —— 2. 气泡里改字号：两段都生效 ——
await page.locator('.rte-selection-bubble [aria-label="字号"]').click()
await page.waitForTimeout(300)
const sizePanel = page.locator('.rte-selection-bubble .rte-bubble-panel-size')
log('字号下拉面板展开', await sizePanel.isVisible())
await page.locator('.rte-selection-bubble .rte-bubble-panel-size button', { hasText: '20px' }).first().click()
await page.waitForTimeout(600)

const sizes = await page.evaluate(() => {
  const ed = window.__rte?.editor
  if (!ed) return []
  const out = []
  ed.state.doc.forEach((node) => {
    let size = ''
    node.forEach((child) => {
      for (const mark of child.marks || []) {
        if (mark.type.name === 'textStyle' && mark.attrs.fontSize) size = mark.attrs.fontSize
      }
    })
    out.push(size)
  })
  return out
})
log('第一段字号变为 20px', sizes[0] === '20px', String(sizes[0]))
log('第二段字号变为 20px', sizes[1] === '20px', String(sizes[1]))
log('未选中的第三段字号未变', !sizes[2], String(sizes[2] || '(无)'))
await page.screenshot({ path: `${out}/02-font-size-applied-to-both-paragraphs.png` })

// —— 3. 代码块内不出现 ——
const codeSel = await page.evaluate(() => {
  const code = document.querySelector('.rte-body .ProseMirror pre')
  if (!code) return null
  const r = code.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
})
if (codeSel) {
  await page.mouse.move(codeSel.left + 10, codeSel.top + 10)
  await page.mouse.down()
  await page.mouse.move(codeSel.right - 20, codeSel.bottom - 6, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  log('代码块内不出现气泡', !(await bubbleVisible()))
  await page.screenshot({ path: `${out}/03-code-block-no-bubble.png` })
} else {
  log('代码块内不出现气泡', false, '没找到代码块')
}

// —— 4. 图表块内不出现 ——
const chartSel = await page.evaluate(() => {
  const chart = document.querySelector('.rte-body .ProseMirror [data-type="echarts-block"]')
  if (!chart) return null
  const r = chart.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
})
if (chartSel) {
  await page.mouse.click(chartSel.left + chartSel.right / 2, chartSel.top + 20)
  await page.waitForTimeout(600)
  log('图表块内不出现气泡', !(await bubbleVisible()))
  await page.screenshot({ path: `${out}/04-chart-block-no-bubble.png` })
} else {
  log('图表块内不出现气泡', false, '没找到图表块')
}

// —— 5. 空选区不出现 ——
await page.mouse.click(400, 60)
await page.waitForTimeout(500)
log('空选区不出现气泡', !(await bubbleVisible()))

// —— 6. 贴近视口上边缘时气泡翻转 ——
await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.rte-body .ProseMirror > p')]
  ps[0]?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(400)
await dragSelectParagraphs(0, 0)
const flip = await page.evaluate(() => {
  const bubble = document.querySelector('.rte-selection-bubble')
  const sel = window.getSelection()
  if (!bubble || !sel || sel.rangeCount === 0) return null
  const b = bubble.getBoundingClientRect()
  const r = sel.getRangeAt(0).getBoundingClientRect()
  return { bubbleTop: b.top, bubbleBottom: b.bottom, selTop: r.top, selBottom: r.bottom }
})
log(
  '贴近上边缘时气泡翻转到选区下方',
  !!flip && flip.bubbleTop >= flip.selBottom - 2,
  flip ? `bubble.top=${Math.round(flip.bubbleTop)} sel.bottom=${Math.round(flip.selBottom)}` : '没拿到选区',
)
await page.screenshot({ path: `${out}/05-bubble-flip-near-top.png` })

await browser.close()

const failed = notes.filter((n) => !n.ok)
console.log(`\n== 汇总：${notes.length - failed.length}/${notes.length} 通过 ==`)
if (pageErrors.length) {
  console.log('\n页面错误：')
  for (const e of pageErrors.slice(0, 10)) console.log(' -', e)
}
if (failed.length) {
  console.log('\n未通过：')
  for (const f of failed) console.log(' -', f.step, f.detail ?? '')
  process.exitCode = 1
}
