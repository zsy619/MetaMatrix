/**
 * 公式、表格、页面设置：1440 / 1280 / 390。
 * 取消不改正文；非法输入不提交；确认后公式和表格可撤销，页面设置可经编辑器 Ctrl+Z 撤销。
 * 用法：vite 在 5173，然后 node scripts/rte-core-dialogs-e2e.mjs
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

async function fit(page, dialog, viewport, label) {
  const box = await dialog.boundingBox()
  if (!box) fail(label, '没有盒子')
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    fail(label + ' 溢出', JSON.stringify({ box, viewport }))
  }
  const shot = path.join(outDir, `rte-dialog-${label}.png`)
  await page.screenshot({ path: shot })
  pass(label + ' 在视口内', shot)
}

async function focusInside(page, selector) {
  return page.evaluate((sel) => {
    const active = document.activeElement
    return !!active?.closest?.(sel)
  }, selector)
}

async function openTableDialog(page) {
  const modal = page.locator('.rte-table-dialog')
  if (await modal.isVisible().catch(() => false)) return modal
  await clickNamed(page, '表格')
  if (await modal.isVisible().catch(() => false)) return modal
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('自定义尺寸'))
    btn?.click()
    return !!btn
  })
  if (!clicked) fail('表格', '没有自定义尺寸，弹窗也没开')
  await modal.waitFor({ state: 'visible', timeout: 8000 })
  return modal
}

async function editorShortcut(page, shift) {
  return page.evaluate((shiftKey) => {
    const view = window.__rte.editor.view
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      shiftKey,
      bubbles: true,
      cancelable: true,
    })
    return view.someProp('handleKeyDown', (fn) => fn(view, event)) === true
  }, shift)
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
  const before = await page.evaluate(() => window.__rte.editor.getHTML())

  await clickNamed(page, '公式')
  const formula = page.getByRole('dialog', { name: '公式编辑器' })
  await formula.waitFor({ state: 'visible' })
  if (!(await focusInside(page, '[aria-label="公式编辑器"]'))) fail(`${viewport.name} 公式焦点`, '没有进弹窗')
  await page.keyboard.press('Tab')
  if (!(await focusInside(page, '[aria-label="公式编辑器"]'))) fail(`${viewport.name} 公式 Tab`, '焦点离开了弹窗')
  await fit(page, formula, viewport, `formula-${viewport.name}`)
  await page.keyboard.press('Escape')
  await formula.waitFor({ state: 'hidden' })
  const backFormula = await page.evaluate(() => {
    const active = document.activeElement
    if (active?.closest?.('.ProseMirror')) return 'editor'
    return active?.getAttribute?.('aria-label') || active?.textContent || ''
  })
  if (!String(backFormula).includes('公式') && backFormula !== 'editor' && !String(backFormula).includes('更多格式与插入')) {
    fail(`${viewport.name} 公式回焦`, String(backFormula))
  }

  const table = await openTableDialog(page)
  if (!(await focusInside(page, '.rte-table-dialog'))) fail(`${viewport.name} 表格焦点`, '没有进弹窗')
  await page.keyboard.press('Tab')
  if (!(await focusInside(page, '.rte-table-dialog'))) fail(`${viewport.name} 表格 Tab`, '焦点离开了弹窗')
  await fit(page, table, viewport, `table-${viewport.name}`)
  await page.keyboard.press('Escape')
  await table.waitFor({ state: 'hidden' })

  await page.getByRole('button', { name: '页面设置' }).click()
  const setup = page.getByRole('dialog', { name: '页面设置' })
  await setup.waitFor({ state: 'visible' })
  if (!(await focusInside(page, '[aria-label="页面设置"]'))) fail(`${viewport.name} 页面设置焦点`, '没有进弹窗')
  await page.keyboard.press('Tab')
  if (!(await focusInside(page, '[aria-label="页面设置"]'))) fail(`${viewport.name} 页面设置 Tab`, '焦点离开了弹窗')
  await fit(page, setup, viewport, `pagesetup-${viewport.name}`)
  await page.keyboard.press('Escape')
  await setup.waitFor({ state: 'hidden' })
  const after = await page.evaluate(() => window.__rte.editor.getHTML())
  if (after !== before) fail(`${viewport.name} 取消改了正文`, after.slice(0, 160))
  pass(`${viewport.name} 三个弹窗 Esc 关闭且正文不变`)
  await page.close()
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
const before = await page.evaluate(() => window.__rte.editor.getHTML())

await clickNamed(page, '公式')
const formula = page.getByRole('dialog', { name: '公式编辑器' })
await formula.locator('textarea').fill('\\frac{')
await formula.getByRole('button', { name: '确认' }).click()
if (!(await formula.isVisible())) fail('非法公式', '弹窗被关掉了')
const err = await formula.locator('.is-error').textContent()
if (!err || !err.trim()) fail('非法公式', '没有错误说明')
const mid = await page.evaluate(() => window.__rte.editor.getHTML())
if (mid !== before) fail('非法公式写入了正文', mid.slice(0, 120))
pass('非法公式不提交', err.trim().slice(0, 80))

await formula.locator('textarea').fill('E=mc^2')
await page.locator('.rte-formula-preview .katex').waitFor({ state: 'visible', timeout: 4000 })
pass('公式弹窗里能渲染')
await page.locator('.rte-modal-overlay').last().click({ position: { x: 8, y: 8 } })
if (!(await formula.isVisible())) fail('公式遮罩', '未提交的公式被关掉了')
if ((await formula.locator('textarea').inputValue()) !== 'E=mc^2') fail('公式遮罩', '草稿丢了')
pass('公式有草稿时遮罩不关')
await formula.getByRole('button', { name: '确认' }).click()
await formula.waitFor({ state: 'hidden' })
const withFormula = await page.evaluate(() => window.__rte.editor.getHTML())
if (!withFormula.includes('data-tex="E=mc^2"')) fail('公式插入', withFormula.slice(-240))
if ((await page.locator('.ProseMirror .katex').count()) < 1) fail('公式渲染', '正文里没有 KaTeX')
pass('公式确认后进入正文并渲染')

const table = await openTableDialog(page)
await table.locator('input[type="number"]').first().fill('0')
const hint = await table.locator('.is-error').textContent()
if (!hint || !hint.includes('行数')) fail('表格非法行数', hint || '')
const rowValue = await table.locator('input[type="number"]').first().inputValue()
if (rowValue === '0') fail('表格非法行数', '0 还留在输入框里')
pass('超出范围的行数有说明且不按 0 插入', hint.trim())
await table.locator('input[type="number"]').first().fill('4')
await page.locator('.rte-modal-overlay').last().click({ position: { x: 8, y: 8 } })
if (!(await table.isVisible())) fail('表格遮罩', '改过尺寸仍被关掉')
pass('表格改过尺寸时遮罩不关')
await table.getByRole('button', { name: '插入' }).click()
await table.waitFor({ state: 'hidden' })
const withTable = await page.evaluate(() => window.__rte.editor.getHTML())
if (!withTable.includes('<table')) fail('表格插入', withTable.slice(-200))
const rowCount = await page.locator('.ProseMirror table tr').count()
if (rowCount !== 4) fail('表格行数', String(rowCount))
pass('表格确认后按 4 行进入正文')

await page.evaluate(() => {
  window.__rte.editor.commands.undo()
  window.__rte.editor.commands.undo()
})
const undone = await page.evaluate(() => window.__rte.editor.getHTML())
if (undone.includes('<table') || undone.includes('data-tex="E=mc^2"')) fail('撤销', undone.slice(-240))
await page.evaluate(() => {
  window.__rte.editor.commands.redo()
  window.__rte.editor.commands.redo()
})
const redone = await page.evaluate(() => window.__rte.editor.getHTML())
if (!redone.includes('<table') || !redone.includes('data-tex="E=mc^2"')) fail('重做', redone.slice(-240))
await page.evaluate(() => {
  window.__rte.editor.commands.undo()
  window.__rte.editor.commands.undo()
})
pass('撤销和重做覆盖表格与公式')

await page.getByRole('button', { name: '页面设置' }).click()
const setup = page.getByRole('dialog', { name: '页面设置' })
await setup.locator('input[placeholder="每页顶部的内容"]').fill('不要的页眉')
await setup.getByRole('button', { name: '取消' }).click()
await setup.waitFor({ state: 'hidden' })
if ((await page.locator('.rte-page-header').count()) && (await page.locator('.rte-page-header').innerText()).includes('不要的页眉')) {
  fail('页面设置取消', '取消仍写入了页眉')
}
pass('页面设置取消不改页眉')

await page.getByRole('button', { name: '页面设置' }).click()
await setup.locator('input[placeholder="每页顶部的内容"]').fill('验收页眉')
await page.locator('.rte-modal-overlay').last().click({ position: { x: 8, y: 8 } })
if (!(await setup.isVisible())) fail('页面设置遮罩', '未确认的页眉被关掉了')
if ((await setup.locator('input[placeholder="每页顶部的内容"]').inputValue()) !== '验收页眉') fail('页面设置遮罩', '草稿丢了')
pass('页面设置有草稿时遮罩不关')
const size = await setup.locator('select').first().inputValue()
if (size !== 'a4') fail('页面设置', '默认页面大小被改成 ' + size)
await setup.getByRole('button', { name: '确认' }).click()
await setup.waitFor({ state: 'hidden' })
const header = await page.locator('.rte-page-header').innerText()
if (!header.includes('验收页眉')) fail('页面设置', '页眉没有出现：' + header)
const savedSize = await page.locator('select[aria-label="页面大小"]').inputValue()
if (savedSize !== 'a4') fail('页面设置', '确认页眉后页面大小变成 ' + savedSize)
pass('页面设置确认后出现页眉且仍是 A4')

if (!(await editorShortcut(page, false))) fail('页面设置撤销', 'Ctrl+Z 没有被编辑器接住')
if ((await page.locator('.rte-page-header').count()) && (await page.locator('.rte-page-header').innerText()).includes('验收页眉')) {
  fail('页面设置撤销', '页眉还在')
}
if (!(await editorShortcut(page, true))) fail('页面设置重做', 'Ctrl+Shift+Z 没有被编辑器接住')
const again = await page.locator('.rte-page-header').innerText()
if (!again.includes('验收页眉')) fail('页面设置重做', again)
pass('页面设置确认后可以撤销并重做')

await page.locator('.ProseMirror p').last().click()
await page.keyboard.type('还能编辑')
const tail = await page.evaluate(() => window.__rte.editor.getHTML())
if (!tail.includes('还能编辑')) fail('回焦', tail.slice(-120))
pass('关闭页面设置后还能编辑')
await page.screenshot({ path: path.join(outDir, 'rte-core-dialogs-applied.png') })

await page.evaluate(() => localStorage.removeItem('mm.rte.viewPrefs.v1:code-gap-preview-panel'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
await page.getByRole('button', { name: '视图', exact: true }).click()
await page.getByRole('button', { name: '暗色编辑区' }).click()
await page.getByRole('button', { name: '专注模式' }).click()
if ((await page.locator('.rte-root.is-dark-editor').count()) !== 1) fail('暗色', '没有加上')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
if ((await page.locator('.rte-root.is-dark-editor').count()) !== 1) fail('暗色重开', '刷新后丢了')
if ((await page.locator('.rte-root.is-focus-mode').count()) !== 0) fail('专注模式', '会话开关被写进了偏好')
if ((await page.locator('select[aria-label="页面大小"]').inputValue()) !== 'a4') fail('暗色', '改了页面大小')
pass('暗色按面板记住，专注模式不记，页面大小仍是 A4')

await page.locator('[title="编辑区缩放"]').click()
await page.getByRole('button', { name: '125%', exact: true }).click()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
const zoomLabel = await page.locator('[title="编辑区缩放"]').innerText()
if (!zoomLabel.includes('125%')) fail('缩放重开', zoomLabel)
pass('缩放重开仍是 125%')

await page.evaluate(() => window.__rte.editor.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run())
await clickNamed(page, '表格')
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('表头冻结')),
  null,
  { timeout: 4000 },
)
const stickyClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('表头冻结'))
  btn?.click()
  return !!btn
})
if (!stickyClicked) fail('表头冻结', '菜单里没有开关')
if ((await page.locator('.rte-root.is-table-sticky').count()) !== 1) fail('表头冻结', '没有加上')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })
if ((await page.locator('.rte-root.is-table-sticky').count()) !== 1) fail('表头冻结重开', '刷新后丢了')
if ((await page.locator('select[aria-label="页面大小"]').inputValue()) !== 'a4') fail('表头冻结', '改了页面大小')
const other = await page.evaluate(() => localStorage.getItem('mm.rte.viewPrefs.v1:other-panel'))
if (other) fail('面板隔离', other)
pass('表头冻结重开仍在，且没有写到别的面板')

await browser.close()
console.log('e2e ok')
