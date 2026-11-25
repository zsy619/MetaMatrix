import pw from 'playwright-core'
const { chromium } = pw
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:5173/rte-expanded-preview.html', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__RTE_EXPANDED_READY__ === true, { timeout: 30000 })
await page.waitForTimeout(800)
const audit = await page.evaluate(() => {
  const out = []
  const tabs = [...document.querySelectorAll('.rte-ribbon-tab')]
  return out
})
// 逐个栏目统计图标规格
const stats = []
const tabNames = await page.$$eval('.rte-ribbon-tab', els => els.map(e => e.textContent.trim()))
for (const name of tabNames) {
  const el = await page.$(`.rte-ribbon-tab:text-is("${name}")`)
  if (!el) continue
  await el.click(); await page.waitForTimeout(280)
  const rows = await page.evaluate(() => {
    const res = []
    document.querySelectorAll('.rte-toolbar-tools .rte-tool').forEach(btn => {
      const icon = btn.querySelector('.rte-tool-icon')
      const svg = btn.querySelector('svg')
      if (!icon) return
      const cs = getComputedStyle(icon)
      const r = icon.getBoundingClientRect()
      const scs = svg ? getComputedStyle(svg) : null
      res.push({
        label: btn.textContent.trim().slice(0, 8),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        bg: cs.backgroundImage !== 'none' ? 'gradient' : cs.backgroundColor,
        radius: cs.borderRadius,
        svgStroke: scs?.strokeWidth,
        svgColor: scs?.color,
        svgBox: svg ? `${Math.round(svg.getBoundingClientRect().width)}x${Math.round(svg.getBoundingClientRect().height)}` : null,
        svgFill: scs?.fill,
        svgCap: scs?.strokeLinecap,
      })
    })
    return res
  })
  stats.push({ tab: name, count: rows.length, sample: rows, all: rows })
}
const total = stats.reduce((a, b) => a + b.count, 0)
const boxes = new Set()
const strokes = new Set()
const radii = new Set()
const allRows = stats.flatMap(s => s.all)
for (const r of allRows) { boxes.add(r.box); strokes.add(String(r.svgStroke)); radii.add(r.radius) }
const byStroke = {}
for (const r of allRows) { const k = String(r.svgStroke); byStroke[k] = (byStroke[k] || 0) + 1 }
console.log('stroke distribution', byStroke)
const grads = allRows.filter(r => r.bg === 'gradient').length
const fills = {}; const caps = {}
for (const r of allRows) { fills[r.svgFill] = (fills[r.svgFill]||0)+1; caps[String(r.svgCap)] = (caps[String(r.svgCap)]||0)+1 }
console.log('fill distribution', fills); console.log('linecap distribution', caps)
const odd = allRows.filter(r => r.svgStroke !== '1.7px').slice(0,30).map(r => r.label + ':' + r.svgStroke + '/' + r.svgFill)
console.log('deviating icons', odd.join(' | '))
console.log('gradient icons', grads, '/', allRows.length, ' flat', allRows.length - grads)
console.log('tabs', stats.length, 'total tools', total)
console.log('icon boxes', [...boxes], 'stroke', [...strokes], 'radius', [...radii])
console.log('per-tab', stats.map(s => s.tab + ':' + s.count).join(' '))
await browser.close()
