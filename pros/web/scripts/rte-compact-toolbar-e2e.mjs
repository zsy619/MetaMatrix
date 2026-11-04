/**
 * 紧凑工具栏（P0-5）截图与断言（e2e）。
 *
 * 无需登录 / 无需后端：走组件 harness 页 `/rte-compact-preview.html`
 * （src/rteCompactPreview.ts 直接挂 RichTextEditor 的紧凑态）。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：RTE_BASELINE_DIR（默认 /workspace/outputs/metamatrix/shots/rte-p0-compact）。
 *
 * 覆盖：
 * 1. 紧凑主栏：分组顺序 = 方案 A 分组（编辑 / 字体与颜色 / 段落与列表 / 插入），
 *    主栏里没有图表分类按钮；
 * 2. 用户拖拽（Alt+→）分组顺序后，紧凑主栏的分组顺序随之同步；
 * 3. 「更多」里有图表 9 个一级分类入口，点了能展开该分类的下拉（分类 → 图表类型）；
 * 4. 窄屏（390px）下主栏与「更多」仍能找到图表入口。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.RTE_BASELINE_DIR || '/workspace/outputs/metamatrix/shots/rte-p0-compact'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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
  notes.push({ step, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

const CHART_LABELS = ['基础', '统计', '关系', '层级', '地理', '金融', '坐标系', '组件', '3D·GL']

/** 当前紧凑主栏的分组标签顺序。 */
const primaryGroupLabels = () =>
  page.locator('.rte-toolbar-tools .rte-tool-group .rte-group-label').allInnerTexts()

/** 当前紧凑主栏里的工具按钮数量（不含分组手柄）。 */
const primaryToolCount = () => page.locator('.rte-toolbar-tools .rte-tool').count()

