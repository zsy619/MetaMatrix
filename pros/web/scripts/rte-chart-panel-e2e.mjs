/**
 * 图表属性面板 + 分组工具栏截图（e2e）。
 *
 * 前置：vite dev 跑在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 输出：RTE_BASELINE_DIR（默认 /workspace/outputs/metamatrix/shots/chart-panel）。
 *
 * 截图内容：
 * 1. 工具栏「图表」下拉：9 个子分组 + 3D/GL 独立分组；
 * 2. 三类图表的属性面板（柱状图 / 饼图 / 关系图）；
 * 3. 数据表格视图；
 * 4. 数据接口配置区块；
 * 5. 删除二次确认弹窗。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out =
  process.env.RTE_BASELINE_DIR || '/workspace/outputs/metamatrix/shots/chart-panel'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const pageErrors = []
/** 预览页没有 favicon，浏览器的自动请求会报 404，与本页无关；真正的 404 由 response 监听记录。 */
const isIgnorable = (text) => /favicon/i.test(text) || /Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!isIgnorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isIgnorable(msg.text())) pageErrors.push(msg.text())
})
page.on('response', (res) => {
  if (res.status() >= 400 && !isIgnorable(res.url())) {
    pageErrors.push(`HTTP ${res.status()} ${res.url()}`)
  }
})

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

await page.goto(`${web}/chart-panel-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 60000 })
await page.waitForTimeout(1200)

/** 1. 工具栏「图表」分组：一级分类各自一个下拉按钮（9 个，3D·GL 独立）。 */
const groupLabels = ['基础', '统计', '关系', '层级', '地理', '金融', '坐标系', '组件', '3D·GL']
const groupButtons = page.locator(
  '.rte-toolbar button[title="插入基础图表"], .rte-toolbar button[title="插入统计图表"], ' +
    '.rte-toolbar button[title="插入关系图表"], .rte-toolbar button[title="插入层级图表"], ' +
    '.rte-toolbar button[title="插入地理图表"], .rte-toolbar button[title="插入金融图表"], ' +
    '.rte-toolbar button[title="插入坐标系图表"], .rte-toolbar button[title="插入组件图表"], ' +
    '.rte-toolbar button[title="插入3D·GL图表"]',
)
const groupCount = await groupButtons.count()
log('工具栏图表一级分类按钮', groupCount >= 9, `${groupCount} 个`)

// 点「基础」下拉：只列基础分类下的图表类型
const basicButton = page.locator('.rte-toolbar button[title="插入基础图表"]').first()
if (await basicButton.count()) {
  await basicButton.click()
  await page.waitForTimeout(400)
  const cats = await page.locator('.rte-menu-echarts .rte-menu-cat').allTextContents()
  log('基础分类下拉里的类型', cats.length > 0 && cats.length < 39, cats.join('/'))
  await page.screenshot({ path: `${out}/01-toolbar-chart-groups.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
} else {
  log('基础分类下拉里的类型', false, '没找到「插入基础图表」按钮')
}

