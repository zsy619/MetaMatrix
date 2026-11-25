/**
 * Ribbon 彩色扁平磁贴验证（浅色 / 深色两态）。
 * 无登录 harness：/rte-expanded-preview.html
 * 深色态通过写入视图偏好 mm.rte.viewPrefs.v1:<panelId> = { dark: true } 触发。
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

async function shot(dark) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  if (dark) {
    await page.addInitScript(() => {
      localStorage.setItem(
        'mm.rte.viewPrefs.v1:preview-panel-expanded',
        JSON.stringify({ sticky: false, stickyCol: false, dark: true, zoom: 1 }),
      )
    })
  }
  await page.goto(`${web}/rte-expanded-preview.html`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
  await page.waitForTimeout(900)
  const info = await page.evaluate(() => {
    const root = document.querySelector('.rte-root')
    // 取「第一个可用（非禁用）」工具，避免量到撤销/重做的禁用灰态
    const icons = [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-icon')]
    const icon =
      icons.find((el) => !el.closest('.rte-tool')?.classList.contains('is-disabled') &&
        !el.closest('.rte-tool')?.hasAttribute('disabled')) || icons[0]
    const cs = icon ? getComputedStyle(icon) : null
    const svg = icon?.querySelector('svg')
    const r = icon?.getBoundingClientRect()
    // 各分组的磁贴底色（同一分组应同色，跨分组换色）
    const groups = [...document.querySelectorAll('.rte-tool-group[data-group-id]')].map((g) => {
      const gi = g.querySelector('.rte-tool-icon')
      return {
        group: g.getAttribute('data-group-id'),
        bg: gi ? getComputedStyle(gi).backgroundColor : null,
        glyph: gi?.querySelector('svg') ? getComputedStyle(gi.querySelector('svg')).color : null,
      }
    })
    return {
      dark: !!root?.classList.contains('is-dark-editor'),
      tileBg: cs?.backgroundColor,
      tileRadius: cs?.borderRadius,
      tileSize: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
      glyph: svg ? getComputedStyle(svg).color : null,
      barBg: getComputedStyle(document.querySelector('.rte-ribbon-bar')).backgroundColor,
      groups,
    }
  })
  await page.screenshot({ path: `${out}/${dark ? '13-ribbon-dark' : '12-ribbon-tiles'}.png`, clip: { x: 0, y: 0, width: 1440, height: 200 } })

  // 切到第二个栏目（字体与颜色），验证跨分组换色
  const tab = page.locator('[data-ribbon-tab]').nth(1)
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(600)
    const info2 = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('.rte-tool-group[data-group-id]')].map((g) => {
        const gi = g.querySelector('.rte-tool-icon')
        return {
          group: g.getAttribute('data-group-id'),
          bg: gi ? getComputedStyle(gi).backgroundColor : null,
        }
      })
      return { tab: document.querySelector('[data-ribbon-tab].is-active')?.getAttribute('data-ribbon-tab'), groups }
    })
    info.tab2 = info2
    await page.screenshot({ path: `${out}/${dark ? '15-ribbon-dark-tab2' : '14-ribbon-tiles-tab2'}.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } })
  }
  await page.close()
  return info
}

report.light = await shot(false)
report.dark = await shot(true)
console.log(JSON.stringify(report, null, 2))
await browser.close()
