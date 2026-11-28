/**
 * 图表块（ECharts）端到端：工具栏「图表」分组 → 按官方类别逐类插入 → 真实渲染 → 导出快照。
 *
 * 覆盖：
 * - 首次加载 echarts-gl 时，视口外延迟渲染不会作废正在加载的 3D 地球；
 * - 工具栏独立「图表」分组（一级分类 9 个下拉按钮，3D·GL 独立，合计 39 类）；
 * - 每个类别抽一个子类型插入，并验证真的渲染出图（SVG / WebGL Canvas）；
 * - data-option 往返、导出快照。
 *
 * 前置：API 与前端已启动。
 *   RTE_WEB_URL       前端地址，默认 http://127.0.0.1:5173
 *   RTE_DOCUMENT_ID   Y 模型样例文档 id，默认 4d5f428c-a6e7-45a7-b29e-304120fccbb5
 *                     （用 scripts/seed-e2e-fixtures.mjs 播出来；见 e2e-backend-up.sh）
 *   RTE_BASELINE_DIR  截图输出目录
 *   CHROME_PATH       浏览器可执行文件，默认 /usr/bin/google-chrome
 *
 * 有显卡环境的验证：
 *   1) 让 Chrome 用系统 GPU（不加 swiftshader）：E2E_USE_SYSTEM_GL=1
 *   2) 即使自动检测判定为软件渲染，也对 3D 地球做严格断言：E2E_FORCE_GPU=1
 *   一键：E2E_USE_SYSTEM_GL=1 E2E_FORCE_GPU=1 node scripts/rte-echarts-e2e.mjs
 *   或用 e2e-backend-up.sh --gpu
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const out = process.env.RTE_BASELINE_DIR || '/opt/cursor/artifacts'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const documentId = process.env.RTE_DOCUMENT_ID || '4d5f428c-a6e7-45a7-b29e-304120fccbb5'
mkdirSync(out, { recursive: true })

// 默认用 SwiftShader 跑 WebGL，保证无显卡环境也能跑 3D/GL 图；
// 有显卡机器可设 E2E_USE_SYSTEM_GL=1，让 Chrome 直接用系统 GPU。
const useSystemGL = process.env.E2E_USE_SYSTEM_GL === '1'
const glArgs = useSystemGL
  ? []
  : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...glArgs,
  ],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// 开场动画会铺满视口并让 app-root 进入 inert，先标记“下次不再展示”，
// 否则登录按钮点不到，CI 里的浏览器用例会一直等下去。
// 最大化工具栏一次只渲染一个功能区（ribbon）分组，图表按钮只在「图表」
// 功能区里；这里提前把当前功能区设为 charts，否则工具栏里一个图表按钮都没有。
await page.addInitScript(() => {
  localStorage.setItem('metamatrix:launch-skip', '1')
  localStorage.setItem('rte-ribbon-tab', 'charts')

  // 只给浏览器原生观察器加测试日志，不改变回调、触发时机或生产渲染逻辑。
  // 首次 GL 竞态用例靠这些日志确认：ResizeObserver 确实发起了二次 render，
  // 且这次 render 确实因为位于视口外而注册了 IntersectionObserver。
  const resizeLog = []
  const intersectionLog = []
  window.__E2E_CHART_RESIZE_LOG__ = resizeLog
  window.__E2E_CHART_INTERSECTION_LOG__ = intersectionLog
  const previewSelector = '.pm-overlay .rte-echarts-preview'

  const NativeResizeObserver = window.ResizeObserver
  window.ResizeObserver = class extends NativeResizeObserver {
    constructor(callback) {
      super((entries, observer) => {
        for (const entry of entries) {
          const target = entry.target
          if (!(target instanceof Element) || !target.matches(previewSelector)) continue
          const rect = target.getBoundingClientRect()
          resizeLog.push({
            target,
            top: rect.top,
            bottom: rect.bottom,
            width: target.clientWidth,
            viewport: window.innerHeight,
          })
        }
        callback(entries, observer)
      })
    }
  }

  const NativeIntersectionObserver = window.IntersectionObserver
  window.IntersectionObserver = class extends NativeIntersectionObserver {
    observe(target) {
      if (target instanceof Element && target.matches(previewSelector)) {
        intersectionLog.push(target)
      }
      super.observe(target)
    }
  }
})
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
// 登录成功后前端才把令牌写进 localStorage；固定 sleep 在慢机器/CI 上会跑在写入之前，
// 紧接着 goto 画布会被路由守卫弹回登录页，后续就找不到任何编辑块。
await page.waitForFunction(
  () => !!localStorage.getItem('metamatrix:auth:token'),
  null,
  { timeout: 20000 },
)

await page.goto(`${web}/canvas/y-model?documentId=${documentId}`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(1500)
const block = page.locator('.ym-block', { has: page.locator('h3', { hasText: '如何定性定量分析' }) })
await block.locator('button[aria-label="最大化"]').click()
await page.waitForSelector('.pm-overlay .ProseMirror')
await page.locator('.pm-overlay .ProseMirror p').first().click({ force: true })
await page.keyboard.press('End')

/**
 * 检测 WebGL 渲染环境：是软件渲染（SwiftShader / llvmpipe 等）还是真实 GPU。
 * 3D 地球在软件渲染下只建实例、不出画布；有真实 GPU 时必须严格断言它渲染出 canvas。
 * 可用 E2E_FORCE_GPU=1 强制严格断言（已知有显卡但自动检测失败时）。
 */
