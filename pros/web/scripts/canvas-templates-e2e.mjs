/**
 * 两个新画布模板（三环分析法 / 领导核心价值驱动三角）的 e2e 截图与回归。
 *
 * 前置：vite dev 跑在 CANVAS_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：CANVAS_SHOT_DIR（默认 /workspace/outputs/metamatrix/shots/canvas-templates）。
 *
 * 覆盖：
 * 1. 模板库（Guide）里能看到两个模板，并能进入画布；
 * 2. 每个区域都能点进去填写内容（真实点击 + 键盘输入）；
 * 3. 填完刷新页面内容仍在（走现有文档草稿/保存机制）；
 * 4. 每张模板输出一张填好示例内容的截图。
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

/** 每个模板的示例内容：区域 id → 填写文本 */
const FILL = {
  'three-ring-basics': {
    ring_practical: '现场真实问题、有资源有预算',
    ring_trainable: '可拆解、有反馈、能重复',
    ring_value: '能复利、能沉淀成资产',
    hex_concreteness: '这件事具体是什么',
    hex_scenario: '在什么场景里发生',
    hex_independence: '不依赖别人也能练',
    hex_verifiability: '能被检验、对错可判',
    hex_compounding: '每次练习都能叠加',
    hex_repeatability: '能反复练到熟',
    overlap_value_low: '只务实不产生复利',
    overlap_not_trainable: '方向对但无法刻意练',
    overlap_too_vague: '只有概念无法落地',
    core: '关键基本功：每周一次刻意练习 + 复盘',
  },
  'leadership-triangle': {
    top_exchange: 'A 付出真心，B 心甘情愿',
    apex: '目标对齐 · 资源聚焦 · 难题攻坚',
    pyramid_1: '定目标',
    pyramid_2: '定策略',
    pyramid_3: '跨部门协同难题',
    pyramid_4: '定机制',
    pyramid_5: '稳运营',
    challenge: '打硬仗、啃骨头',
    stable: '守住基本盘不掉链子',
    difficulty: '目标越高 / 层级越高 / 资源越少 / 周期越长 / 人数越多',
    management: '机制架构 / 工具流程 / 执行框架',
    power: '职级身份 / 稀缺资源 / 决定奖惩',
  },
}

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

/* ---------- 1. 模板库里能看到两个模板 ---------- */
await page.goto(`${web}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
for (const name of ['苦练基本功三环分析法', '领导核心价值驱动三角']) {
  const found = await page.locator('.card h2', { hasText: name }).count()
  log(`模板库可见：${name}`, found > 0, `${found} 张卡片`)
}

/* 从模板库点卡片真的能进画布（新建入口） */
await page.locator('.card h2', { hasText: '苦练基本功三环分析法' }).click()
await page.waitForURL(/\/canvas\/three-ring-basics/, { timeout: 20000 })
await page.waitForSelector('.trb-stage', { timeout: 30000 })
log('模板库点击新建画布', true, page.url())
await page.goto(`${web}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

/* ---------- 2/3/4. 逐个模板填写 + 刷新校验 + 截图 ---------- */
for (const [templateId, fill] of Object.entries(FILL)) {
  await page.goto(`${web}/canvas/${templateId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  // 清掉上一次草稿，保证从空白模板开始
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.trb-stage, .lt-stage', { timeout: 30000 })
  await page.waitForTimeout(800)

  const stage = page.locator('.trb-stage, .lt-stage')
  const regionIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region-id]')).map((el) =>
      el.getAttribute('data-region-id'),
    ),
  )
  log(`${templateId}：可编辑区域数量`, regionIds.length > 0, `${regionIds.length} 个`)

  let filled = 0
  for (const [regionId, text] of Object.entries(fill)) {
    const editor = page.locator(
      `[data-region-id="${regionId}"] .region-input`,
    )
    if ((await editor.count()) === 0) continue
    try {
      await editor.first().click({ timeout: 5000 })
      await page.keyboard.type(text, { delay: 4 })
      filled += 1
    } catch (err) {
      log(`${templateId}：填写 ${regionId}`, false, String(err).split('\n')[0].slice(0, 100))
    }
  }
  log(`${templateId}：区域填写`, filled === Object.keys(fill).length, `${filled}/${Object.keys(fill).length}`)

  await page.waitForTimeout(1200)

  /* 刷新后内容仍在（走现有文档草稿机制） */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.trb-stage, .lt-stage', { timeout: 30000 })
  await page.waitForTimeout(1500)
  let kept = 0
  for (const [regionId, text] of Object.entries(fill)) {
    const body = await page
      .locator(`[data-region-id="${regionId}"]`)
      .first()
      .innerText()
      .catch(() => '')
    if (body.includes(text.slice(0, 6))) kept += 1
  }
  log(
    `${templateId}：刷新后内容仍在`,
    kept === Object.keys(fill).length,
    `${kept}/${Object.keys(fill).length}`,
  )

  /* 截图 */
  await page.locator('.trb-stage, .lt-stage').first().screenshot({
    path: `${out}/${templateId}.png`,
  })
  log(`${templateId}：截图已保存`, true, `${out}/${templateId}.png`)
}

log('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()

const failed = notes.filter((n) => !n.ok)
if (failed.length) {
  console.error(`\n${failed.length} 项未通过`)
  process.exit(1)
}
console.log('\n全部通过')
