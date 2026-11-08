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
    label: (document.querySelector('.rte-toolbar-fold')?.textContent || '').trim(),
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
  const collapsed = await toolbarFoldState()
  if (!foldChecked) {
    log(
      '最大化默认收成一行',
      collapsed.oneRow && collapsed.label === '展开' && collapsed.height > 0 && collapsed.height < 90,
      `h=${collapsed.height} label=${collapsed.label}`,
    )
    await page.screenshot({ path: `${out}/00-folded.png` })
    foldChecked = true
  }
  await page.locator('.rte-toolbar-fold').click()
  await page.waitForTimeout(200)
  const opened = await toolbarFoldState()
  log(
    '展开后放出其余工具栏',
    !opened.oneRow && opened.label === '收起' && opened.height > collapsed.height + 40,
    `h=${collapsed.height} → ${opened.height}`,
  )
}

const groupSnapshot = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.rte-toolbar-tools .rte-tool-group')].map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.dataset.groupId || '',
        label: (el.querySelector('.rte-group-label')?.textContent || '').trim(),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        transform: el.style.transform || '',
        drop: el.classList.contains('is-drop-target'),
      }
    }),
  )

await openExpanded()
const before = await groupSnapshot()
log('最大化工具栏至少两行', new Set(before.map((g) => Math.round(g.top))).size >= 2, `${before.length} 组`)

const edit = before.find((g) => g.id === 'edit')
const style = before.find((g) => g.id === 'style')
const paragraph = before.find((g) => g.id === 'paragraph')
const handle = await page.locator('.rte-tool-group[data-group-id="edit"] .rte-group-handle').boundingBox()
if (!edit || !style || !paragraph || !handle) {
  log('能定位编辑/字体/段落分组', false, JSON.stringify(before.map((g) => `${g.id}@${Math.round(g.left)},${Math.round(g.top)} ${Math.round(g.width)}×${Math.round(g.height)}`)))
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
  const slot = await page.evaluate(() => {
    const el = document.querySelector('.rte-toolbar-tools .rte-tool-group.is-dragging')
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  log(
    '按下后 18px 出现跟随芯片，分组收成窄占位并留在原位',
    chip.includes('编辑') &&
      !!movedEdit &&
      Math.abs(movedEdit.left - edit.left) < 8 &&
      !movedEdit.transform &&
      !!slot &&
      slot.width <= 120 &&
      slot.height <= 44,
    `chip=${chip} left ${edit.left.toFixed(0)} → ${movedEdit?.left.toFixed(0)} slot=${slot?.width?.toFixed(0)}×${slot?.height?.toFixed(0)}`,
  )
  log('拖动不进入原生 dragstart', dragStarts === 0, String(dragStarts))
  await page.screenshot({ path: `${out}/01-follow.png` })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const afterNudge = (await groupSnapshot()).map((g) => g.id)
  log('轻拖 18px 只跟随，不把分组甩到下一行', afterNudge[0] === 'edit' && afterNudge[1] === 'style', afterNudge.slice(0, 4).join('、'))

  const intoX = style.left + Math.min(120, style.width * 0.2)
  const intoY = style.top + Math.min(18, style.height / 2)
  const styleMid = style.left + style.width / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(intoX, startY, { steps: 8 })
  await page.mouse.move(intoX, intoY, { steps: 8 })
  await page.waitForTimeout(80)
  const early = await groupSnapshot()
  const dropId = early.find((g) => g.drop)?.id || ''
  const earlyIds = early.map((g) => g.id)
  log(
    '进入宽分组远未到中线，松手前就换到它后面',
    earlyIds.indexOf('edit') === earlyIds.indexOf('style') + 1 && intoX < styleMid - 80,
    `order=${earlyIds.slice(0, 4).join('、')} drop=${dropId} pointer=${intoX.toFixed(0)} mid=${styleMid.toFixed(0)} width=${style.width.toFixed(0)}`,
  )
  await page.screenshot({ path: `${out}/02-early-slot.png` })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const dropped = await groupSnapshot()
  const ids = dropped.map((g) => g.id)
  log(
    '松手后编辑分组插到字体分组后面',
    ids.indexOf('edit') === ids.indexOf('style') + 1,
    ids.join('、'),
  )
  const chipGone = await page.evaluate(() => !document.querySelector('.rte-toolbar-drag-chip'))
  log('松手后跟随芯片消失', chipGone && dropped.every((g) => !g.transform), dropped.find((g) => g.transform)?.transform || '')
  await page.screenshot({ path: `${out}/03-dropped.png` })
}

await openExpanded()
const rows = await groupSnapshot()
const styleRow = rows.find((g) => g.id === 'style')
const paragraphHandle = await page.locator('.rte-tool-group[data-group-id="paragraph"] .rte-group-handle').boundingBox()
if (!styleRow || !paragraphHandle) {
  log('字体分组和段落手柄都在', false, rows.map((g) => g.id).join('、'))
} else {
  const fromX = paragraphHandle.x + paragraphHandle.width / 2
  const fromY = paragraphHandle.y + paragraphHandle.height / 2
  const toX = styleRow.left + 10
  const toY = styleRow.top + Math.min(16, styleRow.height / 2)
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(toX, toY, { steps: 16 })
  await page.waitForTimeout(80)
  const over = await groupSnapshot()
  const overIds = over.map((g) => g.id)
  log(
    '拖到上一行宽分组左缘时，松手前就排到该组前面，而不是更靠左的上一段',
    overIds[0] === 'edit' && overIds.indexOf('paragraph') === overIds.indexOf('style') - 1,
    `order=${overIds.slice(0, 4).join('、')} pointer=(${toX.toFixed(0)},${toY.toFixed(0)}) style=(${styleRow.left.toFixed(0)},${styleRow.top.toFixed(0)})`,
  )
  await page.screenshot({ path: `${out}/04-second-row.png` })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = (await groupSnapshot()).map((g) => g.id)
  log(
    '松手后段落分组排到字体分组前面，编辑分组仍在最前',
    after[0] === 'edit' && after.indexOf('paragraph') === after.indexOf('style') - 1,
    after.join('、'),
  )
}

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

log('页面没有脚本错误', pageErrors.length === 0, pageErrors.join(' | '))
const failed = notes.filter((note) => !note.ok)
console.log(failed.length ? `DRAG_E2E_FAIL ${failed.length}` : 'DRAG_E2E_OK')
await browser.close()
process.exit(failed.length ? 1 : 0)
