/**
 * 画布模板「上下文六要素」的 e2e 截图与回归。
 *
 * 前置：vite dev 跑在 CANVAS_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：CANVAS_SHOT_DIR（默认 /workspace/outputs/metamatrix/shots/canvas-templates）。
 *
 * 覆盖：
 * 1. 模板库（Guide）里能看到「上下文六要素」，点卡片能进画布；
 * 2. 新建后自动带出六段（二级标题 + 一行占位文字）；
 * 3. 富文本里改内容后刷新仍在（走现有文档草稿 / 保存机制）；
 * 4. 输出一张填好示例内容的截图。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.CANVAS_SHOT_DIR ||
  '/workspace/outputs/metamatrix/shots/canvas-templates'
const web = process.env.CANVAS_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

/** 六段：标题 → 填写内容 */
const SECTIONS = [
  { title: '任务目标', text: '三周内上线客户反馈闭环的最小可用版本' },
  { title: 'AI的角色', text: '负责把用户原话整理成结构化需求清单' },
  { title: '我的角色', text: '负责判断优先级、拍板取舍并对外答疑' },
  { title: '关键信息', text: '本周 3 个 P0 缺陷、2 个头部客户的原始反馈记录' },
  { title: '行为规则', text: '不确定就标注假设，不编造数据，先给结论再给依据' },
  { title: '交付格式', text: '结论先行 + 三条建议 + 每条附一句依据' },
]

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok, detail: detail ?? '' })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const pageErrors = []
const isIgnorable = (text) =>
  /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})

/* ---------- 1. 模板库可见 + 能进画布 ---------- */
await page.goto(`${web}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
const cardCount = await page
  .locator('.card h2', { hasText: '上下文六要素' })
  .count()
log('模板库可见：上下文六要素', cardCount > 0, `${cardCount} 张卡片`)

await page.locator('.card h2', { hasText: '上下文六要素' }).click()
await page.waitForURL(/\/canvas\/context-six-elements/, { timeout: 20000 })
await page.waitForSelector('.cse-page', { timeout: 30000 })
log('模板库点击新建画布', true, page.url())

/* 清掉上一次草稿，保证从空白模板开始 */
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cse-page', { timeout: 30000 })
await page.waitForTimeout(1500)

/* ---------- 2. 新建后自动带出六段 ---------- */
const editor = page.locator('.cse-page .rte-stub, .cse-page [contenteditable="true"]').first()
const bodyText = await page.locator('.cse-page').first().innerText()
let shown = 0
for (const section of SECTIONS) {
  if (bodyText.includes(section.title)) shown += 1
}
log('新建后自动带出六段标题', shown === SECTIONS.length, `${shown}/${SECTIONS.length}`)
log(
  '新建后自动带出六段占位文字',
  bodyText.includes('此处填写任务目标') && bodyText.includes('此处填写交付格式'),
  bodyText.includes('此处填写任务目标') ? '含占位文字' : '缺占位文字',
)

/* ---------- 3. 编辑内容 ---------- */
let filled = 0
for (const section of SECTIONS) {
  // 每段的占位行：点进去 → 选中整行 → 用真实内容替换
  const target = page
    .locator('.cse-page p', { hasText: `此处填写${section.title}` })
    .first()
  if ((await target.count()) === 0) continue
  try {
    await target.click({ timeout: 5000 })
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.type(section.text, { delay: 4 })
    filled += 1
  } catch (err) {
    log(`填写 ${section.title}`, false, String(err).split('\n')[0].slice(0, 120))
  }
}
log('六段逐段填写', filled === SECTIONS.length, `${filled}/${SECTIONS.length}`)

await page.waitForTimeout(1500)

/* ---------- 4. 刷新后内容仍在 ---------- */
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cse-page', { timeout: 30000 })
await page.waitForTimeout(1800)
const after = await page.locator('.cse-page').first().innerText()
let kept = 0
for (const section of SECTIONS) {
  if (after.includes(section.text)) kept += 1
}
log('刷新后内容仍在', kept === SECTIONS.length, `${kept}/${SECTIONS.length}`)

/* ---------- 5. 截图 ---------- */
await page.locator('.cse-page').first().screenshot({
  path: `${out}/context-six-elements.png`,
})
log('截图已保存', true, `${out}/context-six-elements.png`)

log('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()

const failed = notes.filter((n) => !n.ok)
if (failed.length) {
  console.error(`\n${failed.length} 项未通过`)
  process.exit(1)
}
console.log('\n全部通过')
