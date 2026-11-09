/**
 * 工具栏分组拖拽灵敏度。
 *
 * 前置：vite dev 在 RTE_WEB_URL（默认 http://127.0.0.1:5173）。
 * 覆盖：跟随芯片、分组留在原位并在拖动中换位、原生 dragstart 不抢走 pointermove、
 * 宽分组不用拖过中线就换位、换行后按所在行命中。
 */
import pw from 'playwright-core'
import { mkdirSync } from 'node:fs'

const { chromium } = pw
const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const web = process.env.RTE_WEB_URL || 'http://127.0.0.1:5173'
const out = process.env.RTE_DRAG_OUT || '/opt/cursor/artifacts/rte-toolbar-drag'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['no-sandbox', 'disable-dev-shm-usage'].map((flag) => `--${flag}`),
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
const ignorable = (text) => /favicon|Failed to load resource/i.test(text)
page.on('pageerror', (err) => {
  if (!ignorable(String(err))) pageErrors.push(String(err))
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !ignorable(msg.text())) pageErrors.push(msg.text())
})

const notes = []
const log = (step, ok, detail) => {
  notes.push({ step, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}`, detail ?? '')
}

const toolbarFoldState = () =>
  page.evaluate(() => ({
    oneRow: document.querySelector('.rte-toolbar')?.classList.contains('is-one-row') === true,
    label: (document.querySelector('.rte-toolbar-fold .rte-tool-label')?.textContent || '').trim(),
    height: Math.round(document.querySelector('.rte-toolbar')?.getBoundingClientRect().height || 0),
  }))

let foldChecked = false

async function openExpanded() {
  await page.goto(`${web}/rte-code-gap-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__RTE_PREVIEW_READY__ === true, null, { timeout: 60000 })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    window.__toolbarDragStarts = 0
    document.addEventListener('dragstart', () => {
      window.__toolbarDragStarts += 1
    }, true)
  })
  const initial = await toolbarFoldState()
  if (!foldChecked) {
    log(
      '最大化默认展开工具栏',
      !initial.oneRow && initial.label === '收起' && initial.height > 120,
      `h=${initial.height} label=${initial.label}`,
    )
    await page.locator('.rte-toolbar-fold').click()
    await page.waitForTimeout(200)
    const collapsed = await toolbarFoldState()
    const foldRow = await page.evaluate(() => {
      const tools = document.querySelector('.rte-toolbar-tools')
      const tabs = [...document.querySelectorAll('.rte-ribbon-tab')].map((el) => el.textContent.trim())
      return {
        display: tools ? getComputedStyle(tools).display : 'missing',
        tabs,
      }
    })
    log(
      '收起功能区后只留栏目',
      collapsed.oneRow &&
        collapsed.label === '展开' &&
        foldRow.display === 'none' &&
        foldRow.tabs.includes('编辑') &&
        collapsed.height > 0 &&
        collapsed.height < 120,
      `h=${collapsed.height} label=${collapsed.label} tools=${foldRow.display} tabs=${foldRow.tabs.join('、')}`,
    )
    await page.screenshot({ path: `${out}/00-folded.png` })
    await page.locator('.rte-toolbar-fold').click()
    await page.waitForTimeout(200)
    const opened = await toolbarFoldState()
    log(
      '展开后放出其余工具栏',
      !opened.oneRow && opened.label === '收起' && opened.height > collapsed.height + 40,
      `h=${collapsed.height} → ${opened.height}`,
    )
    foldChecked = true
    return
  }
  if (initial.oneRow) {
    await page.locator('.rte-toolbar-fold').click()
    await page.waitForTimeout(200)
  }
}

