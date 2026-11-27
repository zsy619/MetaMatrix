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
// 找到带排序标记的列头
const marked = page.locator('.be-grid .vxe-header--column:visible', { has: page.locator('.base-grid__head-sort') }).first();
console.log('marked header count', await marked.count());
await marked.hover(); await page.waitForTimeout(400);
await marked.locator('.be-colmenu__trigger').first().click(); await page.waitForTimeout(800);
console.log('items', await page.locator('.be-colmenu__popper:visible .be-colmenu__item').allInnerTexts());
const clr = page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '清除本列排序' });
console.log('clear count', await clr.count());
if (await clr.count()) { await clr.first().click(); await page.waitForTimeout(2500); }
console.log('marks left', await page.locator('.be-grid .base-grid__head-sort').count());
await page.screenshot({ path:'/tmp/basev/l2_cleared.png' });
console.log('errors', errs.length, errs.slice(0,4).join(' | '));
await browser.close();
