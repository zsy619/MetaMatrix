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

const names = async () => page.evaluate(()=>{
  const rows=[...document.querySelectorAll('.be-grid .vxe-body--row')].filter(r=>r.getBoundingClientRect().height>0);
  return rows.map(r=>{
    const cells=[...r.querySelectorAll('.vxe-cell')];
    return (cells[2]?.innerText||'').trim();
  });
});
console.log('before', JSON.stringify(await names()));

async function closeMenu(){
  await page.keyboard.press('Escape').catch(()=>{});
  await page.mouse.click(1200, 700);
  await page.waitForTimeout(500);
}
async function openMenu(idx){
  await closeMenu();
  const h=page.locator('.be-grid .vxe-header--row .vxe-header--column:visible').nth(idx);
  await h.hover(); await page.waitForTimeout(250);
  await h.locator('.be-colmenu__trigger').first().click();
  await page.waitForTimeout(600);
}
await openMenu(2);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '升序排列' }).first().click();
await page.waitForTimeout(2200);
console.log('after asc', JSON.stringify(await names()));
await page.screenshot({ path:'/tmp/basev/i2_sorted.png' });

await openMenu(2);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '降序排列' }).first().click();
await page.waitForTimeout(2200);
console.log('after desc', JSON.stringify(await names()));

await openMenu(2);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '筛选此列' }).first().click();
await page.waitForTimeout(1500);
const qp = await page.evaluate(()=>{
  const d=document.querySelector('.be-modal .el-dialog');
  if(!d) return null;
  const sel=d.querySelector('.el-select__placeholder, .el-select__selected-item');
  return { title:(d.querySelector('.el-dialog__title')||{}).textContent, sel: sel?sel.innerText.trim():null };
});
console.log('queryPanel', JSON.stringify(qp));
await page.screenshot({ path:'/tmp/basev/i3_filter.png' });
const closeBtn = page.locator('.be-modal button', { hasText: /取消|关闭/ }).first();
if (await closeBtn.count()) await closeBtn.click();
await page.waitForTimeout(600);

// 隐藏此列（用附件列，索引 3）
const colsBefore = await page.evaluate(()=>[...document.querySelectorAll('.be-grid .vxe-header--row .vxe-header--column')].filter(h=>h.getBoundingClientRect().height>0).length);
await openMenu(3);
await page.locator('.be-colmenu__popper:visible .be-colmenu__item', { hasText: '隐藏此列' }).first().click();
await page.waitForTimeout(2200);
const colsAfter = await page.evaluate(()=>[...document.querySelectorAll('.be-grid .vxe-header--row .vxe-header--column')].filter(h=>h.getBoundingClientRect().height>0).length);
console.log('cols', colsBefore, '->', colsAfter);
await page.screenshot({ path:'/tmp/basev/i4_hidden.png' });

// 恢复：显示该列（字段面板恢复或列菜单无法恢复，改为在字段面板勾选）— 直接调用接口恢复
const restore = await page.evaluate(async (tok)=>{
  const res = await fetch('/api/projects/'+ '3f030ea3-61a5-4156-9b77-a9ca1d29d107' + '/base/tables', { headers: { Authorization: 'Bearer ' + tok } });
  return res.status;
}, tok);
console.log('restore probe status', restore);
console.log('errors', errs.length, errs.slice(0,5).join(' | '));
await browser.close();