const forceGPU = process.env.E2E_FORCE_GPU === '1'
const gpuInfo = await page.evaluate(() => {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return { hasGL: false, software: true, renderer: 'no-webgl' }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : 'unknown'
    // 常见软件渲染器标识：SwiftShader / llvmpipe / softpipe / lavapipe / Mesa
    const software = /swiftshader|llvmpipe|softpipe|lavapipe|mesa|software/i.test(renderer)
    return { hasGL: true, software, renderer }
  } catch (e) {
    return { hasGL: false, software: true, renderer: String(e) }
  }
})
const isSoftwareGL = gpuInfo.software
// 有真实 GPU 或显式 E2E_FORCE_GPU=1 时，对 3D 地球做严格渲染断言。
const strictGlobe = !isSoftwareGL || forceGPU
log(
  'WebGL 渲染环境',
  gpuInfo.hasGL,
  JSON.stringify({ renderer: gpuInfo.renderer, software: isSoftwareGL, strictGlobe, forceGPU }),
)

/**
 * 零、首次 GL 加载竞态：3D 地球必须先于其他 GL 图表插入。
 *
 * Playwright 挂起 echarts-gl/components 请求后，首次 render 会停在 loadEchartsGl()。
 * 此时收窄图表预览并滚动正文让图表完全离开视口，触发真实 ResizeObserver：
 * 第二次 render 只能注册 IntersectionObserver，不能递增 renderSeq 作废首次任务。
 * 放行网络后，软件渲染环境至少必须有 ECharts 实例；真实 GPU 下还必须有 canvas。
 */
const glModulePattern = /\/echarts-gl_components\.js(?:\?|$)/
let releaseGlModule
const glModuleGate = new Promise((resolve) => {
  releaseGlModule = resolve
})
await page.route(glModulePattern, async (route) => {
  await glModuleGate
  await route.continue()
})

const firstGlRequest = page.waitForRequest(glModulePattern, { timeout: 15000 })
const raceGroupBtn = page.locator('.pm-overlay button[title^="插入3D·GL图表"]').first()
await raceGroupBtn.evaluate((el) => (el instanceof HTMLElement ? el.click() : undefined))
const raceCategory = page.locator('body > .rte-menu-echarts .rte-menu-cat', { hasText: '3D 地球' })
await raceCategory.waitFor({ state: 'visible', timeout: 5000 })
await raceCategory.click({ force: true })
const raceTemplate = page.locator('body > .rte-menu-echarts .rte-menu-sub button').first()
await raceTemplate.click({ force: true })
const raceBlock = page.locator('.pm-overlay .rte-echarts-block[data-chart-type="globe"]').last()
const racePreview = raceBlock.locator('.rte-echarts-preview')
await raceBlock.waitFor({ state: 'attached', timeout: 5000 })
// 请求已经发出但被 route 挂起，证明首个任务正处在 GL 异步加载窗口内。
await firstGlRequest
log('首次 3D 地球触发 GL 动态加载', true)