const groupSnapshot = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-group')].map((el) => {
      const own = el.getBoundingClientRect()
      const kids = [...el.children]
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 2 && rect.height > 2)
      const flowing = getComputedStyle(el).display === 'contents' && kids.length > 0
      const source = flowing ? kids : [own]
      const lines = []
      for (const rect of [...source].sort((a, b) => a.top - b.top || a.left - b.left)) {
        const mid = rect.top + rect.height / 2
        const line = lines.find((row) => Math.abs(row.mid - mid) < 16)
        if (!line) {
          lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, mid })
        } else {
          line.left = Math.min(line.left, rect.left)
          line.right = Math.max(line.right, rect.right)
          line.top = Math.min(line.top, rect.top)
          line.bottom = Math.max(line.bottom, rect.bottom)
          line.mid = (line.mid + mid) / 2
        }
      }
      const first = lines[0] || { left: own.left, right: own.right, top: own.top, bottom: own.bottom }
      const last = lines[lines.length - 1] || first
      return {
        id: el.dataset.groupId || '',
        label: (el.querySelector('.rte-group-label')?.textContent || '').trim(),
        left: first.left,
        top: first.top,
        width: first.right - first.left,
        height: first.bottom - first.top,
        endLeft: last.left,
        endTop: last.top,
        endWidth: last.right - last.left,
        endHeight: last.bottom - last.top,
        transform: el.style.transform || '',
        drop: el.classList.contains('is-drop-target'),
      }
    }),
  )

await openExpanded()
const flow = await page.evaluate(() => {
  const tools = document.querySelector('.rte-toolbar-tools')
  const bar = document.querySelector('.rte-mode-bar')
  const fold = document.querySelector('.rte-toolbar-fold')
  const toolsRect = tools?.getBoundingClientRect()
  const rows = []
  for (const el of document.querySelectorAll('.rte-toolbar-tools .rte-tool-group > *')) {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const mid = rect.top + rect.height / 2
    const row = rows.find((item) => Math.abs(item.mid - mid) < 16)
    if (!row) rows.push({ mid, right: rect.right })
    else {
      row.right = Math.max(row.right, rect.right)
      row.mid = (row.mid + mid) / 2
    }
  }
  const gaps = toolsRect ? rows.map((row) => Math.round(toolsRect.right - row.right)) : []
  const foldRect = fold?.getBoundingClientRect()
  const barRect = bar?.getBoundingClientRect()
  return {
    foldInBar: !!bar && !!fold && bar.contains(fold),
    foldLabel: (fold?.querySelector('.rte-tool-label')?.textContent || '').trim(),
    sameRow:
      !!foldRect &&
      !!barRect &&
      foldRect.top < barRect.bottom &&
      foldRect.bottom > barRect.top,
    gaps,
  }
})
log(
  '展开收起在编辑、预览、源码这一栏',
  flow.foldInBar && flow.sameRow && flow.foldLabel === '收起',
  `label=${flow.foldLabel}`,
)
const ribbon = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.rte-ribbon-tab')].map((el) => ({
    label: el.textContent.trim(),
    active: el.classList.contains('active'),
  }))
  const groups = [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-group')].map((el) => el.dataset.groupId)
  return { tabs, groups }
})
log(
  '功能区默认停在编辑',
  ribbon.tabs.some((tab) => tab.label === '编辑' && tab.active) &&
    ribbon.tabs.some((tab) => tab.label === '字体与颜色') &&
    ribbon.groups.length === 1 &&
    ribbon.groups[0] === 'edit',
  `tabs=${ribbon.tabs.map((tab) => tab.label + (tab.active ? '*' : '')).join('、')} groups=${ribbon.groups.join('、')}`,
)
const before = await groupSnapshot()
log('编辑栏目只显示编辑分组', before.length === 1 && before[0]?.id === 'edit', `${before.length} 组`)
const large = await page.evaluate(() => {
  const btn = document.querySelector('.rte-tool-group .rte-tool')
  const icon = btn?.querySelector('.rte-tool-icon')
  const label = btn?.querySelector('.rte-tool-label')
  if (!btn || !icon || !label) return null
  const ir = icon.getBoundingClientRect()
  const lr = label.getBoundingClientRect()
  const br = btn.getBoundingClientRect()
  return {
    dir: getComputedStyle(btn).flexDirection,
    icon: Math.round(ir.height),
    labelW: Math.round(lr.width),
    labelBelow: lr.top >= ir.bottom - 4,
    h: Math.round(br.height),
  }
})
log(
  '按钮是大图标在上、文字在下',
  !!large && large.dir === 'column' && large.icon >= 28 && large.labelW >= 12 && large.labelBelow && large.h >= 60,
  large ? `dir=${large.dir} icon=${large.icon} labelW=${large.labelW} below=${large.labelBelow} h=${large.h}` : 'missing',
)

