/**
 * 图表块（ECharts）端到端：工具栏「图表」分组 → 按官方类别逐类插入 → 真实渲染 → 导出快照。
 *
 * 覆盖：
 * - 工具栏独立「图表」分组（一级分类 9 个下拉按钮，3D·GL 独立，合计 39 类）；
 * - 每个类别抽一个子类型插入，并验证真的渲染出图（SVG / WebGL Canvas）；
 * - data-option 往返、导出快照。
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
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // 无显卡环境用 SwiftShader 跑 WebGL（3D / GL 图要靠它）
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
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
    // 类别栏 + 子类型栏
    const cats = await page.locator('.rte-echarts-dialog .rte-echarts-cats button').count()
    log('对话框列出官方类别', cats >= 39, `类别数=${cats}`)
    await page.locator('.rte-echarts-dialog button', { hasText: '折线图' }).first().click()
    await page.waitForTimeout(200)
    const subtypes = await page.locator('.rte-echarts-dialog .rte-echarts-subtypes button').count()
    log('对话框列出该类子类型', subtypes > 0, `子类型数=${subtypes}`)
    await page.locator('.rte-echarts-dialog .rte-echarts-subtypes button').first().click()
    await page.locator('.rte-echarts-dialog button', { hasText: '插入' }).first().click()
    await page.waitForTimeout(1200)
  }
}
log('斜杠路径插入一块图表', (await page.locator('.pm-overlay .rte-echarts-block').count()) >= 1)

/** 二、工具栏独立「图表」分组：一级分类各一个下拉（9 个，3D·GL 独立） */
const groupLabels = ['基础', '统计', '关系', '层级', '地理', '金融', '坐标系', '组件', '3D·GL']
let groupCount = 0
for (const label of groupLabels) {
  groupCount += await page.locator(`.pm-overlay button[title="插入${label}图表"]`).count()
}
log('工具栏图表一级分类按钮', groupCount >= 9, `数量=${groupCount}`)

/** 三、每个分类下抽每个类别的一个子类型插入，并验证真的渲染出来 */
const inserted = []
for (const groupLabel of groupLabels) {
  const groupBtn = page.locator(`.pm-overlay button[title="插入${groupLabel}图表"]`).first()
  if ((await groupBtn.count()) === 0) {
    log(`分类 ${groupLabel} 没有下拉按钮`, false)
    continue
  }
  let menuOpen = false
  const openMenu = async () => {
    if (menuOpen) {
      await groupBtn.click({ force: true })
      await page.waitForTimeout(200)
      menuOpen = false
    }
    await groupBtn.click({ force: true })
    await page.waitForTimeout(350)
    menuOpen = true
  }
  await openMenu()
  const categoryButtons = page.locator('body > .rte-menu-echarts .rte-menu-cat')
  const categoryCount = await categoryButtons.count()
  log(`分类 ${groupLabel} 的类别数`, categoryCount > 0, `类别数=${categoryCount}`)
  const labels = await categoryButtons.allTextContents()
  for (let i = 0; i < categoryCount; i += 1) {
    const label = (labels[i] || '').trim()
    await openMenu()
    const cat = page.locator('body > .rte-menu-echarts .rte-menu-cat').nth(i)
    await cat.click({ force: true })
    await page.waitForTimeout(150)
    const sub = page.locator('body > .rte-menu-echarts .rte-menu-sub button').first()
    if ((await sub.count()) === 0) {
      log(`类别 ${label} 没有子类型`, false)
      menuOpen = false
      continue
    }
    const before = await page.locator('.pm-overlay .rte-echarts-block').count()
    await sub.click({ force: true })
    await page.waitForTimeout(600)
    // 插入后菜单自动收起
    menuOpen = false
    const after = await page.locator('.pm-overlay .rte-echarts-block').count()
    if (after <= before) {
      log(`类别 ${label} 插入失败`, false)
      continue
    }
    const last = page.locator('.pm-overlay .rte-echarts-block').last()
    const rendered = await last.evaluate((node) => {
      const preview = node.querySelector('.rte-echarts-preview')
      return {
        svg: !!preview?.querySelector('svg'),
        canvas: !!preview?.querySelector('canvas'),
        error: preview?.querySelector('.rte-echarts-error')?.textContent || '',
      }
    })
    const ok = (rendered.svg || rendered.canvas) && !rendered.error
    log(`类别 ${label} 插入并渲染`, ok, JSON.stringify(rendered))
    inserted.push({ label, ok })
  }
}

/** 四、真实渲染：懒加载 echarts 后块内出现 SVG */
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

/** 五、data-option 往返：属性是合法 JSON，且带 series */
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

/** 六、导出快照：导出前事件 → 白底快照；导出后事件 → 还原 */
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

/** 七、序列化往返：编辑器 getHTML 里的 data-option 仍可解析 */
const serialized = await page.evaluate(() => {
  const html = document.querySelector('.pm-overlay .ProseMirror')?.innerHTML || ''
  const match = html.match(/data-option="([^"]*)"/)
  if (!match) return { ok: false }
  // innerHTML 会把属性里的引号转义成 &quot;，先还原再解析 JSON
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
await page.screenshot({ path: `${out}/echarts_blocks_full.png`, fullPage: true })

console.log(JSON.stringify({ inserted: inserted.length, failed: inserted.filter((i) => !i.ok) }, null, 2))
console.log(JSON.stringify(notes, null, 2))
await browser.close()
if (notes.some((item) => !item.ok)) process.exitCode = 1
