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
await page.waitForTimeout(3500);
await page.screenshot({ path:'/tmp/basev/j1_table.png' });
const rec = await page.evaluate(()=>[...document.querySelectorAll('.be-record-list__item')].map(i=>i.innerText.replace(/\n/g,' | ')));
console.log('record list', JSON.stringify(rec));

// 列头菜单
const h=page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
await h.hover(); await page.waitForTimeout(300);
await h.locator('.be-colmenu__trigger').first().click();
await page.waitForTimeout(700);
const m = await page.evaluate(()=>{
  const p=[...document.querySelectorAll('.be-colmenu__popper')].find(x=>x.getBoundingClientRect().height>0);
  if(!p) return null;
  const cs=getComputedStyle(p);
  return { w:Math.round(p.getBoundingClientRect().width), br:cs.borderRadius, shadow:cs.boxShadow, bg:cs.backgroundColor };
});
console.log('menu', JSON.stringify(m));
await page.screenshot({ path:'/tmp/basev/j2_colmenu.png' });

// 筛选此列 → 面板应预置该字段
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '筛选此列' }).first().click();
await page.waitForTimeout(1800);
const qp = await page.evaluate(()=>{
  const d=document.querySelector('.el-dialog'); if(!d) return null;
  const sels=[...d.querySelectorAll('.el-select__placeholder')].map(x=>x.innerText.trim());
  return { title:(d.querySelector('.el-dialog__title')||{}).textContent, sels, br:getComputedStyle(d).borderRadius };
});
console.log('queryPanel', JSON.stringify(qp));
await page.screenshot({ path:'/tmp/basev/j3_filter.png' });
const c=page.locator('.el-dialog button', { hasText: /取消|关闭/ }).first();
if (await c.count()) await c.click();
await page.waitForTimeout(600);

// 编辑字段（跳字段管理并高亮）
const h2=page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(2);
await h2.hover(); await page.waitForTimeout(250);
await h2.locator('.be-colmenu__trigger').first().click(); await page.waitForTimeout(600);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '编辑字段' }).first().click();
await page.waitForTimeout(1600);
const fm = await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('.be-field-row')];
  const foc=rows.find(r=>r.classList.contains('is-focus'));
  return { dialogs:[...document.querySelectorAll('.el-dialog__title')].map(x=>x.textContent), focusText: foc?foc.innerText.replace(/\n/g,' ').slice(0,40):null, focusRows: rows.filter(r=>r.classList.contains('is-focus')).length };
});
console.log('fieldManager', JSON.stringify(fm));
await page.screenshot({ path:'/tmp/basev/j4_fieldmanager.png' });
console.log('errors', errs.length, errs.slice(0,5).join(' | '));
await browser.close();