const edit = before.find((g) => g.id === 'edit')
const handle = await page.locator('.rte-tool-group[data-group-id="edit"] .rte-group-handle').boundingBox()
if (!edit || !handle) {
  log('能定位编辑分组', false, JSON.stringify(before.map((g) => g.id)))
} else {
  const startX = handle.x + handle.width / 2
  const startY = handle.y + handle.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 18, startY, { steps: 6 })
  const followed = await groupSnapshot()
  const movedEdit = followed.find((g) => g.id === 'edit')
  const dragStarts = await page.evaluate(() => window.__toolbarDragStarts)
  const chip = await page.evaluate(() => document.querySelector('.rte-toolbar-drag-chip')?.textContent || '')
  log(
    '按下后 18px 出现跟随芯片，分组留在原位',
    chip.includes('编辑') && !!movedEdit && Math.abs(movedEdit.left - edit.left) < 8 && !movedEdit.transform,
    `chip=${chip} left ${edit.left.toFixed(0)} → ${movedEdit?.left.toFixed(0)} transform=${movedEdit?.transform}`,
  )
  log('拖动不进入原生 dragstart', dragStarts === 0, String(dragStarts))
  await page.screenshot({ path: `${out}/01-follow.png` })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const afterNudge = (await groupSnapshot()).map((g) => g.id)
  log('轻拖后仍停在编辑分组', afterNudge.length === 1 && afterNudge[0] === 'edit', afterNudge.join('、'))
  const chipGone = await page.evaluate(() => !document.querySelector('.rte-toolbar-drag-chip'))
  log('松手后跟随芯片消失', chipGone, '')
}