// 3D / GL 独立下拉
const glButton = page.locator('.rte-toolbar button[title="插入3D·GL图表"]').first()
if (await glButton.count()) {
  await glButton.click()
  await page.waitForTimeout(400)
  const glCats = await page.locator('.rte-menu-echarts .rte-menu-cat').allTextContents()
  log('3D·GL 分类下拉里的类型', glCats.length === 11, glCats.join('/'))
  await page.screenshot({ path: `${out}/02-toolbar-chart-groups-gl.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
} else {
  log('3D·GL 分类下拉里的类型', false, '没找到「插入3D·GL图表」按钮')
}

/** 2. 三类图表的属性面板。 */
const panels = [
  { index: 0, name: 'bar', title: '03-panel-bar.png' },
  { index: 1, name: 'pie', title: '04-panel-pie.png' },
  { index: 2, name: 'graph', title: '05-panel-graph.png' },
]
for (const item of panels) {
  const ok = await page.evaluate((index) => window.__selectChart(index), item.index)
  await page.waitForTimeout(500)
  const panel = page.locator('.rte-chart-panel')
  const visible = await panel.count()
  const type = visible ? (await panel.locator('.rte-cp-type').textContent()) || '' : ''
  log(`属性面板（${item.name}）`, ok && visible > 0 && type.includes(item.name), type)
  await page.screenshot({ path: `${out}/${item.title}` })
}

/** 2.5 面板里改标题 → 文档里的 option 真的变了（真实浏览器验证「落盘」）。 */
await page.evaluate(() => window.__selectChart(0))
await page.waitForTimeout(400)
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.rte-chart-panel .rte-cp-field'))
  const row = rows.find((el) => el.querySelector('.rte-cp-field-label')?.textContent?.includes('标题'))
  const input = row?.querySelector('input')
  if (!input) return
  input.value = '真实浏览器改的标题'
  input.dispatchEvent(new Event('change'))
})
await page.waitForTimeout(600)
const liveTitle = await page.evaluate(() => {
  const ed = window.__rte?.editor
  if (!ed) return ''
  let title = ''
  ed.state.doc.descendants((node) => {
    if (node.type?.name === 'echartsBlock' && !title) {
      try {
        title = JSON.parse(node.attrs.option || '{}').title?.text || ''
      } catch {
        title = ''
      }
    }
    return true
  })
  return title
})
log('面板改标题 → 文档 option 落盘', liveTitle === '真实浏览器改的标题', liveTitle)
await page.locator('.rte-chart-panel').screenshot({ path: `${out}/09-panel-title-persisted.png` })

/** 3. 数据表格视图（面板内部滚动到「数据」区块再截图）。 */
await page.evaluate(() => window.__selectChart(0))
await page.waitForTimeout(400)
const scrolled = await page.evaluate(() => {
  const body = document.querySelector('.rte-cp-body')
  if (!body) return false
  const sections = Array.from(document.querySelectorAll('.rte-chart-panel .rte-cp-section'))
  const target = sections.find((el) => {
    const title = el.querySelector('.rte-cp-section-title')?.textContent?.trim() || ''
    return title === '数据'
  })
  if (!target) return false
  body.scrollTop = Math.max(0, target.offsetTop - 8)
  return true
})
await page.waitForTimeout(300)
await page.locator('.rte-chart-panel').screenshot({ path: `${out}/06-panel-data-table.png` })
log('数据表格视图', scrolled)

/** 4. 数据接口配置区块。 */
const dsScrolled = await page.evaluate(() => {
  const body = document.querySelector('.rte-cp-body')
  if (!body) return false
  const sections = Array.from(document.querySelectorAll('.rte-chart-panel .rte-cp-section'))
  const target = sections.find((el) => {
    const title = el.querySelector('.rte-cp-section-title')?.textContent?.trim() || ''
    return title === '数据接口'
  })
  if (!target) return false
  body.scrollTop = Math.max(0, target.offsetTop - 8)
  return true
})
await page.waitForTimeout(300)
await page.locator('.rte-chart-panel').screenshot({ path: `${out}/07-panel-datasource.png` })
log('数据接口配置', dsScrolled)

/** 4.5 高级 JSON（CodeMirror）+ 非法 JSON 校验。 */
const jsonReady = await page.evaluate(() => {
  const body = document.querySelector('.rte-cp-body')
  if (!body) return false
  const target = Array.from(document.querySelectorAll('.rte-chart-panel .rte-cp-section')).find(
    (el) => el.querySelector('.rte-cp-section-title')?.textContent?.trim() === '高级 JSON',
  )
  if (!target) return false
  body.scrollTop = Math.max(0, target.offsetTop - 8)
  return true
})
await page.waitForTimeout(1200)
const hasEditor = await page.locator('.rte-chart-panel .cm-editor, .rte-chart-panel .rte-cp-textarea-code').count()
await page.locator('.rte-chart-panel').screenshot({ path: `${out}/10-panel-advanced-json.png` })
log('高级 JSON 编辑器', jsonReady && hasEditor > 0, `editor=${hasEditor}`)

// 非法 JSON → 报错，不写回文档
const cmContent = page.locator('.rte-chart-panel .cm-content').first()
if (await cmContent.count()) {
  await cmContent.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('{ 非法 JSON')
  await page.waitForTimeout(300)
  const applyBtn = page.locator('.rte-chart-panel button', { hasText: '应用 JSON' }).first()
  await applyBtn.click()
  await page.waitForTimeout(500)
  const errText = (await page.locator('.rte-chart-panel .rte-cp-error').first().textContent()) || ''
  log('高级 JSON 非法输入被拦下', /JSON/i.test(errText), errText.trim().slice(0, 60))
} else {
  log('高级 JSON 非法输入被拦下', false, '没找到 CodeMirror 内容区')
}

/** 4.6 图表块内不再有操作条（类型下拉 / 编辑数据 / 删除）。 */
const noBlockBar = await page.evaluate(() => {
  const block = document.querySelector('.rte-echarts-block')
  if (!block) return { ok: false, why: '没找到图表块' }
  const text = block.textContent || ''
  return {
    ok:
      !block.querySelector('.rte-echarts-toolbar') &&
      !block.querySelector('select') &&
      !block.querySelector('button') &&
      !text.includes('编辑数据') &&
      !text.includes('ECharts 图表'),
    text: text.replace(/\s+/g, ' ').slice(0, 60),
  }
})
log('块内无操作条', noBlockBar.ok, JSON.stringify(noBlockBar))

/** 4.7 属性面板有「图表类型」下拉，且改类型会写回文档。 */
const typeSelect = page.locator('.rte-chart-panel .rte-cp-type-select').first()
if (await typeSelect.count()) {
  await typeSelect.selectOption('pie')
  await page.waitForTimeout(600)
  const liveType = await page.evaluate(() => {
    const ed = window.__rte?.editor
    let chartType = ''
    let seriesType = ''
    ed.state.doc.descendants((node) => {
      if (node.type?.name === 'echartsBlock' && !chartType) {
        chartType = node.attrs.chartType
        try {
          seriesType = JSON.parse(node.attrs.option || '{}').series?.[0]?.type || ''
        } catch {
          seriesType = ''
        }
      }
      return true
    })
    return { chartType, seriesType }
  })
  log(
    '面板改类型写回文档',
    liveType.chartType === 'pie' && liveType.seriesType === 'pie',
    JSON.stringify(liveType),
  )
  await page.screenshot({ path: `${out}/11-panel-type-switched.png` })
} else {
  log('面板改类型写回文档', false, '没找到图表类型下拉')
}

/** 5. 删除二次确认（取消不删，确认才删）。 */
const countCharts = () =>
  page.evaluate(() => {
    const ed = window.__rte?.editor
    let n = 0
    ed.state.doc.descendants((node) => {
      if (node.type?.name === 'echartsBlock') n += 1
      return true
    })
    return n
  })
const beforeDelete = await countCharts()
const delBtn = page.locator('.rte-chart-panel .rte-cp-btn-danger').first()
if (await delBtn.count()) {
  await delBtn.click()
  await page.waitForTimeout(600)
  const box = page.locator('.el-message-box').last()
  const text = (await box.textContent()) || ''
  log('删除二次确认', text.includes('删除'), text.replace(/\s+/g, ' ').slice(0, 60))
  await page.screenshot({ path: `${out}/08-delete-confirm.png` })
  const cancel = box.locator('button', { hasText: '取消' }).first()
  if (await cancel.count()) {
    await cancel.click()
    await page.waitForTimeout(400)
  }
  const afterCancel = await countCharts()
  log('取消不删', afterCancel === beforeDelete, `${beforeDelete} -> ${afterCancel}`)

  // 再删一次并确认：图表块应真的从文档里消失
  const delBtn2 = page.locator('.rte-chart-panel .rte-cp-btn-danger').first()
  if (await delBtn2.count()) {
    await delBtn2.click()
    await page.waitForTimeout(600)
    const box2 = page.locator('.el-message-box').last()
    const ok = box2.locator('button', { hasText: '确认删除' }).first()
    if (await ok.count()) {
      await ok.click()
      await page.waitForTimeout(800)
    }
    const afterConfirm = await countCharts()
    log('确认后图表被删掉', afterConfirm === beforeDelete - 1, `${beforeDelete} -> ${afterConfirm}`)
  }
} else {
  log('删除二次确认', false, '没找到删除按钮')
}

if (pageErrors.length) {
  console.log('页面错误：')
  for (const message of pageErrors.slice(0, 10)) console.log('  ' + message)
}

await browser.close()
const failed = notes.filter((item) => !item.ok)
console.log(`截图输出：${out}`)
if (failed.length || pageErrors.length) process.exitCode = 1
