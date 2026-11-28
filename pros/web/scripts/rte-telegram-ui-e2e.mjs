/**
 * Telegram 风格化 UI 层 e2e：普通工具栏 / Ribbon / 右键菜单 / 下拉面板 / 下拉选择。
 *
 * 无需登录：走 harness 页 /rte-expanded-preview.html 与 /rte-compact-preview.html。
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：/tmp/rte-tg-shots
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const out = process.env.RTE_BASELINE_DIR || '/tmp/rte-tg-shots'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const report = {}

/* ---------- 1. Ribbon 功能区 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${web}/rte-expanded-preview.html`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
  await page.waitForTimeout(800)
  report.ribbon = await page.evaluate(() => {
    const tab = document.querySelector('.rte-ribbon-tab.active')
    const tool = document.querySelector('.rte-toolbar-tools .rte-tool')
    const cs = tab ? getComputedStyle(tab) : null
    const ts = tool ? getComputedStyle(tool) : null
    return {
      tabs: document.querySelectorAll('.rte-ribbon-tab').length,
      tabRadius: cs?.borderRadius,
      tabColor: cs?.color,
      tabWeight: cs?.fontWeight,
      toolRadius: ts?.borderRadius,
      toolTransition: ts?.transitionDuration,
    }
  })
  await page.screenshot({ path: `${out}/01-ribbon.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } })

  // Ribbon 工具悬停 → 常驻气泡提示
  const tool = await page.$('.rte-toolbar-tools .rte-tool:not([disabled])')
  if (tool) {
    await tool.hover()
    await page.waitForTimeout(600)
    report.ribbonTip = await page.evaluate(() => {
      const tip = document.querySelector('.rte-tip')
      if (!tip) return null
      const cs = getComputedStyle(tip)
      const r = tip.getBoundingClientRect()
      return {
        text: tip.textContent.trim(),
        radius: cs.borderRadius,
        bg: cs.backgroundColor,
        fontSize: cs.fontSize,
        w: Math.round(r.width),
        h: Math.round(r.height),
      }
    })
    await page.screenshot({ path: `${out}/02-ribbon-tooltip.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } })
  }

  // 右键菜单：插入表格 → 右键单元格
  await page.evaluate(() => {
    const ref = window.__RTE_EDITOR_REF__
    const inst = ref?.value
    const ed = inst?.editor
    if (ed?.chain) {
      ed.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    } else if (ed?.value?.chain) {
      ed.value.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    }
  })
  await page.waitForTimeout(600)
  const cell = await page.$('.ProseMirror td')
  if (cell) {
    await cell.click({ button: 'right' })
    await page.waitForTimeout(600)
    report.contextMenu = await page.evaluate(() => {
      const menu = document.querySelector('.rte-table-ctx')
      if (!menu) return null
      const cs = getComputedStyle(menu)
      const item = menu.querySelector('button')
      const ics = item ? getComputedStyle(item) : null
      return {
        radius: cs.borderRadius,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        itemHeight: item ? Math.round(item.getBoundingClientRect().height) : null,
        itemRadius: ics?.borderRadius,
        itemPadding: ics?.padding,
      }
    })
    await page.screenshot({ path: `${out}/03-context-menu.png` })
    // 展开二级菜单（flyout）
    const groupBtn = await page.$('.rte-table-ctx-group > button')
    if (groupBtn) {
      await groupBtn.hover()
      await page.waitForTimeout(500)
      await groupBtn.click()
      await page.waitForTimeout(500)
      report.flyout = await page.evaluate(() => {
        const f = document.querySelector('.rte-table-ctx-flyout')
        if (!f) return null
        const cs = getComputedStyle(f)
        return { radius: cs.borderRadius, bg: cs.backgroundColor, shadow: cs.boxShadow }
      })
      await page.screenshot({ path: `${out}/04-context-flyout.png` })
    }
  }
  await page.close()
}

/* ---------- 2. 紧凑工具栏 + 更多面板 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.addInitScript(() => localStorage.setItem('rte.toolbar.style', 'tg'))
  await page.goto(`${web}/rte-compact-preview.html`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__RTE_COMPACT_READY__ === true, { timeout: 30000 })
  await page.waitForTimeout(800)
  const tool = await page.$('.rte-toolbar-tools .rte-tool:not([disabled])')
  if (tool) {
    await tool.hover()
    await page.waitForTimeout(600)
    report.compactTip = await page.evaluate(() => {
      const tip = document.querySelector('.rte-tip')
      return tip ? { text: tip.textContent.trim(), radius: getComputedStyle(tip).borderRadius } : null
    })
    await page.screenshot({ path: `${out}/05-compact-tooltip.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } })
  }
  const more = await page.$('.rte-more-wrap .rte-tool')
  if (more) {
    await more.click()
    await page.waitForTimeout(700)
    report.morePanel = await page.evaluate(() => {
      const menu = document.querySelector('.rte-more-menu')
      if (!menu) return null
      const cs = getComputedStyle(menu)
      const item = menu.querySelector('.rte-more-item')
      return {
        radius: cs.borderRadius,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        hasSettings: !!document.querySelector('.rte-more-settings-toggle'),
        itemHeight: item ? Math.round(item.getBoundingClientRect().height) : null,
      }
    })
    await page.screenshot({ path: `${out}/06-more-panel.png` })
  }
  await page.close()
}

console.log(JSON.stringify(report, null, 2))
await browser.close()
