import fs from 'fs';
import { chromium } from 'playwright-core';
const P='3f030ea3-61a5-4156-9b77-a9ca1d29d107';
const tok=fs.readFileSync('/tmp/tok.txt','utf8').trim();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport:{width:1600,height:950} });
const page = await ctx.newPage();
const errs=[]; page.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)); });
page.on('pageerror', e=>errs.push('PAGEERR '+String(e).slice(0,160)));
await page.addInitScript(`localStorage.setItem('metamatrix:auth:token', ${JSON.stringify(tok)});`);
await page.goto(`http://localhost:5173/projects/${P}/knowledge`,{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
const splash = page.locator('.splash');
if (await splash.count()) { const b=splash.locator('button'); if (await b.count()) await b.first().click(); await page.waitForTimeout(1000); }
await page.locator('.kn-tree__node-label', { hasText: '客户管理' }).first().click();
await page.waitForTimeout(3000);

const head = page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
console.log('header count', await page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').count());
await head.hover();
await page.waitForTimeout(400);
const trig = head.locator('.be-colmenu__trigger');
console.log('trigger visible', await trig.count(), await trig.first().isVisible());
await trig.first().click();
await page.waitForTimeout(800);
const menu = await page.evaluate(()=>{
  const p=document.querySelector('.be-colmenu__popper');
  if(!p) return null;
  const cs=getComputedStyle(p);
  const items=[...p.querySelectorAll('.be-colmenu__item')].map(i=>i.innerText.trim());
  return { w:Math.round(p.getBoundingClientRect().width), br:cs.borderRadius, shadow:cs.boxShadow, items };
});
console.log('menu', JSON.stringify(menu));
await page.screenshot({ path:'/tmp/basev/i1_colmenu.png' });

// 测试排序
const asc = page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '升序排列' }).first();
if (await asc.count()) {
  await asc.click();
  await page.waitForTimeout(2000);
  const firstCell = await page.evaluate(()=>{
    const rows=[...[...document.querySelectorAll('.be-grid .vxe-body--row')].filter(r=>r.getBoundingClientRect().height>0)];
    return rows.slice(0,3).map(r=>r.querySelectorAll('.vxe-cell')[2]?.innerText.trim());
  });
  console.log('sorted first cells', JSON.stringify(firstCell));
  await page.screenshot({ path:'/tmp/basev/i2_sorted.png' });
}
// 再次打开菜单 -> 筛选此列
const head2 = page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
await head2.hover(); await page.waitForTimeout(300);
await head2.locator('.be-colmenu__trigger').first().click();
await page.waitForTimeout(700);
const filt = page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '筛选此列' }).first();
if (await filt.count()) {
  await filt.click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path:'/tmp/basev/i3_filter.png' });
  const qp = await page.evaluate(()=>{
    const d=document.querySelector('.be-modal .el-dialog');
    return d? { title:(d.querySelector('.el-dialog__title')||{}).textContent, br:getComputedStyle(d).borderRadius } : null;
  });
  console.log('queryPanel', JSON.stringify(qp));
  const c=page.locator('.be-modal button',{hasText:/取消|关闭/}).first();
  if (await c.count()) await c.click();
  await page.waitForTimeout(500);
}
console.log('errors', errs.length, errs.slice(0,5).join(' | '));
await browser.close();