const observerCountsBefore = await page.evaluate(() => ({
  resize: window.__E2E_CHART_RESIZE_LOG__.length,
  intersection: window.__E2E_CHART_INTERSECTION_LOG__.length,
}))
await raceBlock.evaluate((node) => {
  const preview = node.querySelector('.rte-echarts-preview')
  const canvas = preview?.closest('.rte-canvas')
  if (!(preview instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return
  // 直接收窄被观察元素，排除纸张最大宽度、居中布局等外层 CSS 的影响。
  // 这是真实 CSS 布局变化，浏览器仍会按原生机制投递 ResizeObserver。
  preview.style.width = '600px'
  // 在编辑器外追加测试专用滚动空间，保证 400px 高的图表能完全滚出视口。
  // 不把测试节点插进 ProseMirror 文档，避免被当成用户内容或触发文档更新。
  const spacer = document.createElement('div')
  spacer.className = 'e2e-race-scroll-spacer'
  spacer.style.height = '1800px'
  spacer.style.flexShrink = '0'
  canvas.appendChild(spacer)
  canvas.scrollTop = canvas.scrollHeight
})
const raceObserved = await page
  .waitForFunction(
    (before) => {
      const blocks = document.querySelectorAll('.pm-overlay .rte-echarts-block[data-chart-type="globe"]')
      const preview = blocks[blocks.length - 1]?.querySelector('.rte-echarts-preview')
      if (!preview) return false
      const resizeLog = window.__E2E_CHART_RESIZE_LOG__
      const intersectionLog = window.__E2E_CHART_INTERSECTION_LOG__
      const resizedOutOfView = resizeLog.slice(before.resize).some((item) => {
        if (item.target !== preview || item.width <= 0) return false
        return item.bottom <= 0 || item.top >= item.viewport
      })
      const deferredByIntersection = intersectionLog
        .slice(before.intersection)
        .includes(preview)
      return resizedOutOfView && deferredByIntersection
    },
    observerCountsBefore,
    { timeout: 5000 },
  )
  .then(() => true)
  .catch(() => false)
const pendingRace = await racePreview.evaluate((node, before) => {
  const rect = node.getBoundingClientRect()
  const canvas = node.closest('.rte-canvas')
  const resizeEvents = window.__E2E_CHART_RESIZE_LOG__.slice(before.resize)
  return {
    initialized: node.hasAttribute('_echarts_instance_'),
    error: node.querySelector('.rte-echarts-error')?.textContent || '',
    layout: {
      top: rect.top,
      bottom: rect.bottom,
      width: node.clientWidth,
      viewport: window.innerHeight,
      scrollTop: canvas?.scrollTop ?? -1,
      scrollHeight: canvas?.scrollHeight ?? -1,
      clientHeight: canvas?.clientHeight ?? -1,
    },
    // 日志里保留数值快照，失败时能区分「没滚出去」和「观察器没触发」。
    resizeEvents: resizeEvents.map((item) => ({
      top: item.top,
      bottom: item.bottom,
      width: item.width,
      viewport: item.viewport,
      isTarget: item.target === node,
    })),
    intersectionObserved: window.__E2E_CHART_INTERSECTION_LOG__
      .slice(before.intersection)
      .includes(node),
  }
}, observerCountsBefore)
log(
  'GL 等待期间发生视口外延迟渲染',
  raceObserved && !pendingRace.initialized && !pendingRace.error,
  JSON.stringify(pendingRace),
)

// 无论上面的时序断言是否成功都放行请求，避免失败用例卡在路由门控上。
releaseGlModule()
await raceBlock
  .locator('.rte-echarts-preview[_echarts_instance_]')
  .waitFor({ state: 'attached', timeout: 20000 })
  .catch(() => {})
if (strictGlobe) {
  await racePreview.locator('canvas').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {})
}
const raceResult = await racePreview.evaluate((node) => ({
  initialized: !!node.getAttribute('_echarts_instance_'),
  canvas: !!node.querySelector('canvas'),
  error: node.querySelector('.rte-echarts-error')?.textContent || '',
  clientWidth: node.clientWidth,
  childCount: node.childElementCount,
}))
log(
  '首次 GL 加载完成后仍初始化 3D 地球',
  raceResult.initialized && !raceResult.error && (!strictGlobe || raceResult.canvas),
  JSON.stringify({ ...raceResult, strictGlobe }),
)
await page.unroute(glModulePattern)

// 恢复后续 39 类用例所依赖的正文布局、滚动位置和选区。
await raceBlock.evaluate((node) => {
  const preview = node.querySelector('.rte-echarts-preview')
  const canvas = preview?.closest('.rte-canvas')
  if (preview instanceof HTMLElement) preview.style.width = ''
  canvas?.querySelector('.e2e-race-scroll-spacer')?.remove()
  if (canvas instanceof HTMLElement) canvas.scrollTop = 0
})
// 删除竞态专用地球，避免改变后续用例「第一块图表是 SVG 折线图」的既有前提。
// GL 模块已经缓存不影响后续覆盖；这里只清理测试文档内容。
await raceBlock.click({ force: true })
await page.keyboard.press('Backspace')
await raceBlock.waitFor({ state: 'detached', timeout: 5000 })
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
  // title 带分组说明（「插入基础图表：折线 / 柱状 / …」），用前缀匹配。
  groupCount += await page.locator(`.pm-overlay button[title^="插入${label}图表"]`).count()
}
log('工具栏图表一级分类按钮', groupCount >= 9, `数量=${groupCount}`)

