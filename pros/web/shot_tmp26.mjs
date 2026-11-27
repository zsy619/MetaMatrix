import fs from 'fs';
import { chromium } from 'playwright-core';
const P='3f030ea3-61a5-4156-9b77-a9ca1d29d107';
const tok=fs.readFileSync('/tmp/tok.txt','utf8').trim();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport:{width:1600,height:950} });
const page = await ctx.newPage();
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
await page.waitForTimeout(2500);
const info = await page.evaluate(()=>{
  const heads=[...document.querySelectorAll('.be-grid .vxe-header--row .vxe-header--column')];
  const marked=heads.filter(hh=>hh.querySelector('.base-grid__head-sort')).map(hh=>({title:(hh.querySelector('.base-grid__head-title')||{}).innerText, vis:hh.getBoundingClientRect().height>0}));
  return { total: heads.length, marked, allTitles: heads.map(hh=>(hh.querySelector('.base-grid__head-title')||{}).innerText).slice(0,25) };
});
console.log(JSON.stringify(info));
await browser.close();
