import fs from 'fs';
import { chromium } from 'playwright-core';
const P='3f030ea3-61a5-4156-9b77-a9ca1d29d107';
const tok=fs.readFileSync('/tmp/tok.txt','utf8').trim();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport:{width:1600,height:950} });
const page = await ctx.newPage();
const errs=[]; page.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)); });
page.on('pageerror', e=>errs.push('PAGEERR '+String(e).slice(0,200)));
await page.addInitScript(`localStorage.setItem('metamatrix:auth:token', ${JSON.stringify(tok)});`);
await page.goto(`http://localhost:5173/projects/${P}/knowledge`,{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
const splash = page.locator('.splash');
if (await splash.count()) { const b=splash.locator('button'); if (await b.count()) await b.first().click(); await page.waitForTimeout(1000); }
await page.locator('.kn-tree__node-label', { hasText: '客户管理' }).first().click();
await page.waitForTimeout(3000);
const h=page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
await h.hover(); await page.waitForTimeout(250);
await h.locator('.be-colmenu__trigger').first().click(); await page.waitForTimeout(600);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '升序排列' }).first().click();
await page.waitForTimeout(2200);
const sortMark = await page.evaluate(()=>{
  const m=document.querySelector('.be-grid .base-grid__head-sort');
  return m? { color:getComputedStyle(m).color, fs:getComputedStyle(m).fontSize } : null;
});
console.log('sortMark', JSON.stringify(sortMark));
await page.screenshot({ path:'/tmp/basev/l1_sortmark.png' });
// 清理：清除本列排序
await page.waitForTimeout(800);
const h2=page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
await h2.scrollIntoViewIfNeeded();
await h2.hover({ force: true }); await page.waitForTimeout(500);
const t2=h2.locator('.be-colmenu__trigger').first();
console.log('trigger2 visible', await t2.isVisible());
await t2.click({ force: true }); await page.waitForTimeout(1000);
console.log('visible poppers', await page.locator('.be-colmenu__popper:visible').count());
console.log('items now', await page.locator('.be-colmenu__popper:visible .be-colmenu__item').allInnerTexts());
const clr = page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '清除本列排序' });
console.log('clear item', await clr.count());
if (await clr.count()) { await clr.first().click(); await page.waitForTimeout(2000); }
const after = await page.evaluate(()=>!!document.querySelector('.be-grid .base-grid__head-sort'));
console.log('sortMark after clear', after);
console.log('errors', errs.length, errs.slice(0,4).join(' | '));
await browser.close();
