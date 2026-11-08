/**
 * 表格合并、拆分、列宽、单元格背景。
 * 1440 / 1280 / 390 都能从菜单点到，不溢出；撤销重做和 setContent 重载保持结构。
 * 用法：vite 在 5173，然后 node scripts/rte-table-ops-e2e.mjs
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const { chromium } = pw
const outDir = process.env.RTE_SHOT_DIR || '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const fail = (step, detail) => {
  console.log(`FAIL ${step} — ${detail}`)
  throw new Error(`${step}: ${detail}`)
}
const pass = (step, detail = '') => console.log(`PASS ${step}${detail ? ` — ${detail}` : ''}`)

async function clickNamed(page, name) {
  const button = page.getByRole('button', { name, exact: true })
  if (!(await button.first().isVisible())) {
    const more = page.getByRole('button', { name: '更多格式与插入' })
    if (await more.isVisible()) await more.click()
  }
  await button.first().click()
}

async function prepareTable(page) {
  await page.evaluate(() => {
    const ed = window.__rte.editor
    ed.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
    const cellAt = (row, col) => {
      let found = -1
      ed.state.doc.descendants((node, pos) => {
        if (found >= 0 || node.type.name !== 'table') return false
        let at = pos + 1
        for (let r = 0; r < row; r += 1) at += node.child(r).nodeSize
        at += 1
        const rowNode = node.child(row)
        for (let c = 0; c < col; c += 1) at += rowNode.child(c).nodeSize
        found = at
        return false
      })
      return found
    }
    const anchor = cellAt(1, 0)
    const head = cellAt(1, 1)
    const dragged = ed.commands.setCellSelection({ anchorCell: anchor, headCell: head })
    if (!dragged) throw new Error('无法选中两个单元格')
  })
  await page.waitForTimeout(600)
}

async function openOps(page) {
  await clickNamed(page, '表格')
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('合并单元格')),
    null,
    { timeout: 4000 },
  )
  return page.evaluate(() => {
    const menu = document.querySelector('.rte-table-ops-sheet') || document.querySelector('.rte-table-menu')
    if (!menu) return null
    const rect = menu.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

async function clickInOpenMenu(page, label) {
  const clicked = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === name || el.getAttribute('title') === name)
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  }, label)
  if (!clicked) fail('菜单点击', label)
}

async function inside(page, box, viewport, label) {
  if (!box) fail(label, '没有盒子')
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    fail(label + ' 溢出', JSON.stringify({ box, viewport }))
  }
}

const viewports = [
  { width: 1440, height: 900, name: '1440' },
  { width: 1280, height: 800, name: '1280' },
  { width: 390, height: 700, name: '390' },
]

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
  await prepareTable(page)
  const host = await openOps(page)
  await inside(page, host, viewport, `${viewport.name} 表格菜单`)
  const shot = path.join(outDir, `rte-table-ops-${viewport.name}.png`)
  await page.screenshot({ path: shot })
  await clickInOpenMenu(page, '合并单元格')
  const merged = await page.evaluate(() => window.__rte.editor.getHTML())
  if (!merged.includes('colspan="2"')) fail(`${viewport.name} 合并`, merged.slice(-180))
  await page.locator('[title^="撤销"]').click()
  const undone = await page.evaluate(() => window.__rte.editor.getHTML())
  if (!undone.includes('<table') || undone.includes('colspan="2"')) fail(`${viewport.name} 撤销合并`, undone.slice(-120))
  await page.locator('[title^="重做"]').click()
  const redone = await page.evaluate(() => window.__rte.editor.getHTML())
  if (!redone.includes('colspan="2"')) fail(`${viewport.name} 重做合并`, redone.slice(-120))
  await page.locator('[title^="撤销"]').click()

  await prepareTable(page)
  await openOps(page)
  await clickInOpenMenu(page, '浅蓝')
  const colored = await page.evaluate(() => window.__rte.editor.getHTML())
  if (!colored.includes('data-bg="#eff6ff"')) fail(`${viewport.name} 背景`, colored.slice(-200))
  await page.locator('[title^="撤销"]').click()
  const cleared = await page.evaluate(() => window.__rte.editor.getHTML())
  if (cleared.includes('data-bg="#eff6ff"')) fail(`${viewport.name} 撤销背景`, '颜色还在')

  const box = await page.evaluate(() => {
    const cell = document.querySelector('.ProseMirror th, .ProseMirror td')
    if (!(cell instanceof HTMLElement)) return null
    const toolbar = document.querySelector('.rte-toolbar')
    const clear = (toolbar?.getBoundingClientRect().bottom || 0) + 16
    const before = cell.getBoundingClientRect()
    document.documentElement.scrollTop += before.y - clear
    const rect = cell.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  if (!box) {
    const html = await page.evaluate(() => window.__rte.editor.getHTML())
    fail(`${viewport.name} 列宽`, html.slice(0, 180))
  }
  await page.mouse.move(box.x + box.width - 3, box.y + Math.min(12, box.height / 2))
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 48, box.y + Math.min(12, box.height / 2), { steps: 8 })
  await page.mouse.up()
  const widened = await page.evaluate(() => window.__rte.editor.getHTML())
  const width = widened.match(/colwidth="(\d+)"/)
  if (!width) fail(`${viewport.name} 列宽`, widened.slice(0, 240))
  await page.evaluate((html) => window.__rte.editor.commands.setContent(html), widened)
  const reloaded = await page.evaluate(() => window.__rte.editor.getHTML())
  if (!reloaded.includes(`colwidth="${width[1]}"`) || !reloaded.includes('<table')) {
    fail(`${viewport.name} 重载`, reloaded.slice(0, 240))
  }
  pass(`${viewport.name} 合并撤销、背景、列宽重载`, shot)
  await page.close()
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
const inserted = await page.evaluate(() => window.__rte.editor.chain().focus('end').insertEchartsBlock().run())
if (!inserted) fail('图表', '插不进去')
const before = await page.evaluate(() => {
  let raw = ''
  window.__rte.editor.state.doc.descendants((node) => {
    if (node.type.name === 'echartsBlock') raw = node.attrs.option || ''
  })
  return raw
})
await page.getByRole('button', { name: '视图', exact: true }).click()
await page.getByRole('button', { name: '暗色编辑区' }).click()
await page.waitForTimeout(400)
const after = await page.evaluate(() => {
  let raw = ''
  window.__rte.editor.state.doc.descendants((node) => {
    if (node.type.name === 'echartsBlock') raw = node.attrs.option || ''
  })
  return raw
})
if (after !== before) fail('图表暗色', '保存的 option 被改了')
const paint = await page.evaluate(() => {
  const svg = document.querySelector('.rte-echarts-preview svg')
  if (!svg) return ''
  return svg.innerHTML.slice(0, 400)
})
if (!paint.includes('#1d2129') && !paint.toLowerCase().includes('1d2129')) {
  fail('图表暗色', paint.slice(0, 180) || '没有 SVG')
}
pass('暗色编辑区默认图表用深底，option 原文不变')
await page.screenshot({ path: path.join(outDir, 'rte-chart-dark.png') })
await browser.close()
console.log('e2e ok')
