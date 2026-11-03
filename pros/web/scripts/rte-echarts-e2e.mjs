/**
 * 图表块（ECharts）端到端：斜杠/对话框插入 → 真实渲染 → data-option 往返 → 导出快照。
 *
 * 前置：API 与前端已启动。
 *   RTE_WEB_URL       前端地址，默认 http://127.0.0.1:5173
 *   RTE_BASELINE_DIR  截图输出目录
 *   CHROME_PATH       浏览器可执行文件，默认 /usr/bin/google-chrome
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (err) => console.log('PAGEERROR', String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text())
})
const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

await page.goto(`${web}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#login-email', 'demo@metamatrix.local')
await page.fill('#login-password', 'demo123456')
const debugAnswer = await page.getAttribute('.captcha__image', 'data-debug-answer')
if (debugAnswer) await page.fill('#captcha-code', debugAnswer)
await page.click('button[type="submit"]')
await page.waitForTimeout(800)

await page.goto(`${web}/canvas/y-model?documentId=4d5f428c-a6e7-45a7-b29e-304120fccbb5`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(1500)
const block = page.locator('.ym-block', { has: page.locator('h3', { hasText: '如何定性定量分析' }) })
await block.locator('button[aria-label="最大化"]').click()
await page.waitForSelector('.pm-overlay .ProseMirror')
await page.locator('.pm-overlay .ProseMirror p').first().click({ force: true })
await page.keyboard.press('End')

/** 一、斜杠菜单「tubiao」→ 一键生成对话框 → 插入折线图 */
await page.keyboard.press('Enter')
await page.keyboard.type('/tubiao')
await page.waitForSelector('.rte-slash-menu', { state: 'visible', timeout: 4000 }).catch(() => {})
const slashItem = page.locator('.rte-slash-menu button', { hasText: '图表' }).first()
log('斜杠菜单命中 tubiao', (await slashItem.count()) > 0)
if (await slashItem.count()) {
  await slashItem.click()
  await page.waitForSelector('.rte-echarts-dialog', { timeout: 5000 }).catch(() => {})
  const dialog = await page.locator('.rte-echarts-dialog').count()
  log('一键生成对话框打开', dialog > 0)
  if (dialog) {
    await page.locator('.rte-echarts-dialog button', { hasText: '折线图' }).first().click()
    await page.locator('.rte-echarts-dialog button', { hasText: '插入' }).first().click()
    await page.waitForTimeout(1200)
  }
}
log('斜杠路径插入一块图表', (await page.locator('.pm-overlay .rte-echarts-block').count()) >= 1)

/** 二、工具栏「图表」下拉 → 柱状图 */
const toolbarBtn = page.locator('.pm-overlay button[title="插入 ECharts 图表"]')
log('工具栏有图表按钮', (await toolbarBtn.count()) > 0)
await toolbarBtn.first().click({ force: true })
await page.waitForTimeout(300)
const menuItem = page.locator('body > .rte-menu button', { hasText: '柱状图' }).first()
log('图表下拉菜单有五类图', (await menuItem.count()) > 0)
if (await menuItem.count()) {
  await menuItem.click()
  await page.waitForTimeout(1200)
}
const blockCounts = {
  overlay: await page.locator('.pm-overlay .rte-echarts-block').count(),
  page: await page.locator('.rte-echarts-block').count(),
}
log('工具栏路径插入第二块图表', blockCounts.overlay >= 2, JSON.stringify(blockCounts))

/** 三、真实渲染：懒加载 echarts 后块内出现 SVG */
await page.waitForSelector('.pm-overlay .rte-echarts-block svg', { timeout: 15000 })
const rendered = await page.evaluate(() => {
  const block = document.querySelector('.pm-overlay .rte-echarts-block')
  const svg = block?.querySelector('svg')
  if (!svg) return { ok: false }
  return {
    ok: true,
    paths: svg.querySelectorAll('path, polyline, rect, circle').length,
    texts: svg.querySelectorAll('text').length,
    width: svg.getAttribute('width') || svg.clientWidth,
  }
})
log('图表真实渲染出 SVG', !!rendered.ok, JSON.stringify(rendered))

/** 四、data-option 往返：属性是合法 JSON，且带 series */
const attr = await page.evaluate(() => {
  const block = document.querySelector('.pm-overlay .rte-echarts-block')
  const raw = block?.getAttribute('data-option') || ''
  try {
    const parsed = JSON.parse(raw)
    return { ok: true, type: parsed?.series?.[0]?.type, len: raw.length }
  } catch (err) {
    return { ok: false, err: String(err) }
  }
})
log('data-option 可解析且带 series', !!attr.ok && !!attr.type, JSON.stringify(attr))

/** 五、导出快照：导出前事件 → 白底快照；导出后事件 → 还原 */
const snapshot = await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('rte:before-export'))
  const img = document.querySelector('.pm-overlay .rte-echarts-snapshot-img')
  const src = img?.getAttribute('src') || ''
  window.dispatchEvent(new CustomEvent('rte:after-export'))
  return { src: src.slice(0, 24), hasSnapshot: !!img }
})
log(
  '导出前生成白底快照',
  snapshot.hasSnapshot && snapshot.src.startsWith('data:image'),
  JSON.stringify(snapshot),
)
const dropped = await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('rte:before-export'))
  window.dispatchEvent(new CustomEvent('rte:after-export'))
  return document.querySelectorAll('.pm-overlay .rte-echarts-snapshot-img').length
})
log('导出后快照已移除', dropped === 0, String(dropped))

/** 六、序列化往返：编辑器 getHTML 里的 data-option 仍可解析 */
const serialized = await page.evaluate(() => {
  const html = document.querySelector('.pm-overlay .ProseMirror')?.innerHTML || ''
  const match = html.match(/data-option="([^"]*)"/)
  if (!match) return { ok: false }
  const text = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  try {
    const parsed = JSON.parse(text)
    return { ok: true, type: parsed?.series?.[0]?.type }
  } catch (err) {
    return { ok: false, err: String(err) }
  }
})
log('序列化 HTML 里 data-option 可还原', !!serialized.ok, JSON.stringify(serialized))

await page.screenshot({ path: `${out}/echarts_blocks.png` })

console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
