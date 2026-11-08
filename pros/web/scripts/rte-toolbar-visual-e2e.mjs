/**
 * 工具栏视觉验收（不连真实 API，编辑器走本地预览页）。
 *
 * 检查：分组数量、分组之间不重叠、三档视口不裁切、hover / 选中 / 禁用 / 键盘 focus
 * 四种状态在浅色下可区分，并出图。
 *
 * 用法：vite 在 5173，然后 node scripts/rte-toolbar-visual-e2e.mjs
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const { chromium } = pw
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const outDir = process.env.RTE_SHOT_DIR || '/workspace/outputs/metamatrix/artifacts/dsh-rte-ui-media-1107'
mkdirSync(outDir, { recursive: true })

const results = []
function check(step, ok, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`)
  if (!ok) throw new Error(`${step}: ${detail}`)
}

const viewports = [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1280, height: 800, name: '1280x800' },
  { width: 390, height: 700, name: '390x700' },
]

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })

  const groups = await page.$$eval('.rte-tool-group', (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect()
      return { id: n.dataset.groupId, x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
  const expectGroups = viewport.width >= 1024 ? 11 : null
  check(
    `${viewport.name} 工具栏分组数${expectGroups ? '为 11' : '大于 0（窄屏紧凑栏只放高频键）'}`,
    expectGroups ? groups.length === expectGroups : groups.length > 0,
    `count=${groups.length}`,
  )

  // 分组两两不重叠
  let overlap = null
  for (let i = 0; i < groups.length && !overlap; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i]
      const b = groups[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlap = `${a.id} × ${b.id}`
        break
      }
    }
  }
  check(`${viewport.name} 分组之间不重叠`, !overlap, overlap || '无重叠')

  // 页面不横向溢出（工具栏被裁切）
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }))
  check(`${viewport.name} 页面无横向裁切`, overflow.doc <= overflow.win + 2, JSON.stringify(overflow))

  // 工具按钮不小于可点击尺寸
  const tiny = await page.$$eval('.rte-tool', (nodes) =>
    nodes
      .map((n) => {
        const r = n.getBoundingClientRect()
        return { label: n.getAttribute('aria-label') || '', w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((n) => n.w > 0 && (n.w < 24 || n.h < 24)),
  )
  check(`${viewport.name} 可见工具按钮尺寸不小于 24px`, tiny.length === 0, JSON.stringify(tiny.slice(0, 5)))

  await page.screenshot({ path: path.join(outDir, `toolbar-${viewport.name}.png`) })
  const bar = await page.$('.rte-toolbar')
  if (bar) await bar.screenshot({ path: path.join(outDir, `toolbar-bar-${viewport.name}.png`) })
  await page.close()
}

// 交互态区分（1440x900）
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })

  const bold = page.getByRole('button', { name: '加粗 (Ctrl/⌘+B)' }).first()
  const states = await bold.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      base: cs.backgroundColor,
      color: cs.color,
      border: cs.borderColor,
      radius: cs.borderRadius,
    }
  })
  await bold.hover()
  await page.waitForTimeout(150)
  const hovered = await bold.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, color: cs.color }
  })
  check('hover 态与常态可区分', hovered.bg !== states.base, JSON.stringify({ states, hovered }))

  // 选中态：点击加粗后按钮进入 active
  await page.locator('.ProseMirror').click()
  await bold.click()
  await page.waitForTimeout(250)
  const active = await bold.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, color: cs.color, cls: el.className }
  })
  check('选中态与常态可区分', active.bg !== states.base, JSON.stringify({ states, active }))
  await page.screenshot({ path: path.join(outDir, 'toolbar-active-1440x900.png') })

  // 键盘 focus 可见：用 Tab 真正走一遍键盘焦点（程序化 focus() 不触发 :focus-visible）
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
  })
  let focusInfo = null
  for (let i = 0; i < 80 && !focusInfo; i += 1) {
    await page.keyboard.press('Tab')
    focusInfo = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || !el.classList || !el.classList.contains('rte-tool')) return null
      const cs = getComputedStyle(el)
      return {
        label: el.getAttribute('aria-label'),
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
      }
    })
  }
  check(
    '键盘 focus 有可见轮廓',
    !!focusInfo && focusInfo.outlineStyle !== 'none' && parseFloat(focusInfo.outlineWidth) >= 2,
    JSON.stringify(focusInfo),
  )

  // 禁用态
  const disabledInfo = await page.$$eval('.rte-tool', (nodes) => {
    const el = nodes.find((n) => n.disabled || n.classList.contains('is-disabled'))
    if (!el) return null
    const cs = getComputedStyle(el)
    return { opacity: cs.opacity, cursor: cs.cursor, color: cs.color, label: el.getAttribute('aria-label') }
  })
  if (disabledInfo) {
    check(
      '禁用态明显（透明度 < 1 且文字变灰）',
      parseFloat(disabledInfo.opacity) < 1 && disabledInfo.color !== 'rgb(55, 58, 64)',
      JSON.stringify(disabledInfo),
    )
  } else {
    console.log('SKIP 禁用态检查 — 当前工具栏没有禁用按钮')
  }

  await page.close()
}

// 暗色编辑区：分组/文字要跟着换色，不能是一排浅色药丸
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 30000 })

  const viewBtn = page.getByRole('button', { name: '视图', exact: true }).first()
  await viewBtn.click()
  const darkToggle = page.getByRole('button', { name: '暗色编辑区' }).first()
  await darkToggle.waitFor({ state: 'visible', timeout: 10000 })
  await darkToggle.click()
  await page.waitForTimeout(400)

  const dark = await page.evaluate(() => {
    const group = document.querySelector('.rte-tool-group')
    const tool = document.querySelector('.rte-tool')
    const gcs = getComputedStyle(group)
    const tcs = getComputedStyle(tool)
    return {
      groupBg: gcs.backgroundColor,
      groupBorder: gcs.borderColor,
      toolColor: tcs.color,
      dark: document.querySelector('.rte-root')?.classList.contains('is-dark-editor'),
    }
  })
  check('暗色编辑区已开启', dark.dark === true, JSON.stringify(dark))
  check(
    '暗色下分组不再用浅色药丸底',
    dark.groupBg === 'rgba(255, 255, 255, 0.06)' && dark.toolColor !== 'rgb(55, 58, 64)',
    JSON.stringify(dark),
  )
  await page.screenshot({ path: path.join(outDir, 'toolbar-dark-1440x900.png') })
  const bar = await page.$('.rte-toolbar')
  if (bar) await bar.screenshot({ path: path.join(outDir, 'toolbar-bar-dark-1440x900.png') })
  await page.close()
}

await browser.close()
console.log(`\n全部通过：${results.length} 项`)
