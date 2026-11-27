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
// 搜索无结果 → 空态
const input = page.locator('.be-toolbar__search input').first();
await input.fill('不存在的关键字zzz');
await page.waitForTimeout(2500);
const empty = await page.evaluate(()=>{
  const e=document.querySelector('.base-grid__empty');
  if(!e) return null;
  const cs=getComputedStyle(e);
  return { text:e.innerText.replace(/\n/g,' | '), color:cs.color, icon:!!e.querySelector('.base-grid__empty-icon') };
});
console.log('empty', JSON.stringify(empty));
await page.screenshot({ path:'/tmp/basev/k1_empty.png' });
await input.fill('');
await page.waitForTimeout(2000);
console.log('errors', errs.length, errs.slice(0,5).join(' | '));
await browser.close();