/** 三、每个分类下抽每个类别的一个子类型插入，并验证真的渲染出来 */
const inserted = []
for (const groupLabel of groupLabels) {
  const groupBtn = page.locator(`.pm-overlay button[title^="插入${groupLabel}图表"]`).first()
  if ((await groupBtn.count()) === 0) {
    log(`分类 ${groupLabel} 没有下拉按钮`, false)
    continue
  }
  let menuOpen = false
  const openMenu = async () => {
    if (menuOpen) {
      // force 点击仍会按坐标命中最上层元素；工具栏靠右的分组可能被浮层/裁切盖住，
      // 直接对按钮派发 click 最稳（走的是元素自身的事件，不依赖命中测试）。
      await groupBtn.evaluate((el) => (el instanceof HTMLElement ? el.click() : undefined))
      await page.waitForTimeout(200)
      menuOpen = false
    }
    await groupBtn.evaluate((el) => (el instanceof HTMLElement ? el.click() : undefined))
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
    // 3D / GL 图要先初始化 WebGL 再渲染首帧，无显卡环境（SwiftShader）里
    // 3D 地球尤其慢；固定 600ms 会把它误判成「没渲染」。这里等首帧出现。
    await last
      .locator('.rte-echarts-preview svg, .rte-echarts-preview canvas')
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {})
    const rendered = await last.evaluate((node) => {
      const preview = node.querySelector('.rte-echarts-preview')
      return {
        svg: !!preview?.querySelector('svg'),
        canvas: !!preview?.querySelector('canvas'),
        error: preview?.querySelector('.rte-echarts-error')?.textContent || '',
        clientWidth: preview?.clientWidth ?? -1,
        childCount: preview?.childElementCount ?? -1,
      }
    })
    const ok = (rendered.svg || rendered.canvas) && !rendered.error
    // 3D 地球在软件渲染（SwiftShader）环境里只建实例、不出画布；
    // 有真实 GPU 或显式 E2E_FORCE_GPU=1 时必须严格断言它渲染出 canvas。
    const environmentExempt = label.includes('3D 地球') && isSoftwareGL && !forceGPU
    log(
      `类别 ${label} 插入并渲染`,
      environmentExempt ? !rendered.error : ok,
      JSON.stringify(environmentExempt ? { ...rendered, environmentExempt } : rendered),
    )
    inserted.push({ label, ok: environmentExempt ? !rendered.error : ok })
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
