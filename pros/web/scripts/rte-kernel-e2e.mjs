/**
 * 编辑内核浏览器验收：输入、加粗、选区、撤销，以及带脚本的粘贴。
 * 按键是 Playwright 派发的，不是系统输入法。
 * 用法：vite 在 5173，然后 node scripts/rte-kernel-e2e.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const fail = (step, detail) => {
  console.log(`FAIL ${step} — ${detail}`)
  throw new Error(`${step}: ${detail}`)
}
const pass = (step, detail = '') => console.log(`PASS ${step}${detail ? ` — ${detail}` : ''}`)

await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 20000 })

const paragraph = page.locator('.ProseMirror p').last()
await paragraph.click()
await page.keyboard.type('内核样本')
const bold = await page.evaluate(() => {
  const ed = window.__rte.editor
  let found = null
  ed.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return
    const at = node.text.indexOf('内核样本')
    if (at >= 0) found = { from: pos + at, to: pos + at + 4 }
  })
  ed.commands.setTextSelection(found)
  const down = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, bubbles: true, cancelable: true })
  const handled = ed.view.someProp('handleKeyDown', (fn) => fn(ed.view, down))
  const { from, to, empty } = ed.state.selection
  return {
    handled,
    htmlHas: ed.getHTML().includes('<strong>内核样本</strong>'),
    from,
    to,
    empty,
    text: ed.state.doc.textBetween(from, to, ''),
  }
})
if (!bold.handled || !bold.htmlHas || bold.empty || bold.text !== '内核样本') fail('加粗选区', JSON.stringify(bold))
pass('页面内 Ctrl+B 加粗后选区仍覆盖刚输入的文字', bold.text)

const undone = await page.evaluate(() => {
  const ed = window.__rte.editor
  const down = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })
  const handled = ed.view.someProp('handleKeyDown', (fn) => fn(ed.view, down))
  return { handled, html: ed.getHTML() }
})
if (!undone.handled || undone.html.includes('<strong>内核样本</strong>')) fail('撤销', JSON.stringify(undone).slice(0, 300))
pass('页面内 Ctrl+Z 去掉这次加粗')
const redone = await page.evaluate(() => {
  const ed = window.__rte.editor
  const down = new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  const handled = ed.view.someProp('handleKeyDown', (fn) => fn(ed.view, down))
  return { handled, html: ed.getHTML() }
})
if (!redone.handled || !redone.html.includes('<strong>内核样本</strong>')) fail('重做', JSON.stringify(redone).slice(0, 300))
pass('页面内 Ctrl+Shift+Z 恢复加粗')

const pasted = await page.evaluate(() => {
  const ed = window.__rte.editor
  ed.commands.focus('end')
  const dt = new DataTransfer()
  dt.setData(
    'text/html',
    '<script>alert(1)</script><p><strong>可编辑粘贴</strong></p><a href="javascript:alert(1)">坏链</a>',
  )
  dt.setData('text/plain', '可编辑粘贴')
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
  ed.view.dom.dispatchEvent(event)
  const html = ed.getHTML()
  return { html, hasStrong: html.includes('可编辑粘贴'), hasScript: /<script|javascript:/i.test(html) }
})
if (!pasted.hasStrong || pasted.hasScript) fail('粘贴清洗', JSON.stringify(pasted).slice(0, 400))
pass('粘贴保留加粗并滤掉脚本')

const round = await page.evaluate(() => {
  const ed = window.__rte.editor
  const first = ed.getHTML()
  ed.commands.setContent(first)
  const second = ed.getHTML()
  ed.commands.setContent(second)
  return { stable: ed.getHTML() === second, hasPaste: second.includes('可编辑粘贴'), hasSample: second.includes('内核样本') }
})
if (!round.stable || !round.hasPaste || !round.hasSample) fail('回显', JSON.stringify(round))
pass('再加载两次后 HTML 稳定')

await page.screenshot({ path: path.join(outDir, 'rte-kernel-paste.png') })
await browser.close()
console.log('e2e ok')