await page.getByRole('tab', { name: '字体与颜色', exact: true }).click()
await page.waitForTimeout(150)
const styleOnly = await page.evaluate(() =>
  [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-group')].map((el) => el.dataset.groupId),
)
log('字体与颜色栏目只显示字体分组', styleOnly.length === 1 && styleOnly[0] === 'style', styleOnly.join('、'))
await page.getByRole('tab', { name: '段落与列表', exact: true }).click()
await page.waitForTimeout(150)
const paragraphOnly = await page.evaluate(() =>
  [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-group')].map((el) => el.dataset.groupId),
)
log('段落与列表栏目只显示段落分组', paragraphOnly.length === 1 && paragraphOnly[0] === 'paragraph', paragraphOnly.join('、'))

await page.setViewportSize({ width: 1280, height: 900 })
await page.goto(`${web}/rte-compact-preview.html`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__RTE_COMPACT_READY__ === true, null, { timeout: 60000 })
await page.waitForTimeout(300)
await page.locator('.rte-more-wrap button', { hasText: '更多' }).first().click()
await page.waitForSelector('.rte-more-menu', { state: 'visible', timeout: 5000 })
const capsules = page.locator('.rte-more-menu .rte-more-capsule')
const capsuleCount = await capsules.count()
if (capsuleCount < 2) {
  log('更多菜单里至少两组可拖', false, String(capsuleCount))
} else {
  const first = await capsules.nth(0).boundingBox()
  const secondGroup = page.locator('.rte-more-menu .rte-more-group').nth(1)
  const secondBox = await secondGroup.boundingBox()
  const secondId = await secondGroup.getAttribute('data-group-id')
  const thirdId = await page.locator('.rte-more-menu .rte-more-group').nth(2).getAttribute('data-group-id')
  if (!first || !secondBox || !secondId || !thirdId) {
    log('更多菜单分组盒子可读', false, '')
  } else {
    const heightLead = Math.min(72, Math.max(8, secondBox.height * 0.28), secondBox.height * 0.45)
    const intoMenu = secondBox.y + heightLead + 6
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
    await page.mouse.down()
    await page.mouse.move(secondBox.x + 24, intoMenu, { steps: 10 })
    await page.waitForTimeout(80)
    const menuDrop = await page.evaluate(() => {
      const el = document.querySelector('.rte-more-group.is-drop-target')
      const dragging = document.querySelector('.rte-more-group.is-dragging')
      return {
        drop: el?.dataset.groupId || '',
        transform: dragging?.style.transform || '',
        chip: !!document.querySelector('.rte-toolbar-drag-chip'),
        open: !!document.querySelector('.rte-more-menu'),
      }
    })
    log('更多菜单里向下拖，出现跟随芯片且菜单不收起', menuDrop.open && menuDrop.chip && !menuDrop.transform, `chip=${menuDrop.chip} transform=${menuDrop.transform}`)
    log(
      '更多菜单按分组高度提前换到下一组后面，不必拖到中线',
      menuDrop.drop === thirdId && intoMenu < secondBox.y + secondBox.height / 2,
      `drop=${menuDrop.drop} third=${thirdId} lead=${heightLead.toFixed(0)} height=${secondBox.height.toFixed(0)}`,
    )
    await page.screenshot({ path: `${out}/05-more-menu.png` })
    await page.mouse.up()
  }
}

await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${web}/canvas/dual-triangle`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.locator('[data-dt-card="aesthetics"] .ProseMirror').click()
await page.waitForTimeout(300)
const canvasBar = await page.evaluate(() => {
  const card = document.querySelector('[data-dt-card="aesthetics"]')
  const groups = [...(card?.querySelectorAll('.rte-tool-group') || [])].map((el) => {
    const rect = el.getBoundingClientRect()
    const tools = [...el.querySelectorAll('.rte-tool')].map((node) => node.getBoundingClientRect())
    const handle = el.querySelector('.rte-group-handle')?.getBoundingClientRect()
    const toolTops = new Set(tools.map((r) => Math.round(r.top)))
    const centerGap =
      handle && tools[0]
        ? Math.abs(handle.top + handle.height / 2 - (tools[0].top + tools[0].height / 2))
        : 0
    return {
      id: el.dataset.groupId || '',
      h: Math.round(rect.height),
      dir: getComputedStyle(el).flexDirection,
      wrap: getComputedStyle(el).flexWrap,
      rows: toolTops.size,
      centerGap: Math.round(centerGap),
    }
  })
  return { groups }
})
log(
  '画布小编辑器分组保持横排，按钮不再折行',
  canvasBar.groups.length >= 4 &&
    canvasBar.groups.every(
      (g) => g.h <= 40 && g.dir === 'row' && g.wrap === 'nowrap' && g.rows <= 1 && g.centerGap <= 4,
    ),
  canvasBar.groups.map((g) => `${g.id}:${g.h}/按钮${g.rows}行/偏差${g.centerGap}`).join(' '),
)
await page.locator('[data-dt-card="aesthetics"]').screenshot({ path: `${out}/06-canvas-card.png` })

log('页面没有脚本错误', pageErrors.length === 0, pageErrors.join(' | '))
const failed = notes.filter((note) => !note.ok)
console.log(failed.length ? `DRAG_E2E_FAIL ${failed.length}` : 'DRAG_E2E_OK')
await browser.close()
process.exit(failed.length ? 1 : 0)