await page.goto(`${web}/rte-compact-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_COMPACT_READY__ === true, null, { timeout: 60000 })
await page.waitForTimeout(800)

/** 一、紧凑主栏：分组与顺序 */
const labels = (await primaryGroupLabels()).map((text) => text.trim())
log(
  '紧凑主栏分组顺序 = 方案 A 分组',
  JSON.stringify(labels) === JSON.stringify(['编辑', '字体与颜色', '段落与列表', '插入']),
  labels.join('、'),
)
log('紧凑主栏有高频按钮', (await primaryToolCount()) > 0, `${await primaryToolCount()} 个`)
const chartInPrimary = await page
  .locator('.rte-toolbar-tools .rte-tool[title^="插入"]')
  .filter({ hasText: /基础|统计|关系|层级|地理|金融|坐标系|组件|3D/ })
  .count()
log('紧凑主栏不含图表分类按钮（收在「更多」）', chartInPrimary === 0, `${chartInPrimary} 个`)
await page.locator('.rte-toolbar').screenshot({ path: `${out}/01-compact-primary.png` })

/** 二、拖拽分组顺序后，紧凑主栏同步（分组手柄支持 Alt+←/→） */
const handle = page.locator('.rte-toolbar-tools .rte-tool-group .rte-group-handle').first()
await handle.focus()
await handle.press('Alt+ArrowRight')
await page.waitForTimeout(400)
const labelsAfter = (await primaryGroupLabels()).map((text) => text.trim())
log(
  '拖动分组顺序后紧凑主栏同步',
  JSON.stringify(labelsAfter) !== JSON.stringify(labels),
  `${labels.join('、')} → ${labelsAfter.join('、')}`,
)
await page.locator('.rte-toolbar').screenshot({ path: `${out}/02-compact-primary-reordered.png` })
// 复位（Alt+← 移回）
await handle.focus()
await handle.press('Alt+ArrowLeft')
await page.waitForTimeout(300)

/** 三、「更多」里有图表 9 个一级分类入口 + 分类下拉
 *  「更多」菜单内容很长（11 个分组全列），浏览器滚动位置容易被重置，
 *  这里把视口拉高让「图表」分组直接落在可视区，再做元素级截图。 */
await page.setViewportSize({ width: 1280, height: 3400 })
await page.waitForTimeout(400)
const moreButton = page.locator('.rte-more-wrap button', { hasText: '更多' }).first()
await moreButton.click()
await page.waitForSelector('.rte-more-menu', { state: 'visible', timeout: 5000 })
await page.waitForTimeout(400)
const chartItems = page.locator('.rte-more-menu .rte-more-item').filter({ hasText: /插入.*图表/ })
const chartItemCount = await chartItems.count()
log('「更多」里有图表 9 个一级分类', chartItemCount === 9, `${chartItemCount} 个`)
const chartItemLabels = await chartItems.evaluateAll((els) =>
  els.map((el) =>
    (el.textContent || '')
      .replace(/插入/g, '')
      .replace(/图表/g, '')
      .replace(/▸/g, '')
      // 去掉分类图标（emoji + 变体选择符）
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\uFE0E\uFE0F]/g, '')
      .trim(),
  ),
)
log(
  '图表分类顺序 = CHART_GROUPS 顺序',
  JSON.stringify(chartItemLabels) === JSON.stringify(CHART_LABELS),
  chartItemLabels.join('、'),
)
await page.locator('.rte-more-menu').screenshot({ path: `${out}/03-more-open.png` })

const chartsGroup = page.locator('.rte-more-menu .rte-more-group[data-group-id="charts"]')
await chartsGroup.screenshot({ path: `${out}/04-more-chart-group.png` })

// 点「基础」→ 展开该分类的下拉（分类 → 具体图表类型）
await chartItems.first().click()
await page.waitForSelector('.rte-more-menu .rte-chart-more-flyout', { state: 'visible', timeout: 5000 })
await page.waitForTimeout(400)
const catCount = await page.locator('.rte-more-menu .rte-chart-more-flyout .rte-menu-cat').count()
log('图表分类下拉可展开', catCount > 0, `${catCount} 个具体类别`)
/** 分类下拉是绝对定位（落在分组下方），截「分组 + 下拉」合起来的那一块 */
const clipAround = async (locators, path) => {
  const boxes = []
  for (const locator of locators) {
    const box = await locator.boundingBox()
    if (box) boxes.push(box)
  }
  if (!boxes.length) return
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, x - 8),
      y: Math.max(0, y - 8),
      width: right - x + 16,
      height: bottom - y + 16,
    },
  })
}
const chartFlyout = page.locator('.rte-more-menu .rte-chart-more-flyout').first()
await clipAround([chartsGroup, chartFlyout], `${out}/05-more-chart-dropdown.png`)

/** 四、窄屏（390px）：主栏 + 「更多」里仍有图表入口 */
await page.setViewportSize({ width: 390, height: 3000 })
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.mouse.click(10, 10)
await page.waitForTimeout(300)
await page.locator('.rte-toolbar').screenshot({ path: `${out}/06-compact-narrow.png` })
const narrowMore = page.locator('.rte-more-wrap button', { hasText: '更多' }).first()
await narrowMore.click()
await page.waitForSelector('.rte-more-menu', { state: 'visible', timeout: 5000 })
await page.waitForTimeout(400)
const narrowChartItems = page
  .locator('.rte-more-menu .rte-more-item')
  .filter({ hasText: /插入.*图表/ })
log('窄屏「更多」里能找到图表入口', (await narrowChartItems.count()) === 9, `${await narrowChartItems.count()} 个`)
await page.locator('.rte-more-menu').screenshot({ path: `${out}/07-narrow-more-open.png` })
const narrowChartsGroup = page.locator('.rte-more-menu .rte-more-group[data-group-id="charts"]')
await narrowChartsGroup.screenshot({ path: `${out}/08-narrow-more-chart-group.png` })
await narrowChartItems.first().click()
await page.waitForSelector('.rte-more-menu .rte-chart-more-flyout', { state: 'visible', timeout: 5000 })
await page.waitForTimeout(400)
const narrowFlyout = page.locator('.rte-more-menu .rte-chart-more-flyout').first()
await clipAround([narrowChartsGroup, narrowFlyout], `${out}/09-narrow-more-chart-dropdown.png`)

log('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()

const failed = notes.filter((note) => !note.ok)
console.log(`\n${notes.length - failed.length}/${notes.length} 项通过`)
if (failed.length) {
  console.log('失败项：' + failed.map((note) => note.step).join('、'))
  process.exit(1)
}
